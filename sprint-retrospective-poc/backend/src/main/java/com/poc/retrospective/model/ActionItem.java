package com.poc.retrospective.model;

import java.time.Instant;
import java.time.LocalDate;

public class ActionItem {
  private final long id;
  private final long sprintId;
  private final String text;
  private final String owner;
  private final LocalDate dueDate;
  private final long sourceItemId;
  private final Instant createdAt;
  private ActionStatus status;

  public ActionItem(long id, long sprintId, String text, String owner, LocalDate dueDate, long sourceItemId, Instant createdAt) {
    this.id = id;
    this.sprintId = sprintId;
    this.text = text;
    this.owner = owner;
    this.dueDate = dueDate;
    this.sourceItemId = sourceItemId;
    this.createdAt = createdAt;
    this.status = ActionStatus.OPEN;
  }

  public long getId() {
    return id;
  }

  public long getSprintId() {
    return sprintId;
  }

  public String getText() {
    return text;
  }

  public String getOwner() {
    return owner;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public long getSourceItemId() {
    return sourceItemId;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public ActionStatus getStatus() {
    return status;
  }

  public void setStatus(ActionStatus status) {
    this.status = status;
  }
}
