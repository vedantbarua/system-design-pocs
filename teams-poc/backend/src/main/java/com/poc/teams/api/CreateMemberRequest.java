package com.poc.teams.api;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

public class CreateMemberRequest {
  @NotBlank
  private String name;
  @NotBlank
  private String role;
  private String location;
  private List<String> skills;

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

  public List<String> getSkills() {
    return skills;
  }

  public void setSkills(List<String> skills) {
    this.skills = skills;
  }
}
