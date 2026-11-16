import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

// generatePdf を実行できる最小ハーネス（state-and-events の outputHarness と同方式）
function harness({ canvasOk = true } = {}) {
  const elements = new Map();
  const element = (id = "") => ({
    id, value: "", textContent: "", innerHTML: "", dataset: {}, style: {}, files: [],
    handlers: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
    async dispatch(type) { for (const fn of [...(this.handlers[type] || [])]) await fn({ target: this }); },
    appendChild(child) { this.lastElementChild = child; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return this; }, getBoundingClientRect() { return { top: 0 }; },
  });
  const canvas = () => ({
    width: 0, height: 0,
    getContext() {
      if (!canvasOk) return null;
      return {
        font: "",
        fillStyle: "",
        measureText(t) { return { width: String(t).length * 40 }; },
        fillText() {},
      };
    },
    toDataURL() { return "data:image/png;base64,TE=="; },
  });
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    createElement(tag) { return tag === "canvas" ? canvas() : element(); },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const images = [], texts = [];
  class Pdf {
    constructor() { this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }; }
    addImage(...args) { images.push(args); }
    addPage() {}
    setFontSize() {} setTextColor() {}
    text(...args) { texts.push(args); }
    output() { return new Blob(["PDF"]); }
  }
  const html2canvas = async () => ({ width: 1480, height: 1022, toDataURL: () => "data:image/jpeg;base64,AA==" });
  const context = vm.createContext({
    document,
    window: { storage: {}, jspdf: { jsPDF: Pdf }, html2canvas, pageYOffset: 0, scrollTo() {}, addEventListener() {} },
    localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    navigator: {}, console: { error() {} }, confirm: () => true,
    setTimeout, clearTimeout, html2canvas,
    Image: class { set src(_) { this.naturalWidth = 100; this.naturalHeight = 80; queueMicrotask(() => this.onload()); } },
  });
  const start = script.indexOf("  (async function init(){");
  const expose = `
    globalThis.app={snapshot,generatePdf,labelImage};
  `;
  vm.runInContext(script.slice(0, start) + expose + "})();", context);
  const print = document.getElementById("printArea");
  print.style = { removeProperty() {}, setProperty() {} };
  print.querySelectorAll = () => [{}];
  return { app: context.app, document, images, texts };
}

const tick = () => new Promise(r => setTimeout(r, 0));

test("添付ラベル：日本語ラベルはCanvas画像として貼られ、pdf.textでは描かれない", async () => {
  const h = harness();
  // 下書きへ添付（日本語ラベル付き）を直接読み込ませる代わりに、
  // snapshot 経由ではなく generatePdf が参照する attachments を用意するため
  // inDraft の change イベントを使う
  const input = h.document.getElementById("inDraft");
  input.files = [{
    text: async () => JSON.stringify({
      date: "2026-11-17", name: "瑞澤", rows: [],
      attachments: [{ id: 1, dataUrl: "data:image/jpeg;base64,AA==", label: "領収書サンプル" }],
    }),
  }];
  await input.dispatch("change");
  await tick();
  const pdf = await h.app.generatePdf();
  assert.ok(pdf);
  // 添付画像本体（JPEG）が1件、ラベル画像（PNG）が1件
  const formats = h.images.map(a => a[1]);
  assert.ok(formats.includes("JPEG"), "添付画像が貼られている");
  assert.ok(formats.includes("PNG"), "ラベルが画像として貼られている");
  assert.equal(h.texts.length, 0, "ラベルを pdf.text で描いていない（文字化け回避）");
});

test("添付ラベル：labelImage は寸法とベースラインを返す", () => {
  const h = harness();
  const li = h.app.labelImage("添付: テスト");
  assert.ok(li && typeof li.url === "string" && li.url.startsWith("data:image/png"));
  assert.ok(li.w > 0 && li.h > 0 && li.base > 0 && li.base < li.h);
});

async function loadWithLabel(h, label) {
  const input = h.document.getElementById("inDraft");
  input.files = [{
    text: async () => JSON.stringify({
      date: "2026-11-17", name: "瑞澤", rows: [],
      attachments: [{ id: 1, dataUrl: "data:image/jpeg;base64,AA==", label }],
    }),
  }];
  await input.dispatch("change");
  await tick();
}

test("添付ラベル：Canvasが使えない環境では従来の pdf.text へフォールバックする", async () => {
  const h = harness({ canvasOk: false });
  await loadWithLabel(h, "領収書サンプル");
  const pdf = await h.app.generatePdf();
  assert.ok(pdf);
  assert.equal(h.texts.length, 1, "フォールバックで pdf.text が1回呼ばれる");
  assert.match(String(h.texts[0][0]), /領収書サンプル/);
  assert.ok(!h.images.some(a => a[1] === "PNG"), "ラベル画像は貼られない");
});

test("添付ラベル：極端に長いラベルはページ幅に収まるよう縮小される", async () => {
  const h = harness();
  await loadWithLabel(h, "あ".repeat(300));
  const pdf = await h.app.generatePdf();
  assert.ok(pdf);
  const labelImg = h.images.find(a => a[1] === "PNG");
  assert.ok(labelImg, "ラベル画像が貼られている");
  assert.ok(labelImg[4] <= 210 - 16 + 0.001, `ラベル幅 ${labelImg[4]}mm がページ幅内に収まる`);
});
