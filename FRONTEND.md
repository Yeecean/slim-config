# Slim Config - 前端开发文档

## 1. 项目概述

为 OpenCode 的 oh-my-opencode-slim（简称 omo-slim）插件提供图形化配置界面。用户通过 UI 管理 API 预设（Preset）、Agent 模型分配、自定义 Agent、以及 Companion 伙伴动画等配置。

**前端/后端分离架构：**
- **后端（已完成）**: Python FastAPI，负责读取/写入/校验配置文件
- **前端（你的任务）**: 消费 REST API，提供美观的中文图形界面

**配置文件路径（后端自动处理）：**
- `~/.config/opencode/opencode.jsonc` — 只读，提供 providers 和 models 列表
- `~/.config/opencode/oh-my-opencode-slim.json` — 读写，目标配置文件

---

## 2. 后端 API 规范

**基础 URL:** `http://127.0.0.1:8080`

**统一响应格式:**
```json
{ "ok": true, "data": { ... } }
```

**错误响应:**
```json
{ "ok": false, "error": "中文错误描述" }
```

**OpenAPI 文档:** 后端启动后访问 `http://127.0.0.1:8080/docs`，可在线测试所有接口。

---

### 2.1 GET /api/status — 服务器状态

检测后端是否就绪，获取配置路径信息。

```json
{
  "ok": true,
  "data": {
    "version": "1.0.0",
    "config_dir": "C:\\Users\\Haoyang\\.config\\opencode",
    "slim_config_path": "C:\\Users\\Haoyang\\.config\\opencode\\oh-my-opencode-slim.json",
    "opencode_config_path": "C:\\Users\\Haoyang\\.config\\opencode\\opencode.jsonc"
  }
}
```

---

### 2.2 GET /api/providers — 获取所有可用的 Provider 和 Model

从 `opencode.jsonc` 中读取所有已配置的 API 提供商及其可用模型。用于 Agent 配置时的模型下拉选择。

```json
{
  "ok": true,
  "data": {
    "providers": [
      {
        "id": "new-api",
        "name": "New-API",
        "models": [
          { "id": "claude-sonnet-5", "name": "ClaudeSonnet5 [#8]" },
          { "id": "deepseek-chat", "name": "DeepseekChat [#2]" }
        ]
      },
      {
        "id": "volcengine-plan",
        "name": "Volcano Engine（Responses API）",
        "models": [
          { "id": "ark-code-latest", "name": "ark-code-latest" },
          { "id": "deepseek-v4-flash", "name": "deepseek-v4-flash" }
        ]
      }
    ]
  }
}
```

**前端使用方式：** 在 Agent 配置中选择模型时，展示为 `provider名 / 模型名`（如 `New-API / ClaudeSonnet5`），实际保存值为 `provider_id/model_id`（如 `new-api/claude-sonnet-5`）。

---

### 2.3 GET /api/config — 获取完整配置

读取 `oh-my-opencode-slim.json` 的完整内容。

```json
{
  "ok": true,
  "data": {
    "preset": "new-api",
    "presets": {
      "new-api": {
        "orchestrator": {
          "model": "new-api/claude-sonnet-5",
          "variant": "high",
          "temperature": 0.3,
          "skills": ["*"],
          "mcps": ["*", "!context7"]
        },
        "oracle": { "model": "new-api/claude-sonnet-5", "variant": "high", "temperature": 0.2, "skills": ["simplify"], "mcps": [] },
        "councillor": { "model": "new-api/kimi-k2.6", "variant": "high", "temperature": 0.5, "skills": [], "mcps": [] },
        "librarian": { "model": "new-api/deepseek-chat", "variant": "low", "temperature": 0.1, "skills": [], "mcps": ["websearch", "context7", "gh_grep"] },
        "explorer": { "model": "new-api/deepseek-v4-flash", "variant": "low", "temperature": 0.1, "skills": [], "mcps": [] },
        "designer": { "model": "new-api/gpt-5.5", "variant": "medium", "temperature": 0.8, "skills": [], "mcps": [] },
        "fixer": { "model": "new-api/gpt-5.4-mini", "variant": "low", "temperature": 0.2, "skills": [], "mcps": [] },
        "observer": { "model": "new-api/deepseek-v4-flash-none", "variant": "low", "temperature": 0.1, "skills": [], "mcps": [] }
      }
    },
    "agents": {},
    "companion": {
      "enabled": true,
      "position": "bottom-right",
      "size": "medium",
      "gifPack": "default",
      "loopStyle": "classic",
      "speed": 1,
      "debug": false
    }
  }
}
```

---

### 2.4 PUT /api/config — 写入完整配置

全量替换配置（前端可先 GET 再修改再 PUT）。请求体结构与 GET 返回的 `data` 字段一致。

**后台自动校验规则：**

| 字段 | 校验 | 前端控件 |
|---|---|---|
| `temperature` | 0.0 ~ 2.0，步长 0.1 | 滑块 + 数字输入 |
| `variant` | 只能是 `high` / `medium` / `low` | 单选下拉 |
| `speed` (companion) | 0.25 ~ 4.0，步长 0.25 | 滑块 |
| `position` | 四选一 | 图标按钮组 |
| `size` | `small` / `medium` / `large` | 三选一按钮组 |
| `loopStyle` | `classic` / `smooth` | 二选一切换 |

校验失败响应：
```json
{ "ok": false, "error": "校验失败：orchestrator.temperature 值 5.0 超出范围 0.0 ~ 2.0" }
```

---

### 2.5 GET /api/presets — 获取所有 Preset

返回所有 preset 的概要列表。

```json
{
  "ok": true,
  "data": {
    "presets": {
      "new-api": { "orchestrator": { "model": "...", "variant": "high" }, "oracle": { ... }, ... },
      "new-api-budget": { ... },
      "new-api-free": { ... },
      "opencode-go": { ... }
    },
    "active": "new-api"
  }
}
```

---

### 2.6 PUT /api/active-preset — 切换激活的 Preset

```json
{ "preset": "new-api-budget" }
```

校验：对应的 preset 必须存在于 `presets` 中。

---

### 2.7 POST /api/presets — 新建 Preset

```json
{
  "name": "my-custom-preset",
  "agents": {
    "orchestrator": { "model": "new-api/gpt-5.5", "variant": "high", "temperature": 0.3, "skills": ["*"], "mcps": ["*"] },
    "explorer": { "model": "new-api/deepseek-v4-flash", "variant": "low" }
  }
}
```

校验：name 不能与已有 preset 重复。

---

### 2.8 PUT /api/presets/{name} — 修改单个 Preset

请求体与 preset 内结构一致（`dict[string, AgentConfig]`）。

---

### 2.9 DELETE /api/presets/{name} — 删除 Preset

校验：不能删除当前激活的 preset（返回错误）。

---

### 2.10 GET /api/agents — 获取自定义 Agents

```json
{
  "ok": true,
  "data": {
    "agents": {
      "api-reviewer": {
        "model": "new-api/claude-sonnet-5",
        "variant": "high",
        "temperature": 0.3,
        "prompt": "你审查 API 设计...",
        "orchestratorPrompt": "Delegate to @api-reviewer for API contract changes...",
        "skills": [],
        "mcps": []
      }
    }
  }
}
```

---

### 2.11 PUT /api/agents/{name} — 创建或修改自定义 Agent

```json
{
  "model": "new-api/claude-sonnet-5",
  "variant": "high",
  "temperature": 0.3,
  "prompt": "自定义 Agent 的系统提示词",
  "orchestratorPrompt": "告诉 Orchestrator 何时调用此 Agent",
  "skills": [],
  "mcps": []
}
```

---

### 2.12 DELETE /api/agents/{name} — 删除自定义 Agent

---

### 2.13 GET /api/companion — 获取 Companion 配置

```json
{
  "ok": true,
  "data": {
    "enabled": true,
    "position": "bottom-right",
    "size": "medium",
    "gifPack": "default",
    "loopStyle": "classic",
    "speed": 1,
    "debug": false
  }
}
```

---

### 2.14 PUT /api/companion — 修改 Companion 配置

请求体与 GET 返回结构相同，只传需要修改的字段即可。

---

### 2.15 POST /api/shutdown — 关闭服务器

前端"退出"按钮调用此接口，后端优雅退出。

```json
{ "ok": true, "data": { "message": "服务器正在关闭..." } }
```

调用后 HTTP 服务停止。前端应检测连接断开后提示用户"已安全退出，可以关闭页面"。

---

### 2.16 POST /api/validate — 校验配置

在不写入的情况下检查配置是否合法。请求体与 `PUT /api/config` 相同。

**增强功能：** 此外还会自动检查以下兼容性问题：
- 非 vision 模型分配给 `observer` agent 时发出警告

成功：`{ "ok": true, "data": { "valid": true } }`
失败：`{ "ok": false, "error": "校验失败：xxx" }`

---

### 2.17 GET /api/models/{provider_id}/{model_id} — 获取模型元数据

返回模型的推理等级、视觉能力、context window 等信息。

**响应示例：**
```json
{
  "ok": true,
  "data": {
    "model_id": "new-api/deepseek-v4-flash",
    "reasoning_level": "default",
    "reasoning_label": "默认推理",
    "vision_support": false,
    "context_window": 1024000,
    "available_variants": [
      { "model_id": "deepseek-v4-flash-none", "suffix": "-none", "reasoning": "none", "reasoning_label": "无推理" },
      { "model_id": "deepseek-v4-flash", "suffix": "", "reasoning": "default", "reasoning_label": "默认推理" },
      { "model_id": "deepseek-v4-flash-max", "suffix": "-max", "reasoning": "max", "reasoning_label": "最大推理" }
    ]
  }
}
```

### 2.18 GET /api/providers/sync/diff — 对比 New-API 模型列表

调用 New-API 面板的 `/v1/models` 接口，对比当前 `opencode.jsonc` 中配置的模型列表，返回差异。

```json
{
  "ok": true,
  "data": {
    "to_add": [{ "id": "new-model-1", "name": "new-model-1" }],
    "to_remove": [{ "id": "old-deleted-model" }],
    "current_count": 50,
    "remote_count": 52
  }
}
```

### 2.19 POST /api/providers/sync/apply — 应用模型同步

将新模型写入 `opencode.jsonc`。

**请求体：**
```json
{
  "to_add": [{ "id": "new-model-1", "name": "new-model-1" }]
}
```

---

## 3. 内置 Agent 名称（固定不变，共 8 个）

| 键名 | 中文名称 | 功能 |
|---|---|---|
| `orchestrator` | 主控器 | 总体调度、分配任务 |
| `oracle` | 顾问 | 架构设计、调试、代码审查 |
| `councillor` | 评议员 | 评审委员会 |
| `librarian` | 图书馆员 | 文档搜索、库研究 |
| `explorer` | 探索者 | 代码库搜索 |
| `designer` | 设计师 | UI/UX 实现 |
| `fixer` | 修复者 | 快速实现 |
| `observer` | 观察者 | 视觉/多模态任务 |

---

## 4. 设计语言 — Apple Design System

**所有界面必须遵循 Apple Human Interface Guidelines 风格。**

### 4.1 色彩

| 用途 | 色值 |
|---|---|
| 背景 | `#F5F5F7`（浅灰） |
| 卡片/面板 | `#FFFFFF` |
| 强调色 (Accent) | `#007AFF` 柔化版 `#0066D9` |
| 主文字 | `#1D1D1F` |
| 次要文字 | `#86868B` |
| 分割/边框 | `rgba(0,0,0,0.05)` 或 `#E5E5EA` |
| 危险/删除 | `#FF3B30` |

- 仅使用 **1 个强调色**，禁用高饱和霓虹色
- 深色模式可选，但首版只做浅色

### 4.2 字体

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif;
```

| 层级 | 字重 | 字号 |
|---|---|---|
| 页面标题 | 700 | 24-28px |
| 卡片标题 | 600 | 16-18px |
| 正文/标签 | 400-500 | 13-15px |
| 辅助文字 | 400 | 11-12px |
| 行高 | 1.5-1.6 | — |

### 4.3 圆角

| 元素 | 圆角 |
|---|---|
| 按钮 | 8-12px |
| 输入框 | 10px |
| 卡片/面板 | 16-20px |
| 模态窗口 | 20-24px |

避免锐角（0px）和过度圆角（超过 24px）。

### 4.4 阴影

仅使用弥散阴影（Diffuse Shadow），禁用浓重黑色阴影：

```css
/* 卡片 */
box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);

/* 浮动面板/模态 */
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);

/* 悬停提亮 */
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
```

### 4.5 毛玻璃（Frosted Glass）

仅在顶部导航或浮动面板使用：

```css
background: rgba(255, 255, 255, 0.75);
backdrop-filter: blur(20px) saturate(180%);
-webkit-backdrop-filter: blur(20px) saturate(180%);
```

### 4.6 留白与布局

- 遵循 **8pt 网格系统**
- 元素间距最小 16px，段落间 24-32px
- 宁可过度留白，不要拥挤
- 桌面端内容区 `max-width: 1200px` 居中
- 分层通过阴影、背景色温差异和 `1px rgba(0,0,0,0.05)` 边框构建，而非生硬的分割线

### 4.7 交互与动效

| 规则 | 值 |
|---|---|
| Hover 状态 | 轻微提亮或 `transform: scale(1.02)` |
| Active 响应时间 | < 100ms |
| 动画曲线 | `ease-out` |
| 动画时长 | 200-300ms |
| 页面切换 | 淡入 + 上移（`translateY(8px) → translateY(0)`） |

### 4.8 控件规格

| 控件 | 规格 |
|---|---|
| 按钮高度 | 36-44px |
| 开关 | 圆角矩形（非圆形） |
| 输入框 | 1px 边框 + 底部内阴影 |
| 图标 | 线性风格，Stroke 1.5-2px，圆角端点 |

### 4.9 图标

- 使用 [Lucide](https://lucide.dev) 或 [Heroicons Outline](https://heroicons.com) 图标库
- 线性风格，Stroke 1.5-2px，圆角端点
- 同一页面内图标视觉重量保持一致

---

## 5. 页面与交互设计

### 5.1 语言
- **全部界面文字使用中文（简体）**
- 专有术语保留英文：agent / preset / provider / model / variant / skills / MCPs
- 后端返回的错误提示已是中文，直接展示给用户

### 5.2 主界面布局

```
+--------------------------------------------------------------------+
| [毛玻璃导航栏]  Slim Config — OpenCode API 配置工具          [关闭] |
+--------------------------------------------------------------------+
|                                                                    |
|  [侧边栏]  ← 240px →        |  [主内容区]                         |
|                             |                                      |
|    ○ Presets                |    (根据导航切换展示不同内容)         |
|    ○ Agents                 |                                      |
|    ○ Companion              |                                      |
|    ○ 关于                   |                                      |
|                             |                                      |
|  ───────────────────────    |                                      |
|  状态: ● 运行中             |                                      |
|  配置: ~/.config/...        |                                      |
|                             |                                      |
+--------------------------------------------------------------------+
```

### 5.3 Preset 编辑页面（核心功能）

**布局：**
- 左侧 sidebar：preset 列表，每个 preset 一个卡片，当前激活的高亮标记
- 底部有「+ 新建 Preset」按钮
- 右侧主内容区：当前选中 preset 下 8 个 agent 的配置卡片，按网格排列（2列或3列）

**每个 Agent 卡片：**
```
┌─────────────────────────────────┐
│ 主控器 (orchestrator)           │ ← 中文名称 + 英文键名
│                                 │
│  模型      [New-API / Claude... ▼]
│  变体      ○ high  ○ medium  ○ low
│  温度      [═══●═══════════] 0.3
│  Skills    [*  ✕] [+ 添加]
│  MCPs      [*  ✕] [!context7  ✕] [+ 添加]
│                                 │
│  [校验]  [保存]                  │
└─────────────────────────────────┘
```

- 每个 preset 顶部有「激活此 Preset」按钮和整体「保存」按钮
- 切换 preset 时如有未保存修改，弹出确认

### 5.4 模型选择器（级联下拉）
1. 先选 Provider（如 "New-API"）
2. 再选 Model（如 "ClaudeSonnet5 [#8]"）
3. 最终值保存为 `new-api/claude-sonnet-5`

### 5.5 模型详情面板

选中模型后，在模型下拉下方或侧边展示模型详情信息卡片：

```
┌──────────────────────────────────┐
│  模型详情                         │
│                                  │
│  推理等级    ● 默认推理           │
│  视觉能力    ✕ 不支持             │
│  上下文窗口  1,024,000 tokens     │
│                                  │
│  可用变体:                        │
│  ○ deepseek-v4-flash-none  无推理 │
│  ● deepseek-v4-flash       默认  │ ← 当前选中
│  ○ deepseek-v4-flash-max   最大  │
│                                  │
│  [点击查看所有可用变体 →]          │
└──────────────────────────────────┘
```

**推理等级对照表：**

| 等级 | 说明 |
|---|---|
| `none` | 无推理（最快，适合简单任务） |
| `default` | 默认推理（平衡速度与质量） |
| `high` | 高推理（适合复杂任务） |
| `max` | 最大推理（最慢但最准，适合深度推理） |
| `low` | 低推理（快速响应） |

详情数据来自 `GET /api/models/{provider_id}/{model_id}`。

### 5.6 模型同步功能（侧边栏底部）

在侧边栏底部添加「同步模型」入口：

```
┌──────────────────────┐
│  ● 运行中             │
│  ~/.config/...        │
│                      │
│  [🔄 从 New-API 同步] │ ← 同步按钮
└──────────────────────┘
```

点击后流程：
1. 调用 `GET /api/providers/sync/diff` 获取差异
2. 弹窗展示新增/缺失的模型列表
3. 用户确认后调用 `POST /api/providers/sync/apply` 写入
4. 刷新模型列表 UI

### 5.7 Skills / MCPs 输入
使用可自由输入的多选标签组件（tag input），预设常见选项做自动补全：

- `skills`: `["*", "simplify", "codemap", "diagnosing-bugs", "code-review", "deepwork"]`
- `mcps`: `["*", "!context7", "websearch", "context7", "gh_grep"]`

支持 `["*", "!xxx"]` 排除语法，在标签中用特殊颜色标记排除项。

### 5.8 编辑流程
```
1. 用户修改任意配置
2. 点击"校验"按钮 → POST /api/validate → 显示校验结果
3. 点击"保存"按钮 → PUT /api/config → 成功/失败提示
4. 保存成功后实时更新界面
```

### 5.9 退出流程
```
1. 用户点击右上角"关闭"
2. 若有未保存修改 → 确认弹窗："有未保存的修改，确定退出吗？"
3. 确认后 → POST /api/shutdown
4. 检测到连接断开 → 显示"已安全退出，可以关闭此页面"
5. 用户手动关闭标签页
```

---

## 6. 数据模型汇总（前端需实现的完整边界）

### AgentConfig

| 字段 | 类型 | 限制 | 控件建议 |
|---|---|---|---|
| `model` | string | 格式: `provider_id/model_id` | 级联下拉（先选 provider 再选 model） |
| `variant` | string | 自由字符串（如 `high`/`medium`/`low`/`max`/`none`），无枚举限制 | 单选按钮组或下拉，可自定义输入 |
| `temperature` | number | 0.0 ~ 2.0, step 0.1 | 滑块 + 数字输入框 |
| `skills` | string[] | — | 可输入标签多选 |
| `mcps` | string[] | — | 可输入标签多选 |

### CustomAgent（额外字段）

| 字段 | 类型 | 控件建议 |
|---|---|---|
| `prompt` | string | 多行文本域 |
| `orchestratorPrompt` | string | 多行文本域 |
| `displayName` | string | 文本输入框 |

### CompanionConfig

| 字段 | 类型 | 限制 | 控件建议 |
|---|---|---|---|
| `enabled` | boolean | — | 开关 |
| `position` | string | `bottom-right/bottom-left/top-right/top-left` | 四角图标选择 |
| `size` | string | `small/medium/large` | 三选一按钮组 |
| `loopStyle` | string | `classic/smooth` | 二选一切换按钮 |
| `speed` | number | 0.25 ~ 4.0, step 0.25 | 滑块 |
| `debug` | boolean | — | 开关 |
| `gifPack` | string | `default`（仅此值） | 只读展示 |

---

## 7. 启动与访问

```
后端: cd backend && uvicorn main:app --port 8080 --host 127.0.0.1
前端: cd frontend && npm run dev   (# 代理 /api/* 到 http://127.0.0.1:8080)
```

生产构建：前端构建后的静态文件放入 `backend/static/` 目录，由后端统一 serve。

---

## 8. 注意事项

1. 所有 enum 字段严格限定值，前端不应让用户输入非法值
2. `skills` 和 `mcps` 为空数组 = 不允许任何，`["*"]` = 全部允许，`["*", "!xxx"]` = 除 xxx 外全部允许
3. 保存按钮需防抖，避免短时间内多次写入
4. 删除 preset 时若该 preset 是当前激活的，弹窗提示先切换到其他 preset
5. 模型值为空时前端应展示占位符"未配置"

---

## 9. 技术栈建议

| 领域 | 推荐 |
|---|---|
| 框架 | React + TypeScript |
| 构建 | Vite |
| 样式 | Tailwind CSS（配合 Apple Design System 自定义配置） |
| 图标 | [Lucide React](https://lucide.dev)（线性风格，Stroke 1.5-2px） |
| 滑块控件 | `rc-slider`（轻量，可定制） |
| HTTP | fetch 或 axios |

无需状态管理库、无需路由库（单页足够）、无需 SSG/SSR。

### Tailwind CSS 自定义配置要点

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        apple: {
          bg: '#F5F5F7',
          card: '#FFFFFF',
          accent: '#0066D9',
          text: '#1D1D1F',
          secondary: '#86868B',
          border: 'rgba(0,0,0,0.05)',
          danger: '#FF3B30',
        },
      },
      borderRadius: {
        'btn': '10px',
        'card': '18px',
        'modal': '22px',
      },
      boxShadow: {
        'apple-sm': '0 4px 24px rgba(0,0,0,0.04)',
        'apple-md': '0 8px 32px rgba(0,0,0,0.06)',
        'apple-lg': '0 12px 40px rgba(0,0,0,0.08)',
      },
      fontFamily: {
        apple: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Inter"', 'sans-serif'],
      },
      spacing: {
        '4.5': '1.125rem',  // 18px (8pt grid alignment)
        '9.5': '2.375rem',  // 38px (button height)
      },
    },
  },
}
```
