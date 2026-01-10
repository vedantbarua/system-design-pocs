# Technical README: Unique ID Generator POC

This document explains the architecture, flow, and file-by-file purpose of the unique ID generator proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Generator**: Snowflake-style IDs using `(timestamp << shift) | (nodeId << shift) | sequence`.
- **Service**: `UniqueIdService` validates inputs, maintains node state, and generates/decode IDs.
- **Controller**: `UniqueIdController` renders the UI and exposes JSON endpoints.
- **Views**: `index.html` provides forms to generate and decode IDs plus a node table.

## File Structure
```
unique-id-generator-in-distributed-systems-poc/
├── pom.xml                                                # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/uniqueidgenerator/
│   ├── UniqueIdGeneratorApplication.java                  # Boots the Spring application
│   ├── UniqueIdController.java                            # MVC + REST endpoints
│   ├── UniqueIdService.java                               # ID generation + node state + validation
│   ├── IdGeneration.java                                  # Generated ID payload
│   ├── IdDecodeResult.java                                # Decoded ID payload
│   ├── IdBatchResponse.java                               # Batch response for API
│   ├── IdGenerationRequest.java                           # Validation-backed request payload
│   ├── IdConfigSnapshot.java                              # Configuration payload
│   └── NodeSnapshot.java                                  # Node state snapshot
└── src/main/resources/
    ├── application.properties                             # Port + generator config + Thymeleaf dev config
    └── templates/
        └── index.html                                     # UI for generating and decoding IDs
```

## Flow
1. **Home**: GET `/` renders `index.html` with config, nodes, and any flash attributes.
2. **Generate (UI)**: POST `/generate` validates inputs, calls `UniqueIdService.generate`, then redirects with the batch.
3. **Decode (UI)**: POST `/decode` parses the ID and displays the decoded fields.
4. **Generate (API)**: POST `/api/ids` returns a batch with 201 Created and the generated list.
5. **Decode (API)**: GET `/api/ids/{id}` returns decoded fields.
6. **Nodes**: GET `/api/nodes` shows node snapshots; `/api/config` exposes config.

## Notable Implementation Details
- **Bit layout**: `timestamp | nodeId | sequence`, defaulting to 41/10/12 bits.
- **Sequence rollover**: If sequence hits max within the same millisecond, the generator waits for the next millisecond.
- **Clock drift**: If the system clock moves backward, generation throws a validation error.
- **Thread safety**: Generation is synchronized to keep per-node sequence ordering correct.

## Configuration
- `server.port=8087` — avoid clashing with other POCs.
- `id.epoch-millis=1704067200000` — epoch (2024-01-01T00:00:00Z).
- `id.node-bits=10` — bits allocated to the node id.
- `id.sequence-bits=12` — bits allocated to per-millisecond sequence.
- `id.max-batch=20` — cap batch size in the UI/API.
- `id.default-node-id=1` — default node id for UI when not provided.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
