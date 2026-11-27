// muse-cwd — OpenCode plugin (server part) shipped with Muse CLI GUI.
// Sends the live OpenCode session directory to the Muse bridge on every
// muse-provider request via the x-muse-cwd header, so API agents always run
// in the folder you actually opened — no per-project opencode.json needed.
// Also maps the session agent to x-muse-mode (build/supervised/plan/
// research/debug) so OpenCode sessions get the same execution modes as the GUI.
//
// Installed by setup.ps1 into ~/.config/opencode/plugins/muse-cwd/index.js
// (global plugin dir, auto-loaded, no config entry required).
// Uses only the session-hook API present in OpenCode 2.x server builds:
//   ctx.session.hook("model.request", handler, { providerID })
//   ctx.session.get({ sessionID }) -> session info (carries .directory)
import { Plugin } from "@opencode/plugin";

async function sessionInfo(ctx, sessionID) {
  try {
    const s = await ctx.session.get({ sessionID });
    if (!s) return {};
    let dir = null;
    for (const k of ["directory", "cwd", "projectDirectory", "workdir"]) {
      if (typeof s[k] === "string" && s[k]) { dir = s[k]; break; }
    }
    if (!dir && s.project && typeof s.project.directory === "string" && s.project.directory) dir = s.project.directory;
    const agent = typeof s.agent === "string" && s.agent ? s.agent : null;
    return { dir, agent };
  } catch {}
  return {};
}

const MODES = { build: 1, supervised: 1, plan: 1, research: 1, debug: 1 };

function modeFor(agent) {
  if (typeof agent !== "string") return null;
  const a = agent.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(MODES, a) ? a : null;
}

export default Plugin.define({
  id: "muse-cligui.cwd",
  async setup(ctx) {
    // Primary path: model.request carries mutable `headers` + `sessionID`.
    try {
      await ctx.session.hook(
        "model.request",
        async (event) => {
          try {
            if (!event || !event.sessionID || !event.headers) return;
            const info = await sessionInfo(ctx, event.sessionID);
            if (info.dir) event.headers["x-muse-cwd"] = info.dir;
            const mode = modeFor(event.agent) || modeFor(info.agent);
            if (mode) event.headers["x-muse-mode"] = mode;
          } catch {}
        },
        { providerID: "muse" }
      );
    } catch {}
    // Fallback path: raw HTTP hook, scoped by URL to our bridge only.
    try {
      await ctx.session.hook("http.request", async (event) => {
        try {
          const url = event && event.request && event.request.url ? String(event.request.url) : "";
          if (url.indexOf("127.0.0.1:8766") < 0 && url.indexOf("localhost:8766") < 0) return;
          if (!event.sessionID || !event.request || !event.request.headers || !event.request.headers.set) return;
          const info = await sessionInfo(ctx, event.sessionID);
          if (info.dir && !(event.request.headers.get && event.request.headers.get("x-muse-cwd"))) event.request.headers.set("x-muse-cwd", info.dir);
          const mode = modeFor(event.agent) || modeFor(info.agent);
          if (mode && !(event.request.headers.get && event.request.headers.get("x-muse-mode"))) event.request.headers.set("x-muse-mode", mode);
        } catch {}
      });
    } catch {}
  },
});
