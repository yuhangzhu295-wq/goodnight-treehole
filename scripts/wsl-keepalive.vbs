' Keep the WSL2 distro hosting postgres/redis/minio from idling out.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "wsl.exe -d Ubuntu -e bash -lc ""pgrep -f 'sleep 864000' >/dev/null || setsid nohup sleep 864000 >/dev/null 2>&1 < /dev/null &""", 0, False
