import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom"; // Import BrowserRouter
import "./index.css";
import App from "./App.tsx";
import { FirebaseProvider } from "./contexts/FirebaseContext.tsx"; // Import the provider

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {" "}
      {/* Wrap with BrowserRouter */}
      <FirebaseProvider>
        {" "}
        {/* Wrap App with the provider */}
        <App />
      </FirebaseProvider>
    </BrowserRouter>
  </StrictMode>
);
