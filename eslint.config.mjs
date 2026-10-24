import eslint from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import jsxA11y from "eslint-plugin-jsx-a11y";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

// typescript-eslint does not support TypeScript 7 yet, which this repo typechecks with.
// Babel parses TypeScript so jsx-a11y can still fail the build.
// When typescript-eslint allows TypeScript 7, replace this parser. See
// .claude/rules/typescript-eslint.md. Do not downgrade TypeScript.
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "apps/api/src/generated/**",
      "apps/web/next-env.d.ts",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [["@babel/preset-react", { runtime: "automatic" }], "@babel/preset-typescript"],
        },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Type-only imports look unused to a non-type-aware parser.
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    // The scripts are plain JavaScript that Node runs, so they need the Node globals.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/web/**/*.{jsx,tsx}"],
    plugins: {
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      // Links go through Next's Link component, which this rule does not understand.
      "jsx-a11y/anchor-is-valid": "off",
    },
  },
  eslintConfigPrettier,
];
