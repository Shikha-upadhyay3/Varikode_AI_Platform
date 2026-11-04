import { authFetch } from "./authFetch";

// Opens Razorpay checkout for the chosen plan (starter | growth | scale)
export async function handleUpgrade(plan) {
  // 1) Ask our backend to create a subscription
  const res = await authFetch("/api/create-subscription", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
  const { subscriptionId, error } = await res.json();
  if (error || !subscriptionId) return alert(error || "Could not start payment");

  // 2) Open Razorpay checkout
  const rzp = new window.Razorpay({
    key: import.meta.env.VITE_RAZORPAY_KEY_ID,
    subscription_id: subscriptionId,
    name: "Varikode.ai",
    description: `${plan} plan (auto-renew)`,
    handler: async (response) => {
      // 3) Verify the payment on the server
      const v = await authFetch("/api/verify-payment", {
        method: "POST",
        body: JSON.stringify({ ...response, plan }),
      });
      if (v.ok) window.location.href = "/?upgraded=1";
      else alert("Payment verification failed. Please contact support.");
    },
    theme: { color: "#2dd4bf" },
    modal: { ondismiss: () => console.log("Checkout closed") },
  });
  rzp.open();
}