package com.randomproject.consistenthashing;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;

@Controller
public class ConsistentHashingController {
    private final ConsistentHashingService service;

    public ConsistentHashingController(ConsistentHashingService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        List<String> nodes = service.listNodes();
        List<HashRingEntry> ringEntries = service.ringEntries();
        model.addAttribute("virtualNodes", service.getVirtualNodes());
        model.addAttribute("nodes", nodes);
        model.addAttribute("ringEntries", ringEntries);
        model.addAttribute("nodeCount", nodes.size());
        model.addAttribute("ringSize", ringEntries.size());
        return "index";
    }

    @PostMapping("/nodes")
    public String addNode(@RequestParam("nodeId") String nodeId, RedirectAttributes redirectAttributes) {
        try {
            NodeChange change = service.addNode(nodeId);
            if (change.added()) {
                redirectAttributes.addFlashAttribute("message", "Added node " + change.nodeId());
            } else {
                redirectAttributes.addFlashAttribute("message", "Node already exists: " + change.nodeId());
            }
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/nodes/{nodeId}/remove")
    public String removeNode(@PathVariable String nodeId, RedirectAttributes redirectAttributes) {
        try {
            NodeChange change = service.removeNode(nodeId);
            if (change.removed()) {
                redirectAttributes.addFlashAttribute("message", "Removed node " + change.nodeId());
            } else {
                redirectAttributes.addFlashAttribute("message", "No node found: " + change.nodeId());
            }
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/assign")
    public String assignKey(@RequestParam("key") String key, RedirectAttributes redirectAttributes) {
        try {
            NodeAssignment assignment = service.assignKey(key);
            redirectAttributes.addFlashAttribute("assignment", assignment);
            if (assignment.assignedNode() == null) {
                redirectAttributes.addFlashAttribute("message", "Add nodes to the ring before assigning keys.");
            } else {
                redirectAttributes.addFlashAttribute(
                        "message",
                        "Key " + assignment.key() + " assigned to " + assignment.assignedNode());
            }
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/api/nodes")
    @ResponseBody
    public ResponseEntity<NodeChange> apiAddNode(@Valid @RequestBody NodeRequest request) {
        try {
            NodeChange change = service.addNode(request.nodeId());
            if (change.added()) {
                return ResponseEntity.status(HttpStatus.CREATED).body(change);
            }
            return ResponseEntity.status(HttpStatus.CONFLICT).body(change);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/api/nodes/{nodeId}")
    @ResponseBody
    public ResponseEntity<NodeChange> apiRemoveNode(@PathVariable String nodeId) {
        try {
            NodeChange change = service.removeNode(nodeId);
            if (change.removed()) {
                return ResponseEntity.ok(change);
            }
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(change);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/nodes")
    @ResponseBody
    public List<String> apiNodes() {
        return service.listNodes();
    }

    @GetMapping("/api/ring")
    @ResponseBody
    public List<HashRingEntry> apiRing() {
        return service.ringEntries();
    }

    @PostMapping("/api/assign")
    @ResponseBody
    public ResponseEntity<NodeAssignment> apiAssign(@Valid @RequestBody AssignKeyRequest request) {
        try {
            NodeAssignment assignment = service.assignKey(request.key());
            if (assignment.assignedNode() == null) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(assignment);
            }
            return ResponseEntity.ok(assignment);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }
}
