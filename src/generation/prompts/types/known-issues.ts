export function getPrompt(): string {
  return `## Document Type: Known Issues and Technical Debt

Generate a document identifying known issues, technical debt, and areas of concern in the codebase.

### Sections to Cover

1. **Known Bugs** — Issues evident from TODO/FIXME/HACK comments, error handling gaps, or obvious code problems.
2. **Technical Debt** — Areas where shortcuts were taken, patterns are inconsistent, or refactoring is needed.
3. **Deprecated Dependencies** — Outdated packages, deprecated API usage, version constraints.
4. **Performance Concerns** — N+1 queries, missing indexes, unbounded loops, large payloads.
5. **Security Concerns** — Potential vulnerabilities, missing validation, unsafe patterns (without exposing actual secrets).
6. **Missing Tests** — Areas with low or no test coverage.
7. **Architecture Concerns** — Circular dependencies, tight coupling, missing abstractions.

### Guidance

- Search for TODO, FIXME, HACK, XXX, WORKAROUND comments throughout the codebase.
- Look for suppressed linting rules (eslint-disable, @ts-ignore, noqa).
- Check for deprecated API usage in dependencies.
- Look for error handlers that swallow exceptions silently.
- Identify patterns that differ from the project's conventions.
- Be constructive — frame issues as improvement opportunities, not criticism.
- Prioritize by likely impact (high/medium/low).`;
}
