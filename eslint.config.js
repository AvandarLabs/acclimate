import jseslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { flatConfigs as importXConfigs } from "eslint-plugin-import-x";
import eslintPluginUnusedImports from "eslint-plugin-unused-imports";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const tsRules = {
  "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
  "@typescript-eslint/explicit-module-boundary-types": "error",
  "@typescript-eslint/no-shadow": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
  ],
  "@typescript-eslint/no-misused-promises": [
    "error",
    {
      checksVoidReturn: false,
    },
  ],
  "@typescript-eslint/only-throw-error": [
    "error",
    {
      allow: [
        {
          from: "package",
          name: "Redirect",
          package: "@tanstack/router-core",
        },
        {
          from: "package",
          name: "Redirect",
          package: "@tanstack/react-router",
        },
      ],
    },
  ],
  "arrow-body-style": ["error", "always"],
  camelcase: "off",
  "import-x/extensions": [
    "error",
    "ignorePackages",
    {
      js: "never",
      mjs: "never",
      cjs: "never",
      ts: "never",
      tsx: "never",
    },
  ],
  "import-x/no-duplicates": "error",
  "max-len": [
    "error",
    {
      code: 80,
      tabWidth: 2,
      comments: 80,
      ignorePattern: "^import\\s.+\\sfrom\\s.+;$",
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreRegExpLiterals: true,
      ignoreTemplateLiterals: true,
    },
  ],
  // we use the tseslint no-shadow rule instead
  "no-shadow": "off",

  // we use the tseslint no-unused-vars rule instead
  "no-unused-vars": "off",

  // we use the @ianvs/prettier-plugin-sort-imports plugin instead
  "sort-imports": "off",
};

export default [
  importXConfigs.recommended,
  { ignores: ["dist", "node_modules"] },
  {
    files: ["**/*.{js,cjs,mjs}"],
    ...jseslint.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    rules: {
      "max-len": tsRules["max-len"],
    },
  },
  ...defineConfig({
    files: [
      "src/**/*.ts",
      "tests/**/*.ts",
      "examples/**/*.ts",
      "scripts/**/*.ts",
    ],
    extends: [
      jseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    plugins: {
      "unused-imports": eslintPluginUnusedImports,
    },
    rules: tsRules,
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          project: ["tsconfig.json"],
          alwaysTryTypes: true,
        }),
      ],
    },
  }),
  eslintConfigPrettier,
];
