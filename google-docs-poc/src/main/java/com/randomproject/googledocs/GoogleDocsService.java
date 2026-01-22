package com.randomproject.googledocs;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class GoogleDocsService {
    private final Map<String, DocumentEntry> documents = new ConcurrentHashMap<>();
    private final Map<String, List<DocumentVersion>> versions = new ConcurrentHashMap<>();
    private final Map<String, List<CommentEntry>> comments = new ConcurrentHashMap<>();
    private final Map<String, List<CollaboratorEntry>> collaborators = new ConcurrentHashMap<>();
    private final AtomicLong docSequence = new AtomicLong(1);
    private final AtomicLong commentSequence = new AtomicLong(1);

    private final int maxContentLength;
    private final String defaultOwner;
    private final int maxDocs;

    public GoogleDocsService(
            @Value("${google.docs.max-content-length:120000}") int maxContentLength,
            @Value("${google.docs.default-owner:alex@docs.local}") String defaultOwner,
            @Value("${google.docs.max-docs:200}") int maxDocs) {
        this.maxContentLength = maxContentLength;
        this.defaultOwner = defaultOwner;
        this.maxDocs = maxDocs;
    }

    public DocsDefaults defaults() {
        return new DocsDefaults(maxContentLength, defaultOwner, maxDocs);
    }

    public synchronized DocumentEntry createDocument(String title, String owner, String content) {
        if (documents.size() >= maxDocs) {
            throw new IllegalArgumentException("Document limit reached.");
        }
        String normalizedTitle = normalizeTitle(title);
        String normalizedOwner = normalizeEmail(owner, "Owner");
        String normalizedContent = normalizeContent(content);
        String id = "doc-" + docSequence.getAndIncrement();
        Instant now = Instant.now();
        DocumentEntry entry = new DocumentEntry(id, normalizedTitle, normalizedContent, normalizedOwner,
                normalizedOwner, 1, now, now);
        documents.put(id, entry);
        versions.put(id, new ArrayList<>(List.of(new DocumentVersion(1, normalizedContent, normalizedOwner, now))));
        comments.put(id, new ArrayList<>());
        collaborators.put(id, new ArrayList<>(List.of(new CollaboratorEntry(normalizedOwner, "OWNER", now))));
        return entry;
    }

    public synchronized DocumentEntry updateDocument(String docId, String editor, String content) {
        DocumentEntry existing = getDocument(docId);
        String normalizedEditor = normalizeEmail(editor, "Editor");
        ensureCanEdit(docId, normalizedEditor);
        String normalizedContent = normalizeContent(content);
        int nextVersion = existing.version() + 1;
        Instant now = Instant.now();
        DocumentEntry updated = new DocumentEntry(existing.id(), existing.title(), normalizedContent,
                existing.owner(), normalizedEditor, nextVersion, existing.createdAt(), now);
        documents.put(docId, updated);
        versions.computeIfAbsent(docId, ignored -> new ArrayList<>())
                .add(new DocumentVersion(nextVersion, normalizedContent, normalizedEditor, now));
        return updated;
    }

    public synchronized CollaboratorEntry addCollaborator(String docId, String email, String role) {
        getDocument(docId);
        String normalizedEmail = normalizeEmail(email, "Collaborator");
        String normalizedRole = normalizeRole(role);
        List<CollaboratorEntry> current = collaborators.computeIfAbsent(docId, ignored -> new ArrayList<>());
        current.removeIf(entry -> entry.email().equalsIgnoreCase(normalizedEmail));
        CollaboratorEntry entry = new CollaboratorEntry(normalizedEmail, normalizedRole, Instant.now());
        current.add(entry);
        return entry;
    }

    public synchronized CommentEntry addComment(String docId, String author, String message) {
        getDocument(docId);
        String normalizedAuthor = normalizeEmail(author, "Author");
        if (!StringUtils.hasText(message)) {
            throw new IllegalArgumentException("Comment message cannot be empty.");
        }
        String normalizedMessage = message.trim();
        if (normalizedMessage.length() > 500) {
            throw new IllegalArgumentException("Comment must be at most 500 characters.");
        }
        String id = "cmt-" + commentSequence.getAndIncrement();
        CommentEntry entry = new CommentEntry(id, normalizedAuthor, normalizedMessage, false, Instant.now());
        comments.computeIfAbsent(docId, ignored -> new ArrayList<>()).add(entry);
        return entry;
    }

    public synchronized CommentEntry resolveComment(String docId, String commentId) {
        getDocument(docId);
        List<CommentEntry> list = comments.computeIfAbsent(docId, ignored -> new ArrayList<>());
        for (int i = 0; i < list.size(); i++) {
            CommentEntry existing = list.get(i);
            if (existing.id().equals(commentId)) {
                CommentEntry updated = new CommentEntry(existing.id(), existing.author(), existing.message(),
                        true, existing.createdAt());
                list.set(i, updated);
                return updated;
            }
        }
        throw new IllegalArgumentException("Comment not found.");
    }

    public List<DocumentEntry> listDocuments() {
        return documents.values().stream()
                .sorted(Comparator.comparing(DocumentEntry::updatedAt).reversed())
                .toList();
    }

    public DocumentEntry getDocument(String docId) {
        DocumentEntry entry = documents.get(docId);
        if (entry == null) {
            throw new IllegalArgumentException("Document not found.");
        }
        return entry;
    }

    public List<DocumentVersion> listVersions(String docId) {
        getDocument(docId);
        List<DocumentVersion> list = versions.getOrDefault(docId, List.of());
        return list.stream()
                .sorted(Comparator.comparing(DocumentVersion::version).reversed())
                .toList();
    }

    public List<CommentEntry> listComments(String docId) {
        getDocument(docId);
        List<CommentEntry> list = comments.getOrDefault(docId, List.of());
        return list.stream()
                .sorted(Comparator.comparing(CommentEntry::createdAt))
                .toList();
    }

    public List<CollaboratorEntry> listCollaborators(String docId) {
        getDocument(docId);
        List<CollaboratorEntry> list = collaborators.getOrDefault(docId, List.of());
        return list.stream()
                .sorted(Comparator.comparing(CollaboratorEntry::addedAt))
                .toList();
    }

    private void ensureCanEdit(String docId, String editor) {
        List<CollaboratorEntry> list = collaborators.getOrDefault(docId, List.of());
        for (CollaboratorEntry entry : list) {
            if (entry.email().equalsIgnoreCase(editor)) {
                if ("VIEWER".equals(entry.role())) {
                    throw new IllegalArgumentException("Viewer role cannot edit this document.");
                }
                return;
            }
        }
        throw new IllegalArgumentException("Editor is not a collaborator on this document.");
    }

    private String normalizeTitle(String title) {
        if (!StringUtils.hasText(title)) {
            throw new IllegalArgumentException("Title cannot be empty.");
        }
        String normalized = title.trim();
        if (normalized.length() > 120) {
            throw new IllegalArgumentException("Title must be at most 120 characters.");
        }
        return normalized;
    }

    private String normalizeEmail(String email, String label) {
        if (!StringUtils.hasText(email)) {
            throw new IllegalArgumentException(label + " cannot be empty.");
        }
        String normalized = email.trim().toLowerCase();
        if (!normalized.contains("@")) {
            throw new IllegalArgumentException(label + " must be a valid email.");
        }
        return normalized;
    }

    private String normalizeContent(String content) {
        if (!StringUtils.hasText(content)) {
            throw new IllegalArgumentException("Document content cannot be empty.");
        }
        String normalized = content.trim();
        if (normalized.length() > maxContentLength) {
            throw new IllegalArgumentException("Content exceeds max length of " + maxContentLength + " characters.");
        }
        return normalized;
    }

    private String normalizeRole(String role) {
        if (!StringUtils.hasText(role)) {
            throw new IllegalArgumentException("Role cannot be empty.");
        }
        String normalized = role.trim().toUpperCase();
        if (!normalized.equals("OWNER") && !normalized.equals("EDITOR") && !normalized.equals("VIEWER")) {
            throw new IllegalArgumentException("Role must be OWNER, EDITOR, or VIEWER.");
        }
        return normalized;
    }
}
