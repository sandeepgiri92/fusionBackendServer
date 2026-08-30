const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    serviceDetail: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Service", serviceSchema);
