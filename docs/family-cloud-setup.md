# 亲友私人档案部署说明

第一阶段使用 Supabase Auth、PostgreSQL 和 Row Level Security。GitHub Pages 仍然只负责前端静态文件。

## 1. 创建 Supabase 项目

在 Supabase 创建一个新项目。记录以下两个公开配置：

- Project URL
- Publishable key 或 anon public key

不要把 `service_role` 密钥写进前端、GitHub 仓库或 `public/app-config.js`。

## 2. 创建数据库

在 Supabase SQL Editor 中执行：

`supabase/migrations/202607270001_family_accounts.sql`

该迁移会创建：

- `memberships`：管理员可见的非敏感成员信息
- `invitations`：邀请状态
- `training_profiles`：个人训练档案
- `body_logs`：身体状态记录
- `training_plans`：生成的训练方案
- `workout_records`：完成的训练记录
- `music_links`：网易云和 QQ 音乐链接

训练相关表只允许数据所属用户访问，没有管理员读取策略。

## 3. 创建第一个管理员

先在 Supabase Dashboard 的 Authentication > Users 中添加自己的邮箱用户。数据库触发器会把未受邀请的新用户设为停用状态。

然后在 SQL Editor 执行：

```sql
update public.memberships
set role = 'admin', status = 'active', display_name = '小天'
where lower(email) = lower('你的邮箱');
```

## 4. 配置登录回调

在 Authentication > URL Configuration 中设置：

- Site URL：`https://qq798634932-commits.github.io/wenlian-fitness/`
- Redirect URL：同上

成员登录采用邮箱魔法链接，不使用公开注册和短信。

## 5. 部署管理函数

安装并登录 Supabase CLI 后，在项目根目录执行：

```bash
supabase link --project-ref 你的项目编号
supabase secrets set PUBLIC_SITE_URL=https://qq798634932-commits.github.io/wenlian-fitness/
supabase functions deploy invite-member
supabase functions deploy update-member-status
```

Edge Function 会自动获得项目的 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`。服务密钥仅存在于函数环境中。

## 6. 连接前端

编辑 `public/app-config.js`：

```js
window.__WENLIAN_CONFIG__ = {
  supabaseUrl: "https://你的项目编号.supabase.co",
  supabaseAnonKey: "你的公开密钥",
};
```

配置为空时，应用继续使用当前单机模式。配置完成并重新构建后，应用会显示亲友登录页。

## 7. 验证权限

至少创建管理员和普通成员两个账号，然后验证：

1. 两个账号在同一部 iPhone 登录时看到不同档案。
2. 普通成员只能读取自己的训练数据。
3. 管理员可以停用成员，但无法查询成员训练档案和训练记录。
4. 被停用成员重新打开应用后无法进入档案。
5. 本机旧档案只有在用户确认后才导入当前账号。
