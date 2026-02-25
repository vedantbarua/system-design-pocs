package com.randomproject.flashconf;

import java.time.Instant;

public class ChangeLogEntry {
    private Instant timestamp;
    private String actor;
    private String action;
    private String flagKey;
    private String beforeState;
    private String afterState;

    public ChangeLogEntry() {
    }

    public ChangeLogEntry(Instant timestamp, String actor, String action, String flagKey, String beforeState, String afterState) {
        this.timestamp = timestamp;
        this.actor = actor;
        this.action = action;
        this.flagKey = flagKey;
        this.beforeState = beforeState;
        this.afterState = afterState;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String actor) {
        this.actor = actor;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getFlagKey() {
        return flagKey;
    }

    public void setFlagKey(String flagKey) {
        this.flagKey = flagKey;
    }

    public String getBeforeState() {
        return beforeState;
    }

    public void setBeforeState(String beforeState) {
        this.beforeState = beforeState;
    }

    public String getAfterState() {
        return afterState;
    }

    public void setAfterState(String afterState) {
        this.afterState = afterState;
    }
}
