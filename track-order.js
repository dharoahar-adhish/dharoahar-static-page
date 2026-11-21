(function () {
  "use strict";

  const cfg = window.DHAROAHAR_CONFIG || {};
  const API = cfg.apiUrl || "";
  const $ = id => document.getElementById(id);

  const params = new URLSearchParams(window.location.search);
  if (params.get("order") && $("orderId")) {
    $("orderId").value = params.get("order");
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return (url.protocol === "https:" || url.protocol === "http:") ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function jsonp(url, callback, timeoutMs) {
    const callbackName = "__dhTrack_" + Date.now() + "_" +
      Math.random().toString(36).slice(2, 7);
    const script = document.createElement("script");
    let finished = false;
    const timer = setTimeout(() => finish(null), timeoutMs || 18000);

    function finish(data) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { delete window[callbackName]; } catch (error) {}
      script.remove();
      callback(data);
    }

    window[callbackName] = finish;
    script.onerror = () => finish(null);
    script.src = url + (url.includes("?") ? "&" : "?") +
      "callback=" + encodeURIComponent(callbackName) +
      "&_=" + Date.now();

    document.head.appendChild(script);
  }

  function renderOrder(data) {
    const order = data.order || data;
    const courier = order.courierName || order.courierCompany ||
      data.courierName || data.courierCompany || "";
    const trackingNumber = order.trackingNumber || order.awbNumber ||
      data.trackingNumber || data.awbNumber || "";
    const trackingUrl = safeHttpUrl(order.trackingUrl || data.trackingUrl);
    const invoiceUrl = safeHttpUrl(order.invoiceUrl || order.invoiceLink ||
      data.invoiceUrl || data.invoiceLink);

    const trackingValue = trackingUrl
      ? '<a class="trk-external" href="' + escapeHTML(trackingUrl) +
        '" target="_blank" rel="noopener">Track shipment ↗</a>'
      : (trackingNumber ? escapeHTML(trackingNumber) : "Not yet available");

    const courierValue = courier ? escapeHTML(courier) : "Not yet assigned";

    $("trackResult").innerHTML = `
      <section class="trk-result-card">
        <div class="trk-result-top">
          <div>
            <div class="dh-eyebrow">Order ${escapeHTML(order.orderId || data.orderId || "")}</div>
            <h2>Order status</h2>
          </div>
          <span class="trk-status-pill">${escapeHTML(order.orderStatus || data.orderStatus || "New")}</span>
        </div>

        <div class="trk-info-grid">
          <div class="trk-info-row"><span>Payment</span><strong>${escapeHTML(order.paymentStatus || data.paymentStatus || "Verification Pending")}</strong></div>
          <div class="trk-info-row"><span>Order</span><strong>${escapeHTML(order.orderStatus || data.orderStatus || "New")}</strong></div>
          <div class="trk-info-row"><span>Order total</span><strong>₹${Number(order.total || data.total || 0).toLocaleString("en-IN")}</strong></div>
          <div class="trk-info-row"><span>Courier company</span><strong>${courierValue}</strong></div>
          <div class="trk-info-row"><span>Tracking / AWB number</span><strong>${trackingNumber ? escapeHTML(trackingNumber) : "Not yet available"}</strong></div>
          ${trackingUrl ? '<div class="trk-info-row"><span>Shipment tracking</span><strong>' + trackingValue + '</strong></div>' : ""}
          ${invoiceUrl ? '<div class="trk-info-row"><span>Order confirmation</span><strong><a class="trk-external" href="' + escapeHTML(invoiceUrl) + '" target="_blank" rel="noopener">View order document ↗</a></strong></div>' : ""}
        </div>

        <div class="trk-delivery-note">
          Estimated delivery: 10–15 days after payment confirmation, subject to PIN-code serviceability.
          Courier and tracking details are updated manually by Dharoahar.
        </div>
        <div class="trk-help">
          Need help with this order?
          <a href="https://wa.me/918603824415?text=${encodeURIComponent("Hello Dharoahar, I need help with order " + (order.orderId || data.orderId || "") + ".")}" target="_blank" rel="noopener">Connect with us on WhatsApp →</a>
        </div>
      </section>
    `;
  }

  $("trackForm").addEventListener("submit", function (event) {
    event.preventDefault();

    const orderId = $("orderId").value.trim();
    const last4 = $("mobileLast4").value.replace(/\D/g, "");

    if (!API) {
      $("trackResult").innerHTML = '<div class="dh-error">Order tracking is temporarily unavailable. Please contact Dharoahar.</div>';
      return;
    }
    if (!/^\d{4}$/.test(last4)) {
      $("trackResult").innerHTML = '<div class="dh-error">Please enter the last four digits of the mobile number used at checkout.</div>';
      return;
    }

    $("trackResult").innerHTML = '<div class="dh-note">Looking up your order…</div>';

    const query = new URLSearchParams({
      action: "lookup",
      orderId: orderId,
      mobileLast4: last4
    });

    jsonp(API + "?" + query.toString(), function (result) {
      if (!result || !result.success) {
        $("trackResult").innerHTML =
          '<div class="dh-error">' +
          escapeHTML((result && result.error) ||
            "We could not find an order with those details. Please check and try again.") +
          '</div>';
        return;
      }
      renderOrder(result);
    }, 18000);
  });
})();
