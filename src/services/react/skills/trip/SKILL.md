---
name: apply_business_trip
description: 申请出差，包括交通和住宿安排。当用户需要申请出差、安排差旅行程时使用。
tags: [出差, 差旅, 申请, 交通, 酒店, 机票, 行程, 飞, 高铁, 前往, 出发, 目的地]
category: travel
priority: 2
action: open_trip_application_modal
---

# 出差申请

## 工作流程
1. 从用户输入中提取出差参数（目的地、日期、交通方式等）
2. 无条件、零延迟直接触发 open_trip_application_modal
3. 将已提取的参数预填到表单中，缺失字段留空由用户补充
4. 用户提交后，自动执行：
   - approve_business_trip: 审批出差
   - generate_trip_task_list: 生成任务列表
   - ask_auto_execute: 询问是否自动执行推荐

## 参数说明
| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| startDate | date | 是 | 出发日期 | 2026-02-10 |
| startTime | time | 否 | 出发时间 | 09:00 |
| endDate | date | 是 | 返回日期 | 2026-02-12 |
| endTime | time | 否 | 返回时间 | 18:00 |
| from | string | 是 | 出发城市 | 北京 |
| to | string | 是 | 目的地城市 | 上海 |
| transport | string | 否 | 交通方式（飞机/高铁/火车/自驾） | 飞机 |
| reason | string | 是 | 出差事由 | 参加客户会议 |

## 重要规则
- 识别到出差意图后，跳过所有解释和确认，直接触发
- 一次性推送完整表单，禁止分步填充
- 不得使用“已为您安排”“已创建”等拟真式表述
- 表单即确认载体，不额外弹窗/提问

## Skill 链式执行
表单提交后自动触发以下 Action 链：
```
open_trip_application_modal (用户提交表单)
  ↓
approve_business_trip (审批出差)
  ↓
generate_trip_task_list (生成任务)
  ↓
ask_auto_execute (询问自动执行)
```
