import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("下部の共有ボタン表示を出力に変更する", () => {
  assert.match(html, /id="btnShare"[\s\S]*?出力\s*<\/button>/);
});

test("出力メニューに共有とPDF保存を表示する", () => {
  assert.match(html, /id="outputMenu"/);
  assert.match(html, /id="outputShare"[\s\S]*?共有\s*<\/button>/);
  assert.match(html, /id="outputSavePdf"[\s\S]*?PDF保存\s*<\/button>/);
  assert.doesNotMatch(html, /id="outputPrint"/);
});

test("PDF保存は対応ブラウザで保存先選択を使用する", () => {
  assert.match(html, /window\.showSaveFilePicker/);
  assert.match(html, /suggestedName:name/);
  assert.match(html, /accept:\{"application\/pdf":\["\.pdf"\]\}/);
  assert.match(html, /handle\.createWritable\(\)/);
  assert.match(html, /writable\.write\(blob\)/);
  assert.match(html, /writable\.close\(\)/);
});

test("保存先選択非対応ブラウザではPDFダウンロードへフォールバックする", () => {
  assert.match(html, /function downloadPdfBlob\(blob,name\)/);
  assert.match(html, /a\.download=name/);
  assert.match(html, /if\(typeof window\.showSaveFilePicker!=="function"\) return null/);
});

test("共有は従来のPDF共有処理を呼び出す", () => {
  assert.match(html, /id="outputShare"/);
  assert.match(html, /\$\("outputShare"\)\.addEventListener\("click",\(\)=>\{ closeOutputMenu\(\); doShare\(\); \}\)/);
});

test("出力メニューからブラウザ印刷は呼び出さない", () => {
  assert.doesNotMatch(html, /window\.print\(\)/);
  assert.doesNotMatch(html, />印刷\s*<\/button>/);
});
