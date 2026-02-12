package com.poc.teams.model;

import java.time.Instant;

public class Assignment {
  private String id;
  private String memberId;
  private String projectId;
  private int allocationPercent;
  private Instant createdAt;

  public Assignment() {}

  public Assignment(String id, String memberId, String projectId, int allocationPercent, Instant createdAt) {
    this.id = id;
    this.memberId = memberId;
    this.projectId = projectId;
    this.allocationPercent = allocationPercent;
    this.createdAt = createdAt;
  }

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

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

  public Instant getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(Instant createdAt) {
    this.createdAt = createdAt;
  }
}
