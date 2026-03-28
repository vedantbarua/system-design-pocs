package com.randomproject.distributedtracing;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;
import java.util.Map;

@Controller
public class DistributedTracingController {
    private final DistributedTracingService service;

    public DistributedTracingController(DistributedTracingService service) {
        this.service = service;
    }

    @ModelAttribute("snapshot")
    public SnapshotView snapshot() {
        return service.snapshot();
    }

    @GetMapping("/")
    public String home() {
        return "index";
    }

    @PostMapping("/simulate")
    public String simulate(
            @RequestParam("flowName") String flowName,
            @RequestParam("userId") String userId,
            @RequestParam("region") String region,
            @RequestParam(value = "paymentFails", defaultValue = "false") boolean paymentFails,
            @RequestParam(value = "breakPropagationAt", required = false) String breakPropagationAt,
            RedirectAttributes redirectAttributes) {
        try {
            SimulationResult result = service.simulate(new SimulationRequest(flowName, userId, region, paymentFails, breakPropagationAt));
            redirectAttributes.addFlashAttribute("message", result.message());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/reset")
    public String reset(RedirectAttributes redirectAttributes) {
        service.reset();
        redirectAttributes.addFlashAttribute("message", "Reset trace store and reseeded the default scenarios.");
        return "redirect:/";
    }

    @GetMapping("/api/snapshot")
    @ResponseBody
    public SnapshotView apiSnapshot() {
        return service.snapshot();
    }

    @GetMapping("/api/traces")
    @ResponseBody
    public List<TraceView> traces() {
        return service.listTraces();
    }

    @GetMapping("/api/traces/{traceId}")
    @ResponseBody
    public ResponseEntity<?> trace(@PathVariable("traceId") String traceId) {
        try {
            return ResponseEntity.ok(service.getTrace(traceId));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
        }
    }

    @GetMapping("/api/services")
    @ResponseBody
    public List<ServiceMetricView> services() {
        return service.serviceMetrics();
    }

    @PostMapping("/api/simulations")
    @ResponseBody
    public ResponseEntity<?> simulateApi(@Valid @RequestBody SimulationRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(service.simulate(request));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PostMapping("/api/reset")
    @ResponseBody
    public Map<String, String> resetApi() {
        service.reset();
        return Map.of("status", "ok");
    }
}
