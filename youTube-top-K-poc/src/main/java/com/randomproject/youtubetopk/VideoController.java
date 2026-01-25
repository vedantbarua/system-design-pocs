package com.randomproject.youtubetopk;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.ArrayList;
import java.util.List;

@Controller
public class VideoController {
    private final VideoService service;

    public VideoController(VideoService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("defaultLimit", service.getDefaultLimit());
        model.addAttribute("viewWeight", service.getViewWeight());
        model.addAttribute("likeWeight", service.getLikeWeight());
        model.addAttribute("maxTags", service.getMaxTags());
        model.addAttribute("videos", service.allVideos());
        if (!model.containsAttribute("limit")) {
            model.addAttribute("limit", service.getDefaultLimit());
        }
        if (!model.containsAttribute("tag")) {
            model.addAttribute("tag", "");
        }
        if (!model.containsAttribute("topVideos")) {
            model.addAttribute("topVideos", toTopResponses(service.topK(null, service.getDefaultLimit())));
        }
        return "index";
    }

    @PostMapping("/top")
    public String top(@RequestParam(value = "tag", required = false) String tag,
                      @RequestParam(value = "limit", required = false) Integer limit,
                      RedirectAttributes redirectAttributes) {
        try {
            List<VideoScore> top = service.topK(tag, limit);
            redirectAttributes.addFlashAttribute("topVideos", toTopResponses(top));
            redirectAttributes.addFlashAttribute("tag", tag == null ? "" : tag.trim());
            redirectAttributes.addFlashAttribute("limit", limit == null ? service.getDefaultLimit() : limit);
            redirectAttributes.addFlashAttribute(
                    "message",
                    top.isEmpty() ? "No videos found for that filter." : "Showing top " + top.size() + " videos."
            );
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/videos")
    public String upsert(@RequestParam("id") String id,
                         @RequestParam("title") String title,
                         @RequestParam("channel") String channel,
                         @RequestParam(value = "tags", required = false) String tags,
                         @RequestParam(value = "views", required = false) Long views,
                         @RequestParam(value = "likes", required = false) Long likes,
                         RedirectAttributes redirectAttributes) {
        try {
            VideoRecord record = service.upsert(id, title, channel, parseTags(tags), views, likes);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Saved video " + record.getTitle() + " (" + record.getId() + ")"
            );
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/events")
    public String recordEngagement(@RequestParam("id") String id,
                                   @RequestParam(value = "viewDelta", required = false) Long viewDelta,
                                   @RequestParam(value = "likeDelta", required = false) Long likeDelta,
                                   RedirectAttributes redirectAttributes) {
        try {
            VideoRecord record = service.recordEngagement(id, viewDelta, likeDelta);
            long resolvedViews = viewDelta == null ? 0L : viewDelta;
            long resolvedLikes = likeDelta == null ? 0L : likeDelta;
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Recorded engagement for " + record.getTitle() + " (+" + resolvedViews + " views, +" + resolvedLikes + " likes)"
            );
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/api/top")
    @ResponseBody
    public List<TopVideoResponse> apiTop(@RequestParam(value = "tag", required = false) String tag,
                                         @RequestParam(value = "limit", required = false) Integer limit) {
        return toTopResponses(service.topK(tag, limit));
    }

    @GetMapping("/api/videos")
    @ResponseBody
    public List<VideoResponse> apiVideos() {
        return service.allVideos().stream().map(this::toResponse).toList();
    }

    @PostMapping("/api/videos")
    @ResponseBody
    public ResponseEntity<VideoResponse> apiUpsert(@Valid @RequestBody VideoUpsertRequest request) {
        try {
            VideoRecord record = service.upsert(
                    request.id(),
                    request.title(),
                    request.channel(),
                    request.tags(),
                    request.views(),
                    request.likes()
            );
            return ResponseEntity.status(201).body(toResponse(record));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/events")
    @ResponseBody
    public ResponseEntity<VideoResponse> apiEvent(@Valid @RequestBody VideoEventRequest request) {
        try {
            VideoRecord record = service.recordEngagement(request.id(), request.viewDelta(), request.likeDelta());
            return ResponseEntity.ok(toResponse(record));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    private List<TopVideoResponse> toTopResponses(List<VideoScore> scores) {
        List<TopVideoResponse> response = new ArrayList<>();
        int rank = 1;
        for (VideoScore score : scores) {
            VideoRecord record = score.video();
            response.add(new TopVideoResponse(
                    rank++,
                    record.getId(),
                    record.getTitle(),
                    record.getChannel(),
                    record.getTags(),
                    record.getViews(),
                    record.getLikes(),
                    score.score(),
                    record.getUpdatedAt()
            ));
        }
        return response;
    }

    private VideoResponse toResponse(VideoRecord record) {
        long score = (record.getViews() * service.getViewWeight()) + (record.getLikes() * service.getLikeWeight());
        return new VideoResponse(
                record.getId(),
                record.getTitle(),
                record.getChannel(),
                record.getTags(),
                record.getViews(),
                record.getLikes(),
                score,
                record.getCreatedAt(),
                record.getUpdatedAt()
        );
    }

    private List<String> parseTags(String tags) {
        if (!StringUtils.hasText(tags)) {
            return List.of();
        }
        String[] parts = tags.split(",");
        List<String> result = new ArrayList<>();
        for (String part : parts) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
            }
        }
        return result;
    }
}
