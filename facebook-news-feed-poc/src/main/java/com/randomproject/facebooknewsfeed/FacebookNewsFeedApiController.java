package com.randomproject.facebooknewsfeed;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class FacebookNewsFeedApiController {
    private final FacebookNewsFeedService newsFeedService;

    public FacebookNewsFeedApiController(FacebookNewsFeedService newsFeedService) {
        this.newsFeedService = newsFeedService;
    }

    @GetMapping("/users")
    public List<UserProfile> listUsers() {
        return newsFeedService.listUsers();
    }

    @PostMapping("/users")
    public UserProfile createUser(@Valid @RequestBody CreateUserRequest request) {
        return newsFeedService.createUser(request.getName());
    }

    @PostMapping("/follows")
    public void follow(@Valid @RequestBody FollowUserRequest request) {
        newsFeedService.follow(request.getFollowerId(), request.getFolloweeId());
    }

    @PostMapping("/posts")
    public FeedPost createPost(@Valid @RequestBody CreatePostRequest request) {
        return newsFeedService.createPost(request.getAuthorId(), request.getContent());
    }

    @GetMapping("/feed/{userId}")
    public List<FeedEntry> feed(
            @PathVariable long userId,
            @RequestParam(name = "limit", required = false) Integer limit
    ) {
        return newsFeedService.getFeed(userId, limit);
    }
}
