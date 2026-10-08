(() => {
  const root = document.getElementById("root");

  let activeSessionToken = "";

  // Intercept window.fetch to capture active session tokens from requests/responses
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const init = args[1];
    if (init && init.headers) {
      let authHeader = "";
      if (init.headers instanceof Headers) {
        authHeader = init.headers.get("Authorization") || "";
      } else if (typeof init.headers === "object") {
        authHeader = init.headers.Authorization || init.headers.authorization || "";
      }
      if (authHeader.startsWith("Bearer ")) {
        activeSessionToken = authHeader.slice(7);
      }
    }

    const response = await originalFetch(...args);

    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (url.includes("/auth/login") && response.ok) {
      response.clone().json().then((result) => {
        if (result && result.token) {
          activeSessionToken = result.token;
          sessionStorage.setItem("mma-token", result.token);
        }
      }).catch(() => {});
    }

    return response;
  };

  const getAuthToken = () => {
    return activeSessionToken ||
           sessionStorage.getItem("mma-superadmin-token") ||
           sessionStorage.getItem("mma-token") ||
           localStorage.getItem("mma-superadmin-token") ||
           localStorage.getItem("mma-token") ||
           window.mmaToken || "";
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

  let isAdminUnitUsaha = false;
  let currentUserUnit = "";

  const checkUserRole = () => {
    const token = getAuthToken();
    if (!token) return;
    const payload = parseJwt(token);
    if (payload) {
      currentUserUnit = payload.unit || "";
      const isSuper = payload.jenisAkun === "superadmin" || payload.departemen === "admin";
      const isKeuangan = payload.departemen === "administrasi";
      const isBMT = payload.departemen === "unitusaha" && payload.unit === "BMT";
      // Admin Unit Usaha kewenangan: Bagian Keuangan/Administrasi, Staf BMT, atau Superadmin
      isAdminUnitUsaha = isSuper || isKeuangan || isBMT;
    }
  };

  let currentFilterUnit = "Semua";
  let activeTabType = "Dana Masuk"; // Dana Masuk | Dana Keluar | Transfer Antar Bagian

  const fetchUnits = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/unit-usaha", {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
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
      const token = getAuthToken();
      const res = await fetch(`/api/transaksi/unit-usaha/laporan?unit=${encodeURIComponent(unit)}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
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
      showNotice("Sesi login tidak ditemukan. Silakan login ulang.", true);
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

      showNotice(`✅ Transaksi ${formData.jenis} sebesar ${rupiah(formData.jumlah)} berhasil diproses & tersinkronisasi!`);
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

  let keuanganWorkspace = null;
  let workArea = null;

  const findWorkArea = (button) => {
    if (!button) return null;
    for (let node = button.parentElement; node; node = node.parentElement) {
      const content = [...node.children].find((child) => child.classList.contains("flex-1") && child.classList.contains("min-w-0") && child.classList.contains("w-full"));
      if (content) return { host: node, content };
    }
    return null;
  };

  const renderWorkspaceContent = async (workspaceEl) => {
    if (!workspaceEl) return;

    workspaceEl.innerHTML = `
      <div style="padding: 32px; text-align: center; color: #0284c7; font-weight: 600; font-size: 14px; font-family: inherit;">
        ⏳ Memuat data keuangan & laporan unit usaha...
      </div>
    `;

    try {
      checkUserRole();
      const units = await fetchUnits();
      const lap = await fetchLaporan(currentFilterUnit);

      workspaceEl.innerHTML = "";

      const card = document.createElement("div");
      card.style.cssText = "padding: 24px; background: #ffffff; min-height: 100%; border-radius: 12px; font-family: inherit;";

      // Header
      const header = document.createElement("div");
      header.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; flex-wrap: wrap; gap: 12px;";
      header.innerHTML = `
        <div>
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px;">
            💼 Keuangan & Arus Kas Unit Usaha
            ${isAdminUnitUsaha ? '<span style="font-size: 11px; padding: 3px 10px; border-radius: 9999px; background: #dbeafe; color: #1e40af; font-weight: 700;">Akses Admin Unit Usaha (Keuangan & Superadmin)</span>' : '<span style="font-size: 11px; padding: 3px 10px; border-radius: 9999px; background: #f1f5f9; color: #475569; font-weight: 600;">Akses Staf Unit</span>'}
          </h2>
          <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Pantau saldo unit usaha, dana masuk (injeksi modal), dana keluar (pencairan saldo/operasional), dan transfer antar bagian secara akurat.</p>
        </div>
      `;

      card.appendChild(header);

      if (!lap) {
        card.innerHTML += `
          <div style="padding: 24px; text-align: center; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #b91c1c; margin-top: 12px;">
            <p style="font-weight: 700; margin: 0 0 6px;">⚠️ Gagal memuat data laporan keuangan unit usaha.</p>
            <p style="font-size: 12px; margin: 0 0 12px; color: #7f1d1d;">Pastikan Anda telah login sebagai Staf Keuangan/Administrasi atau Superadmin.</p>
            <button type="button" id="btn-retry-unit-keuangan" style="padding: 6px 16px; font-size: 12px; font-weight: 600; background: #b91c1c; color: #fff; border: none; border-radius: 6px; cursor: pointer;">↻ Coba Lagi</button>
          </div>
        `;
        workspaceEl.appendChild(card);
        workspaceEl.querySelector("#btn-retry-unit-keuangan")?.addEventListener("click", () => renderWorkspaceContent(workspaceEl));
        return;
      }

      // Grid Saldo Setiap Unit Usaha (Serta Info Terkait)
      const ringkasanData = lap.ringkasan || {};
      const unitSaldoSection = document.createElement("div");
      unitSaldoSection.style.cssText = "margin-bottom: 24px;";
      unitSaldoSection.innerHTML = `<h3 style="font-size: 14px; font-weight: 700; color: #334155; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">📊 Saldo Kas & Rincian Setiap Unit Usaha</h3>`;

      const unitGrid = document.createElement("div");
      unitGrid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;";

      units.forEach(uName => {
        const uInfo = ringkasanData[uName] || { penerimaanKasir: 0, danaMasuk: 0, danaKeluar: 0, netSaldo: 0 };
        const net = uInfo.netSaldo || 0;

        const unitCard = document.createElement("div");
        unitCard.style.cssText = `border: 1px solid ${currentFilterUnit === uName ? '#0284c7' : '#e2e8f0'}; background: ${currentFilterUnit === uName ? '#f0f9ff' : '#f8fafc'}; border-radius: 10px; padding: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); cursor: pointer; transition: all 0.15s ease;`;
        unitCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 700; font-size: 14px; color: #0f172a;">${uName}</span>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #e2e8f0; color: #475569;">Unit Usaha</span>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 2px;">Saldo Kas Unit</div>
          <div style="font-size: 20px; font-weight: 800; color: ${net >= 0 ? '#0369a1' : '#b91c1c'}; margin-bottom: 12px;">${rupiah(net)}</div>
          <div style="border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 11px; display: grid; gap: 4px;">
            <div style="display: flex; justify-content: space-between; color: #475569;">
              <span>🛒 Penerimaan Kasir:</span>
              <span style="font-weight: 600;">${rupiah(uInfo.penerimaanKasir)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #166534;">
              <span>📥 Dana Masuk / Transfer:</span>
              <span style="font-weight: 600;">${rupiah(uInfo.danaMasuk)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #991b1b;">
              <span>📤 Dana Keluar / Pencairan:</span>
              <span style="font-weight: 600;">${rupiah(uInfo.danaKeluar)}</span>
            </div>
          </div>
        `;

        unitCard.addEventListener("click", () => {
          currentFilterUnit = currentFilterUnit === uName ? "Semua" : uName;
          renderWorkspaceContent(workspaceEl);
        });

        unitGrid.appendChild(unitCard);
      });

      unitSaldoSection.appendChild(unitGrid);
      card.appendChild(unitSaldoSection);

      // Form Transaksi Unit Usaha (Dana Masuk, Dana Keluar, Transfer Antar Bagian)
      if (isAdminUnitUsaha) {
        const formCard = document.createElement("div");
        formCard.style.cssText = "background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; margin-bottom: 24px;";

        formCard.innerHTML = `<h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 12px; text-transform: uppercase;">⚙️ Pengaturan Transaksi Unit Usaha</h3>`;

        const typeTabs = document.createElement("div");
        typeTabs.style.cssText = "display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;";

        const tabs = [
          { key: "Dana Masuk", label: "📥 Dana Masuk (Injeksi Modal / Penambahan Saldo)" },
          { key: "Dana Keluar", label: "📤 Dana Keluar (Pencairan Saldo / Operasional)" },
          { key: "Transfer Antar Bagian", label: "🔄 Transfer Antar Bagian (Pemindahan Dana)" },
        ];

        tabs.forEach(t => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = t.label;
          const isActive = activeTabType === t.key;
          btn.style.cssText = `padding: 8px 16px; font-size: 12px; font-weight: 700; border-radius: 8px; cursor: pointer; border: 1px solid ${isActive ? '#0284c7' : '#94a3b8'}; background: ${isActive ? '#0284c7' : '#ffffff'}; color: ${isActive ? '#ffffff' : '#334155'}; transition: all 0.15s ease;`;
          btn.addEventListener("click", () => {
            activeTabType = t.key;
            renderWorkspaceContent(workspaceEl);
          });
          typeTabs.appendChild(btn);
        });

        formCard.appendChild(typeTabs);

        const form = document.createElement("form");
        form.style.cssText = "display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; align-items: end;";

        let fieldsHtml = "";
        if (activeTabType === "Dana Masuk") {
          fieldsHtml += `
            <div>
              <label style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px;">Unit Tujuan (Penerima Modal)</label>
              <select id="inputUnitTujuan" style="width: 100%; height: 38px; padding: 0 10px; font-size: 12px; border: 1px solid #94a3b8; border-radius: 6px; background: #fff;">
                ${units.map(u => `<option value="${u}">${u}</option>`).join("")}
              </select>
            </div>
          `;
        } else if (activeTabType === "Dana Keluar") {
          fieldsHtml += `
            <div>
              <label style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px;">Unit Asal (Pencairan Saldo / Operasional)</label>
              <select id="inputUnitAsal" style="width: 100%; height: 38px; padding: 0 10px; font-size: 12px; border: 1px solid #94a3b8; border-radius: 6px; background: #fff;">
                ${units.map(u => `<option value="${u}">${u}</option>`).join("")}
              </select>
            </div>
          `;
        } else if (activeTabType === "Transfer Antar Bagian") {
          fieldsHtml += `
            <div>
              <label style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px;">Unit Asal (Sumber Dana)</label>
              <select id="inputUnitAsal" style="width: 100%; height: 38px; padding: 0 10px; font-size: 12px; border: 1px solid #94a3b8; border-radius: 6px; background: #fff;">
                ${units.map(u => `<option value="${u}">${u}</option>`).join("")}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px;">Unit Tujuan (Penerima Dana)</label>
              <select id="inputUnitTujuan" style="width: 100%; height: 38px; padding: 0 10px; font-size: 12px; border: 1px solid #94a3b8; border-radius: 6px; background: #fff;">
                ${units.map((u, idx) => `<option value="${u}" ${idx === 1 ? 'selected' : ''}>${u}</option>`).join("")}
              </select>
            </div>
          `;
        }

        fieldsHtml += `
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px;">Nominal (Rp)</label>
            <input type="number" id="inputJumlah" placeholder="0" min="1" required style="width: 100%; height: 38px; padding: 0 10px; font-size: 13px; font-weight: 600; border: 1px solid #94a3b8; border-radius: 6px; background: #fff;" />
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px;">Keterangan / Catatan</label>
            <input type="text" id="inputKeterangan" placeholder="Contoh: Pencairan Saldo Kasir Kantin ke BMT" style="width: 100%; height: 38px; padding: 0 10px; font-size: 12px; border: 1px solid #94a3b8; border-radius: 6px; background: #fff;" />
          </div>
          <div>
            <button type="submit" style="width: 100%; height: 38px; background: #0284c7; color: #ffffff; font-size: 13px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; transition: background 0.15s ease;">
              💾 Simpan Transaksi Unit
            </button>
          </div>
        `;

        form.innerHTML = fieldsHtml;
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
          }, () => renderWorkspaceContent(workspaceEl));
        });

        formCard.appendChild(form);
        card.appendChild(formCard);
      }

      // Filter Section & Table
      const tableHeader = document.createElement("div");
      tableHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;";
      tableHeader.innerHTML = `
        <h3 style="font-size: 14px; font-weight: 700; color: #334155; margin: 0; text-transform: uppercase;">📋 Riwayat Transaksi & Arus Kas (${currentFilterUnit})</h3>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 12px; font-weight: 600; color: #64748b;">Filter Unit:</span>
          <select id="selectFilterUnit" style="height: 32px; padding: 0 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer;">
            <option value="Semua" ${currentFilterUnit === "Semua" ? "selected" : ""}>Semua Unit Usaha</option>
            ${units.map(u => `<option value="${u}" ${currentFilterUnit === u ? "selected" : ""}>${u}</option>`).join("")}
          </select>
        </div>
      `;

      tableHeader.querySelector("#selectFilterUnit").addEventListener("change", (e) => {
        currentFilterUnit = e.target.value;
        renderWorkspaceContent(workspaceEl);
      });

      card.appendChild(tableHeader);

      const txList = lap.transaksiList || [];
      const tableBox = document.createElement("div");
      tableBox.style.cssText = "overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;";

      if (!txList.length) {
        tableBox.innerHTML = `<div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 13px;">Belum ada riwayat transaksi unit usaha.</div>`;
      } else {
        const table = document.createElement("table");
        table.style.cssText = "width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;";
        table.innerHTML = `
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; color: #475569; font-weight: 700;">
              <th style="padding: 10px 12px;">Tanggal</th>
              <th style="padding: 10px 12px;">Jenis Transaksi</th>
              <th style="padding: 10px 12px;">Bagian / Unit</th>
              <th style="padding: 10px 12px;">Nominal (Rp)</th>
              <th style="padding: 10px 12px;">Keterangan</th>
              <th style="padding: 10px 12px;">Dicatat Oleh</th>
              ${isAdminUnitUsaha ? '<th style="padding: 10px 12px; text-align: right;">Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${txList.map(item => {
              let badgeStyle = "background: #e0f2fe; color: #0369a1;";
              if (item.jenis === "Dana Masuk") badgeStyle = "background: #dcfce7; color: #15803d;";
              else if (item.jenis === "Dana Keluar") badgeStyle = "background: #fee2e2; color: #b91c1c;";

              let unitText = item.unitTujuan || item.unitAsal || "-";
              if (item.jenis === "Transfer Antar Bagian") {
                unitText = `${item.unitAsal || '-'} ➔ ${item.unitTujuan || '-'}`;
              }

              return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 12px; color: #64748b; font-family: monospace;">${item.tanggalISO}</td>
                  <td style="padding: 10px 12px;">
                    <span style="padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${badgeStyle}">
                      ${item.jenis}
                    </span>
                  </td>
                  <td style="padding: 10px 12px; font-weight: 700; color: #1e293b;">${unitText}</td>
                  <td style="padding: 10px 12px; font-weight: 800; color: #0f172a;">${rupiah(item.jumlah)}</td>
                  <td style="padding: 10px 12px; color: #334155;">${item.keterangan || "-"}</td>
                  <td style="padding: 10px 12px; color: #64748b;">${item.dicatatOleh || "-"}</td>
                  ${isAdminUnitUsaha ? `
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

        if (isAdminUnitUsaha) {
          table.querySelectorAll(".btn-del-unit-tx").forEach(btn => {
            btn.addEventListener("click", () => {
              deleteTransaction(btn.dataset.id, () => renderWorkspaceContent(workspaceEl));
            });
          });
        }

        tableBox.appendChild(table);
      }

      card.appendChild(tableBox);
      workspaceEl.appendChild(card);
    } catch (err) {
      console.error(err);
      workspaceEl.innerHTML = `
        <div style="padding: 24px; text-align: center; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #b91c1c;">
          <p style="font-weight: 700; margin: 0 0 6px;">⚠️ Terjadi kesalahan saat memuat data keuangan unit.</p>
          <p style="font-size: 12px; margin: 0 0 12px;">${err.message || "Gagal memproses data."}</p>
          <button type="button" id="btn-retry-unit-keuangan" style="padding: 6px 16px; font-size: 12px; font-weight: 600; background: #b91c1c; color: #fff; border: none; border-radius: 6px; cursor: pointer;">↻ Coba Lagi</button>
        </div>
      `;
      workspaceEl.querySelector("#btn-retry-unit-keuangan")?.addEventListener("click", () => renderWorkspaceContent(workspaceEl));
    }
  };

  const setKeuanganTab = (active) => {
    const buttons = [...root.querySelectorAll("[data-unit-keuangan-tab]")];
    if (!buttons.length) return;

    buttons.forEach((button) => {
      const desktop = button.closest("nav") !== null;
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
      button.className = active
        ? desktop
          ? "group relative flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-xl text-sm text-left transition-colors duration-150 shrink-0 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white font-medium shadow-sm"
          : "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg whitespace-nowrap bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white font-medium"
        : desktop
          ? "group relative flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-xl text-sm text-left text-[#5B7C93] hover:bg-[#F4F8FB] hover:text-[#17242E] shrink-0"
          : "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg whitespace-nowrap text-[#5B7C93] hover:bg-[#F4F8FB]";
    });

    if (active) {
      workArea = workArea || findWorkArea(buttons[0]);
      if (!workArea) return;
      if (!keuanganWorkspace) {
        keuanganWorkspace = document.createElement("section");
        keuanganWorkspace.dataset.unitKeuanganWorkspace = "true";
        keuanganWorkspace.className = "flex-1 min-w-0 w-full";
        keuanganWorkspace.style.cssText = "min-height: 600px; overflow: auto;";
        workArea.host.append(keuanganWorkspace);
      }
      workArea.content.style.display = "none";
      keuanganWorkspace.style.display = "block";
      renderWorkspaceContent(keuanganWorkspace);
    } else if (workArea && keuanganWorkspace) {
      workArea.content.style.display = "";
      keuanganWorkspace.style.display = "none";
    }
  };

  const isForbiddenDepartment = (nav) => {
    // 1. Cek hash URL jika mengarah ke bagian yang dilarang
    const hash = (window.location.hash || "").replace("#", "").toLowerCase();
    if (["pengasuhan", "pengajaran", "lptq", "sekretariat"].includes(hash)) {
      return true;
    }

    // 2. Cek teks khas nav pada pengasuhan, pengajaran, lptq, sekretariat
    const navText = (nav ? nav.textContent : "").toLowerCase();
    const forbiddenKeywords = [
      // Pengasuhan
      "master data santri", "perizinan", "pelanggaran", "kamar santri", "rapor mental", "konseling", "kedisiplinan", "tahfidz asrama", "penilaian kegiatan",
      // Pengajaran
      "kelas", "prestasi", "riwayat akademik", "rapor akademik", "jadwal pelajaran", "presensi kelas", "kurikulum", "mata pelajaran",
      // LPTQ
      "halaqoh", "tahfidz & mengaji", "ubudiyah & doa", "rapor tahfidz", "target hafalan", "setoran harian", "ujian tahfidz", "mutaba'ah", "musyrif",
      // Sekretariat / Sekretaris
      "data santri", "data alumni", "data wali", "surat masuk", "surat keluar", "arsip dokumen", "buku tamu", "legalisir", "surat rekomendasi"
    ];

    if (forbiddenKeywords.some((kw) => navText.includes(kw))) {
      return true;
    }

    // 3. Cek judul halaman atau banner active department jika ada
    const activeDeptBtn = document.querySelector("#root button.ring-amber-400, #root button.scale-105");
    if (activeDeptBtn) {
      const activeText = (activeDeptBtn.textContent || "").toLowerCase();
      if (activeText.includes("pengasuhan") || activeText.includes("pengajaran") ||
          activeText.includes("lptq") || activeText.includes("sekretariat")) {
        return true;
      }
    }

    return false;
  };

  const isAllowedDepartment = (nav) => {
    if (isForbiddenDepartment(nav)) return false;

    const navText = (nav ? nav.textContent : "").toLowerCase();
    // Harus secara positif merupakan navigasi Administrasi atau Unit Usaha
    const allowedKeywords = [
      // Administrasi
      "tagihan & pembayaran", "tagihan", "infaq bulanan", "infaq", "pengajuan anggaran", "cashflow bulanan", "laporan", "inventaris",
      // Unit Usaha
      "transaksi cashless", "riwayat semua unit", "riwayat transaksi", "permintaan wali", "cashflow unit"
    ];

    if (allowedKeywords.some((kw) => navText.includes(kw))) {
      return true;
    }

    const hash = (window.location.hash || "").replace("#", "").toLowerCase();
    if (hash === "administrasi" || hash === "unitusaha") {
      return true;
    }

    return false;
  };

  let isUpdatingTabs = false;
  const insertKeuanganUnitTab = () => {
    if (!root || isUpdatingTabs) return;
    const token = getAuthToken();
    const payload = parseJwt(token);

    // Keuangan Unit HANYA untuk bagian Keuangan/Administrasi, BMT, atau Superadmin.
    // Jika Pengasuhan, Pengajaran, LPTQ, atau Sekretariat: HAPUS TAB!
    const isSuper = payload?.jenisAkun === "superadmin" || payload?.departemen === "admin";
    const isKeuangan = payload?.departemen === "administrasi";
    const isBMT = payload?.departemen === "unitusaha" && payload?.unit === "BMT";
    const isAuthorized = isSuper || isKeuangan || isBMT;

    isUpdatingTabs = true;
    try {
      const menus = root.querySelectorAll('nav[aria-label="Navigasi bagian"], [role="menu"][aria-label="Navigasi bagian"]');
      menus.forEach((nav) => {
        const existingBtn = nav.querySelector("[data-unit-keuangan-tab]");

        // Jika tidak berwenang ATAU berada di bagian Pengasuhan, Pengajaran, LPTQ, atau Sekretariat:
        if (!isAuthorized || isForbiddenDepartment(nav) || !isAllowedDepartment(nav)) {
          if (existingBtn) {
            existingBtn.remove();
          }
          if (keuanganWorkspace && keuanganWorkspace.style.display !== "none") {
            keuanganWorkspace.style.display = "none";
            if (workArea?.content) workArea.content.style.display = "";
          }
          return;
        }

        if (existingBtn) return;

        const button = document.createElement("button");
        button.type = "button";
        button.dataset.unitKeuanganTab = "true";
        button.setAttribute("role", "menuitem");
        button.setAttribute("aria-label", "Keuangan Unit Usaha");
        button.title = "Keuangan Unit Usaha";
        button.className = nav.tagName === "NAV"
          ? "group relative flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-xl text-sm text-left text-[#5B7C93] hover:bg-[#F4F8FB] hover:text-[#17242E] shrink-0"
          : "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg whitespace-nowrap text-[#5B7C93] hover:bg-[#F4F8FB]";

        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("width", nav.tagName === "NAV" ? "16" : "14");
        icon.setAttribute("height", nav.tagName === "NAV" ? "16" : "14");
        icon.setAttribute("fill", "none");
        icon.setAttribute("stroke", "currentColor");
        icon.setAttribute("stroke-width", "1.8");
        icon.innerHTML = '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>';

        const label = document.createElement("span");
        label.textContent = "Keuangan Unit";
        if (nav.tagName === "NAV") label.className = "truncate";
        button.append(icon, label);

        const riwayatTab = [...nav.querySelectorAll("button")].find((b) => b.textContent.trim().includes("Riwayat"));
        const cashflowTab = [...nav.querySelectorAll("button")].find((b) => b.textContent.trim().includes("Cashflow") || b.textContent.trim().includes("Tagihan"));
        if (riwayatTab) riwayatTab.after(button);
        else if (cashflowTab) cashflowTab.after(button);
        else nav.appendChild(button);
      });
    } finally {
      isUpdatingTabs = false;
    }
  };

  window.renderUnitKeuanganWorkspace = (container) => {
    if (container) renderWorkspaceContent(container);
  };

  if (root) {
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-unit-keuangan-tab]")) {
        setKeuanganTab(true);
        return;
      }
      if (event.target.closest('nav[aria-label="Navigasi bagian"] button, [role="menu"][aria-label="Navigasi bagian"] button')) {
        setKeuanganTab(false);
      }
      // Jika pengguna mengklik switcher departemen Superadmin:
      if (event.target.closest("button") && event.target.closest(".rounded-2xl")) {
        setTimeout(insertKeuanganUnitTab, 30);
      }
    });

    window.addEventListener("hashchange", () => {
      setTimeout(insertKeuanganUnitTab, 30);
    });

    let tabDebounceTimer = null;
    const debouncedTabCheck = () => {
      if (tabDebounceTimer) return;
      tabDebounceTimer = setTimeout(() => {
        tabDebounceTimer = null;
        insertKeuanganUnitTab();
      }, 60);
    };

    new MutationObserver(debouncedTabCheck).observe(root, { childList: true, subtree: true });
    insertKeuanganUnitTab();
  }
})();
