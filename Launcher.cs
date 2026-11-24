using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Muse CLI GUI")]
[assembly: System.Reflection.AssemblyDescription("One-click launcher + first-run setup for the Muse CLI GUI")]
[assembly: System.Reflection.AssemblyVersion("3.3.0.0")]
[assembly: System.Reflection.AssemblyCopyright("Copyright (c) 2026 yourbossdonpely")]

static class Launcher
{
    const int Port = 8765;

    [STAThread]
    static int Main()
    {
        string dir;
        try { dir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\'); }
        catch (Exception ex) { Fail("Cannot find application folder: " + ex.Message); return 1; }
        string setup = Path.Combine(dir, "setup.ps1");
        if (File.Exists(setup) && !RunSetup(setup, dir, 1)) return 1;
        string node = File.Exists(Path.Combine(dir, "node.exe")) ? Path.Combine(dir, "node.exe") : "node";
        string bridge = Path.Combine(dir, "muse-bridge.js");
        string gui = Path.Combine(dir, "gui", "dist", "index.html");
        if (!File.Exists(gui)) gui = Path.Combine(dir, "muse-gui.html");
        if (!File.Exists(bridge)) { Fail(LauncherOnly(bridge)); return 1; }
        if (!File.Exists(gui)) { Fail(LauncherOnly(gui)); return 1; }
        if (!PortOpen()) {
            try {
                var psi = new ProcessStartInfo(node, "\"" + bridge + "\"");
                psi.WorkingDirectory = dir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = false;
                Process.Start(psi);
            } catch (Exception ex) { Fail("Could not start the bridge (" + node + "): " + ex.Message); return 1; }
            bool up = false;
            for (int i = 0; i < 50; i++) { Thread.Sleep(500); if (PortOpen()) { up = true; break; } }
            if (!up) { Fail("The bridge did not start listening on port 8765. See the bridge window for errors."); return 1; }
        }
        if (File.Exists(setup) && !RunSetup(setup, dir, 2)) return 1;
        ShowWarnings(dir);
        OfferOpenCodeRestart(dir);
        try {
            var open = new ProcessStartInfo(gui);
            open.UseShellExecute = true;
            Process.Start(open);
        } catch (Exception ex) { Fail("Could not open the GUI: " + ex.Message); return 1; }
        return 0;
    }

    static bool RunSetup(string setup, string dir, int stage) {
        try {
            var psi = new ProcessStartInfo("powershell.exe",
                "-NoLogo -NoProfile -ExecutionPolicy Bypass -File \"" + setup + "\" -AppDir \"" + dir + "\" -Stage " + stage);
            psi.WorkingDirectory = dir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            var p = Process.Start(psi);
            p.WaitForExit();
            if (p.ExitCode != 0) {
                string msg = "Setup stage " + stage + " failed.";
                try {
                    string ef = Path.Combine(dir, ".setup-error.txt");
                    if (File.Exists(ef)) msg = File.ReadAllText(ef).Trim();
                } catch {}
                Fail(msg);
                return false;
            }
            return true;
        } catch (Exception ex) { Fail("Could not run setup: " + ex.Message); return false; }
    }

    static void ShowWarnings(string dir) {
        try {
            string wf = Path.Combine(dir, ".setup-warnings.txt");
            if (!File.Exists(wf)) return;
            string w = File.ReadAllText(wf).Trim();
            try { File.Delete(wf); } catch {}
            if (w.Length == 0) return;
            if (w.Length > 2000) w = w.Substring(0, 2000);
            MessageBox.Show(w, "Muse CLI GUI - Setup notes", MessageBoxButtons.OK, MessageBoxIcon.Information);
        } catch {}
    }

    static void OfferOpenCodeRestart(string dir) {
        string mf = Path.Combine(dir, ".setup-opencode-restart");
        string changed;
        try {
            if (!File.Exists(mf)) return;
            changed = File.ReadAllText(mf).Trim();
            try { File.Delete(mf); } catch {}
            if (changed.Length == 0) return;
        } catch { return; }
        if (changed.Length > 800) changed = changed.Substring(0, 800) + "\n...";
        var pick = MessageBox.Show(
            "OpenCode wiring changed:\n" + changed + "\n\nOpenCode only reads config at startup. Restart it now so the changes take effect? (Your sessions are saved.)",
            "Muse CLI GUI - Restart OpenCode?",
            MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (pick == DialogResult.Yes) RestartOpenCode();
    }

    static void RestartOpenCode() {
        try {
            string exe = null;
            try {
                var procs = Process.GetProcessesByName("OpenCode");
                if (procs.Length > 0) exe = procs[0].MainModule.FileName;
            } catch {}
            if (exe == null) {
                string std = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Programs", "ai.opencode.desktop", "OpenCode.exe");
                if (File.Exists(std)) exe = std;
            }
            foreach (var n in new string[] { "opencode-cli", "OpenCode" }) {
                try {
                    foreach (var p in Process.GetProcessesByName(n)) {
                        try { p.Kill(); } catch {}
                    }
                } catch {}
            }
            Thread.Sleep(3000);
            if (exe == null) { Fail("OpenCode was stopped, but I could not find OpenCode.exe to relaunch it. Please start it yourself."); return; }
            try {
                var psi = new ProcessStartInfo(exe);
                psi.UseShellExecute = true;
                Process.Start(psi);
            } catch (Exception ex) { Fail("OpenCode was stopped, but relaunch failed: " + ex.Message); }
        } catch (Exception ex) { Fail("Could not restart OpenCode: " + ex.Message); }
    }

    static bool PortOpen() {
        try {
            using (var c = new TcpClient()) {
                var r = c.BeginConnect("127.0.0.1", Port, null, null);
                if (!r.AsyncWaitHandle.WaitOne(400)) return false;
                c.EndConnect(r);
                return true;
            }
        } catch { return false; }
    }

    /// The exe is downloadable on its own from the releases page, where it is the only Windows-looking file.
    /// Run like that it has nothing to launch, so say what it needs and where the rest of it is, instead of
    /// naming one missing path and leaving the reader to guess.
    static string LauncherOnly(string missing) {
        return "This is MuseCLIGUI.exe, the launcher by itself, so it has nothing to start.\n\n"
             + "It needs muse-bridge.js and the gui folder from MuseCLIGUI-v2.6.2-win-x64.zip beside it.\n\n"
             + "Missing: " + missing + "\n\n"
             + "Download MuseCLIGUI-v2.6.2-win-x64.zip from\n"
             + "https://github.com/yourbossdonpely/musecligui/releases/tag/v2.6.2\n"
             + "then unzip it and run the MuseCLIGUI.exe inside the unzipped folder.";
    }

    static void Fail(string msg) {
        MessageBox.Show(msg, "Muse CLI GUI", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
