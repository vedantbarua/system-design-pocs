package com.randomproject.tinder;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class ProfileForm {
    @NotBlank(message = "Name is required")
    @Size(max = 60, message = "Name must be 60 characters or less")
    private String name;

    @NotNull(message = "Age is required")
    @Min(value = 18, message = "Age must be at least 18")
    @Max(value = 99, message = "Age must be 99 or less")
    private Integer age;

    @NotBlank(message = "City is required")
    @Size(max = 60, message = "City must be 60 characters or less")
    private String city;

    @NotBlank(message = "Occupation is required")
    @Size(max = 80, message = "Occupation must be 80 characters or less")
    private String occupation;

    @Size(max = 240, message = "Bio must be 240 characters or less")
    private String bio;

    @NotBlank(message = "Prompt is required")
    @Size(max = 80, message = "Prompt must be 80 characters or less")
    private String prompt;

    @NotBlank(message = "Prompt answer is required")
    @Size(max = 160, message = "Prompt answer must be 160 characters or less")
    private String promptAnswer;

    @Size(max = 200, message = "Interests must be 200 characters or less")
    private String interests;

    @NotNull(message = "Distance is required")
    @Min(value = 1, message = "Distance must be at least 1 km")
    @Max(value = 200, message = "Distance must be 200 km or less")
    private Integer distanceKm;

    @NotNull(message = "Last active time is required")
    @Min(value = 0, message = "Last active minutes must be 0 or more")
    @Max(value = 1440, message = "Last active minutes must be 1440 or less")
    private Integer lastActiveMinutes;

    @NotNull(message = "Compatibility is required")
    @Min(value = 40, message = "Compatibility must be 40% or more")
    @Max(value = 99, message = "Compatibility must be 99% or less")
    private Integer compatibilityPercent;

    @NotNull(message = "Profile vibe is required")
    private ProfileVibe vibe;

    private boolean verified;

    private boolean likesYou;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Integer getAge() {
        return age;
    }

    public void setAge(Integer age) {
        this.age = age;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getOccupation() {
        return occupation;
    }

    public void setOccupation(String occupation) {
        this.occupation = occupation;
    }

    public String getBio() {
        return bio;
    }

    public void setBio(String bio) {
        this.bio = bio;
    }

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }

    public String getPromptAnswer() {
        return promptAnswer;
    }

    public void setPromptAnswer(String promptAnswer) {
        this.promptAnswer = promptAnswer;
    }

    public String getInterests() {
        return interests;
    }

    public void setInterests(String interests) {
        this.interests = interests;
    }

    public Integer getDistanceKm() {
        return distanceKm;
    }

    public void setDistanceKm(Integer distanceKm) {
        this.distanceKm = distanceKm;
    }

    public Integer getLastActiveMinutes() {
        return lastActiveMinutes;
    }

    public void setLastActiveMinutes(Integer lastActiveMinutes) {
        this.lastActiveMinutes = lastActiveMinutes;
    }

    public Integer getCompatibilityPercent() {
        return compatibilityPercent;
    }

    public void setCompatibilityPercent(Integer compatibilityPercent) {
        this.compatibilityPercent = compatibilityPercent;
    }

    public ProfileVibe getVibe() {
        return vibe;
    }

    public void setVibe(ProfileVibe vibe) {
        this.vibe = vibe;
    }

    public boolean isVerified() {
        return verified;
    }

    public void setVerified(boolean verified) {
        this.verified = verified;
    }

    public boolean isLikesYou() {
        return likesYou;
    }

    public void setLikesYou(boolean likesYou) {
        this.likesYou = likesYou;
    }
}
