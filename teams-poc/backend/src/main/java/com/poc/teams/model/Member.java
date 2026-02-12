package com.poc.teams.model;

import java.time.Instant;
import java.util.List;

public class Member {
  private String id;
  private String name;
  private String role;
  private String location;
  private MemberStatus status;
  private List<String> skills;
  private Instant createdAt;

  public Member() {}

  public Member(String id, String name, String role, String location, MemberStatus status, List<String> skills, Instant createdAt) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.location = location;
    this.status = status;
    this.skills = skills;
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

  public List<String> getSkills() {
    return skills;
  }

  public void setSkills(List<String> skills) {
    this.skills = skills;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(Instant createdAt) {
    this.createdAt = createdAt;
  }
}
