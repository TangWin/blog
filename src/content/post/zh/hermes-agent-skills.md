---
title: 核心很小，能力挂在边上。我读 Hermes Agent 和 Agent Skills 规范的笔记
description: Hermes Agent 让命令行、终端界面、消息机器人和定时任务共用一个对话循环，能力都挂在边上。Agent Skills 是 Claude Code、Cursor、Hermes 都认的技能文件夹规范。我把两边的代码和规范读了一遍，记下它们怎么工作、哪里设计得好，以及哪些东西别当成安全边界。
tags:
  - AI-Agent
  - LLM
  - 学习笔记
pubDate: 2026-09-08
---

> **TL;DR**
> Hermes Agent 的核心就一个对话循环，命令行、终端界面、聊天机器人网关和定时任务都调它。新能力尽量做成技能、插件或 MCP 挂在外面，核心不动。Agent Skills 这个开放规范简单得有点意外，一个文件夹加一个 `SKILL.md`，启动时只加载名字和描述，用到了才读全文。Hermes 在上面多做了一层，让 Agent 自己写技能，后台再自动整理。这个想法我觉得很有意思，用的话要打开审批。另外，它的终端隔离和审批都算不上安全边界。

## 为什么要读这个

我在自己的环境里跑 Hermes Agent，把它接进了元宝群当机器人。接入时踩过一个坑，机器人能被 @ 到，就是不回话。最后查下来是群访问策略和多 profile 下的密钥作用域问题。

修好之后，我还有两件事想弄明白。

1. 一条群消息从进来到交给模型，中间到底过了哪些环节？
2. Hermes 说自己支持 Agent Skills，还能自己写技能。这里的技能是什么东西，跟 Claude Code、Cursor 里的 skills 是一回事吗？

于是我把 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 的源码和 [Agent Skills](https://agentskills.io) 的规范对着读了一遍。

先说清楚几个词。Agent 指能多轮调用工具来完成任务的大模型程序，工具包括读文件、跑命令、搜索这些。对话循环是 Agent 的主流程，先调模型，模型要用工具就去执行，把结果塞回对话再调模型，一直转到模型给出最终回答。Skill 也叫技能，是一份写给 Agent 看的操作说明，告诉它某类任务怎么做，可以附带脚本。

## 一、Hermes 长什么样

Hermes 仓库根目录有一份给开发者看的设计说明，里面有两条原则。整个项目为什么长成现在这样，从这两条差不多都能推出来。

- **按会话的 prompt cache 不能乱动。** 长对话会复用缓存，中途重建 system prompt 会让缓存失效，成本成倍往上涨。技能、工具、记忆这些会改 system prompt 的东西，都得照顾缓存。
- **核心做成窄腰，能力放在边上。** 新渠道、新模型、新能力，优先做成边缘扩展，尽量不往核心循环里塞。

<div class="dg heti-skip" role="figure" aria-label="Hermes 的窄腰架构">
<span class="dg-title">图 1 · Hermes 的窄腰，入口很多，核心一个，能力在边上</span>
<div class="dg-steps">
<div class="dg-fan"><span class="dg-box">命令行 CLI</span><span class="dg-box">终端界面 TUI</span><span class="dg-box">消息网关</span><span class="dg-box">定时任务</span><span class="dg-box">桌面端</span></div>
<div class="dg-down"><span class="dg-arrow is-down">都调用同一个</span></div>
<span class="dg-box is-accent">AIAgent 对话循环</span>
<div class="dg-down"><span class="dg-arrow is-down">按需调用</span></div>
<div class="dg-fan"><span class="dg-box">Skills 技能</span><span class="dg-box">工具注册表</span><span class="dg-box">插件和 MCP</span><span class="dg-box">记忆</span><span class="dg-box">终端后端<small>7 种</small></span></div>
</div>
</div>

这个形状我很认同。反面的例子大家都见过，每接一个新渠道就在核心里加一堆 if，最后谁都不敢碰。Hermes 把入口和能力都推到了边上，中间只留一个循环。

技术栈方面，Python 支持 3.11 到 3.13，依赖用 `uv` 管。终端界面是 React 加 Ink 写的，配置用 YAML，密钥放在 `.env`。

## 二、在命令行里问一句话，后面发生了什么

<div class="dg heti-skip" role="figure" aria-label="Hermes 命令行请求路径">
<span class="dg-title">图 2 · 命令行里一轮对话的完整路径</span>
<div class="dg-actors"><span class="dg-box">用户</span><span class="dg-box">HermesCLI</span><span class="dg-box">AIAgent</span><span class="dg-box">对话循环</span><span class="dg-box">工具执行</span><span class="dg-box">模型</span></div>
<div class="dg-seq">
<div class="dg-msg"><span class="dg-who">用户 → CLI</span><span class="dg-text">输入一句话或斜杠命令</span></div>
<div class="dg-msg"><span class="dg-who">CLI → AIAgent</span><span class="dg-text">把这句话交给 AIAgent 开始一轮对话</span></div>
<div class="dg-msg"><span class="dg-who">AIAgent → 循环</span><span class="dg-text">先拿到本轮的执行租约 turn lease</span></div>
<span class="dg-note">↻ 在预算内反复</span>
<div class="dg-msg is-loop"><span class="dg-who">循环 → 模型</span><span class="dg-text">发送对话历史</span></div>
<div class="dg-msg is-loop"><span class="dg-who">循环 → 工具</span><span class="dg-text">模型要用工具，就去执行对应的工具调用</span></div>
<div class="dg-msg is-back is-loop"><span class="dg-who">工具 → 循环</span><span class="dg-text">工具结果追加进对话，再问模型</span></div>
<div class="dg-msg is-back"><span class="dg-who">循环 → CLI</span><span class="dg-text">模型不再调工具，返回最终回答，可以流式输出</span></div>
</div>
</div>

终端界面走的也是这条路。前端通过 JSON-RPC 连到后端，后端还是同一个 AIAgent，消息网关和定时任务同样如此。窄腰落到代码里就是这个样子，不管从哪个入口进来，最后都进这一个循环。

## 三、一条群消息怎么走到模型

这部分我最关心。通用的消息平台，比如 Telegram，是以插件形式接进来的，收到消息后交给网关统一处理，依次过前置钩子、鉴权、配对和媒体处理，再进对话循环。

元宝是内置平台里中间件最完整的一个。一条消息要按顺序过下面这些中间件。

<div class="dg heti-skip" role="figure" aria-label="元宝消息中间件管线">
<span class="dg-title">图 3 · 元宝入站中间件管线，标红的两步决定机器人回不回话</span>
<div class="dg-chain"><span class="dg-box">解码</span><span class="dg-arrow"></span><span class="dg-box">提取字段</span><span class="dg-arrow"></span><span class="dg-box">撤回检查</span><span class="dg-arrow"></span><span class="dg-box">去重</span><span class="dg-arrow"></span><span class="dg-box">跳过自己</span><span class="dg-arrow"></span><span class="dg-box">会话路由</span><span class="dg-arrow"></span><span class="dg-box is-hit">访问控制 AccessGuard</span><span class="dg-arrow"></span><span class="dg-box">提取内容</span><span class="dg-arrow"></span><span class="dg-box">主人命令</span><span class="dg-arrow"></span><span class="dg-box">构建来源</span><span class="dg-arrow"></span><span class="dg-box is-hit">群 @ 检查 GroupAtGuard</span><span class="dg-arrow"></span><span class="dg-box">发言人标注</span><span class="dg-arrow"></span><span class="dg-box">媒体解析</span><span class="dg-arrow"></span><span class="dg-box is-accent">分发给 Agent</span></div>
</div>

标红的两步，我当时查问题时盯得最久。

- **访问控制。** 私聊和群聊各有一套策略，可选白名单、配对、开放或禁用。想设成开放，还得额外配一个环境变量，比如 `YUANBAO_ALLOW_ALL_USERS`。条件不满足，消息会被**静默丢弃**，不报任何错。
- **群 @ 检查。** 群里没有 @ 机器人的消息只会被观察，记进上下文，不会触发回复。日志里能看到 `Group message observed (no @bot)`。

这套管线我很喜欢。每一步只做一件事，每一步都能打日志。机器人不回话的时候，看日志停在哪一步，基本就知道问题在哪。

## 四、一个进程里跑多个机器人

Hermes 有 **profile** 的概念。每个 profile 是一个独立目录，默认放在 `~/.hermes/profiles/<name>/` 下面，有自己的配置、`.env`、技能和会话数据库，彼此不继承。

网关打开 `multiplex_profiles` 之后，**一个进程可以同时服务多个 profile**，比如在一个群里挂好几个不同人设的机器人。

这里有个坑。多路复用时，进程的环境变量通常属于默认 profile，副 profile 的白名单、允许所有人这类配置，要靠专门的密钥作用域模块按 profile 去读。这个模块是 **fail-closed** 的，读不到就直接失败，不会退回去借默认 profile 的配置。

这个选择我觉得对。宁可不回话，也不能把 A 机器人的权限借给 B。代价是配置一旦写错，表现就是静默不工作，只能翻日志排查。

## 五、终端隔离别当成安全边界

Hermes 支持 7 种终端后端，分别是 `local`、`docker`、`singularity`、`modal`、`daytona`、`vercel_sandbox` 和 `ssh`。默认的 `local` 直接在本机执行，**没有任何操作系统级的边界**。

项目的安全说明写得很坦白。终端后端只管得住 shell 和文件类工具，进程内的代码执行、MCP 子进程、插件、技能里的 import 都不归它管。审批门控也只是启发式判断，算不上安全边界。要隔离，得把整个 Hermes 进程放进容器。

Hermes 一旦接进群聊这种别人也能发消息的地方，这一条就得认真对待。

## 六、Agent Skills，一个简单得有点意外的规范

[Agent Skills](https://agentskills.io) 是一个开放规范，Claude Code、Cursor、Hermes 都兼容。一个技能由这几样东西组成。

- 一个文件夹
- 文件夹里必须有一个 `SKILL.md`，开头是 YAML 头部，后面是 Markdown 正文
- 可选的 `scripts/`、`references/`、`assets/` 目录

头部只有两个必填字段。

| 字段 | 要求 |
|------|------|
| `name` | 最多 64 个字符，小写字母加连字符，最好和文件夹同名 |
| `description` | 最多 1024 个字符，写清楚**做什么、什么时候用** |

可选字段有 `license`、`compatibility`、`metadata`，还有一个实验性的 `allowed-tools`，用来预先批准技能可以用哪些工具。

我觉得它设计得最巧的一点是**渐进披露**，英文叫 progressive disclosure。

<div class="dg heti-skip" role="figure" aria-label="技能的渐进披露">
<span class="dg-title">图 4 · 渐进披露，需要时才把内容放进上下文</span>
<div class="dg-row"><span class="dg-box">① 目录<small>启动时只加载 name 和 description，每个技能几十个 token</small></span><span class="dg-arrow"></span><span class="dg-box is-accent">② 激活<small>任务匹配上了，才读完整的 SKILL.md</small></span><span class="dg-arrow"></span><span class="dg-box">③ 资源<small>需要时再读脚本和参考文档</small></span></div>
</div>

所以装几十个技能，平时也几乎不占上下文，跟前面那条别乱动 prompt cache 的原则也对得上。

技能放在哪，规范没有硬性规定，由各个产品自己约定。想跨工具共用，项目级的放 `.agents/skills/`，用户级的放 `~/.agents/skills/`，同名时项目级优先。来自不信任仓库的技能，先审一遍再加载。

<div class="dg heti-skip" role="figure" aria-label="三个产品的技能实现对比">
<span class="dg-title">表 · Claude Code、Cursor、Hermes 的技能实现，窄屏可以左右滑动</span>
<div class="dg-cmp-wrap">
<table class="dg-cmp">
<thead><tr><th></th><th>Claude Code</th><th>Cursor</th><th>Hermes</th></tr></thead>
<tbody>
<tr><th>技能目录</th><td><code>~/.claude/skills/</code>、<code>.claude/skills/</code></td><td><code>.agents/</code> 或 <code>.cursor/skills/</code>，也会扫描 <code>.claude</code>、<code>.codex</code></td><td><code>~/.hermes/skills/</code>，项目目录要先信任，另有技能 Hub</td></tr>
<tr><th>扩展字段</th><td><code>context: fork</code>、<code>allowed-tools</code>、动态命令等</td><td><code>paths</code> 等</td><td><code>platforms</code>、<code>metadata.hermes.*</code></td></tr>
<tr><th>特点</th><td>以人写为主，产品扩展多</td><td>monorepo 里可以按子目录生效</td><td class="is-ok">Agent 能自己写技能，后台自动整理</td></tr>
<tr><th>调用方式</th><td>Skill 工具或 <code>/技能名</code></td><td>自动匹配或 <code>/</code></td><td><code>skills_list</code> 再 <code>skill_view</code>，或者斜杠命令</td></tr>
</tbody>
</table>
</div>
</div>

规范里的六个字段可以跨产品用。各家的私有字段，换个产品可能被忽略，也可能报错。想写一份到处都能用的技能，就只用规范字段，私有的放进 `metadata` 下面自己的命名空间。

## 七、Hermes 的特别之处是 Agent 自己写技能

Hermes 跟另外两家最不一样的地方在这里。

- **加载。** 技能靠 `skills_list` 和 `skill_view` 两个工具渐进加载。用斜杠命令调用技能时，技能内容作为一条**用户消息**插进对话，system prompt 不动，还是为了保住缓存。
- **自己写。** 做完一个复杂任务，Agent 可以用 `skill_manage` 把这次的做法存成新技能。配置里有个 `skills.write_approval`，打开后写技能之前要你点头。
- **Curator 整理器。** Agent 空闲时它会自动跑，按使用记录把技能在活跃、过期、归档三种状态之间挪，也可能合并或修补技能。它守几条硬规矩。只碰归它管的技能，内置技能默认也算在内，从 Hub 装的从不清理。它**从不删除，只归档**，归档的还能恢复。被固定（pin）的技能它完全不碰。
- **护栏。** 有一个 Skills Guard 做启发式检查，从 Hub 安装的技能会先进隔离区。

让 Agent 自己写技能，好处坏处我都看得到。

<div class="dg heti-skip" role="figure" aria-label="人写技能与 Agent 自写技能对比">
<span class="dg-title">图 5 · 人写的技能和 Agent 自己写的技能</span>
<div class="dg-cards">
<div class="dg-card is-ok"><span class="dg-tag">人写、可移植</span><span>能审计，能进 git，Cursor、Claude、Hermes 都能用</span><span>短处是更新慢，要有人维护</span><span><b>适合</b>核心操作流程，以及要发给别人用的技能</span></div>
<div class="dg-card is-warn"><span class="dg-tag">Agent 自写</span><span>从真正做成过的事情里长出来，贴合个人习惯</span><span>短处是容易重复，半成品多。技能里既有指令又有脚本，等于多了一条供应链风险</span><span><b>适合</b>当个人的过程记忆用，记得打开 write_approval</span></div>
</div>
</div>

还有一个伴生项目叫 [SkillClaw](https://github.com/AMAP-ML/SkillClaw)。任务进行中由 Hermes 写技能，任务结束后交给一个进化服务去重、提质，格式仍然是 `SKILL.md`。它跟 Hermes 自带的 curator 同时开着时怎么分工，我还没实际验证过。

装任何技能之前，我会按顺序过一遍。先看来源和 hash，再通读 `SKILL.md`，检查 `scripts/` 里有什么，看它要哪些权限、`allowed-tools` 写了什么，确认项目已经被信任，最后先在沙箱里跑一次。这方面有一篇文章写得很好，[Install agent skills without getting owned](https://www.nyk.dev/blog/install-agent-skills-without-getting-owned)。

## 八、风险汇总

| 方面 | 风险 | 怎么控制 |
|------|------|----------|
| 凭据 | `.env` 里的机器人 token 和模型 Key | `.env` 只放密钥，多路复用时用密钥作用域，子进程清理环境变量 |
| 插件 | 和 Agent 进程权限相同 | 安装前人工审 |
| 网关 | 陌生人远程驱动你的 Agent | 每个平台配白名单，缺白名单时默认拒绝 |
| 技能 | import 和脚本可以执行任意代码 | Skills Guard、隔离区、写入审批，curator 只归档不删 |
| 终端 | `local` 后端没有系统边界 | 换成 docker 等后端，要可靠隔离就把整个进程放进沙箱 |
| 审批 | 启发式判断 | 别当安全边界用 |

## 我还不确定的

- curator 默认多久触发一次、阈值是多少，取决于配置，默认值我没逐项核对。
- 其他消息平台插件的中间件是不是跟元宝同一套结构。Telegram 那条路明显薄很多。
- 规范里实验性的 `allowed-tools`，各家客户端支持得参差不齐。

## 谁该关心，下一步做什么

**自己在跑 Agent**，尤其是接进了群聊的，先确认终端后端不是裸的 `local`，再确认每个平台都配了白名单。这两件事比任何提示词技巧都要紧。

**在写技能**的话，只用规范里的字段，放进 `.agents/skills/`，Cursor、Claude Code、Hermes 都能用。描述字段里写清楚什么时候该用它，能不能被正确触发就看这一句。

**在设计自己的 Agent 系统**，Hermes 有几处做法值得照着学。一个核心循环挂多个入口。网关用中间件管线表达策略，每一层都能观测。多租户的密钥按作用域读，读不到就失败。

我自己的下一步，是把手上的运维操作流程整理成几个人写的 `.agents/skills/` 技能，让不同工具共用一份。
