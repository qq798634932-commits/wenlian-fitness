import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.CODEX_PLAYWRIGHT_PATH ??
  "/Users/xiaotian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightPath);

const baseUrl = "http://127.0.0.1:4173/";
const supabaseUrl = "https://invite-flow.supabase.co";
const loginId = "WL-7K9M-2Q4X";
const member = {
  user_id: "invite-member-01",
  email: "wl7k9m2q4x@members.wenlian-fitness.app",
  login_id: loginId,
  auth_method: "invite_code",
  display_name: "手机测试账号",
  role: "member",
  status: "active",
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
};

const stored = {
  profile: null,
  bodyLogs: [],
  plan: null,
  records: [],
};

function sessionUser() {
  return {
    id: member.user_id,
    aud: "authenticated",
    role: "authenticated",
    email: member.email,
    email_confirmed_at: "2026-07-28T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { login_id: loginId, auth_method: "invite_code" },
    identities: [],
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
  };
}

function jwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: member.user_id, exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.from("test-signature").toString("base64url")}`;
}

async function fulfillJson(route, body, status = 200, count = null) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Range",
  };
  if (count !== null) headers["Content-Range"] = count ? `0-${count - 1}/${count}` : "*/0";
  await route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
}

async function installRoutes(context) {
  await context.route("**/app-config.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: `window.__WENLIAN_CONFIG__={supabaseUrl:"${supabaseUrl}",supabaseAnonKey:"test-anon-key"};`,
  }));

  await context.route(`${supabaseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.startsWith("/auth/v1/")) {
      console.log(`auth_request ${method} ${url.pathname}${url.search}`);
    }

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
      return;
    }
    if (url.pathname === "/functions/v1/redeem-invite-code") {
      await fulfillJson(route, {
        loginId,
        displayName: member.display_name,
        accessToken: jwt(),
        refreshToken: "invite-refresh-token",
      });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await fulfillJson(route, sessionUser());
      return;
    }
    if (url.pathname === "/auth/v1/token") {
      await fulfillJson(route, {
        access_token: jwt(),
        refresh_token: "invite-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user: sessionUser(),
      });
      return;
    }

    const table = url.pathname.split("/").at(-1);
    if (table === "memberships") {
      await fulfillJson(route, member, 200, 1);
      return;
    }
    if (table === "training_profiles") {
      if (method === "GET") await fulfillJson(route, stored.profile, 200, stored.profile ? 1 : 0);
      else {
        stored.profile = request.postDataJSON();
        await fulfillJson(route, stored.profile, 201, 1);
      }
      return;
    }
    if (table === "body_logs") {
      if (method === "GET") await fulfillJson(route, stored.bodyLogs, 200, stored.bodyLogs.length);
      else {
        const row = request.postDataJSON();
        stored.bodyLogs = [row, ...stored.bodyLogs.filter((item) => item.id !== row.id)];
        await fulfillJson(route, row, 201, 1);
      }
      return;
    }
    if (table === "training_plans") {
      if (method === "GET") await fulfillJson(route, stored.plan ? { payload: stored.plan.payload } : null, 200, stored.plan ? 1 : 0);
      else {
        stored.plan = request.postDataJSON();
        await fulfillJson(route, stored.plan, 201, 1);
      }
      return;
    }
    if (table === "workout_records") {
      if (method === "GET") {
        await fulfillJson(route, stored.records.map((record) => ({ payload: record.payload })), 200, stored.records.length);
      } else {
        const row = request.postDataJSON();
        stored.records = [row, ...stored.records.filter((item) => item.id !== row.id)];
        await fulfillJson(route, row, 201, 1);
      }
      return;
    }
    if (table === "music_links") {
      await fulfillJson(route, [], 200, 0);
      return;
    }

    await fulfillJson(route, { message: `unmocked ${method} ${url.pathname}` }, 404);
  });
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "dark",
  serviceWorkers: "block",
});
await installRoutes(context);
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") console.error(`browser_console_error ${message.text()}`);
});
page.on("pageerror", (error) => console.error(`browser_page_error ${error.message}`));
await page.goto(baseUrl, { waitUntil: "networkidle" });

await page.getByRole("heading", { name: "激活你的档案" }).waitFor();
await page.getByLabel("一次性邀请码").fill(loginId);
await page.getByLabel("6位数字密码", { exact: true }).fill("275804");
await page.getByLabel("再次输入密码").fill("275804");
await page.getByRole("button", { name: "激活并进入" }).click();
try {
  await page.getByText("私人档案已同步").waitFor({ timeout: 10_000 });
} catch (error) {
  await page.screenshot({ path: "/private/tmp/wenlian-invite-failure.png", fullPage: true });
  console.error(`invite_activation_failure ${await page.locator("body").innerText()}`);
  throw error;
}

await page.getByRole("button", { name: "计划", exact: true }).click();
await page.getByRole("button", { name: "开始填写" }).click();
await page.getByRole("dialog", { name: "个人训练档案" }).waitFor();
await page.getByLabel("称呼").fill("测试小安");
await page.getByLabel("年龄").fill("31");
await page.getByLabel("身高 cm").fill("168");
await page.getByRole("spinbutton", { name: "体重 kg", exact: true }).fill("62.5");
await page.getByRole("button", { name: "保存个人档案" }).click();
await page.getByText("测试小安的档案").waitFor();
await page.waitForFunction(() => window.localStorage.getItem("wenlian-training-profile-v1:invite-member-01") !== null);
assert.equal(stored.profile?.user_id, member.user_id);
assert.equal(stored.profile?.name, "测试小安");

await page.getByRole("button", { name: "今天", exact: true }).click();
await page.getByRole("button", { name: "开始训练" }).click();
const addSetButtons = page.locator('button[aria-label$="增加一组"]');
await addSetButtons.first().click();
await page.getByRole("button", { name: "完成本次训练" }).click();
await page.getByRole("heading", { name: "看见稳定积累" }).waitFor();
assert.equal(stored.records.length, 1);
assert.equal(stored.records[0].user_id, member.user_id);

await page.reload({ waitUntil: "networkidle" });
await page.getByText("私人档案已同步").waitFor();
await page.getByRole("button", { name: "计划", exact: true }).click();
await page.getByText("测试小安的档案").waitFor();
await page.getByRole("button", { name: "记录", exact: true }).click();
await page.getByText(stored.records[0].title).waitFor();

await page.screenshot({ path: "/private/tmp/wenlian-invite-profile.png", fullPage: true });
await context.close();
await browser.close();

console.log(`invite_code_profile_ok login_id=${loginId} profile=${stored.profile.name} records=${stored.records.length} screenshot=/private/tmp/wenlian-invite-profile.png`);
