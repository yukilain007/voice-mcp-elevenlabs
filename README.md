# 🎙️ voice-mcp (ElevenLabs Edition)

[中文](#中文说明) | [English](#english)

An MCP server for AI voice synthesis, deployed on Cloudflare Workers. Give your AI assistant a realistic cloned voice — works on both desktop and mobile.

Based on [garan0613/voice-mcp](https://github.com/garan0613/voice-mcp), swapping MiniMax TTS for **ElevenLabs** to get multilingual, high-quality voice cloning.

---

## English

### Features

- 🎤 **ElevenLabs TTS** — Multilingual v2 model, supports 29 languages including Chinese & English
- 🔊 **Inline Audio Player** — WeChat-style player with waveform animation & dark mode
- ⚡ **Cloudflare Workers** — Serverless, free tier friendly, globally fast
- 📱 **Works on Mobile** — Audio plays directly in claude.ai on any device
- 📝 **Transcript Toggle** — Show/hide the spoken text below the player

### Quick Start

#### 1. Clone

```bash
git clone https://github.com/yukilain007/voice-mcp-elevenlabs.git
cd voice-mcp-elevenlabs
```

#### 2. Install

```bash
npm install
```

#### 3. Configure Secrets

You'll need an [ElevenLabs](https://elevenlabs.io) account with a voice (cloned or pre-made).

```bash
npx wrangler login
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put VOICE_ID
npx wrangler secret put BOT_NAME  # Optional, defaults to "AI"
```

#### 4. Deploy

```bash
npx wrangler deploy
```

#### 5. Connect to Claude.ai

1. Go to **Settings → Connectors → Add Connector**
2. Enter your Worker URL: `https://your-worker.workers.dev/mcp`
3. Done! The `speak` tool is now available.

### Configuration

| Variable | Required | Description |
|---|---|---|
| `ELEVENLABS_API_KEY` | ✅ | Your ElevenLabs API key |
| `VOICE_ID` | ✅ | Voice ID (cloned or pre-made) |
| `BOT_NAME` | ❌ | Display name in the player (default: "AI") |

### API Endpoints

| Endpoint | Description |
|---|---|
| `GET /mcp` | MCP server (SSE protocol) |
| `GET /speak?text=Hello` | Direct audio file |
| `GET /status` | Health check |

### How to Get a Voice ID

1. Go to [ElevenLabs](https://elevenlabs.io)
2. **Voices** → pick a pre-made voice, or clone your own (upload 10–30s of clear audio)
3. Click the voice → copy the **Voice ID**

### Differences from the Original

| | Original ([garan0613](https://github.com/garan0613/voice-mcp)) | This Fork |
|---|---|---|
| TTS Provider | MiniMax | ElevenLabs |
| Model | speech-2.8-hd | eleven_multilingual_v2 |
| Languages | Chinese-focused | 29 languages |
| Voice Cloning | MiniMax Console | ElevenLabs Console |

Player UI, Cloudflare deployment, and MCP protocol are unchanged.

### Custom Domain

```jsonc
// wrangler.jsonc
{
  "routes": [
    { "pattern": "voice.yourdomain.com/*", "zone_name": "yourdomain.com" }
  ]
}
```

---

## 中文说明

一个部署在 Cloudflare Workers 上的 MCP 语音合成服务器。让你的 AI 助手拥有逼真的克隆声音——桌面端和手机端都能用。

基于 [garan0613/voice-mcp](https://github.com/garan0613/voice-mcp) 修改，将 MiniMax TTS 替换为 **ElevenLabs**，支持多语言高质量语音克隆。

### 特性

- 🎤 **ElevenLabs TTS** — 多语言 v2 模型，支持中文、英文等 29 种语言
- 🔊 **内联音频播放器** — 仿微信语音条样式，带波形动画和暗色模式
- ⚡ **Cloudflare Workers** — 无服务器部署，免费额度内可用，全球加速
- 📱 **手机可用** — 在 claude.ai 的任何设备上都能直接播放
- 📝 **文字折叠** — 播放器下方可展开/收起语音文本

### 快速开始

#### 1. 克隆仓库

```bash
git clone https://github.com/yukilain007/voice-mcp-elevenlabs.git
cd voice-mcp-elevenlabs
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置密钥

需要一个 [ElevenLabs](https://elevenlabs.io) 账号和一个声音 ID（可以用预设声音，也可以上传录音克隆）。

```bash
npx wrangler login
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put VOICE_ID
npx wrangler secret put BOT_NAME  # 可选，默认 "AI"
```

#### 4. 部署

```bash
npx wrangler deploy
```

#### 5. 连接 Claude.ai

1. 打开 **Settings → Connectors → Add Connector**
2. 填入你的 Worker URL：`https://your-worker.workers.dev/mcp`
3. 完成！在对话中就能使用 `speak` 工具了

### 配置项

| 变量 | 必填 | 说明 |
|---|---|---|
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs API 密钥 |
| `VOICE_ID` | ✅ | 声音 ID（克隆或预设） |
| `BOT_NAME` | ❌ | 播放器显示名称（默认 "AI"） |

### 获取 Voice ID

1. 打开 [ElevenLabs](https://elevenlabs.io)
2. 进入 **Voices** → 选一个预设声音，或上传 10-30 秒清晰录音克隆自己的
3. 点击声音 → 复制 **Voice ID**

### 与原版的区别

| | 原版 ([garan0613](https://github.com/garan0613/voice-mcp)) | 本 Fork |
|---|---|---|
| TTS 引擎 | MiniMax | ElevenLabs |
| 模型 | speech-2.8-hd | eleven_multilingual_v2 |
| 语言支持 | 以中文为主 | 29 种语言 |
| 声音克隆 | MiniMax 控制台 | ElevenLabs 控制台 |

播放器界面、Cloudflare 部署方式、MCP 协议部分不变。

---

## Tech Stack

- [Cloudflare Workers](https://workers.cloudflare.com/) — Serverless runtime
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) — Model Context Protocol
- [ElevenLabs](https://elevenlabs.io) — Voice synthesis
- [ext-apps](https://modelcontextprotocol.io/docs/concepts/ext-apps) — Inline UI rendering

## License

MIT © 2026

## Credits

- Original project: [garan0613/voice-mcp](https://github.com/garan0613/voice-mcp)
- TTS: [ElevenLabs](https://elevenlabs.io)
- Runtime: [Cloudflare Workers](https://workers.cloudflare.com)
