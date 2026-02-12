package com.poc.teams.api;

import com.poc.teams.model.MemberStatus;

public class UpdateMemberRequest {
  private String role;
  private String location;
  private MemberStatus status;

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public String getLocation() {
    return location;
  }

  public void setLocation(String location) {
    this.location = location;
  }

  public MemberStatus getStatus() {
    return status;
  }

  public void setStatus(MemberStatus status) {
    this.status = status;
  }
}
