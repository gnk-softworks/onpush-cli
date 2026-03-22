export function getPrompt(): string {
  return `## Document Type: Architecture / System Design Document

Generate a comprehensive system design and architecture document that explains how the software is structured, the design decisions behind it, and how its components interact.

### Sections to Cover

1. **Architecture Overview** — High-level description of the system architecture pattern (monolith, microservices, serverless, etc.) and the design philosophy.
2. **Component Diagram** — Use a Mermaid diagram to show major components and their relationships.
3. **Core Components** — Describe each major module/service/package, its responsibility, and key interfaces.
4. **Data Flow** — How data moves through the system. Include a Mermaid sequence or flowchart diagram for key flows.
5. **System Design Decisions** — Key architectural and design decisions with their rationale, trade-offs considered, and alternatives rejected (where inferable from the code).
6. **External Dependencies** — Third-party services, APIs, databases, message queues, and why they were chosen.
7. **Scalability & Performance** — Design considerations for scaling, caching strategies, and performance-critical paths.
8. **Directory Structure** — Map the codebase organization to architectural components.

### Guidance

- Explore the top-level directory structure, entry points, and module boundaries.
- Trace key request/data paths from entry to response.
- Look for dependency injection, service registries, or module registrations.
- Identify patterns: MVC, hexagonal, event-driven, CQRS, etc.
- Document design trade-offs and constraints that shaped the architecture.
- Use Mermaid diagrams where they add clarity — don't force them where text suffices.
- Focus on the "why" of architectural and design choices, not just the "what".`;
}
