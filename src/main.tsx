import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

setTimeout(() => {
  document.getElementById("greeting")!.style.opacity = "1";
},250);
setTimeout(() => {
  document.getElementById("intro")!.style.opacity = "1";
},1250);
setTimeout(() => {
  document.getElementById("subtitle")!.style.opacity = "1";
},2250);
setTimeout(() => {
  var elements = document.getElementsByClassName("contact-logo");
  for (var i = 0; i < elements.length; i++) {
    (elements[i] as HTMLElement).style["opacity"] = "1";
  }},3250);