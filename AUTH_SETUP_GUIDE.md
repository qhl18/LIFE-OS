# LifeOS 用户登录功能 — 保姆级后续操作指南

> 代码已全部写好，你只需要按以下步骤操作即可让登录功能跑起来。

---

## 总览：改了哪些文件？

| 文件 | 改了什么 |
|------|---------|
| `index.html` | 顶部加了用户栏 + 登录弹窗 + 打卡拦截遮罩 |
| `styles.css` | 末尾追加了认证相关样式（弹窗、按钮、遮罩） |
| `app.js` | 重写，集成 Supabase Auth 完整逻辑 |
| `supabase-schema.sql` | 升级到 v2，支持用户隔离 |

---

## 第一步：在 app.js 中填入你的 Supabase 配置（2 分钟）

打开 `app.js`，找到文件最顶部的这两行（第 10-11 行附近）：

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_KEY = 'YOUR_ANON_KEY';
```

替换为你的真实信息：

1. 打开 https://supabase.com → 登录 → 进入你的项目
2. 左侧菜单点 **Project Settings**（齿轮图标）
3. 点 **API**
4. 复制 **Project URL** 和 **anon public key**

替换后应该是这样：

```js
const SUPABASE_URL = 'https://abcd1234.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6...很长一串...';
```

> 注意：anon key 是公开密钥，放在前端代码里是安全的。它只能做权限允许的操作，不会泄露你的数据库。

---

## 第二步：在 Supabase 中执行新的 SQL（3 分钟）

因为加了用户认证，数据库表需要升级（添加 `user_id` 字段 + 更新安全策略）。

1. 打开 Supabase Dashboard
2. 左侧菜单点 **SQL Editor**
3. 点 **New query**
4. 打开项目中的 `supabase-schema.sql` 文件
5. **全选复制**，粘贴到 SQL Editor 中
6. 点 **Run**（执行）

执行成功后你会看到 "Success. No rows returned." — 这是正常的。

> 这条 SQL 会自动检测并迁移你已有的表，不会丢数据。

---

## 第三步：在 Supabase 中确认认证设置（1 分钟）

默认情况下 Supabase 的邮箱登录是开启的，但最好确认一下：

1. Supabase Dashboard 左侧点 **Authentication** → **Providers**
2. 确认 **Email** 是 **Enabled**（绿色开关）
3. 点 **Authentication** → **URL Configuration**
4. 确认 **Site URL** 设为你的网站地址（本地开发填 `http://localhost:5500` 或你用的端口）

### 关于"注册后是否需要邮箱验证"

默认情况下，Supabase **不要求邮箱验证**就能直接注册登录。这意味着：
- 注册成功后用户会**立即登录**，体验最流畅

如果你想开启邮箱验证（更安全但多一步操作）：
1. Authentication → Providers → Email
2. 打开 **Confirm email** 开关
3. 这样注册后用户会收到验证邮件，点击链接后才能登录

> 对于个人项目/初期开发，建议**关闭邮箱验证**，开发完再开。

---

## 第四步：本地打开测试（1 分钟）

### 方法 A：直接打开

双击 `index.html` 用浏览器打开。

> 注意：某些浏览器对本地文件（file://）的 JS 有限制，如果登录功能不工作，用方法 B。

### 方法 B：用 VS Code Live Server（推荐）

1. VS Code 安装扩展 **Live Server**
2. 右键 `index.html` → **Open with Live Server**
3. 浏览器会自动打开 `http://127.0.0.1:5500/index.html`

---

## 第五步：测试流程

### 测试 1：注册新账号

1. 打开页面，顶部应显示 "LifeOS" 和 "登录 / 注册" 按钮
2. 点 "登录 / 注册"
3. 弹窗标题是 "登录"，点下方 "去注册"
4. 填邮箱 + 密码（至少 6 位）
5. 点 "注册"
6. 如果没开邮箱验证 → 直接登录成功，顶部显示用户名
7. 如果开了邮箱验证 → 提示去邮箱验证

### 测试 2：未登录打卡拦截

1. 退出登录（点 "退出" 按钮）
2. 切换到 "记录" 页面
3. 打卡区域应被半透明遮罩挡住，显示 "请先登录后再打卡"
4. 点 "去登录" → 弹出登录弹窗

### 测试 3：登录后打卡

1. 登录
2. 打卡输入内容
3. 点 "记录" → 正常保存
4. 切换到 "统计" 页 → 看到技能经验值
5. 刷新页面 → 登录状态保持，数据仍在

### 测试 4：退出后再登录

1. 点 "退出"
2. 顶部恢复为 "登录 / 注册" 按钮
3. 打卡被拦截
4. 再点 "登录 / 注册" → 用之前的账号登录
5. 数据恢复

---

## 常见问题

### Q1: 注册时提示 "Email rate limit exceeded"

Supabase 免费版每分钟只能发有限数量的邮件（如果开了邮箱验证）。关闭邮箱验证或等一分钟再试。

### Q2: 登录成功但数据没加载

打开浏览器开发者工具（F12）→ Console 面板，看是否有红色错误。最常见原因是 SQL 没执行成功，或 RLS 策略不对。

### Q3: 打卡后数据没存到 Supabase

1. F12 → Console 看有没有 `[Supabase] 写入记录失败` 警告
2. F12 → Network 面板搜索 `activity_logs`，看请求状态码
3. 确认 SQL 已执行（第二步）
4. 确认 RLS 策略已更新（`auth.uid() = user_id`）

### Q4: 刷新后登录状态丢失

正常情况下不会丢失，Supabase 会自动从 localStorage 恢复会话。如果丢失：
- 检查浏览器是否设置了"退出时清除 Cookie/本地存储"
- 换个浏览器测试

### Q5: dashboard.html 数据看板还能用吗？

dashboard.html 使用的是匿名读取策略。新版 SQL 默认关闭了匿名读取（只允许登录用户）。
如果仍需要 dashboard 匿名读取，取消 `supabase-schema.sql` 最后部分的注释，执行那段代码即可。

---

## 安全说明

- **anon key 放在前端是安全的** — 它受 RLS 策略保护，只能做你允许的操作
- **每个用户只能看到自己的数据** — RLS 策略确保了这一点
- **密码不以明文存储** — Supabase 使用 bcrypt 哈希
- **HTTPS 是必须的** — 部署到线上时确保使用 https://

---

## 后续可以做的事

1. **接入 GitHub OAuth 登录** — 不用手动输邮箱密码
2. **数据从 localStorage 迁移到云端** — 目前代码是双写（本地 + 云端），后续可以完全切到云端
3. **多设备同步** — 登录后自动拉取云端数据
4. **数据导出** — 支持导出为 JSON/CSV
5. **密码找回** — Supabase 自带 resetPasswordForEmail 方法
