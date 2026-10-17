---
title: 核心很小、能力外挂：我读 Hermes Agent 和 Agent Skills 规范的源码笔记
description: Hermes Agent 用一个共享的对话循环服务 CLI、TUI、消息机器人和定时任务，能力都放在边上；Agent Skills 是一个跨 Claude Code、Cursor、Hermes 通用的“技能文件夹”规范。我读完代码，讲清楚它们怎么工作、哪里设计得好、哪些地方不能当成安全边界。
tags:
  - AI-Agent
  - LLM
  - 学习笔记
pubDate: 2026-09-08
---

> **TL;DR**
> Hermes Agent 的核心只有一个对话循环，命令行、终端界面、聊天机器人网关、定时任务都共用它；新能力尽量做成技能、插件或 MCP，挂在边上，不改核心。Agent Skills 是一个很简单的开放规范：一个文件夹加一个 `SKILL.md`，启动时只加载名字和描述，用到时才读全文。Hermes 在这之上加了一层“Agent 自己写技能、后台自动整理”，很有意思，但要配审批，而且它的终端隔离和审批都不是真正的安全边界。

## 为什么要读这个

我在自己的环境里跑 Hermes Agent，把它接进了元宝群当机器人。接入时踩过一个坑：机器人能被 @ 到，就是不回话。最后查下来是群访问策略和多 profile 下的密钥作用域问题。

修好之后我想搞明白两件事：

1. 一条群消息到底经过了哪些环节，才走到模型那里？
2. Hermes 说自己支持 “Agent Skills”，还能自己写技能。这个“技能”到底是什么，和 Claude Code、Cursor 里的 skills 是一回事吗？

所以我把 Hermes 的源码（`NousResearch/hermes-agent`，v0.21.1，commit `c8aa560`）和 [agentskills.io](https://agentskills.io) 的规范仓库读了一遍。下面是笔记。

先定义几个词：

- **Agent**：能多轮调用工具（读文件、跑命令、搜索）来完成任务的大模型程序。
- **对话循环（agent loop）**：“调用模型 → 模型要用工具就执行 → 把结果塞回去 → 再调用模型”，直到模型给出最终回答。
- **Skill（技能）**：一份写给 Agent 看的操作说明书，告诉它某类任务怎么做，可以附带脚本。

## 一、Hermes 的形状：窄腰

Hermes 仓库根目录的 `AGENTS.md` 写了两条设计原则，我觉得是理解整个项目的钥匙：

- **按会话的 prompt cache 不能乱动。** 长对话会复用缓存；中途重建 system prompt 会让缓存失效，成本成倍上升。所以技能、工具、记忆这类会改 system prompt 的东西，都要“对缓存友好”。
- **核心是窄腰，能力放在边上。** 新渠道、新模型、新能力，优先做成边缘扩展，不往核心循环里塞。

画出来是这样：

<div class="dg heti-skip" role="figure" aria-label="Hermes 的窄腰架构">
<span class="dg-title">图 1 · Hermes 的窄腰：很多入口，一个核心，能力在边上</span>
<div class="dg-steps">
<div class="dg-fan"><span class="dg-box">命令行 CLI<small>cli.py</small></span><span class="dg-box">终端界面 TUI<small>ui-tui/</small></span><span class="dg-box">消息网关<small>gateway/</small></span><span class="dg-box">定时任务<small>cron/</small></span><span class="dg-box">桌面端<small>apps/desktop/</small></span></div>
<div class="dg-down"><span class="dg-arrow is-down">都调用同一个</span></div>
<span class="dg-box is-accent">AIAgent 对话循环<small>agent/conversation_loop.py · run_conversation</small></span>
<div class="dg-down"><span class="dg-arrow is-down">按需调用</span></div>
<div class="dg-fan"><span class="dg-box">Skills 技能<small>skills/、tools/skills_tool.py</small></span><span class="dg-box">工具注册表<small>tools/registry.py</small></span><span class="dg-box">插件 / MCP<small>plugins/</small></span><span class="dg-box">记忆<small>agent/memory_manager.py</small></span><span class="dg-box">终端后端<small>7 种</small></span></div>
</div>
</div>

这个形状我很认同。写后端的人都见过反面：每接一个新渠道就在核心里加一堆 if，最后谁都不敢动。Hermes 把“入口多”和“能力多”都推到边上，中间只留一个循环。

技术栈：Python 3.11–3.13，`uv` 管依赖；终端界面是 React + Ink；配置用 YAML，密钥放 `.env`。

## 二、在命令行里问一个问题，发生了什么

<div class="dg heti-skip" role="figure" aria-label="Hermes 命令行请求路径">
<span class="dg-title">图 2 · 命令行：一轮对话的完整路径</span>
<div class="dg-actors"><span class="dg-box">用户</span><span class="dg-box">HermesCLI</span><span class="dg-box">AIAgent</span><span class="dg-box">对话循环</span><span class="dg-box">工具执行</span><span class="dg-box">模型</span></div>
<div class="dg-seq">
<div class="dg-msg"><span class="dg-who">用户 → CLI</span><span class="dg-text">输入一句话或斜杠命令</span></div>
<div class="dg-msg"><span class="dg-who">CLI → AIAgent</span><span class="dg-text"><code>run_conversation(...)</code></span></div>
<div class="dg-msg"><span class="dg-who">AIAgent → 循环</span><span class="dg-text">先拿到本轮的执行“租约”（turn lease）</span></div>
<span class="dg-note">↻ 在预算内反复：</span>
<div class="dg-msg is-loop"><span class="dg-who">循环 → 模型</span><span class="dg-text">发送对话历史</span></div>
<div class="dg-msg is-loop"><span class="dg-who">循环 → 工具</span><span class="dg-text">模型要用工具：<code>handle_function_call</code> 执行</span></div>
<div class="dg-msg is-back is-loop"><span class="dg-who">工具 → 循环</span><span class="dg-text">工具结果追加进对话，再问模型</span></div>
<div class="dg-msg is-back"><span class="dg-who">循环 → CLI</span><span class="dg-text">模型不再调工具，返回最终回答（可流式）</span></div>
</div>
</div>

终端界面（TUI）走的是同一条路：前端通过 JSON-RPC 连到后端，后端还是同一个 `AIAgent`。消息网关和定时任务也一样。这就是“窄腰”的实际含义：**不管从哪进来，最后都是这一个循环。**

## 三、一条群消息怎么走到模型

这是我最关心的部分。通用的消息平台（比如 Telegram）是一个插件，继承 `BasePlatformAdapter`，收到消息后交给网关统一处理：前置钩子、鉴权、配对、媒体处理，然后进对话循环。

元宝（Yuanbao）是内置平台里中间件最完整的一个（`gateway/platforms/yuanbao.py`）。一条消息要依次经过这些中间件：

<div class="dg heti-skip" role="figure" aria-label="元宝消息中间件管线">
<span class="dg-title">图 3 · 元宝入站中间件管线（标红的两步决定了“机器人为什么不回话”）</span>
<div class="dg-chain"><span class="dg-box">解码</span><span class="dg-arrow"></span><span class="dg-box">提取字段</span><span class="dg-arrow"></span><span class="dg-box">撤回检查</span><span class="dg-arrow"></span><span class="dg-box">去重</span><span class="dg-arrow"></span><span class="dg-box">跳过自己</span><span class="dg-arrow"></span><span class="dg-box">会话路由</span><span class="dg-arrow"></span><span class="dg-box is-hit">访问控制 AccessGuard</span><span class="dg-arrow"></span><span class="dg-box">提取内容</span><span class="dg-arrow"></span><span class="dg-box">主人命令</span><span class="dg-arrow"></span><span class="dg-box">构建来源</span><span class="dg-arrow"></span><span class="dg-box is-hit">群 @ 检查 GroupAtGuard</span><span class="dg-arrow"></span><span class="dg-box">发言人标注</span><span class="dg-arrow"></span><span class="dg-box">媒体解析</span><span class="dg-arrow"></span><span class="dg-box is-accent">分发给 Agent</span></div>
</div>

两个关键环节：

- **访问控制**：私聊和群聊各有策略，可以是白名单、配对、开放或禁用。设成“开放”还需要额外的环境变量（如 `YUANBAO_ALLOW_ALL_USERS`）。不满足就**静默丢弃**，不会报错。
- **群 @ 检查**：群里没有 @ 机器人的消息，只会被“观察”记进上下文，不会触发回复。日志里会看到 `Group message observed (no @bot)`。

这套中间件管线我很喜欢。每一步只做一件事，每一步都能打日志。排查“为什么不回话”时，看日志停在哪一步就知道了。

## 四、多个机器人跑在一个进程里：Profile 和密钥作用域

Hermes 有 **profile** 的概念：每个 profile 是一个独立目录（默认在 `~/.hermes/profiles/<name>/`），有自己的配置、`.env`、技能和会话数据库，互不继承。

网关可以开 `multiplex_profiles`，**一个进程同时服务多个 profile**——比如一个群里挂好几个不同人设的机器人。

这里有个坑。多路复用时，进程的环境变量通常是默认 profile 的。副 profile 的白名单、“允许所有人”这类配置，要通过 `agent/secret_scope.py` 按 profile 读取。这个模块的设计是 **fail-closed**：读不到就失败，不会退回去借用默认 profile 的配置。

我觉得这个选择是对的。宁可不回话，也不能把 A 机器人的权限借给 B。代价是配置写错时表现为“静默不工作”，排查要靠日志。

## 五、终端隔离：别把它当成安全边界

Hermes 支持 7 种终端后端（`tools/terminal_tool_backends.py`）：`local`、`docker`、`singularity`、`modal`、`daytona`、`vercel_sandbox`、`ssh`。默认是 `local`，也就是直接在本机执行，**没有任何操作系统级边界**。

仓库的 `SECURITY.md` 说得很坦白：终端后端只约束 shell 和文件类工具；进程内的代码执行、MCP 子进程、插件、技能里的 import 都不受它约束。审批门控也只是启发式的，不是安全边界。真要隔离，得把整个 Hermes 进程放进容器。

如果你把 Hermes 接到了群聊这种别人也能发消息的地方，这一条值得认真对待。

## 六、Agent Skills：一个简单到有点意外的规范

[Agent Skills](https://agentskills.io) 是一个开放规范，Claude Code、Cursor、Hermes 都兼容。一个技能就是：

- 一个文件夹；
- 里面一个必需的 `SKILL.md`：YAML 头部 + Markdown 正文；
- 可选的 `scripts/`、`references/`、`assets/`。

头部只有两个必填字段：

| 字段 | 要求 |
|------|------|
| `name` | 最多 64 个字符，小写字母加连字符，最好和文件夹同名 |
| `description` | 最多 1024 个字符，写清楚**做什么、什么时候用** |

可选字段有 `license`、`compatibility`、`metadata`，以及实验性的 `allowed-tools`（预先批准可用的工具）。

它真正聪明的地方是**渐进披露（progressive disclosure）**：

<div class="dg heti-skip" role="figure" aria-label="技能的渐进披露">
<span class="dg-title">图 4 · 渐进披露：只在需要时才把内容放进上下文</span>
<div class="dg-row"><span class="dg-box">① 目录<small>启动时只加载 name + description，每个技能几十个 token</small></span><span class="dg-arrow"></span><span class="dg-box is-accent">② 激活<small>任务匹配上了，才读完整的 SKILL.md</small></span><span class="dg-arrow"></span><span class="dg-box">③ 资源<small>需要时再读脚本和参考文档</small></span></div>
</div>

所以你可以装几十个技能，平时几乎不占上下文。这和前面说的“别乱动 prompt cache”也是一致的。

技能放在哪，规范没有强制，各产品自己约定。跨工具共用的话，项目级放 `.agents/skills/`，用户级放 `~/.agents/skills/`。同名时项目级优先；不信任的仓库，先审核再加载。

三家的差异，放在一张表里看：

<div class="dg heti-skip" role="figure" aria-label="三个产品的技能实现对比">
<span class="dg-title">表 · Claude Code、Cursor、Hermes 的技能实现（窄屏可左右滑动）</span>
<div class="dg-cmp-wrap">
<table class="dg-cmp">
<thead><tr><th></th><th>Claude Code</th><th>Cursor</th><th>Hermes</th></tr></thead>
<tbody>
<tr><th>技能目录</th><td><code>~/.claude/skills/</code>、<code>.claude/skills/</code></td><td><code>.agents/</code> 或 <code>.cursor/skills/</code>，也会扫描 <code>.claude</code>、<code>.codex</code></td><td><code>~/.hermes/skills/</code>；项目目录需要先信任；还有技能 Hub</td></tr>
<tr><th>扩展字段</th><td><code>context: fork</code>、<code>allowed-tools</code>、动态命令等</td><td><code>paths</code> 等</td><td><code>platforms</code>、<code>metadata.hermes.*</code></td></tr>
<tr><th>特点</th><td>人写为主，产品扩展多</td><td>monorepo 可按子目录生效</td><td class="is-ok">Agent 能自己写技能，后台自动整理</td></tr>
<tr><th>调用方式</th><td>Skill 工具或 <code>/技能名</code></td><td>自动匹配或 <code>/</code></td><td><code>skills_list</code> → <code>skill_view</code>，或斜杠命令</td></tr>
</tbody>
</table>
</div>
</div>

规范里的六个字段可以跨产品用。各家的私有字段，对方可能忽略，也可能报错。想写一份到处能用的技能，就只用规范字段，私有的放进 `metadata` 自己的命名空间。

## 七、Hermes 的特别之处：Agent 自己写技能

这是 Hermes 和另外两家最不一样的地方。

- **加载**：技能通过 `skills_list` 和 `skill_view` 两个工具渐进加载。用斜杠命令调用技能时，技能内容作为一条**用户消息**注入（`agent/skill_commands.py`），不改 system prompt——还是为了保住缓存。
- **自写**：完成一个复杂任务后，Agent 可以用 `skill_manage` 把这次的做法存成新技能。配置里有 `skills.write_approval`，打开后写技能前要你批准。
- **Curator（整理器）**：`agent/curator.py` 会在 Agent 空闲时自动运行，根据使用记录把技能在“活跃 / 过期 / 归档”之间移动，还可能合并、修补技能。它有几条硬规则：只碰它负责管理的技能（内置技能默认也在其中，Hub 装的从不清理）；**从不删除，只归档**，可以恢复；被固定（pin）的技能完全不受影响。
- **护栏**：`tools/skills_guard.py` 做启发式检查，Hub 安装有隔离区。

我对“Agent 自己写技能”的看法是两面的：

<div class="dg heti-skip" role="figure" aria-label="人写技能与 Agent 自写技能对比">
<span class="dg-title">图 5 · 人写技能 vs Agent 自写技能</span>
<div class="dg-cards">
<div class="dg-card is-ok"><span class="dg-tag">人写、可移植</span><span>能审计，能进 git，Cursor / Claude / Hermes 通用</span><span>缺点：更新慢，要人维护</span><span><b>适合</b>：核心操作流程、要发布给别人的技能</span></div>
<div class="dg-card is-warn"><span class="dg-tag">Agent 自写</span><span>从真实成功的做法里长出来，贴合个人习惯</span><span>缺点：容易重复、半成品多；技能里有指令也有脚本，等于供应链风险</span><span><b>适合</b>：个人的“过程记忆”；务必打开 write_approval</span></div>
</div>
</div>

还有一个伴生项目 [SkillClaw](https://github.com/AMAP-ML/SkillClaw)：任务中 Hermes 写技能，任务后由一个“进化服务”去重、提质。格式还是 `SKILL.md`。它和 Hermes 自带的 curator 同时开时谁负责什么，我还没实际验证。

装任何技能之前，我会过一遍这个清单：来源和 hash → 通读 `SKILL.md` → 检查 `scripts/` → 看它要什么权限、`allowed-tools` 写了什么 → 项目是否已信任 → 先在沙箱里跑。这篇文章讲得很好：[Install agent skills without getting owned](https://www.nyk.dev/blog/install-agent-skills-without-getting-owned)。

## 八、风险汇总

| 方面 | 风险 | 怎么控制 |
|------|------|----------|
| 凭据 | `.env` 里的机器人 token、模型 Key | `.env` 只放密钥；多路复用用密钥作用域；子进程清理环境变量 |
| 插件 | 和 Agent 进程同等权限 | 安装前人工审 |
| 网关 | 陌生人远程驱动你的 Agent | 每个平台配白名单；缺白名单时默认拒绝 |
| 技能 | import 和脚本可以执行任意代码 | Skills Guard、隔离区、写入审批、curator 只归档不删 |
| 终端 | `local` 后端没有系统边界 | 换 docker 等后端；真正的边界是整进程沙箱 |
| 审批 | 启发式判断 | 别当安全边界用 |

## 我还不确定的

- curator 在默认发行版里的触发频率和阈值，取决于配置，我没逐项核对默认值。
- 各消息平台插件的中间件和元宝那套是否同构。Telegram 那条路明显更“薄”。
- 规范里实验性的 `allowed-tools`，各客户端支持程度不一。

## 谁该关心，下一步做什么

如果你在**自己跑 Agent**，尤其是接进了群聊：先确认终端后端不是裸的 `local`，再确认每个平台都有白名单。这两件事比任何提示词技巧都重要。

如果你在**写技能**：只用规范里的字段，放 `.agents/skills/`，Cursor、Claude Code、Hermes 都能用。描述字段写清楚“什么时候用”，这决定了它能不能被正确触发。

如果你在**设计自己的 Agent 系统**：Hermes 的三个做法值得抄——一个核心循环、多入口挂载；网关用中间件管线表达策略，每层可观测；多租户密钥按作用域读，读不到就失败。

我自己的下一步，是把手上的运维操作流程整理成几个人写的 `.agents/skills/` 技能，让不同工具共用一份。

<details class="dg-more">
<summary>附：研读的代码版本与关键文件</summary>

- Hermes Agent：`NousResearch/hermes-agent` v0.21.1 @ `c8aa560`（2026-09-08）。设计原则 `AGENTS.md`；对话循环 `agent/conversation_loop.py`；工具 `model_tools.py`、`tools/registry.py`；元宝网关 `gateway/platforms/yuanbao.py`；密钥作用域 `agent/secret_scope.py`；终端后端 `tools/terminal_tool_backends.py`；技能 `tools/skills_tool.py`、`agent/skill_commands.py`、`agent/curator.py`、`tools/skills_guard.py`；安全说明 `SECURITY.md`。
- Agent Skills 规范：<https://agentskills.io> · <https://github.com/agentskills/agentskills>
- SkillClaw：<https://github.com/AMAP-ML/SkillClaw>

</details>
