import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * ESLint flat config (the ESLint 9+ format; `.eslintrc.json` is legacy).
 *
 * Two entries from `eslint-config-next`, pinned to the exact Next version so
 * the rules don't drift out from under us:
 *
 *   core-web-vitals — React hooks, accessibility, and the Next-specific
 *                     pitfalls (wrong <img>/<a> usage, bad imports)
 *   typescript      — TypeScript rules, notably no-unused-vars
 *
 * Both are needed. The default `eslint-config-next` entry alone leaves unused
 * variables entirely unchecked, which makes the linter look like it's passing
 * when it simply isn't looking.
 *
 * ESLint is pinned to 9.x deliberately: eslint-plugin-react (pulled in here)
 * declares a peer range topping out at ^9.7 and crashes on ESLint 10 with
 * "contextOrFilename.getFilename is not a function".
 *
 * Lint is advisory in CI — it reports but does not fail the build. The baseline
 * is clean, so anything it prints is new.
 */
const config = [
  {
    // Generated, vendored, or build output — nothing here is hand-written.
    ignores: [
      ".next/**",
      "node_modules/**",
      "lib/db/migrations/**", // Drizzle-generated SQL and metadata
      "test-results/**",
      "playwright-report/**",
      "uploads/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
