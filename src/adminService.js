const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./db");
const { CashlessError, SANTRI_BIODATA_FIELDS, getSantriRow, toPublicSantri } = require("./cashlessService");

const uid = () => crypto.randomUUID();

function assertUniqueUsername(username, excludeGuruId = null, excludeWaliId = null) {
  const guru = db.prepare("SELECT id FROM Guru WHERE username = ?").get(username);
  if (guru && guru.id !== excludeGuruId) throw new CashlessError(409, "Username sudah dipakai akun Guru/Staff.");
  const wali = db.prepare("SELECT id FROM Wali WHERE username = ?").get(username);
  if (wali && wali.id !== excludeWaliId) throw new CashlessError(409, "Username sudah dipakai akun Wali.");
}

function sanitizeGuru(row) {
  if (!row) return null;
  const { password, ...safe } = row;
  return safe;
}
function sanitizeWali(row) {
  if (!row) return null;
  const { password, ...safe } = row;
  return safe;
}

function listGuru() {
  return db.prepare("SELECT id,nama,username,departemen,unit,createdAt FROM Guru ORDER BY nama").all();
}
function listWali() {
  return db.prepare("SELECT id,nama,hp,username,createdAt FROM Wali ORDER BY nama").all();
}
function listSantri() {
  return db.prepare("SELECT * FROM Santri ORDER BY nama").all().map(toPublicSantri);
}

function dashboard() {
  const guru = listGuru();
  const wali = listWali();
  const santri = listSantri();
  const kelas = [...new Set(santri.map(s => s.kelas).filter(Boolean))].sort();
  const unitUsaha = [...new Set(guru.filter(g => g.departemen === "unitusaha").map(g => g.unit).filter(Boolean))].sort();
  return {
    counts: { guru: guru.length, wali: wali.length, santri: santri.length, kelas: kelas.length },
    guru, wali, santri, kelas, unitUsaha,
    config: getConfig("admin") || {}
  };
}

function getConfig(key) {
  const row = db.prepare("SELECT nilai FROM AdminConfig WHERE kunci = ?").get(key);
  if (!row) return null;
  try { return JSON.parse(row.nilai); } catch { return row.nilai; }
}
function setConfig(key, value) {
  db.prepare(`INSERT INTO AdminConfig(kunci,nilai,updatedAt) VALUES(?,?,datetime('now'))
    ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai, updatedAt=datetime('now')`)
    .run(key, JSON.stringify(value));
  return value;
}

function createGuru({ nama, username, password, departemen, unit }) {
  if (!nama || !username || !password || !departemen) throw new CashlessError(400, "Nama, username, password, dan departemen wajib diisi.");
  assertUniqueUsername(username);
  const row = { id: uid(), nama, username, password: bcrypt.hashSync(password, 10), departemen, unit: departemen === "unitusaha" ? (unit || null) : null };
  db.prepare(`INSERT INTO Guru(id,nama,username,password,departemen,unit) VALUES(@id,@nama,@username,@password,@departemen,@unit)`).run(row);
  return sanitizeGuru(db.prepare("SELECT * FROM Guru WHERE id=?").get(row.id));
}
function updateGuru(id, body) {
  const row = db.prepare("SELECT * FROM Guru WHERE id=?").get(id);
  if (!row) throw new CashlessError(404, "Akun Guru/Staff tidak ditemukan.");
  const nama = body.nama ?? row.nama, username = body.username ?? row.username;
  const departemen = body.departemen ?? row.departemen;
  const unit = departemen === "unitusaha" ? (body.unit ?? row.unit) : null;
  assertUniqueUsername(username, id, null);
  const sets=["nama=@nama","username=@username","departemen=@departemen","unit=@unit"];
  const params={id,nama,username,departemen,unit};
  if (body.password) { sets.push("password=@password"); params.password=bcrypt.hashSync(body.password,10); }
  db.prepare(`UPDATE Guru SET ${sets.join(",")} WHERE id=@id`).run(params);
  return sanitizeGuru(db.prepare("SELECT * FROM Guru WHERE id=?").get(id));
}
function deleteGuru(id) {
  const row = db.prepare("SELECT * FROM Guru WHERE id=?").get(id);
  if (!row) throw new CashlessError(404, "Akun Guru/Staff tidak ditemukan.");
  if (row.departemen === "admin") {
    const count = db.prepare("SELECT COUNT(*) c FROM Guru WHERE departemen='admin'").get().c;
    if (count <= 1) throw new CashlessError(409, "Tidak boleh menghapus satu-satunya akun admin.");
  }
  db.prepare("DELETE FROM Guru WHERE id=?").run(id);
  return sanitizeGuru(row);
}

function createWali({ nama, hp, username, password }) {
  if (!nama || !username || !password) throw new CashlessError(400, "Nama, username, dan password wajib diisi.");
  assertUniqueUsername(username);
  const row={id:uid(),nama,hp:hp||null,username,password:bcrypt.hashSync(password,10)};
  db.prepare(`INSERT INTO Wali(id,nama,hp,username,password) VALUES(@id,@nama,@hp,@username,@password)`).run(row);
  return sanitizeWali(db.prepare("SELECT * FROM Wali WHERE id=?").get(row.id));
}
function updateWali(id, body) {
  const row=db.prepare("SELECT * FROM Wali WHERE id=?").get(id);
  if(!row) throw new CashlessError(404,"Akun wali tidak ditemukan.");
  const nama=body.nama??row.nama, hp=body.hp??row.hp, username=body.username??row.username;
  assertUniqueUsername(username,null,id);
  const sets=["nama=@nama","hp=@hp","username=@username"], params={id,nama,hp,username};
  if(body.password){sets.push("password=@password");params.password=bcrypt.hashSync(body.password,10);}
  db.prepare(`UPDATE Wali SET ${sets.join(",")} WHERE id=@id`).run(params);
  return sanitizeWali(db.prepare("SELECT * FROM Wali WHERE id=?").get(id));
}
function deleteWali(id) {
  const row=db.prepare("SELECT * FROM Wali WHERE id=?").get(id);
  if(!row) throw new CashlessError(404,"Akun wali tidak ditemukan.");
  const linked=db.prepare("SELECT COUNT(*) c FROM Santri WHERE waliId=?").get(id).c;
  if(linked) throw new CashlessError(409,`Akun wali masih terhubung ke ${linked} santri. Pindahkan hubungan terlebih dahulu.`);
  db.prepare("DELETE FROM Wali WHERE id=?").run(id);
  return sanitizeWali(row);
}

function upsertSantri(body) {
  const {id,nama}=body;
  if(!id || !nama) throw new CashlessError(400,"id dan nama santri wajib diisi.");
  const existing=db.prepare("SELECT id FROM Santri WHERE id=?").get(id);
  const allowed=["kelas","nis","nisn","waliId",...SANTRI_BIODATA_FIELDS];
  const fields={};
  for(const f of allowed) if(Object.prototype.hasOwnProperty.call(body,f)) fields[f]=body[f] ?? null;
  if(existing){
    const sets=["nama=@nama","updatedAt=datetime('now')"], params={id,nama};
    for(const [k,v] of Object.entries(fields)){sets.push(`${k}=@${k}`);params[k]=k==="riwayatKelas"?JSON.stringify(v||[]):v;}
    db.prepare(`UPDATE Santri SET ${sets.join(",")} WHERE id=@id`).run(params);
  } else {
    const cols=["id","nama","saldo",...Object.keys(fields)], params={id,nama,saldo:0};
    for(const [k,v] of Object.entries(fields)) params[k]=k==="riwayatKelas"?JSON.stringify(v||[]):v;
    db.prepare(`INSERT INTO Santri(${cols.join(",")}) VALUES(${cols.map(c=>"@"+c).join(",")})`).run(params);
  }
  return toPublicSantri(getSantriRow(id));
}
function deleteSantri(id) {
  const row=getSantriRow(id);
  // Protect financial/academic history. Admin should archive/remove through a dedicated workflow later.
  const refs=[
    ["TransaksiCashless","santriId"],["PermintaanBMT","santriId"],["Absensi","santriId"],["Perizinan","santriId"],
    ["Pelanggaran","santriId"],["Nilai","santriId"],["Prestasi","santriId"],["Hafalan","santriId"],["PenilaianUbudiyah","santriId"],["Tagihan","santriId"]
  ];
  const total=refs.reduce((n,[t,c])=>n+db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE ${c}=?`).get(id).c,0);
  if(total) throw new CashlessError(409,"Santri memiliki riwayat transaksi/akademik. Nonaktifkan/arsipkan melalui modul khusus, bukan hapus permanen.");
  db.prepare("DELETE FROM Santri WHERE id=?").run(id);
  return row;
}

module.exports={
  dashboard,listGuru,listWali,listSantri,getConfig,setConfig,
  createGuru,updateGuru,deleteGuru,createWali,updateWali,deleteWali,upsertSantri,deleteSantri,
};
