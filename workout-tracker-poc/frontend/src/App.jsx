import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8111/api";

const defaultWorkout = {
  name: "",
  category: "Cardio",
  durationMinutes: 40,
  caloriesBurned: 350,
  occurredAt: ""
};

const defaultMeal = {
  name: "",
  mealType: "Lunch",
  calories: 550,
  occurredAt: ""
};

const formatTimestamp = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleString();
};

const toIsoOrNull = (value) => {
  if (!value) return null;
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return null;
  return asDate.toISOString();
};

export default function App() {
  const [workouts, setWorkouts] = useState([]);
  const [meals, setMeals] = useState([]);
  const [overview, setOverview] = useState(null);
  const [workoutForm, setWorkoutForm] = useState(defaultWorkout);
  const [mealForm, setMealForm] = useState(defaultMeal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const netColor = useMemo(() => {
    if (!overview) return "var(--muted)";
    return overview.netCalories <= 0 ? "var(--accent)" : "var(--warning)";
  }, [overview]);

  const loadAll = async () => {
    setError("");
    try {
      const [workoutRes, mealRes, overviewRes] = await Promise.all([
        fetch(`${API_BASE}/workouts`),
        fetch(`${API_BASE}/meals`),
        fetch(`${API_BASE}/overview`)
      ]);
      if (!workoutRes.ok || !mealRes.ok || !overviewRes.ok) {
        throw new Error("Failed to load data from the API.");
      }
      const [workoutData, mealData, overviewData] = await Promise.all([
        workoutRes.json(),
        mealRes.json(),
        overviewRes.json()
      ]);
      setWorkouts(workoutData);
      setMeals(mealData);
      setOverview(overviewData);
    } catch (err) {
      setError(err.message || "Unable to connect to the backend.");
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const submitWorkout = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...workoutForm,
        occurredAt: toIsoOrNull(workoutForm.occurredAt)
      };
      const res = await fetch(`${API_BASE}/workouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error("Failed to log workout.");
      }
      setWorkoutForm(defaultWorkout);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to log workout.");
    } finally {
      setBusy(false);
    }
  };

  const submitMeal = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...mealForm,
        occurredAt: toIsoOrNull(mealForm.occurredAt)
      };
      const res = await fetch(`${API_BASE}/meals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error("Failed to log meal.");
      }
      setMealForm(defaultMeal);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to log meal.");
    } finally {
      setBusy(false);
    }
  };

  const deleteWorkout = async (id) => {
    setBusy(true);
    try {
      await fetch(`${API_BASE}/workouts/${id}`, { method: "DELETE" });
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const deleteMeal = async (id) => {
    setBusy(true);
    try {
      await fetch(`${API_BASE}/meals/${id}`, { method: "DELETE" });
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const seedData = async () => {
    setBusy(true);
    try {
      await Promise.all([
        fetch(`${API_BASE}/workouts/seed?count=8`, { method: "POST" }),
        fetch(`${API_BASE}/meals/seed?count=8`, { method: "POST" })
      ]);
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Workout Tracker POC</p>
          <h1>Log training, meals, and calorie balance in one flow.</h1>
          <p className="subtitle">
            Track workouts, meals, and the net calorie impact with a lightweight
            Spring Boot + React stack.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={seedData} disabled={busy}>
            Seed demo data
          </button>
          <button className="primary" onClick={loadAll} disabled={busy}>
            Refresh now
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <section className="overview">
        <div className="card">
          <p className="label">Workouts Logged</p>
          <h2>{overview ? overview.workoutCount : "--"}</h2>
          <p className="meta">Total minutes: {overview ? overview.totalWorkoutMinutes : "--"}</p>
        </div>
        <div className="card">
          <p className="label">Calories Burned</p>
          <h2>{overview ? overview.caloriesBurned : "--"}</h2>
          <p className="meta">From training sessions</p>
        </div>
        <div className="card">
          <p className="label">Calories Consumed</p>
          <h2>{overview ? overview.caloriesConsumed : "--"}</h2>
          <p className="meta">From meals logged</p>
        </div>
        <div className="card net">
          <p className="label">Net Calories</p>
          <h2 style={{ color: netColor }}>{overview ? overview.netCalories : "--"}</h2>
          <p className="meta">Consumed minus burned</p>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel-header">
            <h3>Log a workout</h3>
            <p>Keep intensity and duration visible.</p>
          </div>
          <form className="form" onSubmit={submitWorkout}>
            <label>
              Workout name
              <input
                value={workoutForm.name}
                onChange={(event) =>
                  setWorkoutForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Tempo Run"
                required
              />
            </label>
            <label>
              Category
              <select
                value={workoutForm.category}
                onChange={(event) =>
                  setWorkoutForm((prev) => ({ ...prev, category: event.target.value }))
                }
              >
                <option>Cardio</option>
                <option>Strength</option>
                <option>Mobility</option>
                <option>Endurance</option>
                <option>Recovery</option>
              </select>
            </label>
            <label>
              Duration (minutes)
              <input
                type="number"
                min="1"
                value={workoutForm.durationMinutes}
                onChange={(event) =>
                  setWorkoutForm((prev) => ({
                    ...prev,
                    durationMinutes: Number(event.target.value)
                  }))
                }
                required
              />
            </label>
            <label>
              Calories burned
              <input
                type="number"
                min="0"
                value={workoutForm.caloriesBurned}
                onChange={(event) =>
                  setWorkoutForm((prev) => ({
                    ...prev,
                    caloriesBurned: Number(event.target.value)
                  }))
                }
              />
            </label>
            <label>
              Occurred at
              <input
                type="datetime-local"
                value={workoutForm.occurredAt}
                onChange={(event) =>
                  setWorkoutForm((prev) => ({ ...prev, occurredAt: event.target.value }))
                }
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              Log workout
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Log a meal</h3>
            <p>Keep nutrition context alongside training.</p>
          </div>
          <form className="form" onSubmit={submitMeal}>
            <label>
              Meal name
              <input
                value={mealForm.name}
                onChange={(event) =>
                  setMealForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Protein Bowl"
                required
              />
            </label>
            <label>
              Meal type
              <select
                value={mealForm.mealType}
                onChange={(event) =>
                  setMealForm((prev) => ({ ...prev, mealType: event.target.value }))
                }
              >
                <option>Breakfast</option>
                <option>Lunch</option>
                <option>Dinner</option>
                <option>Snack</option>
              </select>
            </label>
            <label>
              Calories
              <input
                type="number"
                min="0"
                value={mealForm.calories}
                onChange={(event) =>
                  setMealForm((prev) => ({
                    ...prev,
                    calories: Number(event.target.value)
                  }))
                }
                required
              />
            </label>
            <label>
              Occurred at
              <input
                type="datetime-local"
                value={mealForm.occurredAt}
                onChange={(event) =>
                  setMealForm((prev) => ({ ...prev, occurredAt: event.target.value }))
                }
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              Log meal
            </button>
          </form>
        </div>
      </section>

      <section className="grid two">
        <div className="panel scroll">
          <div className="panel-header">
            <h3>Recent workouts</h3>
            <p>{workouts.length} sessions logged</p>
          </div>
          <div className="list">
            {workouts.length === 0 && <p className="empty">No workouts logged yet.</p>}
            {workouts.map((workout) => (
              <div key={workout.id} className="list-item">
                <div>
                  <h4>{workout.name}</h4>
                  <p>
                    {workout.category} · {workout.durationMinutes} min · {workout.caloriesBurned} kcal
                  </p>
                  <span>{formatTimestamp(workout.occurredAt)}</span>
                </div>
                <button className="ghost" onClick={() => deleteWorkout(workout.id)} disabled={busy}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel scroll">
          <div className="panel-header">
            <h3>Recent meals</h3>
            <p>{meals.length} meals logged</p>
          </div>
          <div className="list">
            {meals.length === 0 && <p className="empty">No meals logged yet.</p>}
            {meals.map((meal) => (
              <div key={meal.id} className="list-item">
                <div>
                  <h4>{meal.name}</h4>
                  <p>
                    {meal.mealType} · {meal.calories} kcal
                  </p>
                  <span>{formatTimestamp(meal.occurredAt)}</span>
                </div>
                <button className="ghost" onClick={() => deleteMeal(meal.id)} disabled={busy}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
