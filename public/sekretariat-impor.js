(() => {
  const getAuthToken = () => {
    return sessionStorage.getItem("mma-superadmin-token") ||
           sessionStorage.getItem("mma-token") ||
           localStorage.getItem("mma-token") || "";
  };

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

  const downloadTemplate = () => {
    const token = getAuthToken();
    showNotice("Menyiapkan berkas template impor CSV...");
    fetch("/api/admin/impor/template", {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Gagal mengambil template dari server.");
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Template_Impor_Santri_MMA.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showNotice("Template impor CSV berhasil diunduh.");
      })
      .catch(() => {
        const a = document.createElement("a");
        a.href = "/api/public/template-impor";
        a.download = "Template_Impor_Santri_MMA.csv";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
        showNotice("Mengunduh berkas template via saluran publik...");
      });
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const parseLine = (line) => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if ((char === ',' || char === ';') && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (!values.some((v) => v !== "")) continue;
      const rowObj = {};
      headers.forEach((h, idx) => {
        let key = h;
        if (["namasantri", "nama_santri", "namalengkap", "nama"].includes(h)) key = "nama";
        else if (["nis", "noinduk", "nomorinduk"].includes(h)) key = "nis";
        else if (["nisn", "nomorinduknasional"].includes(h)) key = "nisn";
        else if (["kelas", "rombonganbelajar"].includes(h)) key = "kelas";
        else if (["jeniskelamin", "jk", "gender"].includes(h)) key = "jenisKelamin";
        else if (["namawali", "nama_wali", "namaayah", "namaibu"].includes(h)) key = "namaWali";
        else if (["hpwali", "hp_wali", "nohp", "nodarurat", "handphone"].includes(h)) key = "hpWali";
        else if (["tanggallahir", "tanggal_lahir"].includes(h)) key = "tanggalLahir";
        else if (["tempatlahir", "tempat_lahir"].includes(h)) key = "tempatLahir";
        rowObj[key] = values[idx] || "";
      });
      rows.push(rowObj);
    }
    return rows;
  };

  const processImportFile = (file) => {
    if (!file) return;
    const token = getAuthToken();

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result || "";
      const rows = parseCSV(text);

      if (!rows.length) {
        showNotice("Gagal membaca berkas impor. Pastikan berkas CSV/Excel memiliki baris data.", true);
        return;
      }

      try {
        showNotice("Memeriksa validitas data impor (dry-run)...");
        const dryRes = await fetch("/api/admin/impor/dry-run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ rows }),
        });

        const dryRun = await dryRes.json();
        if (!dryRes.ok || !dryRun.valid) {
          const errorList = (dryRun.detailGagal || []).map((d) => `Baris ${d.baris} (${d.nama}): ${d.alasan}`).join("\n");
          alert(`⚠️ Validasi Impor Gagal (${dryRun.jumlahGagal || 1} baris bermasalah):\n\n${errorList || dryRun.error || 'Format data tidak valid'}`);
          showNotice(`Impor dibatalkan: ${dryRun.jumlahGagal || 1} baris tidak valid.`, true);
          return;
        }

        const confirmMsg = `📊 Laporan Pra-Impor:\n- Total Baris: ${dryRun.totalBaris}\n- Santri Baru: ${dryRun.jumlahBaru}\n- Update Santri Lama: ${dryRun.jumlahUpdate}\n\nLanjutkan eksekusi impor data santri & pembuatan akun wali otomatis?`;
        if (!window.confirm(confirmMsg)) {
          showNotice("Impor dibatalkan oleh pengguna.");
          return;
        }

        const namaBatch = window.prompt("Nama Batch Impor (misal: Kelas 7A Angkatan 2026):", `Impor Kelas ${rows[0]?.kelas || "Baru"} ${new Date().toLocaleDateString("id-ID")}`);
        if (namaBatch === null) return;

        showNotice("Mengimpor data santri dan memproses akun wali...");
        const execRes = await fetch("/api/admin/impor/eksekusi", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ namaBatch: namaBatch || "Impor Santri", rows }),
        });

        const res = await execRes.json();
        if (!execRes.ok) throw new Error(res.error || "Gagal mengeksekusi impor.");

        showNotice(`✅ Berhasil mengimpor ${res.totalSantri} santri dan memproses ${res.totalWaliBaru} akun wali baru!`);
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        showNotice(err.message, true);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const mountButtonsIntoContainer = (container) => {
    if (!container || container.querySelector("[data-mma-impor-host]") || container.querySelector("#import-excel-button")) return;

    const host = document.createElement("div");
    host.dataset.mmaImporHost = "true";
    host.style.cssText = "display:inline-flex;align-items:center;gap:8px;margin-left:auto;";

    const btnTemplate = document.createElement("button");
    btnTemplate.type = "button";
    btnTemplate.className = "button btn btn-quiet";
    btnTemplate.style.cssText = "display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:6px 12px;border:1px solid #dce6e1;border-radius:8px;background:#fff;color:#176b56;font-size:12px;font-weight:600;cursor:pointer;";
    btnTemplate.innerHTML = "📄 Unduh Template";
    btnTemplate.addEventListener("click", downloadTemplate);

    const btnImport = document.createElement("button");
    btnImport.type = "button";
    btnImport.className = "button primary btn btn-primary";
    btnImport.style.cssText = "display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:6px 14px;border:1px solid #124336;border-radius:8px;background:linear-gradient(135deg,#23836a,#124336);color:#fff;font-size:12px;font-weight:700;cursor:pointer;";
    btnImport.innerHTML = "📥 Impor Excel";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".csv,.xlsx,.xls,.txt";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", (e) => processImportFile(e.target.files?.[0]));

    btnImport.addEventListener("click", () => fileInput.click());

    host.append(btnTemplate, btnImport, fileInput);
    container.appendChild(host);
  };

  const parseJwt = (token) => {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  const isImportAuthorized = () => {
    const token = getAuthToken();
    if (!token) return false;
    const payload = parseJwt(token);
    if (!payload) return false;
    const isSuper = payload.jenisAkun === "superadmin" || payload.departemen === "admin";
    const isSekretariat = payload.departemen === "sekretariat";
    return isSuper || isSekretariat;
  };

  const checkAndInjectButtons = () => {
    if (!isImportAuthorized()) {
      document.querySelectorAll("[data-mma-impor-host]").forEach(el => el.remove());
      return;
    }

    const root = document.getElementById("root") || document;

    // Search for headings or headers related to Santri / Sekretariat
    const headings = root.querySelectorAll("h1, h2, h3, .page-heading");
    headings.forEach((heading) => {
      const text = (heading.textContent || "").trim();
      if (text.includes("Data Santri") || text.includes("Master Data Santri") || text.includes("Sekretariat") || text.includes("Biodata Santri")) {
        const parentHeader = heading.closest(".page-heading") || heading.closest(".heading") || heading.parentElement;
        if (parentHeader) {
          const actionCell = parentHeader.querySelector(".action-cell") || parentHeader.querySelector(".top-actions") || parentHeader;
          mountButtonsIntoContainer(actionCell);
        }
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(checkAndInjectButtons).observe(document.body, { childList: true, subtree: true });
      checkAndInjectButtons();
    });
  } else {
    new MutationObserver(checkAndInjectButtons).observe(document.body, { childList: true, subtree: true });
    checkAndInjectButtons();
  }
})();
