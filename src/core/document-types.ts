import type { OnPushConfig } from "./config.js";

export interface DocumentType {
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  prompt?: string;
  model?: string;
}

export interface DefaultDocumentType {
  slug: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
}

export const DEFAULT_DOCUMENT_TYPES: DefaultDocumentType[] = [
  {
    slug: "product-overview",
    name: "Product Overview",
    description:
      "High-level product description, purpose, audience, and key features",
    defaultEnabled: true,
  },
  {
    slug: "architecture",
    name: "Architecture / System Design Document",
    description:
      "System architecture, components, design decisions, data flow, and technology stack",
    defaultEnabled: true,
  },
  {
    slug: "api-reference",
    name: "API / SDK Reference",
    description:
      "API endpoints, SDK interfaces, schemas, auth requirements, and usage examples",
    defaultEnabled: true,
  },
  {
    slug: "business-overview",
    name: "Business Overview",
    description:
      "Business context, domain model, key workflows, and stakeholder value",
    defaultEnabled: true,
  },
  {
    slug: "security",
    name: "Security",
    description:
      "Auth mechanisms, encryption, secrets management, and compliance",
    defaultEnabled: true,
  },
  {
    slug: "testing",
    name: "Testing",
    description:
      "Testing strategy, frameworks, coverage, and quality assurance practices",
    defaultEnabled: true,
  },
  {
    slug: "data-model",
    name: "Data Model",
    description:
      "Database schemas, entity relationships, and migration patterns",
    defaultEnabled: false,
  },
  {
    slug: "deployment",
    name: "Deployment and Operations",
    description: "Build, deploy, monitor, and operate the product",
    defaultEnabled: false,
  },
  {
    slug: "known-issues",
    name: "Known Issues and Technical Debt",
    description:
      "Potential problems, TODOs, deprecated deps, and architectural concerns",
    defaultEnabled: false,
  },
];

/** Canonical ordering for single-file merge */
export const DOCUMENT_TYPE_ORDER: string[] = DEFAULT_DOCUMENT_TYPES.map(
  (t) => t.slug
);

export type { OnPushConfig } from "./config.js";

/**
 * Resolves enabled document types from config, merging defaults with config
 * overrides and custom types.
 */
export function resolveEnabledTypes(config: OnPushConfig): DocumentType[] {
  const types: DocumentType[] = [];

  for (const defaultType of DEFAULT_DOCUMENT_TYPES) {
    const override = config.types[defaultType.slug];
    if (override) {
      if (override.enabled) {
        types.push({
          slug: defaultType.slug,
          name: override.name ?? defaultType.name,
          description: defaultType.description,
          enabled: true,
          prompt: override.prompt,
          model: override.model,
        });
      }
    } else if (defaultType.defaultEnabled) {
      types.push({
        slug: defaultType.slug,
        name: defaultType.name,
        description: defaultType.description,
        enabled: true,
      });
    }
  }

  for (const custom of config.custom_types) {
    types.push({
      slug: custom.slug,
      name: custom.name,
      description: custom.description,
      enabled: true,
      prompt: custom.prompt,
    });
  }

  return types;
}

export function getTypeBySlug(
  slug: string,
  types: DocumentType[]
): DocumentType | undefined {
  return types.find((t) => t.slug === slug);
}
