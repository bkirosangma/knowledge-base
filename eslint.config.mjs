import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Test files use createElement directly (not JSX) and must pass children in
    // the props object to satisfy TypeScript's required-prop check on Provider
    // components. The no-children-prop rule is a JSX anti-pattern guard; it
    // doesn't apply to raw createElement calls in .ts test files.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "react/no-children-prop": "off",
    },
  },
  {
    // React Compiler rules ship with eslint-config-next v16 unconditionally, but
    // this project does not use React Compiler. Disable the five rules rather than
    // accumulating noise from patterns (sync-ref, derived-state effects) that are
    // intentional in this codebase.
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/globals": "off",
      // Honour the _-prefix convention for intentionally unused variables/params.
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
      }],
    },
  },
]);

export default eslintConfig;
