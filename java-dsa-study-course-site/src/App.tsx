import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Brain, CalendarDays, CheckCircle2, ChevronRight, Clock3, Code2, FileText, Flame, ListChecks, PlayCircle, Search, Target, Trophy } from "lucide-react";

type Difficulty = "Warmup" | "Core" | "Interview";
type View = "learn" | "practice" | "analytics" | "admin";
type Question = { title: string; platform: string; difficulty: "Easy" | "Medium" | "Hard" | "Practice"; url: string };
type ConceptLink = { title: string; url: string; source: string };
type LessonLink = { title: string; duration: string; url: string };
type Module = {
  id: string;
  title: string;
  focus: string;
  duration: string;
  difficulty: Difficulty;
  topics: string[];
  concepts: ConceptLink[];
  lessons: LessonLink[];
  theory: string[];
  javaNotes: string[];
  mistakes: string[];
  questions: Question[];
  checkpoint: string;
};

const playlistUrl = "https://www.youtube.com/playlist?list=PLfqMhTWNBTe3LtFWcvwpqTkUSlB32kJop";
const lessonUrl = (index: number) => `${playlistUrl}&index=${index}`;

const modules: Module[] = [
  {
    id: "java-basics",
    title: "Java Foundations",
    focus: "syntax, variables, operators, conditionals, loops, functions",
    duration: "5 days",
    difficulty: "Warmup",
    topics: ["JDK setup", "input/output", "conditionals", "loops", "functions", "number patterns"],
    lessons: [
      { title: "Java introduction and setup", duration: "Core lecture", url: lessonUrl(1) },
      { title: "Variables, data types, and operators", duration: "Core lecture", url: lessonUrl(2) },
      { title: "Conditionals, loops, and patterns", duration: "Practice block", url: lessonUrl(4) },
      { title: "Functions and scope", duration: "Core lecture", url: lessonUrl(7) }
    ],
    concepts: [
      { title: "Java program structure", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/getStarted/cupojava/" },
      { title: "Primitive data types", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/datatypes.html" },
      { title: "Operators", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/operators.html" },
      { title: "If-else control flow", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/if.html" },
      { title: "Switch statements", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/switch.html" },
      { title: "Loops", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/while.html" },
      { title: "Methods", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/javaOO/methods.html" },
      { title: "Pattern problems", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/java/programs-printing-pyramid-patterns-java/" }
    ],
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
    lessons: [
      { title: "Arrays in Java", duration: "Core lecture", url: lessonUrl(9) },
      { title: "2D arrays", duration: "Core lecture", url: lessonUrl(10) },
      { title: "Sorting and binary search", duration: "Algorithm block", url: lessonUrl(12) },
      { title: "Strings and StringBuilder", duration: "Core lecture", url: lessonUrl(13) }
    ],
    concepts: [
      { title: "Arrays in Java", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/arrays.html" },
      { title: "2D arrays and matrices", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/matrix/" },
      { title: "Linear search", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/linear-search/" },
      { title: "Binary search", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/binary-search/" },
      { title: "Sorting algorithms", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/sorting-algorithms/" },
      { title: "Strings", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/data/strings.html" },
      { title: "StringBuilder", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/data/buffers.html" },
      { title: "Two pointers", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/two-pointers-technique/" }
    ],
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
    lessons: [
      { title: "Object-oriented programming", duration: "Java chapter", url: lessonUrl(14) },
      { title: "Recursion fundamentals", duration: "DSA chapter", url: lessonUrl(15) },
      { title: "Backtracking patterns", duration: "DSA chapter", url: lessonUrl(16) },
      { title: "N-Queens and permutations", duration: "Problem walkthrough", url: lessonUrl(17) }
    ],
    concepts: [
      { title: "Object-oriented concepts", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/concepts/" },
      { title: "Classes", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/javaOO/classes.html" },
      { title: "Inheritance", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/IandI/subclasses.html" },
      { title: "Interfaces", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/IandI/createinterface.html" },
      { title: "Encapsulation", source: "Oracle", url: "https://docs.oracle.com/javase/tutorial/java/javaOO/accesscontrol.html" },
      { title: "Recursion", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/recursion/" },
      { title: "Backtracking", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/backtracking-algorithms/" },
      { title: "N-Queens", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/n-queen-problem-backtracking-3/" }
    ],
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
    lessons: [
      { title: "Linked list implementation", duration: "Data structure chapter", url: lessonUrl(20) },
      { title: "Linked list interview patterns", duration: "Problem walkthrough", url: lessonUrl(21) },
      { title: "Stacks in Java", duration: "Data structure chapter", url: lessonUrl(22) },
      { title: "Queues and deques", duration: "Data structure chapter", url: lessonUrl(23) }
    ],
    concepts: [
      { title: "Linked lists", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/linked-list-data-structure/" },
      { title: "Reverse linked list", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/reverse-a-linked-list/" },
      { title: "Floyd cycle detection", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/floyds-cycle-finding-algorithm/" },
      { title: "Stack data structure", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/stack-data-structure/" },
      { title: "Queue data structure", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/queue-data-structure/" },
      { title: "ArrayDeque", source: "Oracle", url: "https://docs.oracle.com/javase/8/docs/api/java/util/ArrayDeque.html" },
      { title: "Deque interface", source: "Oracle", url: "https://docs.oracle.com/javase/8/docs/api/java/util/Deque.html" }
    ],
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
    lessons: [
      { title: "Binary trees and traversals", duration: "Data structure chapter", url: lessonUrl(24) },
      { title: "Tree DFS and BFS questions", duration: "Problem walkthrough", url: lessonUrl(25) },
      { title: "Binary search trees", duration: "Data structure chapter", url: lessonUrl(26) },
      { title: "Lowest common ancestor patterns", duration: "Problem walkthrough", url: lessonUrl(27) }
    ],
    concepts: [
      { title: "Tree data structure", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/tree-data-structure/" },
      { title: "Binary tree", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/binary-tree-data-structure/" },
      { title: "Tree traversals", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/tree-traversals-inorder-preorder-and-postorder/" },
      { title: "Breadth-first search", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/breadth-first-search-or-bfs-for-a-graph/" },
      { title: "Binary search tree", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/binary-search-tree-data-structure/" },
      { title: "BST delete", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/deletion-in-binary-search-tree/" },
      { title: "Lowest common ancestor", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/lowest-common-ancestor-binary-tree-set-1/" }
    ],
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
    lessons: [
      { title: "HashMap and HashSet in Java", duration: "Data structure chapter", url: lessonUrl(28) },
      { title: "Heap and priority queue", duration: "Data structure chapter", url: lessonUrl(29) },
      { title: "Top K frequent patterns", duration: "Problem walkthrough", url: lessonUrl(30) },
      { title: "Sliding window frequency", duration: "Pattern lesson", url: "https://www.youtube.com/watch?v=17rDxH4qXrc" }
    ],
    concepts: [
      { title: "HashMap", source: "Oracle", url: "https://docs.oracle.com/javase/8/docs/api/java/util/HashMap.html" },
      { title: "HashSet", source: "Oracle", url: "https://docs.oracle.com/javase/8/docs/api/java/util/HashSet.html" },
      { title: "Hashing data structure", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/hashing-data-structure/" },
      { title: "Heap data structure", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/heap-data-structure/" },
      { title: "PriorityQueue", source: "Oracle", url: "https://docs.oracle.com/javase/8/docs/api/java/util/PriorityQueue.html" },
      { title: "Top K elements", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/k-largestor-smallest-elements-in-an-array/" },
      { title: "Sliding window", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/window-sliding-technique/" }
    ],
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
    lessons: [
      { title: "Graph representation", duration: "Data structure chapter", url: lessonUrl(31) },
      { title: "Graph BFS and DFS", duration: "Traversal chapter", url: lessonUrl(32) },
      { title: "Cycle detection and topological sort", duration: "Interview chapter", url: lessonUrl(33) },
      { title: "Shortest paths and Dijkstra", duration: "Interview chapter", url: lessonUrl(34) }
    ],
    concepts: [
      { title: "Graph representation", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/graph-and-its-representations/" },
      { title: "Depth-first search", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/depth-first-search-or-dfs-for-a-graph/" },
      { title: "Breadth-first search", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/breadth-first-search-or-bfs-for-a-graph/" },
      { title: "Connected components", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/connected-components-in-an-undirected-graph/" },
      { title: "Cycle detection", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/detect-cycle-in-a-graph/" },
      { title: "Topological sort", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/topological-sorting/" },
      { title: "Dijkstra algorithm", source: "CP-Algorithms", url: "https://cp-algorithms.com/graph/dijkstra.html" }
    ],
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
    lessons: [
      { title: "Complete Dynamic Programming - Lecture 1", duration: "Dedicated DP lesson", url: "https://www.youtube.com/watch?v=uBA8DkCBdco" },
      { title: "DP playlist", duration: "Extended series", url: "https://www.youtube.com/playlist?list=PLfqMhTWNBTe137I_EPQd34TsgV6IO55pt" },
      { title: "Greedy algorithms module", duration: "Practice chapter", url: lessonUrl(35) },
      { title: "Activity selection and interval patterns", duration: "Interview chapter", url: lessonUrl(36) }
    ],
    concepts: [
      { title: "Dynamic programming", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/dynamic-programming/" },
      { title: "Memoization", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/memoization-1d-2d-and-3d/" },
      { title: "Tabulation vs memoization", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/tabulation-vs-memoization/" },
      { title: "0/1 knapsack", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/0-1-knapsack-problem-dp-10/" },
      { title: "Longest common subsequence", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/longest-common-subsequence-dp-4/" },
      { title: "Longest increasing subsequence", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/longest-increasing-subsequence-dp-3/" },
      { title: "Greedy algorithms", source: "GeeksforGeeks", url: "https://www.geeksforgeeks.org/dsa/greedy-algorithms/" }
    ],
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

const learnerTasks = [
  "Finish active theory notes",
  "Submit two Medium solutions",
  "Review binary search mistakes",
  "Join Saturday mock interview"
];

const cohorts = [
  { name: "July Placement Sprint", learners: 184, completion: 62, atRisk: 19 },
  { name: "Weekend Java Batch", learners: 96, completion: 48, atRisk: 14 },
  { name: "Interview Revision Group", learners: 71, completion: 78, atRisk: 6 }
];

const assessments = [
  { title: "Java Basics Check", questions: 20, due: "Today", status: "Open" },
  { title: "Arrays Timed Drill", questions: 12, due: "Tomorrow", status: "Scheduled" },
  { title: "Graph Template Review", questions: 8, due: "Friday", status: "Draft" }
];

const platformNotes = [
  "Every module carries theory, implementation notes, common mistakes, checkpoint work, and linked practice questions.",
  "Progress is modeled at module level here, but the UI is structured for lesson, quiz, assignment, and cohort-level backend data.",
  "The admin view shows the operational surface a production learning platform needs: cohorts, grading, content health, and interventions."
];

export default function App() {
  const [activeId, setActiveId] = useState(modules[0].id);
  const [query, setQuery] = useState("");
  const [completed, setCompleted] = useState<string[]>(["java-basics"]);
  const [view, setView] = useState<View>("learn");
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);
  const [solved, setSolved] = useState<string[]>([modules[0].questions[0].url, modules[0].questions[1].url]);
  const [bookmarked, setBookmarked] = useState<string[]>([]);
  const [practiceDifficulty, setPracticeDifficulty] = useState<"All" | Question["difficulty"]>("All");
  const [sessionNotes, setSessionNotes] = useState("Map one mistake per solved question before moving to the next module.");
  const active = modules.find((module) => module.id === activeId) || modules[0];
  const selectedLessonIndex = Math.min(activeLessonIndex, active.lessons.length - 1);
  const allQuestionCount = modules.reduce((sum, module) => sum + module.questions.length, 0);
  const filtered = useMemo(() => modules.filter((module) => `${module.title} ${module.focus} ${module.topics.join(" ")} ${module.lessons.map((lesson) => lesson.title).join(" ")} ${module.theory.join(" ")} ${module.questions.map((question) => question.title).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const completion = Math.round((completed.length / modules.length) * 100);
  const totalDays = modules.reduce((sum, module) => sum + Number(module.duration.split(" ")[0]), 0);
  const solvedQuestions = solved.length;
  const mastery = Math.round((solvedQuestions / allQuestionCount) * 100);

  function selectModule(id: string) {
    setActiveId(id);
    setActiveLessonIndex(0);
  }

  function toggleComplete(id: string) {
    setCompleted((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  function toggleQuestionSolved(url: string) {
    setSolved((current) => current.includes(url) ? current.filter((entry) => entry !== url) : [...current, url]);
  }

  function toggleBookmark(url: string) {
    setBookmarked((current) => current.includes(url) ? current.filter((entry) => entry !== url) : [...current, url]);
  }

  return (
    <main className="page platform">
      <header className="topbar">
        <div className="brand">
          <span><Flame /></span>
          <div><strong>CourseOS</strong><small>Java + DSA learning platform</small></div>
        </div>
        <nav className="platform-nav">
          {(["learn", "practice", "analytics", "admin"] as const).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>)}
        </nav>
        <a className="playlist-link" href={playlistUrl} target="_blank" rel="noreferrer"><PlayCircle /> Playlist</a>
      </header>

      <section className="hero platform-hero">
        <div className="hero-copy">
          <span className="eyebrow"><Flame /> Production learning workspace</span>
          <h1>Java + DSA platform for structured placement prep</h1>
          <p>Run the course like a real learning product: curriculum, theory, linked questions, assessments, learner progress, cohort analytics, notes, and admin operations.</p>
          <div className="hero-actions">
            <button onClick={() => setView("learn")}><BookOpen /> Resume lesson</button>
            <button onClick={() => setView("practice")}><ListChecks /> Open question bank</button>
          </div>
        </div>
        <div className="course-shot platform-card" aria-label="Course operations preview">
          <img src="https://img.youtube.com/vi/yRpLlJmRo2w/maxresdefault.jpg" alt="Java DSA course thumbnail" />
          <div>
            <strong>{completion}% complete</strong>
            <span>{solvedQuestions}/{allQuestionCount} questions solved</span>
          </div>
          <ul>
            <li><CheckCircle2 /> Active cohort: July Placement Sprint</li>
            <li><Clock3 /> Next assessment: Java Basics Check</li>
            <li><Target /> Mastery target: 85%</li>
          </ul>
        </div>
      </section>

      <section className="stats">
        <Metric icon={CalendarDays} label="Roadmap" value={`${totalDays} days`} />
        <Metric icon={BookOpen} label="Modules" value={`${modules.length}`} />
        <Metric icon={Code2} label="Questions" value={`${allQuestionCount}`} />
        <Metric icon={Trophy} label="Mastery" value={`${mastery}%`} />
      </section>

      <section className="workspace platform-workspace">
        <aside className="sidebar">
          <label className="search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search theory or questions" /></label>
          <div className="module-list">
            {filtered.map((module) => (
              <button key={module.id} className={module.id === active.id ? "selected" : ""} onClick={() => selectModule(module.id)}>
                <span><strong>{module.title}</strong><small>{module.lessons.length} lessons · {module.questions.length} questions</small></span>
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

          {view === "learn" ? <LearnView active={active} selectedLessonIndex={selectedLessonIndex} onSelectLesson={setActiveLessonIndex} solved={solved} bookmarked={bookmarked} onToggleSolved={toggleQuestionSolved} onToggleBookmark={toggleBookmark} sessionNotes={sessionNotes} onSessionNotesChange={setSessionNotes} /> : null}
          {view === "practice" ? <PracticeView active={active} modules={modules} solved={solved} bookmarked={bookmarked} difficulty={practiceDifficulty} onDifficultyChange={setPracticeDifficulty} onToggleSolved={toggleQuestionSolved} onToggleBookmark={toggleBookmark} /> : null}
          {view === "analytics" ? <AnalyticsView modules={modules} completed={completed} solvedQuestions={solvedQuestions} allQuestionCount={allQuestionCount} /> : null}
          {view === "admin" ? <AdminView /> : null}
        </section>

        <aside className="right-rail">
          <Panel title="Due Work" icon={Clock3}>
            {learnerTasks.map((task) => <Task key={task}>{task}</Task>)}
          </Panel>
          <Panel title="Platform Notes" icon={FileText}>
            {platformNotes.map((note) => <StudyPoint key={note}>{note}</StudyPoint>)}
          </Panel>
        </aside>
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

function LearnView({
  active,
  selectedLessonIndex,
  onSelectLesson,
  solved,
  bookmarked,
  onToggleSolved,
  onToggleBookmark,
  sessionNotes,
  onSessionNotesChange
}: {
  active: Module;
  selectedLessonIndex: number;
  onSelectLesson: (index: number) => void;
  solved: string[];
  bookmarked: string[];
  onToggleSolved: (url: string) => void;
  onToggleBookmark: (url: string) => void;
  sessionNotes: string;
  onSessionNotesChange: (value: string) => void;
}) {
  const selectedLesson = active.lessons[selectedLessonIndex];
  return (
    <div className="detail-grid">
      <Panel title="Lesson Player" icon={PlayCircle} wide>
        <div className="lesson-player">
          <div>
            <small>Lesson {selectedLessonIndex + 1} of {active.lessons.length}</small>
            <strong>{selectedLesson.title}</strong>
            <p>{selectedLesson.duration} · {active.focus}</p>
          </div>
          <div className="lesson-actions">
            <button disabled={selectedLessonIndex === 0} onClick={() => onSelectLesson(selectedLessonIndex - 1)}>Previous</button>
            <button disabled={selectedLessonIndex === active.lessons.length - 1} onClick={() => onSelectLesson(selectedLessonIndex + 1)}>Next</button>
            <a href={selectedLesson.url} target="_blank" rel="noreferrer"><PlayCircle /> Open lesson</a>
          </div>
        </div>
        <div className="lesson-links">
          {active.lessons.map((lesson, index) => <LessonCard key={lesson.url} lesson={lesson} index={index} selected={index === selectedLessonIndex} onSelect={() => onSelectLesson(index)} />)}
        </div>
      </Panel>
      <Panel title="Theory" icon={BookOpen} wide>
        {active.theory.map((point) => <StudyPoint key={point}>{point}</StudyPoint>)}
      </Panel>
      <Panel title="Deep-Dive Concepts" icon={ArrowUpRight}>
        <div className="concept-links">
          {active.concepts.map((concept) => <ConceptLinkCard key={concept.url} concept={concept} />)}
        </div>
      </Panel>
      <Panel title="Module Questions" icon={ListChecks}>
        <div className="compact-questions">
          {active.questions.map((question) => <QuestionLink key={question.url} question={question} solved={solved.includes(question.url)} bookmarked={bookmarked.includes(question.url)} onToggleSolved={onToggleSolved} onToggleBookmark={onToggleBookmark} />)}
        </div>
      </Panel>
      <Panel title="Session Notes" icon={FileText}>
        <div className="notes-pad">
          <textarea value={sessionNotes} onChange={(event) => onSessionNotesChange(event.target.value)} />
          <div>
            <span>{sessionNotes.length} chars</span>
            <button onClick={() => onSessionNotesChange("")}>Clear</button>
          </div>
        </div>
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
    </div>
  );
}

function PracticeView({
  active,
  modules,
  solved,
  bookmarked,
  difficulty,
  onDifficultyChange,
  onToggleSolved,
  onToggleBookmark
}: {
  active: Module;
  modules: Module[];
  solved: string[];
  bookmarked: string[];
  difficulty: "All" | Question["difficulty"];
  onDifficultyChange: (value: "All" | Question["difficulty"]) => void;
  onToggleSolved: (url: string) => void;
  onToggleBookmark: (url: string) => void;
}) {
  const allQuestions = modules.flatMap((module) => module.questions.map((question) => ({ ...question, module: module.title })));
  const filteredQuestions = difficulty === "All" ? allQuestions : allQuestions.filter((question) => question.difficulty === difficulty);
  return (
    <div className="detail-grid">
      <Panel title="Active Module Questions" icon={ListChecks} wide>
        <div className="questions">
          {active.questions.map((question) => <QuestionLink key={question.url} question={question} solved={solved.includes(question.url)} bookmarked={bookmarked.includes(question.url)} onToggleSolved={onToggleSolved} onToggleBookmark={onToggleBookmark} />)}
        </div>
      </Panel>
      <Panel title="Practice Filters" icon={Target} wide>
        <div className="filter-bar">
          {(["All", "Easy", "Medium", "Hard", "Practice"] as const).map((item) => <button key={item} className={difficulty === item ? "active" : ""} onClick={() => onDifficultyChange(item)}>{item}</button>)}
          <span>{filteredQuestions.length} questions shown · {solved.length} solved · {bookmarked.length} bookmarked</span>
        </div>
      </Panel>
      <Panel title="Full Question Bank" icon={Search} wide>
        <div className="question-table">
          {filteredQuestions.map((question) => <QuestionRow key={`${question.module}-${question.url}`} question={question} solved={solved.includes(question.url)} bookmarked={bookmarked.includes(question.url)} onToggleSolved={onToggleSolved} onToggleBookmark={onToggleBookmark} />)}
        </div>
      </Panel>
    </div>
  );
}

function AnalyticsView({ modules, completed, solvedQuestions, allQuestionCount }: { modules: Module[]; completed: string[]; solvedQuestions: number; allQuestionCount: number }) {
  return (
    <div className="detail-grid">
      <Panel title="Learner Health" icon={Trophy} wide>
        <div className="health-grid">
          <Health label="Module completion" value={`${Math.round((completed.length / modules.length) * 100)}%`} />
          <Health label="Question progress" value={`${Math.round((solvedQuestions / allQuestionCount) * 100)}%`} />
          <Health label="Current streak" value="11 days" />
          <Health label="Mock readiness" value="72%" />
        </div>
      </Panel>
      <Panel title="Module Mastery" icon={Target} wide>
        <div className="mastery-list">
          {modules.map((module, index) => <div key={module.id}><span>{module.title}</span><b>{completed.includes(module.id) ? 100 : 42 + index * 5}%</b><meter min="0" max="100" value={completed.includes(module.id) ? 100 : 42 + index * 5} /></div>)}
        </div>
      </Panel>
    </div>
  );
}

function AdminView() {
  return (
    <div className="detail-grid">
      <Panel title="Cohort Operations" icon={Brain} wide>
        <div className="cohorts">
          {cohorts.map((cohort) => <article key={cohort.name}><strong>{cohort.name}</strong><span>{cohort.learners} learners</span><span>{cohort.completion}% complete</span><b>{cohort.atRisk} at risk</b></article>)}
        </div>
      </Panel>
      <Panel title="Assessments" icon={FileText} wide>
        <div className="assessment-list">
          {assessments.map((assessment) => <article key={assessment.title}><strong>{assessment.title}</strong><span>{assessment.questions} questions</span><span>{assessment.due}</span><b>{assessment.status}</b></article>)}
        </div>
      </Panel>
      <Panel title="Production Controls" icon={Target}>
        <Task>Content versioning: v2026.07</Task>
        <Task>Feature flags: cohort analytics, timed mocks, notes export</Task>
        <Task>Data model ready for users, enrollments, lessons, attempts, submissions, and audits</Task>
      </Panel>
      <Panel title="Quality Signals" icon={CheckCircle2}>
        <Task>Question links validated in content review</Task>
        <Task>At-risk learners surfaced by completion and question velocity</Task>
        <Task>Assessment drafts require instructor approval</Task>
      </Panel>
    </div>
  );
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

function QuestionLink({
  question,
  solved = false,
  bookmarked = false,
  onToggleSolved,
  onToggleBookmark
}: {
  question: Question;
  solved?: boolean;
  bookmarked?: boolean;
  onToggleSolved?: (url: string) => void;
  onToggleBookmark?: (url: string) => void;
}) {
  if (onToggleSolved && onToggleBookmark) {
    return (
      <article className={solved ? "question interactive solved" : "question interactive"}>
        <span>
          <strong>{question.title}</strong>
          <small>{question.platform} · {question.difficulty}</small>
        </span>
        <div className="question-actions">
          <button onClick={() => onToggleSolved(question.url)}>{solved ? "Solved" : "Mark"}</button>
          <button className={bookmarked ? "active" : ""} onClick={() => onToggleBookmark(question.url)}>Save</button>
          <a href={question.url} target="_blank" rel="noreferrer"><ArrowUpRight /></a>
        </div>
      </article>
    );
  }

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

function QuestionRow({
  question,
  solved,
  bookmarked,
  onToggleSolved,
  onToggleBookmark
}: {
  question: Question & { module: string };
  solved: boolean;
  bookmarked: boolean;
  onToggleSolved: (url: string) => void;
  onToggleBookmark: (url: string) => void;
}) {
  return (
    <article className={solved ? "question-row solved" : "question-row"}>
      <strong>{question.title}</strong>
      <span>{question.module}</span>
      <span>{question.difficulty}</span>
      <div className="question-actions">
        <button onClick={() => onToggleSolved(question.url)}>{solved ? "Solved" : "Mark"}</button>
        <button className={bookmarked ? "active" : ""} onClick={() => onToggleBookmark(question.url)}>Save</button>
        <a href={question.url} target="_blank" rel="noreferrer"><ArrowUpRight /></a>
      </div>
    </article>
  );
}

function ConceptLinkCard({ concept }: { concept: ConceptLink }) {
  return (
    <a className="concept-link" href={concept.url} target="_blank" rel="noreferrer">
      <span>
        <strong>{concept.title}</strong>
        <small>{concept.source} deep dive</small>
      </span>
      <ArrowUpRight />
    </a>
  );
}

function LessonCard({ lesson, index, selected, onSelect }: { lesson: LessonLink; index: number; selected: boolean; onSelect: () => void }) {
  return (
    <button className={selected ? "lesson-link selected" : "lesson-link"} onClick={onSelect}>
      <span>{String(index + 1).padStart(2, "0")}</span>
      <div>
        <strong>{lesson.title}</strong>
        <small>{lesson.duration}</small>
      </div>
      <PlayCircle />
    </button>
  );
}

function Health({ label, value }: { label: string; value: string }) {
  return <article><small>{label}</small><strong>{value}</strong></article>;
}
