$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DyrelogForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@
$lastState = ''
while ($true) {
  $foregroundProcessId = [uint32]0
  $window = [DyrelogForeground]::GetForegroundWindow()
  [void][DyrelogForeground]::GetWindowThreadProcessId($window, [ref]$foregroundProcessId)
  $processName = ''
  try { $processName = (Get-Process -Id $foregroundProcessId -ErrorAction Stop).ProcessName } catch {}
  $state = "$foregroundProcessId|$processName"
  if ($state -ne $lastState) {
    [Console]::Out.WriteLine($state)
    [Console]::Out.Flush()
    $lastState = $state
  }
  Start-Sleep -Milliseconds 200
}
