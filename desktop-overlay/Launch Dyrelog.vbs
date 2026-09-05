' Launches the Dyrelog overlay without opening a visible command-prompt
' window — double-click this file from File Explorer (or right-click it >
' "Send to > Desktop (create shortcut)", or pin that shortcut to your
' taskbar/Start menu) any time you want to start the app.
'
' Under the hood this just runs the same "npm start" you'd type into a
' terminal — see package.json's "start" script (syncs eqp-core.js, then
' launches Electron) — but as a hidden, detached process, so there's no
' console window to keep open and nothing to accidentally close. If
' Dyrelog doesn't open within a few seconds, something went wrong before
' Electron's own window could appear (e.g. `npm install` was never run in
' this folder, or Node/npm isn't installed) — in that case, open a real
' command prompt in this folder and run "npm start" directly so you can
' actually see the error.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = scriptDir
' 0 = hidden window, False = don't wait for it to exit (so double-clicking
' this returns control to Explorer immediately instead of appearing to hang).
objShell.Run "cmd /c npm start", 0, False
