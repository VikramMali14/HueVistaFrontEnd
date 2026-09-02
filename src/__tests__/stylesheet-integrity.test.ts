import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A stylesheet with an unbalanced brace does not fail loudly — it fails
 * silently, and it takes the rest of the file with it.
 *
 * This was live on main. One rule inside the mobile nav block lost its closing
 * brace:
 *
 *     @media (max-width: 900px) {
 *       .cnav-signin { display: none;      <- no }
 *     }                                    <- closes the RULE, not the @media
 *
 * The `@media` never closed, so every one of the ~2,890 lines after it — the
 * whole STUDIO section included — parsed as nested inside `max-width: 900px`.
 * Above 900px the studio had no layout at all: the workspace grid collapsed, the
 * swatch tiles rendered as bare inline text, and the "Name your project" step,
 * which is positioned against a canvas panel that no longer had a size, floated
 * transparently over the colour library. Nothing in `next build`, `tsc` or
 * eslint objects to any of it, and the components involved were untouched, so
 * there was nothing to read in a diff either.
 *
 * Braces are the only thing a CSS parser cannot recover from mid-file, which
 * makes them worth one assertion.
 */

const CSS_DIR = "src/app";

/** Blank out comments and quoted strings, keeping newlines so lines still count. */
function blankOutNonCode(css: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out.push(css.slice(i, stop).replace(/[^\n]/g, " "));
      i = stop;
      continue;
    }
    const ch = css[i]!;
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
      const stop = Math.min(j + 1, css.length);
      out.push(css.slice(i, stop).replace(/[^\n]/g, " "));
      i = stop;
      continue;
    }
    out.push(ch);
    i += 1;
  }
  return out.join("");
}

/** Every `{`/`}` in source order, with the nesting depth each one leaves behind. */
function walk(css: string) {
  const code = blankOutNonCode(css);
  let depth = 0;
  let line = 1;
  const unmatchedClosers: number[] = [];
  /** Line numbers on which a block opened at top level, and the depth there. */
  const depthAtLineStart: number[] = [];
  for (const ch of code) {
    if (ch === "\n") {
      line += 1;
      depthAtLineStart[line] = depth;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth < 0) {
        unmatchedClosers.push(line);
        depth = 0;
      }
    }
  }
  depthAtLineStart[1] = 0;
  return { finalDepth: depth, unmatchedClosers, depthAtLineStart };
}

describe("globals.css", () => {
  const css = readFileSync(join(CSS_DIR, "globals.css"), "utf8");

  it("closes every block it opens", () => {
    const { finalDepth, unmatchedClosers } = walk(css);
    expect(unmatchedClosers, "closing braces with nothing open").toEqual([]);
    // A non-zero depth means some rule or at-rule ran to the end of the file
    // swallowing everything after it.
    expect(finalDepth, "unclosed blocks at end of file").toBe(0);
  });

  it("leaves the studio's layout rules unconditional", () => {
    // The sentinels are the rules the bug above silently nested: the workspace
    // grid and the swatch grid. Both must sit at the top level, where they apply
    // at every width, rather than inside somebody's media query.
    const { depthAtLineStart } = walk(css);
    const lines = css.split("\n");
    for (const selector of [".hv-studio-body {", ".hv-studio-swatches {", ".hv-studio-canvas-wrap {"]) {
      const index = lines.findIndex((l) => l.trimStart().startsWith(selector));
      expect(index, `${selector} not found`).toBeGreaterThan(-1);
      expect(depthAtLineStart[index + 1], `${selector} is nested inside another block`).toBe(0);
    }
  });
});

describe("component <style> blocks", () => {
  /** Every `<style>{`…`}</style>` the components inject, by file. */
  function collect(dir: string, found: { file: string; css: string }[] = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) collect(path, found);
      else if (entry.name.endsWith(".tsx")) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(/<style>\{`([\s\S]*?)`\}<\/style>/g)) {
          found.push({ file: path, css: match[1] ?? "" });
        }
      }
    }
    return found;
  }

  // Same failure, smaller blast radius: an unclosed rule here takes out the rest
  // of that one component's styles.
  it("close every block they open", () => {
    const blocks = collect("src");
    expect(blocks.length).toBeGreaterThan(0);
    const broken = blocks
      .filter(({ css }) => walk(css).finalDepth !== 0 || walk(css).unmatchedClosers.length > 0)
      .map(({ file }) => file);
    expect(broken).toEqual([]);
  });
});
