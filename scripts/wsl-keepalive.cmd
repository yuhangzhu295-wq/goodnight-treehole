@echo off
rem Keeps the WSL2 distro that hosts this project's postgres/redis/minio from stopping between
rem commands. WSL tears a distro down once no client is attached; `vmIdleTimeout` in .wslconfig has
rem no effect on this WSL version, so a detached process inside the distro is what holds it open.
rem Registered as a scheduled task (GoodnightTreehole-WSL-Keepalive) every five minutes; remove with:
rem   schtasks /Delete /TN "GoodnightTreehole-WSL-Keepalive" /F
wsl.exe -d Ubuntu -e bash -lc "pgrep -f 'sleep 864000' >/dev/null || (setsid nohup sleep 864000 >/dev/null 2>&1 < /dev/null &)"
