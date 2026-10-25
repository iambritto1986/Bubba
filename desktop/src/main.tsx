import { ClerkProvider } from "@clerk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Bubba } from "./components/Bubba";
import { SpeechBubble } from "./components/SpeechBubble";
import { CLERK_KEY, isTauri } from "./lib/env";
import "./index.css";

if (isTauri) document.documentElement.classList.add("in-tauri");

const root = createRoot(document.getElementById("root")!);

if (!CLERK_KEY) {
  root.render(
    <div className="flex h-full flex-col items-center justify-end gap-3 p-4 font-sans">
      <SpeechBubble id="no-key">
        <p className="text-sm font-semibold">Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> to <code>desktop/.env.local</code> and restart me.</p>
      </SpeechBubble>
      <Bubba mood="oops" size={170} />
    </div>,
  );
} else {
  const origin = window.location.origin + "/";
  root.render(
    <StrictMode>
      <ClerkProvider
        publishableKey={CLERK_KEY}
        signInForceRedirectUrl={origin}
        signUpForceRedirectUrl={origin}
        signInFallbackRedirectUrl={origin}
        signUpFallbackRedirectUrl={origin}
      >
        <App />
      </ClerkProvider>
    </StrictMode>,
  );
}
