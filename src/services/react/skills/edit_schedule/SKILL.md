---
name: edit_schedule
description: 修改、调整或编辑已有日程。当用户想要修改日程时间、地点、参会人等信息时使用。
tags: [修改, 调整, 编辑, 更改, 改时间, 改日程, 取消日程, 变更]
category: schedule
priority: 3
action: open_schedule_list
---

# 修改日程

## 工作流程
1. 识别到修改/调整/编辑日程的意图
2. 直接触发 open_schedule_list，展示未来日程列表
3. 用户从列表中选择要修改的日程，打开编辑弹窗
4. 用户在弹窗中修改后保存（含冲突检测）

## 重要规则
- 识别到修改日程意图后，直接触发 open_schedule_list
- 不需要提取额外参数，只需展示日程列表供用户选择
- 不得使用"已为您修改"等拟真式表述
