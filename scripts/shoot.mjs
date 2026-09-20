#!/usr/bin/env node
/** 用 CDP 给"已登录"的页面截图（零依赖：Node 22 自带 WebSocket）。
 *
 *  为什么需要：构建产物里没有开发期的 ?demo 自动登录，纯 headless 截图只能看到登录页。
 *  做法：先调 API 拿真令牌 → 用 CDP 在页面里写入 localStorage → 导航 → 截图。
 *
 *  用法：
 *    node scripts/shoot.mjs --base http://127.0.0.1:3101 --login admin:Admin@GeoNexus2026 \
 *         --out /tmp/x.png --path "/admin?tab=modules"
 */
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));
const base = args.base || 'http://127.0.0.1:3301';
const path = args.path || '/';
const out = args.out || '/tmp/shot.png';
const [user, pass] = (args.login || 'admin:Admin@GeoNexus2026').split(':');
const port = Number(args.port || 9333);
const chrome = args.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const { spawn } = await import('node:child_process');
const fs = await import('node:fs');
const os = await import('node:os');
const path_ = await import('node:path');

// 1) 真登录拿令牌
const loginRes = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userName: user, email: user, password: pass })
});
if (!loginRes.ok) { console.error(`登录失败 HTTP ${loginRes.status}`); process.exit(1); }
const { token } = await loginRes.json();
console.log(`  已登录：${user}（令牌 ${String(token).slice(0, 18)}…）`);

// 2) 起 Chrome 并连 CDP
const profile = fs.mkdtempSync(path_.join(os.tmpdir(), 'gnx-chrome-'));
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--enable-unsafe-swiftshader', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* 还没起来 */ }
}
if (!target) { child.kill(); console.error('连不上 Chrome CDP'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
};
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

try {
  await cmd('Page.enable'); await cmd('Runtime.enable');
  // 3) 先在同源页面写入令牌，再导航到目标
  await cmd('Page.navigate', { url: `${base}/login` });
  await sleep(2500);
  await cmd('Runtime.evaluate', { expression: `localStorage.setItem('gnx.token', ${JSON.stringify(token)})` });
  await cmd('Page.navigate', { url: `${base}${path}` });
  await sleep(Number(args.wait || 9000));
  const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`  ✅ 截图 ${out}（${(fs.statSync(out).size / 1024).toFixed(0)} KB）`);
} finally {
  try { ws.close(); } catch { /* 忽略 */ }
  child.kill();
}
