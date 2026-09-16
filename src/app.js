const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const authMiddleware = require("./midleware/authMiddleware");
const mobileAuthMiddleware = require("./midleware/mobileAuthMiddleware");

// ============================================================
// ROUTES
// ============================================================

const adminLoginRouter = require("./routes/adminLoginRouter");
const mobileAuthRoutes = require("./routes/mobileAuthRoutes");

const partiesRouter = require("./routes/partiesRouter");
const entryRouter = require("./routes/entryRouter");
const expenseRouter = require("./routes/expenseRouter");
const stockRouter = require("./routes/stockRouter");

// ============================================================
// MODELS
// ============================================================

const Sale = require("./models/SaleModel");
const Purchase = require("./models/purchaseModel");
const Service = require("./models/serviceModel");
const Expense = require("./models/expenseModel");
const Transaction = require("./models/transactionModel");
const Party = require("./models/partModel");

// ============================================================
// APP
// ============================================================

const app = express();

// ============================================================
// TRUST PROXY
// ============================================================

app.set("trust proxy", 1);

// ============================================================
// CORS
// ============================================================

const allowedOrigins = [
  "https://fusionenterprises.vercel.app",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin
      // React Native / Expo / Postman can send requests
      // without a browser Origin header.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`));
    },

    credentials: true,
  }),
);

// ============================================================
// SECURITY
// ============================================================

app.use(helmet());

// ============================================================
// BODY PARSER
// ============================================================

app.use(express.json({ limit: "1mb" }));

app.use(cookieParser());

// ============================================================
// GLOBAL API RATE LIMIT
// ============================================================

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ============================================================
// WEB ADMIN AUTH ROUTES
// ============================================================
// EXISTING WEB AUTH
// Cookie based authentication
//
// DO NOT CHANGE
// ============================================================

app.use("/api/admin", adminLoginRouter);

// ============================================================
// MOBILE AUTH ROUTES
// ============================================================
// NEW MOBILE AUTH
// Bearer token based authentication
//
// Login:
// POST /api/mobile-auth/login
//
// Current user:
// GET /api/mobile-auth/me
//
// Logout:
// POST /api/mobile-auth/logout
// ============================================================

app.use("/api/mobile-auth", mobileAuthRoutes);

// ============================================================
// PROTECTED PARTY ROUTES
// ============================================================
// WEB AUTH
// Cookie:
// accessToken
// ============================================================

app.use("/api/admin", authMiddleware, partiesRouter);

// ============================================================
// PROTECTED ENTRY + EXPENSE + STOCK ROUTES
// ============================================================
// WEB AUTH
// ============================================================

app.use(
  "/api",
  authMiddleware,
  entryRouter,
  expenseRouter,
  stockRouter,
);

// ============================================================
// DASHBOARD AUTH
// ============================================================
// IMPORTANT:
//
// Website:
// accessToken cookie
//      ↓
// authMiddleware
//
// Mobile:
// Authorization: Bearer <JWT>
//      ↓
// mobileAuthMiddleware
//
// This keeps the existing website authentication unchanged.
// ============================================================

const dashboardAuthMiddleware = (req, res, next) => {
  // ----------------------------------------------------------
  // MOBILE REQUEST
  // ----------------------------------------------------------
  // If Authorization Bearer token exists,
  // use mobile JWT authentication.
  // ----------------------------------------------------------

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    return mobileAuthMiddleware(req, res, next);
  }

  // ----------------------------------------------------------
  // WEB REQUEST
  // ----------------------------------------------------------
  // Existing website continues using cookie authentication.
  // ----------------------------------------------------------

  return authMiddleware(req, res, next);
};

// ============================================================
// DASHBOARD
// ============================================================

app.get(
  "/api/dashboard",
  dashboardAuthMiddleware,
  async (req, res) => {
    try {
      const [
        sale,
        purchase,
        service,
        expense,
        parties,
        paid,
        pending,
        allTransactionAmount,
        recent,
      ] = await Promise.all([
        // ------------------------------------------------------
        // SALE
        // ------------------------------------------------------

        Sale.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),

        // ------------------------------------------------------
        // PURCHASE
        // ------------------------------------------------------

        Purchase.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),

        // ------------------------------------------------------
        // SERVICE
        // ------------------------------------------------------

        Service.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),

        // ------------------------------------------------------
        // EXPENSE
        // ------------------------------------------------------

        Expense.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),

        // ------------------------------------------------------
        // ACTIVE PARTIES
        // ------------------------------------------------------

        Party.countDocuments({
          isActive: true,
        }),

        // ------------------------------------------------------
        // PAID
        // ------------------------------------------------------

        Transaction.aggregate([
          {
            $unwind: {
              path: "$payments",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $ifNull: ["$payments.amount", 0],
                },
              },
            },
          },
        ]),

        // ------------------------------------------------------
        // PENDING
        // ------------------------------------------------------

        Transaction.aggregate([
          {
            $project: {
              amount: 1,
              paid: {
                $sum: {
                  $ifNull: ["$payments.amount", []],
                },
              },
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $max: [
                    {
                      $subtract: ["$amount", "$paid"],
                    },
                    0,
                  ],
                },
              },
            },
          },
        ]),

        // ------------------------------------------------------
        // TOTAL TRANSACTIONS
        // ------------------------------------------------------

        Transaction.aggregate([
          {
            $group: {
              _id: null,
              total: {
                $sum: "$amount",
              },
            },
          },
        ]),

        // ------------------------------------------------------
        // RECENT TRANSACTIONS
        // ------------------------------------------------------

        Transaction.find()
          .populate("partyId", "name")
          .sort({
            createdAt: -1,
          })
          .limit(6)
          .lean(),
      ]);

      // ========================================================
      // RESPONSE
      // ========================================================

      return res.json({
        success: true,

        stats: {
          sale: sale[0]?.total || 0,
          purchase: purchase[0]?.total || 0,
          service: service[0]?.total || 0,
          expense: expense[0]?.total || 0,

          partyCount: parties,

          paid: paid[0]?.total || 0,

          pending: pending[0]?.total || 0,

          transactionTotal:
            allTransactionAmount[0]?.total || 0,
        },

        recent: recent.map((x) => ({
          id: x._id,
          type: x.type,
          partyName: x.partyId?.name || "Unknown",
          amount: x.amount,
          status: x.paymentStatus,
          date: x.createdAt,
        })),
      });
    } catch (error) {
      console.error("Dashboard error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to load dashboard",
      });
    }
  },
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  return res.json({
    success: true,
    status: "ok",
    timestamp: new Date(),
  });
});

// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "Fusion API is running",
  });
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  // ----------------------------------------------------------
  // CORS ERROR
  // ----------------------------------------------------------

  if (err.message?.startsWith("CORS blocked")) {
    return res.status(403).json({
      success: false,
      message: "CORS blocked",
    });
  }

  // ----------------------------------------------------------
  // GENERAL ERROR
  // ----------------------------------------------------------

  return res.status(500).json({
    success: false,
    message: "Unexpected server error",
  });
});

// ============================================================
// EXPORT
// ============================================================

module.exports = app;