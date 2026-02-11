package com.poc.confluence.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class Space {
  private final long id;
  private String key;
  private String name;
  private String owner;
  private final Instant createdAt;
  private final List<Long> pageIds = new ArrayList<>();

  public Space(long id, String key, String name, String owner, Instant createdAt) {
    this.id = id;
    this.key = key;
    this.name = name;
    this.owner = owner;
    this.createdAt = createdAt;
  }

  public long getId() {
    return id;
  }

  public String getKey() {
    return key;
  }

  public void setKey(String key) {
    this.key = key;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getOwner() {
    return owner;
  }

  public void setOwner(String owner) {
    this.owner = owner;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public List<Long> getPageIds() {
    return pageIds;
  }
}
