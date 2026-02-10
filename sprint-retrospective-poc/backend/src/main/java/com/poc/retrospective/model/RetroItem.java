package com.poc.retrospective.model;

import java.time.Instant;

public class RetroItem {
  private final long id;
  private final long sprintId;
  private final ItemType type;
  private final String text;
  private final String author;
  private final Instant createdAt;
  private int votes;
  private Long actionItemId;

  public RetroItem(long id, long sprintId, ItemType type, String text, String author, Instant createdAt) {
    this.id = id;
    this.sprintId = sprintId;
    this.type = type;
    this.text = text;
    this.author = author;
    this.createdAt = createdAt;
    this.votes = 0;
  }

  public long getId() {
    return id;
  }

  public long getSprintId() {
    return sprintId;
  }

  public ItemType getType() {
    return type;
  }

  public String getText() {
    return text;
  }

  public String getAuthor() {
    return author;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public int getVotes() {
    return votes;
  }

  public void adjustVotes(int delta) {
    this.votes += delta;
  }

  public Long getActionItemId() {
    return actionItemId;
  }

  public void setActionItemId(Long actionItemId) {
    this.actionItemId = actionItemId;
  }
}
