const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const Admin = require("../models/user");

// ============================================================
// JWT
// ============================================================

const signMobileToken = (admin) =>
  jwt.sign(
    {
      id: admin._id,
      role: admin.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "30d",
    },
  );

// ============================================================
// MOBILE LOGIN
// ============================================================

const mobileLogin = async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordValid = await argon2.verify(admin.password, password);

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = signMobileToken(admin);

    return res.status(200).json({
      success: true,
      message: "Login successful",

      token,

      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("MOBILE LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// MOBILE GET CURRENT USER
// ============================================================

const mobileGetMe = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select(
      "-password -resetOtp -resetOtpExpires -resetOtpAttempts",
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("MOBILE GET ME ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// MOBILE LOGOUT
// ============================================================

const mobileLogout = async (_req, res) => {
  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

module.exports = {
  mobileLogin,
  mobileGetMe,
  mobileLogout,
};
