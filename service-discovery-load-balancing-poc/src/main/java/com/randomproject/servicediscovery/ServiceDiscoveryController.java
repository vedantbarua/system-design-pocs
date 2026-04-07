package com.randomproject.servicediscovery;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

@Controller
@RequestMapping
public class ServiceDiscoveryController {
    private final ServiceDiscoveryService service;

    public ServiceDiscoveryController(ServiceDiscoveryService service) {
        this.service = service;
    }

    @GetMapping
    public String index(@RequestParam(value = "message", required = false) String message, Model model) {
        model.addAttribute("snapshot", service.snapshot());
        model.addAttribute("message", message);
        return "index";
    }

    @PostMapping("/instances/register")
    public String registerFromForm(@RequestParam String serviceName,
                                   @RequestParam(required = false) String instanceId,
                                   @RequestParam String zone,
                                   @RequestParam String version,
                                   @RequestParam(defaultValue = "100") Integer weight,
                                   @RequestParam(defaultValue = "false") boolean canary,
                                   @RequestParam(required = false) String metadata) {
        try {
            InstanceView registered = service.register(new RegisterInstanceRequest(
                    serviceName,
                    instanceId,
                    zone,
                    version,
                    weight,
                    canary,
                    parseMetadata(metadata)));
            return redirectWithMessage("Registered " + registered.instanceId() + " for service " + registered.service() + ".");
        } catch (IllegalArgumentException ex) {
            return redirectWithMessage(ex.getMessage());
        }
    }

    @PostMapping("/instances/{instanceId}/heartbeat")
    public String heartbeatFromForm(@PathVariable String instanceId) {
        try {
            service.heartbeat(instanceId);
            return redirectWithMessage("Renewed heartbeat for " + instanceId + ".");
        } catch (IllegalArgumentException ex) {
            return redirectWithMessage(ex.getMessage());
        }
    }

    @PostMapping("/instances/{instanceId}/status")
    public String updateStatusFromForm(@PathVariable String instanceId, @RequestParam InstanceLifecycle lifecycle) {
        try {
            service.updateStatus(instanceId, new StatusUpdateRequest(lifecycle));
            return redirectWithMessage("Updated " + instanceId + " to " + lifecycle.name() + ".");
        } catch (IllegalArgumentException ex) {
            return redirectWithMessage(ex.getMessage());
        }
    }

    @PostMapping("/instances/{instanceId}/result")
    public String recordResultFromForm(@PathVariable String instanceId, @RequestParam boolean success) {
        try {
            InstanceActionResult result = service.recordResult(instanceId, new InstanceResultRequest(success));
            return redirectWithMessage(result.message());
        } catch (IllegalArgumentException ex) {
            return redirectWithMessage(ex.getMessage());
        }
    }

    @PostMapping("/route")
    public String routeFromForm(@RequestParam String serviceName,
                                @RequestParam(required = false) String clientZone,
                                @RequestParam(required = false) String sessionKey,
                                @RequestParam(defaultValue = "true") boolean allowCanary) {
        try {
            RoutingDecision decision = service.route(new RoutingRequest(serviceName, clientZone, sessionKey, allowCanary));
            return redirectWithMessage("Routed to " + decision.instance().instanceId() + " using " + decision.strategy() + ".");
        } catch (RuntimeException ex) {
            return redirectWithMessage(ex.getMessage());
        }
    }

    @GetMapping("/api/snapshot")
    @ResponseBody
    public DiscoverySnapshot snapshot() {
        return service.snapshot();
    }

    @PostMapping("/api/instances/register")
    @ResponseBody
    public InstanceView register(@Valid @RequestBody RegisterInstanceRequest request) {
        return service.register(request);
    }

    @PostMapping("/api/instances/{instanceId}/heartbeat")
    @ResponseBody
    public HeartbeatResult heartbeat(@PathVariable String instanceId) {
        return service.heartbeat(instanceId);
    }

    @PostMapping("/api/instances/{instanceId}/status")
    @ResponseBody
    public InstanceActionResult updateStatus(@PathVariable String instanceId, @Valid @RequestBody StatusUpdateRequest request) {
        return service.updateStatus(instanceId, request);
    }

    @PostMapping("/api/instances/{instanceId}/result")
    @ResponseBody
    public InstanceActionResult recordResult(@PathVariable String instanceId, @Valid @RequestBody InstanceResultRequest request) {
        return service.recordResult(instanceId, request);
    }

    @PostMapping("/api/route")
    @ResponseBody
    public RoutingDecision route(@Valid @RequestBody RoutingRequest request) {
        return service.route(request);
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    @ResponseBody
    public ResponseEntity<Map<String, String>> handleBadRequest(RuntimeException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    private Map<String, String> parseMetadata(String metadata) {
        if (metadata == null || metadata.isBlank()) {
            return Map.of();
        }
        Map<String, String> result = new LinkedHashMap<>();
        for (String pair : metadata.split(",")) {
            String[] parts = pair.split("=", 2);
            if (parts.length == 2) {
                String key = parts[0].trim();
                String value = parts[1].trim();
                if (!key.isEmpty() && !value.isEmpty()) {
                    result.put(key, value);
                }
            }
        }
        return result;
    }

    private String redirectWithMessage(String message) {
        return "redirect:/?message=" + URLEncoder.encode(message, StandardCharsets.UTF_8);
    }
}
