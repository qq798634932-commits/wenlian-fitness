# 亲友私人档案部署说明

亲友采用“每人一个一次性邀请码 + 自设 6 位数字密码 + 手机保持登录”。Supabase Auth、PostgreSQL 和 Row Level Security 负责身份与私人数据，GitHub Pages 只负责前端静态文件。

## 1. 创建 Supabase 项目

在 Supabase 创建一个新项目。记录以下两个公开配置：

- Project URL
- Publishable key 或 anon public key

不要把 `service_role` 密钥写进前端、GitHub 仓库或 `public/app-config.js`。

## 2. 创建数据库

在 Supabase SQL Editor 中按顺序执行：

- `supabase/migrations/202607270001_family_accounts.sql`
- `supabase/migrations/202607280001_invite_code_auth.sql`

该迁移会创建：

- `memberships`：管理员可见的非敏感成员信息
- `invite_codes`：一次性邀请码状态，只存储 SHA-256 摘要，不存明文邀请码
- `training_profiles`：个人训练档案
- `body_logs`：身体状态记录
- `training_plans`：生成的训练方案
- `workout_records`：完成的训练记录
- `music_links`：网易云和 QQ 音乐链接

训练相关表只允许数据所属用户访问，没有管理员读取策略。6 位密码不写入业务表，只由 Supabase Auth 以密码哈希处理。

## 3. 创建第一个管理员

先在 Supabase Dashboard 的 Authentication > Users 中添加自己的邮箱用户。数据库触发器会把普通新用户设为停用状态。管理员仍使用邮箱魔法链接，亲友不需要邮箱。

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

该回调配置只用于管理员邮箱登录。亲友通过邀请码激活，不使用邮箱或短信。

## 5. 部署管理函数

安装并登录 Supabase CLI 后，在项目根目录执行：

```bash
supabase link --project-ref 你的项目编号
supabase secrets set PUBLIC_SITE_URL=https://qq798634932-commits.github.io/wenlian-fitness/
supabase functions deploy create-invite-code
supabase functions deploy redeem-invite-code --no-verify-jwt
supabase functions deploy update-member-status
```

`create-invite-code` 只允许管理员调用。`redeem-invite-code` 必须允许未登录用户调用，但它会校验邀请码、有效期和一次性状态。Edge Function 会自动获得项目的 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`，服务密钥仅存在函数环境中。

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

在管理页输入称呼后生成一个邀请码，再用测试手机验证：

1. 邀请码只能激活一次，激活时可自设 6 位数字密码。
2. 激活后关闭 Safari 再打开，仍保持登录；主动退出后可用原邀请码作为登录号。
3. 保存身高、体重等个人档案，刷新后仍能读取。
4. 完成一次训练并生成记录，刷新后仍能读取。
5. 普通成员只能读取自己的训练数据。
6. 管理员可以停用成员，但无法查询成员训练档案和训练记录。
7. 被停用成员重新打开应用后无法进入档案。
