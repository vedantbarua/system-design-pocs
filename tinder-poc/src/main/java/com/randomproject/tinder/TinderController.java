package com.randomproject.tinder;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class TinderController {
    private final TinderService tinderService;

    public TinderController(TinderService tinderService) {
        this.tinderService = tinderService;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message,
                       Model model) {
        Profile candidate = tinderService.nextCandidate();
        List<Profile> queue = tinderService.listQueue();
        model.addAttribute("summary", tinderService.getSummary());
        model.addAttribute("candidate", candidate);
        model.addAttribute("queue", queue.stream().skip(1).limit(3).toList());
        model.addAttribute("matches", tinderService.listMatches());
        model.addAttribute("message", message);
        return "home";
    }

    @PostMapping("/swipe")
    public String swipe(@RequestParam("profileId") long profileId,
                        @RequestParam("decision") SwipeDecision decision,
                        RedirectAttributes redirectAttributes) {
        SwipeResult result = tinderService.swipe(profileId, decision);
        if (result == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found");
        }
        redirectAttributes.addAttribute("message", result.getMessage());
        return "redirect:/";
    }

    @PostMapping("/reset")
    public String reset(RedirectAttributes redirectAttributes) {
        tinderService.reset();
        redirectAttributes.addAttribute("message", "Deck refreshed. Start swiping again!");
        return "redirect:/";
    }

    @GetMapping("/profile/{id}")
    public String profile(@PathVariable long id, Model model) {
        Profile profile = tinderService.getProfile(id);
        if (profile == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found");
        }
        model.addAttribute("profile", profile);
        model.addAttribute("matches", tinderService.listMatches());
        model.addAttribute("summary", tinderService.getSummary());
        return "profile";
    }

    @GetMapping("/matches")
    public String matches(Model model) {
        model.addAttribute("matches", tinderService.listMatches());
        model.addAttribute("summary", tinderService.getSummary());
        return "matches";
    }

    @GetMapping("/new")
    public String newProfile(Model model) {
        ProfileForm form = new ProfileForm();
        form.setAge(27);
        form.setDistanceKm(6);
        form.setLastActiveMinutes(12);
        form.setCompatibilityPercent(88);
        form.setVibe(ProfileVibe.GOLDEN_HOUR);
        model.addAttribute("profileForm", form);
        model.addAttribute("vibes", ProfileVibe.values());
        return "new-profile";
    }

    @PostMapping("/profiles")
    public String createProfile(@Valid @ModelAttribute("profileForm") ProfileForm form,
                                BindingResult bindingResult,
                                Model model) {
        if (bindingResult.hasErrors()) {
            model.addAttribute("vibes", ProfileVibe.values());
            return "new-profile";
        }
        Profile profile = tinderService.createProfile(form);
        return "redirect:/profile/" + profile.getId();
    }

    @GetMapping("/api/summary")
    @ResponseBody
    public TinderSummary apiSummary() {
        return tinderService.getSummary();
    }

    @GetMapping("/api/profiles")
    @ResponseBody
    public List<Profile> apiProfiles() {
        return tinderService.listProfiles();
    }

    @GetMapping("/api/profiles/queue")
    @ResponseBody
    public List<Profile> apiQueue() {
        return tinderService.listQueue();
    }

    @GetMapping("/api/profiles/{id}")
    @ResponseBody
    public ResponseEntity<Profile> apiProfile(@PathVariable long id) {
        Profile profile = tinderService.getProfile(id);
        if (profile == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(profile);
    }

    @PostMapping("/api/swipes")
    @ResponseBody
    public ResponseEntity<SwipeResponse> apiSwipe(@Valid @RequestBody SwipeRequest request) {
        SwipeResult result = tinderService.swipe(request.profileId(), request.decision());
        if (result == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(new SwipeResponse(
                result.getProfile().getId(),
                result.getDecision(),
                result.isMatched(),
                tinderService.getSummary().getMatches(),
                result.getMessage()));
    }

    @GetMapping("/api/matches")
    @ResponseBody
    public List<Match> apiMatches() {
        return tinderService.listMatches();
    }

    @PostMapping("/api/reset")
    @ResponseBody
    public ResponseEntity<Void> apiReset() {
        tinderService.reset();
        return ResponseEntity.noContent().build();
    }
}
