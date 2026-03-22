export function getPrompt(): string {
  return `## Document Type: Business Overview

Generate a business overview document that explains the business context, domain model, key workflows, and the value the software delivers to stakeholders.

### Sections to Cover

1. **Business Context** — What business problem does this software solve? What market or organizational need does it address?
2. **Domain Model** — Key business entities, their relationships, and domain terminology. Use a Mermaid diagram for entity relationships where helpful.
3. **Key Workflows** — Primary business processes the software enables (e.g., user onboarding, order fulfillment, data ingestion). Include Mermaid flowcharts for complex workflows.
4. **Stakeholder Value** — How different stakeholders (end users, admins, business operators) benefit from the software.
5. **Business Rules** — Domain-specific rules, validations, and constraints that enforce business logic.
6. **Integrations** — External services and systems the software interacts with from a business perspective (payment providers, CRMs, analytics, etc.).
7. **Revenue & Growth Model** — If applicable, how the software supports monetization, pricing tiers, or growth metrics.

### Guidance

- Read README, product documentation, and marketing-related content for business context.
- Look for domain models, entity definitions, and business logic in service layers.
- Search for workflow orchestration, state machines, and multi-step business processes.
- Identify webhook handlers, event listeners, and integration points with external services.
- Focus on business language and domain terms rather than technical implementation details.
- Use Mermaid diagrams for complex workflows and entity relationships.
- Frame everything in terms of business value and user outcomes.`;
}
