package com.poc.leaderelection.service;

import com.poc.leaderelection.model.ClusterSnapshot;
import com.poc.leaderelection.model.NodeState;
import com.poc.leaderelection.model.RaftNode;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

@Service
public class ClusterEngine {
  private static final int NODE_COUNT = 5;
  private static final long HEARTBEAT_INTERVAL_MS = 300L;
  private static final long SNAPSHOT_INTERVAL_MS = 250L;
  private static final long LOG_APPEND_INTERVAL_MS = 1800L;
  private static final int ELECTION_TIMEOUT_MIN_MS = 1000;
  private static final int ELECTION_TIMEOUT_MAX_MS = 2000;

  private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
  private final Random random = new Random();
  private final List<RaftNode> nodes = new ArrayList<>();
  private final List<Consumer<ClusterSnapshot>> listeners = new CopyOnWriteArrayList<>();
  private final AtomicLong committedValue = new AtomicLong(0L);

  private volatile String leaderId;
  private volatile int leaderTerm;
  private volatile long lastSnapshotMs;
  private volatile long lastLogAppendMs;

  @PostConstruct
  public void init() {
    for (int i = 1; i <= NODE_COUNT; i += 1) {
      RaftNode node = new RaftNode("node-" + i);
      node.setElectionDeadlineMs(System.currentTimeMillis() + nextElectionTimeout());
      nodes.add(node);
    }
    scheduler.scheduleAtFixedRate(this::tick, 100, 100, TimeUnit.MILLISECONDS);
  }

  @PreDestroy
  public void shutdown() {
    scheduler.shutdownNow();
  }

  public void addListener(Consumer<ClusterSnapshot> listener) {
    listeners.add(listener);
  }

  public void removeListener(Consumer<ClusterSnapshot> listener) {
    listeners.remove(listener);
  }

  public synchronized ClusterSnapshot snapshot() {
    return buildSnapshot(System.currentTimeMillis());
  }

  public synchronized void killLeader() {
    if (leaderId == null) {
      return;
    }
    RaftNode leader = findNode(leaderId);
    if (leader == null) {
      leaderId = null;
      leaderTerm = 0;
      return;
    }
    leader.setAlive(false);
    leader.setState(NodeState.DOWN);
    leaderId = null;
    leaderTerm = 0;
  }

  private void tick() {
    synchronized (this) {
      long now = System.currentTimeMillis();
      RaftNode leader = leaderId == null ? null : findNode(leaderId);

      if (leader != null && leader.isAlive()) {
        if (now - leader.getLastHeartbeatMs() >= HEARTBEAT_INTERVAL_MS) {
          sendHeartbeat(leader, now);
        }
        if (now - lastLogAppendMs >= LOG_APPEND_INTERVAL_MS) {
          appendLogEntry(leader, now);
        }
      }

      for (RaftNode node : nodes) {
        if (!node.isAlive()) {
          continue;
        }
        if (leader != null && node.getId().equals(leader.getId())) {
          continue;
        }
        if (now >= node.getElectionDeadlineMs()) {
          startElection(node, now);
        }
      }

      if (now - lastSnapshotMs >= SNAPSHOT_INTERVAL_MS) {
        ClusterSnapshot snapshot = buildSnapshot(now);
        for (Consumer<ClusterSnapshot> listener : listeners) {
          listener.accept(snapshot);
        }
        lastSnapshotMs = now;
      }
    }
  }

  private void startElection(RaftNode candidate, long now) {
    candidate.setState(NodeState.CANDIDATE);
    candidate.setTerm(candidate.getTerm() + 1);
    candidate.setVotedFor(candidate.getId());
    candidate.setElectionDeadlineMs(now + nextElectionTimeout());

    int votes = 1;
    int aliveNodes = 0;
    for (RaftNode node : nodes) {
      if (!node.isAlive()) {
        continue;
      }
      aliveNodes += 1;
      if (node.getId().equals(candidate.getId())) {
        continue;
      }
      if (node.getTerm() > candidate.getTerm()) {
        continue;
      }
      if (node.getVotedFor() == null || node.getVotedFor().equals(candidate.getId())) {
        node.setVotedFor(candidate.getId());
        node.setTerm(candidate.getTerm());
        node.setState(NodeState.FOLLOWER);
        votes += 1;
      }
    }

    int majority = aliveNodes / 2 + 1;
    if (votes >= majority) {
      becomeLeader(candidate, now);
    }
  }

  private void becomeLeader(RaftNode leader, long now) {
    leader.setState(NodeState.LEADER);
    leader.setLastHeartbeatMs(now);
    leaderId = leader.getId();
    leaderTerm = leader.getTerm();
    long maxLog = nodes.stream()
      .filter(RaftNode::isAlive)
      .map(RaftNode::getLastLogValue)
      .max(Comparator.naturalOrder())
      .orElse(0L);
    committedValue.updateAndGet(value -> Math.max(value, maxLog));
    leader.setLastLogValue(committedValue.get());
    sendHeartbeat(leader, now);
  }

  private void sendHeartbeat(RaftNode leader, long now) {
    leader.setLastHeartbeatMs(now);
    for (RaftNode node : nodes) {
      if (!node.isAlive()) {
        continue;
      }
      if (node.getId().equals(leader.getId())) {
        continue;
      }
      if (leader.getTerm() < node.getTerm()) {
        continue;
      }
      node.setState(NodeState.FOLLOWER);
      node.setTerm(leader.getTerm());
      node.setVotedFor(null);
      node.setLastHeartbeatMs(now);
      node.setElectionDeadlineMs(now + nextElectionTimeout());
      node.setLastLogValue(committedValue.get());
    }
  }

  private void appendLogEntry(RaftNode leader, long now) {
    long nextValue = committedValue.incrementAndGet();
    leader.setLastLogValue(nextValue);
    lastLogAppendMs = now;
    for (RaftNode node : nodes) {
      if (!node.isAlive() || node.getId().equals(leader.getId())) {
        continue;
      }
      node.setLastLogValue(nextValue);
    }
  }

  private ClusterSnapshot buildSnapshot(long now) {
    List<ClusterSnapshot.NodeView> views = new ArrayList<>();
    for (RaftNode node : nodes) {
      long heartbeatAge = node.getLastHeartbeatMs() == 0 ? -1 : now - node.getLastHeartbeatMs();
      long electionTimeout = node.getElectionDeadlineMs() == 0 ? -1 : Math.max(0, node.getElectionDeadlineMs() - now);
      views.add(new ClusterSnapshot.NodeView(
        node.getId(),
        node.getState(),
        node.getTerm(),
        node.getVotedFor(),
        node.isAlive(),
        heartbeatAge,
        electionTimeout,
        node.getLastLogValue()
      ));
    }
    return new ClusterSnapshot(now, leaderId, leaderTerm, committedValue.get(), views);
  }

  private long nextElectionTimeout() {
    return ELECTION_TIMEOUT_MIN_MS + random.nextInt(ELECTION_TIMEOUT_MAX_MS - ELECTION_TIMEOUT_MIN_MS + 1);
  }

  private RaftNode findNode(String id) {
    for (RaftNode node : nodes) {
      if (node.getId().equals(id)) {
        return node;
      }
    }
    return null;
  }
}
