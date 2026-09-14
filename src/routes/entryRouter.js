const express = require("express");
const router = express.Router();
const {
  createEntry,
  getEntries,
  getAllTransaction,
  updateEntry,
  deleteEntry,
  addTransactionPayment,
  deleteTransactionPayment,
  updateTransaction,
  getBillDocx,
  getBillPdf,
} = require("../controller/entryController");
router.post("/entry", createEntry);
router.get("/entries/:type", getEntries);
router.get("/entry/:type/:id/bill-docx", getBillDocx);
router.get("/entry/:type/:id/bill-pdf", getBillPdf);
router.patch("/entry/:type/:id", updateEntry);
router.delete("/entry/:type/:id", deleteEntry);
router.get("/transaction", getAllTransaction);
router.post("/transaction/:id/payments", addTransactionPayment);
router.delete("/transaction/:id/payments/:paymentId", deleteTransactionPayment);
router.patch("/transaction/:id", updateTransaction);
module.exports = router;
