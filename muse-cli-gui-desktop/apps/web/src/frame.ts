import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { WindowFrame } from "@musecodeicon/ui";

declare global {
  interface Window {
    /** Set by the desktop shell before the page loads when the window has no native title bar. */
    __MUSECODEICON_FRAME__?: string;
    /** Set by the desktop shell before the page loads when macOS traffic lights float over the UI. */
    __MUSECODEICON_TITLEBAR__?: string;
  }
  interface WindowEventMap {
    "musecodeicon-zoom": CustomEvent<number>;
    "musecodeicon-zoom-step": CustomEvent<"in" | "out" | "reset">;
    "musecodeicon-menu": CustomEvent<"new-thread" | "settings">;
  }
}

/** True on macOS, where the desktop shell overlays the traffic lights on the sidebar. */
export function titlebarOverlay(): boolean {
  return window.__MUSECODEICON_TITLEBAR__ === "overlay";
}

/**
 * Desktop zoom must go through the webview, not CSS `zoom` on <html>: WKWebView then mis-places
 * every Radix `position: fixed` menu. No-op in a browser. Call once at startup.
 */
export function bindDesktopZoom(): void {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }
  const apply = (zoom: number) => {
    getCurrentWebview()
      .setZoom(zoom)
      .catch((error: unknown) => console.error("MuseCodeIcon: webview zoom failed", error));
  };
  window.addEventListener("musecodeicon-zoom", (event) => apply(event.detail));
  void listen<"in" | "out" | "reset">("musecodeicon://zoom", (event) => {
    window.dispatchEvent(new CustomEvent("musecodeicon-zoom-step", { detail: event.payload }));
  }).catch((error: unknown) => console.error("MuseCodeIcon: zoom menu listen failed", error));
  // New Thread (Cmd+N) and Settings (Cmd+,) in the native menu bar, where macOS users and VoiceOver look for them.
  void listen<"new-thread" | "settings">("musecodeicon://menu", (event) => {
    window.dispatchEvent(new CustomEvent("musecodeicon-menu", { detail: event.payload }));
  }).catch((error: unknown) => console.error("MuseCodeIcon: menu listen failed", error));
}

/** Window controls for the desktop shell's frameless window; undefined in a browser. */
export function desktopFrame(): WindowFrame | undefined {
  if (window.__MUSECODEICON_FRAME__ !== "custom") {
    return undefined;
  }
  const win = getCurrentWindow();
  const run = (action: Promise<unknown>) => {
    action.catch((error: unknown) => console.error("MuseCodeIcon: window control failed", error));
  };
  return {
    minimize: () => run(win.minimize()),
    toggleMaximize: () => run(win.toggleMaximize()),
    close: () => run(win.close()),
    startDragging: () => run(win.startDragging()),
    isMaximized: () => win.isMaximized(),
    onResized: (callback) => {
      const pending = win.onResized(() => callback());
      pending.catch((error: unknown) => console.error("MuseCodeIcon: resize listener failed", error));
      return () => {
        pending.then(
          (unlisten) => unlisten(),
          () => undefined,
        );
      };
    },
  };
}
