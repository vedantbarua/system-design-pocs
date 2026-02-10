package com.poc.retrospective.model;

import java.time.Instant;
import java.time.LocalDate;

public class Sprint {
  private final long id;
  private final long teamId;
  private final String name;
  private final LocalDate startDate;
  private final LocalDate endDate;
  private final Instant createdAt;

  public Sprint(long id, long teamId, String name, LocalDate startDate, LocalDate endDate, Instant createdAt) {
    this.id = id;
    this.teamId = teamId;
    this.name = name;
    this.startDate = startDate;
    this.endDate = endDate;
    this.createdAt = createdAt;
  }

  public long getId() {
    return id;
  }

  public long getTeamId() {
    return teamId;
  }

  public String getName() {
    return name;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public LocalDate getEndDate() {
    return endDate;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
