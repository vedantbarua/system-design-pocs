package com.randomproject.googledocs;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class GoogleDocsController {
    private final GoogleDocsService service;

    public GoogleDocsController(GoogleDocsService service) {
        this.service = service;
    }

    @ModelAttribute("defaults")
    public DocsDefaults defaults() {
        return service.defaults();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("documents", service.listDocuments());
        return "index";
    }

    @GetMapping("/docs/{id}")
    public String document(@PathVariable("id") String docId, Model model, RedirectAttributes redirectAttributes) {
        try {
            model.addAttribute("document", service.getDocument(docId));
            model.addAttribute("versions", service.listVersions(docId));
            model.addAttribute("comments", service.listComments(docId));
            model.addAttribute("collaborators", service.listCollaborators(docId));
            return "document";
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
            return "redirect:/";
        }
    }

    @PostMapping("/docs")
    public String createDocument(@RequestParam("title") String title,
                                 @RequestParam(value = "owner", required = false) String owner,
                                 @RequestParam("content") String content,
                                 RedirectAttributes redirectAttributes) {
        try {
            String resolvedOwner = StringUtils.hasText(owner) ? owner : service.defaults().defaultOwner();
            DocumentEntry entry = service.createDocument(title, resolvedOwner, content);
            redirectAttributes.addFlashAttribute("message", "Document created: " + entry.title());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/docs/{id}/edit")
    public String editDocument(@PathVariable("id") String docId,
                               @RequestParam("editor") String editor,
                               @RequestParam("content") String content,
                               RedirectAttributes redirectAttributes) {
        try {
            service.updateDocument(docId, editor, content);
            redirectAttributes.addFlashAttribute("message", "Document updated.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/docs/" + docId;
    }

    @PostMapping("/docs/{id}/collaborators")
    public String addCollaborator(@PathVariable("id") String docId,
                                  @RequestParam("email") String email,
                                  @RequestParam("role") String role,
                                  RedirectAttributes redirectAttributes) {
        try {
            CollaboratorEntry entry = service.addCollaborator(docId, email, role);
            redirectAttributes.addFlashAttribute("message", "Collaborator added: " + entry.email());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/docs/" + docId;
    }

    @PostMapping("/docs/{id}/comments")
    public String addComment(@PathVariable("id") String docId,
                             @RequestParam("author") String author,
                             @RequestParam("message") String message,
                             RedirectAttributes redirectAttributes) {
        try {
            service.addComment(docId, author, message);
            redirectAttributes.addFlashAttribute("message", "Comment added.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/docs/" + docId;
    }

    @PostMapping("/docs/{id}/comments/{commentId}/resolve")
    public String resolveComment(@PathVariable("id") String docId,
                                 @PathVariable("commentId") String commentId,
                                 RedirectAttributes redirectAttributes) {
        try {
            service.resolveComment(docId, commentId);
            redirectAttributes.addFlashAttribute("message", "Comment resolved.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/docs/" + docId;
    }

    @PostMapping("/api/docs")
    @ResponseBody
    public ResponseEntity<DocumentEntry> apiCreate(@Valid @RequestBody CreateDocumentRequest request) {
        try {
            return ResponseEntity.ok(service.createDocument(request.title(), request.owner(), request.content()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/api/docs/{id}")
    @ResponseBody
    public ResponseEntity<DocumentEntry> apiUpdate(@PathVariable("id") String docId,
                                                   @Valid @RequestBody UpdateDocumentRequest request) {
        try {
            return ResponseEntity.ok(service.updateDocument(docId, request.editor(), request.content()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/docs/{id}/comments")
    @ResponseBody
    public ResponseEntity<CommentEntry> apiComment(@PathVariable("id") String docId,
                                                   @Valid @RequestBody AddCommentRequest request) {
        try {
            return ResponseEntity.ok(service.addComment(docId, request.author(), request.message()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/docs/{id}/comments/{commentId}/resolve")
    @ResponseBody
    public ResponseEntity<CommentEntry> apiResolveComment(@PathVariable("id") String docId,
                                                          @PathVariable("commentId") String commentId) {
        try {
            return ResponseEntity.ok(service.resolveComment(docId, commentId));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/docs/{id}/collaborators")
    @ResponseBody
    public ResponseEntity<CollaboratorEntry> apiCollaborator(@PathVariable("id") String docId,
                                                             @Valid @RequestBody AddCollaboratorRequest request) {
        try {
            return ResponseEntity.ok(service.addCollaborator(docId, request.email(), request.role()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/docs")
    @ResponseBody
    public ResponseEntity<?> apiList() {
        return ResponseEntity.ok(service.listDocuments());
    }

    @GetMapping("/api/docs/{id}")
    @ResponseBody
    public ResponseEntity<DocumentEntry> apiGet(@PathVariable("id") String docId) {
        try {
            return ResponseEntity.ok(service.getDocument(docId));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/docs/{id}/versions")
    @ResponseBody
    public ResponseEntity<?> apiVersions(@PathVariable("id") String docId) {
        try {
            return ResponseEntity.ok(service.listVersions(docId));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/docs/{id}/comments")
    @ResponseBody
    public ResponseEntity<?> apiComments(@PathVariable("id") String docId) {
        try {
            return ResponseEntity.ok(service.listComments(docId));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/docs/{id}/collaborators")
    @ResponseBody
    public ResponseEntity<?> apiCollaborators(@PathVariable("id") String docId) {
        try {
            return ResponseEntity.ok(service.listCollaborators(docId));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }
}
