package com.randomproject.netflix;

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
public class NetflixController {
    private final NetflixService service;

    public NetflixController(NetflixService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "profileId", required = false) String profileId,
                       @RequestParam(value = "query", required = false) String query,
                       @RequestParam(value = "genre", required = false) String genre,
                       Model model) {
        Profile activeProfile = service.resolveProfile(profileId);
        model.addAttribute("profiles", service.allProfiles());
        model.addAttribute("activeProfile", activeProfile);
        model.addAttribute("defaultLimit", service.getDefaultLimit());
        model.addAttribute("maxLimit", service.getMaxLimit());
        model.addAttribute("maxGenres", service.getMaxGenres());
        model.addAttribute("genres", service.allGenres());

        String resolvedQuery = query == null ? "" : query.trim();
        String resolvedGenre = genre == null ? "" : genre.trim();
        model.addAttribute("query", resolvedQuery);
        model.addAttribute("genreFilter", resolvedGenre);

        if (!model.containsAttribute("recommendations")) {
            model.addAttribute(
                    "recommendations",
                    toRecommendationResponses(service.recommendations(activeProfile.getId(), null))
            );
        }
        if (!model.containsAttribute("continueWatching")) {
            model.addAttribute(
                    "continueWatching",
                    toContinueResponses(service.continueWatching(activeProfile.getId(), null))
            );
        }
        if (!model.containsAttribute("watchlist")) {
            model.addAttribute("watchlist", service.watchlist(activeProfile.getId()));
        }
        if (!model.containsAttribute("trending")) {
            model.addAttribute("trending", service.trending(null));
        }
        model.addAttribute("catalog", service.search(resolvedQuery, resolvedGenre));
        return "index";
    }

    @PostMapping("/profiles")
    public String createProfile(@RequestParam("name") String name,
                                @RequestParam(value = "favoriteGenres", required = false) String favoriteGenres,
                                @RequestParam(value = "maturityLimit", required = false) String maturityLimit,
                                RedirectAttributes redirectAttributes) {
        try {
            Profile profile = service.createProfile(name, parseGenres(favoriteGenres), maturityLimit);
            redirectAttributes.addFlashAttribute("message", "Created profile " + profile.getName());
            redirectAttributes.addAttribute("profileId", profile.getId());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/catalog")
    public String upsertCatalog(@RequestParam("id") String id,
                                @RequestParam("title") String title,
                                @RequestParam("type") CatalogType type,
                                @RequestParam("year") int year,
                                @RequestParam("durationMinutes") int durationMinutes,
                                @RequestParam("maturityRating") String maturityRating,
                                @RequestParam(value = "genres", required = false) String genres,
                                @RequestParam(value = "description", required = false) String description,
                                @RequestParam(value = "popularity", required = false) Integer popularity,
                                @RequestParam(value = "profileId", required = false) String profileId,
                                RedirectAttributes redirectAttributes) {
        try {
            CatalogItem item = service.upsertCatalog(
                    id,
                    title,
                    type,
                    year,
                    durationMinutes,
                    maturityRating,
                    parseGenres(genres),
                    description,
                    popularity
            );
            redirectAttributes.addFlashAttribute("message", "Saved " + item.getTitle());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        if (StringUtils.hasText(profileId)) {
            redirectAttributes.addAttribute("profileId", profileId);
        }
        return "redirect:/";
    }

    @PostMapping("/watchlist")
    public String updateWatchlist(@RequestParam("profileId") String profileId,
                                  @RequestParam("contentId") String contentId,
                                  @RequestParam(value = "remove", required = false) String remove,
                                  RedirectAttributes redirectAttributes) {
        try {
            boolean shouldRemove = StringUtils.hasText(remove);
            service.updateWatchlist(profileId, contentId, shouldRemove);
            redirectAttributes.addFlashAttribute(
                    "message",
                    shouldRemove ? "Removed from watchlist." : "Added to watchlist."
            );
            redirectAttributes.addAttribute("profileId", profileId);
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/playback")
    public String recordPlayback(@RequestParam("profileId") String profileId,
                                 @RequestParam("contentId") String contentId,
                                 @RequestParam(value = "progress", required = false) Integer progress,
                                 @RequestParam(value = "completed", required = false) String completed,
                                 RedirectAttributes redirectAttributes) {
        try {
            boolean completedValue = StringUtils.hasText(completed);
            WatchProgress watch = service.recordPlayback(profileId, contentId, progress, completedValue);
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Playback saved: " + watch.getProgress() + "% progress."
            );
            redirectAttributes.addAttribute("profileId", profileId);
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/api/catalog")
    @ResponseBody
    public List<CatalogResponse> apiCatalog() {
        return service.allCatalog().stream().map(this::toCatalogResponse).toList();
    }

    @PostMapping("/api/catalog")
    @ResponseBody
    public ResponseEntity<CatalogResponse> apiCatalogUpsert(@Valid @RequestBody CatalogUpsertRequest request) {
        try {
            CatalogItem item = service.upsertCatalog(
                    request.id(),
                    request.title(),
                    request.type(),
                    request.year(),
                    request.durationMinutes(),
                    request.maturityRating(),
                    request.genres(),
                    request.description(),
                    request.popularity()
            );
            return ResponseEntity.status(201).body(toCatalogResponse(item));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/profiles")
    @ResponseBody
    public List<ProfileResponse> apiProfiles() {
        return service.allProfiles().stream().map(this::toProfileResponse).toList();
    }

    @PostMapping("/api/profiles")
    @ResponseBody
    public ResponseEntity<ProfileResponse> apiCreateProfile(@Valid @RequestBody ProfileCreateRequest request) {
        try {
            Profile profile = service.createProfile(request.name(), request.favoriteGenres(), request.maturityLimit());
            return ResponseEntity.status(201).body(toProfileResponse(profile));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/recommendations")
    @ResponseBody
    public ResponseEntity<List<RecommendationResponse>> apiRecommendations(
            @RequestParam("profileId") String profileId,
            @RequestParam(value = "limit", required = false) Integer limit
    ) {
        try {
            return ResponseEntity.ok(toRecommendationResponses(service.recommendations(profileId, limit)));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/trending")
    @ResponseBody
    public List<CatalogResponse> apiTrending(@RequestParam(value = "limit", required = false) Integer limit) {
        return service.trending(limit).stream().map(this::toCatalogResponse).toList();
    }

    @GetMapping("/api/continue")
    @ResponseBody
    public ResponseEntity<List<ContinueWatchingResponse>> apiContinue(
            @RequestParam("profileId") String profileId,
            @RequestParam(value = "limit", required = false) Integer limit
    ) {
        try {
            return ResponseEntity.ok(toContinueResponses(service.continueWatching(profileId, limit)));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/watchlist")
    @ResponseBody
    public ResponseEntity<List<CatalogResponse>> apiWatchlist(@RequestParam("profileId") String profileId) {
        try {
            return ResponseEntity.ok(service.watchlist(profileId).stream().map(this::toCatalogResponse).toList());
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/watchlist")
    @ResponseBody
    public ResponseEntity<Void> apiUpdateWatchlist(@Valid @RequestBody WatchlistRequest request) {
        try {
            boolean remove = request.remove() != null && request.remove();
            service.updateWatchlist(request.profileId(), request.contentId(), remove);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/playback")
    @ResponseBody
    public ResponseEntity<PlaybackResponse> apiPlayback(@Valid @RequestBody PlaybackRequest request) {
        try {
            WatchProgress watch = service.recordPlayback(
                    request.profileId(),
                    request.contentId(),
                    request.progress(),
                    request.completed()
            );
            return ResponseEntity.ok(toPlaybackResponse(watch, request.profileId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/search")
    @ResponseBody
    public List<CatalogResponse> apiSearch(@RequestParam(value = "query", required = false) String query,
                                           @RequestParam(value = "genre", required = false) String genre) {
        return service.search(query, genre).stream().map(this::toCatalogResponse).toList();
    }

    private List<String> parseGenres(String raw) {
        if (!StringUtils.hasText(raw)) {
            return List.of();
        }
        String[] parts = raw.split(",");
        List<String> result = new ArrayList<>();
        for (String part : parts) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
            }
        }
        return result;
    }

    private CatalogResponse toCatalogResponse(CatalogItem item) {
        return new CatalogResponse(
                item.getId(),
                item.getTitle(),
                item.getType(),
                item.getYear(),
                item.getDurationMinutes(),
                item.getMaturityRating(),
                item.getGenres(),
                item.getDescription(),
                item.getPopularity(),
                item.getPlays(),
                item.getCreatedAt(),
                item.getUpdatedAt()
        );
    }

    private ProfileResponse toProfileResponse(Profile profile) {
        return new ProfileResponse(
                profile.getId(),
                profile.getName(),
                profile.getFavoriteGenres(),
                profile.getMaturityLimit(),
                profile.getCreatedAt()
        );
    }

    private List<RecommendationResponse> toRecommendationResponses(List<RecommendationEntry> entries) {
        List<RecommendationResponse> responses = new ArrayList<>();
        int rank = 1;
        for (RecommendationEntry entry : entries) {
            CatalogItem item = entry.item();
            String reason = entry.genreMatches() > 0
                    ? "Matched " + entry.genreMatches() + " favorite genres"
                    : "Popular pick";
            responses.add(new RecommendationResponse(
                    rank++,
                    item.getId(),
                    item.getTitle(),
                    item.getType(),
                    item.getGenres(),
                    item.getYear(),
                    entry.score(),
                    reason
            ));
        }
        return responses;
    }

    private List<ContinueWatchingResponse> toContinueResponses(List<ContinueWatchingEntry> entries) {
        List<ContinueWatchingResponse> responses = new ArrayList<>();
        for (ContinueWatchingEntry entry : entries) {
            responses.add(new ContinueWatchingResponse(
                    entry.item().getId(),
                    entry.item().getTitle(),
                    entry.progress().getProgress(),
                    entry.progress().getUpdatedAt()
            ));
        }
        return responses;
    }

    private PlaybackResponse toPlaybackResponse(WatchProgress watch, String profileId) {
        return new PlaybackResponse(
                profileId,
                watch.getContentId(),
                watch.getProgress(),
                watch.isCompleted(),
                watch.getUpdatedAt()
        );
    }
}
