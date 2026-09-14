const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
    date: { type: Date, required: true },
    productName: { type: String, required: true, trim: true },
    invoiceNo: { type: String, required: true, trim: true },
    serialNo: { type: String, required: true, trim: true },
    qty: { type: Number, default: 1, min: 0 },
    rate: { type: Number, default: 0, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    remarks: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
