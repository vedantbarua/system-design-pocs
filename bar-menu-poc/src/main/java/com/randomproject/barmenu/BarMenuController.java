package com.randomproject.barmenu;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;

@Controller
public class BarMenuController {
    private final BarMenuService service;

    public BarMenuController(BarMenuService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "active", required = false) String active,
                       @RequestParam(value = "message", required = false) String message,
                       Model model) {
        List<PrepSession> sessions = service.sessions();
        PrepSession activeSession = active == null
                ? sessions.stream().findFirst().orElse(null)
                : service.session(active).orElse(null);

        model.addAttribute("drinks", service.drinks());
        model.addAttribute("sessions", sessions);
        model.addAttribute("activeSession", activeSession);
        model.addAttribute("events", service.recentEvents());
        model.addAttribute("message", message);
        model.addAttribute("activeView", activeSession == null ? null : service.view(activeSession));
        return "index";
    }

    @PostMapping("/sessions")
    public String start(@RequestParam("drinkId") String drinkId, RedirectAttributes redirectAttributes) {
        try {
            PrepSession session = service.start(drinkId);
            redirectAttributes.addAttribute("active", session.getId());
            redirectAttributes.addAttribute("message", "Started helper for " + session.getDrink().name() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/sessions/{id}/advance")
    public String advance(@PathVariable String id, RedirectAttributes redirectAttributes) {
        return transition(id, redirectAttributes, () -> service.advance(id));
    }

    @PostMapping("/sessions/{id}/back")
    public String back(@PathVariable String id, RedirectAttributes redirectAttributes) {
        return transition(id, redirectAttributes, () -> service.back(id));
    }

    @PostMapping("/sessions/{id}/reset")
    public String reset(@PathVariable String id, RedirectAttributes redirectAttributes) {
        return transition(id, redirectAttributes, () -> service.reset(id));
    }

    @GetMapping("/api/drinks")
    @ResponseBody
    public List<Drink> apiDrinks() {
        return service.drinks();
    }

    @GetMapping("/api/sessions")
    @ResponseBody
    public List<PrepSessionView> apiSessions() {
        return service.sessions().stream().map(service::view).toList();
    }

    @PostMapping("/api/sessions")
    @ResponseBody
    public ResponseEntity<PrepSessionView> apiStart(@Valid @RequestBody StartPrepRequest request) {
        try {
            return ResponseEntity.status(201).body(service.view(service.start(request.drinkId())));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/sessions/{id}")
    @ResponseBody
    public ResponseEntity<PrepSessionView> apiSession(@PathVariable String id) {
        return service.session(id)
                .map(session -> ResponseEntity.ok(service.view(session)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/sessions/{id}/advance")
    @ResponseBody
    public ResponseEntity<PrepSessionView> apiAdvance(@PathVariable String id) {
        return apiTransition(id, () -> service.advance(id));
    }

    @PostMapping("/api/sessions/{id}/back")
    @ResponseBody
    public ResponseEntity<PrepSessionView> apiBack(@PathVariable String id) {
        return apiTransition(id, () -> service.back(id));
    }

    @PostMapping("/api/sessions/{id}/reset")
    @ResponseBody
    public ResponseEntity<PrepSessionView> apiReset(@PathVariable String id) {
        return apiTransition(id, () -> service.reset(id));
    }

    @GetMapping("/api/events")
    @ResponseBody
    public List<PrepEvent> apiEvents() {
        return service.recentEvents();
    }

    private String transition(String id, RedirectAttributes redirectAttributes, SessionAction action) {
        try {
            PrepSession session = action.run();
            redirectAttributes.addAttribute("active", session.getId());
            redirectAttributes.addAttribute("message", session.getDrink().name() + " helper updated.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    private ResponseEntity<PrepSessionView> apiTransition(String id, SessionAction action) {
        try {
            return ResponseEntity.ok(service.view(action.run()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    private interface SessionAction {
        PrepSession run();
    }
}
