package com.randomproject.strava;

import jakarta.validation.Valid;
import java.time.LocalDateTime;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.server.ResponseStatusException;

@Controller
public class StravaController {
    private final ActivityService activityService;

    public StravaController(ActivityService activityService) {
        this.activityService = activityService;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("activities", activityService.listActivities());
        model.addAttribute("summary", activityService.getSummary());
        return "home";
    }

    @GetMapping("/activity/{id}")
    public String activity(@PathVariable long id, Model model) {
        Activity activity = activityService.getActivity(id);
        if (activity == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Activity not found");
        }
        model.addAttribute("activity", activity);
        return "activity";
    }

    @GetMapping("/new")
    public String newActivity(Model model) {
        ActivityForm form = new ActivityForm();
        form.setType(ActivityType.RUN);
        form.setStartedAt(LocalDateTime.now().withSecond(0).withNano(0));
        model.addAttribute("activityForm", form);
        model.addAttribute("activityTypes", ActivityType.values());
        return "new-activity";
    }

    @PostMapping("/activities")
    public String createActivity(@Valid @ModelAttribute("activityForm") ActivityForm form,
                                 BindingResult bindingResult,
                                 Model model) {
        if (bindingResult.hasErrors()) {
            model.addAttribute("activityTypes", ActivityType.values());
            return "new-activity";
        }
        Activity activity = activityService.createActivity(form);
        return "redirect:/activity/" + activity.getId();
    }
}
