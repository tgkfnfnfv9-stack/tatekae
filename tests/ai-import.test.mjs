import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

test("AI取込ボタンと貼り付けダイアログを表示する", () => {
  assert.match(html, /id="btnAi"[\s\S]*?AI取込\s*<\/button>/);
  assert.match(html, /id="aiMenu"/);
  assert.match(html, /id="aiText"/);
  assert.match(html, /id="aiApply"[\s\S]*?取り込む\s*<\/button>/);
});

test("?ai=1 でAI取込ダイアログを自動で開く処理がある", () => {
  assert.match(html, /URLSearchParams\(location\.search\)\.get\("ai"\)==="1"/);
});

function harness() {
  const elements = new Map();
  const selectors = new Map();
  const timers = new Map();
  let timerId = 0;
  const documentHandlers = new Map(), windowHandlers = new Map();
  const element = (id = "") => ({
    id, value: "", textContent: "", innerHTML: "", dataset: {}, style: {}, files: [],
    handlers: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
    async dispatch(type) { for (const fn of [...(this.handlers[type] || [])]) await fn({ target: this }); },
    appendChild(child) { this.lastElementChild = child; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return this; }, getBoundingClientRect() { return { top: 0 }; },
  });
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    createElement() { return element(); },
    querySelectorAll(selector) { return selectors.get(selector) || []; },
    addEventListener(type, fn) { documentHandlers.set(type, fn); },
  };
  const context = vm.createContext({
    document, window: { storage: undefined, pageYOffset: 0, scrollTo() {},
      addEventListener(type, fn) { windowHandlers.set(type, fn); } },
    localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    navigator: {}, console: { error() {} }, confirm: () => true,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const start = script.indexOf("  (async function init(){");
  const expose = `
    globalThis.app={snapshot,newRow};
  `;
  vm.runInContext(script.slice(0, start) + expose + "})();", context);
  return {
    app: context.app, document,
    state: () => JSON.parse(context.app.snapshot()),
    async pasteAi(text) {
      document.getElementById("aiText").value = text;
      await document.getElementById("aiApply").dispatch("click");
    },
    aiError: () => document.getElementById("aiErr").textContent,
  };
}

const sample = {
  date: "2026-11-17",
  name: "瑞澤",
  rows: [
    { konType: "高コン番号", konNo: "243970", address: "トーメイダイヤ",
      dates: [{ type: "single", d1: "2026-10-21" }],
      gasMode: "auto", gasOneway: "36", gasTrips: "1" },
    { konType: "高コン番号", konNo: "246876", address: "長谷川工業",
      dates: [{ type: "single", d1: "2026-11-06" }],
      gasMode: "auto", gasOneway: "20", gasTrips: "1" },
  ],
  attachments: [],
};

test("AI取込：貼り付けたJSONが反映され、ガソリン代が自動計算される", async () => {
  const h = harness();
  await h.pasteAi(JSON.stringify(sample));
  const s = h.state();
  assert.equal(s.date, "2026-11-17");
  assert.equal(s.name, "瑞澤");
  assert.equal(s.rows.length, 2);
  assert.equal(s.rows[0].konNo, "243970");
  assert.equal(s.rows[0].gas, "2160");
  assert.equal(s.rows[1].gas, "1200");
  assert.equal(h.aiError(), "");
});

test("AI取込：コードフェンス付きJSONも取り込める", async () => {
  const h = harness();
  await h.pasteAi("```json\n" + JSON.stringify(sample) + "\n```");
  assert.equal(h.state().rows.length, 2);
});

test("AI取込：添付も貼り付けた内容に置き換わる（既存の添付は残らない）", async () => {
  const h = harness();
  const withAtt = { ...sample, attachments: [{ dataUrl: "data:image/png;base64,AA==", label: "領収書" }] };
  await h.pasteAi(JSON.stringify(withAtt));
  assert.equal(h.state().attachments.length, 1);
  await h.pasteAi(JSON.stringify(sample));
  assert.equal(h.state().attachments.length, 0);
});

test("AI取込：{data:{...}} 形式でも中身を取り込める", async () => {
  const h = harness();
  await h.pasteAi(JSON.stringify({ data: sample }));
  assert.equal(h.state().rows.length, 2);
  assert.equal(h.state().name, "瑞澤");
});

test("AI取込：不正なJSONでは現在の入力を保持し、エラーを表示する", async () => {
  const h = harness();
  await h.pasteAi(JSON.stringify(sample));
  const before = h.state();
  await h.pasteAi("{not json");
  assert.deepEqual(h.state(), before);
  assert.match(h.aiError(), /失敗/);
  await h.pasteAi(JSON.stringify({ rows: "invalid" }));
  assert.deepEqual(h.state(), before);
});
