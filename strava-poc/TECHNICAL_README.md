# Technical README: Strava POC

This document explains the architecture, flow, and file-by-file purpose of the Strava activity feed proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Service**: `ActivityService` stores activities in memory, computes feed ordering, and summarizes totals.
- **Controller**: `StravaController` handles the feed, detail, and create form flows.
- **Views**: Thymeleaf templates render the feed, detail page, and new activity form.

## File Structure
```
strava-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/strava/
│   ├── StravaPocApplication.java                # Boots the Spring application
│   ├── StravaController.java                    # MVC endpoints for feed and activities
│   ├── ActivityService.java                     # In-memory activity store + summary math
│   ├── Activity.java                            # Activity domain model
│   ├── ActivityForm.java                        # Validation-backed form payload
│   ├── ActivitySummary.java                     # Feed summary DTO
│   └── ActivityType.java                        # Enum of activity types
└── src/main/resources/
    ├── application.properties                   # Port + Thymeleaf dev config
    └── templates/
        ├── home.html                            # Activity feed UI
        ├── activity.html                        # Activity detail view
        └── new-activity.html                    # New activity form
```

## Flow
1. **Feed**: GET `/` renders `home.html` with recent activities and summary stats.
2. **Detail**: GET `/activity/{id}` renders `activity.html` for a specific activity.
3. **Create**: GET `/new` renders the form; POST `/activities` validates and stores a new activity.

## Notable Implementation Details
- **Ordering**: Activities are sorted by start time (most recent first).
- **Validation**: Form inputs enforce required fields and reasonable limits.
- **Summary**: Average pace is computed as total minutes divided by total kilometers.

## Configuration
- `server.port=8092` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
