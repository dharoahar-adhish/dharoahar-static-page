/* Dharoahar ecommerce cart — local cart + live price/settings feed */
(function () {
  "use strict";

  const API_URL = window.DHAROAHAR_PRODUCTS_API || "https://script.google.com/macros/s/AKfycbzxdAbxiiWGeR1wAxTw2Fz7BaqkR5qZp8oIq-U0qsppedsGe1hI92b1t3A3hd84wRbt/exec";
  const CART_KEY = "dharoahar_cart_v1";
  const MAX_QTY = 100;
  let productMap = {};
  let settings = {};

  function readCart() {
    try {
      const data = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }
  function writeCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateCartBadges();
  }
  function money(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  function count() {
    return readCart().reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }
  function updateCartBadges() {
    document.querySelectorAll("[data-cart-count]").forEach(el => el.textContent = count());
    const floating = document.querySelector(".dh-floating-cart-count");
    if (floating) floating.textContent = count();
  }
  function ensureFloatingCart() {
    if (document.querySelector(".dh-floating-cart")) return;
    const a = document.createElement("a");
    a.className = "dh-floating-cart";
    a.href = "cart.html";
    a.setAttribute("aria-label", "View shopping cart");
    a.innerHTML = '<span class="dh-cart-icon" aria-hidden="true">🛒</span><span>Cart</span><b class="dh-floating-cart-count">' + count() + '</b>';
    document.body.appendChild(a);
  }
  function toast(message) {
    let el = document.querySelector(".dh-cart-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "dh-cart-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(window.__dhToastTimer);
    window.__dhToastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
  }
  function loadProducts(done) {
    const callbackName = "__dharoaharProducts_" + Date.now();
    const script = document.createElement("script");
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      if (done) done(false);
    }, 12000);
    function cleanup() {
      clearTimeout(timeout);
      try { delete window[callbackName]; } catch (e) {}
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    window[callbackName] = function (data) {
      if (finished) return;
      finished = true;
      cleanup();
      if (!data || !data.success || !Array.isArray(data.products)) {
        if (done) done(false);
        return;
      }
      data.products.forEach(p => { productMap[p.sku] = p; });
      settings = data.settings || {};
      if (done) done(true);
    };
    script.onerror = function () {
      if (finished) return;
      finished = true;
      cleanup();
      if (done) done(false);
    };
    script.src = API_URL + (API_URL.includes("?") ? "&" : "?") +
      "callback=" + callbackName + "&_=" + Date.now();
    document.head.appendChild(script);
  }

  function renderProductCards() {
    document.querySelectorAll("[data-commerce]").forEach(card => {
      const p = productMap[card.dataset.sku];
      const price = card.querySelector("[data-sale-price]");
      const mrp = card.querySelector("[data-mrp]");
      const discount = card.querySelector("[data-discount]");
      const pack = card.querySelector("[data-pack-label]");
      const add = card.querySelector("[data-add-to-cart]");
      if (!p) {
        if (price) price.textContent = "Price unavailable";
        if (add) { add.disabled = true; add.textContent = "UNAVAILABLE"; }
        return;
      }
      if (price) price.textContent = money(p.salePrice);
      if (mrp) mrp.textContent = p.mrp > p.salePrice ? money(p.mrp) : "";
      if (discount) discount.textContent = p.discount > 0 ? Math.round(p.discount * 100) + "% OFF" : "";
      if (pack) pack.textContent = (p.packSize || 100) + " g pack";
      const available = String(p.stockStatus || "").trim().toLowerCase() === "in stock";
      if (add) { add.disabled = !available; add.textContent = available ? "ADD TO CART" : "OUT OF STOCK"; }
      if (String(p.visible).toUpperCase() !== "YES") card.style.display = "none";
    });
  }

  function renderCartPage() {
    const list = document.getElementById("dhCartItems");
    if (!list) return;
    const items = readCart();
    list.innerHTML = "";

    if (!items.length) {
      list.innerHTML = '<div class="dh-empty-cart"><div class="dh-empty-icon">🛒</div><h2>Your cart is waiting</h2><p>You haven’t added any spices yet.</p><a class="dh-primary-btn" href="products.html">Explore Our Spices</a></div>';
      updateCartSummary(0, 0, 0, false);
      return;
    }

    let subtotal = 0;
    items.forEach(item => {
      const p = productMap[item.sku];
      if (!p) return;
      const qty = Math.max(1, Math.min(MAX_QTY, Number(item.quantity) || 1));
      const line = Number(p.salePrice) * qty;
      subtotal += line;

      const row = document.createElement("article");
      row.className = "dh-cart-row";
      row.innerHTML = `
        <img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}">
        <div class="dh-cart-product">
          <div class="dh-cart-category">${escapeHtml(p.category || "Dharoahar Spice")}</div>
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(p.hindiName || "")} · ${Number(p.packSize) || 100} g</p>
          <button type="button" class="dh-remove-item" data-remove="${escapeAttr(item.sku)}">Remove</button>
        </div>
        <div class="dh-cart-qty">
          <button type="button" aria-label="Decrease quantity" data-cart-minus="${escapeAttr(item.sku)}">−</button>
          <span>${qty}</span>
          <button type="button" aria-label="Increase quantity" data-cart-plus="${escapeAttr(item.sku)}">+</button>
        </div>
        <div class="dh-cart-line-price">${money(line)}</div>`;
      list.appendChild(row);
    });

    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;
    const minOrder = Number(settings["Minimum Order Value"]) || 500;
    const absoluteMin = Number(settings["Minimum Cart Value for Checkout"]) || 250;
    const allowBelow = String(settings["Allow Checkout Below ₹500"] || "YES").toUpperCase() === "YES";
    const belowCharge = Number(settings["Below ₹500 Delivery Charge"]) || 0;
    let delivery = 0;
    if (subtotal < minOrder && allowBelow) delivery = belowCharge;
    const canCheckout = subtotal >= minOrder || (allowBelow && subtotal >= absoluteMin);
    updateCartSummary(subtotal, delivery, subtotal + delivery, canCheckout, minOrder, absoluteMin);
  }

  function updateCartSummary(subtotal, delivery, total, canCheckout, minOrder, absoluteMin) {
    const sub = document.getElementById("dhSubtotal");
    const ship = document.getElementById("dhDelivery");
    const grand = document.getElementById("dhGrandTotal");
    const note = document.getElementById("dhCartNotice");
    const checkout = document.getElementById("dhCheckoutButton");
    if (sub) sub.textContent = money(subtotal);
    if (ship) ship.textContent = delivery ? money(delivery) : "₹0";
    if (grand) grand.textContent = money(total);
    if (note) {
      if (!subtotal) note.textContent = "Add products to get started.";
      else if (subtotal < absoluteMin) note.textContent = "Your cart must be at least " + money(absoluteMin) + " to proceed.";
      else if (subtotal < minOrder) note.textContent = "Add " + money(minOrder - subtotal) + " more to avoid the additional delivery charge. You can also continue with the " + money(delivery) + " below-minimum delivery charge.";
      else note.textContent = "You have reached the minimum order value. Delivery is estimated in " + (settings["Delivery Min Days"] || 10) + "–" + (settings["Delivery Max Days"] || 15) + " days.";
    }
    if (checkout) {
      checkout.disabled = !canCheckout;
      checkout.textContent = canCheckout ? "PROCEED TO CHECKOUT" : "MINIMUM ORDER NOT MET";
      checkout.title = canCheckout ? "Checkout will be available in the next setup step." : "Minimum cart value not met.";
    }
    updateCartBadges();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }

  document.addEventListener("click", function (event) {
    const minus = event.target.closest("[data-qty-minus]");
    const plus = event.target.closest("[data-qty-plus]");
    const add = event.target.closest("[data-add-to-cart]");
    const cartMinus = event.target.closest("[data-cart-minus]");
    const cartPlus = event.target.closest("[data-cart-plus]");
    const remove = event.target.closest("[data-remove]");

    if (minus || plus) {
      event.preventDefault();
      const card = (minus || plus).closest("[data-commerce]");
      const out = card && card.querySelector("[data-qty]");
      if (!out) return;
      let qty = parseInt(out.textContent, 10) || 1;
      out.textContent = String(minus ? Math.max(1, qty - 1) : Math.min(MAX_QTY, qty + 1));
      return;
    }
    if (add) {
      event.preventDefault();
      const card = add.closest("[data-commerce]");
      if (!card) return;
      const sku = card.dataset.sku;
      const product = productMap[sku];
      if (!product || String(product.stockStatus).toLowerCase() !== "in stock") {
        toast("This product is currently unavailable.");
        return;
      }
      const qty = Math.min(MAX_QTY, Math.max(1, parseInt(card.querySelector("[data-qty]").textContent, 10) || 1));
      const items = readCart();
      const existing = items.find(x => x.sku === sku);
      if (existing) existing.quantity = Math.min(MAX_QTY, Number(existing.quantity) + qty);
      else items.push({ sku, quantity: qty });
      writeCart(items);
      toast(product.name + " added to cart · " + count() + " item(s)");
      add.textContent = "ADDED ✓";
      setTimeout(() => { if (document.body.contains(add)) add.textContent = "ADD TO CART"; }, 1300);
      window.dispatchEvent(new CustomEvent("dharoahar:cart-updated"));
      return;
    }
    if (cartMinus || cartPlus || remove) {
      event.preventDefault();
      const sku = (cartMinus || cartPlus || remove).dataset.cartMinus ||
        (cartMinus || cartPlus || remove).dataset.cartPlus ||
        (cartMinus || cartPlus || remove).dataset.remove;
      let items = readCart();
      const found = items.find(x => x.sku === sku);
      if (remove) items = items.filter(x => x.sku !== sku);
      else if (found) {
        found.quantity = cartMinus ? Math.max(1, Number(found.quantity) - 1) : Math.min(MAX_QTY, Number(found.quantity) + 1);
      }
      writeCart(items);
      renderCartPage();
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    ensureFloatingCart();
    updateCartBadges();
    loadProducts(function (ok) {
      if (!ok) {
        toast("We couldn't load current prices. Please refresh.");
        const list = document.getElementById("dhCartItems");
        if (list) list.innerHTML = '<p class="dh-cart-error">Product prices are temporarily unavailable. Please refresh the page.</p>';
        return;
      }
      renderProductCards();
      renderCartPage();
      updateCartBadges();
    });
  });

  window.addEventListener("storage", updateCartBadges);
  window.DharoaharCart = { getItems: readCart, getCount: count, clear: function () { writeCart([]); }, getProducts: function () { return productMap; } };
})();
