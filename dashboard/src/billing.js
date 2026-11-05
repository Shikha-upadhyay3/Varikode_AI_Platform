
import { authFetch } from "./authFetch";

// Load Razorpay Checkout if it is not already loaded
function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Razorpay checkout could not load"));

    document.body.appendChild(script);
  });
}

// Opens Razorpay checkout for the selected plan
export async function handleUpgrade(plan) {
  try {
    // 1. Check Razorpay Checkout availability
    await loadRazorpay();

    const key = import.meta.env.VITE_RAZORPAY_KEY_ID;

    if (!key) {
      throw new Error("Razorpay Key ID is not configured");
    }

    // 2. Create subscription on backend
    const res = await authFetch("/api/create-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });

    const data = await res.json();

    if (!res.ok || !data.subscriptionId) {
      throw new Error(data.error || "Could not create subscription");
    }

    // 3. Open Razorpay Checkout
    const checkout = new window.Razorpay({
      key,
      subscription_id: data.subscriptionId,
      name: "Varikode.ai",
      description: `${plan} plan (monthly auto-renewal)`,

      handler: async (response) => {
        try {
          // 4. Verify payment on backend
          const verification = await authFetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...response,
              plan,
            }),
          });

          const result = await verification.json();

          if (!verification.ok || !result.ok) {
            throw new Error(
              result.error || "Payment verification failed"
            );
          }

          alert(
            "Payment verified successfully. Your subscription will activate after Razorpay confirms it."
          );

          window.location.href = "/?payment=verified";
        } catch (error) {
          console.error("Payment verification:", error);
          alert(error.message || "Payment verification failed. Please contact support.");
        }
      },

      modal: {
        ondismiss: () => {
          console.log("Razorpay checkout closed");
        },
      },

      theme: {
        color: "#2dd4bf",
      },
    });

    checkout.on("payment.failed", (response) => {
      console.error("Payment failed:", response.error);
      alert(
        response.error?.description || "Payment failed. Please try again."
      );
    });

    checkout.open();
  } catch (error) {
    console.error("Upgrade error:", error);
    alert(error.message || "Unable to start payment. Please try again.");
  }
}
