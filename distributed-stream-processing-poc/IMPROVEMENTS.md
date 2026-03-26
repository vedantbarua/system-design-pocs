# Improvements

- Add watermark advancement and explicit late-event handling so closed windows can be reasoned about more realistically.
- Model multiple operators in a topology instead of a single aggregate stage.
- Persist checkpoints and source logs so crash recovery survives process restarts.
- Add repartition steps for key reshuffles and operator parallelism changes.
- Simulate failures during processing to show at-least-once versus exactly-once tradeoffs.
