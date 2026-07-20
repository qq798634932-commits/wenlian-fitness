import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FitnessApp from "../../app/FitnessApp";
import "../../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FitnessApp />
  </StrictMode>,
);
