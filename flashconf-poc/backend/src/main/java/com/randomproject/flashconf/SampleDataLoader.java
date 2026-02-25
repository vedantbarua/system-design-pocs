package com.randomproject.flashconf;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class SampleDataLoader implements CommandLineRunner {
    private final FlashConfService service;

    public SampleDataLoader(FlashConfService service) {
        this.service = service;
    }

    @Override
    public void run(String... args) {
        if (!service.listFlags().isEmpty()) {
            return;
        }

        TargetRule betaRule = new TargetRule(
                "beta-users",
                true,
                List.of(new Condition("segment", Operator.IN, List.of("beta"))),
                null,
                null
        );

        TargetRule gradualRollout = new TargetRule(
                "rollout-30",
                true,
                List.of(new Condition("country", Operator.IN, List.of("US", "CA"))),
                30,
                "userId"
        );

        FlagUpsertRequest newSidebar = new FlagUpsertRequest();
        newSidebar.setKey("new-sidebar");
        newSidebar.setDescription("Experimental sidebar UI");
        newSidebar.setEnabled(false);
        newSidebar.setRules(List.of(betaRule));
        newSidebar.setActor("bootstrap");
        service.upsertFlag(newSidebar);

        FlagUpsertRequest checkoutFlow = new FlagUpsertRequest();
        checkoutFlow.setKey("new-checkout-flow");
        checkoutFlow.setDescription("Checkout redesign with staged rollout");
        checkoutFlow.setEnabled(false);
        checkoutFlow.setRules(List.of(gradualRollout));
        checkoutFlow.setActor("bootstrap");
        service.upsertFlag(checkoutFlow);

        FlagUpsertRequest payButton = new FlagUpsertRequest();
        payButton.setKey("pay-button");
        payButton.setDescription("Critical pay button");
        payButton.setEnabled(true);
        payButton.setRules(List.of());
        payButton.setActor("bootstrap");
        service.upsertFlag(payButton);
    }
}
