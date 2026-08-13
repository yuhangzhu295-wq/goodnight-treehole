# 数据源审计

## API Base URL

- 前台 `apps/mp/src/api.ts`：`import.meta.env.VITE_API_BASE_URL ?? ''`。
- 后台 `apps/admin/src/api.ts`：`import.meta.env.VITE_API_BASE_URL ?? ''`，并携带 `goodnight-admin-token`。
- 当前开发启动时使用 `VITE_API_BASE_URL=http://127.0.0.1:3000`。

## 实际调用链

前台/后台页面 -> `@goodnight/api-sdk` -> `apps/api` Nest controllers -> `StoreService` -> JSON 文件持久化。

## 实际权威数据源

当前运行路径不是 Prisma Client。`apps/api/src/store.service.ts` 使用：

```ts
process.env.GOODNIGHT_STORE_FILE ?? 'data/goodnight-store.json'
```

并在进程内加载为 `StoreData`，所有写操作通过 `persist()` 原子写回 JSON 文件。

## 已发现的数据源类型

- JSON 文件：存在，且是当前实际权威数据源。
- 内存数组：存在，`StoreService` 进程内 `this.data`。
- seed store：存在，`seedData()` 和 `ensureSeedCoverage()`。
- Prisma schema：存在于 `prisma/schema.prisma`，但当前 API controller/service 未使用 Prisma Client。
- PostgreSQL/SQLite：当前运行链路未连接。
- localStorage：后台仅保存 admin token；前台不作为业务权威数据源。

## 前后台是否统一

当前前台和后台都通过同一个 `apps/api` 进程读写 `StoreService`，因此运行时共用同一个 JSON store。需要注意：如果测试脚本设置不同 `GOODNIGHT_STORE_FILE`，会生成隔离测试数据文件，这是测试隔离，不是生产数据源。

## 风险

文档要求优先 Prisma + PostgreSQL，但当前项目尚未接入 Prisma repository。为避免“假迁移”，本轮修复以现有 JSON store 为唯一权威源，并在报告中如实记录未完成 PostgreSQL 切换。
