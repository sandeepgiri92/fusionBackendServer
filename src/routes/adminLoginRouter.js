const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const {
  adminLogin,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
} = require("../controller/adminController");
const authMiddleware = require("../midleware/authMiddleware");

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset attempts. Please try again later.",
  },
});

router.post("/login", adminLogin);
router.get("/me", authMiddleware, getMe);
router.post("/logout", authMiddleware, logout);

// Public password reset routes, protected by a dedicated rate limit.
router.post("/forgot-password", passwordResetLimiter, forgotPassword);
router.post("/reset-password", passwordResetLimiter, resetPassword);

module.exports = router;
