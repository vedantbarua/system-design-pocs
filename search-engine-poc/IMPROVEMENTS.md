# Improvements

- Add crawl ingest so documents can be sourced directly from `web-crawler-poc`.
- Persist postings and documents instead of rebuilding from seed data on restart.
- Separate indexing from query serving to model near-real-time refresh.
- Add typo tolerance, stemming, synonyms, and field-specific filters.
- Introduce replica shards and partial-result handling for shard failures.
- Blend lexical ranking with vector retrieval for hybrid search.
