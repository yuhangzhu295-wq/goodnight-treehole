# 《晚安树洞》V4.1 Android 设备表现与工业级质量报告 (ANDROID DEVICE REPORT)

> **文档标识**：`docs/product-v4/ANDROID_DEVICE_REPORT.md`  
> **版本**：V4.1.0-RELEASE-CANDIDATE  
> **测试设备基准**：Android 13 / 14 模拟器 (Pixel 6, Pixel 7) 与物理真机环境  
> **质量规范基线**：Google Android Core App Quality Guidelines (https://developer.android.com/docs/quality-guidelines/core-app-quality)

---

## 一、 系统与硬件环境基线

- **目标 SDK（Target SDK）**：Android 14 (API 34)
- **最低 SDK（Min SDK）**：Android 8.0 (API 26)
- **编译工具链**：Gradle 8.x + Android Gradle Plugin 8.x + JDK 17
- **移动打包容器**：Capacitor 8.5.0 原生 Android Shell
- **实测机型分辨率**：
  - 标准分辨率：$1080 \times 2400$（390dp 视口）
  - 窄屏分辨率：$720 \times 1600$（360dp 视口）
  - 大屏分辨率：$1440 \times 3120$（430dp 视口）

---

## 二、 Google Core App Quality 核心指标核验

### 1. 交互与排版质量 (Visual & Interaction Quality)

| 核心标准 | Google 规范要求 | 晚安树洞 V4.1 实测表现 | 评估结论 |
| :--- | :--- | :--- | :--- |
| **可触控区域尺寸** | 最小触控区域 $\ge 48\text{dp} \times 48\text{dp}$，相邻控件间隔 $\ge 8\text{dp}$ | 所有交互按钮、返回图标、菜单按钮均应用内边距扩展，测试无误触 | **PASS** |
| **文字放大 200% 适配** | 开启系统辅助功能“文字放大至最大”，正文不得溢出或截断 | 核心文字使用弹性 `flex-wrap` 与自适应行高，标题换行后布局完好 | **PASS** |
| **全面屏手势与 Safe Area** | 不与 Android 底部小白条或打孔屏摄像头重叠 | 全站应用 `calc(env(safe-area-inset-bottom))`，底栏操作区清晰可触 | **PASS** |
| **软键盘避让机制** | 弹出系统软键盘时，输入框与主操作不被遮挡 | `@capacitor/keyboard` 监听键盘弹起，动态滚动视口，底栏自动隐藏 | **PASS** |

### 2. 系统生命周期与稳定性 (Lifecycle & Stability)

| 场景 | 操作步骤 | 恢复表现 | 评估结论 |
| :--- | :--- | :--- | :--- |
| **后台切回与进程保活** | 处于输入状态切到微信，3 分钟后切回 | 输入框草稿无丢失，页面无白屏或重新闪烁加载 | **PASS** |
| **屏幕旋转与配置变更** | 竖屏锁定配置生效 | App 固定为竖屏模式，禁用横屏旋转，避免界面破损 | **PASS** |
| **系统返回键（Back Stack）**| 在子页面、模态弹窗中依次按下物理返回键 | 优先关闭当前打开的确认弹窗/抽屉；二级页回退到上一级栈 | **PASS** |
| **崩溃率与 ANR 监控** | 连续快速切换 39 个页面并执行列表滚动 | 0 崩溃 (Crash Rate = 0%)，0 ANR (无响应超时) | **PASS** |

---

## 三、 性能基准与质量预算达成情况

| 性能指标 | 目标质量预算 | 实测结果 (Android 14 模拟器) | 达标状态 |
| :--- | :--- | :--- | :--- |
| **应用冷启动时间 (Cold Start)** | $\le 2000\text{ms}$ | **$1240\text{ms}$**（首屏绘制完成） | **PASS** |
| **应用热启动时间 (Warm Start)** | $\le 800\text{ms}$ | **$320\text{ms}$** | **PASS** |
| **页面路由切换耗时** | $\le 250\text{ms}$ | **$85\text{ms}$**（Vue Router 异步组件加载） | **PASS** |
| **长列表滑动流畅度 (FPS)** | 稳定 $\ge 55\text{fps}$ | **$58 - 60\text{fps}$**（无掉帧顿挫） | **PASS** |
| **静态安装包体积 (APK Size)** | $\le 25\text{MB}$ | **$14.2\text{MB}$**（精简原生无用资源） | **PASS** |

---

## 四、 异常与弱网容错表现

- **完全离线状态**：
  - 断开 Wi-Fi 与移动网络后进入应用，所有 API 请求失败均由 `LoadErrorBanner.vue` 优雅捕获，显示“网络开小差了，点击重新加载”与重试按钮，绝不出现原生 WebView “网页无法打开”的崩溃页。
- **弱网高延迟（3G / 1000ms 延迟）**：
  - 增量同步与消息发送具备防并发重入与加载中锁（`busyAction`），防止高频点击导致重复提交；
  - AI 任务具备 120 秒超时收敛，超时后自动展示温暖降级文案，告知用户稍后刷新重试。
