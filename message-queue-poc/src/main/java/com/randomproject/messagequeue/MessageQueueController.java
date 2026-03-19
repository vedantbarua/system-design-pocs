package com.randomproject.messagequeue;

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
public class MessageQueueController {
    private final MessageQueueService service;

    public MessageQueueController(MessageQueueService service) {
        this.service = service;
    }

    @ModelAttribute("config")
    public QueueConfigSnapshot config() {
        return service.configSnapshot();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("snapshot", service.snapshot());
        return "index";
    }

    @PostMapping("/topics")
    public String createTopic(
            @RequestParam("topic") String topic,
            @RequestParam(value = "partitions", required = false) Integer partitions,
            RedirectAttributes redirectAttributes) {
        try {
            TopicView created = service.createTopic(topic, partitions);
            redirectAttributes.addFlashAttribute("message", "Created topic " + created.topic() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/messages/publish")
    public String publish(
            @RequestParam("topic") String topic,
            @RequestParam(value = "key", required = false) String key,
            @RequestParam("payload") String payload,
            @RequestParam(value = "partition", required = false) Integer partition,
            RedirectAttributes redirectAttributes) {
        try {
            PublishResult result = service.publish(topic, key, payload, partition);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Published to " + result.topic() + "[p" + result.partition() + "] offset " + result.offset() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/consumers/poll")
    public String poll(
            @RequestParam("topic") String topic,
            @RequestParam("groupId") String groupId,
            @RequestParam(value = "maxMessages", required = false) Integer maxMessages,
            RedirectAttributes redirectAttributes) {
        try {
            PollResponse response = service.poll(topic, groupId, maxMessages);
            redirectAttributes.addFlashAttribute("pollResult", response);
            redirectAttributes.addFlashAttribute(
                    "message",
                    response.deliveredCount() == 0
                            ? "No messages available for " + response.groupId() + "."
                            : "Delivered " + response.deliveredCount() + " message(s) to " + response.groupId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/consumers/ack")
    public String ack(
            @RequestParam("topic") String topic,
            @RequestParam("groupId") String groupId,
            @RequestParam("partition") Integer partition,
            @RequestParam("offset") Long offset,
            RedirectAttributes redirectAttributes) {
        try {
            AckResult result = service.ack(topic, groupId, partition, offset);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Acked " + result.topic() + "[p" + result.partition() + "] offset " + result.ackedOffset() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/consumers/retry")
    public String retry(
            @RequestParam("topic") String topic,
            @RequestParam("groupId") String groupId,
            @RequestParam("partition") Integer partition,
            @RequestParam("offset") Long offset,
            @RequestParam(value = "reason", required = false) String reason,
            RedirectAttributes redirectAttributes) {
        try {
            RetryResult result = service.retry(topic, groupId, partition, offset, reason);
            redirectAttributes.addFlashAttribute(
                    "message",
                    result.deadLettered()
                            ? "Moved offset " + result.offset() + " to the DLQ."
                            : "Scheduled redelivery attempt " + result.deliveryAttempt() + " for offset " + result.offset() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/consumers/reset")
    public String resetOffset(
            @RequestParam("topic") String topic,
            @RequestParam("groupId") String groupId,
            @RequestParam("partition") Integer partition,
            @RequestParam("nextOffset") Long nextOffset,
            RedirectAttributes redirectAttributes) {
        try {
            ResetOffsetResult result = service.resetOffset(topic, groupId, partition, nextOffset);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Reset " + result.groupId() + " to offset " + result.nextOffset() + " on partition " + result.partition() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/api/topics")
    @ResponseBody
    public QueueSnapshot snapshot() {
        return service.snapshot();
    }

    @PostMapping("/api/topics")
    @ResponseBody
    public ResponseEntity<TopicView> createTopicApi(@Valid @RequestBody CreateTopicRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(service.createTopic(request.topic(), request.partitions()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/messages")
    @ResponseBody
    public ResponseEntity<PublishResult> publishApi(@Valid @RequestBody PublishMessageRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.publish(request.topic(), request.key(), request.payload(), request.partition()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/consumers/poll")
    @ResponseBody
    public ResponseEntity<PollResponse> pollApi(@Valid @RequestBody PollRequest request) {
        try {
            return ResponseEntity.ok(service.poll(request.topic(), request.groupId(), request.maxMessages()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/consumers/ack")
    @ResponseBody
    public ResponseEntity<AckResult> ackApi(@Valid @RequestBody AckRequest request) {
        try {
            return ResponseEntity.ok(service.ack(request.topic(), request.groupId(), request.partition(), request.offset()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/consumers/retry")
    @ResponseBody
    public ResponseEntity<RetryResult> retryApi(@Valid @RequestBody RetryRequest request) {
        try {
            return ResponseEntity.ok(service.retry(request.topic(), request.groupId(), request.partition(), request.offset(), request.reason()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/consumers/reset")
    @ResponseBody
    public ResponseEntity<ResetOffsetResult> resetOffsetApi(@Valid @RequestBody ResetOffsetRequest request) {
        try {
            return ResponseEntity.ok(service.resetOffset(request.topic(), request.groupId(), request.partition(), request.nextOffset()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }
}
