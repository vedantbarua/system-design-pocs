package com.randomproject.featureflag;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.BooleanNode;
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

import java.io.IOException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Controller
public class FeatureFlagController {
    private final FeatureFlagService service;
    private final ObjectMapper objectMapper;

    public FeatureFlagController(FeatureFlagService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @ModelAttribute("snapshot")
    public ServiceSnapshot snapshot() {
        return service.snapshot();
    }

    @GetMapping("/")
    public String home(Model model) {
        return "index";
    }

    @PostMapping("/definitions")
    public String publishDefinition(
            @RequestParam("key") String key,
            @RequestParam("type") DefinitionType type,
            @RequestParam("defaultValue") String defaultValue,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam(value = "owner", required = false) String owner,
            @RequestParam(value = "ruleLines", required = false) String ruleLines,
            RedirectAttributes redirectAttributes) {
        try {
            DefinitionView definition = service.upsertDefinition(new UpsertDefinitionRequest(
                    key,
                    type,
                    parseJson(defaultValue, type == DefinitionType.FLAG ? BooleanNode.FALSE : objectMapper.createObjectNode()),
                    description,
                    owner,
                    parseRules(ruleLines)));
            redirectAttributes.addFlashAttribute("message", "Published " + definition.key() + " at version " + definition.version() + ".");
        } catch (IllegalArgumentException | IOException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/definitions/delete")
    public String deleteDefinition(@RequestParam("key") String key, RedirectAttributes redirectAttributes) {
        try {
            DeleteResult result = service.deleteDefinition(key);
            redirectAttributes.addFlashAttribute("message", "Deleted " + result.key() + " at version " + result.version() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/evaluate")
    public String evaluate(
            @RequestParam("key") String key,
            @RequestParam("subjectKey") String subjectKey,
            @RequestParam(value = "attributesText", required = false) String attributesText,
            RedirectAttributes redirectAttributes) {
        try {
            EvaluationResult result = service.evaluate(new EvaluateRequest(key, subjectKey, parseAttributes(attributesText)));
            redirectAttributes.addFlashAttribute("evaluationResult", result);
            redirectAttributes.addFlashAttribute("message", "Evaluated " + result.key() + " using " + result.source() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/clients/sync")
    public String syncClient(
            @RequestParam("clientId") String clientId,
            @RequestParam(value = "lastKnownVersion", required = false) Long lastKnownVersion,
            RedirectAttributes redirectAttributes) {
        try {
            ClientSyncResponse response = service.syncClient(clientId, lastKnownVersion);
            redirectAttributes.addFlashAttribute("syncResult", response);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Synced " + response.clientId() + " to version " + response.version() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/api/definitions")
    @ResponseBody
    public List<DefinitionView> definitions() {
        return service.snapshot().definitions();
    }

    @PostMapping("/api/definitions")
    @ResponseBody
    public ResponseEntity<?> publishDefinitionApi(@Valid @RequestBody UpsertDefinitionRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(service.upsertDefinition(request));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @DeleteMapping("/api/definitions/{key}")
    @ResponseBody
    public ResponseEntity<?> deleteDefinitionApi(@PathVariable("key") String key) {
        try {
            return ResponseEntity.ok(service.deleteDefinition(key));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PostMapping("/api/evaluate")
    @ResponseBody
    public ResponseEntity<?> evaluateApi(@Valid @RequestBody EvaluateRequest request) {
        try {
            return ResponseEntity.ok(service.evaluate(request));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PostMapping("/api/clients/{clientId}/sync")
    @ResponseBody
    public ResponseEntity<?> syncClientApi(
            @PathVariable("clientId") String clientId,
            @RequestBody(required = false) ClientSyncRequest request) {
        try {
            return ResponseEntity.ok(service.syncClient(clientId, request == null ? null : request.lastKnownVersion()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @GetMapping("/api/snapshot")
    @ResponseBody
    public ServiceSnapshot apiSnapshot() {
        return service.snapshot();
    }

    private JsonNode parseJson(String raw, JsonNode fallback) throws IOException {
        if (raw == null || raw.trim().isEmpty()) {
            return fallback.deepCopy();
        }
        return objectMapper.readTree(raw);
    }

    private List<RuleRequest> parseRules(String ruleLines) throws IOException {
        if (ruleLines == null || ruleLines.isBlank()) {
            return List.of();
        }
        List<RuleRequest> rules = new java.util.ArrayList<>();
        for (String line : ruleLines.split("\\R")) {
            if (line.isBlank()) {
                continue;
            }
            String[] parts = line.split("\\|", -1);
            if (parts.length < 4) {
                throw new IllegalArgumentException("Rule lines must be name|conditions|rollout|value.");
            }
            Map<String, String> conditions = parseAttributes(parts[1]);
            Integer rollout = parts[2].isBlank() ? null : Integer.parseInt(parts[2].trim());
            rules.add(new RuleRequest(parts[0].trim(), conditions, rollout, parseJson(parts[3], objectMapper.getNodeFactory().nullNode())));
        }
        return rules;
    }

    private Map<String, String> parseAttributes(String raw) {
        if (raw == null || raw.isBlank()) {
            return Map.of();
        }
        Map<String, String> attributes = new LinkedHashMap<>();
        Arrays.stream(raw.split("[,\\n]"))
                .map(String::trim)
                .filter(entry -> !entry.isBlank())
                .forEach(entry -> {
                    String[] parts = entry.split("=", 2);
                    if (parts.length != 2) {
                        throw new IllegalArgumentException("Attributes must use key=value.");
                    }
                    attributes.put(parts[0].trim(), parts[1].trim());
                });
        return attributes;
    }
}
