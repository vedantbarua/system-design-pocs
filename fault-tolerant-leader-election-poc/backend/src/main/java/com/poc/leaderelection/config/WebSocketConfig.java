package com.poc.leaderelection.config;

import com.poc.leaderelection.ws.ClusterWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
  private final ClusterWebSocketHandler handler;

  public WebSocketConfig(ClusterWebSocketHandler handler) {
    this.handler = handler;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry.addHandler(handler, "/ws").setAllowedOriginPatterns("*");
  }
}
