package com.randomproject.newsfeed;

import jakarta.validation.constraints.NotNull;

public class FollowUserRequest {
    @NotNull
    private Long followerId;

    @NotNull
    private Long followeeId;

    public Long getFollowerId() {
        return followerId;
    }

    public void setFollowerId(Long followerId) {
        this.followerId = followerId;
    }

    public Long getFolloweeId() {
        return followeeId;
    }

    public void setFolloweeId(Long followeeId) {
        this.followeeId = followeeId;
    }
}
