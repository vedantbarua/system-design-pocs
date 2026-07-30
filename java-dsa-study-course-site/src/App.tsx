import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Brain, CalendarDays, CheckCircle2, ChevronRight, Clock3, Code2, FileText, Flame, ListChecks, PlayCircle, Search, Target, Trophy } from "lucide-react";

type Difficulty = "Warmup" | "Core" | "Interview";
type Question = { title: string; platform: string; difficulty: "Easy" | "Medium" | "Hard" | "Practice"; url: string };
type Module = {
  id: string;
  title: string;
  focus: string;
  duration: string;
  difficulty: Difficulty;
  topics: string[];
  theory: string[];
  javaNotes: string[];
  mistakes: string[];
  questions: Question[];
  checkpoint: string;
};

const playlistUrl = "https://www.youtube.com/playlist?list=PLfqMhTWNBTe3LtFWcvwpqTkUSlB32kJop";

const modules: Module[] = [
  {
    id: "java-basics",
    title: "Java Foundations",
    focus: "syntax, variables, operators, conditionals, loops, functions",
    duration: "5 days",
    difficulty: "Warmup",
    topics: ["JDK setup", "input/output", "conditionals", "loops", "functions", "number patterns"],
    theory: [
      "Java programs start from `public static void main(String[] args)`, and the JVM executes bytecode produced by `javac`.",
      "Primitive types store values directly; reference types store object references. Know default values, type widening, and explicit casting.",
      "Control flow is about reducing branches: choose `if/else` for ranges, `switch` for discrete options, and loops for repeated work.",
      "Functions should isolate one task, return useful values, and avoid hidden input/output unless the function is explicitly interactive.",
      "Pattern problems train loop boundaries. First decide rows, columns, and the condition for printing a symbol."
    ],
    javaNotes: [
      "Use `Scanner` for beginner input, but remember it is slower than buffered input for contests.",
      "Prefer `long` when products or sums can overflow `int`.",
      "Keep class names PascalCase, methods camelCase, and constants uppercase."
    ],
    mistakes: [
      "Off-by-one loop boundaries",
      "Integer division when decimal output is expected",
      "Using assignment `=` instead of comparison `==` in logic"
    ],
    questions: [
      { title: "Fizz Buzz", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/fizz-buzz/" },
      { title: "Palindrome Number", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/palindrome-number/" },
      { title: "Power of Two", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/power-of-two/" },
      { title: "Number of 1 Bits", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/number-of-1-bits/" },
      { title: "Reverse Integer", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/reverse-integer/" },
      { title: "Java Loops II", platform: "HackerRank", difficulty: "Practice", url: "https://www.hackerrank.com/challenges/java-loops/problem" }
    ],
    checkpoint: "Build a console calculator and solve a pattern-practice notebook without looking at solutions."
  },
  {
    id: "arrays-strings",
    title: "Arrays And Strings",
    focus: "linear data, searching, sorting basics, string operations",
    duration: "8 days",
    difficulty: "Core",
    topics: ["1D arrays", "2D arrays", "linear search", "binary search", "basic sorting", "strings", "StringBuilder"],
    theory: [
      "Arrays give O(1) index access but fixed size. Most array problems are about traversals, maintaining state, or choosing the right pointer movement.",
      "Binary search requires a monotonic condition. Do not memorize only sorted-array search; learn lower bound and answer-space search.",
      "Sorting changes the problem shape by grouping equal values and creating order for two-pointer techniques.",
      "Strings are immutable in Java. Use `StringBuilder` for repeated concatenation inside loops.",
      "For matrices, name row and column bounds clearly before coding traversal."
    ],
    javaNotes: [
      "Use `Arrays.sort(arr)` for primitive arrays and `Collections.sort(list)` for lists.",
      "Use `charAt(i)` for string traversal and `toCharArray()` when frequent mutation-like access helps.",
      "For 2D arrays, `matrix.length` is rows and `matrix[0].length` is columns."
    ],
    mistakes: [
      "Binary search infinite loop from wrong `mid` update",
      "Using `==` instead of `.equals()` for strings",
      "Forgetting empty-array and single-element cases"
    ],
    questions: [
      { title: "Two Sum", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/two-sum/" },
      { title: "Best Time to Buy and Sell Stock", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/" },
      { title: "Maximum Subarray", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/maximum-subarray/" },
      { title: "Search Insert Position", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/search-insert-position/" },
      { title: "Search a 2D Matrix", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/search-a-2d-matrix/" },
      { title: "Valid Anagram", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/valid-anagram/" },
      { title: "Longest Common Prefix", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/longest-common-prefix/" }
    ],
    checkpoint: "Solve 35 array/string problems and write a reusable template for binary search, two pointers, and frequency maps."
  },
  {
    id: "oop-recursion",
    title: "OOP, Recursion, Backtracking",
    focus: "Java OOP plus recursive problem solving",
    duration: "9 days",
    difficulty: "Core",
    topics: ["classes", "inheritance", "interfaces", "encapsulation", "recursion tree", "backtracking", "N-Queens"],
    theory: [
      "OOP organizes data and behavior together. Encapsulation hides representation; inheritance reuses behavior; interfaces define contracts.",
      "Recursion solves a problem by reducing it to a smaller version of itself. Every recursive solution needs a base case and progress toward it.",
      "A recursion tree helps estimate repeated work and time complexity.",
      "Backtracking is DFS over choices: choose, explore, unchoose. It is used when the answer space must be searched.",
      "Pruning is the difference between brute force and practical backtracking."
    ],
    javaNotes: [
      "Use private fields with methods when demonstrating encapsulation.",
      "Pass indexes instead of creating new substrings or arrays when performance matters.",
      "For backtracking, mutate one shared structure and undo the mutation after the recursive call."
    ],
    mistakes: [
      "Missing base case",
      "Not undoing a backtracking choice",
      "Confusing object reference mutation with primitive value passing"
    ],
    questions: [
      { title: "Climbing Stairs", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/climbing-stairs/" },
      { title: "Subsets", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/subsets/" },
      { title: "Permutations", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/permutations/" },
      { title: "Combination Sum", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/combination-sum/" },
      { title: "N-Queens", platform: "LeetCode", difficulty: "Hard", url: "https://leetcode.com/problems/n-queens/" },
      { title: "Sudoku Solver", platform: "LeetCode", difficulty: "Hard", url: "https://leetcode.com/problems/sudoku-solver/" }
    ],
    checkpoint: "Explain stack frames for one recursion problem and solve 12 backtracking problems with choose/explore/unchoose notes."
  },
  {
    id: "linked-stack-queue",
    title: "Linked Lists, Stacks, Queues",
    focus: "pointer-style reasoning and LIFO/FIFO structures",
    duration: "8 days",
    difficulty: "Interview",
    topics: ["singly linked list", "reverse list", "cycle detection", "stack using arrays/list", "queues", "deque"],
    theory: [
      "Linked lists trade random access for cheap insertion/removal when you already have the node reference.",
      "Most linked-list bugs come from losing references. Store `next` before rewiring pointers.",
      "Stacks model last-in-first-out decisions: parsing, undo, monotonic structures, and DFS.",
      "Queues model first-in-first-out processing: BFS, scheduling, buffering, and sliding windows.",
      "A deque supports both ends and is useful for monotonic queue optimizations."
    ],
    javaNotes: [
      "Use `ArrayDeque` for stack/queue behavior instead of legacy `Stack`.",
      "Use dummy nodes to simplify head insert/delete cases.",
      "Floyd's slow/fast pointers detect cycles with O(1) memory."
    ],
    mistakes: [
      "Dereferencing `node.next` when `node` is null",
      "Forgetting to move both slow and fast pointers",
      "Using `LinkedList` when `ArrayDeque` is cleaner for queues"
    ],
    questions: [
      { title: "Reverse Linked List", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/reverse-linked-list/" },
      { title: "Linked List Cycle", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/linked-list-cycle/" },
      { title: "Merge Two Sorted Lists", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/merge-two-sorted-lists/" },
      { title: "Remove Nth Node From End of List", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/remove-nth-node-from-end-of-list/" },
      { title: "Valid Parentheses", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/valid-parentheses/" },
      { title: "Next Greater Element I", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/next-greater-element-i/" },
      { title: "Implement Queue using Stacks", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/implement-queue-using-stacks/" }
    ],
    checkpoint: "Implement linked list, stack, queue, and deque patterns from scratch and with Java Collections."
  },
  {
    id: "trees-bst",
    title: "Trees And BST",
    focus: "hierarchical data, traversal, search invariants",
    duration: "10 days",
    difficulty: "Interview",
    topics: ["binary trees", "DFS", "BFS", "height", "diameter", "BST insert/search/delete", "lowest common ancestor"],
    theory: [
      "Trees are recursive by nature: solve left subtree, solve right subtree, combine at root.",
      "DFS has preorder, inorder, and postorder; pick traversal based on when you need to process the root.",
      "BFS level order uses a queue and is best for shortest depth or level-by-level questions.",
      "BSTs maintain left < root < right, enabling O(h) search when balanced.",
      "Many tree problems return two values logically: the answer for the subtree and metadata needed by the parent."
    ],
    javaNotes: [
      "Create a small `TreeNode` class with `int val`, `TreeNode left`, and `TreeNode right`.",
      "For recursive DFS, keep global answer only when it simplifies combining results.",
      "For BST validation, pass min/max bounds instead of checking only immediate children."
    ],
    mistakes: [
      "Assuming a binary tree is a BST",
      "Forgetting null-node base cases",
      "Using `int` bounds for validation when node values may hit extremes"
    ],
    questions: [
      { title: "Maximum Depth of Binary Tree", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/maximum-depth-of-binary-tree/" },
      { title: "Binary Tree Level Order Traversal", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/binary-tree-level-order-traversal/" },
      { title: "Diameter of Binary Tree", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/diameter-of-binary-tree/" },
      { title: "Validate Binary Search Tree", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/validate-binary-search-tree/" },
      { title: "Lowest Common Ancestor of a Binary Search Tree", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree/" },
      { title: "Construct Binary Tree from Preorder and Inorder Traversal", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/construct-binary-tree-from-preorder-and-inorder-traversal/" }
    ],
    checkpoint: "Create traversal templates and solve 25 tree/BST problems."
  },
  {
    id: "heaps-hashmaps",
    title: "Heaps And HashMaps",
    focus: "priority queues, frequency maps, fast lookup",
    duration: "6 days",
    difficulty: "Interview",
    topics: ["HashMap", "HashSet", "heap", "PriorityQueue", "top K", "sliding frequency"],
    theory: [
      "Hash maps give expected O(1) insert, lookup, and delete by hashing keys.",
      "Frequency maps turn counting questions into lookup questions.",
      "Heaps maintain quick access to min or max priority but do not keep all elements sorted.",
      "Top K problems usually choose between sorting O(n log n), heap O(n log k), or bucket counting.",
      "Sliding-window frequency problems combine two pointers with hash maps."
    ],
    javaNotes: [
      "Use `Map.getOrDefault(key, 0)` for frequency counting.",
      "Use `PriorityQueue<Integer>` for min-heap and custom comparator for max-heap.",
      "When using arrays as keys, convert to strings or use a custom object because arrays use reference equality."
    ],
    mistakes: [
      "Forgetting to decrement/remove frequency when sliding left",
      "Using heap when sorting would be simpler enough",
      "Comparator overflow from `b - a`; prefer `Integer.compare(b, a)`"
    ],
    questions: [
      { title: "Contains Duplicate", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/contains-duplicate/" },
      { title: "Group Anagrams", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/group-anagrams/" },
      { title: "Top K Frequent Elements", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/top-k-frequent-elements/" },
      { title: "Kth Largest Element in an Array", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/kth-largest-element-in-an-array/" },
      { title: "Merge k Sorted Lists", platform: "LeetCode", difficulty: "Hard", url: "https://leetcode.com/problems/merge-k-sorted-lists/" },
      { title: "Longest Substring Without Repeating Characters", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/longest-substring-without-repeating-characters/" }
    ],
    checkpoint: "Know when to pick hashing, heap, sorting, or bucket counting."
  },
  {
    id: "graphs",
    title: "Graphs",
    focus: "BFS/DFS, connectivity, shortest paths, cycle detection",
    duration: "10 days",
    difficulty: "Interview",
    topics: ["adjacency list", "DFS", "BFS", "connected components", "cycle detection", "topological sort", "Dijkstra"],
    theory: [
      "Graphs model relationships. The first decision is representation: adjacency list for sparse graphs, matrix for dense or constant edge checks.",
      "DFS explores deeply and is useful for components, cycle detection, and backtracking over graph state.",
      "BFS explores by distance and is the standard for shortest path in unweighted graphs.",
      "Topological sort works only on directed acyclic graphs and represents dependency order.",
      "Dijkstra handles non-negative weighted shortest paths using a priority queue."
    ],
    javaNotes: [
      "Represent adjacency with `List<List<Integer>>` or `Map<Integer, List<Integer>>`.",
      "Use `boolean[] visited` for dense integer nodes and `Set<T>` for arbitrary keys.",
      "In Dijkstra, skip stale priority queue entries when the popped distance is not current."
    ],
    mistakes: [
      "Not marking visited before enqueueing, causing duplicates",
      "Using BFS for weighted shortest path",
      "Forgetting directed vs undirected edge insertion"
    ],
    questions: [
      { title: "Number of Islands", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/number-of-islands/" },
      { title: "Clone Graph", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/clone-graph/" },
      { title: "Course Schedule", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/course-schedule/" },
      { title: "Rotting Oranges", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/rotting-oranges/" },
      { title: "Is Graph Bipartite?", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/is-graph-bipartite/" },
      { title: "Network Delay Time", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/network-delay-time/" }
    ],
    checkpoint: "Write graph templates from memory and solve 20 graph problems."
  },
  {
    id: "dp-greedy",
    title: "Dynamic Programming And Greedy",
    focus: "state design, transitions, optimization",
    duration: "12 days",
    difficulty: "Interview",
    topics: ["memoization", "tabulation", "knapsack", "LCS", "LIS", "coin change", "activity selection"],
    theory: [
      "Dynamic programming applies when overlapping subproblems and optimal substructure exist.",
      "State design is the core skill: define exactly what `dp[i]` or `dp[i][j]` means before writing transitions.",
      "Memoization is top-down recursion with caching; tabulation is bottom-up iteration.",
      "Greedy works when a locally optimal choice can be proven to lead to a global optimum.",
      "For interval and scheduling problems, sorting often reveals the greedy rule."
    ],
    javaNotes: [
      "Initialize DP arrays with sentinel values when using memoization.",
      "Use `Arrays.fill()` for 1D arrays and loop rows for 2D arrays.",
      "For large answers, check whether modulo arithmetic is required."
    ],
    mistakes: [
      "Writing transitions before defining state",
      "Confusing subsequence with substring",
      "Using greedy without a proof or counterexample check"
    ],
    questions: [
      { title: "Min Cost Climbing Stairs", platform: "LeetCode", difficulty: "Easy", url: "https://leetcode.com/problems/min-cost-climbing-stairs/" },
      { title: "House Robber", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/house-robber/" },
      { title: "Coin Change", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/coin-change/" },
      { title: "Longest Common Subsequence", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/longest-common-subsequence/" },
      { title: "Longest Increasing Subsequence", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/longest-increasing-subsequence/" },
      { title: "Jump Game", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/jump-game/" },
      { title: "Partition Equal Subset Sum", platform: "LeetCode", difficulty: "Medium", url: "https://leetcode.com/problems/partition-equal-subset-sum/" }
    ],
    checkpoint: "For each DP problem, write state, transition, base case, answer, and complexity."
  }
];

const weeklyPlan = [
  "Read the theory panel before watching the lecture block.",
  "Watch the relevant playlist segment and write a 10-line summary.",
  "Implement the core data structure or algorithm from scratch.",
  "Solve all linked Easy questions for the active module.",
  "Solve at least three Medium questions without looking at notes.",
  "Add mistakes and templates to your revision log.",
  "Take a timed mixed-practice session and revisit weak topics."
];

const resources = [
  ["Course playlist", playlistUrl],
  ["Apna College channel", "https://www.youtube.com/@ApnaCollegeOfficial"],
  ["Java docs", "https://docs.oracle.com/en/java/"],
  ["LeetCode problemset", "https://leetcode.com/problemset/"]
];

export default function App() {
  const [activeId, setActiveId] = useState(modules[0].id);
  const [query, setQuery] = useState("");
  const [completed, setCompleted] = useState<string[]>(["java-basics"]);
  const active = modules.find((module) => module.id === activeId) || modules[0];
  const allQuestionCount = modules.reduce((sum, module) => sum + module.questions.length, 0);
  const filtered = useMemo(() => modules.filter((module) => `${module.title} ${module.focus} ${module.topics.join(" ")} ${module.theory.join(" ")} ${module.questions.map((question) => question.title).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const completion = Math.round((completed.length / modules.length) * 100);
  const totalDays = modules.reduce((sum, module) => sum + Number(module.duration.split(" ")[0]), 0);

  function toggleComplete(id: string) {
    setCompleted((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><Flame /> Java + DSA placement path</span>
          <h1>Study companion for Apna College Java + DSA</h1>
          <p>Each module now includes theory, Java notes, common mistakes, checkpoints, and direct practice-question links.</p>
          <div className="hero-actions">
            <a href={playlistUrl} target="_blank" rel="noreferrer"><PlayCircle /> Open playlist</a>
            <button onClick={() => toggleComplete(active.id)}><CheckCircle2 /> {completed.includes(active.id) ? "Mark open" : "Mark done"}</button>
          </div>
        </div>
        <div className="course-shot" aria-label="Course preview visual">
          <img src="https://img.youtube.com/vi/yRpLlJmRo2w/maxresdefault.jpg" alt="Java DSA course thumbnail" />
          <div>
            <strong>{completion}% complete</strong>
            <span>{completed.length}/{modules.length} modules</span>
          </div>
        </div>
      </section>

      <section className="stats">
        <Metric icon={CalendarDays} label="Roadmap" value={`${totalDays} days`} />
        <Metric icon={BookOpen} label="Modules" value={`${modules.length}`} />
        <Metric icon={Code2} label="Questions" value={`${allQuestionCount}`} />
        <Metric icon={Trophy} label="Goal" value="Placement prep" />
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <label className="search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search theory or questions" /></label>
          <div className="module-list">
            {filtered.map((module) => (
              <button key={module.id} className={module.id === active.id ? "selected" : ""} onClick={() => setActiveId(module.id)}>
                <span><strong>{module.title}</strong><small>{module.duration} · {module.questions.length} linked questions</small></span>
                {completed.includes(module.id) ? <CheckCircle2 /> : <ChevronRight />}
              </button>
            ))}
          </div>
        </aside>

        <section className="detail">
          <header>
            <div>
              <small>{active.difficulty}</small>
              <h2>{active.title}</h2>
              <p>{active.focus}</p>
            </div>
            <button onClick={() => toggleComplete(active.id)}>{completed.includes(active.id) ? "Completed" : "Complete module"}</button>
          </header>

          <div className="detail-grid">
            <Panel title="Theory" icon={BookOpen} wide>
              {active.theory.map((point) => <StudyPoint key={point}>{point}</StudyPoint>)}
            </Panel>
            <Panel title="Watch And Learn" icon={PlayCircle}>
              {active.topics.map((topic) => <Tag key={topic}>{topic}</Tag>)}
            </Panel>
            <Panel title="Java Notes" icon={Code2}>
              {active.javaNotes.map((note) => <Task key={note}>{note}</Task>)}
            </Panel>
            <Panel title="Common Mistakes" icon={Brain}>
              {active.mistakes.map((mistake) => <Task key={mistake}>{mistake}</Task>)}
            </Panel>
            <Panel title="Checkpoint" icon={Target}>
              <p className="checkpoint">{active.checkpoint}</p>
            </Panel>
            <Panel title="Linked Question Bank" icon={ListChecks} wide>
              <div className="questions">
                {active.questions.map((question) => <QuestionLink key={question.url} question={question} />)}
              </div>
            </Panel>
          </div>
        </section>
      </section>

      <section className="plan">
        <header>
          <span><Clock3 /> Weekly rhythm</span>
          <h2>Repeat this loop for every module</h2>
        </header>
        <div className="days">
          {weeklyPlan.map((entry, index) => <article key={entry}><strong>Day {index + 1}</strong><p>{entry}</p></article>)}
        </div>
      </section>

      <section className="resources">
        {resources.map(([title, href]) => <a key={title} href={href} target="_blank" rel="noreferrer"><Brain /><span>{title}</span><ArrowUpRight /></a>)}
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return <article><Icon /><small>{label}</small><strong>{value}</strong></article>;
}

function Panel({ title, icon: Icon, children, wide = false }: { title: string; icon: typeof BookOpen; children: React.ReactNode; wide?: boolean }) {
  return <article className={wide ? "panel wide" : "panel"}><h3><Icon />{title}</h3><div>{children}</div></article>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}

function Task({ children }: { children: React.ReactNode }) {
  return <p className="task"><CheckCircle2 />{children}</p>;
}

function StudyPoint({ children }: { children: React.ReactNode }) {
  return <p className="study-point">{children}</p>;
}

function QuestionLink({ question }: { question: Question }) {
  return (
    <a className="question" href={question.url} target="_blank" rel="noreferrer">
      <span>
        <strong>{question.title}</strong>
        <small>{question.platform} · {question.difficulty}</small>
      </span>
      <ArrowUpRight />
    </a>
  );
}
