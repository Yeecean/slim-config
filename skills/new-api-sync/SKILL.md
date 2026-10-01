---
name: new-api-sync
description: 让前端 React 应用直接读取和操作 OpenCode 配置文件，实现 New-API 模型同步功能。构建同步 UI 时加载此 skill。
---

# New-API 模型同步 — 前端 AI Skill

你作为前端 AI，需要将 New-API 面板的模型同步功能构建到 React 应用中。所有数据操作均通过后端 API 完成，前端直接调用即可，无需经过其他 AI 中转。

## 可用 API 端点

### 读取配置文件

```
GET /api/opencode-config
```

读取 `~/.config/opencode/opencode.jsonc` 内容。

**响应**:
```json
{
  "ok": true,
  "data": {
    "raw": "{ ... }",
    "parsed": { ... }
  }
}
```

- `raw`: 原始文件内容字符串（保留注释）
- `parsed`: 解析后的 JSON 对象

### 写入配置文件

```
PUT /api/opencode-config
Content-Type: application/json

{
  "raw": "{ ... 完整文件内容 ... }"
}
```

或者传入解析后的对象（会丢失注释）：
```json
{
  "parsed": { "provider": { ... } }
}
```

### 获取模型差异

```
GET /api/providers/sync/diff
```

对比当前配置与 New-API 面板的模型列表。

**响应**:
```json
{
  "ok": true,
  "data": {
    "to_add": [{"id": "deepseek-ai/DeepSeek-R1", "name": "deepseek-ai/DeepSeek-R1"}],
    "to_remove": [{"id": "gemini-2.5-flash"}],
    "current_count": 108,
    "remote_count": 136
  }
}
```

### 添加模型

```
POST /api/providers/sync/apply
Content-Type: application/json

{
  "to_add": [{"id": "...", "name": "..."}]
}
```

### 删除模型

```
POST /api/providers/sync/remove
Content-Type: application/json

{
  "to_remove": [{"id": "gemini-2.5-flash"}]
}
```

### 其他 CRUD

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/providers` | 获取所有 provider 和模型列表 |
| GET | `/api/config` | 读取 oh-my-opencode-slim.json |
| PUT | `/api/config` | 写入 oh-my-opencode-slim.json |
| GET | `/api/status` | 获取后端状态和路径信息 |

## 前端 UI 实现指引

### 1. 读配置页面

构建一个"OpenCode 配置"页面，允许用户：
- 查看 `opencode.jsonc` 的原始内容（显示在 `<textarea>` 或代码编辑器中）
- 编辑后保存（调用 PUT `/api/opencode-config`）
- 语法错误时显示提示

### 2. 写配置页面

在模型列表或预设编辑页面中，任何修改配置的操作用 `PUT /api/opencode-config` 提交。

### 3. 同步功能

构建一个"从 New-API 同步"按钮/对话框：

**流程**:
1. 点击同步按钮 → 调用 `GET /api/providers/sync/diff`
2. 显示差异面板：
   - **新增模型列表**：每项带复选框，默认全选。显示 `name` 为主，`id` 为副标题
   - **移除模型列表**：红色警告，显示将被删除的模型
   - 统计信息："将新增 X 个，将移除 Y 个"
3. 用户确认后：
   - 收集勾选的 to_add 列表 → 调用 `POST /api/providers/sync/apply`
   - 全部 to_remove → 调用 `POST /api/providers/sync/remove`
4. 完成后显示结果，刷新页面

**UI 参考**:
```
┌─────────────────────────────────┐
│  New-API 模型同步                │
│                                  │
│  当前配置: 108 个                 │
│  New-API 面板: 136 个            │
│                                  │
│  ── 新增 (28) ──                  │
│  ☑ deepseek-ai/DeepSeek-R1      │
│  ☑ Qwen/Qwen3-32B              │
│  ☐ 硅基/GLM-5.1                 │
│                                  │
│  ── 移除 (2) ──                  │
│  🗑 gemini-2.5-flash             │
│  🗑 gemini-2.5-pro               │
│                                  │
│  [取消]          [确认同步]       │
└─────────────────────────────────┘
```

### 4. 模型管理

在 provider 详情页面，支持：
- 查看 New-API provider 下所有模型列表
- 从列表中移除模型（调用 `POST /api/providers/sync/remove`）

## 注意事项

- 模型 ID 可能包含中文（如 `硅基/GLM-5.1`），确保正确处理 Unicode
- 模型数量可达 100+，列表建议虚拟滚动或分页
- 每次 `GET /api/opencode-config` 读取的是最新文件内容，无需缓存
- to_remove 为空数组时 API 返回 `"没有需要删除的模型"`
- 后端地址默认 `http://localhost:8084`，应在配置中可调
