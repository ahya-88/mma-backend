const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_BACKEND = path.resolve(__dirname, '..');
const ANDROID_PROJECT_DIR = 'C:\\Users\\Mudaiyatul Anwar\\Videos\\SuperApp-Mahad-Android';
const SOURCE_JSX = path.join(ROOT_BACKEND, 'pesantren-app.jsx');
const TARGET_APP_JSX = path.join(ANDROID_PROJECT_DIR, 'src', 'App.jsx');
const TARGET_INDEX_HTML = path.join(ANDROID_PROJECT_DIR, 'index.html');

console.log('--- Sinkronisasi Update Website/Server ke SuperApp Android ---');

if (!fs.existsSync(SOURCE_JSX)) {
  console.error('File sumber pesantren-app.jsx tidak ditemukan di:', SOURCE_JSX);
  process.exit(1);
}

if (!fs.existsSync(ANDROID_PROJECT_DIR)) {
  console.error('Folder Android tidak ditemukan di:', ANDROID_PROJECT_DIR);
  process.exit(1);
}

let content = fs.readFileSync(SOURCE_JSX, 'utf8');

// 1. Sesuaikan BACKEND_API_BASE untuk mobile Android
const oldBackendBasePattern = /const BACKEND_API_BASE = \(typeof window !== "undefined" && window\.BACKEND_API_BASE\) \|\| \(typeof window !== "undefined" \? window\.location\.origin \+ "\/api" : "http:\/\/localhost:4000\/api"\);/;
const newBackendBase = `const BACKEND_API_BASE = (typeof window !== "undefined" && window.BACKEND_API_BASE) || "https://mma.up.railway.app/api";`;
content = content.replace(oldBackendBasePattern, newBackendBase);

// 2. Modifikasi App() untuk session persistence, Capacitor, dan In-App update
const targetAppSignature = 'export default function App() {';
if (!content.includes(targetAppSignature)) {
  console.error('Tidak menemukan deklarasi App() di file sumber!');
  process.exit(1);
}

const targetLoginStart = '  const [session, setSession] = useState(null);';
const enhancedLoginState = `  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem("mma_app_session");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [backendToken, setBackendToken] = useState(() => {
    try {
      return localStorage.getItem("mma_app_backend_token") || null;
    } catch {
      return null;
    }
  });
  const [backendOnline, setBackendOnline] = useState(() => {
    try {
      return localStorage.getItem("mma_app_backend_token") ? true : null;
    } catch {
      return null;
    }
  });

  // ---- In-App Update & Capacitor Native Integration ----
  const CURRENT_APP_VERSION = "1.2.0";
  const CURRENT_VERSION_CODE = 10200;

  const [updateInfo, setUpdateInfo] = useState({
    checked: false,
    hasUpdate: false,
    data: null,
    modalOpen: false,
    msg: "",
  });

  const periksaPembaruanAplikasi = async (manualTrigger = false) => {
    try {
      const res = await backendApi("/public/app-update");
      if (res && res.latestVersion) {
        const serverCode = res.versionCode || 10200;
        const hasNewVersion = serverCode > CURRENT_VERSION_CODE || res.latestVersion !== CURRENT_APP_VERSION;

        if (hasNewVersion) {
          setUpdateInfo({
            checked: true,
            hasUpdate: true,
            data: res,
            modalOpen: true,
            msg: "Versi baru v" + res.latestVersion + " tersedia!",
          });
        } else {
          setUpdateInfo({
            checked: true,
            hasUpdate: false,
            data: res,
            modalOpen: manualTrigger,
            msg: "Aplikasi Anda sudah menggunakan versi terbaru (v" + CURRENT_APP_VERSION + ").",
          });
        }
      }
    } catch (err) {
      if (manualTrigger) {
        setUpdateInfo({
          checked: true,
          hasUpdate: false,
          data: null,
          modalOpen: true,
          msg: "Gagal memeriksa pembaruan. Periksa koneksi internet HP atau status server.",
        });
      }
    }
  };

  useEffect(() => {
    periksaPembaruanAplikasi(false);
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
          const { StatusBar, Style } = await import("@capacitor/status-bar");
          const { SplashScreen } = await import("@capacitor/splash-screen");
          await StatusBar.setStyle({ style: Style.Light });
          await StatusBar.setBackgroundColor({ color: "#ffffff" });
          await SplashScreen.hide();
        }
      } catch (e) {}
    };
    initApp();
  }, []);`;

content = content.replace(
  `  const [session, setSession] = useState(null);
  // Token & status koneksi ke backend cashless (terpisah dari sesi lokal, karena backend-nya baru
  // mencakup modul cashless — modul lain masih memakai state lokal seperti sebelumnya).
  const [backendToken, setBackendToken] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null); // null = belum dicoba`,
  enhancedLoginState
);

// 3. Modifikasi handleLogin dan handleLogout untuk persistensi localStorage
const oldHandleLoginPattern = `  const handleLogin = (role, user, password, tokenSudahAda) => {
    setSession({ role, user });
    if (tokenSudahAda) { setBackendToken(tokenSudahAda); setBackendOnline(true); return; }`;

const newHandleLogin = `  const handleLogin = (role, user, password, tokenSudahAda) => {
    const newSession = { role, user };
    setSession(newSession);
    try { localStorage.setItem("mma_app_session", JSON.stringify(newSession)); } catch (e) {}
    if (tokenSudahAda) {
      setBackendToken(tokenSudahAda);
      setBackendOnline(true);
      try { localStorage.setItem("mma_app_backend_token", tokenSudahAda); } catch (e) {}
      return;
    }`;

content = content.replace(oldHandleLoginPattern, newHandleLogin);

// Tambahkan penyimpanan token saat berhasil login via API backend
content = content.replace(
  `backendApi("/auth/login", { method: "POST", body: { username: user.username, password } })
      .then((hasil) => { setBackendToken(hasil.token); setBackendOnline(true); })`,
  `backendApi("/auth/login", { method: "POST", body: { username: user.username, password } })
      .then((hasil) => {
        setBackendToken(hasil.token);
        setBackendOnline(true);
        try { localStorage.setItem("mma_app_backend_token", hasil.token); } catch (e) {}
      })`
);

// Hapus sesi dari localStorage saat logout
content = content.replace(
  `  const handleLogout = () => { setSession(null); setBackendToken(null); setBackendOnline(null); };`,
  `  const handleLogout = () => {
    setSession(null);
    setBackendToken(null);
    setBackendOnline(null);
    try {
      localStorage.removeItem("mma_app_session");
      localStorage.removeItem("mma_app_backend_token");
    } catch (e) {}
  };`
);

// 4. Sisipkan Modal In-App Update sebelum penutup div App
const targetClose = `      <PrintOverlay content={printContent} onClose={() => setPrintContent(null)} />
    </div>
  );
}`;

const modalSnippet = `      <PrintOverlay content={printContent} onClose={() => setPrintContent(null)} />

      {/* Modal In-App Update Aplikasi */}
      {updateInfo.modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden flex flex-col shadow-2xl border border-white/40 text-[#17242E]">
            <div className="p-4 border-b border-[#E7ECF2] flex items-center justify-between bg-[#F4F8FB]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <Download size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#0C4A6E]">Pembaruan Aplikasi Android</h3>
                  <p className="text-[11px] text-[#5B7C93]">Super App Ma'had Mudaiyatul Anwar</p>
                </div>
              </div>
              <button
                onClick={() => setUpdateInfo((u) => ({ ...u, modalOpen: false }))}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs leading-relaxed">
              {updateInfo.hasUpdate && updateInfo.data ? (
                <>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                    <p className="font-bold text-sm mb-1 flex items-center gap-1.5 text-emerald-800">
                      <Check size={16} /> Versi Baru v{updateInfo.data.latestVersion} Tersedia!
                    </p>
                    <p className="text-[11px]">Versi Terinstall Saat Ini: <strong>v{CURRENT_APP_VERSION}</strong></p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-800 mb-1">Catatan Rilis & Fitur Baru:</p>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-[11px] leading-relaxed">
                      {updateInfo.data.releaseNotes || "Perbaikan performa, fitur baru, dan peningkatan stabilitas sistem."}
                    </div>
                  </div>

                  <a
                    href={updateInfo.data.updateUrl || "https://mma.up.railway.app/download/app-debug.apk"}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full btn-gradient py-2.5 px-4 rounded-xl text-center font-bold text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 text-white"
                  >
                    <Download size={15} /> Unduh & Install Pembaruan (APK)
                  </a>
                </>
              ) : (
                <div className="text-center py-4 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <Check size={24} />
                  </div>
                  <p className="font-bold text-sm text-[#0C4A6E]">{updateInfo.msg}</p>
                  <p className="text-[11px] text-slate-500">Versi Terinstall: v{CURRENT_APP_VERSION} (Build {CURRENT_VERSION_CODE})</p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#E7ECF2] bg-slate-50 flex justify-end">
              <button
                onClick={() => setUpdateInfo((u) => ({ ...u, modalOpen: false }))}
                className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`;

if (content.includes(targetClose)) {
  content = content.replace(targetClose, modalSnippet);
} else {
  console.warn('Perhatian: target penutup div tidak cocok persis, menyisipkan modal sebelum return penutup.');
  const lastIndex = content.lastIndexOf('    </div>\n  );\n}');
  if (lastIndex !== -1) {
    content = content.slice(0, lastIndex) + '\n' + modalSnippet.split('      <PrintOverlay content={printContent} onClose={() => setPrintContent(null)} />\n')[1];
  }
}

// Tulis ke src/App.jsx di Android
fs.writeFileSync(TARGET_APP_JSX, content, 'utf8');
console.log('Berhasil menulis kode terkini ke:', TARGET_APP_JSX);

// Perbarui index.html di Android
const updatedIndexHtml = `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
  <meta name="theme-color" content="#0C4A6E" />
  <title>Super App Ma'had</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script>
    window.BACKEND_API_BASE = window.BACKEND_API_BASE || "https://mma.up.railway.app/api";
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
  <script src="/offline-cashier.js"></script>
</body>
</html>
`;
fs.writeFileSync(TARGET_INDEX_HTML, updatedIndexHtml, 'utf8');
console.log('Berhasil memperbarui:', TARGET_INDEX_HTML);

console.log('Sinkronisasi selesai!');
