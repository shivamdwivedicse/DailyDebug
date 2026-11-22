import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "max-lines-per-function": ["error", { max: 20, skipBlankLines: true, skipComments: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
