---
title: AI 中转站架构深挖：Sub2API、AIClient2API 与 OneAPI/NewAPI 对照
description: 拆解三种上游信任模型（Key-Adaptor / 订阅账号池 / 客户端模拟），走读 Sub2API 与 AIClient2API 的请求链路、调度与风险面，并给出自建最小可信内核清单。
tags:
  - API中转
  - LLM
  - 学习笔记
pubDate: 2026-09-08
---

> 研究对象：`Wei-Shaw/sub2api`、`justlovemaki/AIClient2API`（A2）  
> 对照：`songquanpeng/one-api`、`Calcium-Ion/new-api`（QuantumNous）  
> 性质：**学习向架构研读**，不含自建代码。  
> 边界：只谈开源架构与信任面；不涉及盗号、绕过订阅 ToS、未授权倒卖额度。

---

## 1. 分层总览：中转站在干什么

把「客户端以为自己在打 OpenAI」这件事拆开，通常有六层：

| 层 | 职责 | 典型实现 |
|----|------|----------|
| **接入面** | 暴露 `/v1/chat/completions` 等兼容端点，流式 SSE | Gin / 纯 Node HTTP |
| **下游鉴权** | 校验用户打来的 API Key / Bearer | 中间件 / 插件 |
| **调度** | 选上游「哪一张卡 / 哪一个号」 | 粘性会话、权重、健康检查、failover |
| **协议适配** | OpenAI ↔ Claude ↔ Gemini ↔ 厂商私有协议 | Adaptor / Converter |
| **计量** | Token 统计、预扣/实扣、倍率 | Usage log / BillingSession |
| **管理面** | 账号、分组、用户、支付、看板 | Web Admin |

**三种上游范式（后面对照的核心）：**

```text
① Key-Adaptor（OneAPI / NewAPI）
   上游资产 = 厂商/代理 API Key
   适配方式 = 改 URL/头/体，调公开 HTTP API

② 订阅账号池（Sub2API 主叙事）
   上游资产 = 订阅登录态 / OAuth refresh
   适配方式 = 账号调度 + 模拟官方客户端流量

③ 客户端模拟（AIClient2API 主叙事）
   上游资产 = CLI/IDE/浏览器登录态
   适配方式 = 拼出「像官方客户端」的请求（含 TLS 指纹）
```

自建时先选范式，再抄模块；**三种不要硬套成同一套模板**。

---

## 2. Sub2API 模块级走读

**仓库：** https://github.com/Wei-Shaw/sub2api  
**研读版本：** 约 `270eac6`  
**定位：** 订阅配额分发网关——用户拿平台发的 Key，平台用账号池去打上游。

### 2.1 技术栈

| 层 | 选型 |
|----|------|
| 后端 | Go、Gin、Ent ORM、Google Wire |
| 前端 | Vue 3 + Vite + Tailwind + Pinia |
| 存储 | PostgreSQL 15+、Redis 7+ |
| 部署 | Docker Compose / install 脚本 / systemd |
| 支付 | EasyPay / 支付宝 / 微信 / Stripe / Airwallex（内置） |
| 插件 | HashiCorp go-plugin + gRPC；`.s2plugin` **可含闭源二进制** |

README 自行声明：可能违反上游 ToS，仅供学习。

### 2.2 目录与职责

| 路径 | 一句话 |
|------|--------|
| `backend/cmd/server` | 进程入口 + DI 装配 |
| `backend/internal/handler` | HTTP：Gateway / OpenAIGateway / admin / payment |
| `backend/internal/service` | 选号、粘性、转发、用量、分组、利润控制 |
| `backend/internal/middleware` | API Key 鉴权、限流、JWT、ingress |
| `backend/ent` | Account / APIKey / Group / UsageLog / Payment… |
| `backend/internal/pkg/{openai,claude,gemini,oauth,tlsfingerprint}` | 协议与指纹库 |
| `backend/pkg/pluginapi` | 插件协议与安全边界文档 |
| `frontend/` | 管理/用户 UI |
| `deploy/` | Compose、EDGE_SECURITY、datamanagementd |
| `docs/` | COMPOSITE_GROUPS、PAYMENT、PLUGIN |

### 2.3 请求全路径：`POST /v1/chat/completions`

路由：`backend/internal/server/routes/gateway.go`  
按 **API Key 所属 Group 的 platform** 分流：

- OpenAI 兼容组（openai/grok/kimi/zhipu/deepseek/minimax）→ `OpenAIGatewayHandler.ChatCompletions`
- 其它（Anthropic/Gemini/Antigravity 等）→ `GatewayHandler.ChatCompletions`（经协议转换链）

**OpenAI 兼容主路径：**

<div class="dg heti-skip" role="figure" aria-label="图 · Sub2API：OpenAI 兼容主路径">
<span class="dg-title">图 · Sub2API：OpenAI 兼容主路径</span>
<div class="dg-actors"><span class="dg-box ">客户端</span><span class="dg-box ">APIKeyAuth</span><span class="dg-box ">OpenAIGatewayHandler</span><span class="dg-box ">OpenAIGatewayService</span><span class="dg-box ">Redis 粘性</span><span class="dg-box ">上游账号</span><span class="dg-box ">RecordUsage</span></div>
<div class="dg-seq">
<div class="dg-msg "><span class="dg-who">客户端 → APIKeyAuth</span><span class="dg-text">Bearer sk-xxx + chat/completions</span></div>
<div class="dg-msg "><span class="dg-who">APIKeyAuth → APIKeyAuth</span><span class="dg-text">加载 Key / User / Group，计费准入</span></div>
<div class="dg-msg "><span class="dg-who">APIKeyAuth → Handler</span><span class="dg-text">过白名单 / composite 路由</span></div>
<div class="dg-msg "><span class="dg-who">Handler → Handler</span><span class="dg-text">读 body、安全审计、并发槽</span></div>
<div class="dg-msg "><span class="dg-who">Handler → Service</span><span class="dg-text">GenerateSessionHash</span></div>
<div class="dg-msg "><span class="dg-who">Service → Redis</span><span class="dg-text">粘性绑定 / 选号</span></div>
<div class="dg-msg "><span class="dg-who">Service → Service</span><span class="dg-text">SelectAccountWithScheduler：RPM / 窗口 / 利润控制</span></div>
<div class="dg-msg "><span class="dg-who">Service → 上游账号</span><span class="dg-text">ForwardAsChatCompletions（流式）</span></div>
<div class="dg-msg is-back"><span class="dg-who">上游账号 → 客户端</span><span class="dg-text">SSE chunks</span></div>
<div class="dg-msg "><span class="dg-who">Service → RecordUsage</span><span class="dg-text">异步记用量 / 扣配额</span></div>
</div>
</div>

| 步骤 | 关键符号 / 文件 |
|------|----------------|
| 路由挂载 `/v1` | `routes/gateway.go` `RegisterGatewayRoutes` |
| API Key 鉴权 | `server/middleware/api_key_auth.go` |
| 模型白名单 + composite | `GroupModelAllowlist`；`docs/COMPOSITE_GROUPS.md` |
| Handler | `handler/openai_chat_completions.go` |
| 粘性 hash | `GenerateSessionHash`（`openai_gateway_scheduling.go`） |
| 选号 | `SelectAccountWithSchedulerForCapability`（`openai_account_scheduler.go`） |
| 转发 | `ForwardAsChatCompletions`（`openai_gateway_chat_completions.go`） |
| 计费 | `RecordUsage`（`openai_gateway_usage.go`） |

Anthropic 组同 URL 支路：`GatewayHandler.ChatCompletions` → `SelectAccountWithLoadAwareness` → `ForwardAsChatCompletions`（CC→Responses→Anthropic）→ `RecordUsage`。

### 2.4 上游账号模型

**账号类型**（`domain/constants.go`）：`oauth` / `setup-token` / `apikey` / `upstream` / `bedrock` / `service_account`  

**凭据：** `accounts.credentials` **JSONB**（api_key、OAuth token、cookie 等）。API 响应有脱敏；**研读未见账号凭据 at-rest 加密**（TOTP 另有 AES）。  

**调度：** priority、RPM、session window、临时不可调度、failover 排除集、粘性（Redis）、利润控制 veto。  

**分组：** Key ↔ Group（platform、倍率、模型白名单）；**Composite Group** 按模型解析到具体 platform。

### 2.5 Sub2API 信任 / 风险面

1. 上游 OAuth/Key **明文存 PG**，备份即全泄露  
2. 主进程（及 OAuth **出站插件**）持真实 Authorization；插件非 OS sandbox  
3. `.s2plugin` 闭源二进制、官方 Docker/Release 供应链  
4. 内置支付扩大资金与密钥面  
5. TLS fingerprint / 客户端模拟 → 合规与封号风险（README 已提示）  
6. `trust_forwarded_ip` 配错可伪造 IP ACL（见 `deploy/EDGE_SECURITY.md`）  
7. 产品目标本身就是「订阅配额分发」——运营合规由自建者承担  

---

## 3. AIClient2API（A2）模块级走读

**仓库：** <https://github.com/justlovemaki/AIClient2API>（文档亦称 AIClient-2-API）  
**研读版本：** 约 `aaf30e2`，VERSION **3.4.8**  
**定位：** 把「原本只能在官方客户端里用的模型通道」模拟成请求，封装成 **本地 OpenAI/Claude/Gemini 兼容接口**。

### 3.1 技术栈

| 层 | 选型 |
|----|------|
| 运行时 | Node.js ≥20；**无 Express**，纯 `http.createServer` |
| 依赖 | axios、undici、google-auth-library、ws、openai/ai-sdk… |
| UI | `static/` 原生 HTML/JS |
| Docker | 多阶段：Go 编 TLS sidecar + Node；镜像 `justlikemaki/aiclient-2-api` |
| TLS sidecar | Go + `refraction-networking/utls`，`HelloChrome_Auto`，默认 `:9090` |

### 3.2 模块地图（策略 + 适配器）

| 层 | 路径 | 职责 |
|----|------|------|
| Master/Worker | `src/core/master.js` → `api-server.js` | 拉起/崩溃重启 worker |
| 请求入口 | `src/handlers/request-handler.js` | CORS、静态 UI、插件、鉴权、路由 |
| API 路由 | `src/services/api-manager.js` | `/v1/chat/completions`、`/v1/messages`、Gemini v1beta… |
| 核心管线 | `src/utils/common.js` | `handleContentGenerationRequest` / Stream / Unary |
| Adapter | `src/providers/adapter.js` | `generateContent(Stream)`、`listModels`、refresh |
| Strategy | `src/utils/provider-strategy*.js` | 按 OpenAI/Claude/Gemini… 抽 model/stream |
| Converter | `src/converters/*`、`src/convert/convert.js` | 跨协议 request/response/chunk |
| Pool | `src/providers/provider-pool-manager.js` | 选节点、打分、failover、健康 |
| 上游 OAuth | `src/auth/*` | Gemini / Antigravity / Codex / Kiro / Grok… |
| Provider 核 | `src/providers/{gemini,claude,openai,grok,…}/*-core.js` | **模拟客户端 HTTP** |
| TLS | `tls-sidecar/` + `src/utils/tls-sidecar.js` | Chrome 指纹出站 |
| 入站 Key | `src/plugins/default-auth` | Bearer / x-api-key / query key |
| 配置 | `configs/` | `config.json`、`provider_pools.json`、各凭据目录 |

### 3.3 请求全路径（例：`POST /gemini-antigravity/v1/chat/completions`）

<div class="dg heti-skip" role="figure" aria-label="图 · AIClient2API：/gemini-antigravity/v1/chat/completions">
<span class="dg-title">图 · AIClient2API：/gemini-antigravity/v1/chat/completions</span>
<div class="dg-actors"><span class="dg-box ">客户端</span><span class="dg-box ">request-handler</span><span class="dg-box ">default-auth</span><span class="dg-box ">api-manager</span><span class="dg-box ">ProviderPoolManager</span><span class="dg-box ">AntigravityAdapter</span><span class="dg-box ">antigravity-core</span><span class="dg-box ">Google Code Assist</span></div>
<div class="dg-seq">
<div class="dg-msg "><span class="dg-who">客户端 → request-handler</span><span class="dg-text">/gemini-antigravity/v1/chat/completions</span></div>
<div class="dg-msg "><span class="dg-who">request-handler → request-handler</span><span class="dg-text">路径首段 → MODEL_PROVIDER，剥前缀</span></div>
<div class="dg-msg "><span class="dg-who">request-handler → default-auth</span><span class="dg-text">REQUIRED_API_KEY</span></div>
<div class="dg-msg "><span class="dg-who">default-auth → api-manager</span><span class="dg-text">handleAPIRequests</span></div>
<div class="dg-msg "><span class="dg-who">api-manager → api-manager</span><span class="dg-text">handleContentGenerationRequest(OPENAI_CHAT)</span></div>
<div class="dg-msg "><span class="dg-who">api-manager → Pool</span><span class="dg-text">acquireSlotWithFallback / 打分选节点</span></div>
<div class="dg-msg "><span class="dg-who">Pool → Adapter</span><span class="dg-text">getServiceAdapter</span></div>
<div class="dg-msg "><span class="dg-who">Adapter → Adapter</span><span class="dg-text">convertData(request)，若协议不一致</span></div>
<div class="dg-msg "><span class="dg-who">Adapter → core</span><span class="dg-text">generateContentStream</span></div>
<div class="dg-msg "><span class="dg-who">core → Google</span><span class="dg-text">客户端形态头 + OAuth（可经 TLS sidecar）</span></div>
<div class="dg-msg is-back"><span class="dg-who">Google → core</span><span class="dg-text">流式块</span></div>
<div class="dg-msg is-back"><span class="dg-who">core → 客户端</span><span class="dg-text">转回 OpenAI SSE；失败则换凭据重试</span></div>
</div>
</div>

| 步骤 | 关键点 |
|------|--------|
| 监听 | `api-server.js` `createRequestHandler` |
| Provider 覆盖 | 路径首段或头 `Model-Provider` |
| 入站鉴权 | `pluginManager.executeAuth` |
| 路由 | `handleAPIRequests` → `ENDPOINT_TYPE.OPENAI_CHAT` |
| 抽模型/流 | `OpenAIStrategy` |
| 选池 | `_calculateNodeScore`、并发/队列限制 |
| 协议转换 | `convertData(..., 'request'/'streamChunk')` |
| 出站 | core 拼 UA/OAuth/cookie，可选 TLS sidecar |
| Failover | `markProviderUnhealthy*` + `CREDENTIAL_SWITCH_MAX_RETRIES`（默认 5） |

### 3.4 Provider：「模拟客户端」分别在模拟谁

| Provider id | Core | 模拟对象（架构含义） |
|-------------|------|----------------------|
| `gemini-cli-oauth` | `gemini-core.js` | Gemini CLI → Code Assist；**tip 上 registerAdapter 曾被注释，可用性需自证** |
| `gemini-antigravity` | `antigravity-core.js` | Antigravity 产品客户端身份 |
| `claude-kiro-oauth` | `claude-kiro.js` | Kiro IDE / CodeWhisperer 形态 |
| `openai-codex-oauth` | `codex-core.js` | `chatgpt.com/backend-api/codex`，codex-tui UA |
| `grok-web` / `grok-cli-oauth` | `grok-*.js` | 浏览器 cookie 或 xAI CLI OAuth |
| `openai-custom` 等 | 标准 API core | 普通 API Key（非客户端模拟） |

凭据落盘：`configs/{gemini,antigravity,kiro,codex,grok…}/`，并链入 `provider_pools.json`。

### 3.5 池化 / 健康 / 故障转移

- 选健康、未禁用、非 `needsRefresh`；模型 allow/deny  
- 打分：健康新鲜度 + LRU + 使用次数 + 并发  
- `fallbackChain` / `modelFallbackMapping`  
- 错误次数 ≥ `maxErrorCount`（默认 10）或配额冷却  
- 周期性健康检查；异步 token refresh 队列  

### 3.6 A2 信任 / 风险面

1. OAuth/cookie **落盘**于 `configs/` 与用户家目录（`.codex`、`.aws/sso/cache`…）  
2. 源码内嵌公开 OAuth client id/secret（常见于 installed app，但是固定身份）  
3. **设计目标就是客户端模拟**，不是文档化公开 API 网关 → ToS/封号风险内生  
4. TLS sidecar 故意 Chrome 指纹（过 CF/风控）——相对 Node 是半黑盒出站通道  
5. 默认 UI 密码 `admin123`、默认 API Key 可极弱（如配置默认值）  
6. 可选全量 prompt 日志；插件可劫持鉴权  
7. README 与 tip 注册表可能不一致（部分 adapter 注释掉）  

---

## 4. 与 OneAPI / NewAPI 对照

| 维度 | OneAPI | NewAPI | Sub2API | AIClient2API |
|------|--------|--------|---------|--------------|
| 定位 | Key 聚合中继 | One 系增强「网关+资产」 | 订阅配额分发 | 客户端通道 → 本地兼容 API |
| 许可 | MIT | **AGPL-3** | （见仓库） | GPL-3 |
| 栈 | Go+Gin+嵌入前端 | Go+Gin+relaykit+现代 SPA | Go+Ent+Vue | Node 纯 HTTP + static |
| 上游资产 | 厂商/中转 **API Key** | 同左 + 局部 OAuth 渠（如 Codex）+ 可挂 Sub2API 渠 | **订阅账号 OAuth** | **CLI/IDE/浏览器会话** |
| 适配核心 | `relay/adaptor/*` 契约 | `relay/channel/*` + 跨协议 | 账号调度 + 协议转换 | Adapter + Strategy + Converter |
| 下游 | OpenAI `/v1` | OpenAI + Claude/Gemini 原生形等 | OpenAI/Claude 兼容 | OpenAI/Claude/Gemini |
| 计费 | 令牌额度×倍率 | 钱包/套餐、阶梯、缓存计费 | 账号配额切分 + 用户侧余额/支付 | 偏个人代理，弱多租户 |
| 选上游 | Ability：group×model×channel | 更复杂：pin、亲和、插件 filter | 粘性+负载+RPM+利润 | 池打分+failover |
| 典型路径 | TokenAuth→Distribute→Adaptor | 同族增强 | Key→选账号→转发 | Key→选 provider 节点→模拟客户端 |

**请求路径一句话：**

- One/New：下游 token → **选 Key 渠道** → Adaptor 调厂商 HTTP  
- Sub2API：下游 token → **选订阅账号** → 用账号会话打上游  
- A2：下游 OpenAI 形 → **某客户端 Provider** → 模拟客户端协议  

**易混概念纠正：**

- NewAPI 的 `BillingSourceSubscription` = **用户套餐计费**，≠ Sub2API 上游订阅池  
- NewAPI 的 Codex OAuth 渠道 ≠ A2 整套客户端模拟栈  
- NewAPI 甚至有 `relay/channel/sub2api`，把 Sub2API **当一类上游渠道挂上**——说明生态上「Key 网关」与「订阅池」可嵌套

**One/New 共性信任面：** Channel.Key 存库并注入上游 Authorization；下游 sk 即租户密钥；管理面全能；预扣/退款竞态；模型映射会改写 body；同进程持有全部上游 Key。

---

## 5. 自建「最小可信内核」清单（只列，不写码）

若目标是 **自己信得过、可审计**，建议内核只做这些（刻意不做支付/拼车/闭源插件）：

### 5.1 必须有

1. **单一范式声明**：先选 ① Key-Adaptor（最干净）或明确拒绝 ②③ 的 ToS 风险  
2. **OpenAI 兼容接入**：`/v1/chat/completions` + 流式，行为可测  
3. **下游鉴权**：自签 API Key，禁止弱默认；支持 IP allowlist  
4. **上游凭据**：仅官方 API Key；**at-rest 加密**（或 OS keychain），内存最小化停留  
5. **Adaptor 接口**：`BuildRequest → Do → ParseUsage`，每厂商一个文件，无动态加载闭源 so  
6. **可观测**：结构化日志（脱敏）、每请求 trace id、用量落库  
7. **失败策略**：明确超时、有限重试、**不静默换号到别人的订阅**  
8. **管理面最小化**：本地配置文件或极简 UI；无公开注册、无支付  

### 5.2 明确延后 / 默认不做

- 订阅 OAuth 池、浏览器 cookie 池、TLS 指纹伪装  
- 多租户充值、易支付、拼车分账  
- go-plugin / 任意 JS 插件执行用户代码  
- 「自动发现并模拟最新官方客户端」  

### 5.3 从两仓「该学什么 / 不该抄什么」

| 学 | 慎抄 |
|----|------|
| Sub2API：粘性会话、分组白名单、composite 路由、流式 failover 结构 | 明文 credentials JSONB、闭源插件、内置支付、客户端指纹 |
| A2：协议 Strategy/Converter 分层、池打分与 credential 切换 | TLS sidecar 伪装、硬编码 client 身份、默认弱口令、客户端模拟主路径 |
| One/New：Adaptor 契约、Distribute 选渠、预扣结算模型 | 把整站当「可商用中转」直接运营的假设 |

### 5.4 建议的下一步

1. 用 **Key-Adaptor 最小内核** 画一页架构（比先抄 Sub2API/A2 更可控）  
2. 只接 1 个上游（如官方 OpenAI 或你已有的合规 Key）跑通流式  
3. 再决定要不要「协议转换」或「多 Key 负载」——那是第二阶段  

---

## 6. 研读不确定点（诚实清单）

- Sub2API 账号 credentials 是否存在未搜到的字段级加密 / KMS  
- 官方 Docker 是否默认打进未开源插件  
- A2 tip 上 `gemini-cli-oauth` 注册被注释的真实意图  
- A2 各 provider 默认是否强制 TLS sidecar  
- NewAPI 任务插件 / jsplugin 执行面未做安全审计级阅读  

---

## 7. 结论

中转站不是一种实现，而是 **三种上游信任模型** 共用「OpenAI 兼容外壳」：

1. **OneAPI/NewAPI** —— 最适合作为「可信自建」参考骨架（Key + Adaptor + 额度）  
2. **Sub2API** —— 完整的 **订阅账号池商业中转** 样本（调度/支付/插件都很全，信任面也最大）  
3. **AIClient2API** —— **客户端模拟** 样本（协议转换与池化很值得看，合规风险与黑盒出站也最刺眼）

担心这类项目「内部不靠谱」，直觉是对的：不靠谱往往不在「会不会转发」，而在 **凭据存哪、出站谁持有、有没有闭源/指纹/支付额外面**。自建时优先复制 One/New 的 Adaptor 骨架，把 Sub2API/A2 当作「调度与协议课」而不是「可原样上线的产品模板」。

