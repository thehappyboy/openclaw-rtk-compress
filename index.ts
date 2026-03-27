import { execSync } from "node:child_process";

/**
 * RTK Token Compressor Plugin
 *
 * Uses RTK (Rust Token Killer) to compress exec tool outputs before they're
 * persisted to the session transcript. This reduces token consumption by
 * 60-80% on common bash command outputs (git, ls, cat, etc.)
 *
 * How it works:
 * 1. before_tool_call: rewrites exec commands to use rtk prefix
 *    (e.g., "git status" → "rtk git status")
 * 2. Falls back gracefully if rtk is not installed
 */

// Commands that RTK can compress effectively
const RTK_REWRITABLE_PREFIXES = [
  "git ",
  "git\t",
  "ls ",
  "ls\t",
  "ls\n",
  "find ",
  "grep ",
  "cat ",
  "diff ",
  "gh ",
  "pnpm ",
  "npm ",
  "cargo ",
  "pytest ",
  "docker ",
];

// Commands to NOT rewrite (interactive, piped, or already using rtk)
const SKIP_PATTERNS = [
  "rtk ",         // already using rtk
  "|",            // piped commands
  "&&",           // chained commands
  ";",            // chained commands
  "$(", "`",      // subshell
  ">", ">>",      // redirects
  "sudo ",        // sudo commands
  "cd ",          // directory changes
  "export ",      // env vars
  "source ",      // sourcing
];

function shouldRewrite(command: string) {
  const trimmed = command.trim();

  // Skip complex commands
  for (const pattern of SKIP_PATTERNS) {
    if (trimmed.includes(pattern)) {
      return false;
    }
  }

  // Only rewrite known commands
  for (const prefix of RTK_REWRITABLE_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

function rewriteCommand(command: string) {
  const trimmed = command.trim();
  return `rtk ${trimmed}`;
}

let rtkAvailable: boolean | null | undefined = null;

function checkRtkAvailable() {
  if (rtkAvailable !== null) {
    return rtkAvailable;
  }
  try {
    execSync("rtk --version", { timeout: 3000, stdio: "pipe" });
    rtkAvailable = true;
  } catch {
    rtkAvailable = false;
  }
  return rtkAvailable;
}

const plugin = {
  id: "rtk-compress",
  name: "RTK Token Compressor",
  description: "Compresses exec tool outputs using RTK to reduce token consumption.",

  register(api: any) {
    if (!checkRtkAvailable()) {
      api.logger.warn("rtk-compress: rtk binary not found, plugin disabled");
      return;
    }

    api.logger.info("rtk-compress: enabled (rtk found)");

    // Rewrite exec commands to use rtk prefix
    api.on("before_tool_call", async (event) => {
      if (event.toolName !== "exec") {
        return;
      }

      const command = (event.params as { command?: string }).command;
      if (!command || typeof command !== "string") {
        return;
      }

      if (shouldRewrite(command)) {
        const rewritten = rewriteCommand(command);
        api.logger.debug(`rtk-compress: ${command.slice(0, 40)} → ${rewritten.slice(0, 40)}`);
        return {
          params: { ...event.params, command: rewritten },
        };
      }

      return;
    });
  },
};

export default plugin;
