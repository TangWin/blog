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
npm run build    # 类型检查 + 构建 + 生成搜索索引，输出到 dist/
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

本站基于开源模板 ink-blog 改造（MIT License，见 `LICENSE.txt`）。
