# Object Storage POC

Spring Boot proof-of-concept for an S3-style object storage system with buckets, object versioning, multipart uploads, storage classes, and pre-signed URLs.

## Features
- Create buckets with optional versioning
- Store text objects with `STANDARD`, `INFREQUENT`, or `ARCHIVE` classes
- Keep version history for versioned buckets
- Run multipart upload flows with separate part upload + completion
- Generate pre-signed upload or download tokens with TTL-based expiry
- Use a small UI or JSON API for demos and automation

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd object-storage-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8132` for the UI.

## Endpoints
- `/` `GET` - UI dashboard
- `/buckets` `POST` - Create bucket (`name`, `versioningEnabled`)
- `/objects` `POST` - Put object (`bucketId`, `objectKey`, `content`, optional `storageClass`)
- `/multipart/uploads` `POST` - Start multipart upload
- `/multipart/uploads/{uploadId}/parts` `POST` - Upload one part
- `/multipart/uploads/{uploadId}/complete` `POST` - Complete upload
- `/presigned` `POST` - Create pre-signed token
- `/presigned/{token}/upload` `POST` - Upload via pre-signed token
- `/downloads/{token}` `GET` - Download via pre-signed token
- `/api/buckets` `GET|POST`
- `/api/objects` `GET|POST`
- `/api/object-versions` `GET` with `bucketId` and `objectKey`
- `/api/multipart/uploads` `GET|POST`
- `/api/multipart/uploads/{uploadId}/parts` `POST`
- `/api/multipart/uploads/{uploadId}/complete` `POST`
- `/api/presigned` `GET|POST`
- `/api/presigned/{token}/upload` `POST`
- `/api/downloads/{token}` `GET`

## Example API Flow
1. Create a bucket:
   ```bash
   curl -X POST http://localhost:8132/api/buckets \
     -H "Content-Type: application/json" \
     -d '{"name":"media-assets-prod","versioningEnabled":true}'
   ```
2. Put an object:
   ```bash
   curl -X POST http://localhost:8132/api/objects \
     -H "Content-Type: application/json" \
     -d '{"bucketId":"bkt-1","objectKey":"images/homepage.txt","content":"hero image metadata","storageClass":"STANDARD"}'
   ```
3. Start multipart upload:
   ```bash
   curl -X POST http://localhost:8132/api/multipart/uploads \
     -H "Content-Type: application/json" \
     -d '{"bucketId":"bkt-1","objectKey":"exports/report.txt","storageClass":"INFREQUENT"}'
   ```
4. Upload parts and complete:
   ```bash
   curl -X POST http://localhost:8132/api/multipart/uploads/upl-1/parts \
     -H "Content-Type: application/json" \
     -d '{"partNumber":1,"content":"hello "}'

   curl -X POST http://localhost:8132/api/multipart/uploads/upl-1/parts \
     -H "Content-Type: application/json" \
     -d '{"partNumber":2,"content":"world"}'

   curl -X POST http://localhost:8132/api/multipart/uploads/upl-1/complete
   ```
5. Create a download token:
   ```bash
   curl -X POST http://localhost:8132/api/presigned \
     -H "Content-Type: application/json" \
     -d '{"bucketId":"bkt-1","objectKey":"exports/report.txt","operation":"DOWNLOAD","ttlMinutes":10}'
   ```

## Notes
- State is fully in memory; restart clears buckets, objects, uploads, and tokens.
- This POC stores text content rather than binary blobs.
- Non-versioned buckets overwrite prior object state; versioned buckets keep historical versions.
- Multipart upload completion requires contiguous parts starting from `1`.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory maps with synchronized service operations
