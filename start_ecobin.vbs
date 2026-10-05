Set objFSO = CreateObject("Scripting.FileSystemObject")
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strScriptPath

WshShell.Run "cmd.exe /k ""call .venv\Scripts\activate && python ecobin_server.py""", 1, False
WshShell.Run "cmd.exe /k ""call .venv\Scripts\activate && python camera_ecobin.py""", 1, False
WshShell.Run "cmd.exe /k npm.cmd run dev", 1, False
