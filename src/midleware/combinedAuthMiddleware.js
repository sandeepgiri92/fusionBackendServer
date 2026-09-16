const jwt = require("jsonwebtoken");

const combinedAuthMiddleware = async (req, res, next) => {
  try {
    console.log("================================================");
    console.log("COMBINED AUTH HIT");
    console.log("METHOD:", req.method);
    console.log("URL:", req.originalUrl);
    console.log(
      "AUTH HEADER:",
      req.headers.authorization
        ? "BEARER HEADER PRESENT"
        : "NO BEARER HEADER",
    );
    console.log("COOKIE TOKEN:", req.cookies?.accessToken ? "PRESENT" : "NOT PRESENT");
    console.log("================================================");

    // ==========================================================
    // MOBILE AUTH
    // Authorization: Bearer <JWT>
    // ==========================================================

    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();

      if (!token) {
        console.log("MOBILE AUTH: EMPTY TOKEN");

        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET,
      );

      console.log(
        "MOBILE AUTH SUCCESS:",
        decoded?.id,
      );

      req.user = decoded;

      return next();
    }

    // ==========================================================
    // WEB AUTH
    // Cookie: accessToken
    // ==========================================================

    const cookieToken = req.cookies?.accessToken;

    if (!cookieToken) {
      console.log("WEB AUTH: COOKIE TOKEN NOT FOUND");

      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(
      cookieToken,
      process.env.JWT_SECRET,
    );

    console.log(
      "WEB AUTH SUCCESS:",
      decoded?.id,
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