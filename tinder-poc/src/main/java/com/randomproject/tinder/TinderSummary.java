package com.randomproject.tinder;

public class TinderSummary {
    private final int totalProfiles;
    private final int remainingProfiles;
    private final int likes;
    private final int dislikes;
    private final int superLikes;
    private final int matches;

    public TinderSummary(int totalProfiles,
                         int remainingProfiles,
                         int likes,
                         int dislikes,
                         int superLikes,
                         int matches) {
        this.totalProfiles = totalProfiles;
        this.remainingProfiles = remainingProfiles;
        this.likes = likes;
        this.dislikes = dislikes;
        this.superLikes = superLikes;
        this.matches = matches;
    }

    public int getTotalProfiles() {
        return totalProfiles;
    }

    public int getRemainingProfiles() {
        return remainingProfiles;
    }

    public int getLikes() {
        return likes;
    }

    public int getDislikes() {
        return dislikes;
    }

    public int getSuperLikes() {
        return superLikes;
    }

    public int getMatches() {
        return matches;
    }
}
