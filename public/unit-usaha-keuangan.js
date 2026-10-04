(() => {
  const getAuthToken = () => {
    return sessionStorage.getItem("mma-token") ||
           localStorage.getItem("mma-token") ||
           sessionStorage.getItem("mma-superadmin-token") || "";
  };

  const parseJwt = (token) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
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

  let isBMTAdmin = false;
  let currentUserUnit = "";

  const checkUserRole = () => {
    const token = getAuthToken();
    if (!token) return;
    const payload = parseJwt(token);
    if (payload) {
      currentUserUnit = payload.unit || "";
      const isSuper = payload.jenisAkun === "superadmin" || payload.departemen === "admin";
      const isBMT = payload.departemen === "unitusaha" && payload.unit === "BMT";
      isBMTAdmin = isSuper || isBMT;
    }
  };

  // State Management
  let currentFilterUnit = "Semua";
  let activeTabType = "Dana Masuk"; // Dana Masuk | Dana Keluar | Transfer Antar Bagian

  const fetchUnits = async () => {
    try {
      const res = await fetch("/api/admin/unit-usaha", {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) return ["Kantin", "Kopel", "Dapur", "BMT"];
      const data = await res.json();
      return data.length ? data.map(u => u.nama) : ["Kantin", "Kopel", "Dapur", "BMT"];
    } catch {
      return ["Kantin", "Kopel", "Dapur", "BMT"];
    }
  };

  const fetchLaporan = async (unit = "Semua") => {
    try {
      const res = await fetch(`/api/transaksi/unit-usaha/laporan?unit=${encodeURIComponent(unit)}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) throw new Error("Gagal mengambil data laporan transaksi unit.");
      return await res.json();
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const processSubmitTransaction = async (formData, reloadCallback) => {
    const token = getAuthToken();
    if (!token) {
      showNotice("Sesi login tidak ditemukan.", true);
      return;
    }

    try {
      showNotice("Memproses transaksi unit usaha...");
      const res = await fetch("/api/transaksi/unit-usaha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Gagal mencatat transaksi unit.");

      showNotice(`✅ Transaksi ${formData.jenis} sebesar ${rupiah(formData.jumlah)} berhasil dicatat & tersinkronisasi ke Cashflow!`);
      if (reloadCallback) reloadCallback();
    } catch (err) {
      showNotice(err.message, true);
    }
  };

  const deleteTransaction = async (id, reloadCallback) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus catatan transaksi unit usaha ini?")) return;
    const token = getAuthToken();
    try {
      const res = await fetch(`/api/transaksi/unit-usaha/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Gagal menghapus transaksi.");
      showNotice("Transaksi unit usaha berhasil dihapus.");
      if (reloadCallback) reloadCallback();
    } catch (err) {
      showNotice(err.message, true);
    }
  };

  const renderUnitKeuanganWorkspace = async (container) => {
    if (!container || container.querySelector("[data-mma-unit-keuangan-panel]")) return;

    checkUserRole();
    const units = await fetchUnits();

    const panel = document.createElement("div");
    panel.dataset.mmaUnitKeuanganPanel = "true";
    panel.style.cssText = "margin-bottom: 24px; padding: 20px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); font-family: inherit;";

    const header = document.createElement("div");
    header.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;";
    header.innerHTML = `
      <div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
          💼 Pengaturan & Cashflow Transaksi Unit Usaha
          ${isBMTAdmin ? '<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background: #e0f2fe; color: #0369a1; font-weight: 600;">Admin Unit Usaha (BMT)</span>' : '<span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background: #f1f5f9; color: #475569; font-weight: 600;">Staf Unit</span>'}
        </h3>
        <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Kelola pencairan saldo, dana masuk/keluar, dan transfer antar bagian unit usaha dengan sinkronisasi cashflow otomatis.</p>
      </div>
    `;

    const bodyContainer = document.createElement("div");
    bodyContainer.id = "unit-keuangan-body";

    panel.appendChild(header);
    panel.appendChild(bodyContainer);

    // Insert panel at top of container or right before existing table
    if (container.firstChild) {
      container.insertBefore(panel, container.firstChild);
    } else {
      container.appendChild(panel);
    }

    const loadDataAndRender = async () => {
      const lap = await fetchLaporan(currentFilterUnit);
      if (!lap) {
        bodyContainer.innerHTML = `<div style="padding: 16px; color: #ef4444;">Gagal memuat data keuangan unit.</div>`;
        return;
      }

      bodyContainer.innerHTML = "";

      // Section 1: Form Pengaturan Transaksi (Khusus BMT Admin)
      if (isBMTAdmin) {
        const formBox = document.createElement("div");
        formBox.style.cssText = "background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 20px;";

        const tabNav = document.createElement("div");
        tabNav.style.cssText = "display: flex; gap: 8px; margin-bottom: 14px;";

        const tabs = ["Dana Masuk", "Dana Keluar", "Transfer Antar Bagian"];
        tabs.forEach(t => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = t === "Dana Masuk" ? "📥 Dana Masuk" : t === "Dana Keluar" ? "📤 Dana Keluar / Pencairan" : "🔄 Transfer Antar Bagian";
          const isActive = activeTabType === t;
          btn.style.cssText = `padding: 6px 14px; font-size: 12px; font-weight: 600; border-radius: 8px; cursor: pointer; border: 1px solid ${isActive ? "#0284c7" : "#cbd5e1"}; background: ${isActive ? "#0284c7" : "#ffffff"}; color: ${isActive ? "#ffffff" : "#334155"}; transition: all 0.15s ease;`;
          btn.addEventListener("click", () => {
            activeTabType = t;
            loadDataAndRender();
          });
          tabNav.appendChild(btn);
        });

        formBox.appendChild(tabNav);

        // Form Fields
        const form = document.createElement("form");
        form.style.cssText = "display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: end;";

        let formHtml = "";
        if (activeTabType === "Dana Masuk") {
          formHtml += `
            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">Unit Tujuan</label>
              <select id="inputUnitTujuan" style="width: 100%; height: 36px; padding: 0 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;">
                ${units.map(u => `<option value="${u}">${u}</option>`).join("")}
              </select>
            </div>
          `;
        } else if (activeTabType === "Dana Keluar") {
          formHtml += `
            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">Unit Asal (Pencairan)</label>
              <select id="inputUnitAsal" style="width: 100%; height: 36px; padding: 0 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;">
                ${units.map(u => `<option value="${u}">${u}</option>`).join("")}
              </select>
            </div>
          `;
        } else if (activeTabType === "Transfer Antar Bagian") {
          formHtml += `
            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">Unit Asal (Sumber)</label>
              <select id="inputUnitAsal" style="width: 100%; height: 36px; padding: 0 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;">
                ${units.map(u => `<option value="${u}">${u}</option>`).join("")}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">Unit Tujuan (Penerima)</label>
              <select id="inputUnitTujuan" style="width: 100%; height: 36px; padding: 0 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;">
                ${units.map((u, idx) => `<option value="${u}" ${idx === 1 ? 'selected' : ''}>${u}</option>`).join("")}
              </select>
            </div>
          `;
        }

        formHtml += `
          <div>
            <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">Nominal (Rp)</label>
            <input type="number" id="inputJumlah" placeholder="0" min="1" required style="width: 100%; height: 36px; padding: 0 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;" />
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">Keterangan / Catatan</label>
            <input type="text" id="inputKeterangan" placeholder="Contoh: Pencairan Saldo Kasir" style="width: 100%; height: 36px; padding: 0 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;" />
          </div>
          <div>
            <button type="submit" style="width: 100%; height: 36px; background: #0284c7; color: #ffffff; font-size: 12px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; transition: background 0.15s ease;">
              💾 Process Transaksi
            </button>
          </div>
        `;

        form.innerHTML = formHtml;
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const jumlah = Number(form.querySelector("#inputJumlah")?.value || 0);
          const keterangan = form.querySelector("#inputKeterangan")?.value || "";
          const unitAsal = form.querySelector("#inputUnitAsal")?.value || "";
          const unitTujuan = form.querySelector("#inputUnitTujuan")?.value || "";

          if (!jumlah || jumlah <= 0) {
            showNotice("Nominal harus lebih dari 0.", true);
            return;
          }

          processSubmitTransaction({
            jenis: activeTabType,
            unitAsal,
            unitTujuan,
            jumlah,
            keterangan
          }, loadDataAndRender);
        });

        formBox.appendChild(form);
        bodyContainer.appendChild(formBox);
      }

      // Section 2: Summary Cards Real-Time
      const filterSection = document.createElement("div");
      filterSection.style.cssText = "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;";

      filterSection.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 12px; font-weight: 600; color: #475569;">Filter Bagian:</span>
          <select id="filterUnitSelect" style="height: 32px; padding: 0 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer;">
            <option value="Semua" ${currentFilterUnit === "Semua" ? "selected" : ""}>-- Semua Bagian Unit Usaha --</option>
            ${units.map(u => `<option value="${u}" ${currentFilterUnit === u ? "selected" : ""}>${u}</option>`).join("")}
          </select>
        </div>
      `;

      filterSection.querySelector("#filterUnitSelect").addEventListener("change", (e) => {
        currentFilterUnit = e.target.value;
        loadDataAndRender();
      });

      bodyContainer.appendChild(filterSection);

      // Stat Cards
      const ringkasanData = lap.ringkasan || {};
      let totalMasuk = 0;
      let totalKeluar = 0;

      if (currentFilterUnit === "Semua") {
        Object.values(ringkasanData).forEach(r => {
          totalMasuk += Number(r.totalMasuk || 0);
          totalKeluar += Number(r.totalKeluar || 0);
        });
      } else {
        const uData = ringkasanData[currentFilterUnit] || {};
        totalMasuk = Number(uData.totalMasuk || 0);
        totalKeluar = Number(uData.totalKeluar || 0);
      }
      const netSaldo = totalMasuk - totalKeluar;

      const cardsGrid = document.createElement("div");
      cardsGrid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px;";
      cardsGrid.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 600; color: #166534; text-transform: uppercase;">Total Dana Masuk</div>
          <div style="font-size: 18px; font-weight: 800; color: #15803d; margin-top: 4px;">${rupiah(totalMasuk)}</div>
        </div>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 600; color: #991b1b; text-transform: uppercase;">Total Dana Keluar / Pencairan</div>
          <div style="font-size: 18px; font-weight: 800; color: #b91c1c; margin-top: 4px;">${rupiah(totalKeluar)}</div>
        </div>
        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 600; color: #075985; text-transform: uppercase;">Net Arus Kas / Saldo</div>
          <div style="font-size: 18px; font-weight: 800; color: ${netSaldo >= 0 ? '#0369a1' : '#b91c1c'}; margin-top: 4px;">${rupiah(netSaldo)}</div>
        </div>
      `;

      bodyContainer.appendChild(cardsGrid);

      // Section 3: Tabel Riwayat Transaksi Unit Usaha
      const tableWrapper = document.createElement("div");
      tableWrapper.style.cssText = "overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;";

      const txList = lap.transaksiList || [];
      if (!txList.length) {
        tableWrapper.innerHTML = `<div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 13px;">Belum ada catatan transaksi unit usaha untuk bagian ini.</div>`;
      } else {
        const table = document.createElement("table");
        table.style.cssText = "width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;";
        table.innerHTML = `
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-weight: 600;">
              <th style="padding: 10px 12px;">Tanggal</th>
              <th style="padding: 10px 12px;">Jenis Transaksi</th>
              <th style="padding: 10px 12px;">Bagian / Unit</th>
              <th style="padding: 10px 12px;">Nominal</th>
              <th style="padding: 10px 12px;">Keterangan</th>
              <th style="padding: 10px 12px;">Dicatat Oleh</th>
              ${isBMTAdmin ? '<th style="padding: 10px 12px; text-align: right;">Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${txList.map(item => {
              let badgeColor = "background: #e0f2fe; color: #0369a1;";
              if (item.jenis === "Dana Masuk") badgeColor = "background: #dcfce7; color: #15803d;";
              else if (item.jenis === "Dana Keluar") badgeColor = "background: #fee2e2; color: #b91c1c;";

              let unitText = item.unitTujuan || item.unitAsal || "-";
              if (item.jenis === "Transfer Antar Bagian") {
                unitText = `${item.unitAsal || '-'} ➔ ${item.unitTujuan || '-'}`;
              }

              return `
                <tr style="border-bottom: 1px solid #f1f5f9; hover: background #f8fafc;">
                  <td style="padding: 10px 12px; color: #64748b; font-family: monospace;">${item.tanggalISO}</td>
                  <td style="padding: 10px 12px;">
                    <span style="padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; ${badgeColor}">
                      ${item.jenis}
                    </span>
                  </td>
                  <td style="padding: 10px 12px; font-weight: 600; color: #334155;">${unitText}</td>
                  <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">${rupiah(item.jumlah)}</td>
                  <td style="padding: 10px 12px; color: #475569;">${item.keterangan || "-"}</td>
                  <td style="padding: 10px 12px; color: #64748b;">${item.dicatatOleh || "-"}</td>
                  ${isBMTAdmin ? `
                    <td style="padding: 10px 12px; text-align: right;">
                      <button type="button" class="btn-del-unit-tx" data-id="${item.id}" style="padding: 4px 8px; font-size: 11px; background: #fff; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 4px; cursor: pointer;">
                        🗑️ Hapus
                      </button>
                    </td>
                  ` : ''}
                </tr>
              `;
            }).join("")}
          </tbody>
        `;

        if (isBMTAdmin) {
          table.querySelectorAll(".btn-del-unit-tx").forEach(btn => {
            btn.addEventListener("click", () => {
              deleteTransaction(btn.dataset.id, loadDataAndRender);
            });
          });
        }

        tableWrapper.appendChild(table);
      }

      bodyContainer.appendChild(tableWrapper);
    };

    await loadDataAndRender();
  };

  const checkAndInjectUnitKeuangan = () => {
    const root = document.getElementById("root") || document.body;

    // Search for pages or containers showing Unit Usaha or Transaksi Cashless history
    const containers = root.querySelectorAll(".workspace, .page-heading, main, section");
    containers.forEach(container => {
      const text = (container.textContent || "").toLowerCase();
      if (text.includes("riwayat semua unit") || text.includes("riwayat transaksi") || text.includes("unit usaha") || text.includes("kasir unit")) {
        const parent = container.closest(".flex-1") || container.closest("main") || container.parentElement;
        if (parent) {
          renderUnitKeuanganWorkspace(parent);
        }
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(checkAndInjectUnitKeuangan).observe(document.body, { childList: true, subtree: true });
      checkAndInjectUnitKeuangan();
    });
  } else {
    new MutationObserver(checkAndInjectUnitKeuangan).observe(document.body, { childList: true, subtree: true });
    checkAndInjectUnitKeuangan();
  }
})();
