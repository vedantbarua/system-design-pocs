package com.randomproject.adclickaggregator;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;

@RestController
@RequestMapping("/api")
public class ClickAggregationController {
    private final ClickAggregationService service;

    public ClickAggregationController(ClickAggregationService service) {
        this.service = service;
    }

    @PostMapping("/clicks")
    public ClickEvent ingestClick(@Valid @RequestBody ClickIngestRequest request) {
        Instant occurredAt = parseInstant(request.occurredAt());
        if (occurredAt == null) {
            occurredAt = Instant.now();
        }
        return service.ingest(request, occurredAt);
    }

    @PostMapping("/clicks/seed")
    public List<ClickEvent> seedClicks(@RequestParam(defaultValue = "50") int count) {
        if (count <= 0 || count > 5000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "count must be between 1 and 5000");
        }
        return service.seed(count);
    }

    @GetMapping("/overview")
    public ClickOverview overview(@RequestParam(required = false) String from,
                                  @RequestParam(required = false) String to) {
        return service.overview(parseInstant(from), parseInstant(to));
    }

    @GetMapping("/summary")
    public List<ClickSummary> summary(@RequestParam(required = false) String groupBy,
                                      @RequestParam(required = false) String from,
                                      @RequestParam(required = false) String to) {
        GroupBy group = parseGroupBy(groupBy);
        return service.summarize(group, parseInstant(from), parseInstant(to));
    }

    @GetMapping("/timeseries")
    public List<TimeSeriesPoint> timeseries(@RequestParam(required = false) String groupBy,
                                            @RequestParam(required = false) String interval,
                                            @RequestParam(required = false) String from,
                                            @RequestParam(required = false) String to) {
        GroupBy group = parseGroupBy(groupBy);
        BucketInterval bucketInterval = parseInterval(interval);
        return service.timeseries(group, bucketInterval, parseInstant(from), parseInstant(to));
    }

    private Instant parseInstant(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(raw);
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid timestamp. Use ISO-8601 like 2026-02-01T10:15:30Z");
        }
    }

    private GroupBy parseGroupBy(String raw) {
        try {
            return GroupBy.from(raw);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid groupBy. Use ad, campaign, or publisher.");
        }
    }

    private BucketInterval parseInterval(String raw) {
        try {
            return BucketInterval.from(raw);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid interval. Use minute, hour, or day.");
        }
    }
}
