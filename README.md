# OpenClaw RTK Token Compressor Plugin

> **改进版** — 基于 [ench0812/openclaw-rtk-compress](https://github.com/ench0812/openclaw-rtk-compress) 修复并优化

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that automatically compresses exec tool outputs using [RTK](https://github.com/rtk-ai/rtk) (Rust Token Killer), reducing LLM token consumption by 60-80%.

## 🛠️ 问题分析与修复

原始版本 (ench0812/openclaw-rtk-compress) 存在以下问题导致无法工作：

### 问题 1: 缺少 `definePluginEntry` 包装
```typescript
// ❌ 原始代码 - 直接导出对象
const plugin = { id: "...", register(api) {...} };
export default plugin;

// ✅ 修复后 - 使用 OpenClaw SDK 包装
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
export default definePluginEntry({ id: "...", register(api) {...} });
```
**后果**: Plugin 无法被 OpenClaw 正确加载和识别

### 问题 2: 包含 RTK 不支持的命令
原始代码包含 `eza`, `fd`, `rg`, `bat`, `delta`, `npm`, `cargo`, `pytest` 等命令，但 RTK 对这些命令没有内置压缩器，导致 `fallback` 行为（0% 节省）。

**修复**: 只保留 RTK 原生支持的命令（`ls`, `find`, `grep`, `git`, `gh`, `pnpm`, `docker`, `kubectl`, `aws`, `psql` 等）

### 问题 3: 缺少调试日志
原始代码没有足够的日志记录，无法判断 hook 是否触发。

**修复**: 添加详细的 `api.logger.info/debug` 日志，便于调试

### 问题 4: 参数结构不确定
```typescript
// ✅ 修复后 - 多路径尝试
const command = 
  event.params?.command ||
  event.params?.args?.command ||
  event?.command;
```

## 测试结果

| 命令 | 原始版本 | 修复后 |
|------|---------|--------|
| Plugin 加载 | ❌ 未加载 | ✅ loaded |
| Hook 注册 | ❌ 未注册 | ✅ before_tool_call |
| 命令重写 | ❌ 无记录 | ✅ 日志确认 |
| Token 节省 | 0% | 60-80% |

---

## How It Works

The plugin registers a `before_tool_call` hook that intercepts `exec` tool calls. When an agent runs commands like `git status`, `ls -la`, or `cat large-file.ts`, the plugin rewrites them to use RTK prefix (`rtk git status`), which compresses the output before it enters the LLM context.

### ✅ RTK 原生支持的命令（已验证）

| 类别 | 命令 |
|------|------|
| Git | `git`, `gh`, `diff` |
| 文件 | `ls`, `find`, `tree`, `read`, `cat` |
| 搜索 | `grep` |
| 包管理 | `pnpm`, `dotnet` |
| 容器/云 | `docker`, `kubectl`, `aws` |
| 数据库 | `psql` |
| 其他 | `json`, `deps`, `env`, `log`, `wc`, `wget` |

### ❌ 已移除（RTK 会 fallback）

`eza`, `fd`, `rg`, `bat`, `delta`, `npm`, `cargo`, `pytest`

### ⏭️ 自动跳过的情况

- 管道命令 (`|`)
- 链式命令 (`&&`, `;`)
- 重定向 (`>`, `>>`)
- 子 Shell (`$()`, `` ` ``)
- `sudo`, `cd`, `export`, `source`
- 已有 `rtk` 前缀

## Installation

### 1. 安装 RTK

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
```

### 2. 安装 Plugin

```bash
# 克隆到 OpenClaw extensions 目录
git clone https://github.com/thehappyboy/openclaw-rtk-compress.git ~/.openclaw/extensions/rtk-compress

# 重启 Gateway（plugin 会自动加载）
openclaw gateway restart
```

### 3. 验证

```bash
openclaw plugins list | grep rtk
# 应显示：rtk-compress | loaded

tail -f ~/.openclaw/logs/gateway.log | grep rtk-compress
# 执行命令后应看到：rtk-compress: git status → rtk git status
```

## 📊 Token 节省实测

| 命令 | 节省率 | 说明 |
|------|--------|------|
| `git status` | 74% | 冗长输出压缩为简洁树状结构 |
| `ls -la` | 58-77% | 移除权限/所有者等冗余信息 |
| `git diff` | 75% | 只显示变更行 |
| `find` | 60-75% | 压缩路径显示 |
| `grep` | 50-70% | 智能截断和分组 |

## Configuration

Plugin manifest (`openclaw.plugin.json`):
```json
{
  "configSchema": {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean",
        "default": true
      }
    }
  }
}
```

## 📚 参考资料

- [OpenClaw Plugin SDK](https://github.com/openclaw/openclaw/tree/main/docs/plugins)
- [RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk)
- [原始项目](https://github.com/ench0812/openclaw-rtk-compress)

## License

MIT
