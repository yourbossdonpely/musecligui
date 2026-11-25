import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MuseCodeIconApp, type MuseCodeIconClient } from "@musecodeicon/ui";
import { Connect } from "./Connect.js";
import { desktopFrame, titlebarOverlay, bindDesktopZoom } from "./frame.js";
import { bindDesktopLinks } from "./links.js";
import { appNotifier } from "./notifier.js";
import { desktopUpdater } from "./updater.js";
import { WebMuseCodeIconClient } from "./webClient.js";
import "./theme.css";

bindDesktopZoom();
bindDesktopLinks();

const root = document.getElementById("root");
if (!root) {
  throw new Error("MuseCodeIcon: missing #root element.");
}

/**
 * `#/connect` picks the daemon this page talks to. It is read before the app mounts, because the
 * client reads its address once at module load and every open stream belongs to that address.
 */
function Root({ makeClient }: { makeClient: () => MuseCodeIconClient }) {
  const [connecting, setConnecting] = useState(window.location.hash === "#/connect");
  if (connecting) {
    return (
      <Connect
        onDone={() => {
          setConnecting(false);
          // A reload, not a re-render: the client keeps its address and its stream from load time.
          window.location.replace(window.location.pathname);
        }}
      />
    );
  }
  return <MuseCodeIconApp client={makeClient()} frame={desktopFrame()} titlebarOverlay={titlebarOverlay()} notifier={appNotifier()} updater={desktopUpdater()} />;
}

/**
 * `npm run dev:demo` swaps the server for an in-memory client with sample projects and threads, so
 * the UI can be worked on without muse. The flag is fixed at build time, so release builds drop it.
 */
async function clientFactory(): Promise<() => MuseCodeIconClient> {
  if (import.meta.env.MODE === "demo") {
    const { DemoClient } = await import("./demo/client.js");
    return () => new DemoClient();
  }
  return () => new WebMuseCodeIconClient();
}

void clientFactory().then((makeClient) =>
  createRoot(root).render(
    <StrictMode>
      <Root makeClient={makeClient} />
    </StrictMode>,
  ),
);
