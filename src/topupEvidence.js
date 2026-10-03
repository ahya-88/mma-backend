const crypto = require("crypto");
const sharp = require("sharp");

const MAX_BUKTI_BYTES = 1.5 * 1024 * 1024;

function deteksiTipeGambar(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", extension: "png" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

async function decodeBuktiTransfer(dataUrl, { maxBytes = MAX_BUKTI_BYTES } = {}) {
  if (typeof dataUrl !== "string") throw new Error("Bukti transfer wajib diupload.");
  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || !match[1]) throw new Error("Format bukti transfer tidak valid. Unggah gambar JPEG, PNG, atau WebP.");

  const base64 = match[1];
  const decodedLength = Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (decodedLength > maxBytes) throw new Error("Ukuran bukti transfer maksimal 1,5 MB.");

  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) throw new Error("Format bukti transfer tidak valid.");
  if (bytes.length > maxBytes) throw new Error("Ukuran bukti transfer maksimal 1,5 MB.");

  const tipe = deteksiTipeGambar(bytes);
  if (!tipe) throw new Error("Bukti transfer harus berupa gambar JPEG, PNG, atau WebP yang valid.");
  try {
    const format = await sharp(bytes, { limitInputPixels: 40000000, failOn: "error" }).metadata();
    const formatValid = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    };
    if (format.format !== formatValid[tipe.mime]) throw new Error("Format gambar tidak sesuai dengan magic bytes.");
  } catch {
    throw new Error("Bukti transfer harus berupa gambar JPEG, PNG, atau WebP yang valid.");
  }
  return { bytes, ...tipe, hash: crypto.createHash("sha256").update(bytes).digest("hex") };
}

module.exports = { MAX_BUKTI_BYTES, deteksiTipeGambar, decodeBuktiTransfer };
