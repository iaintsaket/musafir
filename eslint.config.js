// Lint for real mistakes (undefined names, unused code), not style; Prettier handles formatting.
const browser = Object.fromEntries(
  [
    "window",
    "document",
    "location",
    "navigator",
    "localStorage",
    "fetch",
    "AbortSignal",
    "matchMedia",
    "performance",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "console",
    "URL",
    "URLSearchParams",
    "Event",
  ].map((g) => [g, "readonly"]),
);
const node = Object.fromEntries(
  ["process", "console", "fetch", "AbortSignal", "URL", "URLSearchParams", "setTimeout", "WebSocket"].map((g) => [
    g,
    "readonly",
  ]),
);

export default [
  { ignores: ["dist/", "node_modules/", "src/js/data/all-stations.js"] },
  {
    files: ["src/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: browser },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none" }],
      "no-redeclare": "error",
      "no-dupe-keys": "error",
    },
  },
  {
    files: ["scripts/**/*.mjs", "server/**/*.mjs", "test/**/*.mjs", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: node },
    rules: { "no-undef": "error", "no-unused-vars": ["error", { args: "none" }] },
  },
];
