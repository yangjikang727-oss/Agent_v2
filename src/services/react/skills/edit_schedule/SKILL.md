---
name: edit_schedule
description: 修改、调整或编辑已有日程。当用户想要修改日程时间、地点、参会人等信息时使用。
tags: [修改, 调整, 编辑, 更改, 改时间, 改日程, 变更]
category: schedule
priority: 3
action: edit_schedule
---

# 修改日程

## 工作流程
1. 识别到修改/调整/编辑日程的意图
2. 调用 edit_schedule 工具，提取日期、类型、关键词参数
3. 系统根据参数智能匹配日程，展示确认卡片
4. 用户确认后打开编辑弹窗，修改后保存（含冲突检测）
5. 如匹配有误，用户可从全部日程列表中重新选择

## 重要规则
- 识别到修改日程意图后，调用 edit_schedule 工具
- 尽可能提取日期、类型（meeting/trip/general）、关键词等参数以提高匹配精度
- 不得使用"已为您修改"等拟真式表述
