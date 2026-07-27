import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.CODEX_PLAYWRIGHT_PATH ??
  "/Users/xiaotian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightPath);

const screenshot = "/private/tmp/wenlian-personal-plan-iphone.png";
const fullScreenshot = "/private/tmp/wenlian-personal-plan-full.png";
const libraryScreenshot = "/private/tmp/wenlian-exercise-library.png";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: "dark",
  serviceWorkers: "block",
});
const page = await context.newPage();
const consoleErrors = [];
const badResponses = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400) badResponses.push([response.status(), response.url()]);
});

await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "计划", exact: true }).click();
await page.getByRole("heading", { name: "今天怎么练" }).waitFor();
await page.getByRole("button", { name: "开始填写" }).click();

await page.getByLabel("称呼").fill("小天");
await page.getByLabel("年龄").fill("32");
await page.getByLabel("身高 cm").fill("175");
await page.getByRole("spinbutton", { name: "体重 kg", exact: true }).fill("72.5");
await page.getByLabel("每周训练").selectOption("4");
await page.getByLabel("训练经验").selectOption("beginner");
await page.getByLabel("当前目标").selectOption("muscle");
await page.getByRole("button", { name: "保存个人档案" }).click();
await page.getByText("小天的档案").waitFor();

await page.getByLabel("睡眠小时").fill("5.5");
await page.getByRole("button", { name: "2", exact: true }).click();
await page.getByLabel("肌肉酸痛").selectOption("2");
await page.getByRole("button", { name: "45 分钟" }).click();
await page.getByRole("button", { name: "分析并生成今日方案" }).click();
await page.getByRole("heading", { name: "胸部训练" }).waitFor();
await page.getByText("恢复优先").waitFor();
await page.getByText(/本次已减少训练量并降低强度/).waitFor();
assert.equal(await page.locator(".generated-exercises article").count(), 5);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

await page.screenshot({ path: screenshot });
await page.addStyleTag({ content: ".bottom-nav { display: none !important; } .content-shell { padding-bottom: 24px !important; }" });
await page.screenshot({ path: fullScreenshot, fullPage: true });

await page.getByRole("button", { name: "开始执行这套方案" }).click();
await page.getByRole("heading", { name: "胸部训练" }).waitFor();
assert.equal(await page.locator(".session-exercise").count(), 5);
page.once("dialog", (dialog) => dialog.accept());
await page.getByRole("button", { name: "退出本次训练" }).click();

await page.getByRole("button", { name: "动作库" }).click();
await page.getByRole("heading", { name: "1324 个动作" }).waitFor();
await page.getByPlaceholder("搜索英文动作名、器械或肌群").fill("3/4 sit-up");
await page.getByText("找到 1 个动作").waitFor();
await page.getByRole("button", { name: /3\/4 sit-up/ }).click();
await page.getByRole("heading", { name: "3/4 sit-up" }).waitFor();
assert.equal(await page.locator(".exercise-detail-sheet li").count(), 5);
await page.getByRole("button", { name: "关闭动作详情" }).click();
await page.screenshot({ path: libraryScreenshot, fullPage: true });

await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "计划", exact: true }).click();
await page.getByText("小天的档案").waitFor();
await page.getByRole("heading", { name: "胸部训练" }).waitFor();

const unexpectedResponses = badResponses.filter(([, url]) => !url.endsWith("/favicon.ico"));
assert.deepEqual(unexpectedResponses, []);
assert.equal(consoleErrors.length === 0 || unexpectedResponses.length === 0, true);
console.log(`personal_planner_ok screenshot=${screenshot} full=${fullScreenshot} library=${libraryScreenshot}`);

await context.close();
await browser.close();
