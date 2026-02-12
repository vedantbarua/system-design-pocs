package com.poc.teams.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class Team {
  private String id;
  private String name;
  private String mission;
  private int capacity;
  private Instant createdAt;
  private final List<Member> members = new ArrayList<>();
  private final List<Project> projects = new ArrayList<>();
  private final List<Assignment> assignments = new ArrayList<>();

  public Team() {}

  public Team(String id, String name, String mission, int capacity, Instant createdAt) {
    this.id = id;
    this.name = name;
    this.mission = mission;
    this.capacity = capacity;
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

  public String getMission() {
    return mission;
  }

  public void setMission(String mission) {
    this.mission = mission;
  }

  public int getCapacity() {
    return capacity;
  }

  public void setCapacity(int capacity) {
    this.capacity = capacity;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(Instant createdAt) {
    this.createdAt = createdAt;
  }

  public List<Member> getMembers() {
    return members;
  }

  public List<Project> getProjects() {
    return projects;
  }

  public List<Assignment> getAssignments() {
    return assignments;
  }
}
