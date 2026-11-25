import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { resolveInRoot } from "./files.js";

const execFileAsync = promisify(execFile);

export interface DiagnosticIssue {
  file: string;
  line: number | null;
  message: string;
  tool: string;
}

export interface DiagnosticReport {
  checked: number;
  skipped: string[];
  issues: DiagnosticIssue[];
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCmd(file: string, args: string[], cwd: string, timeout: number): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, { cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    return { code: 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
  } catch (error) {
    const err = error as { code?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown };
    const numeric = typeof err.code === "number" ? err.code : -1;
    return {
      code: numeric,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? err.message ?? ""),
    };
  }
}

function toolMissing(stderr: string): boolean {
  return /ENOENT|not recognized|not found/i.test(stderr);
}

/**
 * Syntax-checks project files the way the bridge's `diagnose` does: node for JS, JSON.parse for
 * JSON, py_compile for Python, tsc for TypeScript, the PowerShell parser for ps1. Read-only and
 * capped: at most 20 files, 1MB each, 50 issues. A file whose checker is not installed is skipped,
 * never reported clean.
 */
export async function diagnoseFiles(root: string, displayRoot: string, requested: string[]): Promise<DiagnosticReport> {
  const issues: DiagnosticIssue[] = [];
  const skipped: string[] = [];
  let checked = 0;
  const push = (file: string, line: number | null, message: string, tool: string) => {
    if (issues.length < 50) {
      issues.push({ file, line, message: String(message).slice(0, 300), tool });
    }
  };
  const ps1batch: string[] = [];
  for (const raw of requested.slice(0, 20)) {
    const rel = String(raw ?? "");
    if (!rel || rel.length > 500 || rel.startsWith("-")) {
      skipped.push(rel);
      continue;
    }
    let abs: string;
    let name: string;
    try {
      const resolved = await resolveInRoot(root, rel, displayRoot);
      abs = resolved.abs;
      name = resolved.rel;
    } catch {
      skipped.push(rel);
      continue;
    }
    let info = null;
    try {
      info = await stat(abs);
    } catch {
      continue;
    }
    if (!info.isFile() || info.size > 1024 * 1024) {
      skipped.push(rel);
      continue;
    }
    const ext = extname(name).toLowerCase();
    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
      checked += 1;
      const r = await runCmd(process.execPath, ["--check", abs], root, 15_000);
      if (r.code !== 0) {
        const err = (r.stderr || "").replace(/\r\n/g, "\n");
        const m = err.match(/([^:\n]+):(\d+)\n([\s\S]{1,300})/);
        push(name, m ? Number.parseInt(m[2]!, 10) : null, (m ? m[3]!.trim() : (err || "syntax error").trim()).slice(0, 300), "node");
      }
    } else if (ext === ".json") {
      checked += 1;
      try {
        JSON.parse(await readFile(abs, "utf8"));
      } catch (error) {
        push(name, null, (error as Error).message, "json");
      }
    } else if (ext === ".py") {
      checked += 1;
      let r = await runCmd("py", ["-m", "py_compile", abs], root, 15_000);
      if (r.code !== 0 && toolMissing(r.stderr)) {
        r = await runCmd("python", ["-m", "py_compile", abs], root, 15_000);
      }
      if (r.code !== 0 && !toolMissing(r.stderr)) {
        const m = (r.stderr || "").match(/line (\d+)/i);
        const last = (r.stderr || "").trim().split("\n").pop();
        push(name, m ? Number.parseInt(m[1]!, 10) : null, last || "compile error", "py_compile");
      } else if (r.code !== 0) {
        checked -= 1;
        skipped.push(rel);
      }
    } else if (ext === ".ps1") {
      ps1batch.push(name);
    } else if (ext === ".ts" || ext === ".tsx" || ext === ".mts" || ext === ".cts") {
      const localTsc = join(root, "node_modules", "typescript", "bin", "tsc");
      let tscExists = false;
      try {
        tscExists = (await stat(localTsc)).isFile();
      } catch {
        tscExists = false;
      }
      const bin = tscExists ? process.execPath : "tsc";
      const args = tscExists ? [localTsc, "--noEmit", "--skipLibCheck", abs] : ["--noEmit", "--skipLibCheck", abs];
      checked += 1;
      const r = await runCmd(bin, args, root, 60_000);
      if (r.code !== 0 && toolMissing(r.stderr)) {
        checked -= 1;
        skipped.push(rel);
        continue;
      }
      if (r.code !== 0) {
        const lines = (`${r.stdout}\n${r.stderr || ""}`).split("\n").filter((l) => /error TS/i.test(l)).slice(0, 10);
        if (!lines.length) {
          push(name, null, "typecheck failed", "tsc");
        }
        for (const l of lines) {
          const m = l.match(/\((\d+),\d+\):\s*(.*)/);
          push(name, m ? Number.parseInt(m[1]!, 10) : null, (m ? m[2] : l).trim(), "tsc");
        }
      }
    } else {
      skipped.push(rel);
    }
  }
  if (ps1batch.length) {
    const list = ps1batch.slice(0, 20).map((r) => r.replace(/'/g, "''")).join("','");
    const ps =
      "$errs=@(); foreach ($f in @('" +
      list +
      "')) { $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path '" +
      root.replace(/'/g, "''") +
      "' $f), [ref]$null, [ref]$e); foreach ($x in @($e)) { $errs += ($f + '|' + $x.Extent.StartLineNumber + '|' + $x.Message) } }; $errs -join \"`n\"";
    const r = await runCmd("powershell.exe", ["-NoProfile", "-Command", ps], root, 60_000);
    if (toolMissing(r.stderr) || r.code === -1) {
      skipped.push(...ps1batch.slice(0, 20));
    } else {
      checked += ps1batch.length;
      if (r.code === 0 && r.stdout.trim()) {
        for (const line of r.stdout.trim().split("\n").slice(0, 20)) {
          const parts = line.split("|");
          if (parts.length >= 3) {
            push(parts[0]!, Number.parseInt(parts[1]!, 10) || null, parts.slice(2).join("|"), "powershell");
          }
        }
      }
    }
  }
  return { checked, skipped: skipped.slice(0, 20), issues };
}
