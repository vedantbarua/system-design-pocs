package com.randomproject.designdropbox;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class DropboxService {
    private static final String ROOT_ID = "root";

    private final Map<String, FolderEntry> folders = new ConcurrentHashMap<>();
    private final Map<String, FileEntry> files = new ConcurrentHashMap<>();
    private final Map<String, ShareLink> shares = new ConcurrentHashMap<>();
    private final AtomicLong folderSequence = new AtomicLong(1);
    private final AtomicLong fileSequence = new AtomicLong(1);
    private final int maxFileSize;
    private final int defaultTtlMinutes;

    public DropboxService(
            @Value("${dropbox.max-file-size:50000}") int maxFileSize,
            @Value("${dropbox.default-ttl-minutes:60}") int defaultTtlMinutes) {
        this.maxFileSize = maxFileSize;
        this.defaultTtlMinutes = defaultTtlMinutes;
        folders.put(ROOT_ID, new FolderEntry(ROOT_ID, "Root", null, Instant.now()));
    }

    public DropboxDefaults defaults() {
        return new DropboxDefaults(maxFileSize, defaultTtlMinutes);
    }

    public synchronized FolderEntry createFolder(String name, String parentId) {
        String normalizedParent = resolveParent(parentId);
        String normalizedName = normalizeName(name, 64, "Folder name");
        String id = "fld-" + folderSequence.getAndIncrement();
        FolderEntry entry = new FolderEntry(id, normalizedName, normalizedParent, Instant.now());
        folders.put(id, entry);
        return entry;
    }

    public synchronized FileEntry uploadFile(String name, String content, String parentId) {
        String normalizedParent = resolveParent(parentId);
        String normalizedName = normalizeName(name, 128, "File name");
        if (!StringUtils.hasText(content)) {
            throw new IllegalArgumentException("File content cannot be empty.");
        }
        int size = content.length();
        if (size > maxFileSize) {
            throw new IllegalArgumentException("File exceeds max size of " + maxFileSize + " characters.");
        }
        String id = "fil-" + fileSequence.getAndIncrement();
        Instant now = Instant.now();
        FileEntry entry = new FileEntry(id, normalizedName, normalizedParent, size, content, now, now);
        files.put(id, entry);
        return entry;
    }

    public synchronized ShareLink createShareLink(String fileId, Integer ttlMinutes) {
        FileEntry file = files.get(fileId);
        if (file == null) {
            throw new IllegalArgumentException("File not found.");
        }
        int resolvedTtl = ttlMinutes == null ? defaultTtlMinutes : ttlMinutes;
        if (resolvedTtl <= 0) {
            throw new IllegalArgumentException("TTL must be at least 1 minute.");
        }
        Instant now = Instant.now();
        Instant expiresAt = now.plus(resolvedTtl, ChronoUnit.MINUTES);
        String token = UUID.randomUUID().toString().replace("-", "");
        ShareLink link = new ShareLink(token, file.id(), now, expiresAt);
        shares.put(token, link);
        return link;
    }

    public List<FolderEntry> listFolders() {
        return folders.values().stream()
                .sorted(Comparator.comparing(FolderEntry::createdAt))
                .toList();
    }

    public List<FileEntry> listFiles() {
        return files.values().stream()
                .sorted(Comparator.comparing(FileEntry::updatedAt).reversed())
                .toList();
    }

    public List<ShareLink> listShares() {
        return shares.values().stream()
                .sorted(Comparator.comparing(ShareLink::createdAt).reversed())
                .toList();
    }

    public FileDownload resolveShare(String token) {
        ShareLink link = shares.get(token);
        if (link == null) {
            throw new IllegalArgumentException("Share link not found.");
        }
        if (link.expiresAt() != null && link.expiresAt().isBefore(Instant.now())) {
            throw new IllegalArgumentException("Share link has expired.");
        }
        FileEntry file = files.get(link.fileId());
        if (file == null) {
            throw new IllegalArgumentException("File no longer exists.");
        }
        return new FileDownload(file.id(), file.name(), file.content(), file.size(), file.createdAt(), file.updatedAt());
    }

    public List<FolderEntry> childrenOf(String parentId) {
        String normalizedParent = resolveParent(parentId);
        List<FolderEntry> results = new ArrayList<>();
        for (FolderEntry entry : folders.values()) {
            if (normalizedParent.equals(entry.parentId())) {
                results.add(entry);
            }
        }
        results.sort(Comparator.comparing(FolderEntry::createdAt));
        return results;
    }

    public List<FileEntry> filesIn(String parentId) {
        String normalizedParent = resolveParent(parentId);
        List<FileEntry> results = new ArrayList<>();
        for (FileEntry entry : files.values()) {
            if (normalizedParent.equals(entry.parentId())) {
                results.add(entry);
            }
        }
        results.sort(Comparator.comparing(FileEntry::updatedAt).reversed());
        return results;
    }

    public String rootId() {
        return ROOT_ID;
    }

    private String resolveParent(String parentId) {
        if (!StringUtils.hasText(parentId)) {
            return ROOT_ID;
        }
        String normalized = parentId.trim();
        if (!folders.containsKey(normalized)) {
            throw new IllegalArgumentException("Parent folder does not exist.");
        }
        return normalized;
    }

    private String normalizeName(String name, int maxLength, String label) {
        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException(label + " cannot be empty.");
        }
        String normalized = name.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(label + " must be at most " + maxLength + " characters.");
        }
        return normalized;
    }
}
