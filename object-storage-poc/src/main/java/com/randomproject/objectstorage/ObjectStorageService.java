package com.randomproject.objectstorage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class ObjectStorageService {
    private final Map<String, BucketEntry> buckets = new ConcurrentHashMap<>();
    private final Map<String, LinkedHashMap<String, List<ObjectVersion>>> objectVersions = new ConcurrentHashMap<>();
    private final Map<String, MultipartUploadState> multipartUploads = new ConcurrentHashMap<>();
    private final Map<String, PresignedTokenState> presignedTokens = new ConcurrentHashMap<>();
    private final AtomicLong bucketSequence = new AtomicLong(1);
    private final AtomicLong versionSequence = new AtomicLong(1);
    private final AtomicLong uploadSequence = new AtomicLong(1);
    private final int maxObjectSize;
    private final int defaultTokenTtlMinutes;

    public ObjectStorageService(
            @Value("${storage.max-object-size:75000}") int maxObjectSize,
            @Value("${storage.default-token-ttl-minutes:30}") int defaultTokenTtlMinutes) {
        this.maxObjectSize = maxObjectSize;
        this.defaultTokenTtlMinutes = defaultTokenTtlMinutes;
    }

    public StorageDefaults defaults() {
        return new StorageDefaults(maxObjectSize, defaultTokenTtlMinutes);
    }

    public synchronized BucketEntry createBucket(String name, boolean versioningEnabled) {
        String normalizedName = normalizeBucketName(name);
        ensureBucketNameUnique(normalizedName);
        BucketEntry bucket = new BucketEntry(
                "bkt-" + bucketSequence.getAndIncrement(),
                normalizedName,
                versioningEnabled,
                Instant.now());
        buckets.put(bucket.id(), bucket);
        objectVersions.put(bucket.id(), new LinkedHashMap<>());
        return bucket;
    }

    public synchronized ObjectVersion putObject(String bucketId, String objectKey, String content, String storageClass) {
        BucketEntry bucket = requireBucket(bucketId);
        String normalizedKey = normalizeObjectKey(objectKey);
        String normalizedContent = normalizeContent(content);
        String resolvedStorageClass = normalizeStorageClass(storageClass);
        return storeObject(bucket, normalizedKey, normalizedContent, resolvedStorageClass, Instant.now());
    }

    public synchronized MultipartUploadView startMultipartUpload(String bucketId, String objectKey, String storageClass) {
        BucketEntry bucket = requireBucket(bucketId);
        String uploadId = "upl-" + uploadSequence.getAndIncrement();
        MultipartUploadState upload = new MultipartUploadState(
                uploadId,
                bucket.id(),
                normalizeObjectKey(objectKey),
                normalizeStorageClass(storageClass),
                Instant.now());
        multipartUploads.put(uploadId, upload);
        return upload.toView();
    }

    public synchronized MultipartUploadView uploadPart(String uploadId, Integer partNumber, String content) {
        MultipartUploadState upload = requireUpload(uploadId);
        if (partNumber == null || partNumber <= 0) {
            throw new IllegalArgumentException("Part number must be at least 1.");
        }
        String normalizedContent = normalizeContent(content);
        upload.parts.put(partNumber, normalizedContent);
        return upload.toView();
    }

    public synchronized ObjectVersion completeMultipartUpload(String uploadId) {
        MultipartUploadState upload = requireUpload(uploadId);
        if (upload.parts.isEmpty()) {
            throw new IllegalArgumentException("Upload has no parts.");
        }
        List<Integer> numbers = new ArrayList<>(upload.parts.keySet());
        numbers.sort(Integer::compareTo);
        int expected = 1;
        StringBuilder combined = new StringBuilder();
        for (Integer number : numbers) {
            if (number != expected) {
                throw new IllegalArgumentException("Uploaded parts must be contiguous starting at 1.");
            }
            combined.append(upload.parts.get(number));
            expected += 1;
        }
        BucketEntry bucket = requireBucket(upload.bucketId);
        ObjectVersion version = storeObject(bucket, upload.objectKey, combined.toString(), upload.storageClass, Instant.now());
        multipartUploads.remove(uploadId);
        return version;
    }

    public synchronized PresignedTokenView createPresignedToken(
            String bucketId,
            String objectKey,
            String versionId,
            String operation,
            Integer ttlMinutes,
            String storageClass) {
        BucketEntry bucket = requireBucket(bucketId);
        String normalizedOperation = normalizeOperation(operation);
        String normalizedKey = normalizeObjectKey(objectKey);
        String normalizedVersion = StringUtils.hasText(versionId) ? versionId.trim() : null;
        if ("DOWNLOAD".equals(normalizedOperation)) {
            resolveVersion(bucket.id(), normalizedKey, normalizedVersion);
        }
        if ("UPLOAD".equals(normalizedOperation) && normalizedVersion != null) {
            throw new IllegalArgumentException("Upload tokens cannot target a fixed version.");
        }
        int resolvedTtl = ttlMinutes == null ? defaultTokenTtlMinutes : ttlMinutes;
        if (resolvedTtl <= 0) {
            throw new IllegalArgumentException("TTL minutes must be at least 1.");
        }
        PresignedTokenState token = new PresignedTokenState(
                UUID.randomUUID().toString().replace("-", ""),
                bucket.id(),
                normalizedKey,
                normalizedVersion,
                normalizedOperation,
                "UPLOAD".equals(normalizedOperation) ? normalizeStorageClass(storageClass) : null,
                Instant.now().plus(resolvedTtl, ChronoUnit.MINUTES));
        presignedTokens.put(token.token, token);
        return token.toView();
    }

    public synchronized ObjectVersion uploadWithToken(String tokenValue, String content) {
        PresignedTokenState token = requireToken(tokenValue);
        if (!"UPLOAD".equals(token.operation)) {
            throw new IllegalArgumentException("Token does not allow uploads.");
        }
        if (token.consumed) {
            throw new IllegalArgumentException("Upload token has already been used.");
        }
        BucketEntry bucket = requireBucket(token.bucketId);
        ObjectVersion version = storeObject(bucket, token.objectKey, normalizeContent(content), token.storageClass, Instant.now());
        token.consumed = true;
        return version;
    }

    public synchronized ObjectDownload downloadWithToken(String tokenValue) {
        PresignedTokenState token = requireToken(tokenValue);
        if (!"DOWNLOAD".equals(token.operation)) {
            throw new IllegalArgumentException("Token does not allow downloads.");
        }
        ObjectVersion version = resolveVersion(token.bucketId, token.objectKey, token.versionId);
        return new ObjectDownload(
                version.bucketId(),
                version.objectKey(),
                version.versionId(),
                version.content(),
                version.size(),
                version.etag(),
                version.storageClass(),
                version.createdAt());
    }

    public List<BucketEntry> listBuckets() {
        return buckets.values().stream()
                .sorted(Comparator.comparing(BucketEntry::createdAt))
                .toList();
    }

    public List<ObjectSummary> listObjects() {
        List<ObjectSummary> results = new ArrayList<>();
        for (Map.Entry<String, LinkedHashMap<String, List<ObjectVersion>>> bucketEntry : objectVersions.entrySet()) {
            for (Map.Entry<String, List<ObjectVersion>> objectEntry : bucketEntry.getValue().entrySet()) {
                List<ObjectVersion> versions = objectEntry.getValue();
                ObjectVersion current = currentVersion(versions);
                results.add(new ObjectSummary(
                        bucketEntry.getKey(),
                        objectEntry.getKey(),
                        current.versionId(),
                        versions.size(),
                        current.size(),
                        current.etag(),
                        current.storageClass(),
                        current.createdAt()));
            }
        }
        results.sort(Comparator.comparing(ObjectSummary::updatedAt).reversed());
        return results;
    }

    public List<ObjectVersion> listVersions(String bucketId, String objectKey) {
        BucketEntry bucket = requireBucket(bucketId);
        String normalizedKey = normalizeObjectKey(objectKey);
        List<ObjectVersion> versions = objectsFor(bucket.id(), normalizedKey);
        return versions.stream()
                .sorted(Comparator.comparing(ObjectVersion::createdAt).reversed())
                .toList();
    }

    public List<MultipartUploadView> listMultipartUploads() {
        return multipartUploads.values().stream()
                .map(MultipartUploadState::toView)
                .sorted(Comparator.comparing(MultipartUploadView::createdAt).reversed())
                .toList();
    }

    public List<PresignedTokenView> listPresignedTokens() {
        return presignedTokens.values().stream()
                .map(PresignedTokenState::toView)
                .sorted(Comparator.comparing(PresignedTokenView::expiresAt))
                .toList();
    }

    public long bucketObjectCount(String bucketId) {
        LinkedHashMap<String, List<ObjectVersion>> objects = objectVersions.get(bucketId);
        return objects == null ? 0 : objects.size();
    }

    public long bucketStoredBytes(String bucketId) {
        LinkedHashMap<String, List<ObjectVersion>> objects = objectVersions.get(bucketId);
        if (objects == null) {
            return 0;
        }
        long total = 0;
        for (List<ObjectVersion> versions : objects.values()) {
            total += currentVersion(versions).size();
        }
        return total;
    }

    private BucketEntry requireBucket(String bucketId) {
        if (!StringUtils.hasText(bucketId)) {
            throw new IllegalArgumentException("Bucket id is required.");
        }
        BucketEntry bucket = buckets.get(bucketId.trim());
        if (bucket == null) {
            throw new IllegalArgumentException("Bucket not found.");
        }
        return bucket;
    }

    private MultipartUploadState requireUpload(String uploadId) {
        MultipartUploadState upload = multipartUploads.get(uploadId);
        if (upload == null) {
            throw new IllegalArgumentException("Multipart upload not found.");
        }
        return upload;
    }

    private PresignedTokenState requireToken(String tokenValue) {
        PresignedTokenState token = presignedTokens.get(tokenValue);
        if (token == null) {
            throw new IllegalArgumentException("Pre-signed token not found.");
        }
        if (token.expiresAt.isBefore(Instant.now())) {
            throw new IllegalArgumentException("Pre-signed token has expired.");
        }
        return token;
    }

    private List<ObjectVersion> objectsFor(String bucketId, String objectKey) {
        LinkedHashMap<String, List<ObjectVersion>> objects = objectVersions.get(bucketId);
        if (objects == null) {
            throw new IllegalArgumentException("Bucket not found.");
        }
        List<ObjectVersion> versions = objects.get(objectKey);
        if (versions == null || versions.isEmpty()) {
            throw new IllegalArgumentException("Object not found.");
        }
        return versions;
    }

    private ObjectVersion resolveVersion(String bucketId, String objectKey, String versionId) {
        List<ObjectVersion> versions = objectsFor(bucketId, objectKey);
        if (!StringUtils.hasText(versionId)) {
            return currentVersion(versions);
        }
        return versions.stream()
                .filter(version -> version.versionId().equals(versionId.trim()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Requested version was not found."));
    }

    private ObjectVersion currentVersion(List<ObjectVersion> versions) {
        return versions.stream()
                .filter(ObjectVersion::current)
                .findFirst()
                .orElseGet(() -> versions.get(versions.size() - 1));
    }

    private ObjectVersion storeObject(BucketEntry bucket, String objectKey, String content, String storageClass, Instant now) {
        LinkedHashMap<String, List<ObjectVersion>> objects = objectVersions.computeIfAbsent(bucket.id(), ignored -> new LinkedHashMap<>());
        List<ObjectVersion> existing = new ArrayList<>(objects.getOrDefault(objectKey, List.of()));
        if (bucket.versioningEnabled()) {
            for (int index = 0; index < existing.size(); index += 1) {
                ObjectVersion version = existing.get(index);
                if (version.current()) {
                    existing.set(index, new ObjectVersion(
                            version.bucketId(),
                            version.objectKey(),
                            version.versionId(),
                            version.content(),
                            version.size(),
                            version.etag(),
                            version.storageClass(),
                            version.createdAt(),
                            false));
                }
            }
        } else {
            existing.clear();
        }
        ObjectVersion latest = new ObjectVersion(
                bucket.id(),
                objectKey,
                "ver-" + versionSequence.getAndIncrement(),
                content,
                content.length(),
                computeEtag(content),
                storageClass,
                now,
                true);
        existing.add(0, latest);
        objects.put(objectKey, existing);
        return latest;
    }

    private void ensureBucketNameUnique(String normalizedName) {
        for (BucketEntry bucket : buckets.values()) {
            if (bucket.name().equalsIgnoreCase(normalizedName)) {
                throw new IllegalArgumentException("Bucket name already exists.");
            }
        }
    }

    private String normalizeBucketName(String name) {
        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException("Bucket name cannot be empty.");
        }
        String normalized = name.trim().toLowerCase();
        if (!normalized.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")) {
            throw new IllegalArgumentException("Bucket name must be 3-63 chars using lowercase letters, numbers, dots, or hyphens.");
        }
        return normalized;
    }

    private String normalizeObjectKey(String objectKey) {
        if (!StringUtils.hasText(objectKey)) {
            throw new IllegalArgumentException("Object key cannot be empty.");
        }
        String normalized = objectKey.trim();
        if (normalized.length() > 256) {
            throw new IllegalArgumentException("Object key must be at most 256 characters.");
        }
        return normalized;
    }

    private String normalizeContent(String content) {
        if (!StringUtils.hasText(content)) {
            throw new IllegalArgumentException("Object content cannot be empty.");
        }
        String normalized = content.trim();
        if (normalized.length() > maxObjectSize) {
            throw new IllegalArgumentException("Object exceeds max size of " + maxObjectSize + " characters.");
        }
        return normalized;
    }

    private String normalizeStorageClass(String storageClass) {
        if (!StringUtils.hasText(storageClass)) {
            return "STANDARD";
        }
        String normalized = storageClass.trim().toUpperCase();
        if (!normalized.equals("STANDARD") && !normalized.equals("INFREQUENT") && !normalized.equals("ARCHIVE")) {
            throw new IllegalArgumentException("Storage class must be STANDARD, INFREQUENT, or ARCHIVE.");
        }
        return normalized;
    }

    private String normalizeOperation(String operation) {
        if (!StringUtils.hasText(operation)) {
            throw new IllegalArgumentException("Operation is required.");
        }
        String normalized = operation.trim().toUpperCase();
        if (!normalized.equals("UPLOAD") && !normalized.equals("DOWNLOAD")) {
            throw new IllegalArgumentException("Operation must be UPLOAD or DOWNLOAD.");
        }
        return normalized;
    }

    private String computeEtag(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(content.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 16);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available.", ex);
        }
    }

    private static final class MultipartUploadState {
        private final String uploadId;
        private final String bucketId;
        private final String objectKey;
        private final String storageClass;
        private final Instant createdAt;
        private final Map<Integer, String> parts = new ConcurrentHashMap<>();

        private MultipartUploadState(String uploadId, String bucketId, String objectKey, String storageClass, Instant createdAt) {
            this.uploadId = uploadId;
            this.bucketId = bucketId;
            this.objectKey = objectKey;
            this.storageClass = storageClass;
            this.createdAt = createdAt;
        }

        private MultipartUploadView toView() {
            List<Integer> uploadedParts = new ArrayList<>(parts.keySet());
            uploadedParts.sort(Integer::compareTo);
            int uploadedBytes = parts.values().stream().mapToInt(String::length).sum();
            return new MultipartUploadView(uploadId, bucketId, objectKey, storageClass, createdAt, uploadedParts, uploadedBytes);
        }
    }

    private static final class PresignedTokenState {
        private final String token;
        private final String bucketId;
        private final String objectKey;
        private final String versionId;
        private final String operation;
        private final String storageClass;
        private final Instant expiresAt;
        private boolean consumed;

        private PresignedTokenState(
                String token,
                String bucketId,
                String objectKey,
                String versionId,
                String operation,
                String storageClass,
                Instant expiresAt) {
            this.token = token;
            this.bucketId = bucketId;
            this.objectKey = objectKey;
            this.versionId = versionId;
            this.operation = operation;
            this.storageClass = storageClass;
            this.expiresAt = expiresAt;
        }

        private PresignedTokenView toView() {
            return new PresignedTokenView(token, bucketId, objectKey, versionId, operation, storageClass, expiresAt, consumed);
        }
    }
}
