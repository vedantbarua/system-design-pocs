# Technical README

## Problem Statement

Personal data is often backed up but hard to retrieve. A useful knowledge system needs incremental ingestion, search indexes that can be rebuilt, private access controls, query caching, and audit history for sensitive searches.

## Architecture Overview

```text
React dashboard
      |
      v
Express API
      |
      +--> KafkaJS producer/consumer or memory broker
      |
      +--> PersonalKnowledgeIndex domain core
      |       - document idempotency
      |       - tokenization
      |       - full-text index
      |       - vector simulation
      |       - access filtering
      |       - query cache
      |       - stale scans and rebuild jobs
      |
      +--> PostgreSQL snapshot/event persistence or memory
      |
      +--> Redis index job mirror and query cache hook or memory
```

## Core Data Model

| Model | Purpose |
| --- | --- |
| `KnowledgeDocument` | Document metadata, content, hash, owner, visibility, version, and index status. |
| `SearchIndexEntry` | Token counts and deterministic embedding vector for a document. |
| `IndexJob` | Retryable indexing, rebuild, and stale-scan jobs. |
| `Grant` | Explicit read access for private documents. |
| `SearchAudit` | Query, actor, mode, result count, cache flag, and timestamp. |
| `AuditEvent` | Operational audit events for indexing and access changes. |

## Event Flow

1. A document change is published to `/api/documents/publish`.
2. KafkaJS sends it to `knowledge.document.changes`, or memory mode buffers it.
3. Consumer or `/api/kafka/drain` passes the change to the domain core.
4. `processedEvents` rejects duplicate event keys.
5. Content hash dedupe prevents unchanged documents from creating new versions.
6. A stale document record is created or updated.
7. An `INDEX_DOCUMENT` job is queued.
8. The index worker tokenizes content, updates token counts and vector, and clears query cache.
9. Search runs access filtering before ranking results.

## Search Model

Keyword search counts direct token matches. Semantic-style search uses deterministic hashed token vectors and cosine similarity. Hybrid search adds both scores, which makes the scoring easy to inspect without external ML infrastructure.

## Idempotency

Document event keys are:

```text
path:eventId
```

Index job keys are:

```text
documentId:version:index
```

Rebuild job keys are date scoped:

```text
rebuild:YYYY-MM-DD
```

These keys allow event replay and job rebuilds without duplicate work.

## Failure Handling

- Duplicate document changes do not mutate state.
- Unchanged content hashes return as duplicates.
- Index jobs retry and can be marked dead after max attempts.
- Query cache is cleared whenever document index state changes.
- Private documents are filtered unless the actor owns the document or has a grant.
- Stale scans queue reindex work when documents are missing or older than the allowed age.

## Scaling Path

- Move index consumers and rebuild workers out of the API process.
- Store normalized documents, grants, and audit rows in PostgreSQL.
- Replace in-memory index with PostgreSQL full-text search, OpenSearch, or Tantivy.
- Add real embedding generation and vector search.
- Partition Kafka by account or document collection.
- Add Redis locks for distributed indexing workers.

## Key Tradeoffs

- In-memory index keeps the POC transparent but is not durable search infrastructure.
- Deterministic vector simulation avoids external model dependencies.
- Access controls are document-level rather than folder inheritance.
- Query cache is simple and invalidated globally on index updates.

## What Is Intentionally Simplified

- No real PDF parsing or OCR.
- No external embedding provider.
- No authentication service.
- No folder-level ACL inheritance.
- No incremental partial-field reindexing.

## Test Coverage

Backend tests cover seeding, event keys, duplicate ingestion, document updates, indexing, keyword search, query cache hits, access filtering, grants, job retry, rebuilds, stale scans, and export/import.
