import { Command } from "cmdk";
import { ArchiveIcon, ArrowClockwiseIcon, ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, ArrowsInIcon, ChartBarIcon, ChecksIcon, FolderIcon, FolderPlusIcon, GearSixIcon, GitBranchIcon, LinkIcon, MagnifyingGlassIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, MonitorIcon, MoonIcon, NotePencilIcon, ShieldSlashIcon, SidebarSimpleIcon, SpeakerHighIcon, SquareIcon, StackIcon, SunIcon, TrashIcon } from "../ui/icons.js";
import { useMemo, type ReactNode } from "react";
import { useApp, useController, useNow } from "../../app/context.js";
import { copyText } from "../../app/clipboard.js";
import { useImeGuard } from "../../app/ime.js";
import { speakText, stopSpeech } from "../../app/speech.js";
import { basename, relativeTime } from "../../model/format.js";
import { buildTurns } from "../../model/fold.js";
import { threadStatus } from "../../model/status.js";
import { collectFileChanges } from "../thread/items.js";
import { Modal } from "../ui/overlays.js";
import { MOD, NEW_THREAD_KEYS, Shortcut } from "../ui/primitives.js";
import { StatusGlyph } from "../ui/StatusGlyph.js";

const GROUP =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle";
const ITEM =
  "flex h-9 cursor-default items-center gap-3 rounded-lg px-2.5 text-sm text-fg outline-none select-none data-[selected=true]:bg-hover";

function Item(props: { value: string; keywords?: string[]; onSelect: () => void; icon: ReactNode; children: ReactNode; hint?: ReactNode; tone?: "default" | "danger" }) {
  return (
    <Command.Item value={props.value} keywords={props.keywords} onSelect={props.onSelect} className={ITEM}>
      <span className={`flex size-4 shrink-0 items-center justify-center ${props.tone === "danger" ? "text-danger-text" : "text-muted"}`}>{props.icon}</span>
      <span className={`flex min-w-0 flex-1 items-center gap-2 ${props.tone === "danger" ? "text-danger-text" : ""}`}>{props.children}</span>
      {props.hint ? <span className="shrink-0 text-xs text-subtle">{props.hint}</span> : null}
    </Command.Item>
  );
}

export function CommandPalette() {
  const ime = useImeGuard();
  const controller = useController();
  const open = useApp((s) => s.paletteOpen);
  const sessions = useApp((s) => s.sessions);
  const projects = useApp((s) => s.projects);
  const threads = useApp((s) => s.threads);
  const baseline = useApp((s) => s.prefs.baseline);
  const lastSeen = useApp((s) => s.prefs.lastSeen);
  const groupBy = useApp((s) => s.prefs.groupBy);
  const updates = useApp((s) => s.updates);
  const route = useApp((s) => s.route);
  const voice = useApp((s) => s.prefs.voice);
  const now = useNow(60_000, open);
  const currentId = route.kind === "thread" ? route.sessionId : null;
  const current = currentId ? (sessions[currentId] ?? null) : null;
  const fold = currentId ? (threads[currentId]?.fold ?? null) : null;
  const running = fold?.activeTurnId != null;
  const lastReply = useMemo(() => {
    if (!fold) {
      return null;
    }
    const finals = buildTurns(fold).filter((turn) => !turn.running && turn.final?.text?.trim());
    return finals.length > 0 ? finals[finals.length - 1]!.final! : null;
  }, [fold]);

  const shareCurrent = async () => {
    if (!currentId) {
      return;
    }
    const url = await controller.shareThread(currentId);
    if (!url) {
      return;
    }
    try {
      await copyText(url);
      controller.toast("success", "Share link copied", "The replay page stays up while this app runs.");
    } catch {
      controller.toast("info", "Share link ready", url);
    }
  };

  const checkCurrent = async () => {
    if (!currentId || !fold) {
      return;
    }
    const report = await controller.diagnoseFiles(
      currentId,
      collectFileChanges(fold.items.values()).map((file) => file.path),
    );
    if (!report) {
      return;
    }
    if (report.issues.length === 0) {
      controller.toast("success", "Syntax clean", `${report.checked} file${report.checked === 1 ? "" : "s"} checked.`);
      return;
    }
    const first = report.issues[0]!;
    controller.toast(
      "info",
      `${report.issues.length} syntax issue${report.issues.length === 1 ? "" : "s"}`,
      `${first.file}${first.line ? `:${first.line}` : ""} — ${first.message} [${first.tool}]`,
    );
  };

  const readCurrent = () => {
    if (!lastReply) {
      return;
    }
    if (!speakText(lastReply.text ?? "", voice?.uri || undefined, voice?.rate ?? 0.95, lastReply.itemId)) {
      controller.toast("info", "Speech unavailable", "This browser has no voice to read with.");
    }
  };

  const sorted = useMemo(
    () =>
      Object.values(sessions).sort((a, b) =>
        a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : a.activityAt < b.activityAt ? 1 : -1,
      ),
    [sessions],
  );

  const run = (action: () => void) => {
    controller.setPaletteOpen(false);
    action();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => controller.setPaletteOpen(next)}
      title="Search threads, projects and actions"
      hideTitle
      bare
      className="top-[12%] w-[min(620px,calc(100%-16px))] overflow-hidden"
    >
      <Command loop label="Search threads, projects and actions">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <MagnifyingGlassIcon size={16} className="shrink-0 text-subtle" />
          <Command.Input
            onCompositionStart={ime.onCompositionStart}
            onCompositionEnd={ime.onCompositionEnd}
            onKeyUp={ime.onKeyUp}
            onKeyDown={(event) => {
              // cmdk selects on Enter after compositionend in WebKit; stop IME keys before its root handler.
              if (ime.isImeKey(event)) {
                event.stopPropagation();
              }
            }}
            placeholder="Search threads, projects and actions"
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-subtle"
          />
        </div>
        <Command.List className="max-h-[min(440px,62vh)] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-10 text-center text-sm text-muted">Nothing matches that search.</Command.Empty>
          <Command.Group heading="Actions" className={GROUP}>
            <Item value="New thread" icon={<NotePencilIcon size={15} />} onSelect={() => run(() => controller.newThread())} hint={<Shortcut keys={NEW_THREAD_KEYS} />}>
              New thread
            </Item>
            <Item value="Add project folder" icon={<FolderPlusIcon size={15} />} onSelect={() => run(() => controller.setAddProjectOpen(true))}>
              Add project
            </Item>
            <Item value="Refresh threads from Muse" icon={<ArrowsClockwiseIcon size={15} />} onSelect={() => run(() => void controller.discoverAll())}>
              Refresh threads from Muse
            </Item>
            <Item
              value={groupBy === "project" ? "Group sidebar by status" : "Group sidebar by project"}
              icon={<StackIcon size={15} />}
              onSelect={() => run(() => controller.setGroupBy(groupBy === "project" ? "status" : "project"))}
            >
              {groupBy === "project" ? "Group sidebar by status" : "Group sidebar by project"}
            </Item>
            <Item value="Toggle sidebar" icon={<SidebarSimpleIcon size={15} />} onSelect={() => run(() => controller.toggleSidebar())} hint={<Shortcut keys={[MOD, "B"]} />}>
              Toggle sidebar
            </Item>
            <Item value="Theme system" keywords={["appearance"]} icon={<MonitorIcon size={15} />} onSelect={() => run(() => controller.setTheme("system"))}>
              Use system theme
            </Item>
            <Item value="Theme light" keywords={["appearance"]} icon={<SunIcon size={15} />} onSelect={() => run(() => controller.setTheme("light"))}>
              Use light theme
            </Item>
            <Item value="Theme dark" keywords={["appearance"]} icon={<MoonIcon size={15} />} onSelect={() => run(() => controller.setTheme("dark"))}>
              Use dark theme
            </Item>
            <Item value="Zoom in" keywords={["appearance", "bigger", "font size"]} icon={<MagnifyingGlassPlusIcon size={15} />} onSelect={() => run(() => controller.zoomIn())} hint={<Shortcut keys={[MOD, "+"]} />}>
              Zoom in
            </Item>
            <Item value="Zoom out" keywords={["appearance", "smaller", "font size"]} icon={<MagnifyingGlassMinusIcon size={15} />} onSelect={() => run(() => controller.zoomOut())} hint={<Shortcut keys={[MOD, "-"]} />}>
              Zoom out
            </Item>
            <Item value="Reset zoom" keywords={["appearance", "100%"]} icon={<ArrowCounterClockwiseIcon size={15} />} onSelect={() => run(() => controller.resetZoom())} hint={<Shortcut keys={[MOD, "0"]} />}>
              Reset zoom
            </Item>
            <Item
              value="Toggle compact density"
              keywords={["appearance", "density", "compact", "comfortable", "spacing"]}
              icon={<ArrowsInIcon size={15} />}
              onSelect={() => run(() => controller.toggleDensity())}
            >
              Toggle compact density
            </Item>
            {updates?.status === "ready" ? (
              <Item value="Restart to update" keywords={["update", "install", "version"]} icon={<ArrowClockwiseIcon size={15} />} onSelect={() => run(() => controller.restartToUpdate())}>
                Restart to install MuseCodeIcon {updates.update?.version ?? ""}
              </Item>
            ) : null}
            {updates ? (
              <Item value="Check for updates" keywords={["update", "version"]} icon={<ArrowsClockwiseIcon size={15} />} onSelect={() => run(() => controller.checkForUpdates())}>
                Check for updates
              </Item>
            ) : null}
          </Command.Group>
          <Command.Group heading="Pages" className={GROUP}>
            <Item value="Open settings" keywords={["preferences", "config"]} icon={<GearSixIcon size={15} />} onSelect={() => run(() => controller.navigate({ kind: "settings" }))}>
              Open settings
            </Item>
            <Item value="Open usage" keywords={["cost", "tokens", "spending"]} icon={<ChartBarIcon size={15} />} onSelect={() => run(() => controller.navigate({ kind: "usage" }))}>
              Open usage
            </Item>
          </Command.Group>
          {current && currentId ? (
            <Command.Group heading="Current thread" className={GROUP}>
              {running ? (
                <Item value="Stop the turn" keywords={["stop", "cancel", "interrupt"]} icon={<SquareIcon size={15} />} onSelect={() => run(() => { stopSpeech(); void controller.stop(currentId); })}>
                  Stop the turn
                </Item>
              ) : null}
              <Item value="Compact context" keywords={["summarize", "compress", "context"]} icon={<ArrowsInIcon size={15} />} onSelect={() => run(() => void controller.compact(currentId))}>
                Compact context
              </Item>
              {lastReply ? (
                <Item value="Read last reply aloud" keywords={["speak", "voice", "read"]} icon={<SpeakerHighIcon size={15} />} onSelect={() => run(readCurrent)}>
                  Read last reply aloud
                </Item>
              ) : null}
              <Item value="Copy share link" keywords={["share", "link", "replay"]} icon={<LinkIcon size={15} />} onSelect={() => run(() => void shareCurrent())}>
                Copy share link
              </Item>
              <Item value="Check syntax" keywords={["diagnostics", "lint", "typecheck"]} icon={<ChecksIcon size={15} />} onSelect={() => run(() => void checkCurrent())}>
                Check edited files
              </Item>
              <Item value="Fork thread" keywords={["branch", "duplicate", "copy"]} icon={<GitBranchIcon size={15} />} onSelect={() => run(() => void controller.fork(currentId))}>
                Fork thread
              </Item>
              <Item value="Archive thread" keywords={["hide", "shelve"]} icon={<ArchiveIcon size={15} />} onSelect={() => run(() => void controller.archive(currentId))}>
                Archive thread
              </Item>
              <Item
                value="Delete thread"
                keywords={["remove", "destroy"]}
                icon={<TrashIcon size={15} />}
                tone="danger"
                onSelect={() =>
                  run(() => {
                    if (window.confirm(`Delete "${current.title}"? This cannot be undone.`)) {
                      void controller.deleteThread(currentId);
                    }
                  })
                }
              >
                Delete thread
              </Item>
            </Command.Group>
          ) : null}
          {sorted.length > 0 ? (
            <Command.Group heading="Threads" className={GROUP}>
              {sorted.map((session) => {
                const status = threadStatus(session, {
                  fold: threads[session.sessionId]?.fold ?? null,
                  lastSeen: lastSeen[session.sessionId] ?? null,
                  baseline,
                  active: false,
                });
                return (
                  <Item
                    key={session.sessionId}
                    value={`${session.title} ${session.sessionId}`}
                    keywords={[basename(session.cwd)]}
                    icon={status === "idle" ? <span className="size-[7px] rounded-full bg-line-strong" /> : <StatusGlyph status={status} />}
                    onSelect={() => run(() => controller.openThread(session.sessionId))}
                    hint={relativeTime(session.activityAt, now)}
                  >
                    <span className="truncate">{session.title}</span>
                    {session.sandboxDisabled === true ? (
                      <span title="Sandbox off" className="flex shrink-0 items-center gap-1 text-warn-text">
                        <ShieldSlashIcon size={12} aria-hidden="true" />
                        <span className="sr-only">, sandbox off</span>
                      </span>
                    ) : null}
                    <span className="shrink-0 truncate text-xs text-subtle">{basename(session.cwd)}</span>
                  </Item>
                );
              })}
            </Command.Group>
          ) : null}
          {projects.length > 0 ? (
            <Command.Group heading="Projects" className={GROUP}>
              {projects.map((project) => (
                <Item
                  key={project.cwd}
                  value={`New thread in ${project.displayName} ${project.cwd}`}
                  icon={<FolderIcon size={15} />}
                  onSelect={() => run(() => controller.newThread(project.cwd))}
                >
                  <span className="truncate">New thread in {project.displayName}</span>
                  <span className="truncate text-xs text-subtle">{project.cwd}</span>
                </Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
      </Command>
    </Modal>
  );
}
