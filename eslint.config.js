// @ts-check
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
    {
        ignores: ["out/**", "dist/**", "**/*.d.ts"]
    },
    {
        files: ["src/**/*.ts"],
        plugins: {
            "@typescript-eslint": tseslint
        },
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 6,
                sourceType: "module"
            }
        },
        rules: {
            "@typescript-eslint/naming-convention": [
                "warn",
                {
                    "selector": "import",
                    "format": ["camelCase", "PascalCase"]
                }
            ],
            "curly": "warn",
            "eqeqeq": "warn",
            "no-throw-literal": "warn"
        }
    }
];
