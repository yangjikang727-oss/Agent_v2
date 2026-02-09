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
1. 从用户输入中提取会议参数（主题、时间、参会人等）
2. 无条件、零延迟直接触发 open_create_meeting_modal
3. 将已提取的参数预填到表单中，缺失字段留空由用户补充

## 参数说明
| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| title | string | 是 | 会议主题 | 项目周会 |
| startTime | time | 是 | 开始时间 | 09:00 |
| endTime | time | 否 | 结束时间 | 10:00 |
| location | string | 否 | 会议地点 | 会议室A |
| roomType | string | 是 | 会议室类型（小型/中型/大型） | 小型 |
| attendees | array | 是 | 参会人员列表 | ["张三","李四"] |
| remarks | string | 否 | 备注 | |

## 重要规则
- 识别到会议意图后，跳过所有解释和确认，直接触发
- 一次性推送完整表单，禁止分步填充
- 不得使用"已为您安排""已创建"等拟真式表述
- 表单即确认载体，不额外弹窗/提问
