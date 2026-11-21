/* Dharoahar shared cart foundation. Cart is stored locally until checkout is added. */
(function(){
  "use strict";
  const API_URL = window.DHAROAHAR_PRODUCTS_API || "https://script.google.com/macros/s/AKfycbzxdAbxiiWGeR1wAxTw2Fz7BaqkR5qZp8oIq-U0qsppedsGe1hI92b1t3A3hd84wRbt/exec";
  const CART_KEY = "dharoahar_cart_v1";
  const MAX_QTY = 100;
  let productMap = {};
  let toastTimer;

  function readCart(){
    try { const x = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); return Array.isArray(x) ? x : []; }
    catch(e) { return []; }
  }
  function writeCart(items){ localStorage.setItem(CART_KEY, JSON.stringify(items)); }
  function money(n){ return "₹" + Number(n || 0).toLocaleString("en-IN", {maximumFractionDigits:2}); }
  function toast(message){
    let el=document.querySelector(".dh-cart-toast");
    if(!el){ el=document.createElement("div"); el.className="dh-cart-toast"; el.setAttribute("role","status"); document.body.appendChild(el); }
    el.textContent=message; el.classList.add("is-visible"); clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>el.classList.remove("is-visible"),2400);
  }
  function totalUnits(){ return readCart().reduce((n,x)=>n+(Number(x.quantity)||0),0); }
  function renderCard(card, product){
    const price=card.querySelector("[data-sale-price]");
    const mrp=card.querySelector("[data-mrp]");
    const discount=card.querySelector("[data-discount]");
    const pack=card.querySelector("[data-pack-label]");
    const add=card.querySelector("[data-add-to-cart]");
    if(!product){
      if(price) price.textContent="Price unavailable";
      if(add){add.disabled=true;add.textContent="UNAVAILABLE";}
      return;
    }
    if(price) price.textContent=money(product.salePrice);
    if(mrp) mrp.textContent=product.mrp>product.salePrice?money(product.mrp):"";
    if(discount) discount.textContent=product.discount>0?Math.round(product.discount*100)+"% OFF":"";
    if(pack) pack.textContent=(product.packSize||100)+" g pack";
    const available=String(product.stockStatus||"").trim().toLowerCase()==="in stock";
    if(add){add.disabled=!available;add.textContent=available?"ADD TO CART":"OUT OF STOCK";}
    if(!product.visible || String(product.visible).toUpperCase()!=="YES") card.style.display="none";
  }
  function loadProducts(){
    const callbackName="__dharoaharProducts_"+Date.now();
    const script=document.createElement("script");
    const timeout=setTimeout(()=>{cleanup();document.querySelectorAll("[data-commerce]").forEach(c=>{const p=c.querySelector("[data-sale-price]");if(p)p.textContent="Price unavailable";const b=c.querySelector("[data-add-to-cart]");if(b){b.disabled=true;b.textContent="TRY AGAIN LATER";}});},12000);
    function cleanup(){clearTimeout(timeout);delete window[callbackName];if(script.parentNode)script.parentNode.removeChild(script);}
    window[callbackName]=function(data){
      cleanup();
      if(!data||!data.success||!Array.isArray(data.products)){toast("We couldn't load current prices. Please refresh the page.");return;}
      data.products.forEach(p=>productMap[p.sku]=p);
      document.querySelectorAll("[data-commerce]").forEach(card=>renderCard(card,productMap[card.dataset.sku]));
      window.dispatchEvent(new CustomEvent("dharoahar:products-loaded",{detail:data}));
    };
    script.onerror=function(){cleanup();toast("Prices are temporarily unavailable. Please refresh.");};
    script.src=API_URL+(API_URL.includes("?")?"&":"?")+"callback="+callbackName+"&_="+Date.now();
    document.head.appendChild(script);
  }
  document.addEventListener("click",function(event){
    const minus=event.target.closest("[data-qty-minus]");
    const plus=event.target.closest("[data-qty-plus]");
    const add=event.target.closest("[data-add-to-cart]");
    if(minus||plus){
      event.preventDefault();event.stopPropagation();
      const control=(minus||plus).closest("[data-commerce]");
      const out=control&&control.querySelector("[data-qty]");
      if(!out)return;
      let qty=parseInt(out.textContent,10)||1;
      qty=minus?Math.max(1,qty-1):Math.min(MAX_QTY,qty+1);
      out.textContent=String(qty);return;
    }
    if(add){
      event.preventDefault();event.stopPropagation();
      const card=add.closest("[data-commerce]");
      if(!card)return;
      const sku=card.dataset.sku;const product=productMap[sku];
      if(!product||String(product.stockStatus).toLowerCase()!=="in stock"){toast("This product is currently unavailable.");return;}
      const qty=Math.min(MAX_QTY,Math.max(1,parseInt(card.querySelector("[data-qty]").textContent,10)||1));
      const items=readCart();const existing=items.find(x=>x.sku===sku);
      if(existing)existing.quantity=Math.min(MAX_QTY,existing.quantity+qty);
      else items.push({sku:sku,quantity:qty});
      writeCart(items);
      toast(product.name+" added to cart · "+totalUnits()+" item(s) in cart");
      add.textContent="ADDED ✓";setTimeout(()=>{if(document.body.contains(add))add.textContent="ADD TO CART";},1300);
      window.dispatchEvent(new CustomEvent("dharoahar:cart-updated",{detail:{items:readCart(),count:totalUnits()}}));
    }
  });
  window.DharoaharCart={getItems:readCart,getCount:totalUnits,clear:function(){writeCart([]);},getProducts:function(){return productMap;}};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadProducts);else loadProducts();
})();
