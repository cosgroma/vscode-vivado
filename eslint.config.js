// @ts-check
const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const typescriptEslintParser = require('@typescript-eslint/parser');

module.exports = [
    {
        ignores: ['out/**', 'dist/**', '**/*.d.ts']
    },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: typescriptEslintParser,
            parserOptions: {
                ecmaVersion: 6,
                sourceType: 'module'
            }
        },
        plugins: {
            '@typescript-eslint': typescriptEslintPlugin
        },
        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase']
                }
            ],
            'curly': 'warn',
            'eqeqeq': 'warn',
            'no-throw-literal': 'warn',
            'semi': 'off'
        }
    }
];
