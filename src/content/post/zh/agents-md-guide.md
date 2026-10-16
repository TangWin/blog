---
title: AGENTS.md 怎么写：Matt Pocock 指南要点
description: AGENTS.md 每次请求都会加载，所以要尽量小：只放一句话项目描述、包管理器和非标准构建命令，其余用渐进披露放进链接文档。整理自 Matt Pocock 的 A Complete Guide To AGENTS.md。
tags:
  - AI-Agent
  - 方法论
pubDate: 2026-10-16
---

> 来源：Matt Pocock，[A Complete Guide To AGENTS.md](https://www.aihero.dev/a-complete-guide-to-agents-md)；以及他的 [Dictionary of AI Coding · AGENTS.md 词条](https://github.com/mattpocock/dictionary-of-ai-coding/blob/main/dictionary/AGENTS.md.md)。

## AGENTS.md 是什么

一个提交进 Git 的 Markdown 文件，用来定制 AI 编码 agent 在仓库里的行为。它被放在对话历史的最前面、紧挨着 system prompt。Claude Code 读的是 `CLAUDE.md`，可以用软链让各工具共用一份：

```bash
ln -s AGENTS.md CLAUDE.md
```

## 核心问题：它每次请求都会加载

- **每个 token 在每次请求里都要付费**，不管和当前任务有没有关系。
- **指令预算有限**：前沿推理模型大约只能稳定遵循 150–200 条指令，小模型更少。指令越多，任何一条被遵守的概率越低。
- **过时文档会“毒化”上下文**：人看到旧文档会怀疑，agent 会照着错路径自信地去找。尤其别写具体文件路径，改写“能力和项目形状”；领域概念比路径稳定，但也要轻写。

文件变大的典型循环：agent 做了你不喜欢的事 → 加一条规则 → 重复几个月 → 变成一团“泥球”。

**不要用初始化脚本自动生成 AGENTS.md**——生成的内容追求面面俱到，而这些本该渐进披露。

## 根目录只放最少的东西

1. **一句话项目描述**（相当于角色提示），例如：`This is a React component library for accessible data visualization.`
2. **包管理器**（如果不是 npm），例如：`This project uses pnpm workspaces.`（也可以用 `corepack` 让系统自己报警，省预算）
3. **非标准的构建 / 类型检查命令**

就这些，其余都放到别处。

## 渐进披露（Progressive Disclosure）

把语言规范、测试约定等拆成单独文件，根文件里只轻轻引用一句：

```markdown
For TypeScript conventions, see docs/TYPESCRIPT.md
```

不用 “ALWAYS”、不用全大写强调。好处：只有写 TypeScript 时才加载这些规则，其他任务不浪费 token。文档之间还可以继续嵌套引用（`TYPESCRIPT.md` → `TESTING.md` → 具体测试工具），也可以链到外部官方文档。Agent Skills 是另一种渐进披露形式（参见 [Hermes × Agent Skills 笔记](../hermes-agent-skills/)）。

## Monorepo：嵌套 AGENTS.md

子目录里的 AGENTS.md 会和根目录合并：

| 层级 | 内容 |
|------|------|
| 根目录 | monorepo 的用途、如何在包之间导航、共享工具（如 pnpm workspaces） |
| 包目录 | 该包的用途、技术栈、包内约定 |

每一层都别塞满——agent 会同时看到所有合并后的文件。

## 一键瘦身 Prompt（意译）

让 agent 按渐进披露重构现有 AGENTS.md：

1. **找矛盾**：列出互相冲突的指令，逐条问我保留哪个；
2. **提取必要项**：一句话描述、包管理器、非标准构建命令、真正每个任务都相关的内容；
3. **分组其余内容**：按 TypeScript 约定、测试、API 设计、Git 流程等分类，各建一个文件；
4. **输出结构**：最小化的根 AGENTS.md（带链接）+ 各分文件 + 建议的 `docs/` 目录；
5. **标记删除**：冗余的（agent 本来就知道）、太模糊无法执行的、过于显然的（如“写干净的代码”）。

原文英文 prompt 见[原文末尾](https://www.aihero.dev/a-complete-guide-to-agents-md)。

## 词条补充：什么时候该加一行

Matt 的 AI Coding 词典对 AGENTS.md 的定义：harness 在会话开始时载入上下文窗口的文件，是项目给 agent 的“常驻简报”。

- 模型是无状态的，上一个会话里的纠正下一个会话就没了。**同一件事纠正过 agent 两次，它就是 AGENTS.md 的候选行。**
- 适合写的是 **agent 从代码里推不出来的东西**：构建/测试命令、代码里看不出的约定、硬约束（如“永远不要改生成的 client”）。简短、陈述式——它是简报，不是文档。
- **避免**：把本该渐进披露的内容（如整份风格指南）塞进来；那应该放到 skill 或上下文指针后面。

## 放在哪：决策表

| 位置 | 什么时候用 |
|------|-----------|
| 根 AGENTS.md | 和仓库里每一个任务都相关 |
| 单独文件 | 只和某个领域相关（TypeScript、测试等） |
| 嵌套文档树 | 可以分层组织的内容 |

理想的 AGENTS.md：小、聚焦、指向别处。
