package com.poc.teams.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public class CreateAssignmentRequest {
  @NotBlank
  private String memberId;
  @NotBlank
  private String projectId;
  @Min(5)
  @Max(100)
  private int allocationPercent;

  public String getMemberId() {
    return memberId;
  }

  public void setMemberId(String memberId) {
    this.memberId = memberId;
  }

  public String getProjectId() {
    return projectId;
  }

  public void setProjectId(String projectId) {
    this.projectId = projectId;
  }

  public int getAllocationPercent() {
    return allocationPercent;
  }

  public void setAllocationPercent(int allocationPercent) {
    this.allocationPercent = allocationPercent;
  }
}
