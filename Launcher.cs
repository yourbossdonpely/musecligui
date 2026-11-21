using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Muse CLI GUI")]
[assembly: System.Reflection.AssemblyDescription("One-click launcher + first-run setup for the Muse CLI GUI")]
[assembly: System.Reflection.AssemblyVersion("3.1.0.0")]
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
        if (!File.Exists(bridge)) { Fail("Missing file: " + bridge); return 1; }
        if (!File.Exists(gui)) { Fail("Missing file: " + gui); return 1; }
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

    static void Fail(string msg) {
        MessageBox.Show(msg, "Muse CLI GUI", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
