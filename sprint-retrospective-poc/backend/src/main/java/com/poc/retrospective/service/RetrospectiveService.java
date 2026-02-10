package com.poc.retrospective.service;

import com.poc.retrospective.api.*;
import com.poc.retrospective.model.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RetrospectiveService {
  private final AtomicLong teamIds = new AtomicLong(100);
  private final AtomicLong sprintIds = new AtomicLong(200);
  private final AtomicLong itemIds = new AtomicLong(1000);
  private final AtomicLong actionIds = new AtomicLong(2000);

  private final Map<Long, Team> teams = new ConcurrentHashMap<>();
  private final Map<Long, Sprint> sprints = new ConcurrentHashMap<>();
  private final Map<Long, RetroItem> items = new ConcurrentHashMap<>();
  private final Map<Long, ActionItem> actions = new ConcurrentHashMap<>();
  private final Map<Long, List<Long>> sprintItems = new ConcurrentHashMap<>();
  private final Map<Long, List<Long>> sprintActions = new ConcurrentHashMap<>();

  private final int maxItemsPerSprint;
  private final int maxActionItems;

  public RetrospectiveService(
      @Value("${app.max-items-per-sprint:200}") int maxItemsPerSprint,
      @Value("${app.max-action-items:80}") int maxActionItems) {
    this.maxItemsPerSprint = maxItemsPerSprint;
    this.maxActionItems = maxActionItems;
    seed();
  }

  public List<Team> listTeams() {
    return new ArrayList<>(teams.values());
  }

  public Team createTeam(String name) {
    long id = teamIds.incrementAndGet();
    Team team = new Team(id, name, Instant.now());
    teams.put(id, team);
    return team;
  }

  public List<Sprint> listSprints(long teamId) {
    ensureTeam(teamId);
    return sprints.values().stream()
        .filter(sprint -> sprint.getTeamId() == teamId)
        .sorted(Comparator.comparing(Sprint::getCreatedAt).reversed())
        .collect(Collectors.toList());
  }

  public Sprint createSprint(long teamId, String name, LocalDate startDate, LocalDate endDate) {
    ensureTeam(teamId);
    long id = sprintIds.incrementAndGet();
    Sprint sprint = new Sprint(id, teamId, name, startDate, endDate, Instant.now());
    sprints.put(id, sprint);
    return sprint;
  }

  public RetroItem addItem(long sprintId, ItemType type, String text, String author) {
    Sprint sprint = ensureSprint(sprintId);
    List<Long> sprintItemList = sprintItems.computeIfAbsent(sprintId, key -> new ArrayList<>());
    if (sprintItemList.size() >= maxItemsPerSprint) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprint reached item limit");
    }
    long id = itemIds.incrementAndGet();
    RetroItem item = new RetroItem(id, sprint.getId(), type, text, author, Instant.now());
    items.put(id, item);
    sprintItemList.add(id);
    return item;
  }

  public RetroItem voteItem(long itemId, int delta) {
    RetroItem item = ensureItem(itemId);
    item.adjustVotes(delta);
    return item;
  }

  public ActionItem convertToAction(long itemId, String owner, LocalDate dueDate, String overrideText) {
    RetroItem item = ensureItem(itemId);
    if (item.getActionItemId() != null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Item already converted");
    }
    List<Long> sprintActionList = sprintActions.computeIfAbsent(item.getSprintId(), key -> new ArrayList<>());
    if (sprintActionList.size() >= maxActionItems) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprint reached action item limit");
    }
    String text = overrideText != null && !overrideText.isBlank() ? overrideText : item.getText();
    long id = actionIds.incrementAndGet();
    ActionItem action = new ActionItem(id, item.getSprintId(), text, owner, dueDate, item.getId(), Instant.now());
    actions.put(id, action);
    sprintActionList.add(id);
    item.setActionItemId(id);
    return action;
  }

  public ActionItem markAction(long actionId, boolean done) {
    ActionItem action = ensureAction(actionId);
    action.setStatus(done ? ActionStatus.DONE : ActionStatus.OPEN);
    return action;
  }

  public RetroBoardResponse getBoard(long sprintId) {
    Sprint sprint = ensureSprint(sprintId);
    Team team = ensureTeam(sprint.getTeamId());
    Map<ItemType, List<RetroItemResponse>> itemsByType = new EnumMap<>(ItemType.class);
    for (ItemType type : ItemType.values()) {
      itemsByType.put(type, new ArrayList<>());
    }
    List<RetroItem> itemList = getItemsForSprint(sprintId);
    itemList.stream()
        .sorted(Comparator.comparingInt(RetroItem::getVotes).reversed()
            .thenComparing(RetroItem::getCreatedAt, Comparator.reverseOrder()))
        .forEach(item -> itemsByType.get(item.getType()).add(toResponse(item)));

    List<ActionItemResponse> actionResponses = getActionsForSprint(sprintId).stream()
        .sorted(Comparator.comparing(ActionItem::getCreatedAt).reversed())
        .map(this::toResponse)
        .collect(Collectors.toList());

    RetroSummaryResponse summary = getSummary(sprintId);

    return new RetroBoardResponse(
        toResponse(team),
        toResponse(sprint),
        itemsByType,
        actionResponses,
        summary
    );
  }

  public RetroSummaryResponse getSummary(long sprintId) {
    List<RetroItem> itemList = getItemsForSprint(sprintId);
    int totalItems = itemList.size();
    int totalVotes = itemList.stream().mapToInt(RetroItem::getVotes).sum();
    List<TopItemResponse> topItems = itemList.stream()
        .sorted(Comparator.comparingInt(RetroItem::getVotes).reversed())
        .limit(3)
        .map(item -> new TopItemResponse(item.getId(), item.getType(), item.getText(), item.getVotes()))
        .collect(Collectors.toList());

    List<ActionItem> actionList = getActionsForSprint(sprintId);
    double completionRate = 0.0;
    if (!actionList.isEmpty()) {
      long done = actionList.stream().filter(action -> action.getStatus() == ActionStatus.DONE).count();
      completionRate = (double) done / actionList.size();
    }

    return new RetroSummaryResponse(totalItems, totalVotes, completionRate, topItems);
  }

  private List<RetroItem> getItemsForSprint(long sprintId) {
    List<Long> ids = sprintItems.getOrDefault(sprintId, List.of());
    return ids.stream().map(items::get).collect(Collectors.toList());
  }

  private List<ActionItem> getActionsForSprint(long sprintId) {
    List<Long> ids = sprintActions.getOrDefault(sprintId, List.of());
    return ids.stream().map(actions::get).collect(Collectors.toList());
  }

  private Team ensureTeam(long teamId) {
    Team team = teams.get(teamId);
    if (team == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Team not found");
    }
    return team;
  }

  private Sprint ensureSprint(long sprintId) {
    Sprint sprint = sprints.get(sprintId);
    if (sprint == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sprint not found");
    }
    return sprint;
  }

  private RetroItem ensureItem(long itemId) {
    RetroItem item = items.get(itemId);
    if (item == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found");
    }
    return item;
  }

  private ActionItem ensureAction(long actionId) {
    ActionItem action = actions.get(actionId);
    if (action == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Action item not found");
    }
    return action;
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

  private void seed() {
    Team team = createTeam("Orion Platform");
    Sprint sprint = createSprint(team.getId(), "Sprint 42", LocalDate.now().minusDays(14), LocalDate.now());

    RetroItem item1 = addItem(sprint.getId(), ItemType.WENT_WELL, "Infra deploys were zero-touch", "Asha");
    RetroItem item2 = addItem(sprint.getId(), ItemType.DID_NOT_GO_WELL, "CI queue times spiked mid-week", "Miguel");
    RetroItem item3 = addItem(sprint.getId(), ItemType.IDEA, "Automate flaky test quarantine", "Priya");

    voteItem(item1.getId(), 3);
    voteItem(item2.getId(), 2);
    convertToAction(item2.getId(), "DevOps", LocalDate.now().plusDays(10), "Reduce CI queue by scaling runners");
    convertToAction(item3.getId(), "QA Lead", LocalDate.now().plusDays(12), null);
  }
}
