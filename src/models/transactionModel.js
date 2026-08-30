const mongoose = require("mongoose");

const transaction = new mongoose.Schema(
  {
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
    },

    refId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "type",
    },

    type: {
      type: String,
      enum: ["Sale", "Purchase", "Service"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["paid", "pending"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Transaction", transaction);
