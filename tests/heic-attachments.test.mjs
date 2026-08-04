import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const match = html.match(/\/\* testable-image-helpers:start \*\/([\s\S]*?)\/\* testable-image-helpers:end \*\//);
assert.ok(match, "image helper block must exist");

class DataUrlFileReader {
  async readAsDataURL(blob) {
    try {
      const bytes = Buffer.from(await blob.arrayBuffer()).toString("base64");
      this.result = `data:${blob.type || "application/octet-stream"};base64,${bytes}`;
      queueMicrotask(() => this.onload?.());
    } catch (error) {
      this.error = error;
      queueMicrotask(() => this.onerror?.());
    }
  }
}

class LoadedImage {
  set src(value) {
    if (value === "broken") {
      queueMicrotask(() => this.onerror?.(new Error("broken")));
      return;
    }
    this.naturalWidth = 4000;
    this.naturalHeight = 3000;
    queueMicrotask(() => this.onload?.());
  }
}

const context = vm.createContext({
  Blob,
  FileReader: DataUrlFileReader,
  Image: LoadedImage,
  clearTimeout,
  console,
  queueMicrotask,
  setTimeout,
  window: {},
});
vm.runInContext(`${match[1]}; this.helpers={isHeicFile,imageFormatFromDataUrl,withTimeout,convertHeicToJpeg,processImageFiles,imgDim};`, context);
const { isHeicFile, imageFormatFromDataUrl, withTimeout, convertHeicToJpeg, processImageFiles, imgDim } = context.helpers;

test("HEIC/HEIFを拡張子とMIMEで検出する", () => {
  assert.equal(isHeicFile({ name: "photo.HEIC", type: "" }), true);
  assert.equal(isHeicFile({ name: "photo", type: "image/heif" }), true);
  assert.equal(isHeicFile({ name: "photo", type: "image/heic-sequence" }), true);
  assert.equal(isHeicFile({ name: "photo.jpeg", type: "image/jpeg" }), false);
});

test("Data URLの実形式だけをjsPDF形式へ対応付ける", () => {
  assert.equal(imageFormatFromDataUrl("data:image/jpeg;base64,AA=="), "JPEG");
  assert.equal(imageFormatFromDataUrl("data:image/jpg;base64,AA=="), "JPEG");
  assert.equal(imageFormatFromDataUrl("data:image/png;base64,AA=="), "PNG");
  assert.equal(imageFormatFromDataUrl("data:image/heic;base64,AA=="), null);
  assert.equal(imageFormatFromDataUrl("not-a-data-url"), null);
});

test("HEIC変換結果をimage/jpeg Data URLへ統一する", async () => {
  context.window.HeicTo = async () => new Blob(["converted-jpeg"], { type: "image/jpeg" });
  const result = await convertHeicToJpeg(new Blob(["heic"], { type: "image/heic" }));
  assert.match(result, /^data:image\/jpeg;base64,/);
});

test("HEIC変換ライブラリ未読込時は明示的に失敗する", async () => {
  delete context.window.HeicTo;
  await assert.rejects(convertHeicToJpeg(new Blob(["heic"])), /HEIC変換機能/);
});

test("HEICとJPEGの混在選択は失敗したファイルを除いて継続する", async () => {
  const files = [
    { name: "broken.heic", type: "image/heic" },
    { name: "receipt.jpg", type: "image/jpeg" },
    { name: "scan.png", type: "image/png" },
  ];
  const processed = [];
  const errors = [];
  const result = await processImageFiles(
    files,
    async file => {
      if (file.name.endsWith(".heic")) throw new Error("broken HEIC");
      processed.push(file.name);
    },
    (error, file) => errors.push([file.name, error.message]),
  );
  assert.deepEqual(processed, ["receipt.jpg", "scan.png"]);
  assert.deepEqual(errors, [["broken.heic", "broken HEIC"]]);
  assert.equal(result.added, 2);
  assert.equal(result.heicFailed, 1);
  assert.equal(result.otherFailed, 0);
});

test("imgDimは読込成功・エラー・タイムアウトを終了させる", async () => {
  const dim = await imgDim("ok", 50);
  assert.equal(dim.w, 4000);
  assert.equal(dim.h, 3000);
  await assert.rejects(imgDim("broken", 50), /読み込めません/);

  context.Image = class { set src(_) {} };
  await assert.rejects(imgDim("never-finishes", 10), /タイムアウト/);
});

test("非終了Promiseもタイムアウトで拒否する", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10, "期限切れ"), /期限切れ/);
});

test("添付PDFはData URL判定結果をjsPDFへ渡す", () => {
  assert.match(html, /const format=imageFormatFromDataUrl\(a\.dataUrl\)/);
  assert.match(html, /pdf\.addImage\(a\.dataUrl,format,/);
  assert.doesNotMatch(html, /\^data:image\\\/png.*\?"PNG":"JPEG"/);
});
