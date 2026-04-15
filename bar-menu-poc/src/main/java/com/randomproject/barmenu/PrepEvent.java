package com.randomproject.barmenu;

import java.time.Instant;

public record PrepEvent(Instant at, String sessionId, String drinkId, String message) {
}
