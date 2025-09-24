# Harmony System API Documentation

## Overview

The Harmony Multi-Tenant LMS AI Assistant System provides GraphQL APIs for chat history management, AI copilot interactions, and knowledge base search across multiple tenant environments.

## Authentication

All GraphQL operations require proper authentication:

- **Cognito Auth**: User-facing operations (queries, subscriptions)
- **IAM Auth**: Service-to-service operations (mutations, events)
- **JWT Claims**: Include `tenantId` and `role` for multi-tenant isolation

### Required Headers

```
Authorization: Bearer <jwt-token>
X-Tenant-ID: <tenant-id>
```

## Chat History BFF API

**Endpoint**: `/graphql/chat-history`

### Queries

#### `listThreads`
List chat threads for the authenticated user.

```graphql
query ListThreads($filter: ChatThreadFilterInput) {
  listThreads(filter: $filter) {
    items {
      id
      title
      status
      messageCount
      createdAt
      updatedAt
    }
    nextToken
  }
}
```

**Parameters:**
- `filter` (optional): Filter criteria for threads

**Returns:** Paginated list of chat threads

#### `listMessages`
Retrieve messages from a specific chat thread.

```graphql
query ListMessages($threadId: ID!, $filter: MessageFilterInput) {
  listMessages(threadId: $threadId, filter: $filter) {
    items {
      id
      content
      role
      citations {
        id
        title
        url
      }
      createdAt
    }
    nextToken
  }
}
```

**Parameters:**
- `threadId` (required): Thread identifier
- `filter` (optional): Message filter criteria

**Returns:** Paginated list of messages

### Mutations

#### `addMessage`
Add a new message to a chat thread.

```graphql
mutation AddMessage($input: MessageInput!) {
  addMessage(input: $input) {
    id
    content
    role
    citations {
      title
      url
    }
    createdAt
  }
}
```

**Parameters:**
- `input.threadId` (required): Target thread ID
- `input.content` (required): Message content
- `input.role` (required): USER | ASSISTANT | SYSTEM
- `input.citations` (optional): Source citations

**Returns:** Created message

### Subscriptions

#### `onChatThreadUpdated`
Real-time updates for chat thread changes.

```graphql
subscription OnChatThreadUpdated($threadId: ID!) {
  onChatThreadUpdated(threadId: $threadId) {
    id
    messageCount
    lastMessageAt
    updatedAt
  }
}
```

**Parameters:**
- `threadId` (required): Thread to monitor

**Returns:** Updated thread information

## Harmony Copilot BFF API

**Endpoint**: `/graphql/copilot`

### Queries

#### `searchKnowledge`
Search across knowledge base and tenant content.

```graphql
query SearchKnowledge($input: KnowledgeSearchInput!) {
  searchKnowledge(input: $input) {
    query
    results {
      id
      title
      content
      url
      relevanceScore
      source
      highlights
    }
    totalResults
    processingTimeMs
  }
}
```

**Parameters:**
- `input.query` (required): Search query string
- `input.scope` (optional): PRODUCT_DOCS | TENANT_CONTENT | ALL
- `input.maxResults` (optional): Maximum results (default: 10)

**Returns:** Search results with relevance scores

#### `getConversation`
Retrieve conversation history with AI agent.

```graphql
query GetConversation($conversationId: ID!) {
  getConversation(conversationId: $conversationId) {
    id
    title
    status
    messages {
      id
      role
      content
      citations {
        title
        url
      }
    }
    createdAt
  }
}
```

### Mutations

#### `startConversation`
Initiate new conversation with AI copilot.

```graphql
mutation StartConversation($input: StartConversationInput!) {
  startConversation(input: $input) {
    id
    title
    status
    context {
      currentPage
      userRole
    }
    createdAt
  }
}
```

**Parameters:**
- `input.title` (optional): Conversation title
- `input.context` (optional): User context information

#### `sendMessage`
Send message to AI copilot.

```graphql
mutation SendMessage($input: SendMessageInput!) {
  sendMessage(input: $input) {
    id
    content
    citations {
      title
      url
      source
    }
    metadata {
      processingTimeMs
      confidence
    }
    timestamp
  }
}
```

**Parameters:**
- `input.conversationId` (required): Target conversation
- `input.content` (required): Message content
- `input.context` (optional): Additional context

### Subscriptions

#### `onMessageReceived`
Real-time AI responses.

```graphql
subscription OnMessageReceived($conversationId: ID!) {
  onMessageReceived(conversationId: $conversationId) {
    id
    role
    content
    citations {
      title
      url
    }
    timestamp
  }
}
```

## Data Models

### ChatThread
```graphql
type ChatThread {
  id: ID!
  tenantId: String!
  userId: String!
  title: String!
  status: ChatThreadStatus!
  context: ChatContext
  messageCount: Int!
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

enum ChatThreadStatus {
  ACTIVE
  ARCHIVED
  CLOSED
}
```

### Message
```graphql
type Message {
  id: ID!
  threadId: String!
  content: String!
  role: MessageRole!
  citations: [Citation!]!
  createdAt: AWSDateTime!
  isEdited: Boolean!
}

enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
}
```

### Citation
```graphql
type Citation {
  id: ID!
  url: String!
  title: String!
  source: CitationSource!
  timestamp: AWSDateTime!
  relevanceScore: Float
}

enum CitationSource {
  PRODUCT_DOCS
  TENANT_CONTENT
  WEB_SEARCH
  KNOWLEDGE_BASE
}
```

## Error Handling

### Standard Error Format
```json
{
  "errors": [
    {
      "message": "Access denied",
      "extensions": {
        "code": "FORBIDDEN",
        "tenantId": "tenant-001"
      }
    }
  ]
}
```

### Common Error Codes
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Invalid input data
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `TENANT_ISOLATION_VIOLATION`: Cross-tenant access attempt

## Rate Limits

- **Queries**: 1000 requests per minute per tenant
- **Mutations**: 100 requests per minute per user
- **Subscriptions**: 50 concurrent connections per user

## Usage Examples

### Basic Chat Flow
```javascript
// Start a conversation
const conversation = await client.request(gql`
  mutation {
    startConversation(input: { title: "LMS Help" }) {
      id
      title
    }
  }
`);

// Send a message
const response = await client.request(gql`
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      content
      citations { title url }
    }
  }
`, {
  input: {
    conversationId: conversation.startConversation.id,
    content: "How do I create a new course?"
  }
});
```

### Knowledge Search
```javascript
const searchResults = await client.request(gql`
  query SearchKnowledge($input: KnowledgeSearchInput!) {
    searchKnowledge(input: $input) {
      results {
        title
        content
        url
        relevanceScore
      }
    }
  }
`, {
  input: {
    query: "course creation guide",
    scope: "ALL",
    maxResults: 5
  }
});
```

## Security Considerations

1. **Tenant Isolation**: All operations enforce strict tenant boundaries
2. **Permission Inheritance**: User permissions sync from LMS
3. **Data Residency**: Respects tenant data location requirements
4. **Audit Logging**: All operations are logged for compliance
5. **Rate Limiting**: Prevents abuse and ensures fair usage

## Monitoring & Analytics

- **Response Times**: Target <200ms for cached queries
- **Success Rates**: >99% availability during business hours
- **Error Tracking**: Comprehensive error logging and alerting
- **Usage Metrics**: Per-tenant analytics and reporting