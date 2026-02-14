package com.poc.leaderelection.controller;

import com.poc.leaderelection.model.ClusterSnapshot;
import com.poc.leaderelection.service.ClusterEngine;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cluster")
@CrossOrigin
public class ClusterController {
  private final ClusterEngine clusterEngine;

  public ClusterController(ClusterEngine clusterEngine) {
    this.clusterEngine = clusterEngine;
  }

  @GetMapping("/state")
  public ClusterSnapshot getState() {
    return clusterEngine.snapshot();
  }

  @PostMapping("/kill-leader")
  public ResponseEntity<Void> killLeader() {
    clusterEngine.killLeader();
    return ResponseEntity.accepted().build();
  }
}
