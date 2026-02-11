package com.poc.confluence.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class Page {
  private final long id;
  private final long spaceId;
  private String title;
  private String body;
  private PageStatus status;
  private int version;
  private String lastEditedBy;
  private Instant lastUpdatedAt;
  private final List<String> labels = new ArrayList<>();

  public Page(long id, long spaceId, String title, String body, PageStatus status,
              int version, String lastEditedBy, Instant lastUpdatedAt) {
    this.id = id;
    this.spaceId = spaceId;
    this.title = title;
    this.body = body;
    this.status = status;
    this.version = version;
    this.lastEditedBy = lastEditedBy;
    this.lastUpdatedAt = lastUpdatedAt;
  }

  public long getId() {
    return id;
  }

  public long getSpaceId() {
    return spaceId;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getBody() {
    return body;
  }

  public void setBody(String body) {
    this.body = body;
  }

  public PageStatus getStatus() {
    return status;
  }

  public void setStatus(PageStatus status) {
    this.status = status;
  }

  public int getVersion() {
    return version;
  }

  public void setVersion(int version) {
    this.version = version;
  }

  public String getLastEditedBy() {
    return lastEditedBy;
  }

  public void setLastEditedBy(String lastEditedBy) {
    this.lastEditedBy = lastEditedBy;
  }

  public Instant getLastUpdatedAt() {
    return lastUpdatedAt;
  }

  public void setLastUpdatedAt(Instant lastUpdatedAt) {
    this.lastUpdatedAt = lastUpdatedAt;
  }

  public List<String> getLabels() {
    return labels;
  }
}
