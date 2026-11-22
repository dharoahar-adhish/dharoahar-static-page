(function () {
  "use strict";

  // Prevent duplicate initialisation.
  if (window.__DHAROAHAR_CART_INIT__) return;
  window.__DHAROAHAR_CART_INIT__ = true;

  // Configuration is read during initialisation to avoid script-order issues.
  let API = "";
  let CART_KEY = "dharoahar_cart_v1";

  const PRODUCT_CACHE_KEY = "dharoahar_products_cache_v2";
  const LEGACY_PRODUCT_CACHE_KEY = "dharoahar_products_cache_v1";
  const PRODUCT_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

  let products = {};
  let settings = {};
  let usingCachedPrices = false;

  const $ = id => document.getElementById(id);

  const money = value => "₹" + Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });

  function readCart() {
    try {
      const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function writeCart(items) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch (error) {}

    updateBadges();
    window.dispatchEvent(new Event("dharoahar-cart-updated"));
  }

  function updateBadges() {
    const count = readCart().reduce((sum, item) =>
      sum + Math.max(0, Number(item.quantity) || 0), 0);

    document.querySelectorAll("[data-cart-count]").forEach(node => {
      node.textContent = count;
    });

    document.querySelectorAll(".dh-floating-cart-count").forEach(node => {
      node.textContent = count;
    });
  }

  function showToast(message) {
    let toast = document.querySelector(".dh-cart-toast");

    if (!toast) {
      toast = document.createElement("div");
      toast.className = "dh-cart-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("is-visible");

    clearTimeout(window.__dharoaharToastTimer);

    window.__dharoaharToastTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2300);
  }

  function addFloatingCart() {
    if (document.querySelector(".dh-floating-cart")) return;

    const link = document.createElement("a");

    link.className = "dh-floating-cart";
    link.href = "cart.html";
    link.setAttribute("aria-label", "Open shopping cart");

    link.innerHTML =
      '🛒 <span>Cart</span> <b class="dh-floating-cart-count">' +
      updateCartCount() + '</b>';

    document.body.appendChild(link);
  }

  function updateCartCount() {
    return readCart().reduce((sum, item) =>
      sum + Math.max(0, Number(item.quantity) || 0), 0);
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  // Improved JSONP handling for mobile browsers and Apps Script redirects.
  function jsonpRequest(url, timeoutMs) {
    return new Promise(resolve => {

      const callbackName = "__dhProductFeed_" +
        Date.now() + "_" +
        Math.random().toString(36).slice(2, 12);

      const script = document.createElement("script");

      let finished = false;
      let callbackReceived = false;

      function finish(data) {
        if (finished) return;

        finished = true;

        clearTimeout(timer);

        script.onload = null;
        script.onerror = null;

        try {
          delete window[callbackName];
        } catch (error) {
          window[callbackName] = undefined;
        }

        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }

        resolve(data || null);
      }

      const timer = setTimeout(() => {
        finish(null);
      }, timeoutMs || 35000);

      window[callbackName] = data => {
        callbackReceived = true;
        finish(data);
      };

      script.async = true;
      script.type = "text/javascript";

      script.onerror = () => finish(null);

      script.onload = () => {
        if (!callbackReceived) {
          setTimeout(() => finish(null), 250);
        }
      };

      const separator = url.includes("?") ? "&" : "?";

      script.src = url + separator +
        "callback=" + encodeURIComponent(callbackName) +
        "&_=" + Date.now() + "_" +
        Math.random().toString(36).slice(2, 8);

      const mountPoint =
        document.head ||
        document.body ||
        document.documentElement;

      if (!mountPoint) {
        finish(null);
        return;
      }

      mountPoint.appendChild(script);
    });
  }

  function saveProductCache(data) {
    try {
      localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        products: data.products || [],
        settings: data.settings || {}
      }));
    } catch (error) {}
  }

  function readProductCache() {
    try {
      let cached = JSON.parse(
        localStorage.getItem(PRODUCT_CACHE_KEY) || "null"
      );

      if (!cached) {
        cached = JSON.parse(
          localStorage.getItem(LEGACY_PRODUCT_CACHE_KEY) || "null"
        );
      }

      if (!cached || !Array.isArray(cached.products)) {
        return null;
      }

      if (
        Date.now() - Number(cached.savedAt || 0) >
        PRODUCT_CACHE_MAX_AGE
      ) {
        return null;
      }

      return cached;

    } catch (error) {
      return null;
    }
  }

  function applyProductFeed(data, isCache) {
    products = {};

    (data.products || []).forEach(product => {
      if (product && product.sku) {
        products[String(product.sku).trim()] = product;
      }
    });

    settings = data.settings || {};
    usingCachedPrices = Boolean(isCache);
  }

  async function loadProductFeed() {
    if (!API) {
      throw new Error("The website pricing connection is not configured.");
    }

    let lastError = null;

    // Retry transient mobile-network and Apps Script redirect delays.
    for (let attempt = 1; attempt <= 3; attempt++) {

      const data = await jsonpRequest(API, 20000);

      if (
        data &&
        data.success &&
        Array.isArray(data.products)
      ) {
        saveProductCache(data);
        applyProductFeed(data, false);
        return;
      }

      lastError = new Error("The live product feed did not respond.");

      if (attempt < 3) {
        await new Promise(resolve =>
          setTimeout(resolve, 700 * attempt)
        );
      }
    }

    // Use recently saved prices as a display fallback.
    const cached = readProductCache();

    if (cached) {
      applyProductFeed(cached, true);
      return;
    }

    throw lastError || new Error("Unable to load product prices.");
  }

  function renderProductCards() {

    document.querySelectorAll("[data-commerce]").forEach(card => {

      const sku = String(card.dataset.sku || "").trim();
      const product = products[sku];

      const price = card.querySelector("[data-sale-price]");
      const mrp = card.querySelector("[data-mrp]");
      const discount = card.querySelector("[data-discount]");
      const pack = card.querySelector("[data-pack-label]");
      const button = card.querySelector("[data-add-to-cart]");

      if (!product) {

        if (price) {
          price.textContent = "Price unavailable";
        }

        if (button) {
          button.disabled = true;
          button.textContent = "UNAVAILABLE";
        }

        return;
      }

      if (price) {
        price.textContent = money(product.salePrice);
      }

      if (mrp) {
        mrp.textContent =
          Number(product.mrp) > Number(product.salePrice)
            ? money(product.mrp)
            : "";
      }

      if (discount) {
        discount.textContent =
          Number(product.discount) > 0
            ? Math.round(Number(product.discount) * 100) + "% OFF"
            : "";
      }

      if (pack) {
        pack.textContent =
          (Number(product.packSize) || 100) + " g pack";
      }

      const inStock =
        String(product.stockStatus || "")
          .trim()
          .toLowerCase() === "in stock";

      if (button) {
        button.disabled = !inStock;
        button.textContent = inStock
          ? "ADD TO CART"
          : "OUT OF STOCK";
      }

      if (
        String(product.visible || "")
          .trim()
          .toUpperCase() !== "YES"
      ) {
        card.style.display = "none";
      }
    });

    if (usingCachedPrices) {

      document.querySelectorAll("[data-commerce]").forEach(card => {

        const price = card.querySelector("[data-sale-price]");

        if (price) {
          price.title =
            "Recently cached display price. Live price will be verified at checkout.";
        }

      });

    }
  }

  function getCartRules() {

    const minimum =
      Number(settings["Minimum Order Value"]) || 500;

    const absoluteMinimum =
      Number(settings["Minimum Cart Value for Checkout"]) || 250;

    const allowBelow =
      String(settings["Allow Checkout Below ₹500"] || "YES")
        .trim()
        .toUpperCase() === "YES";

    const belowCharge =
      Number(settings["Below ₹500 Delivery Charge"]) || 0;

    return {
      minimum,
      absoluteMinimum,
      allowBelow,
      belowCharge
    };
  }

  function calculateSummary(subtotal) {

    const rules = getCartRules();

    const delivery =
      subtotal < rules.minimum &&
      rules.allowBelow &&
      subtotal >= rules.absoluteMinimum
        ? rules.belowCharge
        : 0;

    return {
      ...rules,
      delivery,
      total: subtotal + delivery,

      canCheckout:
        subtotal >= rules.minimum ||
        (rules.allowBelow && subtotal >= rules.absoluteMinimum)
    };
  }

  function renderCart() {

    const container = $("dhCartItems");

    if (!container) return;

    const items = readCart();

    if (!items.length) {

      container.innerHTML = `
        <div class="dh-cart-empty">
          <div class="dh-cart-empty-mark">✦</div>
          <h2>Your cart is waiting</h2>
          <p class="dh-muted">You haven't added any spices yet.</p>
          <a class="dh-btn" href="products.html">
            EXPLORE OUR SPICES
          </a>
        </div>`;

      updateTotals(0);
      return;
    }

    let subtotal = 0;
    const itemMarkup = [];

    items.forEach(item => {

      const product =
        products[String(item.sku || "").trim()];

      if (!product) return;

      const quantity =
        Math.max(1, Number(item.quantity) || 1);

      const price =
        Number(product.salePrice) || 0;

      const lineTotal = price * quantity;

      subtotal += lineTotal;

      itemMarkup.push(`
        <article class="dh-line-item">

          <img
            src="${escapeHTML(product.image)}"
            alt="${escapeHTML(product.name)}"
            loading="lazy"
          >

          <div class="dh-cart-product-copy">

            <h3>${escapeHTML(product.name)}</h3>

            <p>
              ${escapeHTML(product.hindiName || "")}
              · ${Number(product.packSize) || 100} g
              · ${money(price)} each
            </p>

            <div class="dh-cart-item-actions">

              <div class="dh-cart-qty" aria-label="Quantity">

                <button
                  type="button"
                  class="dh-qty-mini"
                  data-minus="${escapeHTML(item.sku)}"
                  aria-label="Decrease quantity"
                >−</button>

                <span>${quantity}</span>

                <button
                  type="button"
                  class="dh-qty-mini"
                  data-plus="${escapeHTML(item.sku)}"
                  aria-label="Increase quantity"
                >+</button>

              </div>

              <button
                type="button"
                class="dh-remove"
                data-remove="${escapeHTML(item.sku)}"
              >Remove</button>

            </div>

          </div>

          <strong class="dh-cart-line-total">
            ${money(lineTotal)}
          </strong>

        </article>
      `);
    });

    if (!itemMarkup.length) {

      container.innerHTML = `
        <div class="dh-error">
          Your cart items could not be matched to the current product list.
          Please return to Our Spices and add them again.
        </div>`;

      updateTotals(0);
      return;
    }

    container.innerHTML = itemMarkup.join("");

    updateTotals(
      Math.round((subtotal + Number.EPSILON) * 100) / 100
    );
  }

  function updateTotals(subtotal) {

    const rules = calculateSummary(subtotal);

    if ($("dhSubtotal")) {
      $("dhSubtotal").textContent = money(subtotal);
    }

    if ($("dhDelivery")) {
      $("dhDelivery").textContent = money(rules.delivery);
    }

    if ($("dhGrandTotal")) {
      $("dhGrandTotal").textContent = money(rules.total);
    }

    const notice = $("dhCartNotice");

    if (notice) {

      if (!subtotal) {

        notice.textContent =
          "Add products to get started.";

      } else if (subtotal < rules.absoluteMinimum) {

        notice.textContent =
          "Your cart must be at least " +
          money(rules.absoluteMinimum) +
          " to proceed.";

      } else if (subtotal < rules.minimum) {

        notice.textContent =
          "Add " +
          money(rules.minimum - subtotal) +
          " more to reach the ₹" +
          rules.minimum +
          " minimum and avoid the below-minimum delivery charge of " +
          money(rules.belowCharge) +
          ". You may continue with the additional charge.";

      } else {

        notice.textContent =
          "You have reached the ₹" +
          rules.minimum +
          " minimum order value. Estimated delivery: " +
          (settings["Delivery Min Days"] || 10) +
          "–" +
          (settings["Delivery Max Days"] || 15) +
          " days.";
      }

      if (usingCachedPrices) {

        notice.textContent +=
          " Display prices were recently cached; checkout will verify live prices.";

      }
    }

    const button = $("dhCheckoutButton");

    if (button) {

      button.classList.add("dh-btn");

      button.href =
        rules.canCheckout ? "checkout.html" : "#";

      button.setAttribute(
        "aria-disabled",
        rules.canCheckout ? "false" : "true"
      );

      button.style.opacity =
        rules.canCheckout ? "1" : ".48";

      button.onclick = event => {

        if (!rules.canCheckout) {

          event.preventDefault();

          showToast(
            "Minimum checkout value is " +
            money(rules.absoluteMinimum)
          );

        }
      };
    }
  }

  function adjustCartItem(sku, delta, remove) {

    const items = readCart();

    const item = items.find(entry =>
      String(entry.sku) === String(sku)
    );

    if (remove) {

      writeCart(
        items.filter(entry =>
          String(entry.sku) !== String(sku)
        )
      );

    } else if (item) {

      item.quantity = Math.max(
        1,
        Math.min(
          100,
          (Number(item.quantity) || 1) + delta
        )
      );

      writeCart(items);
    }

    renderCart();
  }

  document.addEventListener("click", event => {

    const target = event.target;

    const minusCard =
      target.closest("[data-qty-minus]");

    const plusCard =
      target.closest("[data-qty-plus]");

    const addButton =
      target.closest("[data-add-to-cart]");

    if (minusCard || plusCard) {

      event.preventDefault();

      const card =
        (minusCard || plusCard).closest("[data-commerce]");

      const output =
        card && card.querySelector("[data-qty]");

      if (output) {

        const next =
          (Number(output.textContent) || 1) +
          (minusCard ? -1 : 1);

        output.textContent =
          Math.max(1, Math.min(100, next));
      }

      return;
    }

    if (addButton) {

      event.preventDefault();

      const card =
        addButton.closest("[data-commerce]");

      if (!card) return;

      const sku =
        String(card.dataset.sku || "").trim();

      const product = products[sku];

      if (
        !product ||
        String(product.stockStatus)
          .trim()
          .toLowerCase() !== "in stock"
      ) {

        showToast(
          "This product is currently unavailable."
        );

        return;
      }

      const quantity = Math.max(
        1,
        Math.min(
          100,
          Number(
            card.querySelector("[data-qty]")?.textContent
          ) || 1
        )
      );

      const items = readCart();

      const existing = items.find(item =>
        item.sku === sku
      );

      if (existing) {

        existing.quantity =
          Math.min(100, existing.quantity + quantity);

      } else {

        items.push({
          sku,
          quantity
        });
      }

      writeCart(items);

      showToast(product.name + " added to cart");

      addButton.textContent = "ADDED ✓";

      setTimeout(() => {

        if (document.body.contains(addButton)) {
          addButton.textContent = "ADD TO CART";
        }

      }, 1400);

      return;
    }

    const minus =
      target.closest("[data-minus]");

    const plus =
      target.closest("[data-plus]");

    const remove =
      target.closest("[data-remove]");

    if (minus || plus || remove) {

      const button =
        minus || plus || remove;

      const sku =
        button.dataset.minus ||
        button.dataset.plus ||
        button.dataset.remove;

      adjustCartItem(
        sku,
        minus ? -1 : 1,
        Boolean(remove)
      );
    }
  });

  // Load saved prices immediately before refreshing the live feed.
  function loadCachedPricesImmediately() {

    const cached = readProductCache();

    if (!cached) return false;

    applyProductFeed(cached, true);

    renderProductCards();
    renderCart();

    return true;
  }

  async function initialise() {

    addFloatingCart();
    updateBadges();

    const cfg = window.DHAROAHAR_CONFIG || {};

    API = String(cfg.apiUrl || "").trim();

    CART_KEY = String(
      cfg.cartKey || "dharoahar_cart_v1"
    );

    const hasCache =
      loadCachedPricesImmediately();

    try {

      await loadProductFeed();

      renderProductCards();
      renderCart();

    } catch (error) {

      console.warn(
        "Dharoahar product price feed failed:",
        error
      );

      if (!hasCache) {

        document.querySelectorAll(
          "[data-commerce] [data-sale-price]"
        ).forEach(node => {

          node.textContent =
            "Price temporarily unavailable";

        });

        document.querySelectorAll(
          "[data-commerce] [data-add-to-cart]"
        ).forEach(node => {

          node.disabled = true;
          node.textContent = "TRY AGAIN";

        });

        const cartContainer = $("dhCartItems");

        if (cartContainer) {

          cartContainer.innerHTML = `
            <div class="dh-error">
              We could not load current product prices.
              Please refresh the page or try again shortly.
            </div>`;

        }

      } else {

        showToast(
          "Showing recently saved prices. Live prices will be checked at checkout."
        );

      }
    }
  }

  function startInitialisation() {

    initialise().catch(error => {

      console.error(
        "Dharoahar initialisation error:",
        error
      );

    });
  }

  // Supports both normal and already-loaded document states.
  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      startInitialisation,
      { once: true }
    );

  } else {

    startInitialisation();

  }

  window.addEventListener("storage", updateBadges);

  window.addEventListener(
    "dharoahar-cart-updated",
    updateBadges
  );

  window.DharoaharStore = {

    cart: readCart,

    products: () => products,

    settings: () => settings,

    money: money,

    summary: calculateSummary

  };

})();
