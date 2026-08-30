const express = require("express");
const router = express.Router();
const { createParty, getParties, updateParty, deleteParty } = require("../controller/partyController");
router.post("/add-new-party", createParty);
router.get("/get-parties", getParties);
router.patch("/party/:id", updateParty);
router.delete("/party/:id", deleteParty);
module.exports = router;
