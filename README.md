# Peter 的技术笔记

个人技术博客，记录 Java / 后端 / Agent 相关笔记。

- 线上地址：<https://tangwin.github.io/blog/>
- 技术栈：[Astro](https://astro.build/) + Tailwind CSS + Pagefind 全文搜索，评论使用 [Giscus](https://giscus.app/)
- 部署：推送到 `main` 后由 GitHub Actions（`.github/workflows/deploy.yml`）构建并发布到 GitHub Pages

## 本地开发

需要 Node.js 22.12+（见 `.nvmrc`）。

```bash
npm ci
npm run dev      # 本地预览 http://localhost:4321/blog/
npm run build    # 类型检查 + 构建 + 搜索索引 + 导出纯 Markdown，输出到 dist/
npm run export:md  # 强制重新截取全部图表 PNG（需要本机有 Chrome）
```

## 写文章

在 `src/content/post/zh/` 下新建 Markdown 文件，frontmatter 示例：

```yaml
---
title: 文章标题
description: 一句话摘要
tags: [Java]
pubDate: 2026-10-16
---
```

站点配置（标题、Giscus、统计等）在 `site.config.ts`。

## 导出纯 Markdown（转载用）

`npm run build` 的最后一步 `scripts/export-md.mjs` 会给每篇文章生成一份纯 Markdown，线上地址是
`https://tangwin.github.io/blog/md/<slug>.md`，文章页标题下有「Markdown 原文」链接。

- 只有标准 CommonMark/GFM，没有任何 HTML 标签。frontmatter 换成 H1 标题加一行原文链接。
- `<div class="dg">` 图表换成 PNG 图片（800px 宽、2x、浅色），对比表换成 GFM 表格，`<details>` 展开成普通小节。
- 图片和链接都是 `https://tangwin.github.io/blog/...` 绝对地址，复制到掘金、知乎、公众号编辑器都能显示。
- 构建时会重新解析输出，发现残留 HTML 或相对地址就让构建失败。

图表截图要无头浏览器和中文字体，所以 CI 不渲染，PNG 提交在 `public/md/img/`。
文件名里带图表 HTML 的 hash（`<slug>-<序号>-<hash>.png`），改了图表内容 hash 就变：

- 本地 `npm run build` 发现缺图或过期，会自动用本机 Chrome 重新截图（找不到 Chrome 就报错，可设 `CHROME_PATH`）。截完记得把 `public/md/img/` 一起提交。
- CI 里缺图直接失败；过期只出警告并沿用旧图，不挡网站部署。设 `EXPORT_MD_STRICT=1` 可让过期也失败。
- 改了 `.dg` 的样式想全部重截，运行 `npm run export:md`。

本站基于开源模板 ink-blog 改造（MIT License，见 `LICENSE.txt`）。
