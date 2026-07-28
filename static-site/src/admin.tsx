import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FamilyAuthGate from "../../app/FamilyAuthGate";
import "../../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FamilyAuthGate view="admin" />
  </StrictMode>,
);
