
import js from "@eslint/js";
import tseslint from 'typescript-eslint';

const eslintConfig = [
    {
        ignores: [".next/", "node_modules/", "coverage/", "dist/", "**/*.config.js", "**/*.config.ts"]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
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
            "@typescript-eslint/no-require-imports": "off"
        }
    },
    {
        files: ["e2e/**/*", "scripts/**/*", "**/*.test.ts", "**/*.spec.ts"],
        rules: {
            "no-console": "off"
        }
    }
];

export default eslintConfig;
