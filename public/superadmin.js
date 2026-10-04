(async () => {
  const TOKEN_KEY = "mma-superadmin-token";
  const USER_KEY = "mma-superadmin-user";
  const appShell = document.getElementById("app-shell");
  const content = document.getElementById("content");
  const navigation = document.getElementById("navigation");
  const notice = document.getElementById("notice");
  const PASSWORD_MIN_LENGTH = 6; // sama dengan src/passwordPolicy.js
  const number = new Intl.NumberFormat("id-ID");
  const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
  const adminNavigation = new Set(["dashboard", "santri", "absensi", "perizinan", "pelanggaran", "nilai", "prestasi", "hafalan", "ubudiyah", "tagihan", "cashflow", "anggaran", "permintaan", "transaksi", "unit", "produk", "health"]);

  const navGroups = [
    { title: "Ringkasan", links: [["dashboard", "Dashboard", "⌂"]] },
    { title: "Data Pesantren", links: [["santri", "Data santri", "♙"], ["wali", "Akun wali", "♧"], ["guru", "Akun staf", "♟"]] },
    { title: "Pengasuhan", links: [["absensi", "Absensi", "◷"], ["perizinan", "Perizinan", "↗"], ["pelanggaran", "Pelanggaran", "⚑"]] },
    { title: "Pendidikan", links: [["nilai", "Nilai", "▤"], ["prestasi", "Prestasi", "✦"], ["hafalan", "Hafalan", "⌁"], ["ubudiyah", "Ubudiyah", "◉"]] },
    { title: "Keuangan & Cashless", links: [["tagihan", "Tagihan", "＄"], ["cashflow", "Arus kas", "↕"], ["anggaran", "Anggaran", "▧"], ["permintaan", "Permintaan BMT", "◌"], ["transaksi", "Audit saldo", "⇄"]] },
    { title: "Operasional", links: [["unit", "Unit usaha", "▦"], ["produk", "Katalog produk", "▣"], ["kartu", "Kartu santri", "▤"], ["wajah", "Verifikasi wajah", "◎"]] },
    { title: "Pengaturan & Sistem", links: [["tahun", "Tahun ajaran", "◫"], ["tampilan", "Tampilan aplikasi", "◐"], ["audit", "Log aktivitas", "≋"], ["health", "Status sistem", "♥"]] },
  ];

  const tablePages = {
    santri: { title: "Data Santri", description: "Biodata dan informasi operasional santri.", url: "/api/santri", columns: [["nama", "Nama"], ["nis", "NIS"], ["nisn", "NISN"], ["kelas", "Kelas"], ["asrama", "Asrama"], ["halaqoh", "Halaqoh"], ["waliId", "ID Wali"], ["saldo", "Saldo"]], actions: "santri" },
    wali: { title: "Akun Wali", description: "Daftar akun wali santri; kata sandi tidak pernah ditampilkan.", url: "/api/admin/wali", columns: [["nama", "Nama"], ["username", "Username"], ["hp", "Nomor HP"], ["createdAt", "Dibuat"]], actions: "wali" },
    guru: { title: "Akun Staf", description: "Akun staf dan Superadmin beserta departemen.", url: "/api/admin/guru", columns: [["nama", "Nama"], ["username", "Username"], ["jenisAkun", "Jenis akun"], ["departemen", "Departemen"], ["unit", "Unit"], ["createdAt", "Dibuat"]], actions: "guru" },
    absensi: { title: "Absensi", description: "Rekap absensi santri dan status kehadiran.", url: "/api/pengasuhan/absensi", columns: [["tanggalISO", "Tanggal"], ["santriId", "ID Santri"], ["status", "Status"], ["keterangan", "Keterangan"], ["dicatatOleh", "Petugas"]] },
    perizinan: { title: "Perizinan", description: "Tinjau permohonan dan status izin santri.", url: "/api/pengasuhan/perizinan", columns: [["createdAt", "Diajukan"], ["santriId", "ID Santri"], ["jenis", "Jenis"], ["tanggalKeluar", "Keluar"], ["tanggalKembali", "Kembali"], ["alasan", "Alasan"], ["status", "Status"]], actions: "perizinan" },
    pelanggaran: { title: "Pelanggaran", description: "Catatan pelanggaran dan poin pembinaan.", url: "/api/pengasuhan/pelanggaran", columns: [["tanggalISO", "Tanggal"], ["santriId", "ID Santri"], ["jenis", "Jenis"], ["poin", "Poin"], ["keterangan", "Keterangan"], ["dicatatOleh", "Petugas"]] },
    nilai: { title: "Nilai", description: "Rekap penilaian akademik santri.", url: "/api/pengajaran/nilai", columns: [["tanggalISO", "Tanggal"], ["santriId", "ID Santri"], ["mapel", "Mata pelajaran"], ["nilai", "Nilai"], ["dicatatOleh", "Petugas"]] },
    prestasi: { title: "Prestasi", description: "Prestasi santri beserta tingkat pencapaian.", url: "/api/pengajaran/prestasi", columns: [["tanggalISO", "Tanggal"], ["santriId", "ID Santri"], ["judul", "Prestasi"], ["tingkat", "Tingkat"], ["dicatatOleh", "Petugas"]] },
    hafalan: { title: "Hafalan", description: "Rekap setoran hafalan santri.", url: "/api/lptq/hafalan", columns: [["tanggalISO", "Tanggal"], ["santriId", "ID Santri"], ["juz", "Juz"], ["dicatatOleh", "Petugas"]] },
    ubudiyah: { title: "Penilaian Ubudiyah", description: "Rekap penilaian dan catatan ubudiyah.", url: "/api/lptq/ubudiyah", columns: [["tanggalISO", "Tanggal"], ["santriId", "ID Santri"], ["jenis", "Jenis"], ["materi", "Materi"], ["predikat", "Predikat"], ["catatan", "Catatan"]] },
    tagihan: { title: "Tagihan & Pembayaran", description: "Pantau tagihan, pembayaran, dan sisa kewajiban.", url: "/api/keuangan/tagihan", columns: [["santriId", "ID Santri"], ["jenis", "Jenis"], ["bulan", "Periode"], ["jumlah", "Tagihan"], ["jumlahDibayar", "Dibayar"], ["tanggalBayarISO", "Tanggal bayar"]] },
    cashflow: { title: "Arus Kas", description: "Catatan penerimaan dan pengeluaran keuangan.", url: "/api/keuangan/cashflow", columns: [["tanggalISO", "Tanggal"], ["bulan", "Periode"], ["jenis", "Jenis"], ["kategori", "Kategori"], ["jumlah", "Nominal"], ["keterangan", "Keterangan"], ["dicatatOleh", "Petugas"]] },
    anggaran: { title: "Pengajuan Anggaran", description: "Status pengajuan, persetujuan, dan realisasi anggaran.", url: "/api/keuangan/anggaran", columns: [["namaKegiatan", "Kegiatan"], ["unitPengaju", "Unit"], ["kategori", "Kategori"], ["bulanRencana", "Periode"], ["totalAnggaran", "Diajukan"], ["realisasiJumlah", "Realisasi"], ["status", "Status"]] },
    permintaan: { title: "Permintaan BMT", description: "Permohonan wali yang diproses oleh BMT.", url: "/api/admin/permintaan", columns: [["tanggalAjukan", "Tanggal"], ["santriId", "ID Santri"], ["jenis", "Jenis"], ["nilaiDiminta", "Nilai"], ["alasan", "Alasan"], ["status", "Status"]], actions: "topup" },
    transaksi: { title: "Audit Saldo Cashless", description: "Santri dengan saldo tersimpan yang tidak sesuai dengan ledger transaksi.", auditSaldo: true },
    unit: { title: "Unit Usaha", description: "Unit usaha terdaftar di sistem. Bagian baru langsung tersedia sebagai pilihan saat menambah akun staf.", url: "/api/admin/unit-usaha", columns: [["nama", "Nama unit"], ["id", "ID"]], actions: "unit" },
    produk: { title: "Katalog Produk", description: "Produk per unit, harga, dan status tampil di kasir.", url: "/api/produk", columns: [["unit", "Unit"], ["nama", "Produk"], ["kategori", "Kategori"], ["harga", "Harga"], ["barcode", "Barcode"], ["aktif", "Aktif"]], actions: "produk" },
    kartu: { title: "Kartu Santri", description: "Status penerbitan kartu dan kesiapan PIN.", url: "/api/admin/kartu", columns: [["nama", "Nama"], ["nis", "NIS"], ["kelas", "Kelas"], ["kartuTerbit", "Diterbitkan"], ["punyaPin", "PIN tersedia"]] },
  };

  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  let user = null;
  let superAdminAccess = false;
  let selectedKey = "dashboard";
  let noticeTimer;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function showNotice(message, isError = false) {
    notice.textContent = message;
    notice.className = `notice${isError ? " error" : ""}`;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 4200);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    if (response.status === 401) {
      signOut();
      throw new Error("Sesi berakhir. Silakan masuk kembali.");
    }
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Permintaan gagal (${response.status}).`);
    return data;
  }

  function signOut() {
    token = "";
    user = null;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.replace("/");
  }

  function renderNavigation() {
    navigation.innerHTML = navGroups.map((group) => {
      const links = superAdminAccess ? group.links : group.links.filter(([key]) => adminNavigation.has(key));
      if (!links.length) return "";
      return `
      <div class="nav-group">
        <p class="nav-heading">${escapeHtml(group.title)}</p>
        ${links.map(([key, label, icon]) => `
          <a class="nav-link${key === selectedKey ? " active" : ""}" href="#${key}" data-view="${key}">
            <span class="nav-icon" aria-hidden="true">${icon}</span><span>${escapeHtml(label)}</span>
          </a>`).join("")}
      </div>`;
    }).join("");
  }

  function setTitle(title) {
    document.getElementById("current-section").textContent = title;
    document.title = `${title} — Dashboard ${superAdminAccess ? "Superadmin" : "Admin"}`;
  }

  function formatCell(key, value) {
    if (value == null || value === "") return "—";
    if (["jumlah", "jumlahDibayar", "tunggakan", "nominal", "totalAnggaran", "realisasiJumlah", "saldo", "saldoSebelum", "saldoSesudah", "harga", "nilaiDiminta"].includes(key)) {
      return rupiah.format(Number(value) || 0);
    }
    if (key === "aktif" || key === "punyaPin") return value === true || value === 1 ? "Ya" : "Tidak";
    if (key === "blokir" && typeof value === "object") return value.aktif ? "Aktif" : "Tidak";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function badge(value) {
    const safe = escapeHtml(value);
    const normalized = String(value).toLowerCase().replace(/\s/g, "");
    return `<span class="badge ${normalized}">${safe}</span>`;
  }

  function getRecords(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.cards)) return payload.cards;
    return [];
  }

  async function renderTable(key) {
    const config = tablePages[key];
    if (config.auditSaldo) return renderAuditSaldo(config);
    setTitle(config.title);
    const actions = config.actions === "santri" || superAdminAccess ? config.actions : undefined;
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Pemantauan lintas modul</p><h1>${escapeHtml(config.title)}</h1><p>${escapeHtml(config.description)}</p></div><div class="action-cell">${key === "guru" && superAdminAccess ? '<button id="add-staff-button" class="button primary" type="button">+ Tambah akun</button>' : ""}${key === "unit" ? '<button id="add-unit-button" class="button primary" type="button">+ Tambah unit</button>' : ""}<button id="refresh-button" class="button" type="button">↻ Muat ulang</button></div></div><div id="table-state" class="loading-state">Mengambil data...</div>`;
    try {
      const records = getRecords(await api(config.url));
      content.querySelector("#table-state").outerHTML = `
        <div class="table-toolbar"><input id="table-search" class="search-input" type="search" placeholder="Cari pada ${escapeHtml(config.title.toLowerCase())}..." aria-label="Cari data"><span id="table-count" class="table-count"></span></div>
        <div class="table-wrap"><table><thead><tr>${config.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}${actions ? "<th>Tindakan</th>" : ""}</tr></thead><tbody id="table-body"></tbody></table></div>`;
      const searchInput = content.querySelector("#table-search");
      const draw = () => {
        const queryText = searchInput.value.trim().toLocaleLowerCase("id");
        const filtered = records.filter((row) => !queryText || config.columns.some(([key]) => formatCell(key, row[key]).toLocaleLowerCase("id").includes(queryText)));
        content.querySelector("#table-count").textContent = `${number.format(filtered.length)} dari ${number.format(records.length)} data`;
        content.querySelector("#table-body").innerHTML = filtered.length ? filtered.map((row) => `
          <tr>${config.columns.map(([field]) => `<td>${field === "status" ? badge(formatCell(field, row[field])) : escapeHtml(formatCell(field, row[field]))}</td>`).join("")}
          ${actions ? `<td>${actionButtons(actions, row)}</td>` : ""}</tr>`).join("") : `<tr><td colspan="${config.columns.length + (actions ? 1 : 0)}"><div class="empty-state">Tidak ada data yang cocok.</div></td></tr>`;
      };
      searchInput.addEventListener("input", draw);
      draw();
      content.querySelector("#refresh-button").addEventListener("click", () => renderTable(key));
      content.querySelector("#add-staff-button")?.addEventListener("click", createStaff);
      content.querySelector("#add-unit-button")?.addEventListener("click", createUnit);
      content.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => performAction(button.dataset.action, button.dataset.id, button.dataset.status)));
    } catch (error) {
      showNotice(error.message, true);
      const state = content.querySelector("#table-state");
      if (state) state.outerHTML = `<div class="panel-card empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  async function renderAuditSaldo(config) {
    setTitle(config.title);
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Rekonsiliasi cashless</p><h1>${escapeHtml(config.title)}</h1><p>${escapeHtml(config.description)}</p></div><button id="refresh-button" class="button" type="button">↻ Periksa ulang</button></div><div class="loading-state">Memeriksa ledger saldo...</div>`;
    try {
      const audit = await api("/api/transaksi/audit-saldo");
      const items = audit.tidakCocok || [];
      content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Rekonsiliasi cashless</p><h1>${escapeHtml(config.title)}</h1><p>${escapeHtml(config.description)}</p></div><button id="refresh-button" class="button" type="button">↻ Periksa ulang</button></div>
        <div class="metric-grid">${metric("Santri diperiksa", number.format(audit.jumlahSantri), "Dibandingkan dengan saldo ledger", "")}${metric("Selisih ditemukan", number.format(audit.jumlahTidakCocok), audit.jumlahTidakCocok ? "Perlu investigasi" : "Semua saldo cocok", "")}</div>
        <div class="table-toolbar"><input id="table-search" class="search-input" type="search" placeholder="Cari nama atau ID santri..." aria-label="Cari hasil audit saldo"><span id="table-count" class="table-count"></span></div>
        <div class="table-wrap"><table><thead><tr><th>Santri</th><th>ID</th><th>Saldo tersimpan</th><th>Saldo ledger</th><th>Selisih</th></tr></thead><tbody id="table-body"></tbody></table></div>`;
      const searchInput = content.querySelector("#table-search");
      const draw = () => {
        const queryText = searchInput.value.trim().toLocaleLowerCase("id");
        const filtered = items.filter((row) => !queryText || `${row.nama} ${row.id}`.toLocaleLowerCase("id").includes(queryText));
        content.querySelector("#table-count").textContent = `${number.format(filtered.length)} dari ${number.format(items.length)} selisih`;
        content.querySelector("#table-body").innerHTML = filtered.length ? filtered.map((row) => `<tr><td>${escapeHtml(row.nama)}</td><td>${escapeHtml(row.id)}</td><td>${escapeHtml(rupiah.format(Number(row.saldo)))}</td><td>${escapeHtml(rupiah.format(Number(row.saldoLedger)))}</td><td>${escapeHtml(rupiah.format(Number(row.selisih)))}</td></tr>`).join("") : `<tr><td colspan="5"><div class="empty-state">${items.length ? "Tidak ada data yang cocok dengan pencarian." : "Tidak ditemukan selisih saldo."}</div></td></tr>`;
      };
      searchInput.addEventListener("input", draw);
      draw();
      content.querySelector("#refresh-button").addEventListener("click", () => renderAuditSaldo(config));
    } catch (error) {
      showNotice(error.message, true);
      content.innerHTML = `<div class="panel-card empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  function actionButtons(type, row) {
    if (type === "unit") return `<button class="button small danger" data-action="unit-delete" data-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.nama)}">Hapus</button>`;
    if (type === "produk") return `<button class="button small" data-action="produk-toggle" data-id="${escapeHtml(row.id)}" data-status="${row.aktif ? "1" : "0"}">${row.aktif ? "Nonaktifkan" : "Aktifkan"}</button>`;
    if (type === "santri") return `<button class="button small" data-action="santri-detail" data-id="${escapeHtml(row.id)}">Profil</button>`;
    if (type === "guru") return `<div class="action-cell"><button class="button small" data-action="staff-edit" data-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.nama)}" data-username="${escapeHtml(row.username)}" data-kind="${escapeHtml(row.jenisAkun)}" data-department="${escapeHtml(row.departemen)}" data-unit="${escapeHtml(row.unit)}">Edit</button><button class="button small" data-action="staff-password" data-id="${escapeHtml(row.id)}">Reset sandi</button><button class="button small danger" data-action="staff-delete" data-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.nama)}">Hapus</button></div>`;
    if (type === "wali") return `<button class="button small" data-action="wali-password" data-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.nama)}">Reset sandi</button>`;
    if (row.status !== "Menunggu" && row.status !== "Diajukan") return "—";
    if (type === "topup") return `<div class="action-cell">${row.adaBukti ? `<button class="button small" data-action="topup-evidence" data-id="${escapeHtml(row.id)}">Bukti</button>` : ""}<button class="button small" data-action="topup-approve" data-id="${escapeHtml(row.id)}">Setujui</button><button class="button small danger" data-action="topup-reject" data-id="${escapeHtml(row.id)}">Tolak</button></div>`;
    if (type === "anggaran") return `<div class="action-cell"><button class="button small" data-action="budget-approve" data-id="${escapeHtml(row.id)}">Setujui</button><button class="button small danger" data-action="budget-reject" data-id="${escapeHtml(row.id)}">Tolak</button></div>`;
    return `<div class="action-cell"><button class="button small" data-action="izin-approve" data-id="${escapeHtml(row.id)}">Setujui</button><button class="button small danger" data-action="izin-reject" data-id="${escapeHtml(row.id)}">Tolak</button></div>`;
  }

  async function performAction(action, id, status) {
    if (action === "santri-detail") return renderSantriProfile(id);
    if (action.startsWith("staff-")) return manageStaff(action, id);
    if (action === "wali-password") return manageWaliPassword(id);
    if (action === "unit-delete") return deleteUnit(id);
    if (action === "topup-evidence") {
      const tab = window.open("about:blank", "_blank");
      if (!tab) {
        showNotice("Izinkan pop-up untuk membuka bukti transfer.", true);
        return;
      }
      try {
        const response = await fetch(`/api/permintaan/${encodeURIComponent(id)}/bukti`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(error?.error || `Bukti tidak dapat dibuka (${response.status}).`);
        }
        const objectUrl = URL.createObjectURL(await response.blob());
        tab.location.href = objectUrl;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } catch (error) {
        tab.close();
        showNotice(error.message, true);
      }
      return;
    }
    const settings = {
      "topup-approve": { url: `/api/permintaan/${encodeURIComponent(id)}/proses`, body: { disetujui: true }, label: "Setujui permintaan BMT ini?" },
      "topup-reject": { url: `/api/permintaan/${encodeURIComponent(id)}/proses`, body: { disetujui: false }, label: "Tolak permintaan BMT ini?" },
      "izin-approve": { url: `/api/pengasuhan/perizinan/${encodeURIComponent(id)}/proses`, body: { status: "Disetujui" }, label: "Setujui izin santri ini?" },
      "izin-reject": { url: `/api/pengasuhan/perizinan/${encodeURIComponent(id)}/proses`, body: { status: "Ditolak" }, label: "Tolak izin santri ini?" },
      "budget-approve": { url: `/api/keuangan/anggaran/${encodeURIComponent(id)}/setujui`, body: {}, label: "Setujui pengajuan anggaran ini?" },
      "budget-reject": { url: `/api/keuangan/anggaran/${encodeURIComponent(id)}/tolak`, body: {}, label: "Tolak pengajuan anggaran ini?" },
    }[action];
    if (action === "produk-toggle") {
      const aktif = status !== "1";
      if (!window.confirm(`${aktif ? "Aktifkan" : "Nonaktifkan"} produk ini?`)) return;
      try {
        await api(`/api/admin/produk/${encodeURIComponent(id)}/status`, { method: "PUT", body: JSON.stringify({ aktif }) });
        showNotice("Status produk berhasil diperbarui.");
        await renderTable(selectedKey);
      } catch (error) {
        showNotice(error.message, true);
      }
      return;
    }
    if (action === "topup-reject") {
      const catatan = window.prompt("Masukkan alasan penolakan:");
      if (!catatan?.trim()) return;
      settings.body.catatan = catatan.trim();
    }
    if (!settings || !window.confirm(settings.label)) return;
    try {
      await api(settings.url, { method: "POST", body: JSON.stringify(settings.body) });
      showNotice("Perubahan berhasil diproses.");
      await renderTable(selectedKey);
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  async function manageStaff(action, id) {
    const button = content.querySelector(`[data-action="${action}"][data-id="${CSS.escape(id)}"]`);
    try {
      if (action === "staff-delete") {
        if (!window.confirm(`Hapus akun staf ${button?.dataset.name || ""}?`)) return;
        await api(`/api/admin/guru/${encodeURIComponent(id)}`, { method: "DELETE" });
        showNotice("Akun staf berhasil dihapus.");
      } else if (action === "staff-password") {
        const password = window.prompt(`Masukkan kata sandi baru (minimal ${PASSWORD_MIN_LENGTH} karakter):`);
        if (!password) return;
        if (password.length < PASSWORD_MIN_LENGTH) {
          showNotice(`Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`, true);
          return;
        }
        await api(`/api/admin/guru/${encodeURIComponent(id)}/password`, { method: "PUT", body: JSON.stringify({ password }) });
        showNotice("Kata sandi berhasil diperbarui.");
      } else {
        const nama = window.prompt("Nama staf:", button?.dataset.name || "");
        if (nama === null) return;
        const username = window.prompt("Username:", button?.dataset.username || "");
        if (username === null) return;
        const jenisAkun = window.prompt("Jenis akun (staf, superadmin):", button?.dataset.kind === "admin" ? "superadmin" : button?.dataset.kind || "staf")?.trim().toLowerCase();
        if (!jenisAkun) return;
        const departemen = jenisAkun === "staf"
          ? window.prompt("Departemen (pengasuhan, pengajaran, lptq, administrasi, unitusaha, sekretariat):", button?.dataset.department === "admin" ? "pengasuhan" : button?.dataset.department || "")
          : "admin";
        if (departemen === null) return;
        const unit = departemen === "unitusaha" ? window.prompt("Nama unit usaha:", button?.dataset.unit || "") : "";
        if (unit === null) return;
        await api(`/api/admin/guru/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ nama, username, departemen, unit, jenisAkun }),
        });
        showNotice("Akun staf berhasil diperbarui.");
      }
      await renderTable("guru");
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  async function manageWaliPassword(id) {
    const button = content.querySelector(`[data-action="wali-password"][data-id="${CSS.escape(id)}"]`);
    const password = window.prompt(`Kata sandi sementara untuk ${button?.dataset.name || "wali"} (minimal ${PASSWORD_MIN_LENGTH} karakter):`);
    if (password === null) return;
    if (password.length < PASSWORD_MIN_LENGTH) {
      showNotice(`Kata sandi sementara minimal ${PASSWORD_MIN_LENGTH} karakter.`, true);
      return;
    }
    try {
      await api(`/api/admin/wali/${encodeURIComponent(id)}/password`, {
        method: "PUT",
        body: JSON.stringify({ password }),
      });
      showNotice("Kata sandi direset. Wali wajib menggantinya saat login berikutnya.");
      await renderTable("wali");
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  async function createUnit() {
    const nama = window.prompt("Nama bagian/unit usaha baru, mis. Toko Buku:");
    if (!nama?.trim()) return;
    try {
      await api("/api/admin/unit-usaha", { method: "POST", body: JSON.stringify({ nama: nama.trim() }) });
      showNotice("Unit usaha berhasil ditambahkan.");
      await renderTable("unit");
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  async function deleteUnit(id) {
    const button = content.querySelector(`[data-action="unit-delete"][data-id="${CSS.escape(id)}"]`);
    if (!window.confirm(`Hapus unit usaha ${button?.dataset.name || ""}?`)) return;
    try {
      await api(`/api/admin/unit-usaha/${encodeURIComponent(id)}`, { method: "DELETE" });
      showNotice("Unit usaha berhasil dihapus.");
      await renderTable("unit");
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  async function createStaff() {
    const nama = window.prompt("Nama akun:");
    if (!nama?.trim()) return;
    const username = window.prompt("Username:");
    if (!username?.trim()) return;
    const password = window.prompt(`Kata sandi awal (minimal ${PASSWORD_MIN_LENGTH} karakter):`);
    if (!password) return;
    if (password.length < PASSWORD_MIN_LENGTH) {
      showNotice(`Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`, true);
      return;
    }
    const jenisAkun = window.prompt("Jenis akun (staf, superadmin):", "staf")?.trim().toLowerCase();
    if (!jenisAkun) return;
    const departemen = jenisAkun === "staf"
      ? window.prompt("Departemen (pengasuhan, pengajaran, lptq, administrasi, unitusaha, sekretariat):", "pengasuhan")
      : "admin";
    if (!departemen) return;
    const unit = departemen === "unitusaha" ? window.prompt("Nama unit usaha:") : "";
    if (unit === null) return;
    try {
      await api("/api/admin/guru", {
        method: "POST",
        body: JSON.stringify({ nama: nama.trim(), username: username.trim(), password, departemen, unit, jenisAkun }),
      });
      showNotice("Akun staf berhasil dibuat.");
      await renderTable("guru");
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  async function renderSantriProfile(id) {
    setTitle("Profil Santri");
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Data pesantren</p><h1>Profil Santri</h1><p>Memuat biodata dan ringkasan riwayat.</p></div><button id="back-button" class="button" type="button">← Kembali</button></div><div class="loading-state">Mengambil profil santri...</div>`;
    content.querySelector("#back-button").addEventListener("click", () => renderTable("santri"));
    try {
      const [profile, history] = await Promise.all([
        api(`/api/santri/${encodeURIComponent(id)}`),
        api(`/api/santri/${encodeURIComponent(id)}/rapor-ringkas`),
      ]);
      const fields = [["NIS", profile.nis], ["NISN", profile.nisn], ["Kelas", profile.kelas], ["Jenis kelamin", profile.jenisKelamin], ["Tempat/tanggal lahir", [profile.tempatLahir, profile.tanggalLahir].filter(Boolean).join(", ")], ["Asrama", profile.asrama], ["Halaqoh", profile.halaqoh], ["Wali", profile.waliId], ["Nomor darurat", profile.noDarurat], ["Catatan kesehatan", profile.catatanKesehatan], ["Saldo", rupiah.format(Number(profile.saldo) || 0)]];
      content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Data pesantren</p><h1>${escapeHtml(profile.nama)}</h1><p>Profil santri dan ringkasan riwayat lintas modul.</p></div><button id="back-button" class="button" type="button">← Kembali ke data santri</button></div>
        <section class="panel-card"><div class="panel-title"><h2>Biodata ringkas</h2></div><div class="settings-grid">${fields.map(([label, value]) => `<div class="setting-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || "—")}</span></div>`).join("")}</div></section>
        <div class="quick-grid">${metric("Absensi", number.format(history.absensi?.length || 0), "Catatan tersedia", "")}${metric("Perizinan", number.format(history.perizinan?.length || 0), "Catatan tersedia", "")}${metric("Pelanggaran", number.format(history.pelanggaran?.length || 0), `${number.format(history.totalPoinPelanggaran || 0)} poin`, "")}${metric("Nilai", number.format(history.nilai?.length || 0), "Catatan tersedia", "")}${metric("Prestasi", number.format(history.prestasi?.length || 0), "Catatan tersedia", "")}${metric("Hafalan", number.format(history.hafalan?.length || 0), "Catatan tersedia", "")}${metric("Ubudiyah", number.format(history.ubudiyah?.length || 0), "Catatan tersedia", "")}${metric("Tagihan", number.format(history.tagihan?.length || 0), "Catatan tersedia", "")}</div>`;
      content.querySelector("#back-button").addEventListener("click", () => renderTable("santri"));
    } catch (error) {
      showNotice(error.message, true);
      content.innerHTML = `<div class="panel-card empty-state">${escapeHtml(error.message)}<p><button id="back-button" class="button" type="button">Kembali</button></p></div>`;
      content.querySelector("#back-button").addEventListener("click", () => renderTable("santri"));
    }
  }

  function metric(label, value, hint, key) {
    const body = `<span class="metric-label">${escapeHtml(label)}</span><div class="metric-value">${escapeHtml(value)}</div><span class="metric-hint">${escapeHtml(hint)}</span>`;
    return key ? `<button class="metric-card" type="button" data-open="${key}" aria-label="Buka ${escapeHtml(label)}">${body}</button>` : `<div class="metric-card">${body}</div>`;
  }

  function renderDashboard(data) {
    setTitle(superAdminAccess ? "Ringkasan Superadmin" : "Ringkasan Admin");
    const cards = data.kartu;
    const chartMax = Math.max(1, ...data.cashflowTujuhHari.map((item) => Math.abs(Number(item.neto))));
    const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const chart = data.cashflowTujuhHari.length ? data.cashflowTujuhHari.map((item) => {
      const date = new Date(`${item.tanggal}T00:00:00`);
      const height = Math.max(4, Math.round(Math.abs(Number(item.neto)) / chartMax * 100));
      return `<div class="chart-column"><span class="chart-value">${escapeHtml(rupiah.format(Number(item.neto)))}</span><div class="chart-bar" title="${escapeHtml(item.tanggal)}" style="height:${height}%"></div><span class="chart-label">${days[date.getDay()]} ${date.getDate()}</span></div>`;
    }).join("") : `<div class="empty-state">Belum ada data arus kas pada periode ini.</div>`;
    const classMax = Math.max(1, ...data.perKelas.map((item) => Number(item.jumlah)));
    const classes = data.perKelas.length ? data.perKelas.map((item) => `<div class="class-row"><span>${escapeHtml(item.kelas)}</span><div class="progress-track"><div class="progress-fill" style="width:${Math.max(3, Math.round(Number(item.jumlah) / classMax * 100))}%"></div></div><strong>${number.format(item.jumlah)}</strong></div>`).join("") : `<p class="empty-state">Data kelas belum tersedia.</p>`;
    const activity = data.aktivitas.length ? data.aktivitas.map((item) => `<tr><td>${escapeHtml(item.waktu)}</td><td>${escapeHtml(item.aktorRole)}</td><td>${escapeHtml(item.aksi)}</td><td>${escapeHtml(item.targetTipe)}${item.targetId ? ` · ${escapeHtml(item.targetId)}` : ""}</td></tr>`).join("") : `<tr><td colspan="4" class="empty-state">Belum ada log aktivitas.</td></tr>`;
    const overviewMetrics = [
      metric("Santri", number.format(cards.santri), "Data aktif dalam sistem", "santri"),
      ...(superAdminAccess ? [
        metric("Akun wali", number.format(cards.wali), "Terdaftar", "wali"),
        metric("Akun staf", number.format(cards.guru), "Seluruh departemen", "guru"),
      ] : []),
      metric("Absensi hari ini", number.format(cards.absensiHariIni), "Catatan masuk hari ini", "absensi"),
      metric("Izin menunggu", number.format(cards.izinMenunggu), "Perlu ditinjau", "perizinan"),
      metric("Permintaan BMT", number.format(cards.topupMenunggu), "Menunggu keputusan", "permintaan"),
      metric("Anggaran diajukan", number.format(cards.anggaranMenunggu), "Menunggu keputusan", "anggaran"),
      metric("Tunggakan tagihan", rupiah.format(cards.nominalTunggakan), `${number.format(cards.tagihanMenunggak)} tagihan belum lunas`, "tagihan"),
    ].join("");
    const quickMetrics = [
      metric("Transaksi cashless", number.format(cards.jumlahTransaksiCashless), `${rupiah.format(cards.nominalTransaksiCashless)} total nominal`, "transaksi"),
      ...(superAdminAccess ? [
        metric("Template wajah", number.format(cards.faceTemplates), "Data template tersimpan", "wajah"),
        metric("Log aktivitas", number.format(data.aktivitas.length), "Aktivitas terbaru", "audit"),
      ] : []),
      metric("Status layanan", data.statusLayanan ? "Normal" : "Gangguan", "Pemeriksaan database", "health"),
    ].join("");
    content.innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">${superAdminAccess ? "Ikhtisar sistem menyeluruh" : "Dashboard operasional"}</p><h1>Selamat datang, ${escapeHtml(user?.nama || "Admin")}</h1><p>${superAdminAccess ? "Ringkasan lintas modul, konfigurasi, dan tata kelola sistem" : "Ringkasan operasional lintas modul · akses hanya-baca"} · diperbarui ${escapeHtml(new Date(data.diperbaruiPada).toLocaleString("id-ID"))}</p></div><button id="refresh-button" class="button" type="button">↻ Perbarui data</button></div>
      <div class="metric-grid">
        ${overviewMetrics}
      </div>
      <div class="dashboard-grid">
        <section class="panel-card"><div class="panel-title"><h2>Ringkasan arus kas</h2><span>7 hari terakhir · neto harian</span></div><div class="chart">${chart}</div></section>
        <section class="panel-card"><div class="panel-title"><h2>Komposisi santri per kelas</h2><span>${number.format(cards.santri)} santri</span></div><div class="class-list">${classes}</div></section>
      </div>
      <div class="quick-grid">
        ${quickMetrics}
      </div>
      ${superAdminAccess ? `<section class="panel-card" style="margin-top:14px"><div class="panel-title"><h2>Aktivitas terbaru</h2><a class="button small" href="#audit" data-view="audit">Lihat semua</a></div><div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Target</th></tr></thead><tbody>${activity}</tbody></table></div></section>` : ""}`;
    content.querySelector("#refresh-button").addEventListener("click", loadDashboard);
    content.querySelectorAll("[data-open]").forEach((button) => {
      if (button.dataset.open) button.addEventListener("click", () => navigate(button.dataset.open));
    });
    content.querySelectorAll("[data-view]").forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(link.dataset.view);
    }));
  }

  async function loadDashboard() {
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Ikhtisar pesantren</p><h1>Dashboard</h1><p>Memuat ringkasan operasional...</p></div></div><div class="loading-state">Mengambil data sistem...</div>`;
    try {
      const data = await api("/api/admin/ringkasan");
      renderDashboard(data);
    } catch (error) {
      showNotice(error.message, true);
      content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Ikhtisar pesantren</p><h1>Dashboard</h1></div></div><div class="panel-card empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  async function renderSettings(key) {
    const isYears = key === "tahun";
    const title = isYears ? "Tahun Ajaran" : "Tampilan Aplikasi";
    setTitle(title);
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Konfigurasi sistem</p><h1>${title}</h1><p>${isYears ? "Tahun ajaran aktif dan riwayat pengaturan tahun." : "Konfigurasi tampilan yang digunakan aplikasi."}</p></div></div><div class="loading-state">Mengambil pengaturan...</div>`;
    try {
      const data = await api(isYears ? "/api/admin/tahun-ajaran" : "/api/admin/tampilan");
      if (isYears) {
        content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Konfigurasi sistem</p><h1>${title}</h1><p>Tahun ajaran aktif dan riwayat pengaturan tahun.</p></div><div class="action-cell"><button id="add-year-button" class="button primary" type="button">+ Tambah tahun</button><button id="refresh-button" class="button" type="button">↻ Muat ulang</button></div></div><div class="table-wrap"><table><thead><tr><th>Tahun mulai</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>${data.map((row) => `<tr><td>${escapeHtml(row.tahunMulai)}</td><td>${badge(row.aktif ? "Aktif" : "Tidak aktif")}</td><td>${row.aktif ? "—" : `<div class="action-cell"><button class="button small" data-activate-year="${escapeHtml(row.id)}" type="button">Aktifkan</button><button class="button small danger" data-delete-year="${escapeHtml(row.id)}" data-year-label="${escapeHtml(row.tahunMulai)}" type="button">Hapus</button></div>`}</td></tr>`).join("") || '<tr><td colspan="3" class="empty-state">Belum ada tahun ajaran.</td></tr>'}</tbody></table></div>`;
        content.querySelector("#refresh-button").addEventListener("click", () => renderSettings(key));
        content.querySelector("#add-year-button").addEventListener("click", async () => {
          const year = window.prompt("Masukkan tahun mulai ajaran, misalnya 2027:");
          if (year === null) return;
          try {
            await api("/api/admin/tahun-ajaran", { method: "POST", body: JSON.stringify({ tahunMulai: year }) });
            showNotice("Tahun ajaran berhasil ditambahkan.");
            await renderSettings(key);
          } catch (error) {
            showNotice(error.message, true);
          }
        });
        content.querySelectorAll("[data-delete-year]").forEach((button) => button.addEventListener("click", async () => {
          if (!window.confirm(`Hapus tahun ajaran ${button.dataset.yearLabel}?`)) return;
          try {
            await api(`/api/admin/tahun-ajaran/${encodeURIComponent(button.dataset.deleteYear)}`, { method: "DELETE" });
            showNotice("Tahun ajaran berhasil dihapus.");
            await renderSettings(key);
          } catch (error) {
            showNotice(error.message, true);
          }
        }));
        content.querySelectorAll("[data-activate-year]").forEach((button) => button.addEventListener("click", async () => {
          if (!window.confirm("Aktifkan tahun ajaran ini? Tahun ajaran aktif saat ini akan diganti.")) return;
          try {
            await api(`/api/admin/tahun-ajaran/${encodeURIComponent(button.dataset.activateYear)}/aktifkan`, { method: "POST" });
            showNotice("Tahun ajaran aktif berhasil diperbarui.");
            await renderSettings(key);
          } catch (error) {
            showNotice(error.message, true);
          }
        }));
      } else {
        renderAppearanceForm(data, key, title);
      }
    } catch (error) {
      showNotice(error.message, true);
      content.innerHTML = `<div class="panel-card empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  const FONT_JUDUL = ["Fraunces", "Playfair Display", "Merriweather", "Poppins", "Lora"];
  const FONT_ISI = ["Inter", "Poppins", "Nunito", "Lato", "Source Sans 3"];
  const GAYA_BACKGROUND = [["aurora", "Aurora Berwarna"], ["gradient", "Gradasi Halus"], ["polos", "Polos Minimal"]];
  const COLOR_GROUPS = [
    ["Warna tema", [["warnaPrimer", "Warna Utama"], ["warnaSekunder", "Warna Gelap"], ["warnaAksenBg", "Aksen Latar"]]],
    ["Warna teks & latar halaman", [["warnaTeks", "Teks Utama"], ["warnaTeksMuted", "Teks Sekunder"], ["warnaBorder", "Border / Garis"], ["warnaLatarHalaman", "Latar Halaman"]]],
  ];
  // Batas ukuran agar layar login (yang memuat tampilan ini) tetap ringan untuk ribuan wali.
  const IMAGE_LIMITS = { logoUrl: 1024 * 1024, buildingPhotoUrl: 2 * 1024 * 1024 };

  function renderAppearanceForm(data, key, title) {
    const values = { ...data };
    const colorValue = (name) => (/^#[0-9a-f]{6}$/i.test(String(values[name] || "")) ? values[name] : "#000000");
    const selectField = (name, label, options) => {
      const list = options.some(([value]) => value === values[name]) || !values[name] ? options : [...options, [values[name], values[name]]];
      return `<label class="setting-item"><strong>${escapeHtml(label)}</strong><select name="${name}">${list.map(([value, text]) => `<option value="${escapeHtml(value)}"${values[name] === value ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
    };
    const imageField = (name, label) => `<div class="setting-item" data-image-field="${name}"><strong>${escapeHtml(label)}</strong><div class="image-preview"><img alt="Pratinjau ${escapeHtml(label)}"${values[name] ? ` src="${escapeHtml(values[name])}"` : " hidden"}><span class="image-note">${values[name] ? "Gambar kustom" : "Memakai gambar bawaan"}</span></div><input type="file" accept="image/*" data-image-input="${name}"><button type="button" class="button small" data-image-reset="${name}"${values[name] ? "" : " hidden"}>Pakai bawaan</button></div>`;
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Konfigurasi sistem</p><h1>${title}</h1><p>Berlaku untuk seluruh aplikasi (layar login, sidebar, tombol, dsb). Dokumen resmi cetak (Rapor, Kwitansi, Surat, Kop Surat) tidak terpengaruh.</p></div><button id="refresh-button" class="button" type="button">↻ Muat ulang</button></div>
      <form id="appearance-form" class="panel-card"><div class="settings-grid">
        <p class="setting-section">Identitas aplikasi</p>
        ${imageField("logoUrl", "Logo Aplikasi")}${imageField("buildingPhotoUrl", "Foto Gedung / Latar Login")}
        <label class="setting-item"><strong>Nama Aplikasi</strong><input name="namaAplikasi" type="text" maxlength="120" value="${escapeHtml(values.namaAplikasi)}"></label>
        ${COLOR_GROUPS.map(([heading, fields]) => `<p class="setting-section">${escapeHtml(heading)}</p>${fields.map(([name, label]) => `<label class="setting-item"><strong>${escapeHtml(label)}</strong><input name="${name}" type="color" value="${colorValue(name)}"></label>`).join("")}`).join("")}
        <p class="setting-section">Font &amp; gaya background</p>
        ${selectField("fontJudul", "Font Judul", FONT_JUDUL.map((font) => [font, font]))}${selectField("fontIsi", "Font Isi", FONT_ISI.map((font) => [font, font]))}${selectField("gayaBackground", "Gaya Background", GAYA_BACKGROUND)}
      </div><div class="action-cell action-end"><button id="reset-appearance" class="button" type="button">Kembalikan ke Bawaan</button><button class="button primary" type="submit">Simpan Pengaturan Tampilan</button></div></form>`;

    const form = content.querySelector("#appearance-form");
    content.querySelector("#refresh-button").addEventListener("click", () => renderSettings(key));

    const syncImage = (name) => {
      const holder = form.querySelector(`[data-image-field="${name}"]`);
      const image = holder.querySelector("img");
      if (values[name]) image.src = values[name]; else image.removeAttribute("src");
      image.hidden = !values[name];
      holder.querySelector(".image-note").textContent = values[name] ? "Gambar kustom" : "Memakai gambar bawaan";
      holder.querySelector("[data-image-reset]").hidden = !values[name];
    };
    form.querySelectorAll("[data-image-input]").forEach((input) => input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const name = input.dataset.imageInput;
      if (!file.type.startsWith("image/")) {
        showNotice("File harus berupa gambar.", true);
        input.value = "";
        return;
      }
      if (file.size > IMAGE_LIMITS[name]) {
        showNotice(`Ukuran gambar maksimal ${IMAGE_LIMITS[name] / 1024 / 1024} MB agar layar login tetap cepat dimuat.`, true);
        input.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => { values[name] = String(reader.result); syncImage(name); };
      reader.onerror = () => showNotice("Gambar tidak dapat dibaca.", true);
      reader.readAsDataURL(file);
    }));
    form.querySelectorAll("[data-image-reset]").forEach((button) => button.addEventListener("click", () => {
      const name = button.dataset.imageReset;
      values[name] = "";
      const input = form.querySelector(`[data-image-input="${name}"]`);
      if (input) input.value = "";
      syncImage(name);
    }));

    const save = async (payload, message) => {
      try {
        await api("/api/admin/tampilan", { method: "PUT", body: JSON.stringify(payload) });
        showNotice(message);
        if (selectedKey === key) await renderSettings(key); // jangan menimpa halaman lain bila pengguna sudah berpindah menu
      } catch (error) {
        showNotice(error.message, true);
      }
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      save({ ...values, ...Object.fromEntries(new FormData(form).entries()) }, "Pengaturan tampilan tersimpan. Aplikasi memakainya saat dimuat ulang.");
    });
    content.querySelector("#reset-appearance").addEventListener("click", () => {
      if (!window.confirm("Kembalikan seluruh tampilan ke pengaturan bawaan?")) return;
      save({}, "Tampilan dikembalikan ke pengaturan bawaan.");
    });
  }

  async function renderHealth() {
    setTitle("Status Sistem");
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Operasional</p><h1>Status Sistem</h1><p>Konektivitas backend dan ringkasan layanan.</p></div><button id="refresh-button" class="button" type="button">↻ Periksa lagi</button></div><div class="loading-state">Memeriksa layanan...</div>`;
    try {
      const [health, summary] = await Promise.all([api("/api/health"), api("/api/admin/ringkasan")]);
      content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Operasional</p><h1>Status Sistem</h1><p>Terakhir diperiksa ${escapeHtml(new Date(health.waktu).toLocaleString("id-ID"))}</p></div><button id="refresh-button" class="button" type="button">↻ Periksa lagi</button></div><div class="metric-grid">${metric("API", health.ok ? "Normal" : "Gangguan", "Endpoint kesehatan", "")}${metric("Database", summary.statusLayanan ? "Terhubung" : "Gangguan", "Koneksi kueri", "")}${metric("Modul transaksi", number.format(summary.kartu.jumlahTransaksiCashless), "Cashless tercatat", "transaksi")}${metric("Template biometrik", number.format(summary.kartu.faceTemplates), "Metadata saja; embedding tidak ditampilkan", "wajah")}</div>`;
      content.querySelector("#refresh-button").addEventListener("click", renderHealth);
    } catch (error) {
      showNotice(error.message, true);
      content.innerHTML = `<div class="panel-card empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  async function renderAudit() {
    setTitle("Log Aktivitas");
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Jejak operasional</p><h1>Log Aktivitas</h1><p>Log audit yang tercatat di sistem.</p></div><button id="refresh-button" class="button" type="button">↻ Muat ulang</button></div><div class="loading-state">Mengambil log audit...</div>`;
    try {
      const data = await api("/api/admin/audit?page=1&limit=100");
      content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Jejak operasional</p><h1>Log Aktivitas</h1><p>Menampilkan ${number.format(data.items.length)} dari ${number.format(data.total)} catatan.</p></div><button id="refresh-button" class="button" type="button">↻ Muat ulang</button></div><div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Peran</th><th>Aksi</th><th>Jenis target</th><th>ID target</th></tr></thead><tbody>${data.items.map((row) => `<tr><td>${escapeHtml(row.waktu)}</td><td>${escapeHtml(row.aktorId)}</td><td>${escapeHtml(row.aktorRole)}</td><td>${escapeHtml(row.aksi)}</td><td>${escapeHtml(row.targetTipe)}</td><td>${escapeHtml(row.targetId)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty-state">Belum ada catatan audit.</td></tr>'}</tbody></table></div>`;
      content.querySelector("#refresh-button").addEventListener("click", renderAudit);
    } catch (error) {
      showNotice(error.message, true);
      content.innerHTML = `<div class="panel-card empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  async function renderFaces() {
    setTitle("Verifikasi Wajah");
    content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Operasional biometrik</p><h1>Verifikasi Wajah</h1><p>Ringkasan kesiapan template dan statistik pencocokan; data embedding tidak ditampilkan.</p></div><button id="refresh-button" class="button" type="button">↻ Muat ulang</button></div><div class="loading-state">Mengambil status verifikasi...</div>`;
    try {
      const [status, log] = await Promise.all([api("/api/wajah/status"), api("/api/wajah/log/ringkasan")]);
      content.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Operasional biometrik</p><h1>Verifikasi Wajah</h1><p>Model berjalan pada versi yang dikonfigurasi sistem.</p></div><button id="refresh-button" class="button" type="button">↻ Muat ulang</button></div>
        <div class="metric-grid">${metric("Total santri", number.format(status.totalSantri), "Terdaftar di sistem", "santri")}${metric("Memiliki foto", number.format(status.adaFoto), `${number.format(status.tanpaFoto)} belum memiliki foto`, "santri")}${metric("Memiliki template", number.format(status.adaTemplate), `${number.format(status.jumlahTemplateKamera)} template kamera`, "")}${metric("Akurasi top-1", log.akurasiTop1 == null ? "Belum cukup data" : `${(log.akurasiTop1 * 100).toFixed(1)}%`, `${number.format(log.jumlahLog)} percobaan tercatat`, "")}</div>
        <div class="dashboard-grid"><section class="panel-card"><div class="panel-title"><h2>Template foto belum siap</h2><span>${number.format(status.fotoGagal.length)} santri</span></div><div class="table-wrap"><table><thead><tr><th>Nama</th><th>NIS</th><th>Kelas</th></tr></thead><tbody>${status.fotoGagal.map((row) => `<tr><td>${escapeHtml(row.nama)}</td><td>${escapeHtml(row.nis)}</td><td>${escapeHtml(row.kelas)}</td></tr>`).join("") || '<tr><td colspan="3" class="empty-state">Semua foto memiliki template.</td></tr>'}</tbody></table></div></section>
        <section class="panel-card"><div class="panel-title"><h2>Ringkasan kecocokan</h2></div><div class="settings-grid">${[
          ["Prediksi benar", log.skorBenar], ["Prediksi keliru", log.skorSalah],
        ].map(([label, scores]) => `<div class="setting-item"><strong>${label} · ${number.format(scores.jumlah)}</strong><span>Median ${scores.median == null ? "—" : scores.median.toFixed(3)} · rentang ${scores.min == null ? "—" : `${scores.min.toFixed(3)}–${scores.maks.toFixed(3)}`}</span></div>`).join("")}</div><p class="metric-hint" style="margin-top:14px">Ambang saran: ${escapeHtml(log.saranAmbang ?? log.alasanSaranAmbang)}</p></section></div>`;
      content.querySelector("#refresh-button").addEventListener("click", renderFaces);
    } catch (error) {
      showNotice(error.message, true);
      content.innerHTML = `<div class="panel-card empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  function navigate(key) {
    if (!superAdminAccess && !adminNavigation.has(key)) key = "dashboard";
    selectedKey = key;
    renderNavigation();
    setSidebarOpen(false);
    if (location.hash !== `#${key}`) history.replaceState(null, "", `#${key}`);
    if (tablePages[key]) return renderTable(key);
    if (key === "dashboard") return loadDashboard();
    if (key === "tahun" || key === "tampilan") return renderSettings(key);
    if (key === "audit") return renderAudit();
    if (key === "health") return renderHealth();
    if (key === "wajah") return renderFaces();
    return loadDashboard();
  }

  function setSidebarOpen(isOpen) {
    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menu-toggle");
    const backdrop = document.getElementById("sidebar-backdrop");
    sidebar.classList.toggle("open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Tutup navigasi" : "Buka navigasi");
    backdrop.hidden = !isOpen;
  }

  async function startApp() {
    try {
      const profile = await api("/api/admin/akses");
      if (!["admin", "superadmin"].includes(profile.jenisAkun)) throw new Error("Akun ini tidak memiliki akses ke dashboard Superadmin.");
      superAdminAccess = true; // Admin sudah dilebur ke Superadmin: semua yang berhak masuk mendapat akses penuh.
      const expectedPath = superAdminAccess ? "/superadmin" : "/admin";
      if (location.pathname !== expectedPath) {
        window.location.replace(expectedPath);
        return;
      }
      const years = await api("/api/admin/tahun-ajaran");
      user = profile;
      sessionStorage.setItem(USER_KEY, JSON.stringify(profile));
      appShell.hidden = false;
      document.getElementById("user-name").textContent = profile?.nama || "Admin";
      const brand = document.querySelector(".brand");
      brand.href = superAdminAccess ? "/superadmin" : "/admin";
      brand.setAttribute("aria-label", superAdminAccess ? "Dashboard Superadmin" : "Dashboard Admin");
      brand.querySelector("strong").textContent = superAdminAccess ? "MA Superadmin" : "MA Admin";
      brand.querySelector("small").textContent = superAdminAccess ? "SUPERADMIN" : "ADMIN";
      document.querySelector(".sidebar-footer").lastChild.textContent = superAdminAccess ? " Sistem operasional" : " Dashboard operasional · baca";
      const active = years.find((year) => year.aktif);
      document.getElementById("academic-year").textContent = active ? `Tahun ajaran ${active.tahunMulai}/${Number(active.tahunMulai) + 1}` : "Tahun ajaran belum aktif";
      const requested = location.hash.slice(1);
      const allowedKeys = navGroups.flatMap((group) => group.links.map(([key]) => key)).filter((key) => superAdminAccess || adminNavigation.has(key));
      navigate(allowedKeys.includes(requested) ? requested : "dashboard");
    } catch (error) {
      if (token) showNotice(error.message, true);
      signOut();
    }
  }

  document.getElementById("logout-button").addEventListener("click", signOut);
  document.getElementById("menu-toggle").addEventListener("click", () => {
    setSidebarOpen(!document.getElementById("sidebar").classList.contains("open"));
  });
  document.getElementById("sidebar-backdrop").addEventListener("click", () => setSidebarOpen(false));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSidebarOpen(false);
  });
  navigation.addEventListener("click", (event) => {
    const link = event.target.closest("[data-view]");
    if (!link) return;
    event.preventDefault();
    navigate(link.dataset.view);
  });
  window.addEventListener("hashchange", () => {
    const key = location.hash.slice(1);
    if (key && key !== selectedKey) navigate(key);
  });

  if (token) {
    appShell.hidden = false;
    try {
      user = JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
      await startApp();
    } catch {
      signOut();
    }
  } else {
    window.location.replace("/");
  }
})();
