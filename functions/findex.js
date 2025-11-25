import Stripe from "stripe";
import * as functions from "firebase-functions";
import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// Load secret key from environment
const stripe = new Stripe(functions.config().stripe.secret, {
  apiVersion: "2022-11-15"
});

// Create Checkout Session
export const createCheckoutSession = functions.https.onCall(async (data, context) => {
  const { email } = data;

  if (!email) throw new functions.https.HttpsError("invalid-argument", "Email is required");

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{
      price: "price_1SUhQ22NptXES4ePtCv1IOoY", // your Stripe price ID
      quantity: 1
    }],
    mode: "payment",
    success_url: "http://localhost:5000/success?email=" + encodeURIComponent(email),
    cancel_url: "http://localhost:5000/cancel"
  });

  return { url: session.url };
});

// Stripe Webhook to mark user as paid
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = functions.config().stripe.webhook; // set this

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error(err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email;
    if (email) {
      await db.collection("paidUsers").doc(email).set({ paid: true });
    }
  }

  res.status(200).send("Received");
});
