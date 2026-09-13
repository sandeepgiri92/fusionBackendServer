const mongoose=require("mongoose");
const stockSchema=new mongoose.Schema({itemName:{type:String,required:true,trim:true},quantity:{type:Number,required:true,min:0},date:{type:Date,required:true},remarks:{type:String,trim:true,default:""}},{timestamps:true});
module.exports=mongoose.model("Stock",stockSchema);
