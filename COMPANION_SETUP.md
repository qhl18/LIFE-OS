# LifeOS 同行者 — CloudBase 安全规则 & 部署指南

## ⚠️ 警告：数据库现在是裸奔状态！

在你把下面的安全规则粘贴到 CloudBase 控制台之前，**任何人都可以读写你的数据库**。
请尽快完成配置。

---

## 一、需要创建的集合

在 CloudBase 控制台 → 数据库 中，创建以下 5 个集合：

1. `rooms` — 暗号房间
2. `shares` — 共享进度数据
3. `cheers` — 打气消息
4. `shared_goals` — 共同目标（共享水池）
5. `pending_checkins` — 裁判模式待认证打卡

---

## 二、安全规则

### 粘贴路径

CloudBase 控制台 → 数据库 → 选择对应集合 → 「权限设置」→ 切换到「自定义安全规则」→ 粘贴 JSON

---

### rooms 集合安全规则

```json
{
  "read": "auth.uid == doc.creatorUid || auth.uid == doc.partnerUid || doc.status == 'waiting'",
  "write": "auth.uid != null",
  "update": "auth.uid == doc.creatorUid || auth.uid == doc.partnerUid || doc.status == 'waiting'",
  "delete": "auth.uid == doc.creatorUid"
}
```

**说明：**
- `read`：创建者和匹配者可读；`waiting` 状态的房间可被搜索到（暗号匹配需要）
- `write`：任何已登录用户可创建房间
- `update`：创建者可更新；匹配者可更新（加入时写入 partnerUid）；`waiting` 状态可被匹配
- `delete`：仅创建者可删除

---

### shares 集合安全规则

```json
{
  "read": "auth.uid == doc.uid || auth.uid == doc.partnerUid",
  "write": "auth.uid == doc.uid",
  "update": "auth.uid == doc.uid",
  "delete": "auth.uid == doc.uid"
}
```

**说明：**
- `read`：数据所有者和其同行者可读
- `write`：只有数据所有者能创建
- `update`：只有数据所有者能更新
- `delete`：只有数据所有者能删除

---

### cheers 集合安全规则

```json
{
  "read": "auth.uid == doc.toUid || auth.uid == doc.fromUid",
  "write": "auth.uid == doc.fromUid",
  "update": "auth.uid == doc.toUid",
  "delete": "auth.uid == doc.fromUid"
}
```

**说明：**
- `read`：发送者和接收者可读
- `write`：只有发送者能创建
- `update`：接收者可更新（标记已读）
- `delete`：仅发送者可删除

---

### shared_goals 集合安全规则

```json
{
  "read": "auth.uid == doc.creatorUid || auth.uid == doc.partnerUid",
  "write": "auth.uid == doc.creatorUid",
  "update": "auth.uid == doc.creatorUid || auth.uid == doc.partnerUid",
  "delete": "auth.uid == doc.creatorUid || auth.uid == doc.partnerUid"
}
```

**说明：**
- `read`：创建者和同行者均可读（双方需要看到水池进度）
- `write`：只有创建者能发起共同目标
- `update`：双方均可更新（对方接受邀请时写 status，双方打卡时更新水池）
- `delete`：双方均可删除（结束同行时拆分后清理）

**粘贴路径：** CloudBase 控制台 → 数据库 → `shared_goals` 集合 → 「权限设置」→「自定义安全规则」→ 粘贴 JSON

---

### pending_checkins 集合安全规则

```json
{
  "read": "auth.uid == doc.fromUid || auth.uid == doc.toUid",
  "write": "auth.uid == doc.fromUid",
  "update": "auth.uid == doc.toUid",
  "delete": "auth.uid == doc.fromUid || auth.uid == doc.toUid"
}
```

**说明：**
- `read`：打卡者和裁判均可读
- `write`：只有打卡者能提交待认证记录
- `update`：只有裁判能处理（认证/驳回）
- `delete`：双方均可删除（处理完毕后清理）

**粘贴路径：** CloudBase 控制台 → 数据库 → `pending_checkins` 集合 → 「权限设置」→「自定义安全规则」→ 粘贴 JSON

---

## 三、匿名登录配置

CloudBase 控制台 → 环境 → 「登录方式」→ 开启「匿名登录」

---

## 四、数据红线

云端 **只存** 以下数据：

| 字段 | 说明 |
|------|------|
| 目标名 | 目标名称 |
| 类型 | cumulative/habit/milestone/value/composite |
| 进度百分比 | 0~1 的小数 |
| 今日打卡状态 | true/false |
| 打卡日期列表 | 最近30天的日期字符串数组（用于双人连续天数） |
| 打气消息 | 预设的打气文案 |
| 共同目标水池 | 累计总量 + 双方各自贡献量 |
| 待认证打卡 | 打卡值 + 提交时间 + 处理状态 |
| 驳回理由 | 裁判填写的一句话（不含打卡备注原文） |

**永不出本机的数据：**
- 打卡备注
- 训练日志
- 复盘内容
- 每日一句
- 贵人数据
- 目标详情（why、deadline、checkins 原始记录等）

---

## 五、验收测试流程

### 前置条件
1. CloudBase 安全规则已配置
2. 匿名登录已开启
3. 两个浏览器窗口（建议一个正常窗口 + 一个无痕窗口）

### 测试步骤

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 窗口A 打开 LifeOS，进入同行者页，点击「创建暗号」 | 显示四字暗号，等待对方加入 |
| 2 | 窗口B 打开 LifeOS，进入同行者页，点击「输入暗号」，输入A的暗号 | 连接成功，弹出共享设置页 |
| 3 | 窗口B 确认共享设置 | 双方绑定，A 也弹出共享设置页 |
| 4 | 窗口A 打卡一个目标 | A 的目标进度更新 |
| 5 | 窗口B 刷新同行者页 | 看到 A 的目标进度和今日✓ |
| 6 | 窗口A 断网（DevTools → Network → Offline），打卡 | 本地正常，卡片角落出现「待同步」黄点 |
| 7 | 窗口A 恢复网络 | 黄点消失，数据自动补传 |
| 8 | 窗口A 打开共享设置，关闭某目标共享 | 设置保存成功 |
| 9 | 窗口B 刷新同行者页 | 该目标显示「这个目标被TA藏起来了」 |
| 10 | 打开控制台 | 零报错 |

### 额外检查
- 双人连续天数：双方同一天都打卡时 +1
- 打气功能：对方断卡≥1天时显示「TA今天可能需要你」
- 结束同行：二次确认后解除，对方看到提示文案

---

## 六、共同目标验收测试

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 窗口A 同行者页点击「发起共同目标」 | 弹出创建弹窗，可选累计型/习惯型 |
| 2 | A 填写目标名「一起背3500词」+ 目标值 3500，确认 | 云端创建，A 端显示等待对方接受 |
| 3 | 窗口B 刷新同行者页 | 看到邀请卡「XX邀请您一起：一起背3500词」 |
| 4 | B 点击「拒绝」 | A 收到「TA暂时不想接这个，没关系」；邀请消失 |
| 5 | A 重新发起，B 点击「接受」 | 双方绑定，共同目标出现在双方同行者页 |
| 6 | A 打卡 +50 词 | A 端水池 50/3500，个人条显示 50(100%)；B 端刷新后水池 50/3500，A 的个人条 50(100%)，B 的个人条 0(0%) |
| 7 | B 打卡 +30 词 | 水池 80/3500，A 条 50(62.5%)，B 条 30(37.5%)；贡献少一方显示「TA多扛了一点，您明天补上？」 |
| 8 | 水池打满 3500 | 双方各自撒花，显示「我们一起做到的」，移入完成殿堂标注「与XX共同完成」 |
| 9 | 结束同行 | 共同目标自动拆成两个独立个人目标，各带自己的贡献量 |

---

## 七、裁判模式验收测试

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 窗口A 同行者页打开「请TA当我的裁判」开关 | 开关亮起，提示对方需要认证 |
| 2 | A 打卡 +50 | A 端显示「待认证」，进度暂不增加 |
| 3 | 窗口B 同行者页出现「待认证」入口 | 列表显示 A 的打卡记录 |
| 4 | B 点击「驳回」但不填理由 | 被拦截，提示「请填一句话理由」 |
| 5 | B 填理由「今天好像没看到你背」后驳回 | 驳回成功，A 端显示「TA这次没认，聊聊？还是您记错了？」 |
| 6 | A 点击「申诉」重新提交 | 新的待认证记录出现在 B 端 |
| 7 | B 点击「认证」 | A 端进度增加，认证完成 |
| 8 | A 再打卡，B 不处理，等 48 小时 | 自动认证，标注「自动认证」标签，进度正常增加 |
