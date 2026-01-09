# Technical README: Consistent Hashing POC

This document explains the architecture, flow, and file-by-file purpose of the consistent hashing proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Ring**: Sorted map of hash positions to node ids. Virtual nodes are created per node to smooth distribution.
- **Service**: `ConsistentHashingService` handles validation, ring mutations, and key assignments.
- **Controller**: `ConsistentHashingController` renders the UI and exposes JSON endpoints.
- **Views**: `index.html` provides forms for node management and key assignment plus a ring table.

## File Structure
```
consistent-hashing-poc/
├── pom.xml                                              # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/consistenthashing/
│   ├── ConsistentHashingPocApplication.java             # Boots the Spring application
│   ├── ConsistentHashingController.java                 # MVC + REST endpoints
│   ├── ConsistentHashingService.java                    # In-memory ring + hashing + validation
│   ├── AssignKeyRequest.java                            # Validation-backed assign request
│   ├── NodeRequest.java                                 # Validation-backed node request
│   ├── NodeChange.java                                  # Node add/remove response
│   ├── NodeAssignment.java                              # Assignment response payload
│   └── HashRingEntry.java                               # Ring entry snapshot
└── src/main/resources/
    ├── application.properties                           # Port + ring config + Thymeleaf dev config
    └── templates/
        └── index.html                                    # UI for nodes, assignment, and ring snapshot
```

## Flow
1. **Home**: GET `/` renders `index.html` with current nodes and ring entries.
2. **Add node (UI)**: POST `/nodes` validates input and adds a node with virtual positions.
3. **Remove node (UI)**: POST `/nodes/{nodeId}/remove` deletes a node and its virtual entries.
4. **Assign key (UI)**: POST `/assign` hashes a key and finds the next node clockwise.
5. **API endpoints**: `/api/nodes`, `/api/assign`, and `/api/ring` provide JSON access.

## Notable Implementation Details
- **Hashing**: Uses MD5, storing the first 64 bits as an unsigned ring position.
- **Ring order**: `TreeMap` with unsigned comparison supports correct wraparound.
- **Virtual nodes**: Each node is replicated `hash.virtual-nodes` times using `nodeId#index` keys.
- **Validation**: Node ids and keys are restricted to a safe pattern and max length.

## Configuration
- `server.port=8086` — avoid clashing with other POCs.
- `hash.virtual-nodes=120` — number of virtual nodes per physical node.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
