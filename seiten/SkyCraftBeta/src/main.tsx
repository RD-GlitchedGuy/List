import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");

if (!root) throw new Error("SkyCraft root element is missing.");

const probe = document.createElement("canvas");
let supported = false;
try {
  supported = !!(
    probe.getContext("webgl2") ||
    probe.getContext("webgl") ||
    probe.getContext("experimental-webgl")
  );
} catch {
  supported = false;
}

if (supported) {
  createRoot(root).render(<App />);
} else {
  const warning = document.getElementById("browser-support");
  if (warning) {
    warning.hidden = false;
    warning.style.display = "flex";
  }
  root.remove();
}
