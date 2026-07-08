// Renders every LaTeX string found in the source through KaTeX with
// throwOnError, so a typo fails here instead of at runtime.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import katex from "katex";

const roots = ["src/components"];
const files = [];
for (const root of roots) {
  for (const f of readdirSync(root)) {
    if (f.endsWith(".tsx")) files.push(join(root, f));
  }
}

// Matches tex={R`...`}, tex={String.raw`...`}, and Where rows [R`...`, ...].
const patterns = [/tex=\{(?:R|String\.raw)`([^`]+)`\}/g, /\[(?:R|String\.raw)`([^`]+)`,/g];

let total = 0;
let failures = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      total++;
      try {
        katex.renderToString(m[1], { displayMode: true, throwOnError: true });
      } catch (e) {
        failures++;
        console.error(`FAIL in ${file}:\n  ${m[1]}\n  ${e.message}`);
      }
    }
  }
}

console.log(`${total} expressions checked, ${failures} failures`);
process.exit(failures ? 1 : 0);
