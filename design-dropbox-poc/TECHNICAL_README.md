# Technical README: Design Dropbox POC

This document explains the architecture, flow, and file-by-file purpose of the Dropbox-style proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for the UI.
- **Storage**: In-memory maps for folders, files, and share links.
- **Service**: `DropboxService` validates inputs, enforces limits, and builds share links.
- **Controller**: `DesignDropboxController` renders the UI and exposes JSON endpoints.
- **Views**: `index.html` provides forms and snapshot tables.

## File Structure
```
design-dropbox-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/designdropbox/
│   ├── DesignDropboxPocApplication.java         # Boots the Spring application
│   ├── DesignDropboxController.java             # MVC + REST endpoints
│   ├── DropboxService.java                      # In-memory storage, validation, sharing
│   ├── DropboxDefaults.java                     # UI defaults configuration
│   ├── FolderEntry.java                         # Folder model
│   ├── FileEntry.java                           # File model
│   ├── ShareLink.java                           # Share link model
│   ├── FileDownload.java                        # Download payload
│   ├── CreateFolderRequest.java                 # Validation-backed request payload
│   ├── UploadFileRequest.java                   # Validation-backed request payload
│   └── CreateShareLinkRequest.java              # Validation-backed request payload
└── src/main/resources/
    ├── application.properties                   # Port + Dropbox defaults
    └── templates/
        └── index.html                            # UI for managing the workspace
```

## Flow
1. **Home**: GET `/` renders the workspace snapshot.
2. **Create folder**: POST `/folders` validates and adds a folder.
3. **Upload file**: POST `/files` stores a text payload in memory.
4. **Share link**: POST `/shares` creates a short-lived token to access a file.
5. **Download**: GET `/shares/{token}` returns file content as JSON.

## Notable Implementation Details
- **Size limits**: File content length is capped by `dropbox.max-file-size`.
- **TTL**: Share links expire after `dropbox.default-ttl-minutes` unless overridden.
- **Root folder**: A default `root` folder is created at service startup.

## Configuration
- `server.port=8089` — avoid clashing with other POCs.
- `dropbox.max-file-size=50000` — max characters per file.
- `dropbox.default-ttl-minutes=60` — share link lifetime.
- `spring.thymeleaf.cache=false` — hot reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
