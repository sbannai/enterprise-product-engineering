import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../wireframes/campaign-scheduler-wireframe.html", import.meta.url), "utf8");

test("campaign scheduler wireframe keeps long content vertically scrollable", () => {
  assert.match(html, /\.content\s*\{[^}]*overflow-y\s*:\s*auto/s);
  assert.match(html, /\.content\s*\{[^}]*overflow-x\s*:\s*hidden/s);
  assert.match(html, /main\s*\{[^}]*height\s*:\s*100vh/s);
  assert.match(html, /\.app\s*\{[^}]*overflow\s*:\s*hidden/s);
});

test("campaign scheduler wireframe preserves mobile scrolling and wide-table access", () => {
  assert.match(html, /@media\s*\(max-width\s*:\s*620px\)[\s\S]*?main\s*\{[^}]*height\s*:\s*100dvh/s);
  assert.match(html, /\.table-wrap\s*\{[^}]*overflow\s*:\s*auto/s);
  assert.match(html, /table\s*\{[^}]*min-width\s*:\s*\d+px/s);
});

test("campaign scheduler wireframe clearly identifies preview-only behavior", () => {
  assert.match(html, /not connected to live services/i);
  assert.match(html, /no API calls/i);
  assert.match(html, /no live schedules/i);
});
