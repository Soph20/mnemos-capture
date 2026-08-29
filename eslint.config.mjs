import next from "eslint-config-next";

/**
 * Next's own config rather than a separate toolchain: it already knows this
 * project's shape (App Router, React hooks, TypeScript) and adds no competing
 * opinions to argue with. `eslint-config-next` exports a flat-config array.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...next,
];

export default config;
