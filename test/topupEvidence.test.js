const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { decodeBuktiTransfer } = require("../src/topupEvidence");

async function gambar(format) {
  return sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 30, g: 90, b: 150 },
    },
  }).toFormat(format).toBuffer();
}

test("accepts JPEG, PNG, and WebP and derives MIME/hash from image bytes", async () => {
  for (const [format, mime] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
    const bytes = await gambar(format);
    const result = await decodeBuktiTransfer(`data:image/not-trusted;base64,${bytes.toString("base64")}`);
    assert.equal(result.mime, mime);
    assert.equal(result.bytes.equals(bytes), true);
    assert.match(result.hash, /^[a-f0-9]{64}$/);
  }
});

test("rejects SVG, HTML, PDF, and GIF bytes regardless of claimed MIME", async () => {
  for (const text of [
    "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
    "<!doctype html><html></html>",
    "%PDF-1.7",
    "GIF89a",
  ]) {
    const dataUrl = `data:image/jpeg;base64,${Buffer.from(text).toString("base64")}`;
    await assert.rejects(decodeBuktiTransfer(dataUrl), /JPEG, PNG, atau WebP/);
  }
});

test("rejects a JPEG-labeled HTML upload and files above 1.5 MB", async () => {
  const html = `data:image/jpeg;base64,${Buffer.from("<html>not an image</html>").toString("base64")}`;
  await assert.rejects(decodeBuktiTransfer(html), /JPEG, PNG, atau WebP/);

  const tooLarge = Buffer.concat([await gambar("png"), Buffer.alloc(1.5 * 1024 * 1024)]);
  await assert.rejects(
    decodeBuktiTransfer(`data:image/png;base64,${tooLarge.toString("base64")}`),
    /maksimal 1,5 MB/,
  );
});

test("rejects malformed/non-data-URL base64 instead of silently decoding it", async () => {
  await assert.rejects(decodeBuktiTransfer("not-base64"), /Format bukti transfer tidak valid/);
  await assert.rejects(decodeBuktiTransfer("data:image/png;base64,%%%"), /Format bukti transfer tidak valid/);
});
