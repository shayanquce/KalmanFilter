import { useState } from "react";
import LocalLevelView from "./components/LocalLevelView";
import HedgeRatioView from "./components/HedgeRatioView";
import MethodologyView from "./components/MethodologyView";

type Tab = "level" | "pair" | "math";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "level", label: "Local Level" },
  { id: "pair", label: "Hedge Ratio" },
  { id: "math", label: "Methodology" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("pair");

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <span className="brand">
            KALMAN<span className="slash"> / </span>TERMINAL
          </span>
          <span className="brand-sub">recursive state estimation on market data</span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Views stay mounted so fetched data and slider state survive tab switches. */}
      <div style={{ display: tab === "level" ? "block" : "none" }}>
        <LocalLevelView />
      </div>
      <div style={{ display: tab === "pair" ? "block" : "none" }}>
        <HedgeRatioView />
      </div>
      <div style={{ display: tab === "math" ? "block" : "none" }}>
        <MethodologyView />
      </div>

      <footer className="app-footer">
        <span>filters run client-side in TypeScript, one observation at a time</span>
        <span>data: Yahoo Finance daily adjusted close</span>
      </footer>
    </div>
  );
}
