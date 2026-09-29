import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

function harness(storage = {}, globals = {}) {
  const elements = new Map();
  const selectors = new Map();
  const timers = new Map();
  let timerId = 0;
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
    addEventListener() {},
  };
  const context = vm.createContext({
    document, window: { storage, pageYOffset: 0, scrollTo() {} },
    localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    navigator: {}, console: { error() {} }, confirm: () => true,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    ...globals,
  });
  const start = script.indexOf("  (async function init(){");
  vm.runInContext(script.slice(0, start) + `
    globalThis.app={snapshot,newRow,bindRowEvents,resetAll,saveDraft,loadDraft,recalc,buildPrintSheet,readImage,
      today:typeof today==="function"?today:null};
  })();`, context);
  return {
    app: context.app, context, document, elements, selectors, timers, element,
    state: () => JSON.parse(context.app.snapshot()),
    async load(data) {
      const input = document.getElementById("inDraft");
      input.files = [{ text: async () => JSON.stringify(data) }];
      await input.dispatch("change");
    },
    async add() { await document.getElementById("addRow").dispatch("click"); },
  };
}

test("リセット後も明細IDが重複せず、日付は指定した明細だけに追加される", async () => {
  const h = harness();
  await h.load({ rows: [{ id: 1 }, { id: 2 }], uid: 3 });
  await h.app.resetAll();
  for (let i = 0; i < 6; i++) await h.add();
  const ids = h.state().rows.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const button = h.element();
  button.dataset.addsingle = String(ids.at(-1));
  h.selectors.set("[data-addsingle]", [button]);
  h.app.bindRowEvents();
  await button.dispatch("click");
  assert.equal(h.state().rows.at(-1).dates.length, 2);
  assert.equal(h.state().rows[0].dates.length, 1);
});

test("古い保存データのuidが小さくても、追加明細・添付のIDは衝突しない", async () => {
  const h = harness();
  await h.load({ rows: [{ id: 1 }, { id: 4 }, { id: "4" }],
    attachments: [{ id: 4, dataUrl: "data:image/png;base64,AA==" }], uid: "1" });
  await h.add();
  await h.add();
  const s = h.state();
  const ids = [...s.rows, ...s.attachments].map(r => Number(r.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(Number(s.uid) > Math.max(...ids));
});

test("日付のinputイベント直後に期間を追加しても、入力済み日付を失わない", async () => {
  const h = harness();
  await h.load({ rows: [{ id: 1 }], uid: 2 });
  const input = h.element();
  input.dataset = { id: "1", di: "0", dk: "d1" };
  input.value = "2026-09-30";
  const button = h.element(); button.dataset.addrange = "1";
  h.selectors.set("#rows [data-dk]", [input]);
  h.selectors.set("[data-addrange]", [button]);
  h.app.bindRowEvents();
  await input.dispatch("input");
  await button.dispatch("click");
  assert.equal(h.state().rows[0].dates[0].d1, "2026-09-30");
  assert.equal(h.state().rows[0].dates[1].type, "range");
});

test("不正なファイルの読み込みに失敗しても現在の入力を保持する", async () => {
  const h = harness();
  await h.load({ date: "2026-09-30", name: "保持する氏名", rows: [{ id: 1, transport: "1200" }] });
  const before = h.state();
  await h.load({ date: "2020-01-01", name: "上書きしない", rows: "invalid" });
  assert.deepEqual(h.state(), before);
  await h.load({ rows: [{ id: 5, dates: [null] }] });
  assert.deepEqual(h.state(), before);
  await h.load({});
  assert.deepEqual(h.state(), before);
  await h.load({ rows: [{ transport: { toString: null } }] });
  assert.deepEqual(h.state(), before);
});

test("自動下書きの読み込みもIDを安全に復元する", async () => {
  const h = harness({ get: async () => ({ value: JSON.stringify({ rows: [{id: 8}], uid: 1 }) }) });
  assert.equal(await h.app.loadDraft(), true);
  await h.add();
  assert.equal(new Set(h.state().rows.map(r => r.id)).size, 2);
});

test("自動保存は順番に処理され、古い保存が新しい入力を上書きしない", async () => {
  let active = 0, maxActive = 0;
  const saved = [];
  const h = harness({ set: async (_key, value) => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setImmediate(resolve));
    saved.push(JSON.parse(value)); active--;
  } });
  h.document.getElementById("f_name").value = "先";
  const first = h.app.saveDraft();
  h.document.getElementById("f_name").value = "後";
  const second = h.app.saveDraft();
  await Promise.all([first, second]);
  assert.equal(maxActive, 1);
  assert.equal(saved.at(-1).name, "後");
});

test("リセットは予約済みの自動保存を解除する", async () => {
  const h = harness();
  await h.load({ rows: [{ id: 1 }], uid: 2 });
  await h.document.getElementById("f_name").dispatch("input");
  const pending = [...h.timers].find(([, fn]) => fn.name === "saveDraft")?.[0];
  assert.ok(pending);
  await h.app.resetAll();
  assert.equal(h.timers.has(pending), false);
});

test("既存の各費目と特別手当の計算仕様を維持する", () => {
  const h = harness();
  const r = h.app.newRow();
  Object.assign(r, { depart: "06:00", ret: "21:00", lodgingNights: "2", perDiemDays: "2",
    gasOneway: "10", gasTrips: "2", other1Type: "iset", other1Days: "4", other1Half: true });
  h.app.recalc(r);
  assert.equal(r.plaza, "2000");
  assert.equal(r.lodging, "18000");
  assert.equal(r.perDiem, "4000");
  assert.equal(r.gas, "1200");
  assert.equal(r.other1, "6000");
  r.other1Mode = "auto";
  r.dates = [{ type: "range", d1: "2026-09-01", d2: "2026-09-05" }];
  h.app.recalc(r);
  assert.equal(r.other1, "3000");
});

test("リセット中の保存は完了を待ってから削除し、古い下書きを復活させない", async () => {
  const actions = [];
  const h = harness({ set: async () => { await new Promise(r => setImmediate(r)); actions.push("set"); },
    delete: async () => { actions.push("delete"); } });
  const pending = h.app.saveDraft();
  await new Promise(r => setImmediate(r));
  await h.app.resetAll();
  await pending;
  assert.deepEqual(actions, ["set", "delete"]);
});

test("起動時の読み込みが遅れて完了してもリセット内容を上書きしない", async () => {
  let finish;
  const h = harness({ get: () => new Promise(r => { finish=r; }) });
  const pending = h.app.loadDraft();
  await h.app.resetAll();
  finish({ value: JSON.stringify({ name: "古いデータ", rows: [{id: 8}] }) });
  await pending;
  assert.equal(h.state().name, "");
  assert.equal(h.state().rows[0].id, 1);
});

test("複数の保存ファイルを読み込んだ場合は最後に選択したファイルを優先する", async () => {
  const h = harness(); let finish;
  const input = h.document.getElementById("inDraft");
  input.files = [{ text: () => new Promise(r => { finish=r; }) }];
  const pending = input.dispatch("change");
  await h.load({ name: "最後のファイル", rows: [{id: 2}] });
  finish(JSON.stringify({ name: "前のファイル", rows: [{id: 1}] }));
  await pending;
  assert.equal(h.state().name, "最後のファイル");
});

test("バーコード・カスタムの自由入力金額は旧データでも別欄へ移さない", async () => {
  const h = harness();
  for (const konType of ["機械バーコード", "カスタム"]) {
    await h.load({ rows: [{ id: 1, konType, other1Type: "free", other1: "100", other2: "50" }] });
    assert.equal(h.state().rows[0].other1, "100");
    assert.equal(h.state().rows[0].other2, "50");
  }
});

test("提出日の初期値はUTCではなく利用端末の今日を使う", () => {
  class LocalDate {
    getFullYear() { return 2026; } getMonth() { return 8; } getDate() { return 30; }
    toISOString() { return "2026-09-29T21:30:00.000Z"; }
  }
  const h = harness({}, { Date: LocalDate });
  assert.equal(h.app.today(), "2026-09-30");
});

test("PDFの途中のページが失敗しても取り込めたページは表示・保存される", async () => {
  const h = harness();
  const pdfjsLib = { getDocument: () => ({ promise: Promise.resolve({
    numPages: 2, getPage: async n => {
      if(n===2) throw new Error("破損ページ");
      return { getViewport: () => ({width:10,height:10}), render: () => ({promise:Promise.resolve()}) };
    },
  }) }) };
  h.context.window.pdfjsLib = pdfjsLib; h.context.pdfjsLib = pdfjsLib;
  h.document.createElement = () => ({ getContext: () => ({fillRect(){}}),
    toDataURL: () => "data:image/jpeg;base64,AA==" });
  const input = h.document.getElementById("inPdf");
  input.files = [{ name:"receipt.pdf", arrayBuffer:async()=>new ArrayBuffer(0) }];
  await input.dispatch("change");
  assert.equal(h.state().attachments.length, 1);
  assert.ok(h.document.getElementById("attGrid").lastElementChild);
  assert.ok([...h.timers.values()].some(fn=>fn.name==="saveDraft"));
});

test("画像読み込み中にリセットした場合は古い画像を追加しない", async () => {
  const h = harness(); let image;
  h.context.FileReader = class {
    readAsDataURL() { this.result="data:image/jpeg;base64,AA=="; queueMicrotask(()=>this.onload()); }
  };
  h.context.Image = class {
    set src(_) { image=this; this.naturalWidth=10; this.naturalHeight=10; }
  };
  const pending = h.app.readImage({}, "撮影");
  await new Promise(r => setImmediate(r));
  await h.app.resetAll();
  image.onload(); await pending;
  assert.equal(h.state().attachments.length, 0);
});
