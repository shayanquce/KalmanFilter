import { useEffect, useRef, useState } from "react";
import { getAlphaVantageKey, setAlphaVantageKey } from "../lib/data";
import { DataIcon } from "./Icons";

// A small popover for the optional Alpha Vantage key. Yahoo is the default and
// needs nothing here. This only matters on networks that block Yahoo.
export default function DataMenu() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(getAlphaVantageKey());
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const save = () => {
    setAlphaVantageKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const active = getAlphaVantageKey().length > 0;

  return (
    <div className="data-menu" ref={ref}>
      <button className={`data-btn ${active ? "on" : ""}`} onClick={() => setOpen((o) => !o)}>
        <DataIcon />
        <span>Data</span>
        <span className="data-dot" aria-hidden="true" />
      </button>
      {open && (
        <div className="data-pop">
          <div className="data-pop-title">Data source</div>
          <p className="data-pop-note">
            Default is Yahoo Finance, keyless, with automatic failover between two hosts.
            Add an Alpha Vantage key only if Yahoo is blocked on your network. It is used
            as a fallback and stored in this browser, never sent anywhere else.
          </p>
          <label className="data-pop-label" htmlFor="av-key">Alpha Vantage key</label>
          <div className="data-pop-row">
            <input
              id="av-key"
              type="password"
              value={key}
              placeholder="optional"
              onChange={(e) => setKey(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button className="data-save" onClick={save}>
              {saved ? "Saved" : "Save"}
            </button>
          </div>
          <a
            className="data-pop-get"
            href="https://www.alphavantage.co/support/#api-key"
            target="_blank"
            rel="noopener noreferrer"
          >
            get a free key
          </a>
        </div>
      )}
    </div>
  );
}
