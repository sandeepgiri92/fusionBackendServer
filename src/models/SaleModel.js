const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
    date: { type: Date, required: true },
    productName: { type: String, required: true, trim: true },
    invoiceNo: { type: String, required: true, trim: true },
    serialNo: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    remarks: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
