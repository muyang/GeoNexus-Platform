#!/usr/bin/env node
/*
 * 门户前端静态检查（无依赖，可直接 node 跑）。
 *
 * 门户是 ~1500 行手写 JS，没有任何测试，浏览器一打开就是唯一验证手段。这个脚本
 * 覆盖两类"打开浏览器才发现"的致命错误：
 *
 *   ① 调用了不存在的函数      → ReferenceError，整页脚本停在那一步
 *   ② el('id') 引用了不存在的元素 → null.addEventListener 崩，或功能静默失效
 *
 * 它是真的抓到过东西的：`apiGetAuth` 被 `loadCurrentUser()` 调用但从未定义，
 * 只是因为前面有 `if (!state.authToken) return` 提前返回才没暴露——一旦登录后
 * 再调一次，或以后把 token 持久化，整页就白屏。
 *
 * 用法：node scripts/check_portal.mjs
 * 退出码：有 error 时非零（warnings 不影响）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(ROOT, 'app.js');
const htmlPath = path.join(ROOT, 'index.html');
const serverPath = path.join(ROOT, 'server.js');

for (const p of [appPath, htmlPath, serverPath]) {
  if (!fs.existsSync(p)) {
    console.error(`missing ${p}`);
    process.exit(1);
  }
}

const app = fs.readFileSync(appPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const server = fs.readFileSync(serverPath, 'utf8');

const errors = [];
const warnings = [];

/* ── ① 未定义的被调用函数 ───────────────────────────────────────────────── */
const defined = new Set();
for (const m of app.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
for (const m of app.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);

// 宿主/语言内置，允许直接调用
const BUILTINS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new',
  'Promise', 'Object', 'Array', 'Map', 'Set', 'JSON', 'Number', 'String', 'Boolean',
  'Math', 'Date', 'Error', 'URL', 'URLSearchParams', 'FormData', 'Intl', 'RegExp',
  'fetch', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval',
  'clearInterval', 'clearTimeout', 'requestAnimationFrame', 'encodeURIComponent',
  'decodeURIComponent', 'alert', 'confirm', 'prompt', 'console', 'structuredClone',
  'el', // 由 index.html 内联提供的小工具
]);

// 只看左侧没有点的调用；foo.bar() 是方法调用，天然不在检查范围内
const called = new Set();
for (const m of app.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
  const name = m[2];
  if (!BUILTINS.has(name) && !defined.has(name)) called.add(name);
}
// 关键字/语句形态会被正则误抓，过滤掉
for (const kw of ['async', 'await', 'return', 'typeof', 'new', 'function', 'catch',
                  'else', 'do', 'in', 'of', 'delete', 'void', 'yield']) {
  called.delete(kw);
}
if (called.size) {
  errors.push(`app.js 调用了未定义的函数: ${[...called].sort().join(', ')}`);
}

/* ── ② el('id') 引用的元素是否存在 ─────────────────────────────────────── */
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const refEntries = new Map();
for (const m of app.matchAll(/^\s*([A-Za-z_$][\w$]*):\s*el\('([^']+)'\)/gm)) {
  refEntries.set(m[1], m[2]);
}
for (const [refName, id] of refEntries) {
  if (ids.has(id)) continue;
  // 只要所有使用点都做了 `if (refs.x)` 守卫，就只是历史遗留而不是崩溃
  const uses = [...app.matchAll(new RegExp(`refs\\.${refName}\\b`, 'g'))].length;
  const guarded = new RegExp(`if\\s*\\(\\s*refs\\.${refName}\\s*\\)`).test(app);
  const msg = `refs.${refName} → el('${id}')，但 index.html 里没有这个 id（使用 ${uses} 次）`;
  if (guarded) warnings.push(`${msg}，已用 if 守卫，属遗留死代码`);
  else errors.push(msg);
}

/* ── ③ 语法 ─────────────────────────────────────────────────────────────── */
for (const [name, src] of [['app.js', app], ['server.js', server]]) {
  try {
    new Function(src); // 只做编译，不执行
  } catch (error) {
    errors.push(`${name} 语法错误: ${error.message}`);
  }
}

/* ── ④ 门户引用的静态资源是否都在 ───────────────────────────────────────── */
for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]*\.(?:css|js|svg|png))"/g)) {
  const rel = m[1].replace(/^\//, '');
  if (!fs.existsSync(path.join(ROOT, rel))) errors.push(`index.html 引用了不存在的资源: ${m[1]}`);
}

for (const w of warnings) console.log(`  ⚠️  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ❌ ${e}`);
  console.error(`\n门户静态检查失败：${errors.length} 个错误 / ${warnings.length} 个警告`);
  process.exit(1);
}
console.log(`  ✅ 门户静态检查通过（0 错误 / ${warnings.length} 个警告）`);
