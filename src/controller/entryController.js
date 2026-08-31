const mongoose = require("mongoose");
const Sale = require("../models/SaleModel");
const Purchase = require("../models/purchaseModel");
const Service = require("../models/serviceModel");
const Transaction = require("../models/transactionModel");

const models = { Sale, Purchase, Service };
const resolveModel = (type) => models[String(type || "").replace(/^./, c => c.toUpperCase())];

const normalizeDate = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; };

const createEntry = async (req,res) => {
  try {
    const { type, partyId, entryData = {} } = req.body;
    const Model = models[type];
    if (!Model || !mongoose.isValidObjectId(partyId)) return res.status(400).json({success:false,message:"Invalid entry type or party"});
    const date = normalizeDate(entryData.date);
    const amount = Number(entryData.amount);
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
    await Transaction.create({partyId,refId:entry._id,type,amount,paymentStatus:entryData.paymentStatus === "paid" ? "paid" : "pending"});
    return res.status(201).json({success:true,message:`${type} added successfully`,entry});
  } catch(error){ console.error("CREATE ENTRY",error); return res.status(500).json({success:false,message:error.message}); }
};

const getEntries = async (req,res) => {
  try {
    const Model = resolveModel(req.params.type);
    const {partyId,page=1,searchValue,month,year} = req.query;
    if(!Model || !mongoose.isValidObjectId(partyId)) return res.status(400).json({success:false,message:"Valid party id is required"});
    const filter={partyId}; const search=String(searchValue||"").trim();
    if(search){ const fields=Model.modelName === "Service" ? ["serviceDetail","remarks"] : ["invoiceNo","serialNo","productName","remarks"]; filter.$or=fields.map(f=>({[f]:{$regex:search,$options:"i"}})); }
    if(month && year){ const m=Number(month), y=Number(year); if(m>=1&&m<=12){filter.date={$gte:new Date(y,m-1,1),$lt:new Date(y,m,1)}} }
    const limit=10,currentPage=Math.max(Number(page)||1,1),skip=(currentPage-1)*limit;
    const [entries,totalData]=await Promise.all([Model.find(filter).sort({date:-1,createdAt:-1}).skip(skip).limit(limit).lean(),Model.countDocuments(filter)]);
    const ids=entries.map(e=>e._id); const txs=await Transaction.find({refId:{$in:ids},type:Model.modelName}).lean();
    const map=new Map(txs.map(t=>[String(t.refId),t]));
    const data=entries.map(e=>({...e,paymentStatus:map.get(String(e._id))?.paymentStatus||"pending",transactionId:map.get(String(e._id))?._id||null}));
    const totalPages=Math.ceil(totalData/limit);
    return res.json({success:true,data,pagination:{currentPage,limit,totalData,totalPages,hasNextPage:currentPage<totalPages,hasPreviousPage:currentPage>1}});
  }catch(error){console.error("GET ENTRIES",error);return res.status(500).json({success:false,message:"Unable to fetch entries"});}
};

const updateEntry = async (req,res) => {
  try{
    const Model=resolveModel(req.params.type); const id=req.params.id;
    if(!Model||!mongoose.isValidObjectId(id)||!mongoose.isValidObjectId(req.body.partyId)) return res.status(400).json({success:false,message:"Invalid request"});
    const d=req.body.entryData||{}; const date=normalizeDate(d.date), amount=Number(d.amount); if(!date||!Number.isFinite(amount)||amount<0)return res.status(400).json({success:false,message:"Invalid date or amount"});
    const update={date,amount};
    if(Model.modelName==="Service") update.serviceDetail=String(d.serviceDetail||"").trim(); else Object.assign(update,{productName:String(d.productName||"").trim(),invoiceNo:String(d.invoiceNo||"").trim(),serialNo:String(d.serialNo||"").trim()});
    update.remarks=String(d.remarks||"").trim();
    const duplicate=Model.modelName!=="Service" ? await Model.findOne({partyId:req.body.partyId,_id:{$ne:id},$or:[{invoiceNo:update.invoiceNo},{serialNo:update.serialNo}]}) : null;
    if(duplicate)return res.status(409).json({success:false,message:"Invoice or serial number already exists"});
    const entry=await Model.findOneAndUpdate({_id:id,partyId:req.body.partyId},update,{new:true,runValidators:true});
    if(!entry)return res.status(404).json({success:false,message:"Entry not found"});
    const tx=await Transaction.findOneAndUpdate({refId:id,type:Model.modelName},{amount,paymentStatus:d.paymentStatus==="paid"?"paid":"pending"},{new:true,upsert:true,setDefaultsOnInsert:true});
    return res.json({success:true,message:"Entry updated",entry,paymentStatus:tx.paymentStatus});
  }catch(error){console.error("UPDATE ENTRY",error);return res.status(500).json({success:false,message:"Unable to update entry"});}
};

const deleteEntry = async (req,res) => {
  try{ const Model=resolveModel(req.params.type),id=req.params.id; if(!Model||!mongoose.isValidObjectId(id))return res.status(400).json({success:false,message:"Invalid request"}); const entry=await Model.findByIdAndDelete(id); if(!entry)return res.status(404).json({success:false,message:"Entry not found"}); await Transaction.deleteMany({refId:id,type:Model.modelName}); return res.json({success:true,message:"Entry deleted"}); }
  catch(error){return res.status(500).json({success:false,message:"Unable to delete entry"});}
};

const getAllTransaction = async (req,res) => {
  try{
    const {page=1,type,status,dateRange,search=""}=req.query; const limit=10,currentPage=Math.max(Number(page)||1,1),skip=(currentPage-1)*limit; const filter={};
    if(type)filter.type=String(type); if(status)filter.paymentStatus=String(status);
    if(search.trim()){ const parties=await require("../models/partModel").find({$or:[{name:{$regex:search.trim(),$options:"i"}},{contactNo:{$regex:search.trim(),$options:"i"}}]}).select("_id").lean(); filter.partyId={$in:parties.map(p=>p._id)}; }
    if(dateRange){const now=new Date(),start=new Date(now); if(dateRange==="today")start.setHours(0,0,0,0); if(dateRange==="7days")start.setDate(now.getDate()-7); if(dateRange==="30days")start.setDate(now.getDate()-30); if(dateRange==="3months")start.setMonth(now.getMonth()-3); filter.createdAt={$gte:start,$lte:now};}
    const [total,summary,transactions]=await Promise.all([Transaction.countDocuments(filter),Transaction.aggregate([{$match:filter},{$group:{_id:"$paymentStatus",totalAmount:{$sum:"$amount"}}}]),Transaction.find(filter).populate("partyId","name contactNo").sort({createdAt:-1}).skip(skip).limit(limit).lean()]);
    let paid=0,pending=0; summary.forEach(x=>x._id==="paid"?paid=x.totalAmount:pending=x.totalAmount);
    const data=transactions.map(t=>({id:t._id,transactionId:t._id,paymentDate:t.createdAt,type:t.type,partyId:t.partyId?._id,partyName:t.partyId?.name||"Unknown",amount:t.amount,status:t.paymentStatus}));
    const totalPages=Math.ceil(total/limit); return res.json({success:true,data,summary:{totalPaidAmount:paid,totalPendingAmount:pending,totalAmount:paid+pending},pagination:{page:currentPage,limit,total,totalPages,hasNextPage:currentPage<totalPages,hasPreviousPage:currentPage>1}});
  }catch(error){console.error("TRANSACTIONS",error);return res.status(500).json({success:false,message:"Unable to fetch payments"});}
};

const updateTransaction = async(req,res)=>{try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({success:false,message:"Invalid transaction id"});const status=req.body.status; if(!["paid","pending"].includes(status))return res.status(400).json({success:false,message:"Invalid status"});const tx=await Transaction.findByIdAndUpdate(req.params.id,{paymentStatus:status},{new:true});if(!tx)return res.status(404).json({success:false,message:"Transaction not found"});return res.json({success:true,message:"Payment status updated",data:tx});}catch(e){return res.status(500).json({success:false,message:"Unable to update payment"});}};

module.exports={createEntry,getEntries,getAllTransaction,updateEntry,deleteEntry,updateTransaction};
