(() => {
  const storageKey = "mma-ui-theme";
  const validThemes = new Set(["light", "dark"]);
  let theme = "light";

  try {
    const savedTheme = window.localStorage.getItem(storageKey);
    if (validThemes.has(savedTheme)) theme = savedTheme;
  } catch (error) {
    console.warn("Preferensi tema tidak dapat dibaca dari penyimpanan browser.", error);
  }

  const applyTheme = (nextTheme) => {
    theme = nextTheme;
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById("theme-toggle");
    if (button) {
      button.textContent = theme === "dark" ? "☀️ Tema terang" : "🌙 Tema gelap";
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.setAttribute("aria-label", `Aktifkan tema ${theme === "dark" ? "terang" : "gelap"}`);
    }
  };

  applyTheme(theme);

  const addToggle = () => {
    const button = document.createElement("button");
    button.id = "theme-toggle";
    button.type = "button";
    button.addEventListener("click", () => {
      const nextTheme = theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      try {
        window.localStorage.setItem(storageKey, nextTheme);
      } catch (error) {
        console.warn("Preferensi tema tidak dapat disimpan ke penyimpanan browser.", error);
      }
    });
    document.body.append(button);
    applyTheme(theme);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addToggle, { once: true });
  } else {
    addToggle();
  }
})();
