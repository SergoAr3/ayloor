import { createRoot } from "react-dom/client";
import Budapest from "./Budapest";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <Budapest earlyAccessUrl={import.meta.env.VITE_BUDAPEST_EARLY_ACCESS_URL} />,
);
