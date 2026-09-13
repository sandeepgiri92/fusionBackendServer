const mongoose=require("mongoose");

const paymentSchema = new mongoose.Schema({
  amount: { type:Number, required:true, min:0 },
  paymentDate: { type:Date, required:true },
  remarks: { type:String, trim:true, default:"" },
}, { _id:true, timestamps:true });

const expenseSchema=new mongoose.Schema({
  expenseType:{type:String,required:true,trim:true},
  date:{type:Date,required:true},
  amount:{type:Number,required:true,min:0},
  remarks:{type:String,trim:true,default:""},
  status:{type:String,enum:["paid","pending","partial"],default:"pending"},
  payments:{type:[paymentSchema],default:[]},
},{timestamps:true});
module.exports=mongoose.model("Expense",expenseSchema);
