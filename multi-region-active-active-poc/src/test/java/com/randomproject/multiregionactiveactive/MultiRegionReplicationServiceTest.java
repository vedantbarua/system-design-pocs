package com.randomproject.multiregionactiveactive;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MultiRegionReplicationServiceTest {

    @Test
    void shouldReplicateLocalWriteToEveryReachableRegion() {
        MultiRegionReplicationService service = service();

        service.mutateCart(new CartMutationRequest("us-east", "cart-42", "sku-keyboard", 1, ConflictStrategy.VECTOR_CLOCK));
        DrainResult drain = service.drainReplication(new DrainReplicationRequest(null, 10, ConflictStrategy.VECTOR_CLOCK));

        SystemSnapshot snapshot = drain.snapshot();
        assertEquals(2, drain.appliedEvents());
        assertEquals(0, snapshot.pendingReplication());
        assertEquals(1, quantity(snapshot, "us-east", "cart-42", "sku-keyboard"));
        assertEquals(1, quantity(snapshot, "us-west", "cart-42", "sku-keyboard"));
        assertEquals(1, quantity(snapshot, "eu-central", "cart-42", "sku-keyboard"));
    }

    @Test
    void shouldDetectConcurrentWritesWithVectorClocks() {
        MultiRegionReplicationService service = service();

        service.mutateCart(new CartMutationRequest("us-east", "cart-42", "sku-keyboard", 1, ConflictStrategy.VECTOR_CLOCK));
        service.mutateCart(new CartMutationRequest("us-west", "cart-42", "sku-mouse", 1, ConflictStrategy.VECTOR_CLOCK));
        DrainResult drain = service.drainReplication(new DrainReplicationRequest(null, 10, ConflictStrategy.VECTOR_CLOCK));

        assertEquals(1, drain.appliedEvents());
        assertEquals(3, drain.snapshot().unresolvedConflicts());
        assertTrue(drain.snapshot().conflicts().stream().anyMatch(conflict -> conflict.regionId().equals("us-east")));
        assertTrue(drain.snapshot().conflicts().stream().anyMatch(conflict -> conflict.regionId().equals("us-west")));
    }

    @Test
    void shouldMergeConcurrentCartItemsWhenUsingCartMerge() {
        MultiRegionReplicationService service = service();

        service.mutateCart(new CartMutationRequest("us-east", "cart-42", "sku-keyboard", 1, ConflictStrategy.CART_MERGE));
        service.mutateCart(new CartMutationRequest("us-west", "cart-42", "sku-mouse", 2, ConflictStrategy.CART_MERGE));
        DrainResult drain = service.drainReplication(new DrainReplicationRequest(null, 10, ConflictStrategy.CART_MERGE));

        SystemSnapshot snapshot = drain.snapshot();
        assertEquals(0, snapshot.unresolvedConflicts());
        for (String regionId : List.of("us-east", "us-west", "eu-central")) {
            assertEquals(1, quantity(snapshot, regionId, "cart-42", "sku-keyboard"));
            assertEquals(2, quantity(snapshot, regionId, "cart-42", "sku-mouse"));
        }
    }

    @Test
    void shouldHoldReplicationForDownRegionUntilRecovery() {
        MultiRegionReplicationService service = service();

        service.setRegionActive(new RegionModeRequest("us-west", false));
        service.mutateCart(new CartMutationRequest("us-east", "cart-42", "sku-keyboard", 1, ConflictStrategy.VECTOR_CLOCK));
        DrainResult firstDrain = service.drainReplication(new DrainReplicationRequest("us-west", 10, ConflictStrategy.VECTOR_CLOCK));

        assertEquals(0, firstDrain.appliedEvents());
        assertEquals(1, firstDrain.skippedEvents());
        assertEquals(2, firstDrain.snapshot().pendingReplication());

        service.setRegionActive(new RegionModeRequest("us-west", true));
        DrainResult secondDrain = service.drainReplication(new DrainReplicationRequest("us-west", 10, ConflictStrategy.VECTOR_CLOCK));

        assertEquals(1, secondDrain.appliedEvents());
        assertEquals(1, quantity(secondDrain.snapshot(), "us-west", "cart-42", "sku-keyboard"));
    }

    @Test
    void shouldDropQueuedReplicationEventsByCart() {
        MultiRegionReplicationService service = service();

        service.mutateCart(new CartMutationRequest("us-east", "cart-42", "sku-keyboard", 1, ConflictStrategy.VECTOR_CLOCK));
        CommandResult result = service.dropReplication(new DropReplicationRequest(null, null, "cart-42"));

        assertEquals(0, result.snapshot().pendingReplication());
    }

    private MultiRegionReplicationService service() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        return new MultiRegionReplicationService(List.of("us-east", "us-west", "eu-central"), 16, clock::incrementAndGet);
    }

    private int quantity(SystemSnapshot snapshot, String regionId, String cartId, String sku) {
        return snapshot.regions().stream()
                .filter(region -> region.regionId().equals(regionId))
                .findFirst()
                .flatMap(region -> region.carts().stream()
                        .filter(cart -> cart.cartId().equals(cartId))
                        .findFirst())
                .flatMap(cart -> cart.items().stream()
                        .filter(item -> item.sku().equals(sku))
                        .findFirst())
                .map(CartItemView::quantity)
                .orElse(0);
    }
}
