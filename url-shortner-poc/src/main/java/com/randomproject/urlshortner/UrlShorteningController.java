package com.randomproject.urlshortner;

import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
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
import org.springframework.web.servlet.view.RedirectView;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Controller
public class UrlShorteningController {
    private final UrlShorteningService service;
    private final String baseUrl;

    public UrlShorteningController(UrlShorteningService service,
                                   @Value("${app.base-url:http://localhost:8082}") String baseUrl) {
        this.service = service;
        this.baseUrl = baseUrl;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        model.addAttribute("links", sortedLinks());
        model.addAttribute("message", message);
        model.addAttribute("baseUrl", baseUrl);
        return "index";
    }

    @PostMapping("/shorten")
    public String shorten(@RequestParam("url") String url,
                          @RequestParam(value = "alias", required = false) String alias,
                          RedirectAttributes redirectAttributes) {
        try {
            ShortLink link = service.create(url, alias);
            redirectAttributes.addAttribute("message", "Created short link: " + shortUrl(link));
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/s/{code}")
    public RedirectView redirect(@PathVariable String code, RedirectAttributes redirectAttributes) {
        return service.resolve(code)
                .map(link -> {
                    RedirectView view = new RedirectView(link.getTargetUrl());
                    view.setExposeModelAttributes(false);
                    return view;
                })
                .orElseGet(() -> {
                    redirectAttributes.addAttribute("message", "Unknown short code: " + code);
                    RedirectView view = new RedirectView("/");
                    view.setExposeModelAttributes(false);
                    return view;
                });
    }

    @PostMapping("/api/shorten")
    @ResponseBody
    public ResponseEntity<ShortLinkResponse> apiShorten(@Valid @RequestBody ShortenRequest request) {
        try {
            ShortLink link = service.create(request.url(), request.alias());
            return ResponseEntity.status(201).body(toResponse(link));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/links")
    @ResponseBody
    public List<ShortLinkResponse> apiLinks() {
        return sortedLinks().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/links/{code}")
    @ResponseBody
    public ResponseEntity<ShortLinkResponse> apiLink(@PathVariable String code) {
        return service.find(code)
                .map(link -> ResponseEntity.ok(toResponse(link)))
                .orElse(ResponseEntity.notFound().build());
    }

    private ShortLinkResponse toResponse(ShortLink link) {
        return new ShortLinkResponse(link.getCode(), link.getTargetUrl(), shortUrl(link), link.getHits(), link.getCreatedAt());
    }

    private String shortUrl(ShortLink link) {
        return baseUrl + "/s/" + link.getCode();
    }

    private List<ShortLink> sortedLinks() {
        return service.all().stream()
                .sorted(Comparator.comparing(ShortLink::getCreatedAt).reversed())
                .collect(Collectors.toList());
    }
}
