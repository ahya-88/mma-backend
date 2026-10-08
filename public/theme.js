(() => {
  const storageThemeKey = "mma-ui-theme";
  const storageTableKey = "mma-table-theme";
  const storageMotionKey = "mma-bg-motion";

  const validThemes = new Set(["light", "dark"]);
  const tableThemes = [
    { id: "white", name: "Putih Bersih", color: "#ffffff", border: "#cbd5e1" },
    { id: "emerald", name: "Hijau Emerald", color: "#10b981", border: "#059669" },
    { id: "ocean", name: "Biru Samudra", color: "#0ea5e9", border: "#0284c7" },
    { id: "amber", name: "Amber Emas", color: "#f59e0b", border: "#d97706" },
    { id: "purple", name: "Ungu Elegan", color: "#a855f7", border: "#7e22ce" },
    { id: "dark", name: "Gelap Obsidian", color: "#334155", border: "#1e293b" }
  ];

  let theme = "light";
  let tableTheme = "white";
  let bgMotion = "active";

  try {
    const savedTheme = window.localStorage.getItem(storageThemeKey);
    if (validThemes.has(savedTheme)) theme = savedTheme;

    const savedTable = window.localStorage.getItem(storageTableKey);
    if (tableThemes.some(t => t.id === savedTable)) tableTheme = savedTable;

    const savedMotion = window.localStorage.getItem(storageMotionKey);
    if (savedMotion === "paused" || savedMotion === "active") bgMotion = savedMotion;
  } catch (error) {
    console.warn("Preferensi tema tidak dapat dibaca dari penyimpanan browser.", error);
  }

  const applyTheme = (nextTheme) => {
    theme = nextTheme;
    document.documentElement.dataset.theme = theme;
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.innerHTML = theme === "dark" ? "<span>☀️</span> Terang" : "<span>🌙</span> Gelap";
      btn.setAttribute("aria-pressed", String(theme === "dark"));
      btn.setAttribute("title", `Ganti ke tema ${theme === "dark" ? "terang" : "gelap"}`);
    }
  };

  const applyTableTheme = (nextTableTheme) => {
    tableTheme = nextTableTheme;
    document.documentElement.dataset.tableTheme = tableTheme;
    const currentObj = tableThemes.find(t => t.id === tableTheme) || tableThemes[0];
    const indicator = document.getElementById("table-theme-current-dot");
    if (indicator) {
      indicator.style.backgroundColor = currentObj.color;
    }
    const label = document.getElementById("table-theme-current-label");
    if (label) {
      label.textContent = currentObj.name;
    }
    document.querySelectorAll(".table-theme-option").forEach(el => {
      if (el.dataset.themeId === tableTheme) {
        el.classList.add("active");
        el.setAttribute("aria-checked", "true");
      } else {
        el.classList.remove("active");
        el.setAttribute("aria-checked", "false");
      }
    });
  };

  const applyBgMotion = (nextMotion) => {
    bgMotion = nextMotion;
    document.documentElement.dataset.bgMotion = bgMotion;
    if (bgMotion === "paused") {
      document.body?.classList.add("bg-motion-paused");
    } else {
      document.body?.classList.remove("bg-motion-paused");
    }
    const motionBtn = document.getElementById("motion-toggle");
    if (motionBtn) {
      motionBtn.innerHTML = bgMotion === "active" ? "<span>✨</span> Hidup" : "<span>⏸️</span> Statis";
      motionBtn.setAttribute("title", bgMotion === "active" ? "Background bergerak aktif (klik untuk jeda)" : "Background statis (klik untuk gerak)");
    }
  };

  // Terapkan segera agar tidak ada kedipan (flash)
  applyTheme(theme);
  applyTableTheme(tableTheme);
  applyBgMotion(bgMotion);

  // Ekspos ke global window untuk kontrol fleksibel
  window.setTableTheme = (themeName) => {
    if (tableThemes.some(t => t.id === themeName)) {
      applyTableTheme(themeName);
      try { window.localStorage.setItem(storageTableKey, themeName); } catch (_) {}
    }
  };
  window.toggleLiveBackground = (enable) => {
    const target = typeof enable === "boolean" ? (enable ? "active" : "paused") : (bgMotion === "active" ? "paused" : "active");
    applyBgMotion(target);
    try { window.localStorage.setItem(storageMotionKey, target); } catch (_) {}
  };

  const buildFloatingControls = () => {
    if (document.getElementById("mma-floating-theme-bar")) return;

    const bar = document.createElement("div");
    bar.id = "mma-floating-theme-bar";
    bar.className = "mma-floating-theme-bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Pengaturan Tampilan dan Tema");

    // Tombol Toggle Dark/Light
    const themeBtn = document.createElement("button");
    themeBtn.id = "theme-toggle";
    themeBtn.className = "theme-action-btn";
    themeBtn.type = "button";
    themeBtn.innerHTML = theme === "dark" ? "<span>☀️</span> Terang" : "<span>🌙</span> Gelap";
    themeBtn.addEventListener("click", () => {
      const next = theme === "dark" ? "light" : "dark";
      applyTheme(next);
      try { window.localStorage.setItem(storageThemeKey, next); } catch (_) {}
    });

    // Tombol Pemilih Tema Tabel
    const tableBtn = document.createElement("button");
    tableBtn.id = "table-theme-trigger";
    tableBtn.className = "theme-action-btn table-trigger-btn";
    tableBtn.type = "button";
    tableBtn.title = "Ubah warna/tema tabel informasi";

    const currentTableObj = tableThemes.find(t => t.id === tableTheme) || tableThemes[0];
    tableBtn.innerHTML = `
      <span id="table-theme-current-dot" class="theme-color-dot" style="background-color: ${currentTableObj.color};"></span>
      <span class="btn-text">Tabel: <b id="table-theme-current-label">${currentTableObj.name}</b></span>
      <span class="arrow-icon">▾</span>
    `;

    // Dropdown / Popover Pemilih Tema Tabel
    const picker = document.createElement("div");
    picker.id = "table-theme-picker";
    picker.className = "table-theme-picker-popover";
    picker.setAttribute("role", "menu");
    picker.setAttribute("hidden", "true");

    const header = document.createElement("div");
    header.className = "picker-title";
    header.innerHTML = "<strong>Tema Tabel Informasi</strong><small>Pilih gaya warna tabel:</small>";
    picker.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "table-theme-grid";

    tableThemes.forEach(item => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = `table-theme-option ${item.id === tableTheme ? "active" : ""}`;
      opt.dataset.themeId = item.id;
      opt.innerHTML = `
        <span class="theme-swatch" style="background: ${item.color}; border-color: ${item.border};"></span>
        <span class="theme-name">${item.name}</span>
      `;
      opt.addEventListener("click", () => {
        applyTableTableSelection(item.id);
        picker.setAttribute("hidden", "true");
      });
      grid.appendChild(opt);
    });
    picker.appendChild(grid);

    const applyTableTableSelection = (id) => {
      applyTableTheme(id);
      try { window.localStorage.setItem(storageTableKey, id); } catch (_) {}
    };

    tableBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = picker.hasAttribute("hidden");
      if (isHidden) {
        picker.removeAttribute("hidden");
      } else {
        picker.setAttribute("hidden", "true");
      }
    });

    document.addEventListener("click", (e) => {
      if (!bar.contains(e.target)) {
        picker.setAttribute("hidden", "true");
      }
    });

    // Tombol Toggle Background Hidup / Bergerak
    const motionBtn = document.createElement("button");
    motionBtn.id = "motion-toggle";
    motionBtn.className = "theme-action-btn motion-btn";
    motionBtn.type = "button";
    motionBtn.innerHTML = bgMotion === "active" ? "<span>✨</span> Hidup" : "<span>⏸️</span> Statis";
    motionBtn.setAttribute("title", bgMotion === "active" ? "Background bergerak aktif (klik untuk jeda)" : "Background statis (klik untuk gerak)");
    motionBtn.addEventListener("click", () => {
      const nextMotion = bgMotion === "active" ? "paused" : "active";
      applyBgMotion(nextMotion);
      try { window.localStorage.setItem(storageMotionKey, nextMotion); } catch (_) {}
    });

    bar.appendChild(themeBtn);
    bar.appendChild(tableBtn);
    bar.appendChild(motionBtn);
    bar.appendChild(picker);

    document.body.appendChild(bar);
    applyTheme(theme);
    applyTableTheme(tableTheme);
    applyBgMotion(bgMotion);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildFloatingControls, { once: true });
  } else {
    buildFloatingControls();
  }
})();
