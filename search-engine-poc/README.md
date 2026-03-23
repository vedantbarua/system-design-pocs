# Search Engine POC

Spring Boot proof-of-concept for a small search engine with a sharded inverted index, BM25-lite ranking, a simple UI, and JSON endpoints.

## Features
- Multi-shard in-memory index with deterministic document placement
- Weighted tokenization for titles, content, and tags
- BM25-lite lexical ranking with shard fanout and result merge
- Search latency + shard candidate visibility in the UI
- Add documents through the UI or JSON API

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd search-engine-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8122` for the UI.

## Endpoints
- `/` - Search console and document indexing UI
- `/search` `POST` - Run a search from the form
- `/documents` `POST` - Add or update a document from the form
- `/api/search` `GET` - JSON search results (`query`, optional `limit`)
- `/api/documents` `GET` - List indexed documents
- `/api/documents` `POST` - Add or update a document as JSON
- `/api/shards` `GET` - Shard snapshots and hot terms
- `/api/overview` `GET` - High-level index stats

## Notes
- All state is in-memory; restarting clears the index.
- Ranking is lexical and intentionally simple so shard math and postings stay easy to inspect.
- Documents are hashed into shards by document ID.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory sharded inverted index
