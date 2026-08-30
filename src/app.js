const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const authMiddleware = require("./midleware/authMiddleware");

const adminLoginRouter = require("./routes/adminLoginRouter");
const partiesRouter = require("./routes/partiesRouter");
const entryRouter = require("./routes/entryRouter");
const expenseRouter = require("./routes/expenseRouter");

const Sale = require("./models/SaleModel");
const Purchase = require("./models/purchaseModel");
const Service = require("./models/serviceModel");
const Expense = require("./models/expenseModel");
const Transaction = require("./models/transactionModel");
const Party = require("./models/partModel");

const app = express();

/* =========================
   CORS
========================= */

const allowedOrigins = [
  "https://fusionenterprises.vercel.app",
  "http://localhost:5173",
];

app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without origin
      // e.g. Postman, server-to-server
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

/* =========================
   BODY PARSER
========================= */

app.use(express.json({ limit: "1mb" }));

app.use(cookieParser());

/* =========================
   RATE LIMIT
========================= */

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/* =========================
   ADMIN AUTH ROUTES
========================= */

app.use("/api/admin", adminLoginRouter);

/* =========================
   PROTECTED PARTY ROUTES
========================= */

app.use("/api/admin", authMiddleware, partiesRouter);

/* =========================
   PROTECTED ENTRY + EXPENSE
========================= */

app.use("/api", authMiddleware, entryRouter, expenseRouter);

/* =========================
   DASHBOARD
========================= */

app.get("/api/dashboard", authMiddleware, async (req, res) => {
  try {
    const [sale, purchase, service, expense, parties, paid, pending, recent] =
      await Promise.all([
        Sale.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),

        Purchase.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),

        Service.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),

        Expense.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),

        Party.countDocuments({
          isActive: true,
        }),

        Transaction.aggregate([
          {
            $match: {
              paymentStatus: "paid",
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: "$amount",
              },
            },
          },
        ]),

        Transaction.aggregate([
          {
            $match: {
              paymentStatus: "pending",
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: "$amount",
              },
            },
          },
        ]),

        Transaction.find()
          .populate("partyId", "name")
          .sort({
            createdAt: -1,
          })
          .limit(6)
          .lean(),
      ]);

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
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date(),
  });
});

/* =========================
   ROOT
========================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Fusion API is running",
  });
});

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  // CORS error
  if (err.message?.startsWith("CORS blocked")) {
    return res.status(403).json({
      success: false,
      message: "CORS blocked",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Unexpected server error",
  });
});

module.exports = app;
