package com.randomproject.designdropbox;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class DesignDropboxController {
    private final DropboxService service;

    public DesignDropboxController(DropboxService service) {
        this.service = service;
    }

    @ModelAttribute("defaults")
    public DropboxDefaults defaults() {
        return service.defaults();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("folders", service.listFolders());
        model.addAttribute("files", service.listFiles());
        model.addAttribute("shares", service.listShares());
        model.addAttribute("rootId", service.rootId());
        return "index";
    }

    @PostMapping("/folders")
    public String createFolder(@RequestParam("name") String name,
                               @RequestParam(value = "parentId", required = false) String parentId,
                               RedirectAttributes redirectAttributes) {
        try {
            FolderEntry entry = service.createFolder(name, parentId);
            redirectAttributes.addFlashAttribute("message", "Folder created: " + entry.name());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/files")
    public String uploadFile(@RequestParam("name") String name,
                             @RequestParam("content") String content,
                             @RequestParam(value = "parentId", required = false) String parentId,
                             RedirectAttributes redirectAttributes) {
        try {
            FileEntry entry = service.uploadFile(name, content, parentId);
            redirectAttributes.addFlashAttribute("message", "File uploaded: " + entry.name());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/shares")
    public String createShare(@RequestParam("fileId") String fileId,
                              @RequestParam(value = "ttlMinutes", required = false) Integer ttlMinutes,
                              RedirectAttributes redirectAttributes) {
        try {
            ShareLink link = service.createShareLink(fileId, ttlMinutes);
            redirectAttributes.addFlashAttribute("message",
                    "Share link created: /shares/" + link.token());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/shares/{token}")
    @ResponseBody
    public ResponseEntity<FileDownload> download(@PathVariable String token) {
        try {
            return ResponseEntity.ok(service.resolveShare(token));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/folders")
    @ResponseBody
    public ResponseEntity<FolderEntry> apiCreateFolder(@Valid @RequestBody CreateFolderRequest request) {
        try {
            return ResponseEntity.ok(service.createFolder(request.name(), request.parentId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/files")
    @ResponseBody
    public ResponseEntity<FileEntry> apiUploadFile(@Valid @RequestBody UploadFileRequest request) {
        try {
            return ResponseEntity.ok(service.uploadFile(request.name(), request.content(), request.parentId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/shares")
    @ResponseBody
    public ResponseEntity<ShareLink> apiCreateShare(@Valid @RequestBody CreateShareLinkRequest request) {
        try {
            return ResponseEntity.ok(service.createShareLink(request.fileId(), request.ttlMinutes()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/folders")
    @ResponseBody
    public ResponseEntity<?> apiFolders() {
        return ResponseEntity.ok(service.listFolders());
    }

    @GetMapping("/api/files")
    @ResponseBody
    public ResponseEntity<?> apiFiles() {
        return ResponseEntity.ok(service.listFiles());
    }

    @GetMapping("/api/shares")
    @ResponseBody
    public ResponseEntity<?> apiShares() {
        return ResponseEntity.ok(service.listShares());
    }

    @GetMapping("/api/shares/{token}")
    @ResponseBody
    public ResponseEntity<FileDownload> apiShareDownload(@PathVariable String token) {
        try {
            return ResponseEntity.ok(service.resolveShare(token));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }
}
