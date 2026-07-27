import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.CODEX_PLAYWRIGHT_PATH ??
  "/Users/xiaotian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightPath);

const screenshot = "/private/tmp/wenlian-music-ui-iphone.png";
const fullScreenshot = "/private/tmp/wenlian-music-ui-full.png";
const lightScreenshot = "/private/tmp/wenlian-music-ui-light.png";

function silentWav() {
  const sampleRate = 8000;
  const samples = 1600;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

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
await page.route("https://music.163.com/**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: "<html><body><p>网易云官方播放器测试替身</p></body></html>",
  }),
);

await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "音乐", exact: true }).click();
await page.getByRole("heading", { name: "让节奏跟上动作" }).waitFor();

assert.equal(await page.getByRole("navigation", { name: "主要导航" }).getByRole("button").count(), 4);
assert.equal(await page.locator(".playlist-card").count(), 3);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

await page.getByRole("button", { name: "添加歌单" }).click();
await page.getByLabel("歌单链接或数字 ID").fill("https://music.163.com/playlist?id=123456789");
await page.getByLabel("显示名称（可选）").fill("深蹲训练");
await page.getByRole("button", { name: "保存连接" }).click();
const neteaseFrame = page.locator(".netease-player iframe");
await neteaseFrame.waitFor();
assert.match(await neteaseFrame.getAttribute("src"), /id=123456789/);
await page.getByText("网易云歌单已连接").waitFor();

await page.getByRole("button", { name: "添加歌单" }).click();
await page.getByLabel("选择音乐来源").getByRole("button", { name: "QQ 音乐", exact: true }).click();
await page.getByLabel("歌单分享链接").fill("https://y.qq.com/n/ryqq/playlist/888888");
await page.getByLabel("显示名称（可选）").fill("力量输出");
await page.getByRole("button", { name: "保存连接" }).click();
const qqLink = page.getByRole("link", { name: "用 QQ 音乐打开" });
await qqLink.waitFor();
assert.equal(await qqLink.getAttribute("href"), "https://y.qq.com/n/ryqq/playlist/888888");

await page.getByRole("button", { name: "添加歌单" }).click();
await page.getByLabel("选择音乐来源").getByRole("button", { name: "本地音频", exact: true }).click();
await page.locator("input[type=file]").setInputFiles({
  name: "LOVE ATTACK (존박 ver.).wav",
  mimeType: "audio/wav",
  buffer: silentWav(),
});
await page.getByRole("heading", { name: "LOVE ATTACK (존박 ver.)" }).waitFor();
await page.getByText("已保存 1 首本地音频").waitFor();
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "音乐", exact: true }).click();
await page.getByRole("heading", { name: "LOVE ATTACK (존박 ver.)" }).waitFor();

await page.getByRole("button", { name: "播放本地音频" }).click();
await page.getByRole("button", { name: "暂停本地音频" }).waitFor();
await page.getByRole("button", { name: "暂停本地音频" }).click();

await page.getByRole("button", { name: "网易云", exact: true }).click();
assert.equal(await page.locator(".playlist-card").count(), 1);
await page.getByRole("button", { name: "全部", exact: true }).click();

await page.screenshot({ path: screenshot });
await page.addStyleTag({
  content: ".bottom-nav { display: none !important; } .content-shell { padding-bottom: 24px !important; }",
});
await page.screenshot({ path: fullScreenshot, fullPage: true });
await page.emulateMedia({ colorScheme: "light" });
await page.screenshot({ path: lightScreenshot, fullPage: true });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

const unexpectedResponses = badResponses.filter(([, url]) => !url.endsWith("/favicon.ico"));
assert.deepEqual(unexpectedResponses, []);
assert.deepEqual(consoleErrors, []);
console.log(
  `music_integration_ok screenshot=${screenshot} full=${fullScreenshot} light=${lightScreenshot}`,
);

await context.close();
await browser.close();
