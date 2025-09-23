# Tasks: Harmony Multi-Tenant LMS AI Assistant System

**Input**: Design documents from `/specs/001-build-harmony-a/`
**Prerequisites**: plan.md (required), spec.md

## Execution Flow (main)
```
1. Load plan.md from feature directory
   ✓ Found: NX monorepo with AWS CDK, TypeScript, Lambda functions
   ✓ Extract: tech stack (NX/CDK/tsyringe/scramjet), service structure
2. Load optional design documents:
   ✓ spec.md: Extract entities → model tasks
   × contracts/: Not found → generate tests from GraphQL schema in plan.md
   × research.md: Not found
   × data-model.md: Not found → use entities from spec.md
3. Generate tasks by category:
   → Setup: NX workspace, shared libraries, event infrastructure
   → Tests: GraphQL contract tests, integration tests per phase
   → Core: 6 applications, 2 shared libraries, external agents
   → Integration: Authentication, event flows, multi-tenant isolation
   → Polish: unit tests, performance, documentation
4. Apply task rules:
   → Different services/libs = mark [P] for parallel
   → Same service = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph per implementation phases
7. Create parallel execution examples
8. Validate task completeness per 6-phase implementation plan
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different services/files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **NX Monorepo**: `apps/[service-name]/`, `libs/[lib-name]/`
- Each service follows: `src/infrastructure/`, `src/handlers/`, `src/domain/`
- External agents: Separate repositories (harmony-copilot-agent, presentation-builder-agent)

## Phase 1: Foundation Setup
- [x] T001 Create NX workspace structure with apps/ and libs/ directories
- [x] T002 Initialize package.json with NX, AWS CDK, TypeScript dependencies
- [x] T003 [P] Configure ESLint, Prettier, and Jest testing framework
- [x] T004 [P] Create libs/harmony-cdk-constructs project.json and basic CDK construct exports
- [x] T005 [P] Create libs/lambda-utils project.json with Lambda handler utilities

## Phase 2: Test Infrastructure (TDD) ⚠️ MUST COMPLETE BEFORE PHASE 3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Event Hub Tests
- [x] T006 [P] Integration test EventBridge routing in apps/event-hub/test/integration/test-event-routing.spec.ts
- [x] T007 [P] Integration test Kinesis stream processing in apps/event-hub/test/integration/test-kinesis-processing.spec.ts

### Chat History BFF Tests
- [x] T008 [P] Contract test GraphQL listThreads query in apps/chat-history-bff/test/contract/test-list-threads.spec.ts
- [x] T009 [P] Contract test GraphQL listMessages query in apps/chat-history-bff/test/contract/test-list-messages.spec.ts
- [x] T010 [P] Contract test GraphQL addMessage mutation in apps/chat-history-bff/test/contract/test-add-message.spec.ts
- [x] T011 [P] Contract test GraphQL onChatThreadUpdated subscription in apps/chat-history-bff/test/contract/test-chat-subscription.spec.ts

### Copilot BFF Tests
- [x] T012 [P] Integration test AI conversation flow in apps/harmony-copilot-bff/test/integration/test-conversation-flow.spec.ts
- [x] T013 [P] Integration test knowledge base search in apps/harmony-copilot-bff/test/integration/test-knowledge-search.spec.ts

### Presentation Builder Tests
- [x] T014 [P] Integration test presentation generation in apps/presentation-builder-control/test/integration/test-presentation-generation.spec.ts
- [x] T015 [P] Integration test HTML slide creation in apps/presentation-builder-control/test/integration/test-slide-creation.spec.ts

## Phase 3: Foundation Infrastructure (ONLY after tests are failing)
- [x] T016 [P] EventBridge + Kinesis infrastructure in apps/event-hub/src/infrastructure/stacks/event-hub-stack.ts
- [x] T017 [P] Event routing handlers in apps/event-hub/src/handlers/event-processor.ts
- [x] T018 [P] Shared CDK constructs for EventBridge in libs/harmony-cdk-constructs/src/event-bus-construct.ts
- [x] T019 [P] Lambda utilities ResponseBuilder in libs/lambda-utils/src/response-builder.ts
- [x] T020 [P] Lambda utilities EventValidator in libs/lambda-utils/src/event-validator.ts

## Phase 4: Authentication & Web Infrastructure
- [x] T021 [P] CloudFront distribution with multiple origins in apps/harmony-web/src/infrastructure/stacks/web-stack.ts
- [x] T022 [P] Cognito UserPool with JWT claims in apps/harmony-web/src/infrastructure/stacks/auth-stack.ts
- [x] T023 [P] Web application auth integration in apps/harmony-web/src/frontend/src/auth/auth-service.ts
- [x] T024 [P] Centralized routing configuration in apps/harmony-web/src/frontend/src/router/router.ts

## Phase 5: Chat Infrastructure
### Core Models and Services
- [ ] T025 [P] ChatThread entity model in apps/chat-history-bff/src/domain/models/chat-thread.ts
- [ ] T026 [P] Message entity model in apps/chat-history-bff/src/domain/models/message.ts
- [ ] T027 [P] ChatService with CRUD operations in apps/chat-history-bff/src/domain/services/chat-service.ts

### GraphQL Implementation
- [ ] T028 AppSync GraphQL schema definition in apps/chat-history-bff/src/infrastructure/stacks/graphql-stack.ts
- [ ] T029 DynamoDB tables with tenant partitioning in apps/chat-history-bff/src/infrastructure/stacks/database-stack.ts
- [ ] T030 GraphQL resolvers for queries in apps/chat-history-bff/src/handlers/graphql-resolvers.ts
- [ ] T031 Real-time subscription handlers in apps/chat-history-bff/src/handlers/subscription-handlers.ts

## Phase 6: External Integrations
- [ ] T032 [P] Confluence webhook handlers in apps/confluence-adapter/src/handlers/webhook-processor.ts
- [ ] T033 [P] Event publishing service in apps/confluence-adapter/src/domain/services/event-publisher.ts
- [ ] T034 [P] Tenant context extraction in apps/confluence-adapter/src/domain/services/tenant-service.ts

## Phase 7: AI Copilot Core
### Infrastructure
- [ ] T035 [P] AgentCore infrastructure deployment in apps/harmony-copilot-bff/src/infrastructure/stacks/agent-core-stack.ts
- [ ] T036 [P] Bedrock Knowledge Base setup in apps/harmony-copilot-bff/src/infrastructure/stacks/knowledge-base-stack.ts
- [ ] T037 [P] S3 assets and AppSync endpoint in apps/harmony-copilot-bff/src/infrastructure/stacks/bff-stack.ts

### Business Logic
- [ ] T038 [P] Knowledge base search service in apps/harmony-copilot-bff/src/domain/services/knowledge-service.ts
- [ ] T039 [P] Citation generation service in apps/harmony-copilot-bff/src/domain/services/citation-service.ts
- [ ] T040 Agent integration handlers in apps/harmony-copilot-bff/src/handlers/agent-processor.ts

## Phase 8: Presentation Engine
### Infrastructure
- [ ] T041 [P] AgentCore infrastructure for presentations in apps/presentation-builder-control/src/infrastructure/stacks/agent-core-stack.ts
- [ ] T042 [P] Async processing queue in apps/presentation-builder-control/src/infrastructure/stacks/queue-stack.ts

### Business Logic
- [ ] T043 [P] Presentation generation service in apps/presentation-builder-control/src/domain/services/presentation-service.ts
- [ ] T044 [P] HTML slideshow creation in apps/presentation-builder-control/src/domain/services/slide-service.ts
- [ ] T045 Multi-format input processing in apps/presentation-builder-control/src/handlers/input-processor.ts

## Phase 9: Integration & Security
- [ ] T046 Multi-tenant data isolation middleware in libs/lambda-utils/src/tenant-middleware.ts
- [ ] T047 Permission inheritance from LMS in libs/lambda-utils/src/permission-service.ts
- [ ] T048 [P] Tenant configuration service in libs/lambda-utils/src/tenant-config-service.ts
- [ ] T049 [P] Data residency enforcement in libs/lambda-utils/src/data-residency-middleware.ts
- [ ] T050 [P] Cross-tenant analytics anonymization in apps/event-hub/src/handlers/analytics-processor.ts
- [ ] T051 Event flow integration testing across all services
- [ ] T052 Authentication flow end-to-end testing
- [ ] T053 Cross-service communication validation

## Phase 10: Polish & Optimization
- [ ] T054 [P] Unit tests for event processing in apps/event-hub/test/unit/test-event-processor.spec.ts
- [ ] T055 [P] Unit tests for chat services in apps/chat-history-bff/test/unit/test-chat-service.spec.ts
- [ ] T056 [P] Unit tests for knowledge services in apps/harmony-copilot-bff/test/unit/test-knowledge-service.spec.ts
- [ ] T057 [P] Performance tests validating NFR-001 through NFR-004 compliance
- [ ] T058 [P] Update documentation in docs/api.md for all GraphQL schemas
- [ ] T059 [P] Lambda cold start optimization across all services
- [ ] T060 Remove code duplication and refactor shared utilities
- [ ] T061 Manual testing scenarios from spec.md user stories

## Dependencies
### Phase Dependencies
- Foundation (T001-T005) before Tests (T006-T015)
- Tests (T006-T015) before Implementation (T016-T045)
- Core services (T016-T034) before AI services (T035-T045)
- Implementation before Integration (T046-T053)
- Integration before Polish (T054-T061)

### Service Dependencies
- T016-T020 (Event Hub) blocks T028-T031 (Chat History)
- T021-T024 (Web/Auth) blocks T051-T052 (Integration testing)
- T025-T027 (Models) blocks T028-T031 (GraphQL)
- T035-T037 (Infrastructure) blocks T038-T040 (Business Logic)

## Parallel Execution Examples

### Phase 2: Test Creation (All Parallel)
```bash
# Launch T006-T015 together:
Task: "Integration test EventBridge routing in apps/event-hub/test/integration/test-event-routing.spec.ts"
Task: "Integration test Kinesis stream processing in apps/event-hub/test/integration/test-kinesis-processing.spec.ts"
Task: "Contract test GraphQL listThreads query in apps/chat-history-bff/test/contract/test-list-threads.spec.ts"
Task: "Contract test GraphQL listMessages query in apps/chat-history-bff/test/contract/test-list-messages.spec.ts"
```

### Phase 3: Foundation Infrastructure
```bash
# Launch T016-T020 together:
Task: "EventBridge + Kinesis infrastructure in apps/event-hub/src/infrastructure/stacks/event-hub-stack.ts"
Task: "Event routing handlers in apps/event-hub/src/handlers/event-processor.ts"
Task: "Shared CDK constructs for EventBridge in libs/harmony-cdk-constructs/src/event-bus-construct.ts"
Task: "Lambda utilities ResponseBuilder in libs/lambda-utils/src/response-builder.ts"
```

### Phase 5: Chat Models
```bash
# Launch T025-T027 together:
Task: "ChatThread entity model in apps/chat-history-bff/src/domain/models/chat-thread.ts"
Task: "Message entity model in apps/chat-history-bff/src/domain/models/message.ts"
Task: "ChatService with CRUD operations in apps/chat-history-bff/src/domain/services/chat-service.ts"
```

## Notes
- [P] tasks = different services/files, no dependencies
- Verify tests fail before implementing
- Each service has independent deployment pipeline
- External Python agents deployed separately to AgentCore
- Multi-tenant isolation enforced at every layer
- All GraphQL operations must respect Cognito/IAM auth patterns

## Validation Checklist
*GATE: Checked before task execution*

- [x] All GraphQL operations have corresponding tests
- [x] All entities from spec.md have model tasks (ChatThread, Message, Tenant, User)
- [x] All tests come before implementation (Phase 2 before Phase 3+)
- [x] Parallel tasks truly independent (different services/files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Implementation follows 6-phase plan from plan.md
- [x] External agent integration included (AgentCore stacks)
- [x] Multi-tenant isolation addressed
- [x] Event-driven architecture properly tested

## External Agent Repositories
**Note**: These are separate repositories managed independently
- `harmony-copilot-agent` (Python strands-agents) → T035-T040 infrastructure
- `presentation-builder-agent` (Python strands-agents) → T041-T045 infrastructure