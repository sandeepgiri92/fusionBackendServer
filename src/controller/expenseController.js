const mongoose=require("mongoose");
const Expense=require("../models/expenseModel");

const hasPaymentStatus=(expenseType)=>["smc","other"].includes(String(expenseType||"").trim().toLowerCase());

const normalizeStatus=(status)=>String(status||"").trim().toLowerCase();

const createExpense=async(req,res)=>{
    try{
        const d=req.body.expenseData||req.body;
        const expenseType=String(d.expenseType||"").trim();
        const date=new Date(d.date),amount=Number(d.amount),remarks=String(d.remarks||"").trim();

        if(!expenseType||Number.isNaN(date.getTime())||!Number.isFinite(amount)||amount<0||!remarks)
            return res.status(400).json({success:false,message:"Expense type, date, amount and remarks are required"});

        const payload={expenseType,date,amount,remarks};

        if(hasPaymentStatus(expenseType)){
            const status=normalizeStatus(d.status||"pending");
            if(!["paid","pending"].includes(status))
                return res.status(400).json({success:false,message:"Status must be paid or pending"});
            payload.status=status;
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
            ? expenses.map(expense=>({...expense,status:expense.status||"pending"}))
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
            const status=normalizeStatus(d.status||"pending");
            if(!["paid","pending"].includes(status))
                return res.status(400).json({success:false,message:"Status must be paid or pending"});
            update.status=status;
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

module.exports={createExpense,getExpense,updateExpense,deleteExpense};
