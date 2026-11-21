(function () {
  "use strict";

  const cfg = window.DHAROAHAR_CONFIG || {};
  const API = cfg.apiUrl;
  const CART_KEY = cfg.cartKey || "dharoahar_cart_v1";
  const ORDER_KEY = cfg.orderKey || "dharoahar_pending_order_v1";

  const $ = id => document.getElementById(id);

  let order = {};

  try {
    order = JSON.parse(localStorage.getItem(ORDER_KEY) || "{}");
  } catch (e) {
    order = {};
  }

  const upi = String(cfg.upiId || "").trim();
  const payee = cfg.payeeName || "Adhish Dharoahar Private Limited";

  function money(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2
    });
  }

  function message(text, type = "dh-note") {
    const box = $("paymentMessage");
    if (!box) return;

    box.innerHTML = "";
    const div = document.createElement("div");
    div.className = type;
    div.textContent = text;
    box.appendChild(div);
  }

  // Display order information
  $("payOrderId").textContent = order.orderId || "Order ID unavailable";
  $("payAmount").textContent = money(order.total);

  // Keep UPI details hidden until requested
  $("upiIdDisplay").value = upi;

  $("showUpiDetails").addEventListener("click", function () {
    const panel = $("upiDetails");
    panel.classList.toggle("show");

    this.textContent = panel.classList.contains("show")
      ? "HIDE PAYMENT DETAILS"
      : "HAVING TROUBLE? SHOW UPI PAYMENT DETAILS";
  });

  // Copy UPI ID
  $("copyUpi").addEventListener("click", async function () {
    if (!upi) {
      message("Payment details are currently unavailable.", "dh-error");
      return;
    }

    try {
      await navigator.clipboard.writeText(upi);
    } catch (e) {
      $("upiIdDisplay").select();
      document.execCommand("copy");
    }

    this.textContent = "COPIED ✓";

    setTimeout(() => {
      this.textContent = "COPY UPI ID";
    }, 2000);
  });

  // Launch UPI app
  $("openUpi").addEventListener("click", function () {
    if (!order.orderId || !Number(order.total)) {
      message(
        "Order details could not be found. Please contact Dharoahar before making payment.",
        "dh-error"
      );
      return;
    }

    if (!upi) {
      $("upiDetails").classList.add("show");
      message("UPI details are not configured.", "dh-error");
      return;
    }

    const params = new URLSearchParams({
      pa: upi,
      pn: payee,
      am: Number(order.total).toFixed(2),
      cu: "INR",
      tn: "Dharoahar " + order.orderId
    });

    const upiLink = "upi://pay?" + params.toString();

    message("Opening your UPI app. If it does not open, use the payment-details option below.");

    // Attempt to open installed UPI application
    window.location.href = upiLink;

    // Fallback for desktop browsers or devices without a UPI app
    setTimeout(() => {
      if (!document.hidden) {
        $("upiDetails").classList.add("show");
        $("showUpiDetails").textContent = "HIDE PAYMENT DETAILS";

        message(
          "If your UPI app did not open, copy the UPI ID and pay manually using your preferred UPI app."
        );
      }
    }, 1800);
  });

  // Find order in Google Sheets before clearing the cart
  function verifyOrderSaved(attempt = 1) {
    if (!API || !order.orderId || !order.customer || !order.customer.mobile) {
      message(
        "Order details are incomplete. Your cart has been retained. Please contact Dharoahar.",
        "dh-error"
      );
      return;
    }

    const mobile = String(order.customer.mobile).replace(/\D/g, "");
    const last4 = mobile.slice(-4);

    if (last4.length !== 4) {
      message(
        "We could not verify the order details. Your cart has been retained.",
        "dh-error"
      );
      return;
    }

    const callbackName = "__dhPaymentVerify" + Date.now() + "_" + attempt;
    const script = document.createElement("script");

    let completed = false;

    const timeout = setTimeout(() => {
      finish(null);
    }, 10000);

    function finish(data) {
      if (completed) return;

      completed = true;
      clearTimeout(timeout);

      try {
        delete window[callbackName];
      } catch (e) {}

      script.remove();

      if (data && data.success && data.order) {
        // Order exists in the private Google Sheet.
        // Only now clear the browser cart.
        localStorage.removeItem(CART_KEY);

        message(
          "Your order has been recorded successfully. Your cart is now cleared. Payment verification will be handled by our team.",
          "dh-success"
        );

        window.dispatchEvent(new Event("dharoahar-cart-updated"));
        return;
      }

      if (attempt < 5) {
        setTimeout(() => verifyOrderSaved(attempt + 1), 2500);
      } else {
        message(
          "We have not yet been able to confirm that your order was saved. Your cart has been retained. Please contact Dharoahar with your Order ID: " + order.orderId,
          "dh-error"
        );
      }
    }

    window[callbackName] = finish;

    script.onerror = () => finish(null);

    const query = new URLSearchParams({
      action: "lookup",
      orderId: order.orderId,
      mobileLast4: last4,
      callback: callbackName,
      _: Date.now()
    });

    script.src = API + "?" + query.toString();
    document.head.appendChild(script);
  }

  // Order confirmation link
  $("confirmReturn").addEventListener("click", function (event) {
    event.preventDefault();

    verifyOrderSaved();

    // Allow the customer to continue to the confirmation page.
    setTimeout(() => {
      window.location.href = "order-success.html";
    }, 700);
  });

  // Add WhatsApp support message
  const support = document.createElement("div");
  support.className = "dh-whatsapp-support";

  support.innerHTML =
    'Questions about your order? <a href="https://wa.me/918603824415?text=' +
    encodeURIComponent("Hello Dharoahar, I need assistance with my order.") +
    '" target="_blank" rel="noopener">Connect with us on WhatsApp →</a>';

  const panel = document.querySelector(".payment-layout");
  if (panel) {
    panel.parentNode.insertBefore(support, panel.nextSibling);
  }

  // Missing order protection
  if (!order.orderId) {
    $("openUpi").disabled = true;
    $("confirmReturn").style.display = "none";

    message(
      "Order details are unavailable in this browser. Please contact Dharoahar before making payment.",
      "dh-error"
    );
  }

})();
