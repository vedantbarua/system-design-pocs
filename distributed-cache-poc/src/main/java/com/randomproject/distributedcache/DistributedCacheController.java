package com.randomproject.distributedcache;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.Optional;

@Controller
public class DistributedCacheController {
    private final DistributedCacheService service;

    public DistributedCacheController(DistributedCacheService service) {
        this.service = service;
    }

    @ModelAttribute("config")
    public CacheConfigSnapshot config() {
        return service.configSnapshot();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("snapshot", service.snapshot());
        return "index";
    }

    @PostMapping("/cache/write")
    public String write(
            @RequestParam("key") String key,
            @RequestParam("value") String value,
            @RequestParam(value = "ttlSeconds", required = false) Integer ttlSeconds,
            RedirectAttributes redirectAttributes) {
        try {
            CacheReadResult result = service.put(key, value, ttlSeconds);
            redirectAttributes.addFlashAttribute("lookup", result);
            redirectAttributes.addFlashAttribute("message", "Stored " + result.key() + " on " + result.activePrimary() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/cache/read")
    public String read(@RequestParam("key") String key, RedirectAttributes redirectAttributes) {
        try {
            Optional<CacheReadResult> result = service.get(key);
            if (result.isPresent()) {
                redirectAttributes.addFlashAttribute("lookup", result.get());
            } else {
                redirectAttributes.addFlashAttribute("message", "Key not found.");
            }
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/cache/delete")
    public String delete(@RequestParam("key") String key, RedirectAttributes redirectAttributes) {
        try {
            boolean removed = service.delete(key);
            redirectAttributes.addFlashAttribute("message", removed ? "Deleted key." : "Key not found.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/cluster/nodes/{nodeId}/toggle")
    public String toggleNode(
            @PathVariable String nodeId,
            @RequestParam("active") boolean active,
            RedirectAttributes redirectAttributes) {
        try {
            NodeToggleResult result = service.setNodeActive(nodeId, active);
            redirectAttributes.addFlashAttribute(
                    "message",
                    active
                            ? "Node " + result.nodeId() + " restored " + result.restoredCopies() + " copies."
                            : "Node " + result.nodeId() + " went down. " + result.affectedKeys() + " keys are affected.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/traffic")
    public String traffic(
            @RequestParam("key") String key,
            @RequestParam(value = "requests", required = false) Integer requests,
            RedirectAttributes redirectAttributes) {
        try {
            HotKeySimulationResult result = service.simulateHotKey(key, requests);
            redirectAttributes.addFlashAttribute("traffic", result);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Simulated " + result.requests() + " reads for " + result.key() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/rebalance/preview")
    public String rebalance(@RequestParam("candidateNodeId") String candidateNodeId, RedirectAttributes redirectAttributes) {
        try {
            RebalancePreview preview = service.previewRebalance(candidateNodeId);
            redirectAttributes.addFlashAttribute("rebalance", preview);
            redirectAttributes.addFlashAttribute("message", "Previewed rebalance for " + preview.candidateNodeId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/api/cluster")
    @ResponseBody
    public ClusterSnapshot cluster() {
        return service.snapshot();
    }

    @GetMapping("/api/cache/{key}")
    @ResponseBody
    public ResponseEntity<CacheReadResult> readApi(@PathVariable String key) {
        try {
            return service.get(key).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/cache")
    @ResponseBody
    public ResponseEntity<CacheReadResult> writeApi(@Valid @RequestBody CacheWriteRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(service.put(request.key(), request.value(), request.ttlSeconds()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/api/cache/{key}")
    @ResponseBody
    public ResponseEntity<Void> deleteApi(@PathVariable String key) {
        try {
            return service.delete(key) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/placement")
    @ResponseBody
    public ResponseEntity<CacheKeyPlacementView> placement(@RequestParam("key") String key) {
        try {
            return ResponseEntity.ok(service.placement(key));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/cluster/nodes/{nodeId}/toggle")
    @ResponseBody
    public ResponseEntity<NodeToggleResult> toggleNodeApi(@PathVariable String nodeId, @RequestParam("active") boolean active) {
        try {
            return ResponseEntity.ok(service.setNodeActive(nodeId, active));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/traffic")
    @ResponseBody
    public ResponseEntity<HotKeySimulationResult> trafficApi(@Valid @RequestBody HotKeyRequest request) {
        try {
            return ResponseEntity.ok(service.simulateHotKey(request.key(), request.requests()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/rebalance/preview")
    @ResponseBody
    public ResponseEntity<RebalancePreview> rebalanceApi(@Valid @RequestBody RebalanceRequest request) {
        try {
            return ResponseEntity.ok(service.previewRebalance(request.candidateNodeId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }
}
