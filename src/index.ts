/**
 * voice-mcp (ElevenLabs Edition)
 *
 * An MCP server for AI voice synthesis with inline audio player.
 * Uses ElevenLabs TTS API. Forked from garan0613/voice-mcp.
 *
 * Original: https://github.com/garan0613/voice-mcp
 * License: MIT
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";

// =============================================================================
// Types
// =============================================================================

export interface Env {
  ELEVENLABS_API_KEY: string;
  VOICE_ID: string;
  BOT_NAME?: string;
  VOICE_AUDIO?: KVNamespace;
}

// =============================================================================
// Constants
// =============================================================================

const EXT_APPS_MIME = "text/html;profile=mcp-app" as const;
const VOICE_RESOURCE_URI = "ui://voice-mcp/player.html";
// 音频在 KV 里保留 180 天；32kbps 约 4KB/秒，免费 1GB 够存七十多小时
const AUDIO_TTL_SECONDS = 180 * 24 * 3600;

// =============================================================================
// Audio Player HTML (WeChat-style UI)
// =============================================================================

function getPlayerHTML(botName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voice Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      height: auto;
      overflow: hidden;
    }
    body { padding: 6px; }
    .container {
      background: #fff;
      border-radius: 12px;
      padding: 10px 12px;
      max-width: 100%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .player {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .play-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: #f5f5f5;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .play-btn:active { background: #e0e0e0; }
    .play-btn svg { width: 13px; height: 13px; fill: #333; }
    .play-btn.playing svg { fill: #07c160; }
    .waveform {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 2px;
      height: 22px;
    }
    .wave-bar {
      width: 3px;
      background: #d0d0d0;
      border-radius: 2px;
      transition: background 0.1s;
    }
    .wave-bar.active { background: #07c160; }
    .duration {
      font-size: 12px;
      color: #999;
      min-width: 32px;
      text-align: right;
    }
    .transcript {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(0,0,0,0.06);
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      word-break: break-word;
      white-space: pre-wrap;
    }
    /* Only used when the host caps our height below the content height */
    .transcript.capped {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    .loading {
      text-align: center;
      color: #999;
      font-size: 13px;
      padding: 12px;
    }
    .error {
      color: #fa5151;
      background: #fff2f2;
      padding: 8px;
      border-radius: 8px;
      font-size: 13px;
    }
    @media (prefers-color-scheme: dark) {
      .container { background: #2c2c2c; }
      .play-btn { background: #3a3a3a; }
      .play-btn svg { fill: #e0e0e0; }
      .wave-bar { background: #555; }
      .wave-bar.active { background: #4cd964; }
      .duration { color: #888; }
      .transcript { color: #e0e0e0; border-top-color: rgba(255,255,255,0.08); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="content">
      <div class="loading">Loading...</div>
    </div>
  </div>

  <script>
    const contentEl = document.getElementById('content');
    const BOT_NAME = '${botName}';
    let audio = null;
    let waveInterval = null;

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function showError(msg) {
      contentEl.innerHTML = '<div class="error">' + escapeHtml(msg) + '</div>';
    }

    function formatTime(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function createWaveform() {
      const heights = [40, 70, 55, 85, 45, 90, 60, 75, 50, 80, 65, 55, 70, 45, 85, 50];
      return heights.map(h => '<div class="wave-bar" style="height:' + h + '%"></div>').join('');
    }

    function renderPlayer(text, audioUrl) {

      contentEl.innerHTML =
        '<div class="player">' +
          '<button class="play-btn" id="playBtn">' +
            '<svg viewBox="0 0 24 24"><path id="playIcon" d="M8 5v14l11-7z"/></svg>' +
          '</button>' +
          '<div class="waveform" id="waveform">' + createWaveform() + '</div>' +
          '<span class="duration" id="duration">0:00</span>' +
        '</div>' +
        '<div class="transcript">' + escapeHtml(text) + '</div>' +
        '<audio id="audio" src="' + audioUrl + '" preload="metadata"></audio>';

      audio = document.getElementById('audio');
      const playBtn = document.getElementById('playBtn');
      const playIcon = document.getElementById('playIcon');
      const durationEl = document.getElementById('duration');
      const waveform = document.getElementById('waveform');
      const bars = waveform.querySelectorAll('.wave-bar');

      audio.addEventListener('loadedmetadata', function() {
        if (isFinite(audio.duration)) durationEl.textContent = formatTime(audio.duration);
      });

      // 宿主沙箱不放行外链音频时的兜底：让宿主在浏览器里打开链接
      audio.addEventListener('error', function() {
        if (audioUrl.indexOf('data:') === 0) { durationEl.textContent = '!'; return; }
        durationEl.innerHTML = '<a href="#" id="openLink" style="color:#07c160;text-decoration:none">打开</a>';
        document.getElementById('openLink').addEventListener('click', function(e) {
          e.preventDefault();
          sendToHost('ui/open-link', { url: audioUrl }, 2);
        });
        notifyHeight();
      });

      playBtn.addEventListener('click', function() {
        if (audio.paused) {
          audio.play().catch(function() {});
        } else {
          audio.pause();
        }
      });

      audio.addEventListener('play', function() {
        playBtn.classList.add('playing');
        playIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
        animateWave(bars, true);
      });

      audio.addEventListener('pause', function() {
        playBtn.classList.remove('playing');
        playIcon.setAttribute('d', 'M8 5v14l11-7z');
        animateWave(bars, false);
      });

      audio.addEventListener('ended', function() {
        playBtn.classList.remove('playing');
        playIcon.setAttribute('d', 'M8 5v14l11-7z');
        animateWave(bars, false);
        bars.forEach(b => b.classList.remove('active'));
      });

      audio.addEventListener('timeupdate', function() {
        const progress = audio.currentTime / audio.duration;
        const activeCount = Math.floor(progress * bars.length);
        bars.forEach((b, i) => b.classList.toggle('active', i < activeCount));
      });

      notifyHeight();
      setTimeout(notifyHeight, 100);
      setTimeout(notifyHeight, 500);
    }

    // MCP Apps spec: the app reports its content size via
    // ui/notifications/size-changed and the host resizes the iframe.
    let maxHeight = null;
    let lastW = 0, lastH = 0, resizeQueued = false;

    function measureHeight() {
      const root = document.documentElement;
      const prev = root.style.height;
      root.style.height = 'max-content';
      const h = Math.ceil(root.getBoundingClientRect().height);
      root.style.height = prev;
      return h;
    }

    function applyHeightCap() {
      const t = document.querySelector('.transcript');
      if (!t) return;
      t.classList.remove('capped');
      t.style.maxHeight = '';
      if (maxHeight && measureHeight() > maxHeight) {
        t.classList.add('capped');
        // Two passes: the first shrink can shift padding/borders slightly
        for (let i = 0; i < 2; i++) {
          const overflow = measureHeight() - maxHeight;
          if (overflow <= 0) break;
          t.style.maxHeight = Math.max(60, t.offsetHeight - overflow) + 'px';
        }
      }
    }

    function notifyHeight() {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(function() {
        resizeQueued = false;
        applyHeightCap();
        const w = Math.ceil(window.innerWidth);
        const h = measureHeight();
        if (w === lastW && h === lastH) return;
        lastW = w; lastH = h;
        sendToHost('ui/notifications/size-changed', { width: w, height: h });
      });
    }

    function readContainer(ctx) {
      const d = ctx && ctx.containerDimensions;
      if (!d) return;
      if (typeof d.maxHeight === 'number') maxHeight = d.maxHeight;
      else if (typeof d.height === 'number') maxHeight = d.height;
      lastH = 0;
      notifyHeight();
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(notifyHeight);
      ro.observe(document.documentElement);
      ro.observe(document.body);
    }
    window.addEventListener('resize', notifyHeight);

    function animateWave(bars, playing) {
      if (waveInterval) clearInterval(waveInterval);
      if (!playing) return;

      waveInterval = setInterval(function() {
        bars.forEach(bar => {
          if (!bar.classList.contains('active')) {
            bar.style.opacity = 0.5 + Math.random() * 0.5;
          }
        });
      }, 150);
    }

    function handleData(data) {
      if (data.error) { showError(data.error); return; }
      if (data.text && data.audio_url) {
        renderPlayer(data.text, data.audio_url);
      } else if (data.text && data.audio_base64) {
        renderPlayer(data.text, 'data:audio/mpeg;base64,' + data.audio_base64);
      }
    }

    function sendToHost(method, params, id) {
      const msg = { jsonrpc: '2.0', method: method, params: params || {} };
      if (id !== undefined) msg.id = id;
      window.parent.postMessage(msg, '*');
    }

    let hostInitialized = false;

    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.jsonrpc === '2.0' && msg.id === 2) return; // open-link 回执

      if (msg.jsonrpc === '2.0' && msg.id === 1 && !hostInitialized && msg.method === undefined) {
        if ('error' in msg) {
          showError('Initialization failed: ' + ((msg.error && msg.error.message) || 'unknown'));
          return;
        }
        if ('result' in msg) {
          hostInitialized = true;
          sendToHost('ui/notifications/initialized', {});
          readContainer(msg.result && msg.result.hostContext);
          lastH = 0;
          notifyHeight();
        }
        return;
      }

      if (msg.jsonrpc === '2.0') {
        if (msg.method === 'ui/notifications/host-context-changed') {
          readContainer(msg.params);
        }
        if (msg.method === 'ui/notifications/tool-input') {
          contentEl.innerHTML = '<div class="loading">Generating voice...</div>';
        }
        if (msg.method === 'ui/notifications/tool-result') {
          const p = msg.params || {};
          if (p.structuredContent) handleData(p.structuredContent);
          else if (p.isError) showError((p.content && p.content[0] && p.content[0].text) || 'Tool returned an error');
        }
      }
      if (msg.structuredContent) handleData(msg.structuredContent);
    });

    sendToHost('ui/initialize', {
      protocolVersion: '2026-01-26',
      appInfo: { name: 'voice-mcp', version: '1.2.0' },
      appCapabilities: { availableDisplayModes: ['inline'] }
    }, 1);
  </script>
</body>
</html>`;
}

// =============================================================================
// ElevenLabs API Helper
// =============================================================================

async function generateAudio(env: Env, text: string): Promise<{ success: boolean; bytes?: Uint8Array; error?: string }> {
  try {
    // 32kbps 单声道足够人声；默认 128kbps 会让长句的 base64 结果超过 2MB，
    // 宿主收不下导致播放器卡在加载（2026-11-11 排查）。
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${env.VOICE_ID}?output_format=mp3_22050_32`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: 0.9, // flash 模型默认偏快，Yuki 2026-10-02 要求慢一成
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `ElevenLabs API error ${response.status}: ${errBody}` };
    }

    return { success: true, bytes: new Uint8Array(await response.arrayBuffer()) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function toBase64(bytes: Uint8Array): string {

  // 直接用 subarray 视图，省掉逐块复制成普通数组的 CPU（免费套餐只有 10ms）
  const parts: string[] = [];
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[]));
  }
    return btoa(parts.join(''));
}

// =============================================================================
// MCP Server Factory
// =============================================================================

function createVoiceServer(env: Env, origin: string): McpServer {
  const botName = env.BOT_NAME || 'AI';
  const PLAYER_HTML = getPlayerHTML(botName);

  const server = new McpServer({
    name: "voice-mcp",
    version: "1.0.0",
  });

  server.server.registerCapabilities({
    extensions: {
      "io.modelcontextprotocol/ui": {},
    },
  });

  server.resource(
    VOICE_RESOURCE_URI,
    VOICE_RESOURCE_URI,
    { mimeType: EXT_APPS_MIME, description: "Voice Player", _meta: { ui: { csp: { resourceDomains: [origin], connectDomains: [origin] } } } },
    async () => ({
      contents: [
        {
          uri: VOICE_RESOURCE_URI,
          mimeType: EXT_APPS_MIME,
          text: PLAYER_HTML,
          // MCP Apps：放行播放器从本 worker 加载音频
          _meta: { ui: { csp: { resourceDomains: [origin], connectDomains: [origin] } } },
        },
      ],
    }),
  );

  server.registerTool(
    "speak",
    {
      title: `${botName}'s Voice`,
      description: `Make ${botName} speak with a cloned voice. The audio will play in an inline player.`,
      inputSchema: z.object({
        text: z.string().describe("Text to speak"),
      }),
      _meta: {
        ui: { resourceUri: VOICE_RESOURCE_URI },
        "ui/resourceUri": VOICE_RESOURCE_URI,
      },
    },
    async ({ text }) => {
      const result = await generateAudio(env, text);

      if (result.success && result.bytes) {
        // 音频存 KV、结果只带链接：base64 塞进结果会被宿主按 token 计，长句直接超限
        if (env.VOICE_AUDIO) {
          const id = crypto.randomUUID();
          await env.VOICE_AUDIO.put(id, result.bytes, { expirationTtl: AUDIO_TTL_SECONDS });
          return {
            content: [
              { type: "text" as const, text: `🎙️ ${botName} says: "${text}"` },
            ],
            structuredContent: {
              text: text,
              audio_url: `${origin}/audio/${id}.mp3`,
            },
          };
        }
        return {
          content: [
            { type: "text" as const, text: `🎙️ ${botName} says: "${text}"` },
          ],
          structuredContent: {
            text: text,
            audio_base64: toBase64(result.bytes),
          },
        };
      }

      return {
        content: [
          { type: "text" as const, text: `Voice generation failed: ${result.error}` },
        ],
        structuredContent: {
          error: result.error || 'Unknown error',
        },
      };
    },
  );

  return server;
}

// =============================================================================
// Worker Handler
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // MCP Endpoint
    if (path === '/mcp' || path === '/mcp/' || path === '/sse') {
      const server = createVoiceServer(env, url.origin);
      const handler = createMcpHandler(server, {
        route: null as unknown as string,
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      return handler(request, env, ctx);
    }

    // Stored audio (KV), with Range support for iOS Safari
    const audioMatch = path.match(/^\/audio\/([0-9a-f-]{36})\.mp3$/);
    if (audioMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      if (!env.VOICE_AUDIO) return new Response('Not Found', { status: 404, headers: corsHeaders });
      const buf = await env.VOICE_AUDIO.get(audioMatch[1], 'arrayBuffer');
      if (!buf) return new Response('Not Found', { status: 404, headers: corsHeaders });
      const total = buf.byteLength;
      const baseHeaders: Record<string, string> = {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      };
      const range = request.headers.get('Range');
      const m = range && range.match(/^bytes=(\d*)-(\d*)$/);
      if (m && (m[1] || m[2])) {
        let start = m[1] ? parseInt(m[1], 10) : total - parseInt(m[2], 10);
        let end = m[1] && m[2] ? parseInt(m[2], 10) : total - 1;
        start = Math.max(0, start); end = Math.min(end, total - 1);
        if (start > end) {
          return new Response(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${total}` } });
        }
        const body = request.method === 'HEAD' ? null : buf.slice(start, end + 1);
        return new Response(body, {
          status: 206,
          headers: { ...baseHeaders, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) },
        });
      }
      return new Response(request.method === 'HEAD' ? null : buf, { headers: { ...baseHeaders, 'Content-Length': String(total) } });
    }

    // Status check
    if (path === '/status') {
      return Response.json({
        status: 'ok',
        service: 'voice-mcp',
        version: '1.0.0',
        tts_provider: 'elevenlabs',
        voice_id: env.VOICE_ID ? 'configured' : 'not configured',
      }, { headers: corsHeaders });
    }

    // Direct audio API
    if (path === '/speak' && request.method === 'GET') {
      const text = url.searchParams.get('text');
      if (!text) {
        return Response.json({ error: 'Missing text parameter' }, {
          status: 400,
          headers: corsHeaders
        });
      }

      const result = await generateAudio(env, text);

      if (result.success && result.bytes) {
        return new Response(result.bytes, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': 'inline; filename="voice.mp3"',
          },
        });
      }

      return Response.json({ error: result.error }, {
        status: 500,
        headers: corsHeaders
      });
    }

    // Landing page
    if (path === '/' || path === '') {
      const botName = env.BOT_NAME || 'AI';
      return new Response(
        `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>voice-mcp</title>
<style>
  body { font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 20px; color: #333; line-height: 1.6; }
  h1 { color: #07c160; }
  code { background: #f5f5f5; padding: 2px 8px; border-radius: 4px; font-size: 14px; }
  .section { margin: 24px 0; }
  a { color: #07c160; }
</style>
</head><body>
<h1>🎙️ voice-mcp (ElevenLabs)</h1>
<p>An MCP server for AI voice synthesis with inline audio player.</p>

<div class="section">
<h3>MCP Server</h3>
<p>Add this URL to your Claude.ai Connectors:</p>
<code>${url.origin}/mcp</code>
</div>

<div class="section">
<h3>Direct API</h3>
<code>GET /speak?text=Hello</code> — Get audio file directly<br>
<code>GET /status</code> — Health check
</div>

<div class="section">
<h3>Configuration</h3>
<p>Bot name: <strong>${botName}</strong></p>
<p>TTS Provider: <strong>ElevenLabs</strong></p>
</div>

<p style="margin-top: 32px; color: #666; font-size: 14px;">
  Based on <a href="https://github.com/garan0613/voice-mcp">garan0613/voice-mcp</a> · MIT License
</p>
</body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  },
};
