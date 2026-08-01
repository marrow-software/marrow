#!/usr/bin/env node
/**
 * Signal token-contract regression guard (#312).
 *
 * A single-surface guard over web/app/globals.css. It fails if any retired
 * identity token reappears, or if any Signal signature token goes missing —
 * the concrete kill-switch against the identity silently drifting back toward
 * the old terracotta/Fraunces look.
 *
 * Deliberately scoped to one file (consistent with #268's "no cross-surface CI
 * conformance check"). Run via `npm run test:tokens`; wired into web CI.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, "..", "app", "globals.css");
const css = readFileSync(cssPath, "utf8");

/** Retired identity — must be ABSENT from the token layer. */
const forbidden = [
  { pattern: "#9a3412", label: "terracotta primary (light)" },
  { pattern: "#e8805c", label: "terracotta primary (dark)" },
  { pattern: "--font-fraunces", label: "Fraunces font variable" },
  { pattern: "--font-heading", label: "serif heading font token" },
  { pattern: "Fraunces", label: "Fraunces font reference" },
  { pattern: "--color-cream", label: "retired cream token" },
  { pattern: "--color-bone", label: "retired bone token" },
  { pattern: "calc(var(--radius)", label: "wide radius-ramp derivation" },
];

/**
 * Signal contract — must be PRESENT in the token layer.
 *
 * `value` entries are matched as raw substrings (colour literals). `token`
 * entries are matched as custom-property *declarations* (`--name:`), so
 * `--s1` matches `--s1:` and never the substring inside `--s10` / `--s11` —
 * the whole named scale is guarded member-by-member, not by a proxy token.
 */
const required = [
  { value: "#0f766e", label: "spruce accent (light)" },
  { value: "#3aa88f", label: "spruce accent (dark)" },
  { token: "--shadow-signature", label: "signature shadow" },
  { token: "--shadow-flat", label: "flat rest-state shadow" },
  { token: "--ease-signature", label: "house easing curve" },
  { token: "--texture-grain", label: "house grain" },
  { token: "--measure", label: "reading measure" },
  { token: "--focus-ring", label: "focus-ring spec" },
  // Text scale (11 → 16)
  ...["2xs", "xs", "sm", "base", "md", "lg"].map((k) => ({
    token: `--text-${k}`,
    label: `text scale (${k})`,
  })),
  // Heading ramp (h1 → h6)
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    token: `--h${n}`,
    label: `heading ramp (h${n})`,
  })),
  // Spacing scale (s1 → s11)
  ...Array.from({ length: 11 }, (_, i) => ({
    token: `--s${i + 1}`,
    label: `spacing scale (s${i + 1})`,
  })),
  // Control heights
  ...["sm", "md", "lg"].map((k) => ({
    token: `--ctl-${k}`,
    label: `control height (${k})`,
  })),
  // Duration scale
  ...["hover", "state", "enter"].map((k) => ({
    token: `--dur-${k}`,
    label: `duration (${k})`,
  })),
];

const failures = [];

for (const { pattern, label } of forbidden) {
  if (css.includes(pattern)) {
    failures.push(`  ✗ retired token present: ${pattern} (${label})`);
  }
}
for (const { token, value, label } of required) {
  // A token must appear as a real declaration (`--name:`); a value as a literal.
  const present = token ? css.includes(`${token}:`) : css.includes(value);
  if (!present) {
    const shown = token ?? value;
    failures.push(`  ✗ Signal token missing: ${shown} (${label})`);
  }
}

if (failures.length > 0) {
  console.error("Signal token-contract guard FAILED (web/app/globals.css):");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Signal token-contract guard passed: ${forbidden.length} retired tokens absent, ${required.length} signature tokens present.`,
);
