import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { Fh2Provider } from "./fh2/Fh2Provider.js";
import { DjiPilotBridgeProvider } from "./pilot-bridge/DjiPilotBridgeProvider.js";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <DjiPilotBridgeProvider>
      <Fh2Provider>
        <App />
      </Fh2Provider>
    </DjiPilotBridgeProvider>
  </StrictMode>
);
