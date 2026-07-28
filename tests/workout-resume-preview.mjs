import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.CODEX_PLAYWRIGHT_PATH ??
  "/Users/xiaotian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightPath);
const baseUrl = process.env.RESUME_BASE_URL ?? "http://127.0.0.1:4173/";
const liveLoginId = process.env.RESUME_LOGIN_ID;
const livePin = process.env.RESUME_LOGIN_PIN;
const liveMode = Boolean(liveLoginId && livePin);

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "dark",
  serviceWorkers: "block",
});
if (!liveMode) {
  await context.route("**/app-config.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: "window.__WENLIAN_CONFIG__={};",
  }));
}

let page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle" });
if (liveMode) {
  await page.getByRole("button", { name: "已有账号" }).click();
  await page.getByLabel("登录号").fill(liveLoginId);
  await page.getByLabel("6位数字密码", { exact: true }).fill(livePin);
  await page.getByRole("button", { name: "进入我的档案", exact: true }).click();
  await page.getByText("私人档案已同步").waitFor({ timeout: 30_000 });
}
await page.getByRole("button", { name: "开始训练" }).click();
await page.locator(".session-shell").waitFor();

const workoutTitle = await page.locator(".session-header h1").innerText();
const exercises = page.locator(".session-exercise");
const exerciseCount = await exercises.count();
assert.ok(exerciseCount >= 2);
const firstExercise = exercises.first();
const secondExercise = exercises.nth(1);
const firstName = await firstExercise.locator("h2").innerText();

await firstExercise.getByRole("button", { name: `${firstName}增加一组` }).click();
await firstExercise.getByLabel("重量 kg").fill("42.5");
await firstExercise.getByLabel("实际次数").fill("8");
await page.waitForTimeout(2_100);
const timerBefore = await page.locator(".session-timer").innerText();
assert.notEqual(timerBefore, "00:00");

await secondExercise.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 120));
const scrollBefore = await page.evaluate(() => window.scrollY);
assert.ok(scrollBefore > 300);
await page.waitForTimeout(250);
const storedScroll = await page.evaluate(() => {
  const key = Object.keys(window.localStorage).find((item) => item.startsWith("wenlian-active-workout-v1"));
  const value = key ? window.localStorage.getItem(key) : null;
  return value ? JSON.parse(value).scrollY : null;
});
assert.ok(Math.abs(storedScroll - scrollBefore) < 100, `stored scroll position is ${storedScroll}, expected ${scrollBefore}`);

await page.close();
page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: workoutTitle }).waitFor();
await page.getByText("已恢复上次进度").waitFor();
await page.waitForTimeout(450);

const restoredExercises = page.locator(".session-exercise");
assert.equal(await restoredExercises.count(), exerciseCount);
const restoredFirst = restoredExercises.first();
assert.match(await restoredFirst.locator(".set-stepper strong").innerText(), /^1/);
assert.equal(await restoredFirst.getByLabel("重量 kg").inputValue(), "42.5");
assert.equal(await restoredFirst.getByLabel("实际次数").inputValue(), "8");
assert.notEqual(await page.locator(".session-timer").innerText(), "00:00");
const scrollAfter = await page.evaluate(() => window.scrollY);
assert.ok(Math.abs(scrollAfter - scrollBefore) < 100, `scroll position changed from ${scrollBefore} to ${scrollAfter}`);

await page.screenshot({ path: "/private/tmp/wenlian-workout-resume.png", fullPage: false });
await context.close();
await browser.close();

console.log(`workout_resume_ok title=${workoutTitle} scroll_before=${scrollBefore} scroll_after=${scrollAfter} screenshot=/private/tmp/wenlian-workout-resume.png`);
