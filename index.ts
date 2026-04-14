import { execFileSync } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

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
// Only include commands that rtk has built-in compressors for
const RTK_REWRITABLE_PREFIXES = [
  // Git & Version Control
  "git ",
  "git\t",
  "git\n",
  "gh ",
  
  // File Operations (rtk has native compressors)
  "ls ",
  "ls\t",
  "ls\n",
  "find ",
  "tree ",
  
  // Text Search
  "grep ",
  
  // File Read
  "read ",
  "cat ",
  
  // Diffs
  "diff ",
  
  // Package Managers (rtk supported)
  "pnpm ",
  "dotnet ",
  
  // Containers & Cloud
  "docker ",
  "kubectl ",
  "aws ",
  
  // Database
  "psql ",
  
  // Other utilities
  "json ",
  "deps ",
  "env ",
  "log ",
  "wc ",
  "wget ",
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
  return `${rtkCommand} ${trimmed}`;
}

let rtkAvailable: boolean | null | undefined = null;
let rtkCommand = "rtk";

function getRtkCandidates() {
  const home = process.env.HOME ?? "/home/mark";
  const fromEnv = process.env.RTK_BIN?.trim();
  const candidates = [
    fromEnv,
    "rtk",
    `${home}/.local/bin/rtk`,
    "/usr/local/bin/rtk",
    "/usr/bin/rtk",
  ].filter((s): s is string => Boolean(s));
  return Array.from(new Set(candidates));
}

function canExecute(path: string) {
  if (path === "rtk") return true;
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function checkRtkAvailable() {
  if (rtkAvailable !== null) {
    return rtkAvailable;
  }
  for (const candidate of getRtkCandidates()) {
    if (!canExecute(candidate)) continue;
    try {
      execFileSync(candidate, ["--version"], { timeout: 3000, stdio: "pipe" });
      rtkCommand = candidate;
      rtkAvailable = true;
      return true;
    } catch (error: any) {
      // Some runtime sandboxes deny child-process execution with EPERM/EACCES.
      // In that case, keep plugin enabled if the binary path exists and is executable.
      const code = error?.code;
      if ((code === "EPERM" || code === "EACCES") && candidate !== "rtk") {
        rtkCommand = candidate;
        rtkAvailable = true;
        return true;
      }
      // try next candidate
    }
  }
  rtkAvailable = false;
  return rtkAvailable;
}

export default definePluginEntry({
  id: "rtk-compress",
  name: "RTK Token Compressor",
  description: "Compresses exec tool outputs using RTK to reduce token consumption.",

  register(api) {
    api.logger.info("rtk-compress: plugin registering...");
    
    if (!checkRtkAvailable()) {
      api.logger.warn("rtk-compress: rtk binary not found, plugin will be disabled");
      return;
    }

    api.logger.info(`rtk-compress: enabled (rtk found at ${rtkCommand})`);

    // Rewrite exec commands to use rtk prefix
    api.on("before_tool_call", async (event) => {
      api.logger.debug(`rtk-compress: before_tool_call triggered, toolName=${event.toolName}`);
      
      if (event.toolName !== "exec") {
        return;
      }

      // Try multiple possible param structures
      const command = 
        (event.params as any)?.command ||
        (event.params as any)?.args?.command ||
        (event as any)?.command;
      
      if (!command || typeof command !== "string") {
        api.logger.debug(`rtk-compress: no command found in params, skipping`);
        return;
      }

      api.logger.debug(`rtk-compress: original command=${command.slice(0, 50)}`);

      if (shouldRewrite(command)) {
        const rewritten = rewriteCommand(command);
        api.logger.info(`rtk-compress: ${command.slice(0, 40)} → ${rewritten.slice(0, 40)}`);
        return {
          params: { ...event.params, command: rewritten },
        };
      }

      return;
    });
  },
});
