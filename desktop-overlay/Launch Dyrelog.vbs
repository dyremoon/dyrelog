Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = scriptDir
' 0 hides the console; False starts the application without waiting for it to exit.
objShell.Run "cmd /c npm start", 0, False
