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
  this.manualSpecialAllowanceRate = manualSpecialAllowanceRate;
`, context);

const { manualSpecialAllowanceDays, manualSpecialAllowanceRate } = context;

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

test("手動入力の1日単価をそのまま計算に使える", () => {
  assert.equal(manualSpecialAllowanceRate("5000"), 5000);
  assert.equal(manualSpecialAllowanceRate("¥ 7,500"), 7500);
  assert.equal(manualSpecialAllowanceRate("-1000"), 0);
  assert.equal(manualSpecialAllowanceRate("5000") * manualSpecialAllowanceDays("4"), 20000);
});

test("自動計算の3日目ルールは既存プリセットで維持する", () => {
  assert.match(html, /return sum\+\(p\.fromDay3\?Math\.max\(0,d-2\):d\)/);
  assert.match(html, /manual:\s*\{label:"手動入力", rate:0, half:false, fromDay3:false, manual:true\}/);
});

test("手動入力では1日の金額欄と日数モードを表示する", () => {
  assert.match(html, /<label>1日の金額<\/label>/);
  assert.match(html, /data-key="\$\{key\}Rate"/);
  assert.match(html, />出張日から自動<\/option>/);
  assert.match(html, />手動で日数選択<\/option>/);
  assert.match(html, /入力した日数をそのまま計算/);
});

test("プリセット選択時は現在の1日単価を画面に表示する", () => {
  assert.match(html, /class="special-rate"/);
  assert.match(html, /class="sr-label">1日の金額/);
  assert.match(html, /class="sr-value">¥\$\{yen\(otherUnit\(r,key\)\)\}/);
  assert.match(html, /連続期間の3日目から適用/);
});

test("営業プリセットの1日単価は1000円を維持する", () => {
  assert.match(html, /eigyo:\s*\{label:"営業・下見・納品・引取・現場売り立会", rate:1000, half:false, fromDay3:true\}/);
});
