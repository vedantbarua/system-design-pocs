package com.randomproject.flashconf;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/sdk")
@CrossOrigin(origins = "http://localhost:3000")
public class SdkController {
    private final FlashConfService service;

    public SdkController(FlashConfService service) {
        this.service = service;
    }

    @GetMapping(value = "/ruleset", produces = MediaType.APPLICATION_JSON_VALUE)
    public RulesetResponse ruleset(@RequestParam Map<String, String> params) {
        Map<String, String> attributes = new HashMap<>(params);
        String clientId = attributes.remove("clientId");
        return service.ruleset(clientId, attributes);
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam Map<String, String> params) {
        Map<String, String> attributes = new HashMap<>(params);
        String clientId = attributes.remove("clientId");
        SseEmitter emitter = service.getSseHub().register(clientId, attributes);
        RulesetResponse initial = service.ruleset(clientId, attributes);
        try {
            emitter.send(SseEmitter.event()
                    .name("ruleset")
                    .data(initial, MediaType.APPLICATION_JSON));
        } catch (Exception ignored) {
        }
        return emitter;
    }
}
