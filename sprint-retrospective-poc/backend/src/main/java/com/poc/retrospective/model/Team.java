package com.poc.retrospective.model;

import java.time.Instant;

public class Team {
  private final long id;
  private final String name;
  private final Instant createdAt;

  public Team(long id, String name, Instant createdAt) {
    this.id = id;
    this.name = name;
    this.createdAt = createdAt;
  }

  public long getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
