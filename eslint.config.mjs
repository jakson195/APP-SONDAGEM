import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "android/**",
    "ios/**",
    ".vercel/**",
    "coverage/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "dist/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
