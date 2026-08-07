const paceWorkload = {
  steady: ["3 Khan practice blocks", "1 intuition video", "1 summary note", "1 mixed review", "1 checkpoint attempt"],
  accelerated: ["5 focused practice blocks", "2 intuition videos", "1 timed review", "1 checkpoint attempt", "1 implementation notebook"],
  deep: ["3 practice blocks", "2 MIT depth lectures", "2 written summaries", "1 proof/derivation review", "1 project notebook"]
};

export function generateWeeklyPlan({ activeTitle, pace, completed = [], bookmarked = [] }) {
  const workload = paceWorkload[pace] || paceWorkload.steady;
  const savedFocus = bookmarked.length > 0 ? "Review one saved step before adding new material." : "Save any step that feels unclear.";
  const completionFocus = completed.length > 4 ? "Shift one session to mixed review across completed topics." : "Keep foundations tight before moving too quickly.";

  return [
    { day: "Monday", focus: activeTitle, task: workload[0] },
    { day: "Tuesday", focus: "Intuition", task: workload[1] },
    { day: "Wednesday", focus: "Notes", task: workload[2] },
    { day: "Thursday", focus: "Retention", task: completionFocus },
    { day: "Friday", focus: "Checkpoint", task: workload[4] },
    { day: "Saturday", focus: "Saved steps", task: savedFocus },
    { day: "Sunday", focus: "Review", task: "Update progress, clean notes, and choose next week target." }
  ];
}
