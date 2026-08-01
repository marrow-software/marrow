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

/** Signal contract — must be PRESENT in the token layer. */
const required = [
  { pattern: "#0f766e", label: "spruce accent (light)" },
  { pattern: "#3aa88f", label: "spruce accent (dark)" },
  { pattern: "--shadow-signature", label: "signature shadow" },
  { pattern: "--shadow-flat", label: "flat rest-state shadow" },
  { pattern: "--ease-signature", label: "house easing curve" },
  { pattern: "--texture-grain", label: "house grain" },
  { pattern: "--measure", label: "reading measure" },
  // Text scale
  { pattern: "--text-2xs", label: "text scale (2xs)" },
  { pattern: "--text-base", label: "text scale (base)" },
  { pattern: "--text-md", label: "text scale (md)" },
  { pattern: "--text-lg", label: "text scale (lg)" },
  // Heading ramp
  { pattern: "--h1", label: "heading ramp (h1)" },
  { pattern: "--h6", label: "heading ramp (h6)" },
  // Spacing scale
  { pattern: "--s1", label: "spacing scale (s1)" },
  { pattern: "--s11", label: "spacing scale (s11)" },
  // Control heights
  { pattern: "--ctl-sm", label: "control height (sm)" },
  { pattern: "--ctl-md", label: "control height (md)" },
  { pattern: "--ctl-lg", label: "control height (lg)" },
  // Duration scale
  { pattern: "--dur-hover", label: "duration (hover)" },
  { pattern: "--dur-state", label: "duration (state)" },
  { pattern: "--dur-enter", label: "duration (enter)" },
];

const failures = [];

for (const { pattern, label } of forbidden) {
  if (css.includes(pattern)) {
    failures.push(`  ✗ retired token present: ${pattern} (${label})`);
  }
}
for (const { pattern, label } of required) {
  if (!css.includes(pattern)) {
    failures.push(`  ✗ Signal token missing: ${pattern} (${label})`);
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
