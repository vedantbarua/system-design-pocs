package com.randomproject.webcrawler;

import jakarta.validation.Valid;
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
public class WebCrawlerController {
    private final CrawlerService service;

    public WebCrawlerController(CrawlerService service) {
        this.service = service;
    }

    @ModelAttribute("defaults")
    public CrawlDefaults defaults() {
        return service.defaults();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("defaults", service.defaults());
        return "index";
    }

    @PostMapping("/crawl")
    public String crawl(@RequestParam("startUrl") String startUrl,
                        @RequestParam(value = "maxDepth", required = false) Integer maxDepth,
                        @RequestParam(value = "maxPages", required = false) Integer maxPages,
                        @RequestParam(value = "delayMillis", required = false) Integer delayMillis,
                        @RequestParam(value = "sameHostOnly", required = false, defaultValue = "false") boolean sameHostOnly,
                        RedirectAttributes redirectAttributes) {
        try {
            CrawlResult result = service.crawl(new CrawlRequest(startUrl, maxDepth, maxPages, delayMillis, sameHostOnly));
            redirectAttributes.addFlashAttribute("result", result);
            redirectAttributes.addFlashAttribute("message",
                    "Crawl finished: " + result.summary().visited() + " pages scanned.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/api/crawl")
    @ResponseBody
    public ResponseEntity<CrawlResult> apiCrawl(@Valid @RequestBody CrawlRequest request) {
        try {
            return ResponseEntity.ok(service.crawl(request));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }
}
