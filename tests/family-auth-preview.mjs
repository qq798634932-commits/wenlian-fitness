import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.CODEX_PLAYWRIGHT_PATH ??
  "/Users/xiaotian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightPath);

const baseUrl = "http://127.0.0.1:4173/";
const supabaseUrl = "https://family-test.supabase.co";
const admin = {
  user_id: "user-admin",
  email: "admin@example.com",
  display_name: "小天",
  role: "admin",
  status: "active",
  created_at: "2026-07-27T00:00:00.000Z",
  updated_at: "2026-07-27T00:00:00.000Z",
};
const member = {
  user_id: "user-member",
  email: "family@example.com",
  display_name: "亲友成员",
  role: "member",
  status: "active",
  created_at: "2026-07-27T01:00:00.000Z",
  updated_at: "2026-07-27T01:00:00.000Z",
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

function configRoute(page) {
  return page.route("**/app-config.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: `window.__WENLIAN_CONFIG__={supabaseUrl:"${supabaseUrl}",supabaseAnonKey:"test-anon-key"};`,
  }));
}

async function mockSupabase(page) {
  await page.route(`${supabaseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/auth/v1/otp") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionUser()) });
      return;
    }
    if (url.pathname.endsWith("/memberships")) {
      const ownQuery = url.searchParams.get("user_id");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Range",
          "Content-Range": ownQuery ? "0-0/1" : "0-1/2",
        },
        body: JSON.stringify(ownQuery ? admin : [admin, member]),
      });
      return;
    }
    if (url.pathname.endsWith("/training_profiles")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user_id: admin.user_id,
          name: "小天",
          age: 32,
          height_cm: 175,
          weight_kg: 72.5,
          level: "beginner",
          goal: "muscle",
          weekly_days: 3,
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/training_plans")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
      return;
    }
    if (["/body_logs", "/workout_records", "/music_links"].some((path) => url.pathname.endsWith(path))) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"unmocked"}' });
  });
}

function sessionUser() {
  return {
    id: admin.user_id,
    aud: "authenticated",
    role: "authenticated",
    email: admin.email,
    email_confirmed_at: "2026-07-27T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-07-27T00:00:00.000Z",
    updated_at: "2026-07-27T00:00:00.000Z",
  };
}

function jwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: admin.user_id, exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
}

const signedOutContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
const signedOutPage = await signedOutContext.newPage();
await configRoute(signedOutPage);
await mockSupabase(signedOutPage);
await signedOutPage.goto(baseUrl, { waitUntil: "networkidle" });
await signedOutPage.getByRole("heading", { name: "登录稳练" }).waitFor();
await signedOutPage.getByLabel("邮箱").fill("family@example.com");
await signedOutPage.getByRole("button", { name: "发送登录链接" }).click();
await signedOutPage.getByText("登录邮件已发送").waitFor();
await signedOutContext.close();

const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
await adminContext.addInitScript(({ token, user }) => {
  window.localStorage.setItem("sb-family-test-auth-token", JSON.stringify({
    access_token: token,
    refresh_token: "test-refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user,
  }));
}, { token: jwt(), user: sessionUser() });
const adminPage = await adminContext.newPage();
await configRoute(adminPage);
await mockSupabase(adminPage);
await adminPage.goto(baseUrl, { waitUntil: "networkidle" });
await adminPage.getByText("私人档案已同步").waitFor();
await adminPage.getByRole("button", { name: "打开账号设置" }).click();
await adminPage.getByRole("button", { name: "管理亲友账号" }).click();
await adminPage.getByRole("heading", { name: "成员管理" }).waitFor();
await adminPage.getByText("亲友成员").waitFor();
assert.equal(await adminPage.getByText("这里仅显示账号状态，不提供身体档案或训练记录入口。").count(), 1);
assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
await adminPage.screenshot({ path: "/private/tmp/wenlian-family-admin.png", fullPage: true });
await adminContext.close();

await browser.close();
console.log("family_auth_ok screenshot=/private/tmp/wenlian-family-admin.png");
