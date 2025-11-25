import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import Stripe from "stripe";
import fs from "fs";
import cors from "cors";
import path from "path";
import { onRequest } from "firebase-functions/v2/https";

// --- EXPRESS SETUP ---
const app = express();

// Enable CORS for deployed frontend and local testing
app.use(cors({
  origin: ["https://lolfundamentals.web.app", "http://localhost:5000"],
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(bodyParser.json());

// --- FIREBASE ADMIN SETUP ---
const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// --- STRIPE SETUP ---
const stripe = new Stripe("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");

// -----------------------------------------------------------------------------
// 🚨 SECURE MIDDLEWARE: VERIFY FIREBASE ID TOKEN
// -----------------------------------------------------------------------------
async function verifyFirebaseToken(req, res, next) {
  const token = req.query.token || req.headers.authorization?.split("Bearer ")[1];

  if (!token) {
    return res.status(401).send("Unauthorized: No token provided");
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // contains email + uid
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    return res.status(401).send("Unauthorized: Invalid token");
  }
}

// -----------------------------------------------------------------------------
// ⭐ STRIPE WEBHOOK → Mark user as paid
// -----------------------------------------------------------------------------
app.post("/stripeWebhook", async (req, res) => {
  const event = req.body;

  try {
    if (event.type === "checkout.session.completed") {
      const customerEmail = event.data.object.customer_email;
      if (!customerEmail) return res.status(400).send("No email in session");

      await db.collection("paidUsers")
        .doc(customerEmail)
        .set({ paid: true }, { merge: true });

      console.log(`User ${customerEmail} marked as paid`);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing webhook");
  }
});

// -----------------------------------------------------------------------------
// ⭐ CHECK PAYMENT STATUS (used by frontend)
// -----------------------------------------------------------------------------
app.get("/checkPaid", verifyFirebaseToken, async (req, res) => {
  const email = req.user.email;

  try {
    const docSnap = await db.collection("paidUsers").doc(email).get();
    return res.json({
      paid: docSnap.exists && docSnap.data().paid === true
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch payment status" });
  }
});

// -----------------------------------------------------------------------------
// ⭐ SECURE MEMBERSHUB PAGE
// -----------------------------------------------------------------------------
app.get("/membershub", verifyFirebaseToken, async (req, res) => {
  const email = req.user.email;

  try {
    const userDoc = await db.collection("paidUsers").doc(email).get();
    if (!userDoc.exists || userDoc.data().paid !== true) {
      return res.status(403).send("Access denied: Paid membership required");
    }

    res.sendFile(path.resolve("./membershub.html")); // must exist in functions folder
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading members hub");
  }
});

// -----------------------------------------------------------------------------
// HEALTH CHECK
// -----------------------------------------------------------------------------
app.get("/", (req, res) => res.send("Backend is running"));

// -----------------------------------------------------------------------------
// EXPORT FOR FIREBASE FUNCTIONS
// -----------------------------------------------------------------------------
export const api = onRequest(app);

