package com.randomproject.barmenu;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class BarMenuService {
    private final Map<String, Drink> drinks = new LinkedHashMap<>();
    private final Map<String, PrepSession> sessions = new ConcurrentHashMap<>();
    private final List<PrepEvent> events = new ArrayList<>();

    public BarMenuService() {
        seedMenu();
    }

    public List<Drink> drinks() {
        return List.copyOf(drinks.values());
    }

    public Optional<Drink> drink(String id) {
        return Optional.ofNullable(drinks.get(normalize(id)));
    }

    public List<PrepSession> sessions() {
        return sessions.values().stream()
                .sorted(Comparator.comparing(PrepSession::getUpdatedAt).reversed())
                .toList();
    }

    public Optional<PrepSession> session(String id) {
        return Optional.ofNullable(sessions.get(id));
    }

    public PrepSession start(String drinkId) {
        Drink drink = drink(drinkId).orElseThrow(() -> new IllegalArgumentException("Unknown drink: " + drinkId));
        String id = UUID.randomUUID().toString().substring(0, 8);
        PrepSession session = new PrepSession(id, drink);
        sessions.put(id, session);
        log(session, "Started " + drink.name() + " helper");
        return session;
    }

    public PrepSession advance(String sessionId) {
        PrepSession session = requireSession(sessionId);
        int previous = session.getCurrentStep().number();
        session.advance();
        if (session.getStatus() == PrepStatus.COMPLETE) {
            log(session, "Completed " + session.getDrink().name());
        } else {
            log(session, "Advanced from step " + previous + " to step " + session.getCurrentStep().number());
        }
        return session;
    }

    public PrepSession back(String sessionId) {
        PrepSession session = requireSession(sessionId);
        session.back();
        log(session, "Moved helper back to step " + session.getCurrentStep().number());
        return session;
    }

    public PrepSession reset(String sessionId) {
        PrepSession session = requireSession(sessionId);
        session.reset();
        log(session, "Reset helper to step 1");
        return session;
    }

    public List<PrepEvent> recentEvents() {
        synchronized (events) {
            return events.stream()
                    .sorted(Comparator.comparing(PrepEvent::at).reversed())
                    .limit(12)
                    .toList();
        }
    }

    public PrepSessionView view(PrepSession session) {
        return new PrepSessionView(
                session.getId(),
                session.getDrink().id(),
                session.getDrink().name(),
                session.getStatus(),
                session.getCurrentStep().number(),
                session.getTotalSteps(),
                session.getCompletedSteps(),
                session.getProgressPercent(),
                session.getCurrentStep(),
                session.getStartedAt(),
                session.getUpdatedAt());
    }

    private PrepSession requireSession(String id) {
        return session(id).orElseThrow(() -> new IllegalArgumentException("Unknown session: " + id));
    }

    private void log(PrepSession session, String message) {
        synchronized (events) {
            events.add(new PrepEvent(Instant.now(), session.getId(), session.getDrink().id(), message));
            if (events.size() > 50) {
                events.remove(0);
            }
        }
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private void seedMenu() {
        add(new Drink(
                "old-fashioned",
                "Old Fashioned",
                DrinkCategory.CLASSIC,
                "Rocks glass",
                "Spirit-forward, bittersweet, orange",
                true,
                List.of(
                        new Ingredient("Bourbon or rye", "2 oz"),
                        new Ingredient("Demerara syrup", "0.25 oz"),
                        new Ingredient("Angostura bitters", "2 dashes"),
                        new Ingredient("Orange peel", "1")),
                List.of(
                        new RecipeStep(1, "Build", "Add syrup and bitters to a rocks glass.", 20),
                        new RecipeStep(2, "Add whiskey", "Pour in the whiskey and add one large ice cube.", 20),
                        new RecipeStep(3, "Stir", "Stir until the glass feels cold and the drink softens.", 35),
                        new RecipeStep(4, "Garnish", "Express orange peel over the drink and set it on the rim.", 15))));

        add(new Drink(
                "margarita",
                "Margarita",
                DrinkCategory.SOUR,
                "Coupe or rocks glass",
                "Bright lime, agave, light salt",
                true,
                List.of(
                        new Ingredient("Blanco tequila", "2 oz"),
                        new Ingredient("Lime juice", "1 oz"),
                        new Ingredient("Orange liqueur", "0.75 oz"),
                        new Ingredient("Agave syrup", "0.25 oz"),
                        new Ingredient("Salt rim", "optional")),
                List.of(
                        new RecipeStep(1, "Prep glass", "Salt half the rim and fill the shaker with ice.", 25),
                        new RecipeStep(2, "Measure", "Add tequila, lime, orange liqueur, and agave.", 35),
                        new RecipeStep(3, "Shake", "Shake hard until the tin frosts.", 20),
                        new RecipeStep(4, "Strain", "Strain into the glass and add a lime wheel.", 15))));

        add(new Drink(
                "espresso-tonic",
                "Espresso Tonic",
                DrinkCategory.ZERO_PROOF,
                "Highball",
                "Bubbly, bitter, citrus",
                false,
                List.of(
                        new Ingredient("Fresh espresso", "1 shot"),
                        new Ingredient("Tonic water", "4 oz"),
                        new Ingredient("Orange bitters", "1 dash"),
                        new Ingredient("Orange wheel", "1")),
                List.of(
                        new RecipeStep(1, "Chill", "Fill a highball with fresh ice.", 10),
                        new RecipeStep(2, "Add tonic", "Pour tonic slowly down the side of the glass.", 15),
                        new RecipeStep(3, "Float espresso", "Pull espresso and pour gently over the tonic.", 35),
                        new RecipeStep(4, "Finish", "Add bitters and garnish with orange.", 10))));

        add(new Drink(
                "gin-and-tonic",
                "Gin and Tonic",
                DrinkCategory.HIGHBALL,
                "Highball",
                "Crisp, herbal, sparkling",
                true,
                List.of(
                        new Ingredient("London dry gin", "2 oz"),
                        new Ingredient("Tonic water", "4 oz"),
                        new Ingredient("Lime wedge", "1"),
                        new Ingredient("Juniper berries", "optional")),
                List.of(
                        new RecipeStep(1, "Ice", "Pack the highball with cold, clear ice.", 10),
                        new RecipeStep(2, "Build", "Add gin, then top with tonic.", 20),
                        new RecipeStep(3, "Lift", "Gently lift once with a bar spoon to mix without flattening.", 10),
                        new RecipeStep(4, "Garnish", "Squeeze lime over the top and drop it in.", 10))));
    }

    private void add(Drink drink) {
        drinks.put(drink.id(), drink);
    }
}
