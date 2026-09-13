const mongoose=require("mongoose");
const Expense=require("../models/expenseModel");

const hasPaymentStatus=(expenseType)=>["smc","other"].includes(String(expenseType||"").trim().toLowerCase());

const normalizeStatus=(status)=>String(status||"").trim().toLowerCase();
const getPaid=(e)=>(e?.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
const getStatus=(total,paid)=>paid<=0?"pending":paid>=total?"paid":"partial";

const createExpense=async(req,res)=>{
    try{
        const d=req.body.expenseData||req.body;
        const expenseType=String(d.expenseType||"").trim();
        const date=new Date(d.date),amount=Number(d.amount),remarks=String(d.remarks||"").trim();

        if(!expenseType||Number.isNaN(date.getTime())||!Number.isFinite(amount)||amount<0||!remarks)
            return res.status(400).json({success:false,message:"Expense type, date, amount and remarks are required"});

        const payload={expenseType,date,amount,remarks};

        if(hasPaymentStatus(expenseType)){
            const initialPaid=Math.min(Math.max(Number(d.initialPayment||0),0),amount);
            payload.payments=initialPaid>0?[{amount:initialPaid,paymentDate:new Date(d.initialPaymentDate||date),remarks:String(d.initialPaymentRemarks||"").trim()}]:[];
            payload.status=getStatus(amount,initialPaid);
        }

        const expense=await Expense.create(payload);
        return res.status(201).json({success:true,message:"Expense added successfully",data:expense});
    }catch(e){
        return res.status(500).json({success:false,message:"Unable to add expense"});
    }
};

const getExpense=async(req,res)=>{
    try{
        const type=String(req.params.type),page=Math.max(Number(req.query.page)||1,1),limit=10,skip=(page-1)*limit;
        const filter={expenseType:type};

        const [expenses,totalData]=await Promise.all([
            Expense.find(filter).sort({date:-1,createdAt:-1}).skip(skip).limit(limit).lean(),
            Expense.countDocuments(filter)
        ]);

        // Older SMC/Other records did not have a status. Treat them as pending
        // without changing records belonging to other expense types.
        const result=hasPaymentStatus(type)
            ? expenses.map(expense=>{const paid=getPaid(expense);return {...expense,status:getStatus(Number(expense.amount),paid),totalPaid:paid,remainingAmount:Math.max(Number(expense.amount)-paid,0)}})
            : expenses;

        const totalPages=Math.ceil(totalData/limit);
        return res.json({
            success:true,
            expenses:result,
            pagination:{
                currentPage:page,
                limit,
                totalData,
                totalPages,
                hasNextPage:page<totalPages,
                hasPreviousPage:page>1
            }
        });
    }catch(e){
        return res.status(500).json({success:false,message:"Unable to fetch expenses"});
    }
};

const updateExpense=async(req,res)=>{
    try{
        if(!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({success:false,message:"Invalid expense id"});

        const d=req.body;
        const date=new Date(d.date),amount=Number(d.amount),expenseType=String(d.expenseType||"").trim();

        if(Number.isNaN(date.getTime())||!Number.isFinite(amount)||amount<0||!expenseType||!String(d.remarks||"").trim())
            return res.status(400).json({success:false,message:"Expense type, date, amount and remarks are required"});

        const update={date,amount,remarks:String(d.remarks||"").trim(),expenseType};

        if(hasPaymentStatus(expenseType)){
            const paid=getPaid(await Expense.findById(req.params.id).lean());
            if(paid>amount) return res.status(400).json({success:false,message:"Total paid cannot be greater than the updated amount"});
            update.status=getStatus(amount,paid);
        }

        const expense=await Expense.findByIdAndUpdate(
            req.params.id,
            update,
            {new:true,runValidators:true}
        );

        if(!expense)
            return res.status(404).json({success:false,message:"Expense not found"});

        return res.json({success:true,message:"Expense updated",data:expense});
    }catch(e){
        return res.status(500).json({success:false,message:"Unable to update expense"});
    }
};

const deleteExpense=async(req,res)=>{
    try{
        if(!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({success:false,message:"Invalid expense id"});

        const e=await Expense.findByIdAndDelete(req.params.id);
        if(!e)
            return res.status(404).json({success:false,message:"Expense not found"});

        return res.json({success:true,message:"Expense deleted"});
    }catch(e){
        return res.status(500).json({success:false,message:"Unable to delete expense"});
    }
};

const addExpensePayment=async(req,res)=>{
    try{
        const expense=await Expense.findById(req.params.id); if(!expense)return res.status(404).json({success:false,message:"Expense not found"});
        if(!hasPaymentStatus(expense.expenseType))return res.status(400).json({success:false,message:"Payments are available only for SMC and Other expenses"});
        const amount=Number(req.body.amount), paymentDate=new Date(req.body.paymentDate||new Date()); if(!Number.isFinite(amount)||amount<=0||Number.isNaN(paymentDate.getTime()))return res.status(400).json({success:false,message:"Valid payment amount and date are required"});
        const paid=getPaid(expense),remaining=Math.max(expense.amount-paid,0); if(amount>remaining)return res.status(400).json({success:false,message:`Payment cannot be greater than remaining amount ₹${remaining.toFixed(2)}`});
        expense.payments.push({amount,paymentDate,remarks:String(req.body.remarks||"").trim()}); const next=paid+amount; expense.status=getStatus(expense.amount,next); await expense.save(); return res.status(201).json({success:true,message:"Payment added",data:{...expense.toObject(),totalPaid:next,remainingAmount:expense.amount-next}});
    }catch(e){return res.status(500).json({success:false,message:"Unable to add payment"});}
};
const deleteExpensePayment=async(req,res)=>{try{const expense=await Expense.findById(req.params.id);if(!expense)return res.status(404).json({success:false,message:"Expense not found"});expense.payments=expense.payments.filter(x=>String(x._id)!==String(req.params.paymentId));const paid=getPaid(expense);expense.status=getStatus(expense.amount,paid);await expense.save();return res.json({success:true,message:"Payment removed"});}catch(e){return res.status(500).json({success:false,message:"Unable to remove payment"});}};

module.exports={createExpense,getExpense,updateExpense,deleteExpense,addExpensePayment,deleteExpensePayment};
