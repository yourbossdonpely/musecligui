using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Muse CLI GUI")]
[assembly: System.Reflection.AssemblyDescription("One-click launcher for the Muse CLI GUI")]
[assembly: System.Reflection.AssemblyVersion("2.0.1.0")]

static class Launcher
{
    const int Port = 8765;

    [STAThread]
    static int Main()
    {
        string dir;
        try { dir = AppDomain.CurrentDomain.BaseDirectory; }
        catch (Exception ex) { Fail("Cannot find application folder: " + ex.Message); return 1; }
        string node = File.Exists(Path.Combine(dir, "node.exe")) ? Path.Combine(dir, "node.exe") : "node";
        string bridge = Path.Combine(dir, "muse-bridge.js");
        string gui = Path.Combine(dir, "muse-gui.html");
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
        try {
            var open = new ProcessStartInfo(gui);
            open.UseShellExecute = true;
            Process.Start(open);
        } catch (Exception ex) { Fail("Could not open the GUI: " + ex.Message); return 1; }
        return 0;
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