package com.randomproject.flashconf;

import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class SseHub {
    private final Map<String, ClientRegistration> clients = new ConcurrentHashMap<>();

    public SseEmitter register(String clientId, Map<String, String> attributes) {
        SseEmitter emitter = new SseEmitter(0L);
        String id = clientId == null ? "client-" + System.nanoTime() : clientId;
        ClientRegistration registration = new ClientRegistration(id, attributes, emitter);
        clients.put(id, registration);

        emitter.onCompletion(() -> clients.remove(id));
        emitter.onTimeout(() -> clients.remove(id));
        emitter.onError((ex) -> clients.remove(id));

        return emitter;
    }

    public void broadcastRulesets(RulesetService service) {
        for (ClientRegistration registration : clients.values()) {
            try {
                RulesetResponse response = service.getRuleset(registration.clientId(), registration.attributes());
                registration.emitter().send(SseEmitter.event()
                        .name("ruleset")
                        .data(response, MediaType.APPLICATION_JSON));
            } catch (IOException ex) {
                registration.emitter().completeWithError(ex);
            }
        }
    }

    private record ClientRegistration(String clientId, Map<String, String> attributes, SseEmitter emitter) {
    }
}
