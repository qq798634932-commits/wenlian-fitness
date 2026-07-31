import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/202607270001_family_accounts.sql", import.meta.url);
const inviteMigrationPath = new URL("../supabase/migrations/202607280001_invite_code_auth.sql", import.meta.url);
const configPath = new URL("../public/app-config.js", import.meta.url);
const appPath = new URL("../app/FitnessApp.tsx", import.meta.url);
const authGatePath = new URL("../app/FamilyAuthGate.tsx", import.meta.url);
const cloudClientPath = new URL("../app/cloud/client.ts", import.meta.url);
const serviceWorkerPath = new URL("../public/sw.js", import.meta.url);
const createInvitePath = new URL("../supabase/functions/create-invite-code/index.ts", import.meta.url);
const redeemInvitePath = new URL("../supabase/functions/redeem-invite-code/index.ts", import.meta.url);
const supabaseConfigPath = new URL("../supabase/config.toml", import.meta.url);

test("uninvited auth users are disabled by default", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /case when pending_invitation\.id is null then 'disabled'/);
  assert.match(sql, /where lower\(email\) = lower\(coalesce\(new\.email, ''\)\)/);
});

test("private fitness tables only expose owner-scoped policies", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const privateTables = [
    "training_profiles",
    "body_logs",
    "training_plans",
    "workout_records",
    "music_links",
  ];

  for (const table of privateTables) {
    const policy = sql.match(new RegExp(`create policy ${table}_own_rows[\\s\\S]*?;`))?.[0] ?? "";
    assert.match(policy, /user_id = auth\.uid\(\)/, `${table} must be owner scoped`);
    assert.doesNotMatch(policy, /is_current_admin/, `${table} must not grant admin read access`);
  }
});

test("one-time invitation codes never store the member PIN", async () => {
  const sql = await readFile(inviteMigrationPath, "utf8");
  assert.match(sql, /code_hash text not null unique/);
  assert.match(sql, /status public\.invite_code_status not null default 'pending'/);
  assert.match(sql, /create policy invite_codes_read_admin/);
  assert.doesNotMatch(sql, /pin(_hash)?\s+text/i);
  assert.doesNotMatch(sql, /password\s+text/i);
});

test("code redemption is public but guarded by one-time claiming and PIN validation", async () => {
  const redeem = await readFile(redeemInvitePath, "utf8");
  const config = await readFile(supabaseConfigPath, "utf8");
  assert.match(config, /\[functions\.redeem-invite-code\][\s\S]*?verify_jwt = false/);
  assert.match(redeem, /eq\("status", "pending"\)/);
  assert.match(redeem, /status: "claiming"/);
  assert.match(redeem, /status: "redeemed"/);
  assert.match(redeem, /\^\\d\{6\}\$/);
  assert.match(redeem, /signInWithPassword/);
});

test("only active administrators can generate invitation codes", async () => {
  const createInvite = await readFile(createInvitePath, "utf8");
  assert.match(createInvite, /membership\?\.role !== "admin"/);
  assert.match(createInvite, /membership\.status !== "active"/);
  assert.match(createInvite, /crypto\.getRandomValues/);
  assert.match(createInvite, /SHA-256/);
});

test("public runtime config never contains a service role secret", async () => {
  const config = await readFile(configPath, "utf8");
  assert.doesNotMatch(config, /service[_-]?role/i);
  assert.match(config, /supabaseAnonKey/);
});

test("same-device caches are namespaced by the signed-in user", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /const suffix = cloudSession \? `:\$\{cloudSession\.userId\}` : ""/);
  assert.match(app, /wenlian-cloud-dirty-v1\$\{suffix\}/);
});

test("service worker never intercepts Supabase cross-origin requests", async () => {
  const serviceWorker = await readFile(serviceWorkerPath, "utf8");
  assert.match(serviceWorker, /origin !== self\.location\.origin/);
});

test("auth navigations bypass stale app-shell caches", async () => {
  const serviceWorker = await readFile(serviceWorkerPath, "utf8");
  assert.match(serviceWorker, /CACHE_NAME = "wenlian-v12"/);
  assert.match(serviceWorker, /"admin\.html"/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.match(serviceWorker, /fetch\(event\.request, \{ cache: "no-store" \}\)/);
});

test("mobile magic links do not depend on the requesting browser PKCE verifier", async () => {
  const client = await readFile(cloudClientPath, "utf8");
  assert.match(client, /flowType: "implicit"/);
  assert.doesNotMatch(client, /flowType: "pkce"/);
});

test("member sessions persist on the phone and returning login derives no stored PIN", async () => {
  const client = await readFile(cloudClientPath, "utf8");
  const authGate = await readFile(authGatePath, "utf8");
  assert.match(client, /persistSession: true/);
  assert.match(client, /memberAuthPassword/);
  assert.match(authGate, /signInWithPassword/);
  assert.match(authGate, /邀请码首次激活后，继续作为你的登录号使用/);
});

test("admin daily login uses a six-digit PIN while email remains recovery-only", async () => {
  const client = await readFile(cloudClientPath, "utf8");
  const authGate = await readFile(authGatePath, "utf8");
  assert.match(client, /adminAuthPassword/);
  assert.match(authGate, /邮箱或6位管理员密码不正确/);
  assert.match(authGate, /auth\.signInWithPassword/);
  assert.match(authGate, /auth\.updateUser/);
  assert.match(authGate, /首次设置或忘记密码？使用邮件验证/);
});

test("mobile session refreshes on resume without unmounting the active workout", async () => {
  const authGate = await readFile(authGatePath, "utf8");
  assert.match(authGate, /event === "TOKEN_REFRESHED"/);
  assert.match(authGate, /event === "USER_UPDATED"/);
  assert.match(authGate, /window\.addEventListener\("pageshow", refreshOnResume\)/);
  assert.match(authGate, /document\.addEventListener\("visibilitychange", refreshOnResume\)/);
  assert.match(authGate, /client\.auth\.refreshSession\(\)/);
});

test("auth failures explain expired links and email cooldowns", async () => {
  const authGate = await readFile(authGatePath, "utf8");
  assert.match(authGate, /登录链接已失效或已被使用/);
  assert.match(authGate, /邮件发送次数已达当前服务上限/);
  assert.match(authGate, /发送太频繁，请等待 60 秒后再试/);
});
