# Technical README

## Goal
This POC models the mechanics that matter in a CDN conversation: origin publishing, edge selection, cache TTL, stale content, invalidation, and eviction pressure.

## Components
- **Origin catalog**: authoritative asset store keyed by path
- **Edge nodes**: regional caches in `NA`, `EU`, and `APAC`
- **Router**: picks an edge from region or uses a pinned edge id
- **Invalidation flow**: removes cached entries by exact path or by prefix

## Data Structures
- `originAssets`: `path -> OriginAsset`
- `edges`: `edgeId -> EdgeState`
- `EdgeState.cache`: `LinkedHashMap` in access-order to model LRU behavior

## Request Flow
1. Validate asset path and pick the target edge.
2. Look up the asset in the edge cache.
3. If present and not expired, return a cache `HIT`.
4. If absent or expired, fetch the latest origin asset, populate the edge cache, and return `MISS` or `EXPIRED`.
5. If capacity is full, evict the least recently used object before inserting the new one.

## Important Tradeoffs
- Cached copies do not auto-refresh when the origin version changes. That is deliberate so the invalidation story is visible.
- Latency is estimated rather than measured. The number helps the UI explain the effect of cache hits vs origin trips.
- The model is single-instance and synchronized because the goal is correctness and clarity over throughput.

## Extension Ideas
- Add shield POPs and mid-tier caches
- Model signed URLs and origin auth
- Add compression variants and cache key normalization
- Add stale-while-revalidate and background refresh
- Add per-edge warmup jobs and popularity-based prefetch
