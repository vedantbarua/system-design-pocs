package com.randomproject.parkingmeter;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class ParkingMeterController {
    private final ParkingMeterService meterService;

    public ParkingMeterController(ParkingMeterService meterService) {
        this.meterService = meterService;
    }

    @GetMapping("/")
    public String viewMeter(@RequestParam(value = "message", required = false) String message, Model model) {
        model.addAttribute("state", meterService.state());
        model.addAttribute("message", message);
        return "meter";
    }

    @PostMapping("/insert")
    public String insert(@RequestParam(defaultValue = "0") int quarters, RedirectAttributes redirectAttributes) {
        MeterState state = meterService.insert(quarters);
        String msg = quarters <= 0
                ? "Please insert at least one quarter."
                : "Inserted " + quarters + " quarter(s). Added time, capped at " + state.maxMinutes() + " minutes.";
        return redirectWithState(redirectAttributes, msg, state);
    }

    @PostMapping("/advance")
    public String advance(@RequestParam(defaultValue = "0") int minutes, RedirectAttributes redirectAttributes) {
        MeterState state = meterService.advance(minutes);
        String msg = minutes <= 0
                ? "Advance minutes must be positive."
                : "Advanced the clock by " + minutes + " minute(s).";
        return redirectWithState(redirectAttributes, msg, state);
    }

    @PostMapping("/tick")
    public String tick(RedirectAttributes redirectAttributes) {
        MeterState state = meterService.tick();
        return redirectWithState(redirectAttributes, "Ticked one minute.", state);
    }

    @GetMapping("/api/meter")
    @ResponseBody
    public ResponseEntity<MeterState> apiState() {
        return ResponseEntity.ok(meterService.state());
    }

    private String redirectWithState(RedirectAttributes redirectAttributes, String message, MeterState state) {
        redirectAttributes.addAttribute("message", message);
        redirectAttributes.addFlashAttribute("state", state);
        return "redirect:/";
    }
}
