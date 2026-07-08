import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

// throwOnError stays true on purpose: a LaTeX typo should fail loudly in
// development, never degrade to plain text.

export function TexBlock({ tex }: { tex: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: true, throwOnError: true }),
    [tex],
  );
  return <div className="tex-block" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A framed display equation, the standard unit in the methodology. */
export function Eqn({ tex }: { tex: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: true, throwOnError: true }),
    [tex],
  );
  return (
    <div className="eqn">
      <div className="eqn-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export function Tex({ tex }: { tex: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: false, throwOnError: true }),
    [tex],
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A "where" block: one definition row per symbol introduced above it. */
export function Where({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="where">
      {rows.map(([sym, def]) => (
        <div className="where-pair" key={sym} style={{ display: "contents" }}>
          <div className="where-sym">
            <Tex tex={sym} />
          </div>
          <div className="where-def">{def}</div>
        </div>
      ))}
    </div>
  );
}
