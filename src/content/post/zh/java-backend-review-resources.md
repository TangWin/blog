---
title: Java 后端复习：GitHub 高星中文资料精选
description: 面向面试突击与中高级复习的 Java 后端资料清单：Java/JVM/并发、MySQL/Redis、Spring 源码、分布式/DDD，附学习顺序与两周冲刺计划。
tags:
  - Java
  - 学习笔记
pubDate: 2026-09-08
---

> 用途：面试突击 + 体系复习 + 中高级  
> 主战场：Java/JVM/并发 · MySQL/Redis · Spring+源码 · 分布式/DDD  
> 原则：中文仓为主；英文高星只附中文导读，不整仓翻译  
> 整理日期：2026-09-08 · star 量为当时公开页量级，会变动  

---

## 建议学习顺序

```text
① Java/JVM/并发（底座）
    → ② MySQL + Redis（数据面）
        → ③ Spring 全家桶 + 源码（框架面）
            → ④ 分布式 / 系统设计 / DDD（架构面）
```

每天可用「八股过一遍 + 一章原理/源码」；场景题放到 ④ 与项目经历对齐。

---

## 一、Java / JVM / 并发

| 仓库 | Star 量级 | 类型 | 怎么用 |
|------|-----------|------|----------------|
| [Snailclimb/JavaGuide](https://github.com/Snailclimb/JavaGuide) | **~157k** | 合集型 · 持续维护 | **主阵地**。先啃 `docs/java/concurrent/*`（并发上中下）+ `docs/java/jvm/*`（内存区域、GC、类加载）。站点：https://javaguide.cn |
| [CyC2018/CS-Notes](https://github.com/CyC2018/CS-Notes) | **~186k** | 合集型 · 偏笔记 | 用来**对照查漏**：Java / 操作系统 / 网络。内容偏精炼，适合二轮速览，勿当唯一来源（部分章节偏旧，以 JavaGuide 为准核对） |
| [itwanger/toBeBetterJavaer](https://github.com/itwanger/toBeBetterJavaer) | **~17k** | 体系教程型 | 并发 + JVM 讲得口语化，适合「听懂再背」。配合 JavaGuide 的面试题清单效果好 |
| [doocs/jvm](https://github.com/doocs/jvm) | 专题型（doocs 系） | JVM 专题 | 若 JVM 要加深，专啃这一本式整理；与《深入理解 Java 虚拟机》对照 |

**中高级重点（别只背题）：**  
JMM / volatile / synchronized / AQS / 线程池参数与拒绝策略 / GC 选型与排查工具 / 类加载与双亲委派例外。

---

## 二、MySQL + Redis

| 仓库 | Star 量级 | 类型 | 怎么用 |
|------|-----------|------|----------------|
| [Snailclimb/JavaGuide](https://github.com/Snailclimb/JavaGuide) 数据库/缓存章节 | （同上仓） | 合集内专题 | **MySQL + Redis 面试主线**：索引、事务隔离、锁、日志、主从；缓存穿透/击穿/雪崩、一致性。从站点目录进「数据库」「Redis」 |
| [doocs/advanced-java](https://github.com/doocs/advanced-java) | **~79k** | 进阶扫盲 · 中高级向 | **强烈推荐「已熟练」后再拔高**：高并发下的缓存、分布式锁、秒杀、消息、ES 等场景串起来。站点：https://java.doocs.org |
| 黑马点评 / 秒杀类实战仓（如社区常推的 hmdp 系、[java-up-up/damai](https://github.com/java-up-up/damai) ~1k+） | 数百～1k+ | 实战型 | 用来**把 Redis 从「会命令」变成「会方案」**：Lua 扣减、分布式锁、缓存一致性。挑 1 个跟完即可，不必多开 |

**中高级重点：**  
Explain / 覆盖索引 / 间隙锁；Buffer Pool；Redis 单线程与 IO 多路；持久化 RDB/AOF；集群与哨兵；与 DB 双写一致性策略。

---

## 三、Spring 全家桶 + 源码

| 仓库 | Star 量级 | 类型 | 怎么用 |
|------|-----------|------|----------------|
| [Snailclimb/JavaGuide](https://github.com/Snailclimb/JavaGuide) Spring 专题 | （同上） | 八股 + 原理 | IoC/AOP、事务传播与失效、循环依赖三级缓存、Boot 自动装配。入口：https://javaguide.cn/system-design/framework/spring/ |
| [yudaocode/SpringBoot-Labs](https://github.com/YunaiV/SpringBoot-Labs)（芋道） | **~20k** | **源码/专栏实验型** | **源码主阵地**：按 lab 跑通 Boot 启动、自动配置、MVC；第二波再碰同仓里的 Cloud / 事务 / MQ 专栏 |
| [Snailclimb/JavaGuide-Interview](https://github.com/Snailclimb/JavaGuide-Interview) | **~3k** | 突击压缩版 | 面试前 1–2 周**速刷** Spring/Boot 问答，细节回主仓 |

**中高级重点：**  
Bean 生命周期、三级缓存解决循环依赖、`@Transactional` 失效场景、Boot 2.x `spring.factories` vs 3.x `AutoConfiguration.imports`、Starter 条件装配。

---

## 四、分布式 / 系统设计 / DDD

| 仓库 | Star 量级 | 类型 | 怎么用 |
|------|-----------|------|----------------|
| [doocs/advanced-java](https://github.com/doocs/advanced-java) | **~79k** | 分布式进阶 | **主线**：分布式锁、事务、限流熔断、高可用、海量数据。适合「熟悉分布式开发」后查缺 |
| [nageoffer/congomall](https://github.com/nageoffer/congomall) | 商城 DDD 实战（质量向） | **DDD 落地型** | 对照订单/商品/优惠券边界，学「不是空谈分层」；配合自己项目的设计文档讲故事 |
| [Admol/SystemDesign](https://github.com/Admol/SystemDesign) | **~3k** | 中文书译 | Alex Xu《系统设计面试》中文：**场景题骨架**（短链、限流、聊天、Feed…） |
| [donnemartin/system-design-primer](https://github.com/donnemartin/system-design-primer) | **英文高星**（全球头部） | 系统设计 | 见下方「英文附录」——用简体中文 README 学，不必啃英文正文 |

**中高级重点：**  
CAP/BASE、幂等、分布式事务（本地消息表 / TCC / Seata 概念）、限流降级、一致性哈希；DDD 战略设计 vs 战术（聚合、领域事件）能结合项目说清楚即可。

---

## 英文高星附录（只给中文导读，不全文翻译）

### system-design-primer
- 仓：https://github.com/donnemartin/system-design-primer  
- **直接看**：仓库内 `README-zh-Hans.md`（已有简体中文）  
- **建议读的章节：**  
  1. 如何答系统设计面试（框架）  
  2. 短网址 / ID 生成 / 限流 / Key-Value（分布式基础件）  
  3. 任选 1 个业务场景（聊天 or Feed）练口述  
- **不必**：把所有 solutions 英文代码逐文件翻译；对照 Admol 中译书 + 自己画图即可。

---

## 待补方向（第二波预告）

第一波**刻意没深挖**，需要时再说一声：

| 方向 | 说明 |
|------|------|
| Spring Cloud | 可继续挖芋道 Labs 的 Cloud / Alibaba 专栏 + JavaGuide 微服务章节 |
| RocketMQ / ES / Activiti | 官方文档 + advanced-java 消息/搜索章节；Activiti 完整面试仓较少，偏官方 User Guide + 自己的项目 |
| 前端 Vue/React | 维持「了解」即可，不必高星八股仓 |
| AI / Agent / MCP | 见 [Hermes × Agent Skills 笔记](../hermes-agent-skills/)；Java 侧可后续补 Spring AI 类中文项目 |

---

## 两周冲刺示例（可改）

| 天数 | 内容 |
|------|------|
| D1–3 | JavaGuide 并发三篇 + JVM 内存/GC/类加载；用 jstack/jmap 口述一遍 |
| D4–6 | MySQL 索引事务锁 + Redis 五类问题；advanced-java 里缓存/锁 2–3 篇 |
| D7–10 | Spring 事务/循环依赖/自动装配；SpringBoot-Labs 跑 1–2 个启动/装配 lab |
| D11–14 | advanced-java 分布式专题 + SystemDesign 2 个场景口述；congomall 看一个限界上下文 |

---

## 使用注意

1. **Star ≠ 全对**：以原理能否讲清为准；过旧章节用官网/新版源码核对。  
2. **合集仓重复多**：JavaGuide 作主干，CS-Notes / 二哥作辅，避免三份同时精读。  
3. **实战仓**：跟 1 个吃透，胜过 star 崇拜式收藏。  

第二波（Cloud / MQ / ES / Activiti）后续再补。
