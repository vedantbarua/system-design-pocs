package com.randomproject.adclickaggregator;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ClickAggregationService {
    private final List<ClickEvent> events = new CopyOnWriteArrayList<>();

    public ClickEvent ingest(ClickIngestRequest request, Instant occurredAt) {
        ClickEvent event = new ClickEvent(
                UUID.randomUUID().toString(),
                request.adId(),
                request.campaignId(),
                request.publisherId(),
                occurredAt,
                request.costCents()
        );
        events.add(event);
        return event;
    }

    public List<ClickEvent> seed(int count) {
        List<ClickEvent> created = new ArrayList<>(count);
        ThreadLocalRandom random = ThreadLocalRandom.current();
        String[] ads = {"AD-001", "AD-002", "AD-003", "AD-004"};
        String[] campaigns = {"CMP-ALPHA", "CMP-BETA", "CMP-GAMMA"};
        String[] publishers = {"PUB-NORTH", "PUB-EAST", "PUB-WEST", "PUB-SOUTH"};

        for (int i = 0; i < count; i++) {
            ClickEvent event = new ClickEvent(
                    UUID.randomUUID().toString(),
                    ads[random.nextInt(ads.length)],
                    campaigns[random.nextInt(campaigns.length)],
                    publishers[random.nextInt(publishers.length)],
                    Instant.now().minusSeconds(random.nextLong(0, 60 * 60 * 24)),
                    random.nextLong(5, 75)
            );
            events.add(event);
            created.add(event);
        }

        return created;
    }

    public ClickOverview overview(Instant from, Instant to) {
        List<ClickEvent> filtered = filter(from, to);
        return new ClickOverview(
                filtered.size(),
                filtered.stream().mapToLong(ClickEvent::costCents).sum(),
                filtered.stream().map(ClickEvent::adId).distinct().count(),
                filtered.stream().map(ClickEvent::campaignId).distinct().count(),
                filtered.stream().map(ClickEvent::publisherId).distinct().count()
        );
    }

    public List<ClickSummary> summarize(GroupBy groupBy, Instant from, Instant to) {
        Function<ClickEvent, String> keySelector = groupKey(groupBy);
        Map<String, List<ClickEvent>> grouped = filter(from, to).stream()
                .collect(Collectors.groupingBy(keySelector));

        return grouped.entrySet().stream()
                .map(entry -> {
                    List<ClickEvent> groupEvents = entry.getValue();
                    return new ClickSummary(
                            entry.getKey(),
                            groupEvents.size(),
                            groupEvents.stream().mapToLong(ClickEvent::costCents).sum(),
                            groupEvents.stream().map(ClickEvent::publisherId).distinct().count(),
                            groupEvents.stream().map(ClickEvent::adId).distinct().count()
                    );
                })
                .sorted(Comparator.comparingLong(ClickSummary::clicks).reversed())
                .toList();
    }

    public List<TimeSeriesPoint> timeseries(GroupBy groupBy, BucketInterval interval, Instant from, Instant to) {
        Function<ClickEvent, String> keySelector = groupKey(groupBy);
        return filter(from, to).stream()
                .collect(Collectors.groupingBy(event -> new TimeSeriesKey(
                        keySelector.apply(event),
                        event.occurredAt().truncatedTo(interval.chronoUnit())
                )))
                .entrySet().stream()
                .map(entry -> {
                    TimeSeriesKey key = entry.getKey();
                    List<ClickEvent> groupEvents = entry.getValue();
                    return new TimeSeriesPoint(
                            key.groupKey(),
                            key.bucketStart(),
                            groupEvents.size(),
                            groupEvents.stream().mapToLong(ClickEvent::costCents).sum()
                    );
                })
                .sorted(Comparator.comparing(TimeSeriesPoint::bucketStart))
                .toList();
    }

    private List<ClickEvent> filter(Instant from, Instant to) {
        return events.stream()
                .filter(event -> from == null || !event.occurredAt().isBefore(from))
                .filter(event -> to == null || event.occurredAt().isBefore(to))
                .toList();
    }

    private Function<ClickEvent, String> groupKey(GroupBy groupBy) {
        return switch (groupBy) {
            case AD -> ClickEvent::adId;
            case CAMPAIGN -> ClickEvent::campaignId;
            case PUBLISHER -> ClickEvent::publisherId;
        };
    }

    private record TimeSeriesKey(String groupKey, Instant bucketStart) {
    }
}
