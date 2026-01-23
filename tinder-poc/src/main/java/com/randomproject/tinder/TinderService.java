package com.randomproject.tinder;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class TinderService {
    private final Map<Long, Profile> profiles = new LinkedHashMap<>();
    private final Set<Long> likedProfiles = ConcurrentHashMap.newKeySet();
    private final Set<Long> superLikedProfiles = ConcurrentHashMap.newKeySet();
    private final Set<Long> dislikedProfiles = ConcurrentHashMap.newKeySet();
    private final List<Match> matches = new ArrayList<>();
    private final AtomicLong profileIdSequence = new AtomicLong(100);
    private final AtomicLong matchIdSequence = new AtomicLong(5000);

    public TinderService() {
        seedProfiles();
    }

    public List<Profile> listProfiles() {
        return new ArrayList<>(profiles.values());
    }

    public List<Profile> listQueue() {
        return profiles.values().stream()
                .filter(profile -> !hasSwiped(profile.getId()))
                .toList();
    }

    public Profile nextCandidate() {
        return profiles.values().stream()
                .filter(profile -> !hasSwiped(profile.getId()))
                .findFirst()
                .orElse(null);
    }

    public Profile getProfile(long id) {
        return profiles.get(id);
    }

    public TinderSummary getSummary() {
        int total = profiles.size();
        int remaining = total - (likedProfiles.size() + superLikedProfiles.size() + dislikedProfiles.size());
        return new TinderSummary(
                total,
                Math.max(0, remaining),
                likedProfiles.size(),
                dislikedProfiles.size(),
                superLikedProfiles.size(),
                matches.size());
    }

    public List<Match> listMatches() {
        return matches.stream()
                .sorted((left, right) -> right.getMatchedAt().compareTo(left.getMatchedAt()))
                .toList();
    }

    public SwipeResult swipe(long profileId, SwipeDecision decision) {
        Profile profile = profiles.get(profileId);
        if (profile == null) {
            return null;
        }
        if (hasSwiped(profileId)) {
            boolean alreadyMatched = matches.stream().anyMatch(match -> match.getProfile().getId() == profileId);
            return new SwipeResult(profile, decision, alreadyMatched, "Already swiped on " + profile.getName() + ".");
        }

        switch (decision) {
            case LIKE -> likedProfiles.add(profileId);
            case DISLIKE -> dislikedProfiles.add(profileId);
            case SUPERLIKE -> superLikedProfiles.add(profileId);
        }

        boolean matched = false;
        String message = decision.getLabel() + " sent.";
        if (decision != SwipeDecision.DISLIKE && profile.isLikesYou()) {
            matched = true;
            Match match = new Match(
                    matchIdSequence.incrementAndGet(),
                    profile,
                    LocalDateTime.now(),
                    buildMatchMessage(profile, decision));
            matches.add(match);
            message = "It\'s a match with " + profile.getName() + "!";
        }

        return new SwipeResult(profile, decision, matched, message);
    }

    public Profile createProfile(ProfileForm form) {
        long id = profileIdSequence.incrementAndGet();
        Profile profile = new Profile(
                id,
                form.getName().trim(),
                form.getAge(),
                form.getCity().trim(),
                form.getOccupation().trim(),
                blankToNull(form.getBio()),
                form.getPrompt().trim(),
                form.getPromptAnswer().trim(),
                splitInterests(form.getInterests()),
                form.getDistanceKm(),
                form.getLastActiveMinutes(),
                form.getCompatibilityPercent(),
                form.isVerified(),
                form.isLikesYou(),
                form.getVibe());
        profiles.put(profile.getId(), profile);
        return profile;
    }

    public void reset() {
        likedProfiles.clear();
        dislikedProfiles.clear();
        superLikedProfiles.clear();
        matches.clear();
    }

    private boolean hasSwiped(long profileId) {
        return likedProfiles.contains(profileId)
                || dislikedProfiles.contains(profileId)
                || superLikedProfiles.contains(profileId);
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private List<String> splitInterests(String interests) {
        if (interests == null || interests.isBlank()) {
            return List.of();
        }
        return Arrays.stream(interests.split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .collect(Collectors.toList());
    }

    private String buildMatchMessage(Profile profile, SwipeDecision decision) {
        String prefix = decision == SwipeDecision.SUPERLIKE ? "Super like! " : "";
        return prefix + "" + profile.getName() + ": " + profile.getPromptAnswer();
    }

    private void seedProfiles() {
        addSeedProfile("Avery Patel", 27, "San Francisco", "Product designer",
                "Museum Saturdays, ramen hunts, and sunrise hikes.",
                "Two truths and a lie", "I can juggle, I hate sushi, I speak three languages.",
                List.of("Design", "Hiking", "Matcha"),
                3, 4, 92, true, true, ProfileVibe.GOLDEN_HOUR);

        addSeedProfile("Jordan Lee", 29, "Oakland", "Data scientist",
                "Looking for someone to build playlists and debate sci-fi endings.",
                "Perfect first date", "Street tacos then a moonlit walk.",
                List.of("AI", "Vinyl", "Cycling"),
                8, 16, 88, true, false, ProfileVibe.MIDNIGHT);

        addSeedProfile("Riley Chen", 26, "Berkeley", "Chef",
                "I make seasonal dumplings and ambitious desserts.",
                "Most spontaneous thing", "Booked a flight to Oaxaca 24 hours out.",
                List.of("Cooking", "Travel", "Film"),
                5, 2, 94, false, true, ProfileVibe.BLOOM);

        addSeedProfile("Samira Khan", 31, "San Jose", "Startup founder",
                "Obsessed with micro-mobility, bookstores, and sunrise coffee.",
                "Green flags", "Curiosity, kindness, and a good laugh.",
                List.of("Running", "Startups", "Coffee"),
                22, 45, 83, true, false, ProfileVibe.URBAN);

        addSeedProfile("Noah Brooks", 28, "San Mateo", "Architect",
                "Sketching city corners, chasing waves on weekends.",
                "Ideal weekend", "Beach morning + cozy board game night.",
                List.of("Surfing", "Architecture", "Board games"),
                15, 35, 90, false, true, ProfileVibe.COASTAL);

        addSeedProfile("Maya Singh", 25, "Daly City", "Nurse",
                "Night shifter who still finds time for slow cafes.",
                "I geek out on", "House plants and coffee art.",
                List.of("Wellness", "Plants", "Coffee"),
                10, 8, 86, true, true, ProfileVibe.LAVENDER);
    }

    private void addSeedProfile(String name,
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
        long id = profileIdSequence.incrementAndGet();
        Profile profile = new Profile(
                id,
                name,
                age,
                city,
                occupation,
                bio,
                prompt,
                promptAnswer,
                interests,
                distanceKm,
                lastActiveMinutes,
                compatibilityPercent,
                verified,
                likesYou,
                vibe);
        profiles.put(id, profile);
    }
}
