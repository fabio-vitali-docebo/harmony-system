# Harmony Constitution

## Core Principles

### I. Multi-Tenant Isolation (NON-NEGOTIABLE)
**MUST** enforce strict data isolation between tenants with zero cross-tenant data leakage. Every service, database table, S3 bucket path, and API operation **MUST** include tenant partitioning. Permission inheritance from host LMS **MUST** be honored at every layer. No exceptions.

### II. Test-First Development (NON-NEGOTIABLE)
TDD mandatory: Tests written → User approved → Tests fail → Then implement. Red-Green-Refactor cycle strictly enforced. Contract tests **MUST** exist for all GraphQL operations, event schemas, and external integrations before implementation begins.

### III. Event-Driven Architecture
All inter-service communication **MUST** flow through EventBridge/Kinesis. Services **MUST** be loosely coupled and communicate only through well-defined events. Direct service-to-service API calls are prohibited except for synchronous user-facing operations.

### IV. Microservice Independence
Each NX application **MUST** be independently deployable with its own CDK stack and CI/CD pipeline. Services **MUST NOT** share databases or runtime dependencies. Shared code belongs in libs/ with clear versioning.

### V. Security by Design
Authentication **MUST** use Cognito with JWT claims for tenantId and role. All API operations **MUST** validate user permissions against LMS-inherited access rights. Secrets **MUST** be stored in AWS Parameter Store or Secrets Manager, never in code.

## Architecture Constraints

### Technology Stack Requirements
- **Monorepo**: NX workspace with apps/ and libs/ structure
- **Infrastructure**: AWS CDK with TypeScript for all cloud resources
- **Runtime**: Node.js Lambda functions with TypeScript
- **DI Container**: tsyringe for dependency injection
- **Stream Processing**: @scramjet/framework for event handling
- **External Agents**: Python strands-agents deployed to AWS AgentCore

### Performance Standards
- GraphQL queries **MUST** respond within 200ms for cached data
- Event processing **MUST** complete within 30 seconds
- Lambda cold starts **MUST** be under 2 seconds
- All S3 objects **MUST** use CloudFront for global delivery

### Compliance Requirements
- All tenant data **MUST** support data residency requirements
- Event logs **MUST** be partitioned by tenant with configurable retention
- Cross-tenant analytics **MUST** be anonymized before aggregation
- All external content **MUST** include source attribution and usage rights

## Development Workflow

### Code Review Process
- All PRs **MUST** verify multi-tenant isolation compliance
- Contract tests **MUST** pass before merging implementation
- CDK diffs **MUST** be reviewed for security implications
- Lambda performance metrics **MUST** be within defined limits

### Quality Gates
- Unit test coverage **MUST** be ≥80% for business logic
- Integration tests **MUST** cover all event flows
- Contract tests **MUST** validate all GraphQL schemas
- Security scans **MUST** pass with zero high-severity findings

### Deployment Standards
- Each service **MUST** have independent deployment pipeline
- Rollback strategy **MUST** be tested for each service
- Blue-green deployment **MUST** be used for user-facing services
- Database migrations **MUST** be backward-compatible

## Governance

This constitution supersedes all other development practices and architectural decisions. Any deviation **MUST** be explicitly documented with business justification and technical risk assessment.

All team members **MUST** verify compliance during code reviews. Complexity that violates these principles **MUST** be refactored or architecturally redesigned.

Use the specification workflow commands (`/specify`, `/plan`, `/tasks`, `/implement`) for all feature development to ensure constitutional compliance.

**Version**: 1.0.0 | **Ratified**: 2025-09-23 | **Last Amended**: 2025-09-23