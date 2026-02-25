package com.randomproject.flashconf;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/admin")
@CrossOrigin(origins = "http://localhost:3000")
public class AdminController {
    private final FlashConfService service;

    public AdminController(FlashConfService service) {
        this.service = service;
    }

    @GetMapping("/flags")
    public List<FeatureFlag> listFlags() {
        return service.listFlags();
    }

    @GetMapping("/flags/{key}")
    public ResponseEntity<FeatureFlag> getFlag(@PathVariable String key) {
        return service.getFlag(key)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/flags")
    public ResponseEntity<FeatureFlag> createFlag(@RequestBody FlagUpsertRequest request) {
        if (request.getKey() == null || request.getKey().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return new ResponseEntity<>(service.upsertFlag(request), HttpStatus.CREATED);
    }

    @PutMapping("/flags/{key}")
    public ResponseEntity<FeatureFlag> updateFlag(@PathVariable String key, @RequestBody FlagUpsertRequest request) {
        request.setKey(key);
        return ResponseEntity.ok(service.upsertFlag(request));
    }

    @DeleteMapping("/flags/{key}")
    public ResponseEntity<Void> deleteFlag(@PathVariable String key, @RequestParam(required = false) String actor) {
        return service.deleteFlag(key, actor).isPresent() ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @GetMapping("/audit")
    public List<ChangeLogEntry> auditTrail() {
        return service.auditTrail();
    }
}
