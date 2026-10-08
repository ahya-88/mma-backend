(() => {
  const storageThemeKey = "mma-ui-theme";
  const storageTableKey = "mma-table-theme";
  const storageMotionKey = "mma-bg-motion";

  const validThemes = new Set(["light", "dark"]);

  const themePalettes = {
    white: {
      name: "Putih Bersih",
      dot: "#ffffff",
      border: "#cbd5e1",
      light: {
        "--tbl-header-bg": "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
        "--tbl-header-text": "#1e293b",
        "--tbl-header-border": "#cbd5e1",
        "--tbl-row-odd": "#ffffff",
        "--tbl-row-even": "#f1f5f9",
        "--tbl-row-hover": "#e2e8f0",
        "--tbl-row-indicator": "#0284c7",
        "--tbl-border": "#cbd5e1",
        "--tbl-accent": "#0284c7"
      },
      dark: {
        "--tbl-header-bg": "linear-gradient(180deg, #1e293b 0%, #152230 100%)",
        "--tbl-header-text": "#cbd5e1",
        "--tbl-header-border": "#334155",
        "--tbl-row-odd": "#19232d",
        "--tbl-row-even": "#141e28",
        "--tbl-row-hover": "#263544",
        "--tbl-row-indicator": "#38bdf8",
        "--tbl-border": "#334155",
        "--tbl-accent": "#38bdf8"
      }
    },
    emerald: {
      name: "Hijau Emerald",
      dot: "#10b981",
      border: "#059669",
      light: {
        "--tbl-header-bg": "linear-gradient(180deg, #d1fae5 0%, #a7f3d0 100%)",
        "--tbl-header-text": "#064e3b",
        "--tbl-header-border": "#6ee7b7",
        "--tbl-row-odd": "#ffffff",
        "--tbl-row-even": "#ecfdf5",
        "--tbl-row-hover": "#d1fae5",
        "--tbl-row-indicator": "#059669",
        "--tbl-border": "#a7f3d0",
        "--tbl-accent": "#10b981"
      },
      dark: {
        "--tbl-header-bg": "linear-gradient(180deg, #134e40 0%, #0d382e 100%)",
        "--tbl-header-text": "#a7f3d0",
        "--tbl-header-border": "#1b6352",
        "--tbl-row-odd": "#142822",
        "--tbl-row-even": "#0f201a",
        "--tbl-row-hover": "#1d473b",
        "--tbl-row-indicator": "#10b981",
        "--tbl-border": "#1b6352",
        "--tbl-accent": "#34d399"
      }
    },
    ocean: {
      name: "Biru Samudra",
      dot: "#0ea5e9",
      border: "#0284c7",
      light: {
        "--tbl-header-bg": "linear-gradient(180deg, #e0f2fe 0%, #bae6fd 100%)",
        "--tbl-header-text": "#0c4a6e",
        "--tbl-header-border": "#7dd3fc",
        "--tbl-row-odd": "#ffffff",
        "--tbl-row-even": "#f0f9ff",
        "--tbl-row-hover": "#e0f2fe",
        "--tbl-row-indicator": "#0284c7",
        "--tbl-border": "#bae6fd",
        "--tbl-accent": "#0ea5e9"
      },
      dark: {
        "--tbl-header-bg": "linear-gradient(180deg, #114264 0%, #0d324c 100%)",
        "--tbl-header-text": "#bae6fd",
        "--tbl-header-border": "#195682",
        "--tbl-row-odd": "#132535",
        "--tbl-row-even": "#0e1d2b",
        "--tbl-row-hover": "#1a3e5c",
        "--tbl-row-indicator": "#0ea5e9",
        "--tbl-border": "#195682",
        "--tbl-accent": "#38bdf8"
      }
    },
    amber: {
      name: "Amber Emas",
      dot: "#f59e0b",
      border: "#d97706",
      light: {
        "--tbl-header-bg": "linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)",
        "--tbl-header-text": "#78350f",
        "--tbl-header-border": "#fcd34d",
        "--tbl-row-odd": "#ffffff",
        "--tbl-row-even": "#fffbeb",
        "--tbl-row-hover": "#fef3c7",
        "--tbl-row-indicator": "#d97706",
        "--tbl-border": "#fde68a",
        "--tbl-accent": "#f59e0b"
      },
      dark: {
        "--tbl-header-bg": "linear-gradient(180deg, #4d3814 0%, #3a2a0d 100%)",
        "--tbl-header-text": "#fde68a",
        "--tbl-header-border": "#694d1c",
        "--tbl-row-odd": "#261e12",
        "--tbl-row-even": "#1d170d",
        "--tbl-row-hover": "#423319",
        "--tbl-row-indicator": "#f59e0b",
        "--tbl-border": "#694d1c",
        "--tbl-accent": "#fbbf24"
      }
    },
    purple: {
      name: "Ungu Elegan",
      dot: "#a855f7",
      border: "#7e22ce",
      light: {
        "--tbl-header-bg": "linear-gradient(180deg, #f3e8ff 0%, #e9d5ff 100%)",
        "--tbl-header-text": "#581c87",
        "--tbl-header-border": "#d8b4fe",
        "--tbl-row-odd": "#ffffff",
        "--tbl-row-even": "#faf5ff",
        "--tbl-row-hover": "#f3e8ff",
        "--tbl-row-indicator": "#9333ea",
        "--tbl-border": "#e9d5ff",
        "--tbl-accent": "#a855f7"
      },
      dark: {
        "--tbl-header-bg": "linear-gradient(180deg, #442261 0%, #321749 100%)",
        "--tbl-header-text": "#e9d5ff",
        "--tbl-header-border": "#5c2e82",
        "--tbl-row-odd": "#221430",
        "--tbl-row-even": "#190e24",
        "--tbl-row-hover": "#3a1f54",
        "--tbl-row-indicator": "#a855f7",
        "--tbl-border": "#5c2e82",
        "--tbl-accent": "#c084fc"
      }
    },
    dark: {
      name: "Gelap Obsidian",
      dot: "#334155",
      border: "#1e293b",
      light: {
        "--tbl-header-bg": "linear-gradient(180deg, #334155 0%, #1e293b 100%)",
        "--tbl-header-text": "#f8fafc",
        "--tbl-header-border": "#475569",
        "--tbl-row-odd": "#f8fafc",
        "--tbl-row-even": "#e2e8f0",
        "--tbl-row-hover": "#cbd5e1",
        "--tbl-row-indicator": "#0f172a",
        "--tbl-border": "#475569",
        "--tbl-accent": "#0f172a"
      },
      dark: {
        "--tbl-header-bg": "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
        "--tbl-header-text": "#f8fafc",
        "--tbl-header-border": "#334155",
        "--tbl-row-odd": "#1e293b",
        "--tbl-row-even": "#0f172a",
        "--tbl-row-hover": "#334155",
        "--tbl-row-indicator": "#38bdf8",
        "--tbl-border": "#334155",
        "--tbl-accent": "#38bdf8"
      }
    }
  };

  let theme = "light";
  let tableTheme = "white";
  let bgMotion = "active";

  try {
    const savedTheme = window.localStorage.getItem(storageThemeKey);
    if (validThemes.has(savedTheme)) theme = savedTheme;

    const savedTable = window.localStorage.getItem(storageTableKey);
    if (themePalettes[savedTable]) tableTheme = savedTable;

    const savedMotion = window.localStorage.getItem(storageMotionKey);
    if (savedMotion === "paused" || savedMotion === "active") bgMotion = savedMotion;
  } catch (error) {
    console.warn("Preferensi tema tidak dapat dibaca dari penyimpanan browser.", error);
  }

  const applyCssVariables = () => {
    const palette = themePalettes[tableTheme] || themePalettes.white;
    const vars = theme === "dark" ? palette.dark : palette.light;
    const rootStyle = document.documentElement.style;

    Object.entries(vars).forEach(([key, val]) => {
      rootStyle.setProperty(key, val);
    });
  };

  const applyTheme = (nextTheme) => {
    theme = nextTheme;
    document.documentElement.dataset.theme = theme;
    applyCssVariables();

    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.innerHTML = theme === "dark" ? "<span>☀️</span> Terang" : "<span>🌙</span> Gelap";
      btn.setAttribute("aria-pressed", String(theme === "dark"));
      btn.setAttribute("title", `Ganti ke tema ${theme === "dark" ? "terang" : "gelap"}`);
    }
  };

  const applyTableTheme = (nextTableTheme) => {
    tableTheme = themePalettes[nextTableTheme] ? nextTableTheme : "white";
    document.documentElement.dataset.tableTheme = tableTheme;
    applyCssVariables();

    const currentObj = themePalettes[tableTheme];
    const indicator = document.getElementById("table-theme-current-dot");
    if (indicator) {
      indicator.style.backgroundColor = currentObj.dot;
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

  // Terapkan segera
  applyTheme(theme);
  applyTableTheme(tableTheme);
  applyBgMotion(bgMotion);

  // Ekspos ke global window untuk kontrol fleksibel
  window.setTableTheme = (themeName) => {
    if (themePalettes[themeName]) {
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

    const currentTableObj = themePalettes[tableTheme];
    tableBtn.innerHTML = `
      <span id="table-theme-current-dot" class="theme-color-dot" style="background-color: ${currentTableObj.dot};"></span>
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
    header.innerHTML = "<strong>Tema Tabel Informasi</strong><small>Klik untuk ganti warna tabel secara langsung:</small>";
    picker.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "table-theme-grid";

    Object.entries(themePalettes).forEach(([id, item]) => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = `table-theme-option ${id === tableTheme ? "active" : ""}`;
      opt.dataset.themeId = id;
      opt.innerHTML = `
        <span class="theme-swatch" style="background: ${item.dot}; border-color: ${item.border};"></span>
        <span class="theme-name">${item.name}</span>
      `;
      opt.addEventListener("click", () => {
        applyTableTheme(id);
        try { window.localStorage.setItem(storageTableKey, id); } catch (_) {}
        picker.setAttribute("hidden", "true");
      });
      grid.appendChild(opt);
    });
    picker.appendChild(grid);

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
