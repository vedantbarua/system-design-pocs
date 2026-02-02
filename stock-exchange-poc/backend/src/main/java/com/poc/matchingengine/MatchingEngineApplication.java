package com.poc.matchingengine;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@OpenAPIDefinition(
    info = @Info(
        title = "Stock Exchange Matching Engine API",
        version = "1.0",
        description = "POC REST + WebSocket API for a sequenced matching engine"
    )
)
public class MatchingEngineApplication {
  public static void main(String[] args) {
    SpringApplication.run(MatchingEngineApplication.class, args);
  }
}
