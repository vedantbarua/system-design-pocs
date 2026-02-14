package com.poc.leaderelection.model;

import java.util.List;

public class ClusterSnapshot {
  private final long nowMs;
  private final String leaderId;
  private final int leaderTerm;
  private final long committedValue;
  private final List<NodeView> nodes;

  public ClusterSnapshot(long nowMs, String leaderId, int leaderTerm, long committedValue, List<NodeView> nodes) {
    this.nowMs = nowMs;
    this.leaderId = leaderId;
    this.leaderTerm = leaderTerm;
    this.committedValue = committedValue;
    this.nodes = nodes;
  }

  public long getNowMs() {
    return nowMs;
  }

  public String getLeaderId() {
    return leaderId;
  }

  public int getLeaderTerm() {
    return leaderTerm;
  }

  public long getCommittedValue() {
    return committedValue;
  }

  public List<NodeView> getNodes() {
    return nodes;
  }

  public static class NodeView {
    private final String id;
    private final NodeState state;
    private final int term;
    private final String votedFor;
    private final boolean alive;
    private final long heartbeatAgeMs;
    private final long electionTimeoutMs;
    private final long lastLogValue;

    public NodeView(String id,
                    NodeState state,
                    int term,
                    String votedFor,
                    boolean alive,
                    long heartbeatAgeMs,
                    long electionTimeoutMs,
                    long lastLogValue) {
      this.id = id;
      this.state = state;
      this.term = term;
      this.votedFor = votedFor;
      this.alive = alive;
      this.heartbeatAgeMs = heartbeatAgeMs;
      this.electionTimeoutMs = electionTimeoutMs;
      this.lastLogValue = lastLogValue;
    }

    public String getId() {
      return id;
    }

    public NodeState getState() {
      return state;
    }

    public int getTerm() {
      return term;
    }

    public String getVotedFor() {
      return votedFor;
    }

    public boolean isAlive() {
      return alive;
    }

    public long getHeartbeatAgeMs() {
      return heartbeatAgeMs;
    }

    public long getElectionTimeoutMs() {
      return electionTimeoutMs;
    }

    public long getLastLogValue() {
      return lastLogValue;
    }
  }
}
