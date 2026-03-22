export function getPrompt(): string {
  return `## Document Type: Testing

Generate a testing document that covers the project's testing strategy, frameworks, patterns, and quality assurance practices.

### Sections to Cover

1. **Testing Strategy** — Overall approach to testing (unit, integration, e2e, manual). What level of coverage is targeted and why.
2. **Test Frameworks & Tools** — Testing frameworks, assertion libraries, mocking tools, and test runners in use.
3. **Test Organization** — How tests are structured in the codebase. Naming conventions, directory layout, and file patterns.
4. **Unit Tests** — Approach to unit testing. What is unit tested, common patterns, mocking strategies.
5. **Integration Tests** — How integration tests are set up. Database fixtures, API testing, service-level tests.
6. **End-to-End Tests** — E2E test setup, browser automation tools, test environments, and data seeding.
7. **CI/CD Integration** — How tests are run in CI. Pipeline stages, parallelization, and failure handling.
8. **Test Data & Fixtures** — How test data is managed. Factories, fixtures, seeders, and cleanup strategies.
9. **Coverage & Quality Gates** — Coverage thresholds, linting rules, type checking, and other quality enforcement.

### Guidance

- Search for test configuration files (jest.config, vitest.config, pytest.ini, .mocharc, etc.).
- Look at test directories and files to understand patterns and conventions.
- Check CI/CD configuration for test-related pipeline steps.
- Read package manifests for test-related dependencies.
- Identify test utilities, helpers, and shared fixtures.
- Look for coverage configuration and reporting setup.
- Adapt sections to what the project actually uses — skip sections that don't apply.`;
}
