import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  tests: [
    {
      files: 'out/test/**/*.test.js',
    },
  ],
  coverage: {
    include: ['src/**/*.ts'],
    exclude: ['src/test/**'],
    includeAll: true,
    reporter: ['text-summary', 'json-summary', 'lcov', 'html'],
    output: './coverage',
  },
});
