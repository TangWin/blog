---
title: AI 中转站到底在干什么：我读了 Sub2API、AIClient2API、OneAPI/NewAPI 的源码
description: 同样是“OpenAI 兼容接口”，背后其实是三种完全不同的信任模型：转发 API Key、调度订阅账号、模拟官方客户端。我读完四个开源中转项目的源码，拆清楚它们的请求链路、风险在哪，以及想自建一个可信中转该抄什么、别抄什么。
tags:
  - API中转
  - LLM
  - 学习笔记
pubDate: 2026-09-08
---

> **TL;DR**
> 市面上的 AI 中转站都长着一样的“OpenAI 兼容”外壳，但上游拿的东西完全不同：有的拿厂商 API Key，有的拿订阅账号的登录态，有的干脆模拟官方客户端。真正的风险不在“能不能转发”，而在**凭据存在哪、出站请求由谁发、有没有闭源插件和指纹伪装**。想自建一个自己信得过的中转，骨架抄 OneAPI/NewAPI，Sub2API 和 AIClient2API 当“调度与协议转换”的教材看。

## 为什么要读这些代码

我是写 Java 后端的。用大模型多了，自然会碰到“中转站”：给你一个 `sk-xxx` 和一个 Base URL，接口和 OpenAI 一模一样，价格更便宜，还能调 Claude、Gemini。

问题是，我不太信这些服务。我的 prompt 和代码经过它，我的钱也在它那里。它到底怎么拿到上游能力的？凭据怎么存？出了问题会不会悄悄换一个“别人的号”给我用？

所以我想自建一个。但动手之前，先把主流开源实现读一遍：**Sub2API**、**AIClient2API**（下文简称 A2），再拿老牌的 **OneAPI** 和它的增强分支 **NewAPI** 做对照。本文只讲架构和风险，不涉及盗号、绕过订阅条款或倒卖额度。

先解释两个词：

- **中转站（API relay）**：一个 HTTP 服务。它对下游暴露和 OpenAI 一样的接口（比如 `/v1/chat/completions`），再把请求转给真正的模型提供方（上游）。
- **上游凭据**：中转站用来调用上游的“钥匙”。可能是厂商发的 API Key，也可能是某个账号的登录 token 或 cookie。**中转站的本质差异，几乎都在这把钥匙上。**

## 一个中转站的六层

不管哪个项目，拆开都差不多是这六层：

<div class="dg heti-skip" role="figure" aria-label="中转站的六层结构">
<span class="dg-title">图 1 · 中转站的六层（从下游请求进来，到上游返回）</span>
<div class="dg-layers">
<div class="dg-layer"><b>接入面</b><span>暴露 /v1/chat/completions 等兼容接口，支持 SSE 流式返回</span></div>
<div class="dg-layer"><b>下游鉴权</b><span>校验用户带来的 API Key / Bearer token</span></div>
<div class="dg-layer is-accent"><b>调度</b><span>决定这次请求用上游的哪个 Key / 哪个账号；粘性、权重、健康检查、失败切换</span></div>
<div class="dg-layer"><b>协议适配</b><span>OpenAI ↔ Claude ↔ Gemini ↔ 厂商私有协议之间互转</span></div>
<div class="dg-layer"><b>计量</b><span>统计 token、预扣再实扣、按倍率计费</span></div>
<div class="dg-layer"><b>管理面</b><span>后台：账号、分组、用户、支付、看板</span></div>
</div>
</div>

前两层和后两层，各家大同小异。**真正决定性质的是“调度”拿什么去调度**——也就是上游凭据是什么。

## 三种上游模式：这是全文最重要的一张图

<div class="dg heti-skip" role="figure" aria-label="三种上游模式">
<span class="dg-title">图 2 · 同一个“OpenAI 兼容”外壳，三种完全不同的上游</span>
<div class="dg-cards">
<div class="dg-card is-ok"><span class="dg-tag">① Key 转发</span><b>OneAPI / NewAPI</b><span>上游资产：厂商或代理发的 <b>API Key</b></span><span>做法：改 URL、请求头、请求体，调用公开的 HTTP API</span><span>风险：最低，都是官方文档化的接口</span></div>
<div class="dg-card is-warn"><span class="dg-tag">② 订阅账号池</span><b>Sub2API</b><span>上游资产：订阅账号的 <b>OAuth 登录态</b></span><span>做法：在一池账号里调度，用账号身份去打上游</span><span>风险：可能违反上游服务条款，凭据量大</span></div>
<div class="dg-card is-risk"><span class="dg-tag">③ 客户端模拟</span><b>AIClient2API</b><span>上游资产：<b>CLI / IDE / 浏览器</b>的登录态</span><span>做法：把请求拼得“像官方客户端”，包括 TLS 指纹</span><span>风险：最高，设计目标就是模拟</span></div>
</div>
</div>

我读完代码最大的收获就是这张图。很多讨论把这几个项目混为一谈，但它们解决的是不同的问题，风险也不在一个量级。自建时**先选模式，再抄模块**，别把三种硬套成一个模板。

## Sub2API：一个完整的“订阅账号池”网关

仓库：<https://github.com/Wei-Shaw/sub2api>（我读的是 `270eac6` 附近的版本）

它的定位很直白：平台给用户发 Key，平台自己拿一池订阅账号去打上游。README 里也自己写了：可能违反上游的服务条款，仅供学习。

技术栈是我比较熟悉的那一类：Go + Gin 做 HTTP，Ent 做 ORM，Wire 做依赖注入；PostgreSQL 存数据，Redis 存会话粘性；前端 Vue 3。它还内置了支付（易支付、支付宝、微信、Stripe 等），以及基于 HashiCorp go-plugin 的插件系统。

### 一个请求是怎么走的

以 `POST /v1/chat/completions` 为例。路由在 `backend/internal/server/routes/gateway.go` 的 `RegisterGatewayRoutes` 里，按 API Key 所属分组的平台分流。OpenAI 兼容这条路是这样的：

<div class="dg heti-skip" role="figure" aria-label="Sub2API 请求路径">
<span class="dg-title">图 3 · Sub2API：一次 chat/completions 请求</span>
<div class="dg-actors"><span class="dg-box">客户端</span><span class="dg-box">API Key 鉴权</span><span class="dg-box">Handler</span><span class="dg-box">Service</span><span class="dg-box">Redis</span><span class="dg-box">上游账号</span></div>
<div class="dg-seq">
<div class="dg-msg"><span class="dg-who">客户端 → 鉴权</span><span class="dg-text">带着 Bearer sk-xxx 请求 chat/completions</span></div>
<div class="dg-msg"><span class="dg-who">鉴权</span><span class="dg-text">加载 Key、用户、分组，检查余额（<code>api_key_auth.go</code>）</span></div>
<div class="dg-msg"><span class="dg-who">鉴权 → Handler</span><span class="dg-text">检查模型白名单，组合分组按模型路由到具体平台</span></div>
<div class="dg-msg"><span class="dg-who">Handler → Service</span><span class="dg-text">计算会话 hash，用于“粘性”</span></div>
<div class="dg-msg"><span class="dg-who">Service → Redis</span><span class="dg-text">同一会话尽量落到同一个账号</span></div>
<div class="dg-msg"><span class="dg-who">Service</span><span class="dg-text">选账号：优先级、RPM、时间窗口、利润控制</span></div>
<div class="dg-msg"><span class="dg-who">Service → 上游账号</span><span class="dg-text">以账号身份转发，流式返回</span></div>
<div class="dg-msg is-back"><span class="dg-who">上游 → 客户端</span><span class="dg-text">SSE 数据块原样流回</span></div>
<div class="dg-msg"><span class="dg-who">Service</span><span class="dg-text">异步记录用量、扣配额（<code>RecordUsage</code>）</span></div>
</div>
</div>

调度这块写得很扎实。粘性会话、分组白名单、按模型解析的“组合分组”、流式下的失败切换，结构都很清楚，值得学。

### 让我不放心的地方

1. **上游凭据是明文 JSON。** 账号表里 `credentials` 是一个 PostgreSQL `jsonb` 字段，里面放 API Key、OAuth token 或 cookie（见 `ent/schema/account.go`）。API 响应会脱敏，但我在 schema 和存储层都没找到落盘加密。这意味着**数据库备份一旦泄露，所有上游账号一起泄露**。
2. **插件可以是闭源二进制。** 插件走 go-plugin + gRPC，打包格式里可以带编译好的二进制。主进程持有真实的上游 Authorization，插件也不在操作系统级沙箱里。
3. **内置支付**，把资金和更多密钥也拉进了攻击面。
4. **TLS 指纹库**（`internal/pkg/tlsfingerprint`）——用来让出站流量更像官方客户端，合规和封号风险都在这里。
5. 部署文档 `deploy/EDGE_SECURITY.md` 专门提醒：信任转发 IP 的开关配错，IP 白名单就能被伪造。

说句公道话：这些都是“订阅账号池”这个产品目标带来的，不是代码写得差。它是一个功能非常完整的商业中转样本，只是信任面也最大。

## AIClient2API：把“只能在官方客户端用”的通道变成本地接口

仓库：<https://github.com/justlovemaki/AIClient2API>（我读的版本号是 3.4.8）

A2 的思路是另一回事。有些模型能力只在官方 CLI、IDE 插件或网页里能用。A2 把这些客户端的请求方式模拟出来，在本地暴露成 OpenAI / Claude / Gemini 兼容的接口。

它是纯 Node.js，没有用 Express，直接 `http.createServer`。架构上有几层值得一说：

- **Adapter**：每个上游一个适配器，统一 `generateContent` / 流式 / 列模型 / 刷新 token 这些动作。
- **Strategy + Converter**：按下游协议抽取模型名和是否流式，再在 OpenAI、Claude、Gemini 格式之间转换请求、响应和流式数据块。
- **Provider Pool**：一个凭据池，给每个节点打分（健康程度、最近使用、并发），失败就切换。
- **TLS sidecar**：一个 Go 写的小服务，用 `utls` 库的 `HelloChrome_Auto` 伪装成 Chrome 的 TLS 指纹，默认监听 9090 端口。

<div class="dg heti-skip" role="figure" aria-label="AIClient2API 请求路径">
<span class="dg-title">图 4 · AIClient2API：一次请求怎么变成“像官方客户端”的流量</span>
<div class="dg-chain"><span class="dg-box">OpenAI 格式请求</span><span class="dg-arrow"></span><span class="dg-box">路径首段选上游</span><span class="dg-arrow"></span><span class="dg-box">入站 Key 校验</span><span class="dg-arrow"></span><span class="dg-box">凭据池打分选节点</span><span class="dg-arrow"></span><span class="dg-box">协议转换</span><span class="dg-arrow"></span><span class="dg-box is-hit">拼客户端请求头 + OAuth</span><span class="dg-arrow"></span><span class="dg-box is-hit">经 TLS sidecar 出站</span><span class="dg-arrow"></span><span class="dg-box">转回 OpenAI SSE</span></div>
<div class="dg-return">失败：标记节点不健康，换一个凭据重试（认证错误默认最多切换 5 次；错误累计 10 次标记为不健康）</div>
</div>

协议转换和池化这两块，是我觉得 A2 最值得看的部分。分层干净，换一个上游只需要加 Adapter 和对应的 core。

### 弱点和风险

1. **登录态落盘。** OAuth token、cookie 存在 `configs/` 目录和用户家目录里。
2. **源码里内嵌了公开的 OAuth client 身份**——对“已安装应用”很常见，但它是一个固定身份。
3. **设计目标就是模拟客户端**，不是调用文档化的公开 API。服务条款和封号风险是内生的，没法靠配置消掉。
4. **默认管理密码是 `admin123`**（`src/ui-modules/auth.js` 里的 `DEFAULT_PASSWORD`）。部署时不改，等于没设。
5. TLS sidecar 对 Node 主进程来说是个半黑盒的出站通道。

## 四个项目放在一起看

<div class="dg heti-skip" role="figure" aria-label="四个中转项目对比">
<span class="dg-title">表 · 四个开源中转项目对比（窄屏可左右滑动）</span>
<div class="dg-cmp-wrap">
<table class="dg-cmp">
<thead><tr><th></th><th>OneAPI</th><th>NewAPI</th><th>Sub2API</th><th>AIClient2API</th></tr></thead>
<tbody>
<tr><th>一句话定位</th><td>API Key 聚合转发</td><td>OneAPI 增强版：网关 + 资产管理</td><td>订阅账号配额分发</td><td>客户端通道变本地兼容 API</td></tr>
<tr><th>许可证</th><td>MIT</td><td>AGPL-3.0</td><td>LGPL-3.0</td><td>GPL-3.0</td></tr>
<tr><th>技术栈</th><td>Go + Gin</td><td>Go + Gin</td><td>Go + Gin + Ent + Vue</td><td>Node.js 原生 http</td></tr>
<tr><th>上游凭据</th><td class="is-ok">厂商 API Key</td><td class="is-ok">API Key，局部支持 OAuth 渠道</td><td class="is-risk">订阅账号 OAuth</td><td class="is-risk">CLI / IDE / 浏览器登录态</td></tr>
<tr><th>适配核心</th><td>Adaptor 接口</td><td>channel + 跨协议转换</td><td>账号调度 + 协议转换</td><td>Adapter + Strategy + Converter</td></tr>
<tr><th>计费</th><td>额度 × 倍率</td><td>钱包、套餐、阶梯、缓存计费</td><td>账号配额切分 + 用户余额 / 支付</td><td>偏个人使用，弱多租户</td></tr>
<tr><th>选上游</th><td>分组 × 模型 × 渠道</td><td>更复杂的亲和、插件过滤</td><td>粘性 + 负载 + RPM + 利润</td><td>池打分 + 失败切换</td></tr>
</tbody>
</table>
</div>
</div>

OneAPI 的核心是一个 `Adaptor` 接口（`relay/adaptor/interface.go`）：`GetRequestURL`、`SetupRequestHeader`、`ConvertRequest`、`DoRequest`、`DoResponse`……每个厂商一个目录实现它。这是我见过最“老实”的设计：上游是什么、怎么改请求，一目了然。

有两个容易混淆的点：

- NewAPI 里的“订阅计费”指的是**用户买套餐**，和 Sub2API 那种“上游订阅账号池”不是一回事。
- NewAPI 甚至有一个 `relay/channel/sub2api` 渠道，可以把 Sub2API **当作一种上游挂进来**。也就是说，Key 网关和订阅池在生态里是可以层层嵌套的——你调用的中转，背后可能还是一个中转。

## 如果我要自建：最小可信内核

我的目标是“自己信得过、能审计”，所以内核刻意做小：

<div class="dg heti-skip" role="figure" aria-label="自建中转站的取舍">
<span class="dg-title">图 5 · 自建可信中转：做什么，不做什么</span>
<div class="dg-cards">
<div class="dg-card is-ok"><span class="dg-tag">必须有</span><span>只用 ① Key 转发模式</span><span>OpenAI 兼容接口 + 流式，行为可测试</span><span>自签下游 Key，不留弱默认值，支持 IP 白名单</span><span>上游 Key 落盘加密（或交给系统密钥链）</span><span>每个厂商一个 Adaptor 文件，不动态加载闭源代码</span><span>结构化日志（脱敏）+ 每请求 trace id + 用量落库</span><span>明确超时、有限重试，<b>绝不静默换到别人的账号</b></span></div>
<div class="dg-card is-risk"><span class="dg-tag">默认不做</span><span>订阅 OAuth 池、cookie 池、TLS 指纹伪装</span><span>多租户充值、支付、拼车分账</span><span>任意插件执行用户代码</span><span>“自动模拟最新官方客户端”</span><span>公开注册</span></div>
</div>
</div>

从这几个项目里，我会这样取舍：

| 项目 | 学什么 | 别抄什么 |
|------|--------|----------|
| OneAPI / NewAPI | Adaptor 接口、选渠道、预扣再结算的计费模型 | “整站直接当商用中转运营”的假设 |
| Sub2API | 粘性会话、分组白名单、组合分组路由、流式失败切换 | 明文凭据、闭源插件、内置支付、客户端指纹 |
| AIClient2API | Strategy / Converter 分层、凭据池打分与切换 | TLS 伪装、硬编码客户端身份、默认弱口令 |

下一步我打算这么走：先画一页“Key 转发最小内核”的架构图；只接一个合规上游，把流式跑通；协议转换和多 Key 负载均衡放到第二阶段再说。

## 我还没搞清楚的

- Sub2API 是否有我没搜到的字段级加密或 KMS 方案。
- Sub2API 官方 Docker 镜像里是否默认带了未开源的插件。
- 我读的 A2 版本里，Gemini CLI 适配器的注册被注释掉了（`src/providers/adapter.js`），原因不明，README 写的支持情况要自己验证。
- NewAPI 的插件执行面，我没有做安全审计级别的阅读。

## 写给想用或想做中转站的人

如果你只是**用**中转站：问清楚它属于哪种模式。是 Key 转发，还是账号池、客户端模拟？后两种意味着你的请求跑在别人的账号上，稳定性和合规性都没法保证。

如果你想**自建**：从 OneAPI 的 Adaptor 骨架开始，只接官方 Key，先把凭据存储和日志脱敏做对。Sub2API 和 AIClient2API 很值得读，但把它们当“调度与协议转换”的教材，而不是可以原样上线的模板。

不靠谱的地方，往往不在“会不会转发”，而在**钥匙放在哪、谁拿着钥匙出门**。

<details class="dg-more">
<summary>附：研读的代码版本与关键文件</summary>

- Sub2API：`Wei-Shaw/sub2api` @ `270eac6` 附近。路由 `backend/internal/server/routes/gateway.go`；鉴权 `backend/internal/server/middleware/api_key_auth.go`；账号表 `backend/ent/schema/account.go`；部署安全说明 `deploy/EDGE_SECURITY.md`。
- AIClient2API：`justlovemaki/AIClient2API` 3.4.8（commit `aaf30e2` 附近）。入口 `src/handlers/request-handler.js`；凭据池 `src/providers/provider-pool-manager.js`；默认配置 `src/core/config-manager.js`；TLS sidecar `tls-sidecar/`。
- OneAPI：`songquanpeng/one-api`，Adaptor 接口 `relay/adaptor/interface.go`。
- NewAPI：`QuantumNous/new-api`（原 Calcium-Ion/new-api），Sub2API 渠道 `relay/channel/sub2api`。

</details>
