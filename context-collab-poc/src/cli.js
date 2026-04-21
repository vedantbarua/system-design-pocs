#!/usr/bin/env node
import path from "node:path";
import {
  acceptMerge,
  addItem,
  createBranch,
  createBundle,
  getState,
  importSession,
  initWorkspace,
  listBranches,
  listItems,
  loadBundle,
  previewMerge,
  seedDemo
} from "./lib/store.js";

function print(value) {
  if (typeof value === "string") {
    console.log(value);
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
}

function parseOptions(args) {
  const positional = [];
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

function usage() {
  return `Context Collab POC

Usage:
  context-collab init [repoRoot] [--name "Repo Name"]
  context-collab branch --owner maya --name auth-routing
  context-collab add --branch maya-auth-routing --type finding --file README.md "Finding summary"
  context-collab list [--branch maya-auth-routing]
  context-collab import-session <path> --branch maya-auth-routing
  context-collab merge <branch-a> <branch-b> [--accept]
  context-collab export [--merge merge-id] [--title "Bundle title"]
  context-collab seed-demo
  context-collab state

Run from the repository root you want to use as the context workspace.`;
}

function repoRootFrom(options, positional, fallbackIndex = 0) {
  return path.resolve(options.repo || positional[fallbackIndex] || process.cwd());
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, options } = parseOptions(rest);

  try {
    switch (command) {
      case "init": {
        const repoRoot = repoRootFrom(options, positional, 0);
        const workspace = initWorkspace(repoRoot, { name: options.name });
        createBranch(repoRoot, { owner: options.owner || process.env.USER || "local", name: options.branch || "main" });
        print(workspace);
        break;
      }
      case "branch": {
        const repoRoot = repoRootFrom(options, [], 0);
        const branch = createBranch(repoRoot, { owner: options.owner, name: options.name, parentBranchId: options.parent });
        print(branch);
        break;
      }
      case "add": {
        const repoRoot = repoRootFrom(options, [], 0);
        const summary = positional.join(" ").trim();
        const files = rest
          .map((arg, index) => (arg === "--file" ? rest[index + 1] : null))
          .filter(Boolean);
        const symbols = rest
          .map((arg, index) => (arg === "--symbol" ? rest[index + 1] : null))
          .filter(Boolean);
        const item = addItem(repoRoot, options.branch || "local-main", {
          type: options.type || "finding",
          summary,
          body: options.body || "",
          files,
          symbols,
          confidence: options.confidence || "medium",
          source: options.source || "manual",
          createdBy: options.by
        });
        print(item);
        break;
      }
      case "list": {
        const repoRoot = repoRootFrom(options, [], 0);
        if (options.branch) {
          print(listItems(repoRoot, options.branch));
        } else {
          print(listBranches(repoRoot).map((branch) => ({
            branchId: branch.branchId,
            owner: branch.owner,
            name: branch.name,
            items: branch.items.length,
            updatedAt: branch.updatedAt
          })));
        }
        break;
      }
      case "import-session": {
        const repoRoot = repoRootFrom(options, [], 0);
        const sessionPath = positional[0];
        if (!sessionPath) throw new Error("Session path is required.");
        const imported = importSession(repoRoot, options.branch || "local-main", sessionPath);
        print({ imported: imported.length, items: imported });
        break;
      }
      case "merge": {
        const repoRoot = repoRootFrom(options, [], 0);
        if (positional.length < 2) throw new Error("Provide at least two branch ids to merge.");
        const preview = previewMerge(repoRoot, positional, { targetBranchId: options.target });
        if (options.accept) {
          print(acceptMerge(repoRoot, positional, { preview, acceptedBy: options.by }));
        } else {
          print(preview);
        }
        break;
      }
      case "export": {
        const repoRoot = repoRootFrom(options, [], 0);
        const bundle = createBundle(repoRoot, {
          mergeId: options.merge,
          title: options.title,
          summary: options.summary
        });
        print(bundle.promptText);
        break;
      }
      case "bundle": {
        const repoRoot = repoRootFrom(options, [], 0);
        if (!positional[0]) throw new Error("Bundle id is required.");
        print(loadBundle(repoRoot, positional[0]));
        break;
      }
      case "seed-demo": {
        const repoRoot = repoRootFrom(options, positional, 0);
        print(seedDemo(repoRoot));
        break;
      }
      case "state": {
        const repoRoot = repoRootFrom(options, [], 0);
        print(getState(repoRoot));
        break;
      }
      case "help":
      case undefined:
        print(usage());
        break;
      default:
        throw new Error(`Unknown command: ${command}\n\n${usage()}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
