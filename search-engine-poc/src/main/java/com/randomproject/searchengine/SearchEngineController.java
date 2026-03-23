package com.randomproject.searchengine;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class SearchEngineController {
    private final SearchService service;

    public SearchEngineController(SearchService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("overview", service.overview());
        model.addAttribute("documents", service.allDocuments());
        model.addAttribute("shards", service.shardSnapshots());
        model.addAttribute("defaultLimit", service.getDefaultLimit());
        if (!model.containsAttribute("query")) {
            model.addAttribute("query", "");
        }
        if (!model.containsAttribute("limit")) {
            model.addAttribute("limit", service.getDefaultLimit());
        }
        return "index";
    }

    @PostMapping("/search")
    public String search(@RequestParam("query") String query,
                         @RequestParam(value = "limit", required = false) Integer limit,
                         RedirectAttributes redirectAttributes) {
        try {
            SearchResponse response = service.search(query, limit);
            redirectAttributes.addFlashAttribute("searchResponse", response);
            redirectAttributes.addFlashAttribute("query", query.trim());
            redirectAttributes.addFlashAttribute("limit", limit == null ? service.getDefaultLimit() : limit);
            redirectAttributes.addFlashAttribute(
                    "message",
                    response.totalHits() == 0
                            ? "No matching documents found."
                            : "Found " + response.totalHits() + " matching document(s)."
            );
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
            redirectAttributes.addFlashAttribute("query", query);
            redirectAttributes.addFlashAttribute("limit", limit);
        }
        return "redirect:/";
    }

    @PostMapping("/documents")
    public String addDocument(@RequestParam(value = "id", required = false) String id,
                              @RequestParam("title") String title,
                              @RequestParam(value = "url", required = false) String url,
                              @RequestParam("content") String content,
                              @RequestParam(value = "tags", required = false) String tags,
                              RedirectAttributes redirectAttributes) {
        try {
            IndexedDocument document = service.upsertDocument(new DocumentRequest(id, title, url, content, tags));
            redirectAttributes.addFlashAttribute(
                    "message",
                    "Indexed document " + document.id() + " on shard " + document.shardId() + "."
            );
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/api/search")
    @ResponseBody
    public SearchResponse apiSearch(@RequestParam("query") String query,
                                    @RequestParam(value = "limit", required = false) Integer limit) {
        return service.search(query, limit);
    }

    @GetMapping("/api/documents")
    @ResponseBody
    public java.util.List<IndexedDocument> apiDocuments() {
        return service.allDocuments();
    }

    @PostMapping("/api/documents")
    @ResponseBody
    public ResponseEntity<IndexedDocument> apiDocuments(@Valid @RequestBody DocumentRequest request) {
        try {
            return ResponseEntity.status(201).body(service.upsertDocument(request));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/shards")
    @ResponseBody
    public java.util.List<ShardSnapshot> apiShards() {
        return service.shardSnapshots();
    }

    @GetMapping("/api/overview")
    @ResponseBody
    public SearchOverview apiOverview() {
        return service.overview();
    }
}
