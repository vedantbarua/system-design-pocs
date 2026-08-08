import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Brain,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  GraduationCap,
  LineChart,
  ListChecks,
  PlayCircle,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Trophy
} from "lucide-react";

type Provider = "Khan Academy" | "3Blue1Brown" | "MIT OCW" | "DeepLearning.AI" | "Coursera";
type Level = "Foundation" | "Core Math" | "College Depth" | "Machine Learning";
type Pace = "steady" | "accelerated" | "deep";
type Resource = {
  label: string;
  provider: Provider;
  url: string;
  role: "mechanics" | "intuition" | "depth" | "application";
};
type Step = {
  id: string;
  title: string;
  level: Level;
  weeks: number;
  outcome: string;
  whyNow: string;
  topics: string[];
  resources: Resource[];
  checkpoint: string;
};
type WeeklyPlanItem = { day: string; focus: string; task: string };
type ApiStatus = { ok: boolean; cache: string; timestamp: string };
type ApiProgress = {
  activeId: string;
  pace: Pace;
  completed: string[];
  bookmarked: string[];
  notes: string;
  streak: number;
};
type ReviewRating = "again" | "hard" | "good" | "easy";
type ReviewCard = {
  id: string;
  stepId: string;
  title: string;
  prompt: string;
  answer: string;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
};

const steps: Step[] = [
  {
    id: "algebra",
    title: "Algebra",
    level: "Foundation",
    weeks: 4,
    outcome: "Manipulate expressions, solve equations, graph lines, understand functions, and handle quadratics confidently.",
    whyNow: "This is the grammar for every later subject: trig identities, limits, derivatives, vectors, probability, and ML loss functions all rely on algebraic fluency.",
    topics: ["linear equations", "systems", "exponents", "functions", "quadratics", "polynomials"],
    resources: [
      { label: "Algebra 1", provider: "Khan Academy", role: "mechanics", url: "https://www.khanacademy.org/math/algebra" },
      { label: "Algebra 2", provider: "Khan Academy", role: "mechanics", url: "https://www.khanacademy.org/math/algebra2" }
    ],
    checkpoint: "Solve mixed equation/function problems without pausing to look up algebra rules."
  },
  {
    id: "trigonometry",
    title: "Trigonometry",
    level: "Foundation",
    weeks: 3,
    outcome: "Use unit-circle reasoning, trig graphs, identities, radians, and triangle relationships.",
    whyNow: "Trigonometry makes vectors, rotations, polar coordinates, Fourier intuition, and multivariable calculus much less mysterious.",
    topics: ["unit circle", "radians", "sine/cosine", "identities", "inverse trig", "triangles"],
    resources: [
      { label: "Trigonometry", provider: "Khan Academy", role: "mechanics", url: "https://www.khanacademy.org/math/trigonometry" }
    ],
    checkpoint: "Explain sine and cosine from the unit circle and solve identity problems from memory."
  },
  {
    id: "precalculus",
    title: "Precalculus",
    level: "Foundation",
    weeks: 5,
    outcome: "Connect functions, vectors, matrices, conics, exponentials, logarithms, sequences, and limits.",
    whyNow: "Precalculus is the transition layer: it prepares you for calculus mechanics and introduces the objects used in linear algebra.",
    topics: ["function composition", "inverse functions", "vectors", "matrices", "logarithms", "limits"],
    resources: [
      { label: "Precalculus", provider: "Khan Academy", role: "mechanics", url: "https://www.khanacademy.org/math/precalculus" }
    ],
    checkpoint: "Build a one-page function transformation sheet and solve vectors/matrices exercises."
  },
  {
    id: "linear-algebra-intuition",
    title: "Linear Algebra With Intuition",
    level: "Core Math",
    weeks: 6,
    outcome: "Understand vectors, transformations, matrix multiplication, bases, determinants, eigenvectors, and eigenvalues.",
    whyNow: "3Blue1Brown should start here, before or during formal linear algebra, because it makes the visual meaning of matrices and eigenvectors stick.",
    topics: ["vectors", "span", "basis", "matrix multiplication", "determinants", "eigenvectors"],
    resources: [
      { label: "Essence of Linear Algebra", provider: "3Blue1Brown", role: "intuition", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab" },
      { label: "Linear Algebra", provider: "Khan Academy", role: "mechanics", url: "https://www.khanacademy.org/math/linear-algebra" },
      { label: "18.06SC Linear Algebra", provider: "MIT OCW", role: "depth", url: "https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/" }
    ],
    checkpoint: "Describe matrix multiplication as composition and solve systems using row reduction."
  },
  {
    id: "calculus-ab",
    title: "AP Calculus AB With Essence of Calculus",
    level: "Core Math",
    weeks: 7,
    outcome: "Build derivative and integral mechanics while using visual intuition for limits, rates, areas, and the chain rule.",
    whyNow: "Watching Essence of Calculus alongside AB helps derivatives and integrals feel discovered, not memorized.",
    topics: ["limits", "derivatives", "chain rule", "integrals", "FTC", "applications"],
    resources: [
      { label: "AP/College Calculus AB", provider: "Khan Academy", role: "mechanics", url: "https://www.khanacademy.org/math/ap-calculus-ab" },
      { label: "Essence of Calculus", provider: "3Blue1Brown", role: "intuition", url: "https://www.3blue1brown.com/lessons/essence-of-calculus/" },
      { label: "18.01SC Single Variable Calculus", provider: "MIT OCW", role: "depth", url: "https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/" }
    ],
    checkpoint: "Solve derivative/integral applications and explain the fundamental theorem visually."
  },
  {
    id: "calculus-bc",
    title: "AP Calculus BC",
    level: "Core Math",
    weeks: 5,
    outcome: "Extend AB with series, parametric equations, polar coordinates, and vector-valued functions.",
    whyNow: "BC fills the gaps needed before multivariable calculus and strengthens approximation thinking used in numerical ML.",
    topics: ["series", "Taylor polynomials", "parametric equations", "polar", "vector-valued functions"],
    resources: [
      { label: "AP/College Calculus BC", provider: "Khan Academy", role: "mechanics", url: "https://www.khanacademy.org/math/ap-calculus-bc" }
    ],
    checkpoint: "Explain Taylor approximation and solve sequence/series convergence problems."
  },
  {
    id: "multivariable",
    title: "Multivariable Calculus",
    level: "College Depth",
    weeks: 6,
    outcome: "Work with partial derivatives, gradients, multiple integrals, vector fields, and multivariable optimization.",
    whyNow: "Gradients and optimization are the bridge from calculus to machine learning training loops.",
    topics: ["partial derivatives", "gradients", "multiple integrals", "vector fields", "optimization"],
    resources: [
      { label: "Multivariable Calculus", provider: "Khan Academy", role: "mechanics", url: "https://www.khanacademy.org/math/multivariable-calculus" },
      { label: "18.02SC Multivariable Calculus", provider: "MIT OCW", role: "depth", url: "https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/" }
    ],
    checkpoint: "Use gradients to optimize a function and explain why gradient descent moves downhill."
  },
  {
    id: "statistics-probability",
    title: "Statistics And Probability",
    level: "College Depth",
    weeks: 6,
    outcome: "Understand distributions, expectation, variance, sampling, inference, regression, and uncertainty.",
    whyNow: "ML models are statistical tools; probability and statistics explain data, noise, evaluation, confidence, and generalization.",
    topics: ["probability", "random variables", "distributions", "sampling", "inference", "regression"],
    resources: [
      { label: "Statistics and Probability", provider: "Khan Academy", role: "mechanics", url: "https://www.khanacademy.org/math/statistics-probability" },
      { label: "18.05 Probability and Statistics", provider: "MIT OCW", role: "depth", url: "https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2014/" }
    ],
    checkpoint: "Explain overfitting, sampling variation, and confidence intervals in plain language."
  },
  {
    id: "math-for-ml",
    title: "Mathematics For Machine Learning",
    level: "Machine Learning",
    weeks: 5,
    outcome: "Consolidate linear algebra, calculus, probability, statistics, optimization, and matrix methods for ML.",
    whyNow: "This is where the previous math becomes one practical toolkit for model training and data analysis.",
    topics: ["matrix methods", "least squares", "optimization", "PCA", "probability review", "deep learning math"],
    resources: [
      { label: "18.065 Matrix Methods for ML", provider: "MIT OCW", role: "application", url: "https://ocw.mit.edu/courses/18-065-matrix-methods-in-data-analysis-signal-processing-and-machine-learning-spring-2018/" }
    ],
    checkpoint: "Implement least squares, gradient descent, and PCA on a small dataset."
  },
  {
    id: "machine-learning",
    title: "Machine Learning Specialization",
    level: "Machine Learning",
    weeks: 10,
    outcome: "Build supervised and unsupervised ML foundations with Python-based applications.",
    whyNow: "After the math roadmap, ML concepts such as regression, classification, loss, regularization, and clustering are much easier to reason about.",
    topics: ["regression", "classification", "neural networks", "decision trees", "clustering", "recommenders"],
    resources: [
      { label: "Machine Learning Specialization", provider: "DeepLearning.AI", role: "application", url: "https://www.deeplearning.ai/specializations/machine-learning" },
      { label: "Machine Learning Specialization on Coursera", provider: "Coursera", role: "application", url: "https://www.coursera.org/specializations/machine-learning-introduction" }
    ],
    checkpoint: "Ship a small ML project with train/test split, metrics, and a short model card."
  },
  {
    id: "deep-learning",
    title: "Deep Learning Specialization",
    level: "Machine Learning",
    weeks: 12,
    outcome: "Move from ML foundations into deep neural networks, CNNs, sequence models, and applied TensorFlow work.",
    whyNow: "This should come after core ML and math foundations, because deep learning relies heavily on vectors, gradients, probability, and optimization.",
    topics: ["deep neural networks", "backpropagation", "CNNs", "RNNs", "transformers", "TensorFlow"],
    resources: [
      { label: "Deep Learning Specialization", provider: "Coursera", role: "application", url: "https://www.coursera.org/specializations/deep-learning" }
    ],
    checkpoint: "Train a neural network, explain backprop at a high level, and document failure modes."
  }
];

const paceMultipliers: Record<Pace, number> = {
  steady: 1,
  accelerated: 0.7,
  deep: 1.35
};

const levelColors: Record<Level, string> = {
  Foundation: "#2f6f73",
  "Core Math": "#755c2f",
  "College Depth": "#7b4d65",
  "Machine Learning": "#394f87"
};

const habits = [
  "Use Khan Academy for mechanics and practice.",
  "Use 3Blue1Brown before or during formal courses for intuition.",
  "Write one-page summaries after every major unit.",
  "Do mixed review weekly so earlier algebra and calculus stay sharp.",
  "Build small notebooks once you reach ML topics."
];

const reviewSeedCards = steps.map((step) => ({
  id: `${step.id}-checkpoint`,
  stepId: step.id,
  title: step.title,
  prompt: `Explain the key idea behind ${step.title}: ${step.whyNow}`,
  answer: step.checkpoint
}));

const userId = "demo-learner";

export default function App() {
  const [activeId, setActiveId] = useState(steps[0].id);
  const [completed, setCompleted] = useState<string[]>(["algebra"]);
  const [bookmarked, setBookmarked] = useState<string[]>(["linear-algebra-intuition"]);
  const [query, setQuery] = useState("");
  const [pace, setPace] = useState<Pace>("steady");
  const [notes, setNotes] = useState("Pair intuition with mechanics: watch the visual lesson before heavy exercises, then summarize the idea in your own words.");
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [streak, setStreak] = useState(0);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [reviewQueue, setReviewQueue] = useState<ReviewCard[]>([]);
  const [revealedReviewId, setRevealedReviewId] = useState("");

  const active = steps.find((step) => step.id === activeId) || steps[0];
  const filteredSteps = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return steps;
    return steps.filter((step) => `${step.title} ${step.level} ${step.topics.join(" ")} ${step.resources.map((resource) => resource.label).join(" ")}`.toLowerCase().includes(normalized));
  }, [query]);
  const adjustedWeeks = Math.ceil(steps.reduce((total, step) => total + step.weeks, 0) * paceMultipliers[pace]);
  const completion = Math.round((completed.length / steps.length) * 100);
  const activeIndex = steps.findIndex((step) => step.id === active.id);
  const nextStep = steps[Math.min(activeIndex + 1, steps.length - 1)];

  useEffect(() => {
    let ignore = false;

    async function loadBackendState() {
      try {
        const [healthRes, progressRes, planRes, reviewRes] = await Promise.all([
          fetch("/api/health"),
          fetch(`/api/progress/${userId}`),
          fetch(`/api/plan/${userId}`),
          fetch(`/api/reviews/${userId}/seed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cards: reviewSeedCards })
          })
        ]);
        if (!healthRes.ok || !progressRes.ok || !planRes.ok || !reviewRes.ok) {
          throw new Error("Backend returned an error");
        }
        const health = await healthRes.json() as ApiStatus;
        const progress = await progressRes.json() as ApiProgress;
        const savedPlan = await planRes.json() as { plan: WeeklyPlanItem[] };
        const reviews = await reviewRes.json() as { due: ReviewCard[] };
        if (ignore) return;
        setApiStatus(health);
        setActiveId(progress.activeId);
        setPace(progress.pace);
        setCompleted(progress.completed);
        setBookmarked(progress.bookmarked);
        setNotes(progress.notes);
        setStreak(progress.streak);
        setWeeklyPlan(savedPlan.plan || []);
        setReviewQueue(reviews.due || []);
        setApiError("");
      } catch (error) {
        if (!ignore) setApiError(error instanceof Error ? error.message : "Backend unavailable");
      } finally {
        if (!ignore) setIsHydrated(true);
      }
    }

    loadBackendState();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await fetch(`/api/progress/${userId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeId, pace, completed, bookmarked, notes }),
          signal: controller.signal
        });
        if (!res.ok) throw new Error("Autosave failed");
        const progress = await res.json() as ApiProgress;
        setStreak(progress.streak);
        setApiError("");
      } catch (error) {
        if (!controller.signal.aborted) {
          setApiError(error instanceof Error ? error.message : "Autosave failed");
        }
      } finally {
        if (!controller.signal.aborted) setIsSaving(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeId, bookmarked, completed, isHydrated, notes, pace]);

  function toggleCompleted(id: string) {
    setCompleted((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  function toggleBookmark(id: string) {
    setBookmarked((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  function selectRelative(offset: number) {
    const nextIndex = Math.max(0, Math.min(steps.length - 1, activeIndex + offset));
    setActiveId(steps[nextIndex].id);
  }

  async function generatePlan() {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/plan/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeTitle: active.title, pace, completed, bookmarked })
      });
      if (!res.ok) throw new Error("Plan generation failed");
      const payload = await res.json() as { plan: WeeklyPlanItem[] };
      setWeeklyPlan(payload.plan);
      setApiError("");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Plan generation failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function rateReview(cardId: string, rating: ReviewRating) {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/reviews/${userId}/${encodeURIComponent(cardId)}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating })
      });
      if (!res.ok) throw new Error("Review rating failed");
      const payload = await res.json() as { due: ReviewCard[] };
      setReviewQueue(payload.due);
      setRevealedReviewId("");
      setApiError("");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Review rating failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span><Calculator /></span>
          <div><strong>MathPath ML</strong><small>Khan + 3Blue1Brown + MIT roadmap</small></div>
        </div>
        <label className="search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics or courses" /></label>
        <div className="pace-switch">
          {(["steady", "accelerated", "deep"] as const).map((item) => <button key={item} className={pace === item ? "active" : ""} onClick={() => setPace(item)}>{item}</button>)}
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow"><Sparkles /> Intuition and mechanics together</span>
          <h1>Follow a practical path from algebra to deep learning.</h1>
          <p>This roadmap keeps Khan Academy practice, 3Blue1Brown intuition, MIT depth, and ML specialization work in one track so you do not wait too long to build visual understanding.</p>
          <div className="hero-actions">
            <button onClick={() => setActiveId(nextStep.id)}><Target /> Continue</button>
            <button onClick={() => setCompleted([])}><RotateCcw /> Reset progress</button>
          </div>
        </div>
        <article className="plan-card">
          <img src="https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=1200&q=80" alt="Mathematics notes and formulas on a chalkboard" />
          <div>
            <strong>{completion}% complete</strong>
            <span>{adjustedWeeks} week {pace} plan</span>
          </div>
          <meter min="0" max="100" value={completion} />
          <footer>
            <span>{apiStatus ? `API online · ${apiStatus.cache} cache` : apiError || "Connecting to API"}</span>
            <span>{isSaving ? "Saving" : "Saved"} · streak {streak}</span>
          </footer>
        </article>
      </section>

      <section className="metrics">
        <Metric icon={BookOpen} label="Courses" value={`${steps.length}`} />
        <Metric icon={PlayCircle} label="Resource links" value={`${steps.reduce((total, step) => total + step.resources.length, 0)}`} />
        <Metric icon={Clock3} label="Pace" value={`${adjustedWeeks} weeks`} />
        <Metric icon={Trophy} label="Progress" value={`${completion}%`} />
      </section>

      <section className="workspace">
        <aside className="roadmap">
          {filteredSteps.map((step, index) => (
            <button key={step.id} className={step.id === active.id ? "selected" : ""} onClick={() => setActiveId(step.id)}>
              <span className="order">{String(index + 1).padStart(2, "0")}</span>
              <span><strong>{step.title}</strong><small>{step.level} · {step.weeks} weeks</small></span>
              {completed.includes(step.id) ? <CheckCircle2 /> : <Circle />}
            </button>
          ))}
        </aside>

        <section className="detail">
          <header>
            <div>
              <small style={{ color: levelColors[active.level] }}>{active.level}</small>
              <h2>{active.title}</h2>
              <p>{active.outcome}</p>
            </div>
            <div className="detail-actions">
              <button onClick={() => selectRelative(-1)} disabled={activeIndex === 0}>Previous</button>
              <button onClick={() => selectRelative(1)} disabled={activeIndex === steps.length - 1}>Next</button>
              <button onClick={() => toggleCompleted(active.id)}>{completed.includes(active.id) ? "Completed" : "Mark done"}</button>
              <button className={bookmarked.includes(active.id) ? "active" : ""} onClick={() => toggleBookmark(active.id)}>Save</button>
            </div>
          </header>

          <div className="detail-grid">
            <Panel title="Study Pairing" icon={Brain} wide>
              <div className="resource-grid">
                {active.resources.map((resource) => <ResourceCard key={resource.url} resource={resource} />)}
              </div>
            </Panel>
            <Panel title="Why This Step Now" icon={LineChart}>
              <p className="body-copy">{active.whyNow}</p>
            </Panel>
            <Panel title="Topics To Master" icon={ListChecks}>
              <div className="tags">{active.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
            </Panel>
            <Panel title="Checkpoint" icon={Target}>
              <p className="body-copy">{active.checkpoint}</p>
            </Panel>
            <Panel title="Study Notes" icon={BookOpen}>
              <div className="notes">
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
                <span>{notes.length} chars</span>
              </div>
            </Panel>
          </div>
        </section>

        <aside className="side">
          <Panel title="Daily Review" icon={Brain}>
            <div className="review-queue">
              <strong>{reviewQueue.length} due</strong>
              {reviewQueue.length === 0 ? <p className="body-copy">No reviews due. New cards appear as spaced repetition brings them back.</p> : reviewQueue.slice(0, 2).map((card) => (
                <article key={card.id}>
                  <span>{card.title}</span>
                  <p>{card.prompt}</p>
                  {revealedReviewId === card.id ? <small>{card.answer}</small> : <button onClick={() => setRevealedReviewId(card.id)}>Reveal answer</button>}
                  <div>
                    {(["again", "hard", "good", "easy"] as const).map((rating) => <button key={rating} onClick={() => rateReview(card.id, rating)}>{rating}</button>)}
                  </div>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Weekly Plan" icon={CalendarDays}>
            <div className="weekly-plan">
              <button onClick={generatePlan}>{weeklyPlan.length > 0 ? "Regenerate plan" : "Generate plan"}</button>
              {weeklyPlan.length === 0 ? <p className="body-copy">Generate a saved seven-day plan from your active step and pace.</p> : weeklyPlan.map((item) => <article key={item.day}><strong>{item.day}</strong><span>{item.focus}</span><p>{item.task}</p></article>)}
            </div>
          </Panel>
          <Panel title="Operating Rules" icon={GraduationCap}>
            {habits.map((habit) => <p className="check" key={habit}><CheckCircle2 />{habit}</p>)}
          </Panel>
          <Panel title="Saved Steps" icon={BarChart3}>
            <div className="saved-list">
              {bookmarked.length === 0 ? <p className="body-copy">No saved steps yet.</p> : bookmarked.map((id) => {
                const step = steps.find((entry) => entry.id === id);
                return step ? <button key={id} onClick={() => setActiveId(id)}>{step.title}</button> : null;
              })}
            </div>
          </Panel>
        </aside>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return <article><Icon /><small>{label}</small><strong>{value}</strong></article>;
}

function Panel({ title, icon: Icon, children, wide = false }: { title: string; icon: typeof BookOpen; children: React.ReactNode; wide?: boolean }) {
  return <article className={wide ? "panel wide" : "panel"}><h3><Icon />{title}</h3>{children}</article>;
}

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <a className={`resource ${resource.role}`} href={resource.url} target="_blank" rel="noreferrer">
      <span>{resource.provider}</span>
      <strong>{resource.label}</strong>
      <small>{resource.role}</small>
      <ArrowUpRight />
    </a>
  );
}
