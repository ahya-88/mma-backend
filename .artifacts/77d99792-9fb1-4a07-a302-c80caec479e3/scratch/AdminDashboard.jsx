import React, { useState, useEffect } from "react";

export default function AdminDashboard({ token, user }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [summary, setSummary] = useState(null);
  const [santriList, setSantriList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isSuperAdmin = user?.jenisAkun === "superadmin" || user?.departemen === "admin";
  const isSekretariat = user?.departemen === "sekretariat";

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const headers = { Authorization: `Bearer ${token}` };

        if (activeTab === "dashboard") {
          const res = await fetch("/api/admin/ringkasan", { headers });
          if (!res.ok) throw new Error("Gagal memuat ringkasan dashboard.");
          const data = await res.json();
          setSummary(data);
        } else if (activeTab === "santri") {
          const res = await fetch("/api/santri?page=1&limit=20", { headers });
          if (!res.ok) throw new Error("Gagal memuat data santri.");
          const data = await res.json();
          setSantriList(data.items || []);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchData();
    }
  }, [activeTab, token]);

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="p-5 border-b border-slate-800">
          <h1 className="text-lg font-bold">
            {isSuperAdmin ? "MA Superadmin" : "MA Sekretariat"}
          </h1>
          <p className="text-xs text-slate-400">
            {isSuperAdmin ? "SUPERADMIN" : "SEKRETARIAT"}
          </p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition ${
              activeTab === "dashboard" ? "bg-sky-600 text-white" : "hover:bg-slate-800 text-slate-300"
            }`}
          >
            Dashboard Ringkasan
          </button>
          <button
            onClick={() => setActiveTab("santri")}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition ${
              activeTab === "santri" ? "bg-sky-600 text-white" : "hover:bg-slate-800 text-slate-300"
            }`}
          >
            Data Santri
          </button>
          {(isSuperAdmin || isSekretariat) && (
            <button
              onClick={() => setActiveTab("wali")}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === "wali" ? "bg-sky-600 text-white" : "hover:bg-slate-800 text-slate-300"
              }`}
            >
              Akun Wali
            </button>
          )}
        </nav>
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
          Ma'had Mudaiyatul Anwar v1.0.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800 capitalize">
            {activeTab}
          </h2>
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-slate-700">{user?.nama || "Pengguna"}</span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-500">
              Memuat data...
            </div>
          ) : (
            <>
              {activeTab === "dashboard" && summary && (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-semibold text-slate-400 uppercase">Total Santri</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">{summary.kartu.santri}</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-semibold text-slate-400 uppercase">Absensi Hari Ini</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">{summary.kartu.absensiHariIni}</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-semibold text-slate-400 uppercase">Izin Menunggu</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">{summary.kartu.izinMenunggu}</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-semibold text-slate-400 uppercase">Status Sistem</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">
                        {summary.statusLayanan ? "Normal" : "Gangguan"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "santri" && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                        <th className="p-4">Nama</th>
                        <th className="p-4">NIS</th>
                        <th className="p-4">Kelas</th>
                        <th className="p-4">Asrama</th>
                        {isSuperAdmin && <th className="p-4">Saldo</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                      {santriList.map((santri) => (
                        <tr key={santri.id} className="hover:bg-slate-50 transition">
                          <td className="p-4 font-medium text-slate-900">{santri.nama}</td>
                          <td className="p-4">{santri.nis || "—"}</td>
                          <td className="p-4">{santri.kelas || "—"}</td>
                          <td className="p-4">{santri.asrama || "—"}</td>
                          {isSuperAdmin && (
                            <td className="p-4 font-semibold text-emerald-600">
                              Rp {Number(santri.saldo || 0).toLocaleString("id-ID")}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
