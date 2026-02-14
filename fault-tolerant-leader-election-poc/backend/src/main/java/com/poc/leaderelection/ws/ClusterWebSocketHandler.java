package com.poc.leaderelection.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.poc.leaderelection.model.ClusterSnapshot;
import com.poc.leaderelection.service.ClusterEngine;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

@Component
public class ClusterWebSocketHandler extends TextWebSocketHandler {
  private final ObjectMapper mapper = new ObjectMapper();
  private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
  private final ClusterEngine clusterEngine;
  private final Consumer<ClusterSnapshot> broadcaster;

  public ClusterWebSocketHandler(ClusterEngine clusterEngine) {
    this.clusterEngine = clusterEngine;
    this.broadcaster = this::broadcast;
  }

  @PostConstruct
  public void registerListener() {
    clusterEngine.addListener(broadcaster);
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws Exception {
    sessions.add(session);
    ClusterSnapshot snapshot = clusterEngine.snapshot();
    session.sendMessage(new TextMessage(mapper.writeValueAsString(snapshot)));
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    sessions.remove(session);
  }

  private void broadcast(ClusterSnapshot snapshot) {
    String payload;
    try {
      payload = mapper.writeValueAsString(snapshot);
    } catch (IOException ex) {
      return;
    }
    for (WebSocketSession session : sessions) {
      if (!session.isOpen()) {
        sessions.remove(session);
        continue;
      }
      try {
        session.sendMessage(new TextMessage(payload));
      } catch (IOException ex) {
        try {
          session.close();
        } catch (IOException ignored) {
          // ignore
        }
        sessions.remove(session);
      }
    }
  }
}
