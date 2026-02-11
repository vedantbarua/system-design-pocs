package com.poc.confluence.api;

import com.poc.confluence.model.User;
import com.poc.confluence.service.ConfluenceService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ConfluenceController {
  private final ConfluenceService service;

  public ConfluenceController(ConfluenceService service) {
    this.service = service;
  }

  @GetMapping("/spaces")
  public List<SpaceResponse> listSpaces() {
    return service.listSpaces();
  }

  @PostMapping("/spaces")
  @ResponseStatus(HttpStatus.CREATED)
  public SpaceResponse createSpace(@Valid @RequestBody CreateSpaceRequest request) {
    return service.createSpace(request);
  }

  @GetMapping("/spaces/{spaceId}/pages")
  public List<PageResponse> listPages(@PathVariable long spaceId) {
    return service.listPages(spaceId);
  }

  @PostMapping("/spaces/{spaceId}/pages")
  @ResponseStatus(HttpStatus.CREATED)
  public PageResponse createPage(@PathVariable long spaceId,
                                 @Valid @RequestBody CreatePageRequest request) {
    return service.createPage(spaceId, request);
  }

  @GetMapping("/pages/{pageId}")
  public PageResponse getPage(@PathVariable long pageId) {
    return service.getPage(pageId);
  }

  @PutMapping("/pages/{pageId}")
  public PageResponse updatePage(@PathVariable long pageId,
                                 @Valid @RequestBody UpdatePageRequest request) {
    return service.updatePage(pageId, request);
  }

  @GetMapping("/pages/{pageId}/comments")
  public List<CommentResponse> listComments(@PathVariable long pageId) {
    return service.listComments(pageId);
  }

  @PostMapping("/pages/{pageId}/comments")
  @ResponseStatus(HttpStatus.CREATED)
  public CommentResponse addComment(@PathVariable long pageId,
                                    @Valid @RequestBody CreateCommentRequest request) {
    return service.addComment(pageId, request);
  }

  @GetMapping("/pages/search")
  public List<PageResponse> searchPages(@RequestParam(name = "q", required = false) String query) {
    return service.searchPages(query);
  }

  @GetMapping("/pages/recent")
  public List<PageResponse> recentPages(@RequestParam(name = "limit", defaultValue = "8") int limit) {
    return service.recentPages(limit);
  }

  @GetMapping("/users")
  public List<User> listUsers() {
    return service.listUsers();
  }
}
