package com.randomproject.barmenu;

import java.time.Instant;

public class PrepSession {
    private final String id;
    private final Drink drink;
    private final Instant startedAt;
    private Instant updatedAt;
    private int currentStepIndex;
    private PrepStatus status;

    public PrepSession(String id, Drink drink) {
        this.id = id;
        this.drink = drink;
        this.startedAt = Instant.now();
        this.updatedAt = startedAt;
        this.currentStepIndex = 0;
        this.status = PrepStatus.ACTIVE;
    }

    public String getId() {
        return id;
    }

    public Drink getDrink() {
        return drink;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public int getCurrentStepIndex() {
        return currentStepIndex;
    }

    public PrepStatus getStatus() {
        return status;
    }

    public RecipeStep getCurrentStep() {
        if (status == PrepStatus.COMPLETE) {
            return drink.steps().get(drink.steps().size() - 1);
        }
        return drink.steps().get(currentStepIndex);
    }

    public int getCompletedSteps() {
        return status == PrepStatus.COMPLETE ? drink.steps().size() : currentStepIndex;
    }

    public int getTotalSteps() {
        return drink.steps().size();
    }

    public int getProgressPercent() {
        return Math.round((getCompletedSteps() * 100.0f) / getTotalSteps());
    }

    public boolean canGoBack() {
        return currentStepIndex > 0 || status == PrepStatus.COMPLETE;
    }

    public boolean canAdvance() {
        return status == PrepStatus.ACTIVE;
    }

    public void advance() {
        if (status == PrepStatus.COMPLETE) {
            return;
        }
        if (currentStepIndex >= drink.steps().size() - 1) {
            status = PrepStatus.COMPLETE;
        } else {
            currentStepIndex += 1;
        }
        updatedAt = Instant.now();
    }

    public void back() {
        if (status == PrepStatus.COMPLETE) {
            status = PrepStatus.ACTIVE;
            currentStepIndex = drink.steps().size() - 1;
        } else if (currentStepIndex > 0) {
            currentStepIndex -= 1;
        }
        updatedAt = Instant.now();
    }

    public void reset() {
        currentStepIndex = 0;
        status = PrepStatus.ACTIVE;
        updatedAt = Instant.now();
    }
}
