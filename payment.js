(function(){
"use strict";
const cfg=window.DHAROAHAR_CONFIG||{};
const KEY=cfg.orderKey||"dharoahar_pending_order_v1";
const $=id=>document.getElementById(id);
let order={};
try{order=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
const money=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
$("payOrderId").textContent=order.orderId||"Order ID unavailable";
$("payAmount").textContent=money(order.total);
const upi=String(cfg.upiId||"").trim();
const payee=cfg.payeeName||"Adhish Dharoahar Private Limited";
if(upi){
  $("upiIdDisplay").value=upi;
  $("openUpi").href="upi://pay?pa="+encodeURIComponent(upi)+"&pn="+encodeURIComponent(payee)+"&am="+encodeURIComponent(Number(order.total||0).toFixed(2))+"&cu=INR&tn="+encodeURIComponent("Dharoahar "+(order.orderId||"Order"));
}else{
  $("openUpi").setAttribute("aria-disabled","true");
  $("openUpi").style.opacity=".45";
  $("openUpi").addEventListener("click",e=>{e.preventDefault();alert("Dharoahar UPI ID is not configured.")});
}
$("copyUpi").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(upi);$("copyUpi").textContent="COPIED";}
  catch(e){$("upiIdDisplay").select();document.execCommand("copy");$("copyUpi").textContent="COPIED";}
});
if(!order.orderId){
  const n=document.createElement("div");n.className="dh-error";n.textContent="Order details are not available in this browser. Please contact Dharoahar before making payment.";document.querySelector(".dh-panel").prepend(n);
  $("openUpi").style.display="none";
}
})();
