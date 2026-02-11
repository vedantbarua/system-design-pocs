package com.poc.confluence.service;

import com.poc.confluence.api.CommentResponse;
import com.poc.confluence.api.CreateCommentRequest;
import com.poc.confluence.api.CreatePageRequest;
import com.poc.confluence.api.CreateSpaceRequest;
import com.poc.confluence.api.PageResponse;
import com.poc.confluence.api.SpaceResponse;
import com.poc.confluence.api.UpdatePageRequest;
import com.poc.confluence.model.Comment;
import com.poc.confluence.model.Page;
import com.poc.confluence.model.PageStatus;
import com.poc.confluence.model.Space;
import com.poc.confluence.model.User;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class ConfluenceService {
  private final AtomicLong spaceId = new AtomicLong(200);
  private final AtomicLong pageId = new AtomicLong(500);
  private final AtomicLong commentId = new AtomicLong(900);
  private final AtomicLong userId = new AtomicLong(50);

  private final Map<Long, Space> spaces = new ConcurrentHashMap<>();
  private final Map<Long, Page> pages = new ConcurrentHashMap<>();
  private final Map<Long, List<Comment>> commentsByPage = new ConcurrentHashMap<>();
  private final Map<Long, User> users = new ConcurrentHashMap<>();

  public ConfluenceService() {
    seed();
  }

  public List<SpaceResponse> listSpaces() {
    return spaces.values().stream()
        .sorted(Comparator.comparing(Space::getCreatedAt))
        .map(this::toSpaceResponse)
        .collect(Collectors.toList());
  }

  public SpaceResponse createSpace(CreateSpaceRequest request) {
    long id = spaceId.incrementAndGet();
    Space space = new Space(id, request.key(), request.name(), request.owner(), Instant.now());
    spaces.put(id, space);
    return toSpaceResponse(space);
  }

  public List<PageResponse> listPages(long spaceId) {
    Space space = requireSpace(spaceId);
    return space.getPageIds().stream()
        .map(pages::get)
        .filter(page -> page != null)
        .sorted(Comparator.comparing(Page::getLastUpdatedAt).reversed())
        .map(this::toPageResponse)
        .collect(Collectors.toList());
  }

  public PageResponse createPage(long spaceId, CreatePageRequest request) {
    Space space = requireSpace(spaceId);
    long id = pageId.incrementAndGet();
    Page page = new Page(id, spaceId, request.title(),
        Optional.ofNullable(request.body()).orElse(""),
        PageStatus.DRAFT,
        1,
        request.author(),
        Instant.now());
    if (request.labels() != null) {
      page.getLabels().addAll(request.labels());
    }
    pages.put(id, page);
    space.getPageIds().add(id);
    return toPageResponse(page);
  }

  public PageResponse getPage(long pageId) {
    return toPageResponse(requirePage(pageId));
  }

  public PageResponse updatePage(long pageId, UpdatePageRequest request) {
    Page page = requirePage(pageId);
    page.setTitle(request.title());
    page.setBody(Optional.ofNullable(request.body()).orElse(""));
    if (request.labels() != null) {
      page.getLabels().clear();
      page.getLabels().addAll(request.labels());
    }
    if (request.status() != null) {
      page.setStatus(request.status());
    }
    page.setLastEditedBy(request.editor());
    page.setVersion(page.getVersion() + 1);
    page.setLastUpdatedAt(Instant.now());
    return toPageResponse(page);
  }

  public List<CommentResponse> listComments(long pageId) {
    requirePage(pageId);
    return commentsByPage.getOrDefault(pageId, List.of()).stream()
        .sorted(Comparator.comparing(Comment::getCreatedAt))
        .map(this::toCommentResponse)
        .collect(Collectors.toList());
  }

  public CommentResponse addComment(long pageId, CreateCommentRequest request) {
    requirePage(pageId);
    long id = commentId.incrementAndGet();
    Comment comment = new Comment(id, pageId, request.author(), request.text(), Instant.now());
    commentsByPage.computeIfAbsent(pageId, key -> new ArrayList<>()).add(comment);
    return toCommentResponse(comment);
  }

  public List<PageResponse> searchPages(String query) {
    String normalized = Optional.ofNullable(query).orElse("").trim().toLowerCase();
    return pages.values().stream()
        .filter(page -> matches(page, normalized))
        .sorted(Comparator.comparing(Page::getLastUpdatedAt).reversed())
        .map(this::toPageResponse)
        .collect(Collectors.toList());
  }

  public List<PageResponse> recentPages(int limit) {
    return pages.values().stream()
        .sorted(Comparator.comparing(Page::getLastUpdatedAt).reversed())
        .limit(limit)
        .map(this::toPageResponse)
        .collect(Collectors.toList());
  }

  public List<User> listUsers() {
    return users.values().stream()
        .sorted(Comparator.comparing(User::getName))
        .collect(Collectors.toList());
  }

  private boolean matches(Page page, String query) {
    if (query.isEmpty()) {
      return true;
    }
    if (page.getTitle().toLowerCase().contains(query)) {
      return true;
    }
    if (page.getBody().toLowerCase().contains(query)) {
      return true;
    }
    return page.getLabels().stream().anyMatch(label -> label.toLowerCase().contains(query));
  }

  private Space requireSpace(long id) {
    Space space = spaces.get(id);
    if (space == null) {
      throw new IllegalArgumentException("Space not found: " + id);
    }
    return space;
  }

  private Page requirePage(long id) {
    Page page = pages.get(id);
    if (page == null) {
      throw new IllegalArgumentException("Page not found: " + id);
    }
    return page;
  }

  private SpaceResponse toSpaceResponse(Space space) {
    return new SpaceResponse(
        space.getId(),
        space.getKey(),
        space.getName(),
        space.getOwner(),
        space.getCreatedAt(),
        space.getPageIds().size()
    );
  }

  private PageResponse toPageResponse(Page page) {
    return new PageResponse(
        page.getId(),
        page.getSpaceId(),
        page.getTitle(),
        page.getBody(),
        page.getStatus(),
        page.getVersion(),
        page.getLastEditedBy(),
        page.getLastUpdatedAt(),
        List.copyOf(page.getLabels())
    );
  }

  private CommentResponse toCommentResponse(Comment comment) {
    return new CommentResponse(
        comment.getId(),
        comment.getPageId(),
        comment.getAuthor(),
        comment.getText(),
        comment.getCreatedAt()
    );
  }

  private void seed() {
    User owner = new User(userId.incrementAndGet(), "Priya", "Owner");
    User writer = new User(userId.incrementAndGet(), "Mateo", "Writer");
    User reviewer = new User(userId.incrementAndGet(), "Selena", "Reviewer");
    users.put(owner.getId(), owner);
    users.put(writer.getId(), writer);
    users.put(reviewer.getId(), reviewer);

    Space eng = new Space(spaceId.incrementAndGet(), "ENG", "Engineering", owner.getName(), Instant.now());
    Space product = new Space(spaceId.incrementAndGet(), "PROD", "Product", writer.getName(), Instant.now());
    spaces.put(eng.getId(), eng);
    spaces.put(product.getId(), product);

    Page launch = new Page(pageId.incrementAndGet(), eng.getId(), "Release 42 Launch Notes",
        "## Goals\n- Reduce flaky tests\n- Improve onboarding\n\n## Risks\n- Capacity during PTO week",
        PageStatus.PUBLISHED, 3, reviewer.getName(), Instant.now());
    launch.getLabels().addAll(List.of("sprint", "launch", "reliability"));
    pages.put(launch.getId(), launch);
    eng.getPageIds().add(launch.getId());

    Page playbook = new Page(pageId.incrementAndGet(), eng.getId(), "On-call Playbook",
        "### Escalation\n1. Check dashboards\n2. Page incident commander\n\n### Links\n- Runbooks\n- Status page",
        PageStatus.DRAFT, 1, owner.getName(), Instant.now());
    playbook.getLabels().addAll(List.of("runbook", "ops"));
    pages.put(playbook.getId(), playbook);
    eng.getPageIds().add(playbook.getId());

    Page roadmap = new Page(pageId.incrementAndGet(), product.getId(), "Q1 Product Roadmap",
        "- Checkout redesign\n- Billing reliability\n- Mobile performance",
        PageStatus.PUBLISHED, 2, writer.getName(), Instant.now());
    roadmap.getLabels().addAll(List.of("roadmap", "q1"));
    pages.put(roadmap.getId(), roadmap);
    product.getPageIds().add(roadmap.getId());

    Comment c1 = new Comment(commentId.incrementAndGet(), launch.getId(), "Liam",
        "Add a note about rollback procedure.", Instant.now());
    Comment c2 = new Comment(commentId.incrementAndGet(), launch.getId(), "Priya",
        "Added in the runbook section.", Instant.now());
    commentsByPage.put(launch.getId(), new ArrayList<>(List.of(c1, c2)));
  }
}
