const mongoose = require("mongoose");
const Sale = require("../models/SaleModel");
const Purchase = require("../models/purchaseModel");
const Service = require("../models/serviceModel");
const Transaction = require("../models/transactionModel");
const Party = require("../models/partModel");
const models = { Sale, Purchase, Service };
const resolveModel = (type) => models[String(type || "").replace(/^./, c => c.toUpperCase())];
const normalizeDate = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; };
const getPaid = (tx) => (tx?.payments || []).reduce((s,p)=>s+Number(p.amount||0),0);
const getStatus = (total, paid) => paid <= 0 ? "pending" : paid >= total ? "paid" : "partial";

const createEntry = async (req,res) => {
  try {
    const { type, partyId, entryData = {} } = req.body;
    const Model = models[type];
    if (!Model || !mongoose.isValidObjectId(partyId)) return res.status(400).json({success:false,message:"Invalid entry type or party"});
    const date = normalizeDate(entryData.date), amount = Number(entryData.amount);
    if (!date || !Number.isFinite(amount) || amount < 0) return res.status(400).json({success:false,message:"Valid date and amount are required"});
    const base = {partyId,date,amount,remarks:String(entryData.remarks || "").trim()};
    if (type === "Service") base.serviceDetail = String(entryData.serviceDetail || "").trim();
    else Object.assign(base,{productName:String(entryData.productName||"").trim(),invoiceNo:String(entryData.invoiceNo||"").trim(),serialNo:String(entryData.serialNo||"").trim()});
    if (type === "Service" && !base.serviceDetail) return res.status(400).json({success:false,message:"Service detail is required"});
    if (type !== "Service" && (!base.productName || !base.invoiceNo || !base.serialNo)) return res.status(400).json({success:false,message:"Product, invoice and serial number are required"});
    if (type !== "Service") {
      const duplicate = await Model.findOne({partyId,$or:[{invoiceNo:base.invoiceNo},{serialNo:base.serialNo}]});
      if (duplicate) return res.status(409).json({success:false,message:"Invoice or serial number already exists"});
    }
    const entry = await Model.create(base);
    const initialPaid = Math.min(Math.max(Number(entryData.initialPayment || 0),0), amount);
    const payments = initialPaid > 0 ? [{amount:initialPaid,paymentDate:normalizeDate(entryData.initialPaymentDate)||date,remarks:String(entryData.initialPaymentRemarks||"").trim()}] : [];
    const tx = await Transaction.create({partyId,refId:entry._id,type,amount,payments,paymentStatus:getStatus(amount,initialPaid)});
    return res.status(201).json({success:true,message:`${type} added successfully`,entry,transaction:tx});
  } catch(error){ console.error("CREATE ENTRY",error); return res.status(500).json({success:false,message:error.message}); }
};

const getEntries = async (req,res) => {
  try {
    const Model = resolveModel(req.params.type); const {partyId,page=1,searchValue,month,year}=req.query;
    if(!Model || !mongoose.isValidObjectId(partyId)) return res.status(400).json({success:false,message:"Valid party id is required"});
    const filter={partyId}; const search=String(searchValue||"").trim();
    if(search){ const fields=Model.modelName === "Service" ? ["serviceDetail","remarks"] : ["invoiceNo","serialNo","productName","remarks"]; filter.$or=fields.map(f=>({[f]:{$regex:search,$options:"i"}})); }
    if(month && year){ const m=Number(month), y=Number(year); if(m>=1&&m<=12)filter.date={$gte:new Date(y,m-1,1),$lt:new Date(y,m,1)}; }
    const limit=10,currentPage=Math.max(Number(page)||1,1),skip=(currentPage-1)*limit;
    const [entries,totalData]=await Promise.all([Model.find(filter).sort({date:-1,createdAt:-1}).skip(skip).limit(limit).lean(),Model.countDocuments(filter)]);
    const ids=entries.map(e=>e._id); const txs=await Transaction.find({refId:{$in:ids},type:Model.modelName}).lean(); const map=new Map(txs.map(t=>[String(t.refId),t]));
    const data=entries.map(e=>{const tx=map.get(String(e._id)); const paid=tx?getPaid(tx):(0); const legacyPaid=tx?.paymentStatus==="paid" && !tx?.payments?.length ? Number(e.amount) : paid; const status=getStatus(Number(e.amount),legacyPaid); return {...e,paymentStatus:status,totalPaid:legacyPaid,remainingAmount:Math.max(Number(e.amount)-legacyPaid,0),payments:tx?.payments||[],transactionId:tx?._id||null};});
    const totalPages=Math.ceil(totalData/limit); return res.json({success:true,data,pagination:{currentPage,limit,totalData,totalPages,hasNextPage:currentPage<totalPages,hasPreviousPage:currentPage>1}});
  }catch(error){console.error("GET ENTRIES",error);return res.status(500).json({success:false,message:"Unable to fetch entries"});}
};

const updateEntry = async (req,res) => {
  try{
    const Model=resolveModel(req.params.type), id=req.params.id; if(!Model||!mongoose.isValidObjectId(id)||!mongoose.isValidObjectId(req.body.partyId))return res.status(400).json({success:false,message:"Invalid request"});
    const d=req.body.entryData||{},date=normalizeDate(d.date),amount=Number(d.amount); if(!date||!Number.isFinite(amount)||amount<0)return res.status(400).json({success:false,message:"Invalid date or amount"});
    const update={date,amount,remarks:String(d.remarks||"").trim()}; if(Model.modelName==="Service")update.serviceDetail=String(d.serviceDetail||"").trim(); else Object.assign(update,{productName:String(d.productName||"").trim(),invoiceNo:String(d.invoiceNo||"").trim(),serialNo:String(d.serialNo||"").trim()});
    const duplicate=Model.modelName!=="Service"?await Model.findOne({partyId:req.body.partyId,_id:{$ne:id},$or:[{invoiceNo:update.invoiceNo},{serialNo:update.serialNo}]}):null; if(duplicate)return res.status(409).json({success:false,message:"Invoice or serial number already exists"});
    const entry=await Model.findOneAndUpdate({_id:id,partyId:req.body.partyId},update,{new:true,runValidators:true}); if(!entry)return res.status(404).json({success:false,message:"Entry not found"});
    const tx=await Transaction.findOne({refId:id,type:Model.modelName}); if(tx){const paid=getPaid(tx); if(paid>amount)return res.status(400).json({success:false,message:"Total paid cannot be greater than the updated amount"}); tx.amount=amount; tx.paymentStatus=getStatus(amount,paid); await tx.save();}
    return res.json({success:true,message:"Entry updated",entry});
  }catch(error){console.error("UPDATE ENTRY",error);return res.status(500).json({success:false,message:"Unable to update entry"});}
};
const deleteEntry=async(req,res)=>{try{const Model=resolveModel(req.params.type),id=req.params.id;if(!Model||!mongoose.isValidObjectId(id))return res.status(400).json({success:false,message:"Invalid request"});const entry=await Model.findByIdAndDelete(id);if(!entry)return res.status(404).json({success:false,message:"Entry not found"});await Transaction.deleteMany({refId:id,type:Model.modelName});return res.json({success:true,message:"Entry deleted"});}catch(error){return res.status(500).json({success:false,message:"Unable to delete entry"});}};

const addTransactionPayment=async(req,res)=>{try{const tx=await Transaction.findById(req.params.id);if(!tx)return res.status(404).json({success:false,message:"Transaction not found"});const amount=Number(req.body.amount),paymentDate=normalizeDate(req.body.paymentDate)||new Date();if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({success:false,message:"Valid payment amount is required"});const paid=getPaid(tx),remaining=Math.max(tx.amount-paid,0);if(amount>remaining)return res.status(400).json({success:false,message:`Payment cannot be greater than remaining amount ₹${remaining.toFixed(2)}`});tx.payments.push({amount,paymentDate,remarks:String(req.body.remarks||"").trim()});const nextPaid=paid+amount;tx.paymentStatus=getStatus(tx.amount,nextPaid);await tx.save();return res.status(201).json({success:true,message:"Payment added",data:{...tx.toObject(),totalPaid:nextPaid,remainingAmount:tx.amount-nextPaid}});}catch(e){console.error("ADD PAYMENT",e);return res.status(500).json({success:false,message:"Unable to add payment"});}};
const deleteTransactionPayment=async(req,res)=>{try{const tx=await Transaction.findById(req.params.id);if(!tx)return res.status(404).json({success:false,message:"Transaction not found"});tx.payments=tx.payments.filter(p=>String(p._id)!==String(req.params.paymentId));const paid=getPaid(tx);tx.paymentStatus=getStatus(tx.amount,paid);await tx.save();return res.json({success:true,message:"Payment removed"});}catch(e){return res.status(500).json({success:false,message:"Unable to remove payment"});}};
const getAllTransaction=async(req,res)=>{try{const {page=1,type,status,dateRange,search=""}=req.query;const limit=10,currentPage=Math.max(Number(page)||1,1),skip=(currentPage-1)*limit;const filter={};if(type)filter.type=String(type);if(status)filter.paymentStatus=String(status);if(search.trim()){const parties=await Party.find({$or:[{name:{$regex:search.trim(),$options:"i"}},{contactNo:{$regex:search.trim(),$options:"i"}}]}).select("_id").lean();filter.partyId={$in:parties.map(p=>p._id)};}if(dateRange){const now=new Date(),start=new Date(now);if(dateRange==="today")start.setHours(0,0,0,0);if(dateRange==="7days")start.setDate(now.getDate()-7);if(dateRange==="30days")start.setDate(now.getDate()-30);if(dateRange==="3months")start.setMonth(now.getMonth()-3);filter.createdAt={$gte:start,$lte:now};}const [total,transactions]=await Promise.all([Transaction.countDocuments(filter),Transaction.find(filter).populate("partyId","name contactNo").sort({createdAt:-1}).skip(skip).limit(limit).lean()]);let totalAmount=0,totalPaidAmount=0,totalDueAmount=0;const data=transactions.map(t=>{const paid=t.payments?.length?t.payments.reduce((s,p)=>s+Number(p.amount||0),0):(t.paymentStatus==="paid"?Number(t.amount):0);const due=Math.max(Number(t.amount)-paid,0);totalAmount+=Number(t.amount);totalPaidAmount+=paid;totalDueAmount+=due;return {id:t._id,transactionId:t._id,paymentDate:t.createdAt,type:t.type,partyId:t.partyId?._id,partyName:t.partyId?.name||"Unknown",amount:t.amount,totalPaid:paid,remainingAmount:due,status:getStatus(t.amount,paid),payments:t.payments||[]};});const totalPages=Math.ceil(total/limit);return res.json({success:true,data,summary:{totalPaidAmount,totalDueAmount,totalAmount},pagination:{page:currentPage,limit,total,totalPages,hasNextPage:currentPage<totalPages,hasPreviousPage:currentPage>1}});}catch(e){console.error("TRANSACTIONS",e);return res.status(500).json({success:false,message:"Unable to fetch payments"});}};
const updateTransaction=async(req,res)=>{return res.status(400).json({success:false,message:"Payment status is calculated from payment records. Add or remove a payment instead."});};
module.exports={createEntry,getEntries,getAllTransaction,updateEntry,deleteEntry,addTransactionPayment,deleteTransactionPayment,updateTransaction};
