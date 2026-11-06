# 环境取证：WSL 每 ~60 秒整体重启（外部阻塞）

本文件只记录**实测事实**与**已排除的可能**，不给结论性猜测。它是
`MASTER_TASK_QUEUE.json` 中 `BLOCKED_ENVIRONMENT` 条目 `ENV-WSL-PERIODIC-RESTART`
的证据附件。

## 时间线（2026-10-19，UTC）

| 时刻 | 事件 | 证据 |
| --- | --- | --- |
| 02:59:xx | 全量套件跑到第 10/78 个文件后，此后每个文件的迁移都失败 | `[test-runner] Migration deploy failed: Error: P1017` |
| 03:11:31 | PostgreSQL 记录 "database system was shut down" | `docker logs --tail goodnight-treehole-postgres-1` |
| 03:12:22 | 同一条日志在启动后再次出现（即又停过一次） | 同上 |
| 03:20:38 | 再次 "database system was shut down" | 同上 |
| 03:23:44 | 容器 Finished；03:24:10 Started，ExitCode=0 | `docker inspect .State` |

`Exit=0` 与 "database system was shut down" 同时出现，说明容器是**被干净地停止**的，
不是 OOM、不是段错误、不是磁盘故障（三者分别会给出非 0 退出码、"server closed the
connection unexpectedly" 或 PostgreSQL 自己的 PANIC 日志）。

## 关键观察：所有容器同时重启

`docker ps --format '{{.RunningFor}}'` 显示 postgres、redis、minio 以及另一个项目的
sub2api-* 五个容器的 `RunningFor` 完全相同（"Up 2 minutes"）。也就是说被重启的不是
某个容器，而是 **WSL 里的整个 Docker Engine**，即 WSL VM 本身。

## 已排除

| 怀疑对象 | 排除依据 |
| --- | --- |
| `vmIdleTimeout`（WSL 空闲关机） | `~/.wslconfig` 已设为 `vmIdleTimeout=86400000`，且空闲停机不会每 60 秒一次 |
| 计划任务 | `schtasks /query /fo csv` 共 315 条，按 wsl/ubuntu/goodnight/docker 过滤只剩本项目自己注册的 `GoodnightTreeHoleWslKeepAlive` 一条 |
| 容器 `restart` 策略 | `docker inspect` 显示 `RestartCount=0`、策略 `unless-stopped`。若是重启策略触发，计数会增加 |
| 内存压力 | WSL 内 `free -m` 显示 7.4 GB 总量、可用 6.4 GB；`/proc/pressure/memory` 三项全 0 |
| PostgreSQL 自身 | 见上，退出码 0 |
| 异常关机 / 电源事件 | `System` 日志中 `Id=41,6008,1074` 在事发前 20 分钟内 0 条；`Get-WinEvent -ListLog *Lxss*` 无可用日志（该机 Lxss/Operational 未启用） |

## 复现特征

- 单文件运行（`vitest run tests/unit`，不需要租库）**稳定通过**：40/40。
- 单文件 `tsx scripts/test-runner.ts <一个文件>` 通常通过；`front-publish-private`、
  `batch1-multi-instance`、`admin-sync`、`batch1-action` 单独跑均通过。
- 一旦连续跑多个文件（每文件要租一个数据库、迁移 54 张表），第 2 到第 10 个文件之间
  必断。`Server has closed the connection` 出现在失败文件自己的第一条查询上。

## 影响

- **不能在本机声称"全量套件通过"**。任何在中断点之后计数的失败都是环境失败，不是回归。
- 已采用的工作方式：`scripts/run-suite-segmented.mjs`（段间做真实健康检查、断则修一次再重跑）
  与 `npx vitest run tests/unit`（不租库）。前者也有局限：`tests/business` 内部存在跨文件
  顺序依赖，拆段后 18 个文件失败而单文件全过。
- CI（GitHub Actions）是**不受本机环境影响**的验证路径；本机状态应以 CI 为准。

## 下一步（不属于本仓库可修范围）

需要在 Windows 侧确认：是否存在安全软件、电源策略或 WSL 相关维护动作周期性地回收该 VM。
本项目不修改系统设置，因此这一项记为 `BLOCKED_ENVIRONMENT`。
