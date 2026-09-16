
const jwt = require("jsonwebtoken");

const combinedAuthMiddleware = async (req, res, next) => {
  try {
    // ==========================================================
    // MOBILE AUTH
    // Authorization: Bearer <JWT>
    // ==========================================================

    const authHeader = req.headers.authorization;

    if (
      authHeader &&
      authHeader.startsWith("Bearer ")
    ) {
      const token = authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET,
      );

      req.user = decoded;

      return next();
    }

    // ==========================================================
    // WEB AUTH
    // Cookie: accessToken
    // ==========================================================

    const cookieToken = req.cookies.accessToken;

    if (!cookieToken) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(
      cookieToken,
      process.env.JWT_SECRET,
    );

    req.user = decoded;

    return next();
  } catch (error) {
    console.error(
      "COMBINED AUTH ERROR:",
      error.message,
    );

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = combinedAuthMiddleware;

