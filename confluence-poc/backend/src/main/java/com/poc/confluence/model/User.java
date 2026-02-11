package com.poc.confluence.model;

public class User {
  private final long id;
  private String name;
  private String role;

  public User(long id, String name, String role) {
    this.id = id;
    this.name = name;
    this.role = role;
  }

  public long getId() {
    return id;
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
}
