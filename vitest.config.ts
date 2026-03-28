import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    mockReset: true,
    restoreMocks: true,
    coverage: {
        provider: 'istanbul', // Use Istanbul for coverage
        exclude: ['test/**'],
        reporter: [
            'lcovonly', // Output coverage to coverage/lcov.info
            'text', // Output coverage to console
            ['text', { file: 'report.txt' }], // Output coverage to coverage.txt
        ],
        reportsDirectory: 'coverage',
        thresholds: {
            lines: 100,
            functions: 100,
            branches: 100,
            statements: 100,
        }
    },
  },
});
