import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const match = html.match(/\/\* testable-special-allowance:start \*\/([\s\S]*?)\/\* testable-special-allowance:end \*\//);
assert.ok(match, "special allowance helper block must exist");

const context = vm.createContext({});
vm.runInContext(`
  const toNum = value => {
    const number = parseInt(String(value).replace(/[^\\d.-]/g, ""), 10);
    return Number.isNaN(number) ? 0 : number;
  };
  ${match[1]}
  this.manualSpecialAllowanceDays = manualSpecialAllowanceDays;
`, context);

const { manualSpecialAllowanceDays } = context;

test("特別手当の手動日数は入力値をそのまま使う", () => {
  assert.equal(manualSpecialAllowanceDays("4"), 4);
  assert.equal(manualSpecialAllowanceDays("2"), 2);
  assert.equal(manualSpecialAllowanceDays("0"), 0);
});

test("手動日数には自動計算用の3日目ルールを適用しない", () => {
  const rate = 1000;
  assert.equal(manualSpecialAllowanceDays("4") * rate, 4000);
  assert.equal(manualSpecialAllowanceDays("2") * rate, 2000);
});

test("自動計算の3日目ルールは維持する", () => {
  assert.match(html, /return sum\+\(p\.fromDay3\?Math\.max\(0,d-2\):d\)/);
});

test("手動選択時の説明は入力日数をそのまま計算と表示する", () => {
  assert.match(html, /入力した日数をそのまま計算/);
});
