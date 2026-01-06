# Technical README: Key-Value Store POC

This document explains the architecture, flow, and file-by-file purpose of the key-value store proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Storage**: In-memory `ConcurrentHashMap` of keys to entries, with optional TTL support.
- **Domain**: `KeyValueEntry` stores key, value, created/updated timestamps, and optional expiry.
- **Service**: `KeyValueStoreService` validates keys, manages TTL expiration, and handles CRUD.
- **Controller**: `KeyValueStoreController` renders pages and exposes JSON endpoints.
- **Views**: `index.html` provides a simple UI to store and list entries.

## File Structure
```
key-value-store-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/keyvaluestore/
│   ├── KeyValueStorePocApplication.java          # Boots the Spring application
│   ├── KeyValueEntry.java                         # Domain model for entries
│   ├── KeyValueStoreService.java                  # In-memory store + TTL handling
│   ├── KeyValueStoreController.java               # MVC + REST endpoints
│   ├── KeyValuePutRequest.java                    # Validation-backed payload for API PUT
│   └── KeyValueResponse.java                      # API response model
└── src/main/resources/
    ├── application.properties                    # Port + Thymeleaf dev config
    └── templates/
        └── index.html                             # UI for storing and listing entries
```

## Flow
1. **Home**: GET `/` renders `index.html` with current entries.
2. **Store entry**: POST `/kv` validates input, stores the entry via the service, and redirects with a status message.
3. **Delete entry**: POST `/kv/{key}/delete` removes the entry and redirects.
4. **API**: `/api/entries` and `/api/entries/{key}` expose JSON for list, read, create, and delete.

## Notable Implementation Details
- **TTL**: TTL is optional. Entries with an `expiresAt` in the past are removed on reads and list operations.
- **Key validation**: Keys are limited to letters, numbers, and `.` `-` `_` `:` to keep URLs clean.
- **Thread safety**: Service methods are synchronized, and the backing map is concurrent.

## Configuration
- `server.port=8084` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
