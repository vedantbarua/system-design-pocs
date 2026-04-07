package com.randomproject.servicediscovery;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ServiceDiscoveryServiceTest {

    @Test
    void shouldPreferHealthyInstanceInClientZone() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        ServiceDiscoveryService service = new ServiceDiscoveryService(clock::get, 15_000L, 10_000L);
        service.register(new RegisterInstanceRequest("checkout", "checkout-a", "us-east-1a", "v1", 100, false, null));
        service.register(new RegisterInstanceRequest("checkout", "checkout-b", "us-west-2a", "v1", 100, false, null));

        RoutingDecision routed = service.route(new RoutingRequest("checkout", "us-east-1a", null, true));

        assertEquals("checkout-a", routed.instance().instanceId());
        assertEquals("us-east-1a", routed.matchedZone());
    }

    @Test
    void shouldKeepStickySessionOnSameInstance() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        ServiceDiscoveryService service = new ServiceDiscoveryService(clock::get, 15_000L, 10_000L);
        service.register(new RegisterInstanceRequest("search", "search-a", "us-east-1a", "v1", 100, false, null));
        service.register(new RegisterInstanceRequest("search", "search-b", "us-east-1a", "v1", 80, false, null));

        RoutingDecision first = service.route(new RoutingRequest("search", "us-east-1a", "user-42", true));
        RoutingDecision second = service.route(new RoutingRequest("search", "us-east-1a", "user-42", true));

        assertEquals(first.instance().instanceId(), second.instance().instanceId());
        assertEquals("affinity-rendezvous", first.strategy());
    }

    @Test
    void shouldExcludeDrainingAndExpiredInstancesFromRouting() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        ServiceDiscoveryService service = new ServiceDiscoveryService(clock::get, 5_000L, 10_000L);
        service.register(new RegisterInstanceRequest("billing", "billing-a", "us-east-1a", "v1", 100, false, null));
        service.register(new RegisterInstanceRequest("billing", "billing-b", "us-east-1a", "v1", 100, false, null));
        service.updateStatus("billing-a", new StatusUpdateRequest(InstanceLifecycle.DRAINING));

        clock.addAndGet(4_000L);
        service.heartbeat("billing-b");
        clock.addAndGet(1_500L);
        RoutingDecision routed = service.route(new RoutingRequest("billing", "us-east-1a", null, true));

        assertEquals("billing-b", routed.instance().instanceId());
        assertEquals("EXPIRED", service.snapshot().services().get(0).instances().stream()
                .filter(instance -> instance.instanceId().equals("billing-a"))
                .findFirst()
                .orElseThrow()
                .effectiveState());
        assertEquals("ROUTABLE", service.snapshot().services().get(0).instances().stream()
                .filter(instance -> instance.instanceId().equals("billing-b"))
                .findFirst()
                .orElseThrow()
                .effectiveState());
    }

    @Test
    void shouldTemporarilyEjectInstanceAfterRepeatedFailures() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        ServiceDiscoveryService service = new ServiceDiscoveryService(clock::get, 15_000L, 10_000L);
        service.register(new RegisterInstanceRequest("feed", "feed-a", "us-east-1a", "v1", 100, false, null));
        service.register(new RegisterInstanceRequest("feed", "feed-b", "us-east-1a", "v1", 100, false, null));

        service.recordResult("feed-a", new InstanceResultRequest(false));
        InstanceActionResult result = service.recordResult("feed-a", new InstanceResultRequest(false));
        RoutingDecision routed = service.route(new RoutingRequest("feed", "us-east-1a", null, true));

        assertEquals("EJECTED", result.effectiveState());
        assertEquals("feed-b", routed.instance().instanceId());

        clock.addAndGet(10_001L);
        service.heartbeat("feed-a");
        service.recordResult("feed-a", new InstanceResultRequest(true));
        RoutingDecision afterRecovery = service.route(new RoutingRequest("feed", "us-east-1a", "sticky", true));
        assertTrue(afterRecovery.instance().instanceId().equals("feed-a") || afterRecovery.instance().instanceId().equals("feed-b"));
    }

    @Test
    void shouldRejectRoutingWhenOnlyCanaryExistsAndCanaryIsDisabled() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        ServiceDiscoveryService service = new ServiceDiscoveryService(clock::get, 15_000L, 10_000L);
        service.register(new RegisterInstanceRequest("checkout", "checkout-canary", "us-east-1a", "v2", 20, true, null));

        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> service.route(new RoutingRequest("checkout", "us-east-1a", null, false)));

        assertTrue(error.getMessage().contains("no routable instances"));
    }
}
