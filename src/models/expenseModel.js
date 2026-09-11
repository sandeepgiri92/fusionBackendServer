const mongoose = require("mongoose")

const expenseSchema = new mongoose.Schema(
    {
        expenseType:{
            type:String,
            trim:true,
            required: true,
        },
        date:{
            type:Date,
            required: true,
        },
        amount:{
            type:Number,
            min: 0,
            required: true,
        },
        remarks:{
            type:String,
            trim:true,
            required: true,
        },
        // Payment status is used only for SMC and Other expenses.
        status:{
            type:String,
            enum:["paid","pending"],
        }
    },
    {
        timestamps:true,
    }
)


module.exports = mongoose.model("Exprense",expenseSchema)
