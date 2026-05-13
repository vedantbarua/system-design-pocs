package com.randomproject.multiregionactiveactive;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.Map;

@Controller
public class MultiRegionController {
    private final MultiRegionReplicationService service;

    public MultiRegionController(MultiRegionReplicationService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("snapshot", service.snapshot());
        model.addAttribute("strategies", ConflictStrategy.values());
        return "index";
    }

    @GetMapping("/api/snapshot")
    @ResponseBody
    public SystemSnapshot snapshot() {
        return service.snapshot();
    }

    @PostMapping("/api/carts/items")
    @ResponseBody
    public CommandResult mutateCart(@Valid @RequestBody CartMutationRequest request) {
        return service.mutateCart(request);
    }

    @PostMapping("/api/regions/mode")
    @ResponseBody
    public CommandResult setRegionMode(@Valid @RequestBody RegionModeRequest request) {
        return service.setRegionActive(request);
    }

    @PostMapping("/api/replication/drain")
    @ResponseBody
    public DrainResult drainReplication(@Valid @RequestBody DrainReplicationRequest request) {
        return service.drainReplication(request);
    }

    @PostMapping("/api/replication/drop")
    @ResponseBody
    public CommandResult dropReplication(@Valid @RequestBody DropReplicationRequest request) {
        return service.dropReplication(request);
    }

    @PostMapping("/api/conflicts/reconcile")
    @ResponseBody
    public CommandResult reconcileConflict(@Valid @RequestBody ReconcileRequest request) {
        return service.reconcileConflict(request);
    }

    @PostMapping("/ui/carts/items")
    public String mutateCartFromUi(
            @RequestParam String regionId,
            @RequestParam String cartId,
            @RequestParam String sku,
            @RequestParam Integer quantityDelta,
            @RequestParam ConflictStrategy strategy,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.mutateCart(new CartMutationRequest(regionId, cartId, sku, quantityDelta, strategy));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/regions/mode")
    public String setRegionModeFromUi(
            @RequestParam String regionId,
            @RequestParam boolean active,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.setRegionActive(new RegionModeRequest(regionId, active));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/replication/drain")
    public String drainReplicationFromUi(
            @RequestParam(required = false) String targetRegionId,
            @RequestParam Integer maxEvents,
            @RequestParam ConflictStrategy strategy,
            RedirectAttributes redirectAttributes) {
        DrainResult result = service.drainReplication(new DrainReplicationRequest(targetRegionId, maxEvents, strategy));
        redirectAttributes.addFlashAttribute("message", "Applied " + result.appliedEvents() + " events; skipped " + result.skippedEvents() + ".");
        return "redirect:/";
    }

    @PostMapping("/ui/replication/drop")
    public String dropReplicationFromUi(
            @RequestParam(required = false) String sourceRegionId,
            @RequestParam(required = false) String targetRegionId,
            @RequestParam(required = false) String cartId,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.dropReplication(new DropReplicationRequest(sourceRegionId, targetRegionId, cartId));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/conflicts/reconcile")
    public String reconcileConflictFromUi(
            @RequestParam String regionId,
            @RequestParam String cartId,
            @RequestParam ConflictStrategy strategy,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.reconcileConflict(new ReconcileRequest(regionId, cartId, strategy));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ResponseBody
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}
