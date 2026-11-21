(function () {
  "use strict";

  const cfg = window.DHAROAHAR_CONFIG || {};
  const API = cfg.apiUrl;
  const CART_KEY = cfg.cartKey || "dharoahar_cart_v1";
  const ORDER_KEY = cfg.orderKey || "dharoahar_pending_order_v1";

  const $ = id => document.getElementById(id);

  const money = n =>
    "₹" + Number(n || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2
    });

  let products = {};
  let settings = {};
  let subtotal = 0;
  let deliveryCharge = 0;
  let grandTotal = 0;
  let pricesLoaded = false;
  let submitting = false;

  const form = $("dhCheckoutForm");
  const submitButton = $("placeOrder");

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function showMessage(message, type = "dh-error") {
    const box = $("checkoutError");
    if (!box) return;

    box.innerHTML = "";

    const div = document.createElement("div");
    div.className = type;
    div.textContent = message;

    box.appendChild(div);
  }

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function makeOrderId() {
    const date = new Date();

    const stamp =
      date.getFullYear() +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0");

    let random;

    if (window.crypto && crypto.getRandomValues) {
      const bytes = new Uint8Array(4);
      crypto.getRandomValues(bytes);

      random = Array.from(bytes)
        .map(x => x.toString(16).padStart(2, "0"))
        .join("")
        .substring(0, 6)
        .toUpperCase();
    } else {
      random = Math.random().toString(36)
        .substring(2, 8)
        .toUpperCase();
    }

    return "DHA-" + stamp + "-" + random;
  }

  function jsonp(url, callback, timeoutMs = 12000) {
    const callbackName =
      "__dhCheckout_" + Date.now() + "_" +
      Math.random().toString(36).substring(2, 7);

    const script = document.createElement("script");
    let completed = false;

    const timer = setTimeout(() => finish(null), timeoutMs);

    function finish(data) {
      if (completed) return;

      completed = true;
      clearTimeout(timer);

      try {
        delete window[callbackName];
      } catch (e) {}

      script.remove();
      callback(data);
    }

    window[callbackName] = finish;

    script.onerror = () => finish(null);

    const separator = url.includes("?") ? "&" : "?";

    script.src =
      url +
      separator +
      "callback=" +
      encodeURIComponent(callbackName) +
      "&_=" +
      Date.now();

    document.head.appendChild(script);
  }

  function getSettings() {
    const minimum = Number(settings["Minimum Order Value"]) || 500;

    const absoluteMinimum =
      Number(settings["Minimum Cart Value for Checkout"]) || 250;

    const allowBelowMinimum =
      String(settings["Allow Checkout Below ₹500"] || "YES")
        .trim()
        .toUpperCase() === "YES";

    const belowMinimumCharge =
      Number(settings["Below ₹500 Delivery Charge"]) || 0;

    return {
      minimum,
      absoluteMinimum,
      allowBelowMinimum,
      belowMinimumCharge
    };
  }

  function renderOrderSummary(items) {
    const container = $("checkoutItems");

    if (!container) return;

    let html = "";

    subtotal = 0;

    for (const item of items) {
      const product = products[item.sku];
      const quantity = Number(item.quantity);

      if (
        !product ||
        String(product.stockStatus).trim().toLowerCase() !== "in stock" ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {
        throw new Error(
          "A product in your cart is unavailable or has an invalid quantity. Please return to your cart."
        );
      }

      const price = Number(product.salePrice);

      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("A product price could not be verified.");
      }

      const lineTotal = price * quantity;

      subtotal += lineTotal;

      html += `
        <div class="dh-line-item">
          <img
            src="${escapeHTML(product.image)}"
            alt="${escapeHTML(product.name)}"
          >

          <div>
            <h3>${escapeHTML(product.name)}</h3>
            <p>
              ${quantity} × ${money(price)}
              · ${Number(product.packSize) || 100} g
            </p>
          </div>

          <strong>${money(lineTotal)}</strong>
        </div>
      `;
    }

    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;

    const rules = getSettings();

    if (subtotal < rules.absoluteMinimum) {
      throw new Error(
        "Your minimum checkout value is " +
        money(rules.absoluteMinimum) +
        ". Please add more products."
      );
    }

    if (
      subtotal < rules.minimum &&
      !rules.allowBelowMinimum
    ) {
      throw new Error(
        "Please add products worth " +
        money(rules.minimum - subtotal) +
        " to reach the minimum order value."
      );
    }

    deliveryCharge =
      subtotal < rules.minimum
        ? rules.belowMinimumCharge
        : 0;

    grandTotal = Math.round(
      (subtotal + deliveryCharge + Number.EPSILON) * 100
    ) / 100;

    container.innerHTML = html;

    $("checkoutSubtotal").textContent = money(subtotal);
    $("checkoutDelivery").textContent = money(deliveryCharge);
    $("checkoutTotal").textContent = money(grandTotal);

    const minDays = Number(settings["Delivery Min Days"]) || 10;
    const maxDays = Number(settings["Delivery Max Days"]) || 15;

    $("checkoutDeliveryNote").textContent =
      "Estimated delivery: " +
      minDays +
      "–" +
      maxDays +
      " days after payment confirmation, subject to PIN code serviceability." +
      (
        deliveryCharge > 0
          ? " A below-minimum delivery charge of " +
            money(deliveryCharge) +
            " applies."
          : ""
      );
  }

  function loadProducts() {
    if (!API) {
      showMessage("Website pricing connection is not configured.");
      submitButton.disabled = true;
      return;
    }

    const items = readCart();

    if (!items.length) {
      showMessage("Your cart is empty. Please add products before checkout.");

      submitButton.disabled = true;
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "LOADING ORDER DETAILS…";

    jsonp(API, data => {
      if (!data || !data.success || !Array.isArray(data.products)) {
        showMessage(
          "Unable to fetch the latest prices. Please refresh the page and try again."
        );

        submitButton.disabled = true;
        submitButton.textContent = "CONTINUE TO PAYMENT";
        return;
      }

      settings = data.settings || {};

      data.products.forEach(product => {
        products[product.sku] = product;
      });

      try {
        renderOrderSummary(items);

        pricesLoaded = true;
        submitButton.disabled = false;
        submitButton.textContent = "CONTINUE TO PAYMENT";

      } catch (error) {
        showMessage(error.message);
        submitButton.disabled = true;
        submitButton.textContent = "CONTINUE TO PAYMENT";
      }

    });
  }

  function collectCustomerDetails() {
    const data = new FormData(form);

    return {
      name: String(data.get("name") || "").trim(),
      mobile: String(data.get("mobile") || "").replace(/\D/g, ""),
      email: String(data.get("email") || "").trim(),
      address1: String(data.get("address1") || "").trim(),
      address2: String(data.get("address2") || "").trim(),
      city: String(data.get("city") || "").trim(),
      state: String(data.get("state") || "").trim(),
      pincode: String(data.get("pincode") || "").trim(),
      notes: String(data.get("notes") || "").trim()
    };
  }

  function validateCustomer(customer) {
    if (customer.name.length < 2) {
      throw new Error("Please enter your full name.");
    }

    if (!/^\d{10}$/.test(customer.mobile)) {
      throw new Error("Please enter a valid 10-digit mobile number.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      throw new Error("Please enter a valid email address.");
    }

    if (!/^\d{6}$/.test(customer.pincode)) {
      throw new Error("Please enter a valid 6-digit PIN code.");
    }

    const required = [
      "address1",
      "city",
      "state"
    ];

    required.forEach(key => {
      if (!customer[key]) {
        throw new Error("Please complete all required delivery details.");
      }
    });
  }

  function verifyOrderSaved(order, attempt = 1) {
    const mobileLast4 = order.customer.mobile.slice(-4);

    const query = new URLSearchParams({
      action: "lookup",
      orderId: order.orderId,
      mobileLast4: mobileLast4
    });

    jsonp(API + "?" + query.toString(), data => {

      if (data && data.success && data.order) {

        // Server confirms the order is present in Google Sheets.
        order.total = Number(data.order.total) || order.total;
        order.paymentStatus = data.order.paymentStatus;
        order.orderStatus = data.order.orderStatus;

        localStorage.setItem(ORDER_KEY, JSON.stringify(order));

        // Clear cart only after the order has been verified.
        localStorage.removeItem(CART_KEY);

        window.dispatchEvent(new Event("dharoahar-cart-updated"));

        showMessage(
          "Your order has been saved successfully. Redirecting to payment…",
          "dh-success"
        );

        submitButton.textContent = "ORDER SAVED ✓";

        setTimeout(() => {
          window.location.href = "payment.html";
        }, 900);

        return;
      }

      if (attempt < 8) {
        showMessage(
          "Your order is being recorded. Please wait while we verify it…",
          "dh-note"
        );

        setTimeout(() => {
          verifyOrderSaved(order, attempt + 1);
        }, 2500);

        return;
      }

      // Never clear the cart or redirect if the order is not confirmed.
      submitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "CHECK ORDER STATUS AGAIN";

      showMessage(
        "We could not yet confirm your order in our records. Your cart has NOT been cleared. Please do not submit another order immediately. Contact Dharoahar with this Order ID: " +
        order.orderId +
        ". You can retry the status check using the button.",
        "dh-error"
      );

      submitButton.onclick = function (event) {
        event.preventDefault();

        if (submitting) return;

        submitting = true;
        submitButton.disabled = true;
        submitButton.textContent = "CHECKING ORDER…";

        verifyOrderSaved(order, 1);
      };

    });
  }

  function submitOrder(event) {
    event.preventDefault();

    if (submitting) return;

    if (!form.reportValidity()) return;

    if (!pricesLoaded) {
      showMessage("Please wait until the latest product prices are loaded.");
      return;
    }

    try {
      const customer = collectCustomerDetails();
      validateCustomer(customer);

      const items = readCart();

      if (!items.length) {
        throw new Error("Your cart is empty.");
      }

      // Recalculate from the current Google Sheets prices.
      renderOrderSummary(items);

      const order = {
        orderId: makeOrderId(),
        total: grandTotal,
        subtotal: subtotal,
        deliveryCharge: deliveryCharge,
        customer: customer,
        items: items,
        notes: customer.notes,
        createdAt: new Date().toISOString()
      };

      // Save pending details before sending the order.
      // This lets the payment page access the same order.
      localStorage.setItem(ORDER_KEY, JSON.stringify(order));

      const payload = {
        action: "createOrder",
        orderId: order.orderId,
        customer: customer,
        items: items,
        notes: customer.notes
      };

      const iframe = $("dhOrderSubmitFrame");

      if (!iframe) {
        throw new Error(
          "Order submission frame is missing from checkout.html."
        );
      }

      if (!API) {
        throw new Error("Order submission connection is unavailable.");
      }

      const postForm = document.createElement("form");

      postForm.method = "POST";
      postForm.action = API;
      postForm.target = iframe.name;
      postForm.style.display = "none";

      const input = document.createElement("input");

      input.type = "hidden";
      input.name = "payload";
      input.value = JSON.stringify(payload);

      postForm.appendChild(input);
      document.body.appendChild(postForm);

      submitting = true;
      submitButton.disabled = true;
      submitButton.textContent = "PLACING YOUR ORDER…";

      showMessage(
        "Please wait. We are securely recording your order.",
        "dh-note"
      );

      postForm.submit();

      // Poll the Google Sheet through the existing order lookup endpoint.
      // This confirms actual order creation instead of trusting iframe load.
      setTimeout(() => {
        verifyOrderSaved(order, 1);
      }, 2500);

      // Remove temporary form after submission.
      setTimeout(() => postForm.remove(), 5000);

    } catch (error) {
      submitting = false;
      showMessage(error.message);

      submitButton.disabled = false;
      submitButton.textContent = "CONTINUE TO PAYMENT";
    }
  }

  function addWhatsAppSupport() {
    if (document.querySelector(".dh-whatsapp-support")) return;

    const support = document.createElement("div");

    support.className = "dh-whatsapp-support";

    support.innerHTML =
      'Need help with your order? ' +
      '<a href="https://wa.me/918603824415?text=' +
      encodeURIComponent("Hello Dharoahar, I need assistance with my order.") +
      '" target="_blank" rel="noopener">' +
      'Connect with us on WhatsApp →</a>';

    const main = document.querySelector(".dh-wrap");

    if (main) {
      main.appendChild(support);
    }
  }

  // Prevent Enter key from accidentally submitting while loading.
  form.addEventListener("submit", submitOrder);

  // Initialise checkout.
  addWhatsAppSupport();
  loadProducts();

})();
