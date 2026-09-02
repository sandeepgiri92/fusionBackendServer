const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Resend } = require("resend");

const Admin = require("../models/user");

// ============================================================
// RESEND
// ============================================================

const resend = new Resend(process.env.RESEND_API_KEY);

// ============================================================
// COOKIE OPTIONS
// ============================================================

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000,
});

// ============================================================
// JWT TOKEN
// ============================================================

const signToken = (admin) =>
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
// ADMIN LOGIN
// ============================================================

const adminLogin = async (req, res) => {
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

    const token = signToken(admin);

    res.cookie("accessToken", token, cookieOptions());

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// GET CURRENT ADMIN
// ============================================================

const getMe = async (req, res) => {
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
    console.error("GET ME ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// LOGOUT
// ============================================================

const logout = async (_req, res) => {
  res.clearCookie("accessToken", cookieOptions());

  return res.status(200).json({
    success: true,
    message: "Logged out",
  });
};

// ============================================================
// SEND OTP EMAIL USING RESEND
// ============================================================

const sendOtpEmail = async ({ email, otp }) => {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();

  const from = String(
    process.env.MAIL_FROM ||
      "Fusion Enterprise <no-reply@fusionenterprises.linkpc.net>",
  ).trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!from) {
    throw new Error("MAIL_FROM is not configured");
  }

  // ----------------------------------------------------------
  // Send email using Resend API
  // ----------------------------------------------------------

  const { data, error } = await resend.emails.send({
    from,
    to: [email],
    subject: "Fusion Enterprise - Password Reset OTP",

    text: `
Your Fusion Enterprise password reset OTP is: ${otp}

This OTP is valid for 10 minutes.

If you did not request a password reset,
please ignore this email.
    `.trim(),

    html: `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0"
    />
    <title>Password Reset OTP</title>
  </head>

  <body
    style="
      margin: 0;
      padding: 0;
      background: #f8fafc;
      font-family: Arial, Helvetica, sans-serif;
    "
  >

    <div
      style="
        max-width: 520px;
        margin: 40px auto;
        padding: 24px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
      "
    >

      <h2
        style="
          margin: 0 0 12px;
          color: #111827;
          font-size: 24px;
        "
      >
        Fusion Enterprise
      </h2>

      <p
        style="
          margin: 0 0 18px;
          color: #334155;
          font-size: 15px;
          line-height: 1.6;
        "
      >
        A password reset was requested for your admin account.
      </p>

      <p
        style="
          margin: 0;
          color: #64748b;
          font-size: 14px;
        "
      >
        Your verification code is:
      </p>

      <div
        style="
          margin: 20px 0;
          padding: 18px;
          background: #f1f5f9;
          border-radius: 10px;
          text-align: center;
        "
      >

        <span
          style="
            font-size: 34px;
            font-weight: 700;
            letter-spacing: 8px;
            color: #111827;
          "
        >
          ${otp}
        </span>

      </div>

      <p
        style="
          margin: 0 0 12px;
          color: #334155;
          font-size: 14px;
        "
      >
        This OTP expires in
        <strong>10 minutes</strong>.
      </p>

      <p
        style="
          margin: 20px 0 0;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.5;
        "
      >
        If you did not request this password reset,
        you can safely ignore this email.
      </p>

    </div>

  </body>
</html>
    `,
  });

  // ----------------------------------------------------------
  // Resend returned an error
  // ----------------------------------------------------------

  if (error) {
    console.error("RESEND API ERROR:", error);

    throw new Error(error.message || "Failed to send email using Resend");
  }

  // ----------------------------------------------------------
  // Success
  // ----------------------------------------------------------

  // console.log("RESEND EMAIL SENT:", data);

  return data;
};

// ============================================================
// FORGOT PASSWORD
// ============================================================

const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    // --------------------------------------------------------
    // Email validation
    // --------------------------------------------------------

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    // --------------------------------------------------------
    // Find admin
    // --------------------------------------------------------

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email address",
      });
    }

    // --------------------------------------------------------
    // Generate 6 digit OTP
    // --------------------------------------------------------

    const otp = String(crypto.randomInt(100000, 1000000));

    // --------------------------------------------------------
    // Hash OTP
    // --------------------------------------------------------

    admin.resetOtp = await argon2.hash(otp);

    // OTP valid for 10 minutes
    admin.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Reset failed attempts
    admin.resetOtpAttempts = 0;

    // --------------------------------------------------------
    // Save OTP information
    // --------------------------------------------------------

    await admin.save();

    // --------------------------------------------------------
    // Send OTP email
    // --------------------------------------------------------

    try {
      await sendOtpEmail({
        email: admin.email,
        otp,
      });
    } catch (emailError) {
      console.error("OTP EMAIL ERROR:", emailError);

      // Email fail hua to OTP active nahi rehna chahiye

      admin.resetOtp = undefined;
      admin.resetOtpExpires = undefined;
      admin.resetOtpAttempts = 0;

      await admin.save();

      return res.status(500).json({
        success: false,
        message: "Unable to send OTP. Please check Resend configuration.",
      });
    }

    // --------------------------------------------------------
    // Success
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "OTP sent to your registered email",
    });
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process password reset request",
    });
  }
};

// ============================================================
// RESET PASSWORD
// ============================================================

const resetPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const otp = String(req.body.otp || "").trim();

    const newPassword = String(req.body.newPassword || "");

    // --------------------------------------------------------
    // Basic validation
    // --------------------------------------------------------

    if (!email || !/^\d{6}$/.test(otp) || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Email, 6-digit OTP and a password of at least 8 characters are required",
      });
    }

    // --------------------------------------------------------
    // Find admin
    // --------------------------------------------------------

    const admin = await Admin.findOne({ email });

    // --------------------------------------------------------
    // Check OTP existence
    // --------------------------------------------------------

    if (!admin || !admin.resetOtp || !admin.resetOtpExpires) {
      return res.status(400).json({
        success: false,
        message: "OTP is invalid or expired",
      });
    }

    // --------------------------------------------------------
    // Check OTP expiry
    // --------------------------------------------------------

    if (admin.resetOtpExpires < new Date()) {
      admin.resetOtp = undefined;
      admin.resetOtpExpires = undefined;
      admin.resetOtpAttempts = 0;

      await admin.save();

      return res.status(400).json({
        success: false,
        message: "OTP is invalid or expired",
      });
    }

    // --------------------------------------------------------
    // Max OTP attempts
    // --------------------------------------------------------

    if ((admin.resetOtpAttempts || 0) >= 5) {
      admin.resetOtp = undefined;
      admin.resetOtpExpires = undefined;
      admin.resetOtpAttempts = 0;

      await admin.save();

      return res.status(429).json({
        success: false,
        message: "Too many invalid OTP attempts. Please request a new OTP.",
      });
    }

    // --------------------------------------------------------
    // Verify OTP
    // --------------------------------------------------------

    const isOtpValid = await argon2.verify(admin.resetOtp, otp);

    if (!isOtpValid) {
      admin.resetOtpAttempts = (admin.resetOtpAttempts || 0) + 1;

      await admin.save();

      const attemptsLeft = Math.max(0, 5 - admin.resetOtpAttempts);

      return res.status(400).json({
        success: false,
        message:
          attemptsLeft > 0
            ? `Invalid OTP. ${attemptsLeft} attempt${
                attemptsLeft === 1 ? "" : "s"
              } remaining.`
            : "Invalid OTP. Please request a new OTP.",
      });
    }

    // --------------------------------------------------------
    // Update password
    // --------------------------------------------------------

    admin.password = await argon2.hash(newPassword);

    // --------------------------------------------------------
    // Clear OTP data
    // --------------------------------------------------------

    admin.resetOtp = undefined;
    admin.resetOtpExpires = undefined;
    admin.resetOtpAttempts = 0;

    // --------------------------------------------------------
    // Save password
    // --------------------------------------------------------

    await admin.save();

    // --------------------------------------------------------
    // Clear existing login cookie
    // --------------------------------------------------------

    res.clearCookie("accessToken", cookieOptions());

    // --------------------------------------------------------
    // Success
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password",
    });
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  adminLogin,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
};
