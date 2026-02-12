package com.poc.teams.model;

import java.time.Instant;

public class Project {
  private String id;
  private String name;
  private String goal;
  private ProjectStatus status;
  private Instant createdAt;

  public Project() {}

  public Project(String id, String name, String goal, ProjectStatus status, Instant createdAt) {
    this.id = id;
    this.name = name;
    this.goal = goal;
    this.status = status;
    this.createdAt = createdAt;
  }

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getGoal() {
    return goal;
  }

  public void setGoal(String goal) {
    this.goal = goal;
  }

  public ProjectStatus getStatus() {
    return status;
  }

  public void setStatus(ProjectStatus status) {
    this.status = status;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(Instant createdAt) {
    this.createdAt = createdAt;
  }
}
