const crypto = require("crypto");

const MAX_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
}

function isPng(bytes) {
  return bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;
}

function isWebp(bytes) {
  return bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

async function decodeBuktiTransfer(buktiTransfer) {
  if (!buktiTransfer || typeof buktiTransfer !== "string") {
    throw new Error("Format bukti transfer tidak valid.");
  }

  const trimmed = buktiTransfer.trim();
  if (!trimmed.startsWith("data:")) {
    throw new Error("Format bukti transfer tidak valid.");
  }

  const matches = trimmed.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("Format bukti transfer tidak valid.");
  }

  const base64Data = matches[2];
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data) || base64Data.length % 4 !== 0) {
    throw new Error("Format bukti transfer tidak valid.");
  }

  const bytes = Buffer.from(base64Data, "base64");
  if (!bytes || bytes.length === 0) {
    throw new Error("Bukti transfer kosong atau gagal didecode.");
  }

  if (bytes.length > MAX_SIZE_BYTES) {
    throw new Error("Ukuran bukti transfer maksimal 1,5 MB.");
  }

  let mime;
  let extension;

  if (isJpeg(bytes)) {
    mime = "image/jpeg";
    extension = "jpg";
  } else if (isPng(bytes)) {
    mime = "image/png";
    extension = "png";
  } else if (isWebp(bytes)) {
    mime = "image/webp";
    extension = "webp";
  } else {
    throw new Error("Format bukti transfer harus berupa JPEG, PNG, atau WebP.");
  }

  const hash = crypto.createHash("sha256").update(bytes).digest("hex");

  return {
    bytes,
    mime,
    extension,
    hash,
  };
}

module.exports = {
  decodeBuktiTransfer,
};

