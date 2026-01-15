package com.randomproject.newsfeed;

import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;

@Controller
public class NewsFeedController {
    private final NewsFeedService newsFeedService;

    public NewsFeedController(NewsFeedService newsFeedService) {
        this.newsFeedService = newsFeedService;
    }

    @GetMapping("/")
    public String home(@RequestParam(name = "userId", required = false) Long userId, Model model) {
        List<UserProfile> users = newsFeedService.listUsers();
        UserProfile selectedUser = resolveSelectedUser(userId, users);
        List<FeedEntry> feedEntries = selectedUser == null
                ? List.of()
                : newsFeedService.getFeed(selectedUser.id(), newsFeedService.getDefaultFeedSize());
        List<UserProfile> following = selectedUser == null
                ? List.of()
                : newsFeedService.listFollowing(selectedUser.id());

        model.addAttribute("users", users);
        model.addAttribute("selectedUser", selectedUser);
        model.addAttribute("following", following);
        model.addAttribute("feedEntries", feedEntries);
        model.addAttribute("createUserRequest", new CreateUserRequest());
        model.addAttribute("followUserRequest", new FollowUserRequest());
        model.addAttribute("createPostRequest", new CreatePostRequest());
        return "home";
    }

    @GetMapping("/feed/{userId}")
    public String redirectFeed(@PathVariable long userId) {
        return "redirect:/?userId=" + userId;
    }

    @PostMapping("/users")
    public String createUser(
            @Valid @ModelAttribute("createUserRequest") CreateUserRequest request,
            BindingResult bindingResult,
            RedirectAttributes redirectAttributes
    ) {
        if (bindingResult.hasErrors()) {
            redirectAttributes.addFlashAttribute("message", "User name must be between 2 and 40 characters.");
            return "redirect:/";
        }
        UserProfile user = newsFeedService.createUser(request.getName());
        redirectAttributes.addFlashAttribute("message", "Created user " + user.name() + ".");
        return "redirect:/?userId=" + user.id();
    }

    @PostMapping("/follow")
    public String followUser(
            @Valid @ModelAttribute("followUserRequest") FollowUserRequest request,
            BindingResult bindingResult,
            RedirectAttributes redirectAttributes
    ) {
        if (bindingResult.hasErrors()) {
            redirectAttributes.addFlashAttribute("message", "Choose a follower and a followee.");
            return "redirect:/";
        }
        try {
            newsFeedService.follow(request.getFollowerId(), request.getFolloweeId());
            redirectAttributes.addFlashAttribute("message", "Follow created.");
            return "redirect:/?userId=" + request.getFollowerId();
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
            return "redirect:/";
        }
    }

    @PostMapping("/posts")
    public String createPost(
            @Valid @ModelAttribute("createPostRequest") CreatePostRequest request,
            BindingResult bindingResult,
            RedirectAttributes redirectAttributes
    ) {
        if (bindingResult.hasErrors()) {
            redirectAttributes.addFlashAttribute("message", "Post content cannot be empty and must be under 280 characters.");
            return "redirect:/";
        }
        try {
            FeedPost post = newsFeedService.createPost(request.getAuthorId(), request.getContent());
            redirectAttributes.addFlashAttribute("message", "Published post #" + post.id() + ".");
            return "redirect:/?userId=" + request.getAuthorId();
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
            return "redirect:/";
        }
    }

    private UserProfile resolveSelectedUser(Long userId, List<UserProfile> users) {
        if (userId != null) {
            return newsFeedService.findUser(userId).orElse(null);
        }
        return users.isEmpty() ? null : users.get(0);
    }
}
