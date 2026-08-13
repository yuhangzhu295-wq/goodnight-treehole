# 晚安树洞前台 01-05 第一轮交互合同

本合同只覆盖前台 01-05：

- 01-广场：`/pages/square/index`
- 02-写下心情：`/pages/mood/create`
- 03-树洞详情：`/pages/post/detail?id=:id`
- 04-树洞详情-回复抽屉：`/pages/post/detail?id=:id&sheet=reply`
- 05-今日回信：`/pages/letter/index`

## 约束

- 设计图只能作为视觉参考，不允许作为整图页面主体。
- 所有中文按钮必须是真实 DOM 控件。
- 禁止 `interaction-layer`、`hotspot`、`proxy-button`、`click-layer`、`test-layer`。
- 禁止可见英文测试词：`Rewrite`、`Rant`、`Heal`、`Sleep`、`Work`、`Future`、`Poster`、`Save`、`Clear data`、`Live backend sync ok`。
- 每次点击必须在 800ms 内产生 URL、DOM、drawer/dialog、network 或 store/db hash 至少一种变化。

## 合同文件

机器可读合同见：

`tests/contracts/front-first5-interactions.json`

字段说明：

- `page`：页面编号与语义。
- `designRef`：对应设计参考图。
- `route`：H5 路由。
- `visibleText`：用户肉眼看到的中文文本。
- `selector`：真实 DOM 控件的 `data-testid`。
- `expectedAction`：点击或输入动作。
- `expectedUrl`：预期 URL 变化或保持。
- `expectedApi`：预期接口。
- `expectedDomChange`：预期 DOM/状态变化。
- `expectedStoreChange`：预期持久化变化。
- `mustBeRealDomControl`：必须为 `true`。
- `forbidOverlayProxy`：必须为 `true`。

## 覆盖数量

- 01-广场：15 个真实控件。
- 02-写下心情：17 个真实控件。
- 03-树洞详情：13 个真实控件。
- 04-回复抽屉：10 个真实控件。
- 05-今日回信：9 个真实控件。

总计：64 个 first5 控件。
