---
title: 让 LLM 把东西讲明白：Karpathy 的输出格式阶梯与 LLM 使用技巧
description: Karpathy 提出理解 LLM 输出的“阶梯”：受控英语 ASD-STE100 → 图表 → HTML 网页 → 定制讲解视频；附他在 How I use LLMs 里的日常使用建议。
tags:
  - LLM
  - 方法论
pubDate: 2026-10-16
---

> 来源：Andrej Karpathy 2026-10-02 的 [X 帖子](https://x.com/karpathy/status/2105819303471976479)（整理见 [Way Into AI](https://wayintoai.com/ref/karpathy-efficient-ways-to-get-llms-to-explain)），以及他的视频 *How I use LLMs*。

## 背景

随着 LLM 自主完成越来越多的“体力活”，我们会花更多时间去**理解模型的输出**。Karpathy 给了一个逐级升级的输出格式阶梯——每一级都“还有更好的”。

## 阶梯一：写作 → 用 ASD-STE100

让 LLM 用 **ASD-STE100**（简化技术英语，最早用于航空维修文档的受控语言规范）来解释问题。LLM 很熟悉这套规范，它对写作风格有严格约束，读起来往往清爽得多。

规范比较严苛时，可以放松一点：要求 **“80% of the way to ASD-STE100”**。

## 阶梯二：图表 / 图片

别要文字，直接让 LLM **画图**。图更容易处理、解析和理解。

## 阶梯三：网页

要求输出 **“in HTML”**，得到一个漂亮、可交互的网页。LLM 的前端能力越来越强，动画、交互都能做。

## 阶梯四：定制讲解视频

Karpathy 最看好的输出形式：**针对任意主题生成的定制讲解视频**。可以试：

> Create a 3b1b style video explainer on X. Use my ElevenLabs API key for audio narration.

没有 ElevenLabs Key 的话，可以让 LLM 帮你找能跑在本地算力上的免费 TTS 替代方案。他说这“真的开始能用了”。

## 结论

- LLM 越强，会自主做越多的活；**人的工作会往上移到监督（oversight）和理解**。
- 好消息是 LLM 在这里也能帮忙：智能和代码越来越廉价，你可以要**大型、定制、用完即弃的软件制品**（网页应用、讲解视频）——以前根本不值得做的东西。大胆试边界。

## 附：How I use LLMs 里的实用技巧

- **一个话题开一个新对话**：上下文窗口是工作记忆，旧内容会分散注意力、拖慢速度，换话题就清空。
- **按任务选模型**：简单问答用快模型，难题（数学、代码、推理）用 thinking 模型，并留意自己用的是哪一档。
- **用工具，不要心算**：计算、数据分析交给代码解释器；时效信息用搜索；深度研究用 Deep Research。
- **主动上传上下文**：把文档、论文、截图、代码直接贴进去，比让模型凭记忆回答可靠。
- **善用记忆 / 自定义指令**：把个人偏好、背景写进 custom instructions 或 memory，减少每次重复说明。
- **多模型“议会”**：同一个问题问多个模型对照答案；Karpathy 后来把这个思路做成了 [llm-council](https://github.com/karpathy/llm-council) 项目（多个模型分别作答、互评，再由“主席”模型汇总）。
