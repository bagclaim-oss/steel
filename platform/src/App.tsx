import { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Landing } from "./pages/Landing";

/**
 * Root application component for Companion Cloud.
 *
 * Simple hash-based routing:
 * - #/dashboard  → Dashboard (instance management)
 * - #/onboarding → Onboarding flow
 * - default      → Landing page with pricing
 */
export default function App() {
  const [hash, setHash] = useState(window.location.hash);

  // Listen for hash changes
  window.addEventListener("hashchange", () => setHash(window.location.hash));

  if (hash.startsWith("#/dashboard")) {
    return <Dashboard />;
  }

  return <Landing />;
}
