// muse-cwd — OpenCode plugin (server part) shipped with Muse CLI GUI.
// Sends the live OpenCode session directory to the Muse bridge on every
// muse-provider request via the x-muse-cwd header, so API agents always run
// in the folder you actually opened — no per-project opencode.json needed.
//
// Installed by setup.ps1 into ~/.config/opencode/plugins/muse-cwd/index.js
// (global plugin dir, auto-loaded, no config entry required).
// Uses only the session-hook API present in OpenCode 2.x server builds:
//   ctx.session.hook("model.request", handler, { providerID })
//   ctx.session.get({ sessionID }) -> session info (carries .directory)
import { Plugin } from "@opencode/plugin";

async function sessionDir(ctx, sessionID) {
  try {
    const s = await ctx.session.get({ sessionID });
    if (!s) return null;
    for (const k of ["directory", "cwd", "projectDirectory", "workdir"]) {
      if (typeof s[k] === "string" && s[k]) return s[k];
    }
    if (s.project && typeof s.project.directory === "string" && s.project.directory) return s.project.directory;
  } catch {}
  return null;
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
            const dir = await sessionDir(ctx, event.sessionID);
            if (dir) event.headers["x-muse-cwd"] = dir;
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
          if (event.request.headers.get && event.request.headers.get("x-muse-cwd")) return;
          const dir = await sessionDir(ctx, event.sessionID);
          if (dir) event.request.headers.set("x-muse-cwd", dir);
        } catch {}
      });
    } catch {}
  },
});
