import React from "react";
import { createRoot } from "react-dom/client";
import { App as DemoApp } from "./App.jsx";
import { RealApp } from "./RealApp.jsx";
import "./styles.css";

const demoMode = import.meta.env.VITE_PRESSDROP_DEMO === "1" || new URLSearchParams(window.location.search).get("demo") === "1";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {demoMode ? <DemoApp /> : <RealApp />}
  </React.StrictMode>,
);
