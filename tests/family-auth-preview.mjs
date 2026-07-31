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
  login_id: null,
  auth_method: "email",
  display_name: "小天",
  role: "admin",
  status: "active",
  created_at: "2026-07-27T00:00:00.000Z",
  updated_at: "2026-07-27T00:00:00.000Z",
};
const member = {
  user_id: "user-member",
  email: "wl7k9m2q4x@members.wenlian-fitness.app",
  login_id: "WL-7K9M-2Q4X",
  auth_method: "invite_code",
  display_name: "亲友成员",
  role: "member",
  status: "active",
  created_at: "2026-07-27T01:00:00.000Z",
  updated_at: "2026-07-27T01:00:00.000Z",
};
let updatedAdminPassword = null;

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
    if (url.pathname === "/auth/v1/token") {
      const payload = request.postDataJSON();
      assert.equal(payload.email, admin.email);
      assert.equal(payload.password, "WlAdmin!483920-admin@example.com-9x");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: jwt(),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "test-refresh-token",
          user: sessionUser(),
        }),
      });
      return;
    }
    if (url.pathname === "/functions/v1/redeem-invite-code") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          loginId: member.login_id,
          displayName: member.display_name,
          accessToken: jwt(),
          refreshToken: "test-refresh-token",
        }),
      });
      return;
    }
    if (url.pathname === "/auth/v1/user" && request.method() === "PUT") {
      const payload = request.postDataJSON();
      updatedAdminPassword = payload.password;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionUser()) });
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
    if (url.pathname.endsWith("/invite_codes")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Range",
          "Content-Range": "*/0",
        },
        body: "[]",
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
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: admin.user_id, exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.from("test-signature").toString("base64url")}`;
}

const signedOutContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
const signedOutPage = await signedOutContext.newPage();
await configRoute(signedOutPage);
await mockSupabase(signedOutPage);
await signedOutPage.goto(baseUrl, { waitUntil: "networkidle" });
await signedOutPage.getByRole("heading", { name: "激活你的档案" }).waitFor();
await signedOutPage.getByLabel("一次性邀请码").fill(member.login_id);
await signedOutPage.getByLabel("6位数字密码").fill("275804");
await signedOutPage.getByLabel("再次输入密码").fill("275804");
await signedOutPage.getByRole("button", { name: "激活并进入" }).click();
await signedOutPage.getByText("私人档案已同步").waitFor();
await signedOutContext.close();

const adminLoginContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
const adminLoginPage = await adminLoginContext.newPage();
await configRoute(adminLoginPage);
await mockSupabase(adminLoginPage);
await adminLoginPage.goto(baseUrl, { waitUntil: "networkidle" });
await adminLoginPage.getByRole("button", { name: "管理员登录" }).click();
await adminLoginPage.getByLabel("管理员邮箱").fill(admin.email);
await adminLoginPage.getByLabel("6位数字密码").fill("483920");
await adminLoginPage.getByRole("button", { name: "进入管理员账号" }).click();
await adminLoginPage.getByText("私人档案已同步").waitFor();
assert.equal(await adminLoginPage.evaluate(() => localStorage.getItem("wenlian-admin-email-v1")), admin.email);
await adminLoginContext.close();

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
await configRoute(adminContext);
await mockSupabase(adminContext);
await adminPage.goto(baseUrl, { waitUntil: "networkidle" });
await adminPage.getByText("私人档案已同步").waitFor();
await adminPage.getByRole("button", { name: "打开账号设置" }).click();
await adminPage.getByRole("button", { name: "设置或更换6位管理员密码" }).click();
await adminPage.getByLabel("新6位密码").fill("483920");
await adminPage.getByLabel("再次输入").fill("483920");
await adminPage.getByRole("button", { name: "保存管理员密码" }).click();
await adminPage.getByText("6位管理员密码已保存，今后无需邮件即可登录。").waitFor();
assert.equal(updatedAdminPassword, "WlAdmin!483920-admin@example.com-9x");
const adminWindowPromise = adminContext.waitForEvent("page");
await adminPage.getByRole("link", { name: "管理亲友账号" }).click();
const adminWindow = await adminWindowPromise;
await adminWindow.getByRole("heading", { name: "成员管理" }).waitFor();
await adminWindow.getByText("亲友成员").waitFor();
assert.match(adminWindow.url(), /\/admin\.html$/);
assert.equal(await adminPage.getByRole("button", { name: "打开账号设置" }).count(), 1);
assert.equal(await adminWindow.getByText("这里仅显示账号状态，不提供身体档案或训练记录入口。").count(), 1);
assert.equal(await adminWindow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
await adminWindow.screenshot({ path: "/private/tmp/wenlian-family-admin.png", fullPage: true });
await adminContext.close();

await browser.close();
console.log("family_auth_ok screenshot=/private/tmp/wenlian-family-admin.png");
