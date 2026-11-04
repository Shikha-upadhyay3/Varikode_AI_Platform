// Maps our plan names to Razorpay plan ids and monthly message limits
export const PLANS = {
  starter: { planId: process.env.RAZORPAY_PLAN_STARTER, limit: 50 },
  growth: { planId: process.env.RAZORPAY_PLAN_GROWTH, limit: 150 },
  scale: { planId: process.env.RAZORPAY_PLAN_SCALE, limit: 200 },
};

export const FREE_LIMIT = 50;