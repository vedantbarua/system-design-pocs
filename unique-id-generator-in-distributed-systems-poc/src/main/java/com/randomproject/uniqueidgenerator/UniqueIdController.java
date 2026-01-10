package com.randomproject.uniqueidgenerator;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.time.Instant;
import java.util.List;

@Controller
public class UniqueIdController {
    private final UniqueIdService service;

    public UniqueIdController(UniqueIdService service) {
        this.service = service;
    }

    @ModelAttribute("config")
    public IdConfigSnapshot configSnapshot() {
        return service.configSnapshot();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("nodes", service.nodes());
        return "index";
    }

    @PostMapping("/generate")
    public String generate(@RequestParam(value = "nodeId", required = false) Integer nodeId,
                           @RequestParam(value = "count", required = false) Integer count,
                           RedirectAttributes redirectAttributes) {
        try {
            List<IdGeneration> ids = service.generate(nodeId, count);
            redirectAttributes.addFlashAttribute("generated", ids);
            redirectAttributes.addFlashAttribute("message", "Generated " + ids.size() + " ids.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/decode")
    public String decode(@RequestParam("id") String id, RedirectAttributes redirectAttributes) {
        try {
            long parsed = Long.parseLong(id.trim());
            IdDecodeResult decoded = service.decode(parsed);
            redirectAttributes.addFlashAttribute("decoded", decoded);
        } catch (NumberFormatException ex) {
            redirectAttributes.addFlashAttribute("message", "ID must be a valid number.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/api/ids")
    @ResponseBody
    public ResponseEntity<IdBatchResponse> apiGenerate(@Valid @RequestBody IdGenerationRequest request) {
        try {
            List<IdGeneration> ids = service.generate(request.nodeId(), request.count());
            IdBatchResponse response = new IdBatchResponse(ids.get(0).nodeId(), ids.size(), Instant.now(), ids);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/ids/{id}")
    @ResponseBody
    public ResponseEntity<IdDecodeResult> apiDecode(@PathVariable long id) {
        try {
            return ResponseEntity.ok(service.decode(id));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/nodes")
    @ResponseBody
    public List<NodeSnapshot> apiNodes() {
        return service.nodes();
    }

    @GetMapping("/api/config")
    @ResponseBody
    public IdConfigSnapshot apiConfig() {
        return service.configSnapshot();
    }
}
