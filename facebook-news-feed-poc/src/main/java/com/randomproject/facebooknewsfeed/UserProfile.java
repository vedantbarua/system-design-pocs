package com.randomproject.facebooknewsfeed;

import java.time.Instant;

public record UserProfile(long id, String name, Instant createdAt) {
}
