const mongoose = require("mongoose");
const Party = require("../models/partModel");
const Sale = require("../models/SaleModel");
const Purchase = require("../models/purchaseModel");
const Service = require("../models/serviceModel");
const Transaction = require("../models/transactionModel");

const allowedModules = ["sale", "purchase", "service"];
const createParty = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const contactNo = String(req.body.contactNo || "").trim();
    const module = String(req.body.module || "").trim().toLowerCase();
    if (!name || !contactNo || !allowedModules.includes(module)) return res.status(400).json({ success:false, message:"Name, mobile and valid module are required" });
    let party = await Party.findOne({ contactNo });
    if (!party) {
      party = await Party.create({ name, contactNo, modules: { sale: module === "sale", purchase: module === "purchase", service: module === "service" } });
      return res.status(201).json({ success:true, message:"Party created successfully", data:party });
    }
    if (party.modules[module]) return res.status(409).json({ success:false, message:`Party already exists in ${module} module`, data:party });
    party.modules[module] = true;
    await party.save();
    return res.json({ success:true, message:`${module} module enabled`, data:party });
  } catch (error) { console.error(error); return res.status(500).json({success:false,message:"Server error"}); }
};

const getParties = async (req, res) => {
  try {
    const module = String(req.query.module || "").toLowerCase();
    const search = String(req.query.search || "").trim();
    if (!allowedModules.includes(module)) return res.status(400).json({success:false,message:"Invalid module"});
    const filter = { [`modules.${module}`]: true, isActive:true };
    if (search) filter.$or = [{name:{$regex:search,$options:"i"}},{contactNo:{$regex:search,$options:"i"}}];
    const data = await Party.find(filter).sort({name:1}).lean();
    return res.json({success:true,module,count:data.length,data});
  } catch (error) { return res.status(500).json({success:false,message:"Server error"}); }
};

const updateParty = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({success:false,message:"Invalid party id"});
    const updates = {};
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body.contactNo !== undefined) updates.contactNo = String(req.body.contactNo).trim();
    const party = await Party.findByIdAndUpdate(id, updates, {new:true,runValidators:true});
    if (!party) return res.status(404).json({success:false,message:"Party not found"});
    return res.json({success:true,message:"Party updated",data:party});
  } catch (error) { return res.status(500).json({success:false,message:"Unable to update party"}); }
};

const deleteParty = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({success:false,message:"Invalid party id"});
    const [sale,purchase,service] = await Promise.all([Sale.countDocuments({partyId:id}),Purchase.countDocuments({partyId:id}),Service.countDocuments({partyId:id})]);
    if (sale || purchase || service) return res.status(409).json({success:false,message:"This party has transaction history. Deactivate it instead of deleting."});
    const party = await Party.findByIdAndUpdate(id,{isActive:false},{new:true});
    if (!party) return res.status(404).json({success:false,message:"Party not found"});
    await Transaction.deleteMany({partyId:id});
    return res.json({success:true,message:"Party removed"});
  } catch (error) { return res.status(500).json({success:false,message:"Unable to remove party"}); }
};
module.exports = { createParty, getParties, updateParty, deleteParty };
