import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Pin React version so eslint-plugin-react 7.37.x doesn't try to auto-detect
  // via the removed `context.getFilename()` API under ESLint 10.
  { settings: { react: { version: "19.2" } } },
  // react-hooks/refs flags @dnd-kit setNodeRef callback-ref usage as "ref access
  // during render" — false positive; setNodeRef is a callback ref, not a read.
  // react-hooks/set-state-in-effect flags legitimate localStorage-hydration effects
  // (e.g. initialising openMap from storage on mount). Both rules are too strict
  // for this codebase.
  {
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
