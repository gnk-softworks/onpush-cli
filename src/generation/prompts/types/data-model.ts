export function getPrompt(): string {
  return `## Document Type: Data Model

Generate a data model document covering database schemas, entity relationships, and data management patterns.

### Sections to Cover

1. **Overview** — Database technology (PostgreSQL, MongoDB, etc.), ORM/query builder, schema management approach.
2. **Entity Relationship Diagram** — Mermaid ER diagram showing entities and their relationships.
3. **Entities** — For each entity/table/collection:
   - Name and purpose
   - Fields with types, constraints, and descriptions
   - Relationships (belongs-to, has-many, many-to-many)
   - Indexes
4. **Migration Strategy** — How schema changes are managed (migration files, auto-sync, etc.).
5. **Data Patterns** — Soft deletes, timestamps, audit trails, multi-tenancy, polymorphism.
6. **Caching** — Cache layers, invalidation strategies, TTLs.

### Guidance

- Look for migration files, model definitions, schema files, and ORM configuration.
- Read entity/model classes to understand field types and relationships.
- Check for database configuration files to identify the database engine.
- If the project uses an ODM (Mongoose, Prisma, etc.), read the schema definitions.
- If there is no database, document the primary data structures and storage mechanisms (files, in-memory, external APIs).
- Use Mermaid ER diagrams to visualize relationships.`;
}
