import { useState } from "react";
import LocalLevelView from "./components/LocalLevelView";
import HedgeRatioView from "./components/HedgeRatioView";
import MethodologyView from "./components/MethodologyView";
import DataMenu from "./components/DataMenu";
import { LinkedInIcon } from "./components/Icons";

type Tab = "level" | "pair" | "math";

const TABS: Array<{ id: Tab; label: string; note: string }> = [
  { id: "pair", label: "Hedge Ratio", note: "time-varying beta for pairs trading" },
  { id: "level", label: "Local Level", note: "noise-filtered price estimate" },
  { id: "math", label: "Methodology", note: "the derivation, in full" },
];

function Attribution() {
  return (
    <span className="byline">
      Built by <span className="byline-name">Shayan Mardaneh</span>
      <a
        className="byline-link"
        href="https://www.linkedin.com/in/shayanmardaneh"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Shayan Mardaneh on LinkedIn"
        title="LinkedIn"
      >
        <LinkedInIcon />
      </a>
    </span>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("pair");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-top">
          <div className="mark">
            <span className="mark-glyph" aria-hidden="true" />
            <span className="mark-word">Kalman Terminal</span>
          </div>
          <div className="masthead-right">
            <Attribution />
            <DataMenu />
          </div>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span className="nav-tab-label">{t.label}</span>
              <span className="nav-tab-note">{t.note}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        <h1 className="page-title">{active.label}</h1>

        {/* Views stay mounted so fetched data and slider state survive tab switches. */}
        <div style={{ display: tab === "pair" ? "block" : "none" }}>
          <HedgeRatioView />
        </div>
        <div style={{ display: tab === "level" ? "block" : "none" }}>
          <LocalLevelView />
        </div>
        <div style={{ display: tab === "math" ? "block" : "none" }}>
          <MethodologyView />
        </div>
      </main>

      <footer className="app-footer">
        <Attribution />
        <span className="footer-meta">
          Filters run client-side in TypeScript. Data from Yahoo Finance daily adjusted close.
        </span>
      </footer>
    </div>
  );
}
