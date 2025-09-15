# Harmony Implementation Plan

**Feature Branch**: `001-build-harmony-a`
**Created**: 2025-09-15
**Status**: Ready for Implementation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [NX Monorepo Structure](#nx-monorepo-structure)
4. [Implementation Phases](#implementation-phases)
5. [Event Flows & API Contracts](#event-flows--api-contracts)
6. [Technology Patterns](#technology-patterns)
7. [Development Workflow](#development-workflow)

---

## Architecture Overview
*Based on system diagram analysis*

### Core Services
- **harmony-web**: CloudFront distribution with multiple BFF origins + Cognito auth
- **event-hub**: EventBridge + Kinesis event backbone
- **harmony-copilot-bff**: AI agent with knowledge base + AppSync endpoint + S3 assets
- **chat-history-bff**: GraphQL API for chat persistence + AppSync endpoint + S3 assets
- **confluence-adapter**: Webhook integration
- **presentation-builder-control**: Async presentation generation

### Key Integration Points
- **Devloop LMS**: External system integration
- **Confluence**: External content source
- **AWS Bedrock**: AI/ML services
- **Cognito**: Multi-tenant authentication

---

## Technology Stack

- **Monorepo**: NX workspace
- **Infrastructure**: AWS CDK with TypeScript
- **Runtime**: Node.js Lambda functions
- **DI Container**: tsyringe
- **Stream Processing**: @scramjet/framework
- **Deployment**: CodePipeline per service
- **Shared Code**: CDK constructor library + lambda-utils npm package
- **Lambda Utils**: Releasable npm library with centralized helper functions

---

## NX Monorepo Structure

```
harmony-system/
├── apps/
│   ├── event-hub/                    # EventBridge + Kinesis infrastructure
│   ├── harmony-web/                  # CloudFront + Cognito + Web UI
│   ├── harmony-copilot-bff/          # AI agent + knowledge base
│   ├── chat-history-bff/             # GraphQL + DynamoDB chat storage
│   ├── confluence-adapter/           # Webhook handler + event publisher
│   └── presentation-builder-control/ # Async presentation generation
├── libs/
│   ├── harmony-cdk-constructs/       # Shared CDK constructor library
│   └── lambda-utils/                 # Releasable npm library with Lambda handler helpers
├── tools/
│   └── pipeline-templates/           # Reusable CodePipeline configs
└── nx.json, package.json, tsconfig.json
```

### Service Structure Template
```typescript
apps/[service-name]/
├── src/
│   ├── infrastructure/
│   │   ├── app.ts                    # CDK Application entry
│   │   ├── stacks/                   # CDK Stack definitions including S3/AppSync
│   │   └── pipeline.ts               # CodePipeline definition
│   ├── handlers/
│   │   ├── event-processor.ts        # @scramjet stream handler
│   │   ├── api-handler.ts            # API Gateway handler
│   │   ├── graphql-resolvers.ts      # AppSync GraphQL resolvers (BFF services)
│   │   └── di-container.ts           # tsyringe DI configuration
│   ├── frontend/                     # Frontend assets for S3 deployment (BFF services)
│   │   ├── dist/                     # Built assets
│   │   └── src/                      # Source frontend code
│   ├── domain/
│   │   ├── services/                 # Business logic services
│   │   ├── models/                   # Domain entities
│   │   └── interfaces/               # Service contracts
│   └── config/
│       └── environment.ts            # Environment configuration
├── test/
├── project.json                      # NX project configuration
└── tsconfig.json
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**libs/harmony-cdk-constructs + libs/lambda-utils + apps/event-hub**

- Shared CDK constructs library
- Lambda utilities npm package with common helpers
- EventBridge + Kinesis event infrastructure
- Event ingress, routing, and archive
- Core monitoring and observability

### Phase 2: Authentication & Web (Week 3-4)
**apps/harmony-web**

- CloudFront distribution with multiple origins:
  - AppSync endpoints (chat-history-bff, harmony-copilot-bff)
  - S3 buckets for frontend assets (per BFF service)
  - API Gateway endpoints (as needed)
- Cognito UserPool with tenantId/role JWT claims
- Web application shell with auth integration
- Centralized routing and caching for all BFF resources

### Phase 3: Chat Infrastructure (Week 5-6)
**apps/chat-history-bff**

- AppSync GraphQL API with auth patterns
- DynamoDB tables (tenant-partitioned)
- Event listeners for ChatThreadUpdated
- Real-time subscriptions

### Phase 4: External Integrations (Week 6)
**apps/confluence-adapter**

- Confluence webhook handlers
- Event publishing to harmony ecosystem
- Tenant context extraction

### Phase 5: AI Copilot Core (Week 7-9)
**apps/harmony-copilot-bff**

- AgentCore AI conversation engine
- Bedrock Knowledge Base (tenant + role partitioned)
- Multi-source content integration
- Citation generation

### Phase 6: Presentation Engine (Week 10-12)
**apps/presentation-builder-control**

- Async AI presentation generation
- HTML slideshow creation
- Multi-format input processing

---

## Event Flows & API Contracts

### Core Event Schema
**Ingress Events:**
- `ConfluencePageCreated` - From Confluence webhooks
- `ChatThreadUpdated` - From copilot interactions
- `PresentationRequested` - From user/copilot requests

**Egress Events:**
- `PresentationCompleted` - Successful generation
- `PresentationFailed` - Generation errors
- `ChatThreadUpdated` - Conversation updates

### GraphQL API (chat-history-bff)
```graphql
type Query {
  listThreads: [ChatThread!]!     # Cognito Auth
  listMessages(threadId: ID!): [Message!]!  # Cognito Auth
}

type Mutation {
  addMessage(input: MessageInput!): Message!  # IAM Auth
}

type Subscription {
  onChatThreadUpdated(threadId: ID!): ChatThread!  # Cognito Auth
}
```

### Authentication Patterns
- **Cognito Auth**: User-facing operations (queries, subscriptions)
- **IAM Auth**: Service-to-service operations (mutations, events)
- **JWT Claims**: `tenantId`, `role` for multi-tenant isolation

### Critical Data Flows
```
1. Chat Flow:
   User → copilot-bff → ChatThreadUpdated → chat-history-bff
                     ↓
          OnChatThreadUpdatedSubscription → User

2. Presentation Flow:
   User → copilot-bff → PresentationRequested → presentation-builder
                                             ↓
                     PresentationCompleted/Failed → User + Knowledge Base

3. Confluence Integration:
   Confluence → confluence-adapter → ConfluencePageCreated → copilot-bff
                                                           ↓
                                                  Knowledge Base Update
```

---

## Technology Patterns

### Dependency Injection (tsyringe)
```typescript
// src/handlers/di-container.ts (per service)
import "reflect-metadata";
import { container } from "tsyringe";

container.register("EventPublisher", EventPublisherService);
container.register("DatabaseService", DynamoDBService);
container.register("KnowledgeBaseService", BedrockService);
```

### Stream Processing (@scramjet/framework)
```typescript
// All event handlers use functional stream processing
@injectable()
class EventProcessor {
  async process(events$: DataStream<Event>): Promise<void> {
    return events$
      .filter(event => this.validateTenant(event))
      .map(event => this.enrichContext(event))
      .do(event => this.processBusinessLogic(event))
      .catch(error => this.handleError(error));
  }
}
```

### Shared CDK Constructs
```typescript
// libs/harmony-cdk-constructs usage
import { HarmonyEventBus, HarmonyAuth } from '@harmony/cdk-constructs';

const eventBus = new HarmonyEventBus(this, 'EventBus', {
  tenantIsolation: true,
  archiveEnabled: true
});
```

### Lambda Utils Library
```typescript
// libs/lambda-utils - Releasable npm package for centralized Lambda helpers
export class ResponseBuilder {
  static success<T>(data: T): APIGatewayProxyResult { /* ... */ }
  static error(statusCode: number, message: string): APIGatewayProxyResult { /* ... */ }
}

export class EventValidator {
  static validateTenant(event: any): boolean { /* ... */ }
  static extractContext(event: any): TenantContext { /* ... */ }
}

export class ErrorHandler {
  static wrapHandler<T>(handler: T): T { /* ... */ }
  static logError(error: Error, context: any): void { /* ... */ }
}

export class MetricsHelper {
  static recordLatency(operation: string, duration: number): void { /* ... */ }
  static incrementCounter(metric: string): void { /* ... */ }
}
```

### Development Workflow
- `nx build [service]` - Build service + dependencies
- `nx deploy [service]` - Deploy via CDK
- `nx test [service]` - Run tests
- `nx affected:deploy` - Deploy only changed services
- `nx publish lambda-utils` - Publish lambda-utils to npm registry

---

## Ready for Implementation

✅ **Architecture analyzed** from system diagram
✅ **Event flows defined** with specific contracts
✅ **Technology stack integrated** (NX/CDK/tsyringe/scramjet)
✅ **Phase-by-phase plan** with dependencies
✅ **Development patterns** established

**Next Step**: Begin Phase 1 - Foundation setup
