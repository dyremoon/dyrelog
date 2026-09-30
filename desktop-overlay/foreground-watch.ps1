$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DyrelogForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@
$lastProcessId = -1
while ($true) {
  $foregroundProcessId = [uint32]0
  $window = [DyrelogForeground]::GetForegroundWindow()
  [void][DyrelogForeground]::GetWindowThreadProcessId($window, [ref]$foregroundProcessId)
  # The process name is only looked up when the foreground process changes, so polling stays cheap.
  if ($foregroundProcessId -ne $lastProcessId) {
    $processName = ''
    try { $processName = (Get-Process -Id $foregroundProcessId -ErrorAction Stop).ProcessName } catch {}
    [Console]::Out.WriteLine("$foregroundProcessId|$processName")
    [Console]::Out.Flush()
    $lastProcessId = $foregroundProcessId
  }
  Start-Sleep -Milliseconds 100
}
