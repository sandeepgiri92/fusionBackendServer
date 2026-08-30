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
        }
    },
    {
        timestamps:true,
    }
)


module.exports = mongoose.model("Exprense",expenseSchema)