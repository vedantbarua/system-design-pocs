package com.randomproject.databasereplicationquorum;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class QuorumReplicationController {
    private final QuorumReplicationService service;

    public QuorumReplicationController(QuorumReplicationService service) {
        this.service = service;
    }

    @ModelAttribute("config")
    public ClusterConfigView config() {
        return service.configSnapshot();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("snapshot", service.snapshot());
        return "index";
    }

    @PostMapping("/writes")
    public String write(
            @RequestParam("key") String key,
            @RequestParam("value") String value,
            @RequestParam("writeQuorum") Integer writeQuorum,
            RedirectAttributes redirectAttributes) {
        try {
            WriteResultView result = service.write(key, value, writeQuorum);
            redirectAttributes.addFlashAttribute("message", result.message());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/reads")
    public String read(
            @RequestParam("key") String key,
            @RequestParam("readQuorum") Integer readQuorum,
            @RequestParam(value = "repairOnRead", defaultValue = "false") boolean repairOnRead,
            RedirectAttributes redirectAttributes) {
        try {
            ReadResultView result = service.read(key, readQuorum, repairOnRead);
            redirectAttributes.addFlashAttribute("message", result.message());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/replicas/mode")
    public String updateReplicaMode(
            @RequestParam("replicaId") String replicaId,
            @RequestParam("mode") String mode,
            RedirectAttributes redirectAttributes) {
        try {
            OperationEventView event = service.updateReplicaMode(replicaId, mode);
            redirectAttributes.addFlashAttribute("message", event.detail());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/replicas/drain")
    public String drainReplica(
            @RequestParam("replicaId") String replicaId,
            RedirectAttributes redirectAttributes) {
        try {
            OperationEventView event = service.drainPending(replicaId);
            redirectAttributes.addFlashAttribute("message", event.detail());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/repairs/key")
    public String repairKey(
            @RequestParam("key") String key,
            RedirectAttributes redirectAttributes) {
        try {
            OperationEventView event = service.repairKey(key);
            redirectAttributes.addFlashAttribute("message", event.detail());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/repairs/all")
    public String repairAll(RedirectAttributes redirectAttributes) {
        OperationEventView event = service.repairAll();
        redirectAttributes.addFlashAttribute("message", event.detail());
        return "redirect:/";
    }

    @GetMapping("/api/snapshot")
    @ResponseBody
    public ClusterSnapshotView snapshot() {
        return service.snapshot();
    }

    @PostMapping("/api/write")
    @ResponseBody
    public ResponseEntity<WriteResultView> writeApi(@Valid @RequestBody WriteRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.write(request.key(), request.value(), request.writeQuorum()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/read")
    @ResponseBody
    public ResponseEntity<ReadResultView> readApi(@Valid @RequestBody ReadRequest request) {
        try {
            return ResponseEntity.ok(service.read(request.key(), request.readQuorum(), request.repairOnRead()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/replicas/mode")
    @ResponseBody
    public ResponseEntity<OperationEventView> replicaModeApi(@Valid @RequestBody ReplicaModeRequest request) {
        try {
            return ResponseEntity.ok(service.updateReplicaMode(request.replicaId(), request.mode()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/replicas/drain")
    @ResponseBody
    public ResponseEntity<OperationEventView> replicaDrainApi(@Valid @RequestBody ReplicaDrainRequest request) {
        try {
            return ResponseEntity.ok(service.drainPending(request.replicaId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/repairs/key")
    @ResponseBody
    public ResponseEntity<OperationEventView> repairKeyApi(@Valid @RequestBody RepairKeyRequest request) {
        try {
            return ResponseEntity.ok(service.repairKey(request.key()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/repairs/all")
    @ResponseBody
    public OperationEventView repairAllApi() {
        return service.repairAll();
    }
}
