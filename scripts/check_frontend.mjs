#!/usr/bin/env node
/** 前端构建产物冒烟检查（无依赖，可直接 node 跑；dev.sh test 会调它）。
 *
 *  为什么需要：构建"成功"不等于产物可用 —— 少发一个 chunk、index.html 指向不存在的
 *  文件、或者误把旧门户的文件当成入口，都要等浏览器打开才发现。这里在 CI/本地就把它们挡掉。
 *
 *  用法：node scripts/check_frontend.mjs [dist 目录]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 默认相对**脚本位置**解析（仓库根/scripts/..），这样从任何目录调用都对
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] || path.join(repoRoot, 'frontend', 'dist');
const fail = (msg) => { console.error(`  ✗ ${msg}`); process.exitCode = 1; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

const indexPath = path.join(dist, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`  ✗ 找不到 ${indexPath} —— 先在 frontend/ 执行 npm run build`);
  process.exit(1);
}
const html = fs.readFileSync(indexPath, 'utf8');

// 1) 挂载点与入口脚本
html.includes('<div id="app">') ? ok('index.html 含 SPA 挂载点 #app') : fail('index.html 缺少 <div id="app">');

const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
if (!refs.length) fail('index.html 没有引用任何 /assets/* 产物');
else ok(`index.html 引用 ${refs.length} 个产物`);

// 2) 每个被引用的产物都真的存在，并且不是空文件
let total = 0;
for (const ref of refs) {
  const file = path.join(dist, ref.replace(/^\//, ''));
  if (!fs.existsSync(file)) { fail(`缺产物文件：${ref}`); continue; }
  const size = fs.statSync(file).size;
  total += size;
  if (size < 512) fail(`产物过小（${size}B）：${ref}`);
}
if (total) ok(`产物合计 ${(total / 1024).toFixed(0)} KB`);

// 3) 不该再引用已删除的旧门户文件
for (const legacy of ['app.js', 'styles.css']) {
  html.includes(legacy) ? fail(`index.html 仍引用旧门户文件 ${legacy}`) : ok(`未引用旧门户 ${legacy}`);
}

// 4) 分包合理性：至少能看到 vue 与 maplibre 两个 vendor chunk
const assets = fs.existsSync(path.join(dist, 'assets')) ? fs.readdirSync(path.join(dist, 'assets')) : [];
const has = (prefix) => assets.some((f) => f.startsWith(prefix));
has('vue-') ? ok('存在 vue vendor chunk') : fail('未见 vue vendor chunk（分包可能坏了）');
has('maplibre-') ? ok('存在 maplibre chunk') : fail('未见 maplibre chunk（地图会加载失败）');

console.log(process.exitCode ? '  ❌ 前端产物检查未通过' : '  ✅ 前端产物检查通过');
