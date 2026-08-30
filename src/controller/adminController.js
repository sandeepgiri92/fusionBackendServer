const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Admin = require("../models/user");

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000,
});

const signToken = (admin) => jwt.sign(
  { id: admin._id, role: admin.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || "30d" },
);

const adminLogin = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required" });

    const admin = await Admin.findOne({ email });
    if (!admin || !(await argon2.verify(admin.password, password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    res.cookie("accessToken", signToken(admin), cookieOptions());
    return res.json({ success: true, message: "Login successful", user: { id: admin._id, username: admin.username, email: admin.email, role: admin.role } });
  } catch (error) {
    console.error("LOGIN ERROR", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getMe = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select("-password -resetOtp -resetOtpExpires");
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    return res.json({ success: true, user: { id: admin._id, username: admin.username, email: admin.email, role: admin.role } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const logout = async (_req, res) => {
  res.clearCookie("accessToken", cookieOptions());
  return res.json({ success: true, message: "Logged out" });
};

const sendOtpEmail = async ({ email, otp }) => {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    if (process.env.NODE_ENV !== "production") console.log(`[DEV OTP] ${email}: ${otp}`);
    return { dev: process.env.NODE_ENV !== "production" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [email],
      subject: "Fusion password reset code",
      html: `<div style="font-family:Arial,sans-serif;padding:24px"><h2>Fusion Password Reset</h2><p>Your verification code is:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</div><p>This code expires in 10 minutes.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error("Unable to send reset email");
  return { dev: false };
};

const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });
    const admin = await Admin.findOne({ email });
    if (!admin) return res.json({ success: true, message: "If the account exists, an OTP has been sent." });

    const otp = String(crypto.randomInt(100000, 1000000));
    admin.resetOtp = await argon2.hash(otp);
    admin.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await admin.save();
    const mail = await sendOtpEmail({ email, otp });
    return res.json({ success: true, message: "OTP sent to your email", devOtp: mail.dev ? otp : undefined });
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR", error);
    return res.status(500).json({ success: false, message: "Unable to send OTP" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || "");
    if (!email || !otp || newPassword.length < 8) return res.status(400).json({ success: false, message: "Email, OTP and a password of at least 8 characters are required" });

    const admin = await Admin.findOne({ email });
    if (!admin || !admin.resetOtp || !admin.resetOtpExpires || admin.resetOtpExpires < new Date()) return res.status(400).json({ success: false, message: "OTP is invalid or expired" });
    if (!(await argon2.verify(admin.resetOtp, otp))) return res.status(400).json({ success: false, message: "Invalid OTP" });

    admin.password = await argon2.hash(newPassword);
    admin.resetOtp = undefined;
    admin.resetOtpExpires = undefined;
    await admin.save();
    res.clearCookie("accessToken", cookieOptions());
    return res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("RESET PASSWORD ERROR", error);
    return res.status(500).json({ success: false, message: "Unable to reset password" });
  }
};

module.exports = { adminLogin, getMe, logout, forgotPassword, resetPassword };
