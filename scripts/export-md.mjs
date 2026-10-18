#!/usr/bin/env node
/**
 * 导出每篇文章的纯 Markdown 版本（GFM，零原始 HTML），方便转载到掘金、知乎、公众号等编辑器。
 *
 * 输出（构建产物，不进仓库）：
 *   dist/md/<slug>.md          每篇文章一份
 *   dist/md/index.json         清单
 * 图（进仓库）：
 *   public/md/img/<slug>-<n>-<hash>.png   HTML 图表的 2x 浅色截图，Astro 构建时原样拷进 dist
 *
 * 图表截图需要无头浏览器和中文字体，CI 里不渲染，只核对：
 *   - 文件名里的 hash 来自图表 HTML 源码。源码改了，hash 就对不上。
 *   - 本地 `npm run build`：缺图或图过期时，若找得到 Chrome 就自动重渲染（之后记得提交 public/md/img）；
 *     找不到 Chrome 就报错退出。
 *   - CI（环境变量 CI=true）：缺图报错退出；图过期只警告，继续用旧图，不挡住网站部署。
 *     设 EXPORT_MD_STRICT=1 可以让过期也报错。
 *
 * 用法：
 *   node scripts/export-md.mjs            生成 Markdown（必要时本地渲染图）
 *   node scripts/export-md.mjs --render   强制重渲染全部图表（需要先 astro build 出 dist）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkStringify from 'remark-stringify';
import { fromHtml } from 'hast-util-from-html';
import { toMdast } from 'hast-util-to-mdast';
import { toHast } from 'mdast-util-to-hast';
import { raw } from 'hast-util-raw';
import { select, selectAll } from 'hast-util-select';
import { toString as hastToString } from 'hast-util-to-string';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'src/content/post/zh');
const IMG_DIR = path.join(ROOT, 'public/md/img');
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = path.join(DIST, 'md');
const SITE = 'https://tangwin.github.io/blog'; // 与 site.config 的 site 一致（已含 base）
const SITE_TITLE = 'Peter 的技术笔记';
const RENDER_VERSION = 'v1'; // 改了截图参数（宽度、主题、缩放）就加一，触发全部重渲染
const RENDER_WIDTH = 800;

const args = new Set(process.argv.slice(2));
const FORCE_RENDER = args.has('--render');
const IN_CI = !!process.env.CI;
const STRICT = process.env.EXPORT_MD_STRICT === '1';

const mdParser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm);
const mdOut = unified().use(remarkGfm, { tablePipeAlign: false }).use(remarkStringify, {
  bullet: '-',
  fences: true,
  rule: '-',
  emphasis: '*',
  strong: '*',
  listItemIndent: 'one',
});

const postUrl = (slug) => `${SITE}/blog/${slug}/`;
const absUrl = (u, base) => {
  if (!u || /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(u)) return u;
  if (u.startsWith('/')) return new URL(u, 'https://tangwin.github.io').href;
  return new URL(u, base).href;
};

const isDiagramHtml = (v) => /^<div class="dg[\s"]/.test(v.trim());
const diagramHash = (html) =>
  crypto.createHash('sha256').update(RENDER_VERSION + '\n' + html.trim().replace(/\s+/g, ' ')).digest('hex').slice(0, 10);

function walk(node, fn, parent = null) {
  fn(node, parent);
  if (node.children) for (const c of [...node.children]) walk(c, fn, node);
}

/** 读一篇文章，返回 { slug, data, tree, diagrams }。diagrams 是需要截图的图表（表格类不算）。 */
function loadPost(file) {
  const slug = path.basename(file, '.md');
  const src = fs.readFileSync(file, 'utf8');
  const tree = mdParser.parse(src);
  const fm = tree.children.find((n) => n.type === 'yaml');
  const data = fm ? YAML.parse(fm.value) : {};
  const diagrams = [];
  for (const node of tree.children) {
    if (node.type !== 'html' || !isDiagramHtml(node.value)) continue;
    const hast = fromHtml(node.value, { fragment: true });
    if (select('table', hast)) continue; // 对比表转成 GFM 表格，不截图
    const n = diagrams.length;
    const hash = diagramHash(node.value);
    const title = hastToString(select('.dg-title', hast) || { type: 'text', value: '' }).trim();
    const alt = title || select('[aria-label]', hast)?.properties?.ariaLabel || `${slug} 图 ${n + 1}`;
    diagrams.push({ node, n, hash, alt, file: `${slug}-${n}-${hash}.png` });
  }
  return { slug, data, tree, diagrams, src };
}

/** 检查每张图的 PNG 状态：ok / stale（有旧图）/ missing。 */
function diagramStatus(post) {
  const existing = fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR) : [];
  return post.diagrams.map((d) => {
    if (existing.includes(d.file)) return { ...d, status: 'ok' };
    const old = existing.filter((f) => f.startsWith(`${post.slug}-${d.n}-`) && f.endsWith('.png')).sort();
    return old.length ? { ...d, status: 'stale', fallback: old.at(-1) } : { ...d, status: 'missing' };
  });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

/** 起一个只读静态服务，把 /blog/* 映射到 dist/*。 */
function serveDist() {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/blog/, '');
    let f = path.join(DIST, p);
    if (!f.startsWith(DIST)) return res.writeHead(403).end();
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** 用本机 Chrome 打开构建好的文章页，按顺序截取每张图表。 */
async function renderDiagrams(posts) {
  const executablePath = findChrome();
  if (!executablePath) throw new Error('找不到 Chrome/Chromium，无法渲染图表。可设置 CHROME_PATH。');
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist 不存在，先运行 astro build。');
  const { default: puppeteer } = await import('puppeteer-core');
  const server = await serveDist();
  const base = `http://127.0.0.1:${server.address().port}/blog`;
  const browser = await puppeteer.launch({ executablePath, args: ['--no-sandbox', '--font-render-hinting=none'] });
  fs.mkdirSync(IMG_DIR, { recursive: true });
  try {
    for (const post of posts) {
      if (!post.diagrams.length) continue;
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
      await page.evaluateOnNewDocument(() => localStorage.setItem('theme', 'light'));
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      await page.goto(`${base}/blog/${post.slug}/`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.dg', { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({
        content: `.fixed{display:none!important}
          .dg.__export{width:${RENDER_WIDTH}px!important;max-width:none!important;margin:0!important;box-sizing:border-box}`,
      });
      const handles = (await page.$$('.dg')).filter(Boolean);
      const imgHandles = [];
      for (const h of handles) if (!(await h.$('table'))) imgHandles.push(h);
      if (imgHandles.length !== post.diagrams.length)
        throw new Error(`${post.slug}: 页面上有 ${imgHandles.length} 张图，源码里有 ${post.diagrams.length} 张，对不上。`);
      for (const d of post.diagrams) {
        const h = imgHandles[d.n];
        await h.evaluate((el) => el.classList.add('__export'));
        await h.scrollIntoView();
        const out = path.join(IMG_DIR, d.file);
        await h.screenshot({ path: out });
        await h.evaluate((el) => el.classList.remove('__export'));
        // 删掉同一位置的旧图
        for (const f of fs.readdirSync(IMG_DIR))
          if (f !== d.file && f.startsWith(`${post.slug}-${d.n}-`) && f.endsWith('.png')) fs.rmSync(path.join(IMG_DIR, f));
        fs.mkdirSync(path.join(OUT_DIR, 'img'), { recursive: true });
        fs.copyFileSync(out, path.join(OUT_DIR, 'img', d.file));
        console.log(`  rendered ${d.file}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  // 删掉已不存在的文章或位置留下的图
  const keep = new Set(posts.flatMap((p) => p.diagrams.map((d) => d.file)));
  for (const f of fs.readdirSync(IMG_DIR)) if (f.endsWith('.png') && !keep.has(f)) fs.rmSync(path.join(IMG_DIR, f));
}

/** 对比表：.dg 里的 <table> 转成 标题段落 + GFM 表格。 */
function tableDiagramToMdast(html) {
  const hast = fromHtml(html, { fragment: true });
  const out = [];
  const titleEl = select('.dg-title', hast);
  if (titleEl) {
    const t = hastToString(titleEl).replace(/[，,]?\s*窄屏可以?左右滑动|（窄屏可左右滑动）/g, '').trim();
    out.push({ type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: t }] }] });
  }
  const table = select('table', hast);
  // 表体里的行标题 <th> 加粗
  for (const th of selectAll('tbody th', table)) {
    th.tagName = 'td';
    th.children = [{ type: 'element', tagName: 'strong', properties: {}, children: th.children }];
  }
  const md = toMdast({ type: 'root', children: [table] });
  out.push(...md.children);
  return out;
}

/** 把一个仍含 HTML 的块整体走一遍 mdast → hast → mdast，去掉标签、保留语义。 */
function blockWithoutHtml(block) {
  const hast = raw(toHast({ type: 'root', children: [block] }, { allowDangerousHtml: true }));
  return toMdast(hast).children;
}

function containsHtml(node) {
  let found = false;
  walk(node, (n) => {
    if (n.type === 'html') found = true;
  });
  return found;
}

/** 处理 <details>：<summary> 变成小标题，内容照常保留。 */
function expandDetails(children) {
  const out = [];
  for (const node of children) {
    if (node.type === 'html' && /^\s*<details[\s>]/i.test(node.value)) {
      const m = node.value.match(/<summary>([\s\S]*?)<\/summary>/i);
      if (m) out.push({ type: 'heading', depth: 3, children: [{ type: 'text', value: m[1].replace(/<[^>]+>/g, '').trim() }] });
      const rest = node.value.replace(/^\s*<details[^>]*>/i, '').replace(/<summary>[\s\S]*?<\/summary>/i, '').replace(/<\/details>\s*$/i, '').trim();
      if (rest) out.push({ type: 'html', value: rest });
      continue;
    }
    if (node.type === 'html' && /^\s*<\/details>\s*$/i.test(node.value)) continue;
    out.push(node);
  }
  return out;
}

function toExportMarkdown(post, statuses) {
  const { slug, data, tree } = post;
  const byNode = new Map(statuses.map((s) => [s.node, s]));
  let children = [];
  for (const node of tree.children) {
    if (node.type === 'yaml') continue;
    if (node.type === 'html' && isDiagramHtml(node.value)) {
      const st = byNode.get(node);
      if (st) {
        const file = st.status === 'ok' ? st.file : st.fallback;
        if (!file) throw new Error(`${slug}: 图 ${st.n} 没有 PNG`);
        children.push({ type: 'paragraph', children: [{ type: 'image', url: `${SITE}/md/img/${file}`, alt: st.alt }] });
      } else {
        children.push(...tableDiagramToMdast(node.value));
      }
      continue;
    }
    children.push(node);
  }
  children = expandDetails(children);
  children = children.flatMap((n) => (containsHtml(n) ? blockWithoutHtml(n) : [n]));

  const base = postUrl(slug);
  const root = { type: 'root', children };
  walk(root, (n) => {
    if ((n.type === 'link' || n.type === 'image' || n.type === 'definition') && n.url) n.url = absUrl(n.url, base);
  });

  const date = data.pubDate ? new Date(data.pubDate).toISOString().slice(0, 10) : '';
  const meta = [
    { type: 'text', value: '原文发布于 ' },
    { type: 'link', url: base, children: [{ type: 'text', value: SITE_TITLE }] },
    ...(date ? [{ type: 'text', value: `，${date}` }] : []),
    ...(data.tags?.length ? [{ type: 'text', value: `。标签 ${data.tags.join('、')}` }] : []),
  ];
  root.children.unshift(
    { type: 'heading', depth: 1, children: [{ type: 'text', value: data.title }] },
    { type: 'paragraph', children: meta },
  );
  // 表格分隔行统一写成 ---，部分编辑器不认单个 -
  return mdOut
    .stringify(root)
    .replace(/^\|(?: *:?-+:? *\|)+ *$/gm, (row) => row.replace(/(:?)-+(:?)/g, '$1---$2'));
}

/** 输出校验：重新解析，不允许出现 html 节点，图片和链接必须是绝对地址。 */
function verify(slug, md) {
  const errors = [];
  const tree = unified().use(remarkParse).use(remarkGfm).parse(md);
  walk(tree, (n) => {
    if (n.type === 'html') errors.push(`残留 HTML：${n.value.slice(0, 60)}`);
    if ((n.type === 'image' || n.type === 'link') && !/^(https?:|mailto:|#)/.test(n.url)) errors.push(`非绝对地址：${n.url}`);
  });
  if (errors.length) throw new Error(`${slug}.md 校验失败\n  ` + errors.join('\n  '));
}

async function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort();
  const posts = files.map((f) => loadPost(path.join(POSTS_DIR, f))).filter((p) => p.data.draft !== true);

  let statuses = posts.map(diagramStatus);
  const bad = statuses.flat().filter((s) => s.status !== 'ok');
  if (FORCE_RENDER || bad.length) {
    const chrome = findChrome();
    if (FORCE_RENDER || (!IN_CI && chrome)) {
      console.log(`[export-md] 渲染图表（${FORCE_RENDER ? '全部' : bad.map((b) => b.file).join(', ')}）`);
      await renderDiagrams(FORCE_RENDER ? posts : posts.filter((p) => bad.some((b) => b.file.startsWith(p.slug + '-'))));
      statuses = posts.map(diagramStatus);
      if (!IN_CI) console.log('[export-md] 图表已更新，记得提交 public/md/img/ 里的变化。');
    } else {
      const missing = bad.filter((s) => s.status === 'missing');
      const stale = bad.filter((s) => s.status === 'stale');
      for (const s of stale) console.warn(`${process.env.GITHUB_ACTIONS ? '::warning title=export-md::' : ''}[export-md] 警告：图表已改动但截图没更新，暂用旧图 ${s.fallback}（应为 ${s.file}）。本地运行 npm run export:md 后提交。`);
      if (missing.length || (stale.length && (STRICT || !IN_CI))) {
        for (const s of missing) console.error(`[export-md] 缺少图表截图 ${s.file}`);
        throw new Error('图表截图缺失或过期。在有 Chrome 的机器上运行 npm run export:md，然后提交 public/md/img/。');
      }
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const index = [];
  posts.forEach((post, i) => {
    const md = toExportMarkdown(post, statuses[i]);
    verify(post.slug, md);
    fs.writeFileSync(path.join(OUT_DIR, `${post.slug}.md`), md);
    index.push({ slug: post.slug, title: post.data.title, url: postUrl(post.slug), markdown: `${SITE}/md/${post.slug}.md` });
  });
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`[export-md] 导出 ${index.length} 篇 Markdown 到 dist/md/，图表 ${statuses.flat().length} 张`);
}

main().catch((e) => {
  console.error('[export-md] ' + e.message);
  process.exit(1);
});
