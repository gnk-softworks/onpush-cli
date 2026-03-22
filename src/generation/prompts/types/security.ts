export function getPrompt(): string {
  return `## Document Type: Security

Generate a security document covering authentication, authorization, data protection, and security practices.

### Sections to Cover

1. **Authentication** — Auth mechanisms (JWT, OAuth2, API keys, session cookies). Flow diagrams where helpful.
2. **Authorization** — Permission model (RBAC, ABAC, ACLs). How access control is enforced.
3. **Data Protection** — Encryption at rest and in transit. Sensitive data handling.
4. **Secrets Management** — How secrets, API keys, and credentials are stored and accessed.
5. **Input Validation** — Sanitization, validation libraries, protection against injection.
6. **Security Headers & Middleware** — CORS, CSP, rate limiting, CSRF protection.
7. **Dependency Security** — Audit tools, update policies, known vulnerability handling.

### Guidance

- Search for auth middleware, guard files, permission checks, and security configuration.
- Look for encryption utilities, hashing functions, and token generation.
- Check environment variable usage for secrets management patterns.
- Read middleware pipelines for security-related middleware.
- Look for input validation schemas and sanitization functions.
- IMPORTANT: Do NOT include actual secrets, API keys, passwords, or tokens in the documentation. Document the *patterns* and *mechanisms*, not the values.`;
}
