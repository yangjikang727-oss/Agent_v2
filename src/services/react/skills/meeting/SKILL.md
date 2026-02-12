---
name: book_meeting_room
description: 预定会议室，创建会议日程。当用户想要预定会议室、安排会议、创建会议日程时使用。
tags: [会议, 日程, 会议室, 预定, 开会, 例会, 讨论, 复盘, 沟通, 议题, 主持]
category: schedule
priority: 1
action: open_create_meeting_modal
---

# 预定会议室

## 工作流程
1. 阅读下方参数说明表格，了解所有可提取的参数
2. 从用户原始输入中提取尽可能多的参数值（提取不到的不传）
3. 将日期时间转换为标准格式（如"下午6点" → "18:00"，"今天" → 具体日期）
4. 调用 trigger_action 工具，传入提取的参数：
   ```
   Action: trigger_action
   Action Input: {"action": "open_create_meeting_modal", "params": {"title": "...", "date": "...", "startTime": "...", ...}}
   ```
5. 表单将自动预填已提取的参数，缺失字段留空由用户补充

## 参数说明
| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| title | string | 是 | 会议主题 | 项目周会 |
| date | date | 是 | 会议日期（YYYY-MM-DD） | 2026-02-11 |
| startTime | time | 是 | 开始时间（HH:mm） | 09:00 |
| endTime | time | 否 | 结束时间（HH:mm） | 10:00 |
| location | string | 否 | 会议地点 | 会议室A |
| roomType | string | 否 | 会议室类型（小型/中型/大型） | 小型 |
| attendees | array | 否 | 参会人员列表 | ["张三","李四"] |
| remarks | string | 否 | 备注 | |

## 示例
用户输入："今天下午6点架构师例会"（假设今天是 2026-02-11）
→ 提取：title="架构师例会", date="2026-02-11", startTime="18:00"
→ 调用：trigger_action({ action: "open_create_meeting_modal", params: { title: "架构师例会", date: "2026-02-11", startTime: "18:00" } })

## 重要规则
- 识别到会议意图后，跳过所有解释和确认，直接触发
- 一次性推送完整表单，禁止分步填充
- 不得使用"已为您安排""已创建"等拟真式表述
- 表单即确认载体，不额外弹窗/提问
