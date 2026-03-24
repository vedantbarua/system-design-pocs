package com.randomproject.objectstorage;

import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
public class ObjectStorageController {
    private final ObjectStorageService service;

    public ObjectStorageController(ObjectStorageService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        List<BucketEntry> buckets = service.listBuckets();
        List<ObjectSummary> objects = service.listObjects();
        List<MultipartUploadView> uploads = service.listMultipartUploads();
        List<PresignedTokenView> tokens = service.listPresignedTokens();
        model.addAttribute("message", message);
        model.addAttribute("defaults", service.defaults());
        model.addAttribute("buckets", buckets);
        model.addAttribute("objects", objects);
        model.addAttribute("uploads", uploads);
        model.addAttribute("tokens", tokens);
        model.addAttribute("bucketCount", buckets.size());
        model.addAttribute("objectCount", objects.size());
        model.addAttribute("uploadCount", uploads.size());
        model.addAttribute("tokenCount", tokens.size());
        model.addAttribute("service", service);
        return "index";
    }

    @PostMapping("/buckets")
    public String createBucket(@RequestParam("name") String name,
                               @RequestParam(value = "versioningEnabled", defaultValue = "false") boolean versioningEnabled,
                               RedirectAttributes redirectAttributes) {
        try {
            BucketEntry bucket = service.createBucket(name, versioningEnabled);
            redirectAttributes.addAttribute("message", "Created bucket: " + bucket.name());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/objects")
    public String putObject(@RequestParam("bucketId") String bucketId,
                            @RequestParam("objectKey") String objectKey,
                            @RequestParam("content") String content,
                            @RequestParam(value = "storageClass", required = false) String storageClass,
                            RedirectAttributes redirectAttributes) {
        try {
            ObjectVersion version = service.putObject(bucketId, objectKey, content, storageClass);
            redirectAttributes.addAttribute("message", "Stored object version: " + version.versionId());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/multipart/uploads")
    public String startMultipart(@RequestParam("bucketId") String bucketId,
                                 @RequestParam("objectKey") String objectKey,
                                 @RequestParam(value = "storageClass", required = false) String storageClass,
                                 RedirectAttributes redirectAttributes) {
        try {
            MultipartUploadView upload = service.startMultipartUpload(bucketId, objectKey, storageClass);
            redirectAttributes.addAttribute("message", "Started multipart upload: " + upload.uploadId());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/multipart/uploads/{uploadId}/parts")
    public String uploadPart(@PathVariable String uploadId,
                             @RequestParam("partNumber") Integer partNumber,
                             @RequestParam("content") String content,
                             RedirectAttributes redirectAttributes) {
        try {
            MultipartUploadView upload = service.uploadPart(uploadId, partNumber, content);
            redirectAttributes.addAttribute("message", "Uploaded part " + partNumber + " to " + upload.uploadId());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/multipart/uploads/{uploadId}/complete")
    public String completeMultipart(@PathVariable String uploadId, RedirectAttributes redirectAttributes) {
        try {
            ObjectVersion version = service.completeMultipartUpload(uploadId);
            redirectAttributes.addAttribute("message", "Completed multipart upload into version " + version.versionId());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/presigned")
    public String createToken(@RequestParam("bucketId") String bucketId,
                              @RequestParam("objectKey") String objectKey,
                              @RequestParam(value = "versionId", required = false) String versionId,
                              @RequestParam("operation") String operation,
                              @RequestParam(value = "ttlMinutes", required = false) Integer ttlMinutes,
                              @RequestParam(value = "storageClass", required = false) String storageClass,
                              RedirectAttributes redirectAttributes) {
        try {
            PresignedTokenView token = service.createPresignedToken(
                    bucketId,
                    objectKey,
                    versionId,
                    operation,
                    ttlMinutes,
                    storageClass);
            redirectAttributes.addAttribute("message", "Created token: " + token.token());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/presigned/{token}/upload")
    public String uploadByToken(@PathVariable String token,
                                @RequestParam("content") String content,
                                RedirectAttributes redirectAttributes) {
        try {
            ObjectVersion version = service.uploadWithToken(token, content);
            redirectAttributes.addAttribute("message", "Uploaded with token into version " + version.versionId());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @GetMapping("/downloads/{token}")
    public ResponseEntity<String> download(@PathVariable String token) {
        try {
            ObjectDownload download = service.downloadWithToken(token);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + safeFilename(download.objectKey()) + "\"")
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(download.content());
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest()
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(ex.getMessage());
        }
    }

    @PostMapping("/api/buckets")
    @ResponseBody
    public ResponseEntity<BucketEntry> apiCreateBucket(@Valid @RequestBody BucketCreateRequest request) {
        try {
            return ResponseEntity.status(201).body(service.createBucket(request.name(), request.versioningEnabled()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/buckets")
    @ResponseBody
    public List<BucketEntry> apiBuckets() {
        return service.listBuckets();
    }

    @PostMapping("/api/objects")
    @ResponseBody
    public ResponseEntity<ObjectVersion> apiPutObject(@Valid @RequestBody ObjectPutRequest request) {
        try {
            return ResponseEntity.status(201).body(
                    service.putObject(request.bucketId(), request.objectKey(), request.content(), request.storageClass()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/objects")
    @ResponseBody
    public List<ObjectSummary> apiObjects() {
        return service.listObjects();
    }

    @GetMapping("/api/object-versions")
    @ResponseBody
    public ResponseEntity<List<ObjectVersion>> apiVersions(@RequestParam String bucketId, @RequestParam String objectKey) {
        try {
            return ResponseEntity.ok(service.listVersions(bucketId, objectKey));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/multipart/uploads")
    @ResponseBody
    public ResponseEntity<MultipartUploadView> apiStartMultipart(@Valid @RequestBody MultipartStartRequest request) {
        try {
            return ResponseEntity.status(201).body(
                    service.startMultipartUpload(request.bucketId(), request.objectKey(), request.storageClass()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/multipart/uploads")
    @ResponseBody
    public List<MultipartUploadView> apiUploads() {
        return service.listMultipartUploads();
    }

    @PostMapping("/api/multipart/uploads/{uploadId}/parts")
    @ResponseBody
    public ResponseEntity<MultipartUploadView> apiUploadPart(@PathVariable String uploadId,
                                                             @Valid @RequestBody MultipartPartRequest request) {
        try {
            return ResponseEntity.ok(service.uploadPart(uploadId, request.partNumber(), request.content()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/multipart/uploads/{uploadId}/complete")
    @ResponseBody
    public ResponseEntity<ObjectVersion> apiCompleteMultipart(@PathVariable String uploadId) {
        try {
            return ResponseEntity.ok(service.completeMultipartUpload(uploadId));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/presigned")
    @ResponseBody
    public ResponseEntity<PresignedTokenView> apiCreateToken(@Valid @RequestBody PresignedTokenRequest request) {
        try {
            return ResponseEntity.status(201).body(service.createPresignedToken(
                    request.bucketId(),
                    request.objectKey(),
                    request.versionId(),
                    request.operation(),
                    request.ttlMinutes(),
                    request.storageClass()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/presigned")
    @ResponseBody
    public List<PresignedTokenView> apiTokens() {
        return service.listPresignedTokens();
    }

    @PostMapping("/api/presigned/{token}/upload")
    @ResponseBody
    public ResponseEntity<ObjectVersion> apiUploadWithToken(@PathVariable String token,
                                                            @Valid @RequestBody PresignedUploadRequest request) {
        try {
            return ResponseEntity.status(201).body(service.uploadWithToken(token, request.content()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/downloads/{token}")
    @ResponseBody
    public ResponseEntity<ObjectDownload> apiDownload(@PathVariable String token) {
        try {
            return ResponseEntity.ok(service.downloadWithToken(token));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    private String safeFilename(String objectKey) {
        return objectKey.replace("/", "-");
    }
}
