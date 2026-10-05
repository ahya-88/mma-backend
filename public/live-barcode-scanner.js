(() => {
  const getAuthToken = () => {
    return sessionStorage.getItem("mma-token") ||
           localStorage.getItem("mma-token") ||
           sessionStorage.getItem("mma-superadmin-token") || "";
  };

  const rupiah = (num) => "Rp " + Number(num || 0).toLocaleString("id-ID");

  const showNotice = (msg, isError = false) => {
    const notice = document.getElementById("notice");
    if (notice) {
      notice.textContent = msg;
      notice.className = `notice${isError ? " error" : ""}`;
      notice.hidden = false;
      setTimeout(() => { notice.hidden = true; }, 4500);
    } else {
      alert((isError ? "⚠️ " : "✅ ") + msg);
    }
  };

  // Synthesize short audio beep on successful scan
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 tone
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch (_) {}
  };

  let html5Qrcode = null;
  let isScanning = false;
  let lastScannedCode = "";
  let lastScanTime = 0;
  let currentCameraFacing = "environment";
  let torchEnabled = false;

  const createScannerModal = () => {
    if (document.getElementById("live-barcode-modal")) return;

    const modal = document.createElement("div");
    modal.id = "live-barcode-modal";
    modal.style.cssText = "position: fixed; inset: 0; z-index: 99999; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 16px; font-family: inherit;";

    modal.innerHTML = `
      <div style="background: #ffffff; width: 100%; max-width: 520px; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); display: flex; flex-direction: column;">
        <!-- Header -->
        <div style="background: #0f172a; padding: 16px 20px; color: #ffffff; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">📷</span>
            <div>
              <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff;">Live Barcode Scanner Kasir</h3>
              <p style="margin: 2px 0 0; font-size: 11px; color: #94a3b8;">Scanner Akurat 1D (EAN-13, Code 128, UPC) & 2D</p>
            </div>
          </div>
          <button type="button" id="btn-close-barcode-modal" style="background: rgba(255,255,255,0.1); border: none; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
        </div>

        <!-- Camera Frame Container -->
        <div style="position: relative; background: #000000; width: 100%; min-height: 280px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
          <div id="live-reader" style="width: 100%; height: 100%;"></div>

          <!-- Red Laser Alignment Box Overlay -->
          <div style="position: absolute; inset: 0; pointer-events: none; display: flex; align-items: center; justify-content: center;">
            <div style="width: 82%; height: 140px; border: 2px solid rgba(239, 68, 68, 0.8); border-radius: 12px; box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.45); position: relative; overflow: hidden;">
              <div style="position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: #ef4444; box-shadow: 0 0 10px #ef4444, 0 0 20px #ef4444; animation: scanLine 2s infinite linear;"></div>
            </div>
          </div>
        </div>

        <!-- Camera Controls & Controls Toolbar -->
        <div style="background: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-toggle-torch" style="padding: 6px 12px; font-size: 12px; font-weight: 600; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #334155;">
              🔦 Senter
            </button>
            <button type="button" id="btn-switch-camera" style="padding: 6px 12px; font-size: 12px; font-weight: 600; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #334155;">
              🔄 Putar Kamera
            </button>
          </div>
          <span id="barcode-status-text" style="font-size: 11px; font-weight: 600; color: #0284c7;">Arahkan kamera ke barcode item...</span>
        </div>

        <!-- Last Scanned Result & Cart Feedback -->
        <div style="padding: 16px; background: #ffffff;">
          <div id="scanned-item-card" style="display: none; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase;">✅ Produk Ditemukan & Ditambahkan</div>
            <div id="scanned-item-title" style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">-</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 12px;">
              <span id="scanned-item-code" style="color: #64748b; font-family: monospace;">-</span>
              <span id="scanned-item-price" style="font-weight: 700; color: #0369a1;">-</span>
            </div>
          </div>

          <!-- Fallback Manual Barcode Input -->
          <form id="form-manual-barcode" style="display: flex; gap: 8px;">
            <input type="text" id="input-manual-barcode" placeholder="Atau ketik/scan barcode manual..." style="flex: 1; height: 36px; padding: 0 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;" />
            <button type="submit" style="height: 36px; padding: 0 14px; background: #0f172a; color: #ffffff; font-size: 12px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer;">Cari</button>
          </form>
        </div>
      </div>
    `;

    // Inject CSS Animation for Scan Beam Laser
    if (!document.getElementById("scan-laser-style")) {
      const style = document.createElement("style");
      style.id = "scan-laser-style";
      style.textContent = `
        @keyframes scanLine {
          0% { top: 0%; }
          50% { top: 96%; }
          100% { top: 0%; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(modal);

    modal.querySelector("#btn-close-barcode-modal").addEventListener("click", stopBarcodeScanner);
    modal.querySelector("#btn-switch-camera").addEventListener("click", toggleCameraFacing);
    modal.querySelector("#btn-toggle-torch").addEventListener("click", toggleTorch);

    modal.querySelector("#form-manual-barcode").addEventListener("submit", (e) => {
      e.preventDefault();
      const code = modal.querySelector("#input-manual-barcode").value.trim();
      if (code) handleBarcodeDetected(code);
    });
  };

  const handleBarcodeDetected = async (barcodeText) => {
    const now = Date.now();
    if (barcodeText === lastScannedCode && (now - lastScanTime) < 1400) {
      return; // Debounce duplicate scan within 1.4s
    }

    lastScannedCode = barcodeText;
    lastScanTime = now;

    playBeep();

    const statusText = document.getElementById("barcode-status-text");
    if (statusText) statusText.textContent = `⚡ Menemukan barcode: ${barcodeText}...`;

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/produk/saya/barcode/${encodeURIComponent(barcodeText)}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });

      const product = await res.json();
      if (!res.ok) {
        if (statusText) statusText.textContent = `⚠️ Barcode ${barcodeText} tidak ditemukan.`;
        showNotice(`Barcode ${barcodeText} tidak terdaftar di katalog unit ini.`, true);
        return;
      }

      // Display Scanned Card
      const card = document.getElementById("scanned-item-card");
      if (card) {
        card.style.display = "block";
        document.getElementById("scanned-item-title").textContent = product.nama;
        document.getElementById("scanned-item-code").textContent = `Barcode: ${product.barcode || barcodeText}`;
        document.getElementById("scanned-item-price").textContent = rupiah(product.harga);
      }

      if (statusText) statusText.textContent = `✅ ${product.nama} ditambahkan!`;

      // Auto-Fill into main Kasir Search or Item Cart
      autoAddProductToKasirCart(product, barcodeText);

    } catch (err) {
      console.error(err);
      if (statusText) statusText.textContent = `⚠️ Gagal mencari barcode ${barcodeText}.`;
    }
  };

  const autoAddProductToKasirCart = (product, barcodeText) => {
    // 1. Look for React / DOM inputs in cashier
    const inputs = document.querySelectorAll("input");
    inputs.forEach(input => {
      const placeholder = (input.placeholder || "").toLowerCase();
      if (placeholder.includes("barcode") || placeholder.includes("cari") || placeholder.includes("produk")) {
        input.value = product.nama || barcodeText;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        // Simulate Enter key press
        const enterEvent = new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true });
        input.dispatchEvent(enterEvent);
      }
    });

    // 2. Look for product cards / buttons in DOM that match the barcode or product name
    const buttons = document.querySelectorAll("button, .product-item, .item-card");
    buttons.forEach(btn => {
      const text = (btn.textContent || "").toLowerCase();
      if (text.includes((product.nama || "").toLowerCase()) || text.includes(barcodeText)) {
        btn.click();
      }
    });

    showNotice(`✅ 1x ${product.nama} (${rupiah(product.harga)}) ditambahkan ke kasir!`);
  };

  const startBarcodeScanner = () => {
    if (typeof Html5Qrcode === "undefined") {
      showNotice("Modul pemindai barcode kamera sedang dimuat, silakan coba beberapa detik lagi.", true);
      return;
    }

    createScannerModal();
    const modal = document.getElementById("live-barcode-modal");
    if (modal) modal.style.display = "flex";

    if (isScanning) return;

    html5Qrcode = new Html5Qrcode("live-reader");

    const config = {
      fps: 24, // High FPS for fast accurate 1D barcode detection
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const w = Math.floor(Math.min(viewfinderWidth * 0.85, 360));
        const h = Math.floor(Math.min(viewfinderHeight * 0.45, 160));
        return { width: w, height: h };
      },
      aspectRatio: 1.777778, // 16:9
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX
      ],
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    const cameraConfig = { facingMode: currentCameraFacing };

    html5Qrcode.start(
      cameraConfig,
      config,
      (decodedText, decodedResult) => {
        handleBarcodeDetected(decodedText);
      },
      (errorMessage) => {
        // Ignored frame parse errors for smooth scanning
      }
    ).then(() => {
      isScanning = true;
      const statusText = document.getElementById("barcode-status-text");
      if (statusText) statusText.textContent = "Kamera aktif. Arahkan garis merah ke barcode item...";
    }).catch(err => {
      console.error(err);
      showNotice("Gagal mengaktifkan kamera. Pastikan izin kamera telah diberikan.", true);
      stopBarcodeScanner();
    });
  };

  const stopBarcodeScanner = () => {
    if (html5Qrcode && isScanning) {
      html5Qrcode.stop().then(() => {
        html5Qrcode.clear();
        isScanning = false;
      }).catch(() => {
        isScanning = false;
      });
    }

    const modal = document.getElementById("live-barcode-modal");
    if (modal) modal.style.display = "none";
  };

  const toggleCameraFacing = () => {
    currentCameraFacing = currentCameraFacing === "environment" ? "user" : "environment";
    if (isScanning) {
      stopBarcodeScanner();
      setTimeout(startBarcodeScanner, 300);
    }
  };

  const toggleTorch = () => {
    if (!html5Qrcode || !isScanning) return;
    torchEnabled = !torchEnabled;
    html5Qrcode.applyVideoConstraints({
      advanced: [{ torch: torchEnabled }]
    }).catch(() => {
      showNotice("Senter / lampu kilat tidak didukung pada perangkat ini.", true);
    });
  };

  // Attach "📷 Scan Barcode Kamera Live" button into Kasir interfaces
  const injectScannerButton = () => {
    const root = document.getElementById("root") || document.body;

    const inputs = root.querySelectorAll("input");
    inputs.forEach(input => {
      const placeholder = (input.placeholder || "").toLowerCase();
      if ((placeholder.includes("barcode") || placeholder.includes("cari") || placeholder.includes("produk")) && !input.parentElement?.querySelector("[data-live-barcode-btn]")) {
        const container = input.parentElement;
        if (container) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.dataset.liveBarcodeBtn = "true";
          btn.style.cssText = "display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: linear-gradient(135deg, #0284c7, #0369a1); color: #ffffff; border: none; border-radius: 8px; cursor: pointer; margin-left: 6px; shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.1);";
          btn.innerHTML = "📷 Live Barcode";
          btn.addEventListener("click", startBarcodeScanner);

          container.style.display = "flex";
          container.style.alignItems = "center";
          container.appendChild(btn);
        }
      }
    });
  };

  window.startLiveBarcodeScanner = startBarcodeScanner;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(injectScannerButton).observe(document.body, { childList: true, subtree: true });
      injectScannerButton();
    });
  } else {
    new MutationObserver(injectScannerButton).observe(document.body, { childList: true, subtree: true });
    injectScannerButton();
  }
})();
