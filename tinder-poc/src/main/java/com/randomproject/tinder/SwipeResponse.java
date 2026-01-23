package com.randomproject.tinder;

public record SwipeResponse(long profileId,
                            SwipeDecision decision,
                            boolean matched,
                            int matchCount,
                            String message) {
}
