export function getPrompt(): string {
  return `## Document Type: API / SDK Reference

Generate a comprehensive reference document covering APIs, SDKs, CLIs, and any public interfaces the software exposes.

### Sections to Cover

1. **Overview** — What interfaces are available (REST API, GraphQL, gRPC, SDK, CLI, library exports). Base URLs, versioning strategy.
2. **Authentication** — How to authenticate (API keys, OAuth, JWT, SDK client initialization). Include example headers or setup code.
3. **API Endpoints** — For each endpoint/operation:
   - HTTP method and path (or GraphQL operation name)
   - Description
   - Request parameters (path, query, body) with types
   - Response format with example JSON
   - Error responses
   - Authentication requirements
4. **SDK / Library Interface** — For SDKs or libraries:
   - Installation and setup
   - Key classes, methods, and functions with signatures
   - Configuration options
   - Usage examples in relevant languages
5. **CLI Reference** — For CLI tools:
   - Commands and subcommands
   - Flags and options with descriptions
   - Example invocations
6. **Data Schemas** — Shared request/response schemas, type definitions, and models with field descriptions.
7. **Error Handling** — Error response format, error codes, exception types, retry guidance.
8. **Rate Limiting & Quotas** — If applicable, rate limit headers, quotas, and throttling behavior.

### Guidance

- Search for route definitions, controller files, API handlers, and middleware.
- Look for OpenAPI/Swagger specs, GraphQL schemas, or protobuf definitions.
- Read validation schemas (Zod, Joi, class-validator) to understand field constraints.
- Look for SDK client classes, exported functions, and public module interfaces.
- Check for CLI command definitions (Commander, yargs, clap, cobra, etc.).
- Group endpoints/methods by resource or domain area.
- Include realistic example request/response payloads and code snippets.
- Adapt sections to what the project actually exposes — skip sections that don't apply.`;
}
