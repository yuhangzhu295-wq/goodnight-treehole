# 当前数据源审计

更新时间：2026-08-07

## 权威数据源

正式环境唯一权威数据源为 PostgreSQL `127.0.0.1:55432/goodnight_treehole`。用户端和管理端均通过同一个 NestJS API 读写，不各自维护业务数据。

Prisma 关系表覆盖 User、Mood、Post、Reply、Letter、Diary、Favorite、MediaAsset、FeedbackTicket、AIProvider、AIStyleRoute、AIJob、AuditLog 等；`RuntimeState` 用于兼容运行态整体快照，并由服务同步写入关系表。历史 JSON 只作迁移输入，不是正式运行源。

## 测试隔离

- API、business、cross、真实浏览器测试使用 `goodnight_treehole_test_*` 独立数据库。
- 视觉夹具使用 PostgreSQL `55433/goodnight_treehole_visual_v1` 和独立 uploads。
- 正式数据库与 `data/uploads` 在测试前后通过隔离检查保护。

## 当前直接证据

浏览器生成 `job_30bdc56c05` 后，API 和 Prisma 直接查询均得到 `succeeded`、`qwen2.5:7b-instruct-q4_K_M`、`1275ms`、`fallback=false`；数据库中启用的 Ollama Provider 为 7 个。
