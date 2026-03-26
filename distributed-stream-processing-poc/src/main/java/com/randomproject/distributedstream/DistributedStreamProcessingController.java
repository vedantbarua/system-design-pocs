package com.randomproject.distributedstream;

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
public class DistributedStreamProcessingController {
    private final DistributedStreamProcessingService service;

    public DistributedStreamProcessingController(DistributedStreamProcessingService service) {
        this.service = service;
    }

    @ModelAttribute("config")
    public StreamProcessorConfig config() {
        return service.configSnapshot();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("snapshot", service.snapshot());
        return "index";
    }

    @PostMapping("/streams")
    public String createStream(
            @RequestParam("stream") String stream,
            @RequestParam(value = "partitions", required = false) Integer partitions,
            @RequestParam(value = "windowSeconds", required = false) Integer windowSeconds,
            RedirectAttributes redirectAttributes) {
        try {
            StreamView created = service.createStream(stream, partitions, windowSeconds);
            redirectAttributes.addFlashAttribute("message", "Created stream " + created.stream() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/events/publish")
    public String publishEvent(
            @RequestParam("stream") String stream,
            @RequestParam(value = "key", required = false) String key,
            @RequestParam("value") Integer value,
            @RequestParam(value = "eventTimeMillis", required = false) Long eventTimeMillis,
            @RequestParam(value = "partition", required = false) Integer partition,
            RedirectAttributes redirectAttributes) {
        try {
            PublishEventResult result = service.publishEvent(stream, key, value, eventTimeMillis, partition);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Published to " + result.stream() + "[p" + result.partition() + "] offset " + result.offset() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/jobs/process")
    public String process(
            @RequestParam("stream") String stream,
            @RequestParam("jobId") String jobId,
            @RequestParam(value = "maxRecords", required = false) Integer maxRecords,
            RedirectAttributes redirectAttributes) {
        try {
            ProcessBatchResult result = service.processBatch(stream, jobId, maxRecords);
            redirectAttributes.addFlashAttribute("processResult", result);
            redirectAttributes.addFlashAttribute("message", "Processed " + result.processedCount() + " record(s) for " + result.jobId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/jobs/checkpoints")
    public String checkpoint(
            @RequestParam("stream") String stream,
            @RequestParam("jobId") String jobId,
            @RequestParam("checkpointId") String checkpointId,
            RedirectAttributes redirectAttributes) {
        try {
            CheckpointView checkpoint = service.createCheckpoint(stream, jobId, checkpointId);
            redirectAttributes.addFlashAttribute("message", "Saved checkpoint " + checkpoint.checkpointId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/jobs/replay")
    public String replay(
            @RequestParam("stream") String stream,
            @RequestParam("jobId") String jobId,
            @RequestParam(value = "partition", required = false) Integer partition,
            @RequestParam(value = "nextOffset", required = false) Long nextOffset,
            @RequestParam(value = "checkpointId", required = false) String checkpointId,
            @RequestParam(value = "clearState", defaultValue = "false") boolean clearState,
            RedirectAttributes redirectAttributes) {
        try {
            ReplayResult result = service.replay(stream, jobId, partition, nextOffset, checkpointId, clearState);
            redirectAttributes.addFlashAttribute(
                    "message",
                    result.restoredCheckpoint()
                            ? "Restored checkpoint " + result.checkpointId() + "."
                            : "Updated offsets for replay on " + result.jobId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/api/streams")
    @ResponseBody
    public StreamProcessingSnapshot snapshotApi() {
        return service.snapshot();
    }

    @PostMapping("/api/streams")
    @ResponseBody
    public ResponseEntity<StreamView> createStreamApi(@Valid @RequestBody CreateStreamRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.createStream(request.stream(), request.partitions(), request.windowSeconds()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/events")
    @ResponseBody
    public ResponseEntity<PublishEventResult> publishEventApi(@Valid @RequestBody PublishEventRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.publishEvent(request.stream(), request.key(), request.value(), request.eventTimeMillis(), request.partition()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/jobs/process")
    @ResponseBody
    public ResponseEntity<ProcessBatchResult> processApi(@Valid @RequestBody ProcessBatchRequest request) {
        try {
            return ResponseEntity.ok(service.processBatch(request.stream(), request.jobId(), request.maxRecords()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/jobs/checkpoints")
    @ResponseBody
    public ResponseEntity<CheckpointView> checkpointApi(@Valid @RequestBody CheckpointRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.createCheckpoint(request.stream(), request.jobId(), request.checkpointId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/jobs/replay")
    @ResponseBody
    public ResponseEntity<ReplayResult> replayApi(@Valid @RequestBody ReplayRequest request) {
        try {
            return ResponseEntity.ok(service.replay(
                    request.stream(),
                    request.jobId(),
                    request.partition(),
                    request.nextOffset(),
                    request.checkpointId(),
                    Boolean.TRUE.equals(request.clearState())));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }
}
