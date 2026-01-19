
// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from "@eslint/js";
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

import simpleImportSort from "eslint-plugin-simple-import-sort";

const eslintConfig = [{
    ignores: [".next/", "node_modules/", "coverage/", "dist/", "**/*.config.js", "**/*.config.ts", "**/.stryker-tmp/**"]
}, js.configs.recommended, ...tseslint.configs.recommended, {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    plugins: {
        security: security,
        "simple-import-sort": simpleImportSort,
    },
    rules: {
        "no-console": "warn",
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": ["warn", {
            "argsIgnorePattern": "^_",
            "varsIgnorePattern": "^_",
            "caughtErrorsIgnorePattern": "^_"
        }],
        "no-undef": "off",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-require-imports": "off",
        // Import sorting
        "simple-import-sort/imports": "error",
        "simple-import-sort/exports": "error",
        // Security rules
        "security/detect-object-injection": "warn",
        "security/detect-non-literal-regexp": "warn",
        "security/detect-unsafe-regex": "error",
        "security/detect-buffer-noassert": "error",
        "security/detect-child-process": "warn",
        "security/detect-disable-mustache-escape": "error",
        "security/detect-eval-with-expression": "error",
        "security/detect-no-csrf-before-method-override": "error",
        "security/detect-possible-timing-attacks": "warn",
        "security/detect-pseudoRandomBytes": "warn",
    }
}, {
    files: ["e2e/**/*", "scripts/**/*", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
        "no-console": "off",
        // Relax security rules for test files
        "security/detect-object-injection": "off",
        "security/detect-non-literal-regexp": "off",
    }
}, ...storybook.configs["flat/recommended"]];

export default eslintConfig;

