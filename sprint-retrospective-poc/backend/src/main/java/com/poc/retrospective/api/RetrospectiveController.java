package com.poc.retrospective.api;

import com.poc.retrospective.model.ActionItem;
import com.poc.retrospective.model.RetroItem;
import com.poc.retrospective.model.Sprint;
import com.poc.retrospective.model.Team;
import com.poc.retrospective.service.RetrospectiveService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class RetrospectiveController {
  private final RetrospectiveService service;

  public RetrospectiveController(RetrospectiveService service) {
    this.service = service;
  }

  @GetMapping("/health")
  public String health() {
    return "ok";
  }

  @GetMapping("/teams")
  public List<TeamResponse> listTeams() {
    return service.listTeams().stream().map(this::toResponse).collect(Collectors.toList());
  }

  @PostMapping("/teams")
  @ResponseStatus(HttpStatus.CREATED)
  public TeamResponse createTeam(@Valid @RequestBody CreateTeamRequest request) {
    Team team = service.createTeam(request.name());
    return toResponse(team);
  }

  @GetMapping("/teams/{teamId}/sprints")
  public List<SprintResponse> listSprints(@PathVariable long teamId) {
    return service.listSprints(teamId).stream().map(this::toResponse).collect(Collectors.toList());
  }

  @PostMapping("/teams/{teamId}/sprints")
  @ResponseStatus(HttpStatus.CREATED)
  public SprintResponse createSprint(@PathVariable long teamId, @Valid @RequestBody CreateSprintRequest request) {
    Sprint sprint = service.createSprint(teamId, request.name(), request.startDate(), request.endDate());
    return toResponse(sprint);
  }

  @GetMapping("/sprints/{sprintId}/board")
  public RetroBoardResponse getBoard(@PathVariable long sprintId) {
    return service.getBoard(sprintId);
  }

  @GetMapping("/sprints/{sprintId}/summary")
  public RetroSummaryResponse getSummary(@PathVariable long sprintId) {
    return service.getSummary(sprintId);
  }

  @PostMapping("/sprints/{sprintId}/items")
  @ResponseStatus(HttpStatus.CREATED)
  public RetroItemResponse addItem(@PathVariable long sprintId, @Valid @RequestBody CreateItemRequest request) {
    RetroItem item = service.addItem(sprintId, request.type(), request.text(), request.author());
    return toResponse(item);
  }

  @PostMapping("/items/{itemId}/vote")
  public RetroItemResponse vote(@PathVariable long itemId, @Valid @RequestBody VoteRequest request) {
    RetroItem item = service.voteItem(itemId, request.delta());
    return toResponse(item);
  }

  @PostMapping("/items/{itemId}/convert-action")
  @ResponseStatus(HttpStatus.CREATED)
  public ActionItemResponse convertToAction(@PathVariable long itemId, @Valid @RequestBody ConvertActionRequest request) {
    ActionItem action = service.convertToAction(itemId, request.owner(), request.dueDate(), request.overrideText());
    return toResponse(action);
  }

  @PostMapping("/action-items/{actionId}/complete")
  public ActionItemResponse completeAction(@PathVariable long actionId, @Valid @RequestBody CompleteActionRequest request) {
    ActionItem action = service.markAction(actionId, request.done());
    return toResponse(action);
  }

  private TeamResponse toResponse(Team team) {
    return new TeamResponse(team.getId(), team.getName(), team.getCreatedAt());
  }

  private SprintResponse toResponse(Sprint sprint) {
    return new SprintResponse(
        sprint.getId(),
        sprint.getTeamId(),
        sprint.getName(),
        sprint.getStartDate(),
        sprint.getEndDate(),
        sprint.getCreatedAt()
    );
  }

  private RetroItemResponse toResponse(RetroItem item) {
    return new RetroItemResponse(
        item.getId(),
        item.getSprintId(),
        item.getType(),
        item.getText(),
        item.getAuthor(),
        item.getVotes(),
        item.getActionItemId(),
        item.getCreatedAt()
    );
  }

  private ActionItemResponse toResponse(ActionItem item) {
    return new ActionItemResponse(
        item.getId(),
        item.getSprintId(),
        item.getText(),
        item.getOwner(),
        item.getDueDate(),
        item.getSourceItemId(),
        item.getStatus(),
        item.getCreatedAt()
    );
  }
}
