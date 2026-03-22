export function getPrompt(): string {
  return `## Document Type: Deployment and Operations

Generate a deployment and operations document covering how to build, deploy, monitor, and operate the product.

### Sections to Cover

1. **Build Process** — Build commands, output artifacts, build configuration.
2. **Environments** — Development, staging, production. Configuration differences.
3. **Deployment** — Deployment method (containers, serverless, VMs, static hosting). Step-by-step deployment process.
4. **Infrastructure** — Cloud provider, services used, infrastructure-as-code references.
5. **Configuration** — Environment variables, feature flags, runtime configuration.
6. **Monitoring & Logging** — Logging framework, log levels, monitoring tools, alerting.
7. **Health Checks** — Endpoints or mechanisms for verifying system health.
8. **Scaling** — Horizontal/vertical scaling approach, auto-scaling configuration.
9. **Disaster Recovery** — Backup strategy, restore procedures, failover.

### Guidance

- Look for Dockerfiles, docker-compose files, Kubernetes manifests, terraform files.
- Read CI/CD pipeline configurations (GitHub Actions, GitLab CI, etc.).
- Check for environment-specific config files and dotenv patterns.
- Look for logging configuration and monitoring integration code.
- Read health check endpoints and readiness probes.`;
}
