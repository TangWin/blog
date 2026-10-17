---
title: AI 中转站到底在干什么？我读了 Sub2API、AIClient2API、OneAPI 和 NewAPI 的源码
description: 四个开源中转项目对外都是同一套 OpenAI 兼容接口，背后拿去调上游的东西却分成三种，厂商 API Key、订阅账号的登录态、模拟官方客户端。我把它们的源码对着读了一遍，讲清楚请求怎么走、风险落在哪，以及想自建一个信得过的中转该抄哪部分。
tags:
  - API中转
  - LLM
  - 学习笔记
pubDate: 2026-09-08
---

> **TL;DR**
> 这几个中转站对外长得一模一样，都是 OpenAI 兼容接口。差别在上游。OneAPI 和 NewAPI 拿的是厂商发的 API Key，Sub2API 拿的是订阅账号的登录态，AIClient2API 干脆把请求伪装成官方客户端发出去。风险几乎都出在凭据放在哪、出站请求由谁发、有没有闭源插件和指纹伪装。我要是自建，骨架照 OneAPI 来，另外两个项目当调度和协议转换的参考书读。

中转站这东西，用大模型的人多半碰过。对方给你一个 `sk-xxx` 和一个 Base URL，接口跟 OpenAI 一样，价格便宜一截，Claude 和 Gemini 也能调。

我一直不太放心。prompt 和代码都要从它那里过，钱也押在它那里。它的上游能力从哪来，凭据怎么存，哪天出了问题会不会悄悄换一个别人的号给我用，这些我都不知道。

想自己搭一个之前，我先把几个主流开源实现读了一遍。主角是 [Sub2API](https://github.com/Wei-Shaw/sub2api) 和 [AIClient2API](https://github.com/justlovemaki/AIClient2API)（下文简称 A2），对照组是老牌的 [OneAPI](https://github.com/songquanpeng/one-api) 和它的增强分支 [NewAPI](https://github.com/QuantumNous/new-api)。这篇只聊架构和风险，盗号、绕过订阅条款、倒卖额度这些不碰。

先交代两个词。中转站就是一个 HTTP 服务，对下游露出跟 OpenAI 一样的接口，比如 `/v1/chat/completions`，再把请求转给真正提供模型的那一方，也就是上游。上游凭据是中转站拿去调上游用的东西，可能是厂商发的 API Key，也可能是某个账号的登录 token 或 cookie。几个项目性质上的差别，基本都落在这一项上。

## 一个中转站大致分六层

四个项目拆开来，层次差不多。

<div class="dg heti-skip" role="figure" aria-label="中转站的六层结构">
<span class="dg-title">图 1 · 中转站的六层，从下游请求进来到上游返回</span>
<div class="dg-layers">
<div class="dg-layer"><b>接入面</b><span>露出 /v1/chat/completions 这类兼容接口，支持 SSE 流式返回</span></div>
<div class="dg-layer"><b>下游鉴权</b><span>校验用户带来的 API Key 或 Bearer token</span></div>
<div class="dg-layer is-accent"><b>调度</b><span>这次请求用上游哪个 Key、哪个账号，涉及粘性、权重、健康检查和失败切换</span></div>
<div class="dg-layer"><b>协议适配</b><span>在 OpenAI、Claude、Gemini 和厂商私有协议之间互转</span></div>
<div class="dg-layer"><b>计量</b><span>统计 token，先预扣再实扣，按倍率计费</span></div>
<div class="dg-layer"><b>管理面</b><span>后台里的账号、分组、用户、支付和看板</span></div>
</div>
</div>

上面两层和下面两层，各家写法大同小异。决定一个项目是什么性质的，是调度那一层手里攥着什么，也就是上游凭据的来路。

## 同样的外壳，三种上游

读完代码，我觉得全文最要紧的就是下面这张图。

<div class="dg heti-skip" role="figure" aria-label="三种上游模式">
<span class="dg-title">图 2 · 同一个 OpenAI 兼容外壳，三种上游</span>
<div class="dg-cards">
<div class="dg-card is-ok"><span class="dg-tag">① Key 转发</span><b>OneAPI 和 NewAPI</b><span>上游拿的是厂商或代理商发的 <b>API Key</b></span><span>改一改 URL、请求头和请求体，调用公开的 HTTP API</span><span>风险最低，走的都是官方写进文档的接口</span></div>
<div class="dg-card is-warn"><span class="dg-tag">② 订阅账号池</span><b>Sub2API</b><span>上游拿的是订阅账号的 <b>OAuth 登录态</b></span><span>在一池账号里挑一个，用它的身份去打上游</span><span>可能违反上游服务条款，手里攥的凭据也多</span></div>
<div class="dg-card is-risk"><span class="dg-tag">③ 客户端模拟</span><b>AIClient2API</b><span>上游拿的是 <b>CLI、IDE 或浏览器</b>里的登录态</span><span>把请求拼得像官方客户端，连 TLS 指纹都仿</span><span>风险最高，项目本来就是冲着模拟去的</span></div>
</div>
</div>

网上聊中转站，常把这几个项目放在一起比。它们要解决的事各不相同，风险也差着量级。自建的话，我会先定用哪种模式，再去挑模块抄，三种混成一个模板只会越改越乱。

## Sub2API，一套完整的订阅账号池网关

Sub2API 的定位写得很明白。平台给用户发 Key，自己拿一池订阅账号去调上游。它的 README 也自己承认了，这么做可能违反上游的服务条款，仅供学习。

技术栈是写后端的人很熟的那一套。Go 和 Gin 处理 HTTP，Ent 做 ORM，Wire 做依赖注入，PostgreSQL 存数据，Redis 记会话粘性，前端用 Vue 3。支付是内置的，易支付、支付宝、微信、Stripe 都接了。插件系统基于 HashiCorp 的 go-plugin。

### 一次请求怎么走

拿 `POST /v1/chat/completions` 举例。网关路由先看这把 API Key 属于哪个分组，再按分组的平台分流。走 OpenAI 兼容这条路时，顺序是这样的。

<div class="dg heti-skip" role="figure" aria-label="Sub2API 请求路径">
<span class="dg-title">图 3 · Sub2API 处理一次 chat/completions 请求</span>
<div class="dg-actors"><span class="dg-box">客户端</span><span class="dg-box">API Key 鉴权</span><span class="dg-box">Handler</span><span class="dg-box">Service</span><span class="dg-box">Redis</span><span class="dg-box">上游账号</span></div>
<div class="dg-seq">
<div class="dg-msg"><span class="dg-who">客户端 → 鉴权</span><span class="dg-text">带着 Bearer sk-xxx 请求 chat/completions</span></div>
<div class="dg-msg"><span class="dg-who">鉴权</span><span class="dg-text">加载 Key、用户和分组，检查余额够不够</span></div>
<div class="dg-msg"><span class="dg-who">鉴权 → Handler</span><span class="dg-text">检查模型白名单，组合分组按模型路由到具体平台</span></div>
<div class="dg-msg"><span class="dg-who">Handler → Service</span><span class="dg-text">算出会话 hash，后面靠它做粘性</span></div>
<div class="dg-msg"><span class="dg-who">Service → Redis</span><span class="dg-text">同一个会话尽量落到同一个账号上</span></div>
<div class="dg-msg"><span class="dg-who">Service</span><span class="dg-text">按优先级、RPM、时间窗口和利润控制挑账号</span></div>
<div class="dg-msg"><span class="dg-who">Service → 上游账号</span><span class="dg-text">用账号身份转发，流式返回</span></div>
<div class="dg-msg is-back"><span class="dg-who">上游 → 客户端</span><span class="dg-text">SSE 数据块原样流回去</span></div>
<div class="dg-msg"><span class="dg-who">Service</span><span class="dg-text">异步记用量，扣配额</span></div>
</div>
</div>

调度写得很扎实。粘性会话、分组白名单、按模型解析的组合分组、流式过程里的失败切换，结构都清楚，我会拿来学。

### 读完不放心的几处

1. **上游凭据是明文 JSON。** 账号表里有一个 PostgreSQL 的 `jsonb` 字段叫 credentials，API Key、OAuth token、cookie 都塞在里面。接口返回时会脱敏，可我在表结构和存储层都没找到落盘加密。数据库备份一旦泄露，所有上游账号会一起泄露。
2. **插件可以是闭源二进制。** 插件走 go-plugin 加 gRPC，打包格式允许夹带编译好的程序。主进程手里有真实的上游 Authorization，插件也没有关进操作系统级的沙箱。
3. **支付是内置的**，资金和更多密钥也跟着进了攻击面。
4. **代码里有一个专门的 TLS 指纹库**，用途是让出站流量更像官方客户端，合规和封号的风险都在这里。
5. 它的部署文档专门提醒过，信任转发 IP 的那个开关配错了，IP 白名单可以被伪造。

这些问题都是订阅账号池这个产品目标带出来的，我不觉得代码写得差。它是一个功能很全的商业中转样本，同时也是信任面最大的那一个。

## AIClient2API，把只能在官方客户端里用的通道搬到本地

A2 走的是另一条路。有些模型能力只能在官方 CLI、IDE 插件或网页里用，A2 把这些客户端的请求方式模拟出来，在本机露出 OpenAI、Claude、Gemini 兼容的接口。

它用纯 Node.js 写，没上 Express，直接 `http.createServer`。架构里有几块值得单独说说。

- **Adapter**。每个上游一个适配器，生成内容、流式输出、列模型、刷新 token 这些动作都统一起来。
- **Strategy 和 Converter**。先按下游协议取出模型名、判断是不是流式，再在 OpenAI、Claude、Gemini 三种格式之间转换请求、响应和流式数据块。
- **凭据池**。给每个节点打分，看健康程度、最近有没有用过、当前并发多少，出错就换一个。
- **TLS sidecar**。一个 Go 写的小服务，用 utls 库把 TLS 握手伪装成 Chrome，默认监听 9090 端口。

<div class="dg heti-skip" role="figure" aria-label="AIClient2API 请求路径">
<span class="dg-title">图 4 · AIClient2API 怎样把一次请求变成像官方客户端的流量</span>
<div class="dg-chain"><span class="dg-box">OpenAI 格式请求</span><span class="dg-arrow"></span><span class="dg-box">按路径首段选上游</span><span class="dg-arrow"></span><span class="dg-box">校验入站 Key</span><span class="dg-arrow"></span><span class="dg-box">凭据池打分选节点</span><span class="dg-arrow"></span><span class="dg-box">协议转换</span><span class="dg-arrow"></span><span class="dg-box is-hit">拼客户端请求头和 OAuth</span><span class="dg-arrow"></span><span class="dg-box is-hit">经 TLS sidecar 发出</span><span class="dg-arrow"></span><span class="dg-box">转回 OpenAI 的 SSE</span></div>
<div class="dg-return">出错时把节点标成不健康，换一个凭据重试。认证错误默认最多换 5 次，累计 10 次错误就标记为不健康</div>
</div>

协议转换和凭据池是我觉得 A2 最值得读的两块。分层干净，接一个新上游只需要补一个 Adapter 和对应的实现。

### 弱点和风险

1. **登录态直接落盘**，OAuth token 和 cookie 存在配置目录和用户家目录里。
2. **源码里写死了公开的 OAuth client 身份。** 已安装的客户端应用这么干很常见，但它终归是一个写死的固定身份。
3. **它的设计目标就是模拟客户端**，调用的也不是写进文档的公开 API。服务条款和封号风险跟着设计来，配置改不掉。
4. **默认管理密码是 `admin123`。** 部署时不改，等于没设。
5. TLS sidecar 对 Node 主进程来说，是一条看不太清的出站通道。

## 四个项目放一起比

<div class="dg heti-skip" role="figure" aria-label="四个中转项目对比">
<span class="dg-title">表 · 四个开源中转项目对比，窄屏可以左右滑动</span>
<div class="dg-cmp-wrap">
<table class="dg-cmp">
<thead><tr><th></th><th>OneAPI</th><th>NewAPI</th><th>Sub2API</th><th>AIClient2API</th></tr></thead>
<tbody>
<tr><th>定位</th><td>API Key 聚合转发</td><td>OneAPI 增强版，网关加资产管理</td><td>订阅账号配额分发</td><td>把客户端通道变成本地兼容 API</td></tr>
<tr><th>许可证</th><td>MIT</td><td>AGPL-3.0</td><td>LGPL-3.0</td><td>GPL-3.0</td></tr>
<tr><th>技术栈</th><td>Go 和 Gin</td><td>Go 和 Gin</td><td>Go、Gin、Ent、Vue</td><td>Node.js 原生 http</td></tr>
<tr><th>上游凭据</th><td class="is-ok">厂商 API Key</td><td class="is-ok">API Key，部分渠道支持 OAuth</td><td class="is-risk">订阅账号 OAuth</td><td class="is-risk">CLI、IDE、浏览器登录态</td></tr>
<tr><th>适配方式</th><td>统一的 Adaptor 接口</td><td>渠道加跨协议转换</td><td>账号调度加协议转换</td><td>Adapter、Strategy、Converter</td></tr>
<tr><th>计费</th><td>额度乘倍率</td><td>钱包、套餐、阶梯、缓存计费</td><td>账号配额切分，用户余额和支付</td><td>偏个人用，多租户弱</td></tr>
<tr><th>怎么选上游</th><td>分组、模型、渠道三者匹配</td><td>更复杂的亲和与插件过滤</td><td>粘性、负载、RPM、利润</td><td>凭据池打分加失败切换</td></tr>
</tbody>
</table>
</div>
</div>

OneAPI 的核心是一个 Adaptor 接口，里面就是拼请求地址、设请求头、转换请求体、发请求、解析响应这几个方法，每个厂商一个目录去实现。这是我读到的最老实的设计，上游是谁、请求怎么改，打开就能看懂。

还有两个地方容易搞混。NewAPI 里说的订阅计费，指的是用户买套餐，跟 Sub2API 那种上游订阅账号池没关系。NewAPI 甚至专门做了一个 Sub2API 渠道，可以把 Sub2API 当成一种上游接进来。Key 网关和订阅池能一层套一层，你调用的中转背后，可能还是一个中转。

## 要是我自己搭

我要的是自己信得过、能审计的东西，所以内核刻意做小。

<div class="dg heti-skip" role="figure" aria-label="自建中转站的取舍">
<span class="dg-title">图 5 · 自建可信中转，做哪些，不做哪些</span>
<div class="dg-cards">
<div class="dg-card is-ok"><span class="dg-tag">要做</span><span>只用 ① Key 转发模式</span><span>OpenAI 兼容接口加流式，行为能测</span><span>下游 Key 自己签，不留弱默认值，支持 IP 白名单</span><span>上游 Key 落盘加密，或者交给系统密钥链</span><span>每个厂商一个 Adaptor 文件，不动态加载闭源代码</span><span>日志结构化并脱敏，每个请求带 trace id，用量落库</span><span>超时写死，重试有上限，<b>绝不悄悄换到别人的账号</b></span></div>
<div class="dg-card is-risk"><span class="dg-tag">先不做</span><span>订阅 OAuth 池、cookie 池、TLS 指纹伪装</span><span>多租户充值、支付、拼车分账</span><span>让插件执行用户代码</span><span>自动模拟最新版官方客户端</span><span>开放注册</span></div>
</div>
</div>

从这几个项目里挑东西，我的取舍是这样的。

| 项目 | 学什么 | 别照搬什么 |
|------|--------|----------|
| OneAPI 和 NewAPI | Adaptor 接口、选渠道、先预扣再结算的计费 | 把整站直接拿去当商用中转运营 |
| Sub2API | 粘性会话、分组白名单、组合分组路由、流式失败切换 | 明文凭据、闭源插件、内置支付、客户端指纹 |
| AIClient2API | Strategy 和 Converter 的分层、凭据池打分与切换 | TLS 伪装、写死的客户端身份、默认弱口令 |

接下来我打算先画一页 Key 转发最小内核的架构图，只接一个合规上游，把流式跑通。协议转换和多 Key 负载均衡留到第二步。

## 还没弄清楚的

- Sub2API 有没有我没搜到的字段级加密或 KMS 方案。
- Sub2API 官方的 Docker 镜像里，会不会默认带着没开源的插件。
- 我读的那一版 A2 里，Gemini CLI 适配器的注册被注释掉了，原因我没查到。README 里写的支持情况，用之前最好自己试一下。
- NewAPI 的插件执行那部分，我没有按安全审计的标准去读。

## 最后几句

只是**用**中转站的话，先问清楚它属于哪种模式。Key 转发之外的两种，意味着你的请求跑在别人的账号上，稳定性和合规都没人担保。

想**自建**的话，从 OneAPI 的 Adaptor 骨架起步，只接官方 Key，先把凭据存储和日志脱敏做对。Sub2API 和 A2 很值得读，拿它们学调度和协议转换就好，原样上线我不建议。
