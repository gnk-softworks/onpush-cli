export function getPrompt(): string {
  return `## Document Type: Product Overview

Generate a high-level product overview document that helps someone new understand what this software does and why it exists.

### Sections to Cover

1. **Purpose** — What problem does this software solve? What is its core value proposition?
2. **Key Features** — Major capabilities and functionality. Group logically.
3. **Target Audience** — Who uses this? What are the primary user personas?
4. **How It Works** — High-level explanation of the system's approach (not implementation details).
5. **Technology Stack** — Languages, frameworks, major dependencies — with brief rationale where non-obvious.
6. **Project Structure** — Top-level directory layout and what each area contains.

### Guidance

- Read the README, package manifests, and entry points to understand the project's purpose.
- Look at route definitions, CLI commands, or UI components to identify features.
- Keep the tone informative and accessible — this doc is for onboarding, not deep architecture.
- Avoid implementation details that belong in Architecture or Developer Guide docs.
- If the project has a clear domain (e-commerce, devtools, data pipeline, etc.), frame features in domain terms.`;
}
