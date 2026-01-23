package com.randomproject.tinder;

import java.util.List;

public class Profile {
    private final long id;
    private final String name;
    private final int age;
    private final String city;
    private final String occupation;
    private final String bio;
    private final String prompt;
    private final String promptAnswer;
    private final List<String> interests;
    private final int distanceKm;
    private final int lastActiveMinutes;
    private final int compatibilityPercent;
    private final boolean verified;
    private final boolean likesYou;
    private final ProfileVibe vibe;

    public Profile(long id,
                   String name,
                   int age,
                   String city,
                   String occupation,
                   String bio,
                   String prompt,
                   String promptAnswer,
                   List<String> interests,
                   int distanceKm,
                   int lastActiveMinutes,
                   int compatibilityPercent,
                   boolean verified,
                   boolean likesYou,
                   ProfileVibe vibe) {
        this.id = id;
        this.name = name;
        this.age = age;
        this.city = city;
        this.occupation = occupation;
        this.bio = bio;
        this.prompt = prompt;
        this.promptAnswer = promptAnswer;
        this.interests = interests;
        this.distanceKm = distanceKm;
        this.lastActiveMinutes = lastActiveMinutes;
        this.compatibilityPercent = compatibilityPercent;
        this.verified = verified;
        this.likesYou = likesYou;
        this.vibe = vibe;
    }

    public long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public int getAge() {
        return age;
    }

    public String getCity() {
        return city;
    }

    public String getOccupation() {
        return occupation;
    }

    public String getBio() {
        return bio;
    }

    public String getPrompt() {
        return prompt;
    }

    public String getPromptAnswer() {
        return promptAnswer;
    }

    public List<String> getInterests() {
        return interests;
    }

    public int getDistanceKm() {
        return distanceKm;
    }

    public int getLastActiveMinutes() {
        return lastActiveMinutes;
    }

    public int getCompatibilityPercent() {
        return compatibilityPercent;
    }

    public boolean isVerified() {
        return verified;
    }

    public boolean isLikesYou() {
        return likesYou;
    }

    public ProfileVibe getVibe() {
        return vibe;
    }

    public String getInitials() {
        String[] parts = name.split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (!part.isBlank()) {
                sb.append(Character.toUpperCase(part.charAt(0)));
            }
            if (sb.length() == 2) {
                break;
            }
        }
        return sb.length() == 0 ? "?" : sb.toString();
    }

    public String getDistanceLabel() {
        if (distanceKm <= 1) {
            return "Less than 1 km away";
        }
        return distanceKm + " km away";
    }

    public String getLastActiveLabel() {
        if (lastActiveMinutes <= 5) {
            return "Active now";
        }
        if (lastActiveMinutes < 60) {
            return "Active " + lastActiveMinutes + "m ago";
        }
        int hours = Math.max(1, lastActiveMinutes / 60);
        return "Active " + hours + "h ago";
    }
}
