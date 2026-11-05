import Razorpay from "razorpay";

// Shared Razorpay client used by all API functions
export const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});