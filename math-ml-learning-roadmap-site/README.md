# Math To Machine Learning Roadmap Site

Interactive learning roadmap for studying math foundations, intuition-first visual courses, MIT depth courses, and machine-learning specializations in parallel.

## Roadmap

1. Khan Academy: Algebra
2. Khan Academy: Trigonometry
3. Khan Academy: Precalculus
4. 3Blue1Brown: Essence of Linear Algebra alongside Khan Academy Linear Algebra or MIT 18.06SC
5. Khan Academy: AP Calculus AB alongside 3Blue1Brown: Essence of Calculus
6. Khan Academy: AP Calculus BC
7. Khan Academy: Multivariable Calculus
8. Khan Academy: Statistics and Probability
9. MIT OpenCourseWare depth review
10. Mathematics for Machine Learning
11. Andrew Ng's Machine Learning Specialization
12. Deep Learning Specialization

## Features

- Searchable course roadmap
- Steady, accelerated, and deep pacing modes
- Progress tracking persisted through an Express API
- SQLite storage for active step, pacing mode, completion, bookmarks, notes, and weekly plans
- Optional Redis cache for streak/session counters with automatic in-memory fallback
- Spaced-repetition review queue with `again`, `hard`, `good`, and `easy` ratings
- Saved/bookmarked steps
- Direct links to Khan Academy, 3Blue1Brown, MIT OCW, DeepLearning.AI, and Coursera resources
- Study notes for the active step
- Checkpoints and topic tags for each phase
- Responsive React + TypeScript implementation

## Run Locally

```bash
npm install
npm run dev:api
npm run dev
```

Open:

```text
http://127.0.0.1:5360
```

API:

```text
http://127.0.0.1:4360/api/health
```

If Redis is available, set `REDIS_URL` before starting the API. Without Redis, the API still runs with an in-memory cache:

```bash
REDIS_URL=redis://127.0.0.1:6379 npm run dev:api
```

## API Endpoints

- `GET /api/health`
- `GET /api/progress/:userId`
- `PUT /api/progress/:userId`
- `GET /api/plan/:userId`
- `POST /api/plan/:userId`
- `POST /api/reviews/:userId/seed`
- `GET /api/reviews/:userId`
- `POST /api/reviews/:userId/:cardId/rate`

## Build

```bash
npm run build
```

## Notes

The site follows the principle that Khan Academy is used for mechanics and practice, while 3Blue1Brown is used alongside formal study to build intuition early. MIT OCW and ML specializations come after the foundations for deeper mathematical and applied machine-learning work.
