import { spawn } from "node:child_process";
import path from "node:path";

const processes = [
  { name: "gateway", script: "../server.js", color: "\x1b[36m" },
  { name: "user", script: "../services/user-service.js", color: "\x1b[32m" },
  { name: "order", script: "../services/order-service.js", color: "\x1b[35m" }
];

const cwd = path.resolve(new URL(".", import.meta.url).pathname);

const children = processes.map(({ name, script, color }) => {
  const child = spawn("node", [script], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env }
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`${color}[${name}]\x1b[0m ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`${color}[${name}]\x1b[0m ${chunk}`);
  });

  return child;
});

const shutdown = () => {
  children.forEach((child) => {
    if (!child.killed) child.kill("SIGINT");
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
