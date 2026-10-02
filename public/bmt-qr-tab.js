(() => {
  const root = document.getElementById("root");
  if (!root) return;

  const fetchOriginal = window.fetch.bind(window);
  let bmtToken = "";
  let qrWorkspace = null;
  let workArea = null;

  window.fetch = async (...args) => {
    const response = await fetchOriginal(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (url.includes("/auth/login") && response.ok) {
      response.clone().json().then((result) => {
        if (result.user?.role === "guru" && result.user?.departemen === "unitusaha" && result.user?.unit === "BMT") {
          bmtToken = result.token;
        }
      }).catch(() => {});
    }
    return response;
  };

  const findWorkArea = (button) => {
    for (let node = button.parentElement; node; node = node.parentElement) {
      const content = [...node.children].find((child) => child.classList.contains("flex-1") && child.classList.contains("min-w-0") && child.classList.contains("w-full"));
      if (content) return { host: node, content };
    }
    return null;
  };

  const setQrTab = (active) => {
    const buttons = [...root.querySelectorAll("[data-bmt-qr-tab]")];
    if (!buttons.length) return;
    buttons.forEach((button) => {
      const desktop = button.closest("nav") !== null;
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
      button.className = active
        ? desktop
          ? "group relative flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-xl text-sm text-left transition-colors duration-150 shrink-0 bg-gradient-to-r from-[#29AAE1] to-[#0C4A6E] text-white font-medium shadow-sm"
          : "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg whitespace-nowrap bg-gradient-to-r from-[#29AAE1] to-[#0C4A6E] text-white font-medium"
        : desktop
          ? "group relative flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-xl text-sm text-left text-[#5B7C93] hover:bg-[#F4F8FB] hover:text-[#17242E] shrink-0"
          : "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg whitespace-nowrap text-[#5B7C93] hover:bg-[#F4F8FB]";
    });

    if (active) {
      workArea = workArea || findWorkArea(buttons[0]);
      if (!workArea) return;
      if (!qrWorkspace) {
        qrWorkspace = document.createElement("section");
        qrWorkspace.dataset.bmtQrWorkspace = "true";
        qrWorkspace.className = "flex-1 min-w-0 w-full";
        qrWorkspace.style.cssText = "height:760px;max-height:calc(100vh - 250px);min-height:540px;overflow:auto;border:1px solid #dce4dd;border-radius:8px;background:#f3f5f0";
        const frame = document.createElement("iframe");
        frame.title = "Pengaturan QR Santri";
        frame.style.cssText = "display:block;width:100%;height:100%;min-height:540px;border:0;background:#f3f5f0";
        frame.src = "/bmt/qr?embedded=1";
        frame.addEventListener("load", () => {
          frame.contentWindow.postMessage({ type: "mma-bmt-qr-session", token: bmtToken }, location.origin);
        });
        qrWorkspace.append(frame);
        workArea.host.append(qrWorkspace);
      }
      workArea.content.style.display = "none";
      qrWorkspace.style.display = "block";
    } else if (workArea && qrWorkspace) {
      workArea.content.style.display = "";
      qrWorkspace.style.display = "none";
    }
  };

  const insertQrTab = () => {
    const menus = root.querySelectorAll('nav[aria-label="Navigasi bagian"], [role="menu"][aria-label="Navigasi bagian"]');
    if (!menus.length && bmtToken) {
      bmtToken = "";
      qrWorkspace?.remove();
      qrWorkspace = null;
      workArea = null;
    }
    menus.forEach((nav) => {
      const riwayatTab = [...nav.querySelectorAll("button")].find((button) => button.textContent.trim() === "Riwayat Semua Unit");
      if (!riwayatTab || nav.querySelector("[data-bmt-qr-tab]")) return;

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.bmtQrTab = "true";
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-label", "Pengaturan QR Santri");
      button.title = "Pengaturan QR Santri";
      button.className = nav.tagName === "NAV"
        ? "group relative flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-xl text-sm text-left text-[#5B7C93] hover:bg-[#F4F8FB] hover:text-[#17242E] shrink-0"
        : "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg whitespace-nowrap text-[#5B7C93] hover:bg-[#F4F8FB]";

      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("width", nav.tagName === "NAV" ? "16" : "14");
      icon.setAttribute("height", nav.tagName === "NAV" ? "16" : "14");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "1.7");
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v2M17 20h4M20 18v3"/>';

      const label = document.createElement("span");
      label.textContent = "QR Santri";
      if (nav.tagName === "NAV") label.className = "truncate";
      button.append(icon, label);
      riwayatTab.after(button);
    });
  };

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-bmt-qr-tab]")) {
      setQrTab(true);
      return;
    }
    if (event.target.closest('nav[aria-label="Navigasi bagian"] button, [role="menu"][aria-label="Navigasi bagian"] button')) setQrTab(false);
  });
  new MutationObserver(insertQrTab).observe(root, { childList: true, subtree: true });
  insertQrTab();
})();