const express = require("express");

const router = express.Router();

const {
  mobileLogin,
  mobileGetMe,
  mobileLogout,
} = require("../controller/mobileAuthController");

const mobileAuthMiddleware = require("../midleware/mobileAuthMiddleware");

// Public
router.post("/login", mobileLogin);

// Protected
router.get("/me", mobileAuthMiddleware, mobileGetMe);

router.post("/logout", mobileAuthMiddleware, mobileLogout);

module.exports = router;
