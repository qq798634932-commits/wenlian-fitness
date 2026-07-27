import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/202607270001_family_accounts.sql", import.meta.url);
const configPath = new URL("../public/app-config.js", import.meta.url);
const appPath = new URL("../app/FitnessApp.tsx", import.meta.url);
const serviceWorkerPath = new URL("../public/sw.js", import.meta.url);

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
