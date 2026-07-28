import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.CODEX_PLAYWRIGHT_PATH ??
  "/Users/xiaotian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightPath);

const baseUrl = process.env.LIVE_BASE_URL ?? "https://qq798634932-commits.github.io/wenlian-fitness/";
const inviteCode = process.env.LIVE_INVITE_CODE;
const pin = process.env.LIVE_TEST_PIN;
if (!inviteCode || !pin) throw new Error("LIVE_INVITE_CODE and LIVE_TEST_PIN are required");

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "dark",
  serviceWorkers: "block",
});
let page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle" });

await page.getByRole("heading", { name: "激活你的档案" }).waitFor();
await page.getByLabel("一次性邀请码").fill(inviteCode);
await page.getByLabel("6位数字密码", { exact: true }).fill(pin);
await page.getByLabel("再次输入密码").fill(pin);
await page.getByRole("button", { name: "激活并进入" }).click();
await page.getByText("私人档案已同步").waitFor({ timeout: 30_000 });

await page.getByRole("button", { name: "计划", exact: true }).click();
await page.getByRole("button", { name: "开始填写" }).click();
await page.getByRole("dialog", { name: "个人训练档案" }).waitFor();
await page.getByLabel("称呼").fill("线上测试小安");
await page.getByLabel("年龄").fill("31");
await page.getByLabel("身高 cm").fill("168");
await page.getByRole("spinbutton", { name: "体重 kg", exact: true }).fill("62.5");
const profileSaved = page.waitForResponse((response) =>
  response.url().includes("/rest/v1/training_profiles") &&
  response.request().method() !== "GET" &&
  response.ok(),
);
await page.getByRole("button", { name: "保存个人档案" }).click();
await profileSaved;
await page.getByText("线上测试小安的档案").waitFor();

await page.getByRole("button", { name: "今天", exact: true }).click();
await page.getByRole("button", { name: "开始训练" }).click();
const addSetButtons = page.locator('button[aria-label$="增加一组"]');
assert.ok((await addSetButtons.count()) > 0);
await addSetButtons.first().click();
const recordSaved = page.waitForResponse((response) =>
  response.url().includes("/rest/v1/workout_records") &&
  response.request().method() !== "GET" &&
  response.ok(),
);
await page.getByRole("button", { name: "完成本次训练" }).click();
await recordSaved;
await page.getByRole("heading", { name: "看见稳定积累" }).waitFor();
const historyTitles = page.locator(".history-list article h3");
assert.ok((await historyTitles.count()) > 0);
const savedRecordTitle = await historyTitles.first().innerText();

await page.evaluate(() => {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("wenlian-training-profile-v1") || key.startsWith("wenlian-records-v1")) {
      window.localStorage.removeItem(key);
    }
  }
});
await page.close();
page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByText("私人档案已同步").waitFor({ timeout: 30_000 });
await page.getByRole("button", { name: "计划", exact: true }).click();
await page.getByText("线上测试小安的档案").waitFor();
await page.getByRole("button", { name: "记录", exact: true }).click();
await page.getByRole("heading", { name: savedRecordTitle }).waitFor();

await page.screenshot({ path: "/private/tmp/wenlian-live-invite-profile.png", fullPage: true });
await context.close();
await browser.close();

console.log(`live_invite_ok login_id=${inviteCode} profile=线上测试小安 records=1 screenshot=/private/tmp/wenlian-live-invite-profile.png`);
