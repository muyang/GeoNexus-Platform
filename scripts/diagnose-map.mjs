#!/usr/bin/env node
/** 地图排障：抓浏览器侧的 console、失败请求与 MapLibre 内部状态。
 *
 *  为什么需要：curl 能取到瓦片 ≠ 浏览器里能画出来。差异可能出在 CSP、CORS、
 *  WebGL 能力、样式/精灵加载顺序，或我们自己的错误处理把样式换掉了。
 *  用法：node scripts/diagnose-map.mjs --base http://127.0.0.1:3301 --path "/?basemap=dark-raster"
 */
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, arr) => {
  // 参数名归一化：--canvas-out → canvasOut（否则读 args.canvasOut 永远拿不到值）
  if (cur.startsWith('--')) {
    const key = cur.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    acc.push([key, arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  }
  return acc;
}, []));
const base = args.base || 'http://127.0.0.1:3301';
const path = args.path || '/';
const port = Number(args.port || 9444);
const wait = Number(args.wait || 15000);
const chrome = args.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const { spawn } = await import('node:child_process');
const fs = await import('node:fs');
const os = await import('node:os');
const path_ = await import('node:path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path_.join(os.tmpdir(), 'gnx-diag-'));
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* 等待 */ }
}
if (!target) { child.kill(); console.error('连不上 Chrome CDP'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
const console_ = []; const failed = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    console_.push(`[${m.params.type}] ${(m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console_.push(`[exception] ${d.exception?.description || d.text}`);
  }
  if (m.method === 'Network.loadingFailed') failed.push(m.params);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    failed.push({ url: m.params.response.url, status: m.params.response.status, type: 'http' });
  }
};
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};

try {
  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable');
  await cmd('Page.navigate', { url: `${base}${path}` });
  await sleep(wait);

  const state = await evaluate(`(() => {
    const m = window.__gnxMap;
    const c = document.querySelector('.maplibregl-canvas');
    const box = c ? c.getBoundingClientRect() : null;
    let webgl = 'n/a';
    try { const t = document.createElement('canvas'); webgl = !!(t.getContext('webgl2') || t.getContext('webgl')); } catch (e) { webgl = 'error:' + e.message; }
    return {
      hasMap: !!m,
      canvas: c ? { w: Math.round(box.width), h: Math.round(box.height), attrW: c.width, attrH: c.height } : null,
      canvasCount: document.querySelectorAll('canvas').length,
      webgl,
      loaded: m ? m.loaded() : null,
      styleLoaded: m ? m.isStyleLoaded() : null,
      tilesLoaded: m ? m.areTilesLoaded() : null,
      sources: m ? Object.keys(m.getStyle()?.sources || {}) : [],
      layerCount: m ? (m.getStyle()?.layers || []).length : 0,
      center: m ? m.getCenter().toArray().map((n) => +n.toFixed(3)) : null,
      zoom: m ? +m.getZoom().toFixed(2) : null,
      containerSize: (() => { const el = document.querySelector('.earth-map, [class*=map]'); return el ? { cw: el.clientWidth, ch: el.clientHeight } : null; })(),
      dataMapLayers: document.documentElement.dataset.mapLayers || null,
      shell: document.documentElement.dataset.shell
    };
  })()`);

  console.log(`\n  页面 ${base}${path}`);
  console.log('  ── MapLibre 状态 ──');
  console.log('   ', JSON.stringify(state, null, 2).replace(/\n/g, '\n    '));

  const tileReqs = failed.filter((f) => /cartocdn|arcgisonline|openfreemap|mvt|png|pbf|json/.test(f.url || ''));
  console.log(`\n  ── 失败/异常请求：${failed.length} 条（其中地图相关 ${tileReqs.length} 条）──`);
  for (const f of failed.slice(0, 12)) console.log(`    ${f.status || f.errorText || '?'}  ${String(f.url).slice(0, 120)}`);

  console.log(`\n  ── console（${console_.length} 条）──`);
  for (const c of console_.slice(0, 14)) console.log(`    ${String(c).slice(0, 160)}`);

  if (args.canvasOut) {
    // 直接从 WebGL canvas 读像素（在 render 回调里读，避免 drawingBuffer 被清空）——
    // 这样即使 headless 不合成 WebGL，也能拿到"地图到底画出了什么"的真实证据。
    const dataUrl = await evaluate(`new Promise((resolve) => {
      const m = window.__gnxMap;
      if (!m) return resolve(null);
      m.triggerRepaint();
      m.once('render', () => { try { resolve(m.getCanvas().toDataURL('image/png')); } catch (e) { resolve('ERR:' + e.message); } });
      setTimeout(() => resolve('TIMEOUT'), 5000);
    })`);
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
      fs.writeFileSync(args.canvasOut, Buffer.from(dataUrl.split(',')[1], 'base64'));
      console.log(`\n  地图画布已导出：${args.canvasOut}（${(fs.statSync(args.canvasOut).size / 1024).toFixed(0)} KB）`);
    } else {
      console.log(`\n  地图画布导出失败：${dataUrl}`);
    }
  }

  if (args.out) {
    const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(args.out, Buffer.from(data, 'base64'));
    console.log(`\n  截图：${args.out}`);
  }
} finally {
  try { ws.close(); } catch { /* 忽略 */ }
  child.kill();
}
