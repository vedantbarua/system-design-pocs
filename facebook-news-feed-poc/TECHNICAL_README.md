# Technical README: Facebook News Feed POC

This document explains the architecture, flow, and file-by-file purpose of the Facebook news feed proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Storage**: In-memory maps for users, follow edges, and per-user post deques (cap configurable).
- **Domain**: `UserProfile` represents a user; `FeedPost` represents a post; `FeedEntry` combines a post with author data for the feed.
- **Service**: `FacebookNewsFeedService` manages user creation, follows, post publishing, and feed aggregation.
- **Controllers**: `FacebookNewsFeedController` serves the UI; `FacebookNewsFeedApiController` exposes JSON endpoints.
- **Views**: `home.html` hosts all user, follow, post, and feed actions in one page.

## File Structure
```
facebook-news-feed-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/facebooknewsfeed/
│   ├── FacebookNewsFeedPocApplication.java      # Boots the Spring application
│   ├── FacebookNewsFeedService.java             # In-memory store + feed aggregation
│   ├── FacebookNewsFeedController.java          # MVC controller for UI flows
│   ├── FacebookNewsFeedApiController.java       # REST endpoints for JSON access
│   ├── UserProfile.java                         # Domain model for a user
│   ├── FeedPost.java                            # Domain model for a post
│   ├── FeedEntry.java                           # Aggregated feed entry (post + author)
│   ├── CreateUserRequest.java                   # Validation-backed payload for users
│   ├── FollowUserRequest.java                   # Validation-backed payload for follows
│   └── CreatePostRequest.java                   # Validation-backed payload for posts
└── src/main/resources/
    ├── application.properties                   # Port + feed sizing configuration
    └── templates/
        └── home.html                            # UI for users, follows, posts, and feed
```

## Flow
1. **Home**: GET `/` renders `home.html` with user lists, follow form, post form, and selected feed.
2. **Create user**: POST `/users` validates the name, creates a user, and redirects back to their feed.
3. **Follow**: POST `/follow` validates IDs, adds the follow edge, and redirects to the follower feed.
4. **Post**: POST `/posts` validates content, stores a post, trims history, and redirects to the author feed.
5. **Feed**: GET `/api/feed/{userId}` or `/` with `userId` aggregates posts from followed users plus the user.

## Notable Implementation Details
- **Feed aggregation**: Posts are collected from followees and the user, then sorted by timestamp descending.
- **Caps**: `app.max-posts-per-user` limits per-user history; `app.feed-size` limits default feed size.
- **Thread safety**: Maps are concurrent; per-user deques are synchronized during writes/reads.
- **Seed data**: Service constructor creates a few default users and posts for quick UI exploration.

## Configuration
- `server.port=8094` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.
- `app.feed-size=40` — default feed size.
- `app.max-posts-per-user=150` — cap per-user post history.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
