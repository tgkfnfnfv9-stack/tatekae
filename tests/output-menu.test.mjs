import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("下部の共有ボタン表示を出力に変更する", () => {
  assert.match(html, /id="btnShare"[\s\S]*?出力\s*<\/button>/);
});

test("出力メニューに共有と印刷を表示する", () => {
  assert.match(html, /id="outputMenu"/);
  assert.match(html, /id="outputShare"[\s\S]*?共有\s*<\/button>/);
  assert.match(html, /id="outputPrint"[\s\S]*?印刷\s*<\/button>/);
});

test("印刷はブラウザの印刷機能を使用する", () => {
  assert.match(html, /function doPrint\(\)[\s\S]*?buildPrintSheet\(\);[\s\S]*?window\.print\(\)/);
  assert.match(html, /@media print/);
  assert.match(html, /@page\{size:A4 landscape;margin:8mm\}/);
});

test("共有は従来のPDF共有処理を呼び出す", () => {
  assert.match(html, /id="outputShare"/);
  assert.match(html, /\$\("outputShare"\)\.addEventListener\("click",\(\)=>\{ closeOutputMenu\(\); doShare\(\); \}\)/);
});
