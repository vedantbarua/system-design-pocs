# Technical README: Tinder POC

This document explains the architecture, flow, and file-by-file purpose of the Tinder-style swipe proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Service**: `TinderService` stores profiles in memory, tracks swipes, and builds match lists.
- **Controller**: `TinderController` handles the swipe deck, profile creation, and JSON APIs.
- **Views**: Thymeleaf templates render the deck, profile detail, match list, and create form.

## File Structure
```
tinder-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/tinder/
│   ├── TinderPocApplication.java                # Boots the Spring application
│   ├── TinderController.java                    # MVC + JSON endpoints
│   ├── TinderService.java                       # In-memory store, swipes, and matches
│   ├── Profile.java                             # Profile domain model
│   ├── ProfileForm.java                         # Validation-backed create form payload
│   ├── ProfileVibe.java                         # Enum for profile theme styling
│   ├── Match.java                               # Match domain model
│   ├── TinderSummary.java                       # Summary DTO
│   ├── SwipeDecision.java                       # Like/Nope/Super like enum
│   ├── SwipeRequest.java                        # JSON swipe payload
│   ├── SwipeResponse.java                       # JSON swipe response
│   └── SwipeResult.java                         # Internal swipe outcome
└── src/main/resources/
    ├── application.properties                   # Port + Thymeleaf dev config
    └── templates/
        ├── home.html                            # Swipe deck UI
        ├── profile.html                         # Profile detail view
        ├── matches.html                         # Match list UI
        └── new-profile.html                     # New profile form
```

## Flow
1. **Deck**: GET `/` renders `home.html` with the next available profile, queue preview, and match list.
2. **Swipe**: POST `/swipe` records a like/nope/super like and redirects back to the deck.
3. **Profile**: GET `/profile/{id}` renders a detailed view with swipe actions.
4. **Create**: GET `/new` renders the form; POST `/profiles` validates and stores a new profile.
5. **Matches**: GET `/matches` renders the match list view.
6. **API**: `/api/*` endpoints expose the same data as JSON.

## Notable Implementation Details
- **In-memory state**: Profiles, swipes, and matches live in memory for fast iteration.
- **Matching logic**: A match is created when a liked profile already “likes you.”
- **Queueing**: Remaining profiles are computed by filtering out swiped IDs.
- **Validation**: Form inputs enforce required fields and ranges.

## Configuration
- `server.port=8097` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
