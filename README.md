# 稳练

面向 iPhone 的亲友私人健身 PWA。包含邀请登录、独立档案、个性化训练方案、三日基础计划、动作库、训练记录、音乐链接和 Obsidian 导出。

## 本地运行

```bash
npm install
npm run dev
```

GitHub Pages 构建：

```bash
npm run build:pages
```

## 个性化计划

- 个人档案：年龄、身高、体重、训练经验、目标和每周训练天数。
- 今日状态：目标部位、睡眠、精力、酸痛、疼痛状态和可用时间。
- 生成逻辑：训练经验与目标决定基础组次，恢复状态决定是否减量。
- 安全边界：身高与体重不用于推算负重；锐痛或麻木时不生成负重计划。
- 数据保存：单机模式保存在浏览器；亲友账号模式同时保存用户隔离的本机缓存与云端档案，可导出 JSON 或 Obsidian Markdown。

## 亲友账号

- 未配置云端时继续使用单机模式，不影响现有记录。
- 配置 Supabase 后采用管理员邀请和邮箱登录链接。
- 每位成员的本地缓存按用户 ID 隔离，云端数据由数据库行级权限隔离。
- 管理员只能邀请、停用和恢复成员，不能读取成员训练数据。
- 完整部署步骤见 `docs/family-cloud-setup.md`。

## 动作库

`public/data/exercises.zh.json` 包含 1324 个动作的中文说明、步骤、部位、器械和目标肌群。重新生成：

```bash
node scripts/build-exercise-catalog.mjs
```

数据来源为 `hasaneyldrm/exercises-dataset`。数据结构与文本采用 MIT 许可；动作媒体归 Gym Visual 所有。应用不会把本地知识库中的 1324 个 GIF 重新公开发布，仅保留当前已经进入应用的演示文件。

## 验证

```bash
npm test
```

移动端交互测试位于 `tests/personal-planner-preview.mjs` 和 `tests/music-integration-preview.mjs`。
