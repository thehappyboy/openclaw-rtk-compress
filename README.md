# OpenClaw RTK Token Compressor Plugin

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that automatically compresses exec tool outputs using [RTK](https://github.com/rtk-ai/rtk) (Rust Token Killer), reducing LLM token consumption by 60-80%.

## How It Works

The plugin registers a `before_tool_call` hook that intercepts `exec` tool calls. When an agent runs commands like `git status`, `ls -la`, or `cat large-file.ts`, the plugin rewrites them to use RTK prefix (`rtk git status`), which compresses the output before it enters the LLM context.

### Supported Commands

- `git` (status, log, diff, etc.)
- `ls`, `find`, `grep`, `cat`, `diff`
- `gh` (GitHub CLI)
- `pnpm`, `npm`, `cargo`, `pytest`, `docker`

### Skip Conditions

Complex commands are passed through unchanged:
- Piped commands (`|`)
- Chained commands (`&&`, `;`)
- Commands with redirects (`>`, `>>`)
- Commands already using `rtk` prefix

## Installation

### Prerequisites

- [RTK](https://github.com/rtk-ai/rtk) installed:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
  ```

### Install Plugin

```bash
# Clone to OpenClaw extensions directory
git clone https://github.com/ench0812/openclaw-rtk-compress.git ~/.openclaw/extensions/rtk-compress

# Add to plugin allowlist
openclaw config set plugins.allow '["discord", "memory-lancedb-pro", "rtk-compress"]'
openclaw config set plugins.entries.rtk-compress.enabled true

# Restart gateway
systemctl --user restart openclaw-gateway.service
```

### Verify

```bash
openclaw plugins list
# Should show: rtk-compress | loaded
```

## Token Savings

| Command | Normal Output | RTK Output | Savings |
|---------|--------------|------------|---------|
| `git status` | ~2,300 chars | ~610 chars | **74%** |
| `ls -la` | ~6,800 chars | ~2,900 chars | **58%** |
| `git diff` | ~10,000 chars | ~2,500 chars | **75%** |

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

## License

MIT
