package com.randomproject.cdn;

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
public class CdnController {
    private final CdnService service;

    public CdnController(CdnService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        List<OriginAsset> assets = service.listOriginAssets();
        List<EdgeSummary> edges = service.listEdges();
        List<CachedAssetView> cacheEntries = service.listCachedAssets();
        model.addAttribute("message", message);
        model.addAttribute("defaults", service.defaults());
        model.addAttribute("assets", assets);
        model.addAttribute("edges", edges);
        model.addAttribute("cacheEntries", cacheEntries);
        model.addAttribute("assetCount", assets.size());
        model.addAttribute("edgeCount", edges.size());
        model.addAttribute("cacheCount", cacheEntries.size());
        return "index";
    }

    @PostMapping("/origin/assets")
    public String publishAsset(@RequestParam("path") String path,
                               @RequestParam("content") String content,
                               @RequestParam(value = "cacheTtlSeconds", required = false) Integer cacheTtlSeconds,
                               RedirectAttributes redirectAttributes) {
        try {
            OriginAsset asset = service.publishAsset(path, content, cacheTtlSeconds);
            redirectAttributes.addAttribute("message", "Published origin asset " + asset.path() + " at version " + asset.version());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/deliver")
    public String deliver(@RequestParam("path") String path,
                          @RequestParam(value = "region", required = false) String region,
                          @RequestParam(value = "edgeId", required = false) String edgeId,
                          RedirectAttributes redirectAttributes) {
        try {
            DeliveryResponse response = service.deliver(path, region, edgeId);
            redirectAttributes.addAttribute(
                    "message",
                    response.cacheStatus() + " from " + response.edgeId() + " at v" + response.version()
                            + " (" + response.estimatedLatencyMs() + "ms)");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/invalidate")
    public String invalidate(@RequestParam(value = "path", required = false) String path,
                             @RequestParam(value = "prefix", required = false) String prefix,
                             RedirectAttributes redirectAttributes) {
        try {
            InvalidationResult result = service.invalidate(path, prefix);
            redirectAttributes.addAttribute(
                    "message",
                    "Invalidated " + result.invalidatedEntries() + " cache entries across " + result.invalidatedEdges() + " edge(s).");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/api/origin/assets")
    @ResponseBody
    public ResponseEntity<OriginAsset> apiPublishAsset(@Valid @RequestBody PublishAssetRequest request) {
        try {
            return ResponseEntity.status(201).body(service.publishAsset(request.path(), request.content(), request.cacheTtlSeconds()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/origin/assets")
    @ResponseBody
    public List<OriginAsset> apiAssets() {
        return service.listOriginAssets();
    }

    @PostMapping("/api/deliver")
    @ResponseBody
    public ResponseEntity<DeliveryResponse> apiDeliver(@Valid @RequestBody DeliverRequest request) {
        try {
            return ResponseEntity.ok(service.deliver(request.path(), request.region(), request.edgeId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/invalidate")
    @ResponseBody
    public ResponseEntity<InvalidationResult> apiInvalidate(@RequestBody InvalidateRequest request) {
        try {
            return ResponseEntity.ok(service.invalidate(request.path(), request.prefix()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/edges")
    @ResponseBody
    public List<EdgeSummary> apiEdges() {
        return service.listEdges();
    }

    @GetMapping("/api/cache")
    @ResponseBody
    public List<CachedAssetView> apiCache() {
        return service.listCachedAssets();
    }
}
