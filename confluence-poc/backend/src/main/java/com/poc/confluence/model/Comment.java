package com.poc.confluence.model;

import java.time.Instant;

public class Comment {
  private final long id;
  private final long pageId;
  private String author;
  private String text;
  private final Instant createdAt;

  public Comment(long id, long pageId, String author, String text, Instant createdAt) {
    this.id = id;
    this.pageId = pageId;
    this.author = author;
    this.text = text;
    this.createdAt = createdAt;
  }

  public long getId() {
    return id;
  }

  public long getPageId() {
    return pageId;
  }

  public String getAuthor() {
    return author;
  }

  public void setAuthor(String author) {
    this.author = author;
  }

  public String getText() {
    return text;
  }

  public void setText(String text) {
    this.text = text;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
