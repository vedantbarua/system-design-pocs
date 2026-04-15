package com.randomproject.barmenu;

import java.util.List;

public record Drink(
        String id,
        String name,
        DrinkCategory category,
        String glass,
        String flavor,
        boolean alcoholic,
        List<Ingredient> ingredients,
        List<RecipeStep> steps) {

    public int totalSeconds() {
        return steps.stream().mapToInt(RecipeStep::seconds).sum();
    }
}
