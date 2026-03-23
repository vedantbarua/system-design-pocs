# Technical README: Search Engine POC

## Architecture Overview
- `SearchEngineController` exposes the HTML flows and JSON endpoints.
- `SearchService` owns the in-memory corpus, shard routing, inverted indexes, and ranking.
- Each shard maintains:
  - a local document map
  - a term -> posting list map
  - aggregate token counts for average-length normalization

## File Structure
- `pom.xml` - Spring Boot module configuration
- `src/main/java/com/randomproject/searchengine/SearchEnginePocApplication.java` - app bootstrap
- `src/main/java/com/randomproject/searchengine/SearchEngineController.java` - UI + API controller
- `src/main/java/com/randomproject/searchengine/SearchService.java` - indexing, shard placement, and search logic
- `src/main/resources/templates/index.html` - demo console for search and indexing
- `src/test/java/com/randomproject/searchengine/SearchServiceTest.java` - service-level coverage

## Flow
1. A document is submitted with title, URL, content, and tags.
2. The service normalizes text and tokenizes it into weighted terms.
3. The document ID is hashed to pick a shard.
4. The shard updates its posting lists for every indexed term.
5. A query fans out to every shard.
6. Each shard finds matching candidates from posting lists.
7. The coordinator scores candidates, merges results, and returns the top hits.

## Notable Implementation Details
- Title terms are weighted more heavily than body terms.
- Tags are indexed as searchable terms with moderate weight.
- Ranking uses a BM25-lite formula with phrase boosts for title and content hits.
- Snippets are generated around the first matched query term.

## Configuration
- `search.default-limit` - default result count
- `search.shard-count` - number of in-memory shards
- `search.max-query-terms` - guardrail on analyzed query size
- `search.max-document-length` - upper bound for indexed content size

## Build/Run
```bash
cd search-engine-poc
mvn test
mvn org.springframework.boot:spring-boot-maven-plugin:run
```
