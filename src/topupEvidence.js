const crypto = require("crypto");

async function decodeBuktiTransfer(buktiTransfer) {
  if (!buktiTransfer || typeof buktiTransfer !== "string") {
    throw new Error("Format bukti transfer tidak valid.");
  }

  let base64Data = buktiTransfer.trim();
  let mime = "image/jpeg";
  let extension = "jpg";

  if (base64Data.startsWith("data:")) {
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Format data URI bukti transfer tidak valid.");
    }
    mime = matches[1].toLowerCase();
    base64Data = matches[2];

    if (mime.includes("png")) extension = "png";
    else if (mime.includes("webp")) extension = "webp";
    else if (mime.includes("pdf")) extension = "pdf";
    else if (mime.includes("jpeg") || mime.includes("jpg")) extension = "jpg";
  }

  const bytes = Buffer.from(base64Data, "base64");
  if (!bytes || bytes.length === 0) {
    throw new Error("Bukti transfer kosong atau gagal didecode.");
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
