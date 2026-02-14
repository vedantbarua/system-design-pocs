package com.poc.leaderelection.model;

public class RaftNode {
  private final String id;
  private NodeState state;
  private int term;
  private String votedFor;
  private boolean alive;
  private long electionDeadlineMs;
  private long lastHeartbeatMs;
  private long lastLogValue;

  public RaftNode(String id) {
    this.id = id;
    this.state = NodeState.FOLLOWER;
    this.term = 0;
    this.votedFor = null;
    this.alive = true;
    this.electionDeadlineMs = 0L;
    this.lastHeartbeatMs = 0L;
    this.lastLogValue = 0L;
  }

  public String getId() {
    return id;
  }

  public NodeState getState() {
    return state;
  }

  public void setState(NodeState state) {
    this.state = state;
  }

  public int getTerm() {
    return term;
  }

  public void setTerm(int term) {
    this.term = term;
  }

  public String getVotedFor() {
    return votedFor;
  }

  public void setVotedFor(String votedFor) {
    this.votedFor = votedFor;
  }

  public boolean isAlive() {
    return alive;
  }

  public void setAlive(boolean alive) {
    this.alive = alive;
  }

  public long getElectionDeadlineMs() {
    return electionDeadlineMs;
  }

  public void setElectionDeadlineMs(long electionDeadlineMs) {
    this.electionDeadlineMs = electionDeadlineMs;
  }

  public long getLastHeartbeatMs() {
    return lastHeartbeatMs;
  }

  public void setLastHeartbeatMs(long lastHeartbeatMs) {
    this.lastHeartbeatMs = lastHeartbeatMs;
  }

  public long getLastLogValue() {
    return lastLogValue;
  }

  public void setLastLogValue(long lastLogValue) {
    this.lastLogValue = lastLogValue;
  }
}
