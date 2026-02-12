package com.poc.teams.api;

import com.poc.teams.model.ProjectStatus;
import jakarta.validation.constraints.NotBlank;

public class CreateProjectRequest {
  @NotBlank
  private String name;
  private String goal;
  private ProjectStatus status = ProjectStatus.PLANNING;

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
}
