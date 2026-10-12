require("dotenv").config({ quiet: true });
if (process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
}
const { query, withTransaction } = require("../src/db");
const crypto = require("crypto");

const uid = () => crypto.randomUUID();

const GURU_LIST = [
  { kodeGuru: "G01", nama: "Ust.Abdul Basit, S.H.I M.Pd", keterangan: "" },
  { kodeGuru: "G02", nama: "Ust.Muhamad Ikmalul Ahya", keterangan: "" },
  { kodeGuru: "G03", nama: "Usth.respati novatria dewi", keterangan: "" },
  { kodeGuru: "G04", nama: "Usth.Aliyah fatiyah", keterangan: "" },
  { kodeGuru: "G05", nama: "Usth.Sayati", keterangan: "" },
  { kodeGuru: "G06", nama: "Usth.Julaeha", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G07", nama: "Usth.Resi Erawati", keterangan: "" },
  { kodeGuru: "G08", nama: "Usth.Ria Ananda Apriyani", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G09", nama: "Usth.Nurul Anisa Llp", keterangan: "" },
  { kodeGuru: "G10", nama: "Usth.Lintang Laska Salsabila", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G11", nama: "Usth.Putri Laila Azzahra", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G12", nama: "Usth.Apriliani", keterangan: "" },
  { kodeGuru: "G13", nama: "Usth.Nurul Hamah", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G14", nama: "Usth.Ginayatul Rizqiyah", keterangan: "" },
  { kodeGuru: "G15", nama: "Usth.Nisa Alfia", keterangan: "" },
  { kodeGuru: "G16", nama: "Usth.Khaleda Zia", keterangan: "" },
  { kodeGuru: "G17", nama: "Usth.Windy Gishella Putri", keterangan: "" },
  { kodeGuru: "G18", nama: "Usth.Diva Bunga Aulia", keterangan: "" },
  { kodeGuru: "G19", nama: "Usth.Farisha Rojwa Muchtar", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G20", nama: "Usth.Nezla Kanaya Lintang Alafy", keterangan: "" },
  { kodeGuru: "G21", nama: "Usth.Supriyati", keterangan: "" },
  { kodeGuru: "G22", nama: "Usth.Mufidah Putri Adzahra", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G23", nama: "Usth.Nur Fatihatul Abidah", keterangan: "" },
  { kodeGuru: "G24", nama: "Ust.Juhro", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G25", nama: "Ust.Eriza Briliyan Prasetya", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G26", nama: "Ust.Mad Kopal", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G27", nama: "Ust.Achmad Syechabuddin", keterangan: "GURU HALAQOH" },
  { kodeGuru: "G28", nama: "Ust.Ibnu Aqil", keterangan: "" },
  { kodeGuru: "G29", nama: "Ust.Al-Addin Zakariya", keterangan: "" },
  { kodeGuru: "G30", nama: "Ust.Sultonu Luthfi Al-Jabar", keterangan: "" },
  { kodeGuru: "G31", nama: "Ust.Ananta Fajrif Irawan", keterangan: "" },
  { kodeGuru: "G32", nama: "Ust.Ahmad Muchtar Luthfi", keterangan: "" },
];

const KELAS_LIST = [
  { kodeKelas: "K01", nama: "1", wali: "Usth.Windi Gishela", lokasi: "Maqdis Lt 3" },
  { kodeKelas: "K02", nama: "2", wali: "Usth.Supriyati", lokasi: "teras An nashr (ust ikmal)" },
  { kodeKelas: "K03", nama: "3", wali: "Usth.Nezla Kanaya Lintang Alafy", lokasi: "Maqdis Lt 3" },
  { kodeKelas: "K04", nama: "4", wali: "Usth.Diva Bunga", lokasi: "Maqdis Lt 2" },
  { kodeKelas: "K05", nama: "5", wali: "Usth.Apriliani", lokasi: "Muholla darussalam" },
  { kodeKelas: "K06", nama: "6", wali: "Usth.Putri Laila", lokasi: "teras An nashr (ust aqil)" },
  { kodeKelas: "K07", nama: "7A", wali: "Ust.Al Addin Zakariya", lokasi: "An nashr" },
  { kodeKelas: "K08", nama: "7B", wali: "Uusth.Nisa Alfia", lokasi: "Al fatihah Lt 3" },
  { kodeKelas: "K09", lang: "8A", nama: "8A", wali: "Ust.Eriza Briliyan P", lokasi: "An nashr" },
  { kodeKelas: "K10", nama: "8B", wali: "Usth.Sayati", lokasi: "Al fatihah Lt 3" },
  { kodeKelas: "K11", nama: "9A", wali: "Ust.Ikmalul Ahya", lokasi: "An nashr" },
  { kodeKelas: "K12", nama: "9B", wali: "Usth.Resi Erawati", lokasi: "Aksel" },
  { kodeKelas: "K13", nama: "10", wali: "Ust.Ibnu Aqil", lokasi: "Majlis MA (teras rumah ema)" },
  { kodeKelas: "K14", nama: "11", wali: "Usth.Julaeha", lokasi: "Majlis MA" },
  { kodeKelas: "K15", nama: "12", wali: "Usth.Respati Novatria Dewi", lokasi: "Saung al fatihah" },
];

const MAPEL_LIST = [
  { kodeMapel: "M01", nama: "MAHFUDZOT", kategori: "Diniyah" },
  { kodeMapel: "M02", nama: "B.ARAB", kategori: "Diniyah" },
  { kodeMapel: "M03", nama: "MATEMATIKA", kategori: "Umum" },
  { kodeMapel: "M04", nama: "MEMBACA", kategori: "Umum" },
  { kodeMapel: "M05", nama: "MENULIS", kategori: "Umum" },
  { kodeMapel: "M06", nama: "KETERAMPILAN", kategori: "Umum" },
  { kodeMapel: "M07", nama: "MENGGAMBAR", kategori: "Umum" },
  { kodeMapel: "M08", nama: "FIQH", kategori: "Diniyah" },
  { kodeMapel: "M09", nama: "B.INDONESIA", kategori: "Umum" },
  { kodeMapel: "M10", nama: "AQIDAH AKHLAK", kategori: "Diniyah" },
  { kodeMapel: "M11", nama: "AKHLAK", kategori: "Diniyah" },
  { kodeMapel: "M12", nama: "MENULIS ARAB", kategori: "Diniyah" },
  { kodeMapel: "M13", nama: "MENGARANG", kategori: "Diniyah" },
  { kodeMapel: "M14", nama: "MENULIS AL QURAN", kategori: "Tahfidz" },
  { kodeMapel: "M15", nama: "B. INGRRIS", kategori: "Umum" },
  { kodeMapel: "M16", nama: "PKN", kategori: "Umum" },
  { kodeMapel: "M17", nama: "IPA", kategori: "Umum" },
  { kodeMapel: "M18", nama: "AL QURAN HADIST", kategori: "Diniyah" },
  { kodeMapel: "M19", nama: "TARJAMAH", kategori: "Diniyah" },
  { kodeMapel: "M20", nama: "BERHITUNG", kategori: "Umum" },
  { kodeMapel: "M21", nama: "TAJWID", kategori: "Tahfidz" },
  { kodeMapel: "M22", nama: "HADIST", kategori: "Diniyah" },
];

// Data Grid Baku MMA (360 slots)
// Format per baris: [kelas, hari, jamKe, kodeMapel, kodeGuru, namaMapel, namaGuru]
const JADWAL_RAW = [
  // SENIN
  ["1","Senin",1,"M01","G12","MAHFUDZOT","Usth.Apriliani"],
  ["1","Senin",2,"M01","G12","MAHFUDZOT","Usth.Apriliani"],
  ["1","Senin",3,"M04","G17","MEMBACA","Usth.Windy Gishella Putri"],
  ["1","Senin",4,"M04","G17","MEMBACA","Usth.Windy Gishella Putri"],
  ["2","Senin",1,"M04","G04","MEMBACA","Usth.Aliyah fatiyah"],
  ["2","Senin",2,"M04","G04","MEMBACA","Usth.Aliyah fatiyah"],
  ["2","Senin",3,"M02","G18","B.ARAB","Usth.Diva Bunga Aulia"],
  ["2","Senin",4,"M02","G18","B.ARAB","Usth.Diva Bunga Aulia"],
  ["3","Senin",1,"M02","G30","B.ARAB","Ust.Sultonu Luthfi Al-Jabar"],
  ["3","Senin",2,"M02","G30","B.ARAB","Ust.Sultonu Luthfi Al-Jabar"],
  ["3","Senin",3,"M08","G20","FIQH","Usth.Nezla Kanaya Lintang Alafy"],
  ["3","Senin",4,"M08","G20","FIQH","Usth.Nezla Kanaya Lintang Alafy"],
  ["4","Senin",1,"M01","G16","MAHFUDZOT","Usth.Khaleda Zia"],
  ["4","Senin",2,"M01","G16","MAHFUDZOT","Usth.Khaleda Zia"],
  ["4","Senin",3,"M14","G07","MENULIS AL QURAN","Usth.Resi Erawati"],
  ["4","Senin",4,"M14","G07","MENULIS AL QURAN","Usth.Resi Erawati"],
  ["5","Senin",1,"M03","G11","MATEMATIKA","Usth.Putri Laila Azzahra"],
  ["5","Senin",2,"M03","G11","MATEMATIKA","Usth.Putri Laila Azzahra"],
  ["5","Senin",3,"M17","G25","IPA","Ust.Eriza Briliyan Prasetya"],
  ["5","Senin",4,"M17","G25","IPA","Ust.Eriza Briliyan Prasetya"],
  ["6","Senin",1,"M15","G18","B. INGRRIS","Usth.Diva Bunga Aulia"],
  ["6","Senin",2,"M15","G18","B. INGRRIS","Usth.Diva Bunga Aulia"],
  ["6","Senin",3,"M06","G23","KETERAMPILAN","Usth.Nur Fatihatul Abidah"],
  ["6","Senin",4,"M06","G23","KETERAMPILAN","Usth.Nur Fatihatul Abidah"],
  ["7A","Senin",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7A","Senin",2,"M08","G31","FIQH","Ust.Ananta Fajrif Irawan"],
  ["7A","Senin",3,"M03","G29","MATEMATIKA","Ust.Al-Addin Zakariya"],
  ["7A","Senin",4,"M03","G29","MATEMATIKA","Ust.Al-Addin Zakariya"],
  ["7B","Senin",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7B","Senin",2,"M21","G13","TAJWID","Usth.Nurul Hamah"],
  ["7B","Senin",3,"M19","G14","TARJAMAH","Usth.Ginayatul Rizqiyah"],
  ["7B","Senin",4,"M19","G14","TARJAMAH","Usth.Ginayatul Rizqiyah"],
  ["8A","Senin",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8A","Senin",2,"M14","G25","MENULIS AL QURAN","Ust.Eriza Briliyan Prasetya"],
  ["8A","Senin",3,"M20","G28","BERHITUNG","Ust.Ibnu Aqil"],
  ["8A","Senin",4,"M20","G28","BERHITUNG","Ust.Ibnu Aqil"],
  ["8B","Senin",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8B","Senin",2,"M08","G07","FIQH","Usth.Resi Erawati"],
  ["8B","Senin",3,"M22","G08","HADIST","Usth.Ria Ananda Apriyani"],
  ["8B","Senin",4,"M22","G08","HADIST","Usth.Ria Ananda Apriyani"],
  ["9A","Senin",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Senin",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Senin",3,"M02","G02","B.ARAB","Ust.Muhamad Ikmalul Ahya"],
  ["9A","Senin",4,"M02","G02","B.ARAB","Ust.Muhamad Ikmalul Ahya"],
  ["9B","Senin",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Senin",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Senin",3,"M02","G10","B.ARAB","Usth.Lintang Laska Salsabila"],
  ["9B","Senin",4,"M02","G10","B.ARAB","Usth.Lintang Laska Salsabila"],
  ["10","Senin",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Senin",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Senin",3,"M15","G32","B. INGRRIS","Ust.Ahmad Muchtar Luthfi"],
  ["10","Senin",4,"M08","G06","FIQH","Usth.Julaeha"],
  ["11","Senin",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Senin",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Senin",3,"M02","G04","B.ARAB","Usth.Aliyah fatiyah"],
  ["11","Senin",4,"M02","G04","B.ARAB","Usth.Aliyah fatiyah"],
  ["12","Senin",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Senin",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Senin",3,"M01","G03","MAHFUDZOT","Usth.respati novatria dewi"],
  ["12","Senin",4,"M19","G13","TARJAMAH","Usth.Nurul Hamah"],

  // SELASA
  ["1","Selasa",1,"M02","G18","B.ARAB","Usth.Diva Bunga Aulia"],
  ["1","Selasa",2,"M02","G18","B.ARAB","Usth.Diva Bunga Aulia"],
  ["1","Selasa",3,"M05","G21","MENULIS","Usth.Supriyati"],
  ["1","Selasa",4,"M05","G21","MENULIS","Usth.Supriyati"],
  ["2","Selasa",1,"M01","G20","MAHFUDZOT","Usth.Nezla Kanaya Lintang Alafy"],
  ["2","Selasa",2,"M01","G20","MAHFUDZOT","Usth.Nezla Kanaya Lintang Alafy"],
  ["2","Selasa",3,"M05","G12","MENULIS","Usth.Apriliani"],
  ["2","Selasa",4,"M05","G12","MENULIS","Usth.Apriliani"],
  ["3","Selasa",1,"M03","G29","MATEMATIKA","Ust.Al-Addin Zakariya"],
  ["3","Selasa",2,"M03","G29","MATEMATIKA","Ust.Al-Addin Zakariya"],
  ["3","Selasa",3,"M12","G31","MENULIS ARAB","Ust.Ananta Fajrif Irawan"],
  ["3","Selasa",4,"M12","G31","MENULIS ARAB","Ust.Ananta Fajrif Irawan"],
  ["4","Selasa",1,"M02","G27","B.ARAB","Ust.Achmad Syechabuddin"],
  ["4","Selasa",2,"M02","G27","B.ARAB","Ust.Achmad Syechabuddin"],
  ["4","Selasa",3,"M06","G15","KETERAMPILAN","Usth.Nisa Alfia"],
  ["4","Selasa",4,"M06","G15","KETERAMPILAN","Usth.Nisa Alfia"],
  ["5","Selasa",1,"M19","G19","TARJAMAH","Usth.Farisha Rojwa Muchtar"],
  ["5","Selasa",2,"M19","G19","TARJAMAH","Usth.Farisha Rojwa Muchtar"],
  ["5","Selasa",3,"M15","G09","B. INGRRIS","Usth.Nurul Anisa Llp"],
  ["5","Selasa",4,"M15","G09","B. INGRRIS","Usth.Nurul Anisa Llp"],
  ["6","Selasa",1,"M03","G28","MATEMATIKA","Ust.Ibnu Aqil"],
  ["6","Selasa",2,"M03","G28","MATEMATIKA","Ust.Ibnu Aqil"],
  ["6","Selasa",3,"M17","G18","IPA","Usth.Diva Bunga Aulia"],
  ["6","Selasa",4,"M17","G18","IPA","Usth.Diva Bunga Aulia"],
  ["7A","Selasa",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7A","Selasa",2,"M14","G30","MENULIS AL QURAN","Ust.Sultonu Luthfi Al-Jabar"],
  ["7A","Selasa",3,"M02","G28","B.ARAB","Ust.Ibnu Aqil"],
  ["7A","Selasa",4,"M02","G28","B.ARAB","Ust.Ibnu Aqil"],
  ["7B","Selasa",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7B","Selasa",2,"M14","G15","MENULIS AL QURAN","Usth.Nisa Alfia"],
  ["7B","Selasa",3,"M02","G04","B.ARAB","Usth.Aliyah fatiyah"],
  ["7B","Selasa",4,"M02","G04","B.ARAB","Usth.Aliyah fatiyah"],
  ["8A","Selasa",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8A","Selasa",2,"M03","G25","MATEMATIKA","Ust.Eriza Briliyan Prasetya"],
  ["8A","Selasa",3,"M15","G30","B. INGRRIS","Ust.Sultonu Luthfi Al-Jabar"],
  ["8A","Selasa",4,"M15","G30","B. INGRRIS","Ust.Sultonu Luthfi Al-Jabar"],
  ["8B","Selasa",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8B","Selasa",2,"M03","G05","MATEMATIKA","Usth.Sayati"],
  ["8B","Selasa",3,"M15","G20","B. INGRRIS","Usth.Nezla Kanaya Lintang Alafy"],
  ["8B","Selasa",4,"M15","G20","B. INGRRIS","Usth.Nezla Kanaya Lintang Alafy"],
  ["9A","Selasa",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Selasa",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Selasa",3,"M03","G29","MATEMATIKA","Ust.Al-Addin Zakariya"],
  ["9A","Selasa",4,"M03","G29","MATEMATIKA","Ust.Al-Addin Zakariya"],
  ["9B","Selasa",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Selasa",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Selasa",3,"M03","G16","MATEMATIKA","Usth.Khaleda Zia"],
  ["9B","Selasa",4,"M03","G16","MATEMATIKA","Usth.Khaleda Zia"],
  ["10","Selasa",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Selasa",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Selasa",3,"M01","G26","MAHFUDZOT","Ust.Mad Kopal"],
  ["10","Selasa",4,"M14","G26","MENULIS AL QURAN","Ust.Mad Kopal"],
  ["11","Selasa",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Selasa",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Selasa",3,"M08","G19","FIQH","Usth.Farisha Rojwa Muchtar"],
  ["11","Selasa",4,"M19","G17","TARJAMAH","Usth.Windy Gishella Putri"],
  ["12","Selasa",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Selasa",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Selasa",3,"M03","G05","MATEMATIKA","Usth.Sayati"],
  ["12","Selasa",4,"M03","G05","MATEMATIKA","Usth.Sayati"],

  // RABU
  ["1","Rabu",1,"M03","G15","MATEMATIKA","Usth.Nisa Alfia"],
  ["1","Rabu",2,"M03","G15","MATEMATIKA","Usth.Nisa Alfia"],
  ["1","Rabu",3,"M05","G21","MENULIS","Usth.Supriyati"],
  ["1","Rabu",4,"M05","G21","MENULIS","Usth.Supriyati"],
  ["2","Rabu",1,"M10","G14","AQIDAH AKHLAK","Usth.Ginayatul Rizqiyah"],
  ["2","Rabu",2,"M07","G14","MENGGAMBAR","Usth.Ginayatul Rizqiyah"],
  ["2","Rabu",3,"M02","G18","B.ARAB","Usth.Diva Bunga Aulia"],
  ["2","Rabu",4,"M02","G18","B.ARAB","Usth.Diva Bunga Aulia"],
  ["3","Rabu",1,"M02","G30","B.ARAB","Ust.Sultonu Luthfi Al-Jabar"],
  ["3","Rabu",2,"M02","G30","B.ARAB","Ust.Sultonu Luthfi Al-Jabar"],
  ["3","Rabu",3,"M11","G23","AKHLAK","Usth.Nur Fatihatul Abidah"],
  ["3","Rabu",4,"M11","G23","AKHLAK","Usth.Nur Fatihatul Abidah"],
  ["4","Rabu",1,"M03","G23","MATEMATIKA","Usth.Nur Fatihatul Abidah"],
  ["4","Rabu",2,"M03","G23","MATEMATIKA","Usth.Nur Fatihatul Abidah"],
  ["4","Rabu",3,"M09","G20","B.INDONESIA","Usth.Nezla Kanaya Lintang Alafy"],
  ["4","Rabu",4,"M09","G20","B.INDONESIA","Usth.Nezla Kanaya Lintang Alafy"],
  ["5","Rabu",1,"M01","G20","MAHFUDZOT","Usth.Nezla Kanaya Lintang Alafy"],
  ["5","Rabu",2,"M01","G20","MAHFUDZOT","Usth.Nezla Kanaya Lintang Alafy"],
  ["5","Rabu",3,"M14","G12","MENULIS AL QURAN","Usth.Apriliani"],
  ["5","Rabu",4,"M14","G12","MENULIS AL QURAN","Usth.Apriliani"],
  ["6","Rabu",1,"M19","G16","TARJAMAH","Usth.Khaleda Zia"],
  ["6","Rabu",2,"M19","G16","TARJAMAH","Usth.Khaleda Zia"],
  ["6","Rabu",3,"M03","G28","MATEMATIKA","Ust.Ibnu Aqil"],
  ["6","Rabu",4,"M03","G28","MATEMATIKA","Ust.Ibnu Aqil"],
  ["7A","Rabu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7A","Rabu",2,"M22","G02","HADIST","Ust.Muhamad Ikmalul Ahya"],
  ["7A","Rabu",3,"M20","G27","BERHITUNG","Ust.Achmad Syechabuddin"],
  ["7A","Rabu",4,"M20","G27","BERHITUNG","Ust.Achmad Syechabuddin"],
  ["7B","Rabu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7B","Rabu",2,"M22","G08","HADIST","Usth.Ria Ananda Apriyani"],
  ["7B","Rabu",3,"M20","G11","BERHITUNG","Usth.Putri Laila Azzahra"],
  ["7B","Rabu",4,"M20","G11","BERHITUNG","Usth.Putri Laila Azzahra"],
  ["8A","Rabu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8A","Rabu",2,"M08","G24","FIQH","Ust.Juhro"],
  ["8A","Rabu",3,"M01","G02","MAHFUDZOT","Ust.Muhamad Ikmalul Ahya"],
  ["8A","Rabu",4,"M01","G02","MAHFUDZOT","Ust.Muhamad Ikmalul Ahya"],
  ["8B","Rabu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8B","Rabu",2,"M14","G05","MENULIS AL QURAN","Usth.Sayati"],
  ["8B","Rabu",3,"M01","G03","MAHFUDZOT","Usth.respati novatria dewi"],
  ["8B","Rabu",4,"M01","G03","MAHFUDZOT","Usth.respati novatria dewi"],
  ["9A","Rabu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Rabu",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Rabu",3,"M01","G26","MAHFUDZOT","Ust.Mad Kopal"],
  ["9A","Rabu",4,"M14","G26","MENULIS AL QURAN","Ust.Mad Kopal"],
  ["9B","Rabu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Rabu",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Rabu",3,"M01","G08","MAHFUDZOT","Usth.Ria Ananda Apriyani"],
  ["9B","Rabu",4,"M14","G16","MENULIS AL QURAN","Usth.Khaleda Zia"],
  ["10","Rabu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Rabu",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Rabu",3,"M22","G16","HADIST","Usth.Khaleda Zia"],
  ["10","Rabu",4,"M19","G14","TARJAMAH","Usth.Ginayatul Rizqiyah"],
  ["11","Rabu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Rabu",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Rabu",3,"M03","G05","MATEMATIKA","Usth.Sayati"],
  ["11","Rabu",4,"M03","G05","MATEMATIKA","Usth.Sayati"],
  ["12","Rabu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Rabu",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Rabu",3,"M15","G32","B. INGRRIS","Ust.Ahmad Muchtar Luthfi"],
  ["12","Rabu",4,"M22","G01","HADIST","Ust.Abdul Basit, S.H.I M.Pd"],

  // KAMIS
  ["1","Kamis",1,"M04","G17","MEMBACA","Usth.Windy Gishella Putri"],
  ["1","Kamis",2,"M04","G17","MEMBACA","Usth.Windy Gishella Putri"],
  ["1","Kamis",3,"M06","G22","KETERAMPILAN","Usth.Mufidah Putri Adzahra"],
  ["1","Kamis",4,"M06","G22","KETERAMPILAN","Usth.Mufidah Putri Adzahra"],
  ["2","Kamis",1,"M03","G22","MATEMATIKA","Usth.Mufidah Putri Adzahra"],
  ["2","Kamis",2,"M03","G22","MATEMATIKA","Usth.Mufidah Putri Adzahra"],
  ["2","Kamis",3,"M06","G23","KETERAMPILAN","Usth.Nur Fatihatul Abidah"],
  ["2","Kamis",4,"M06","G23","KETERAMPILAN","Usth.Nur Fatihatul Abidah"],
  ["3","Kamis",1,"M03","G29","MATEMATIKA","Ust.Al-Addin Zakariya"],
  ["3","Kamis",2,"M03","G29","MATEMATIKA","Ust.Al-Addin Zakariya"],
  ["3","Kamis",3,"M07","G20","MENGGAMBAR","Usth.Nezla Kanaya Lintang Alafy"],
  ["3","Kamis",4,"M07","G20","MENGGAMBAR","Usth.Nezla Kanaya Lintang Alafy"],
  ["4","Kamis",1,"M15","G16","B. INGRRIS","Usth.Khaleda Zia"],
  ["4","Kamis",2,"M15","G16","B. INGRRIS","Usth.Khaleda Zia"],
  ["4","Kamis",3,"M08","G06","FIQH","Usth.Julaeha"],
  ["4","Kamis",4,"M08","G06","FIQH","Usth.Julaeha"],
  ["5","Kamis",1,"M03","G11","MATEMATIKA","Usth.Putri Laila Azzahra"],
  ["5","Kamis",2,"M03","G11","MATEMATIKA","Usth.Putri Laila Azzahra"],
  ["5","Kamis",3,"M06","G12","KETERAMPILAN","Usth.Apriliani"],
  ["5","Kamis",4,"M06","G12","KETERAMPILAN","Usth.Apriliani"],
  ["6","Kamis",1,"M02","G30","B.ARAB","Ust.Sultonu Luthfi Al-Jabar"],
  ["6","Kamis",2,"M02","G30","B.ARAB","Ust.Sultonu Luthfi Al-Jabar"],
  ["6","Kamis",3,"M08","G13","FIQH","Usth.Nurul Hamah"],
  ["6","Kamis",4,"M10","G17","AQIDAH AKHLAK","Usth.Windy Gishella Putri"],
  ["7A","Kamis",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7A","Kamis",2,"M21","G24","TAJWID","Ust.Juhro"],
  ["7A","Kamis",3,"M13","G29","MENGARANG","Ust.Al-Addin Zakariya"],
  ["7A","Kamis",4,"M13","G29","MENGARANG","Ust.Al-Addin Zakariya"],
  ["7B","Kamis",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7B","Kamis",2,"M08","G06","FIQH","Usth.Julaeha"],
  ["7B","Kamis",3,"M13","G09","MENGARANG","Usth.Nurul Anisa Llp"],
  ["7B","Kamis",4,"M13","G09","MENGARANG","Usth.Nurul Anisa Llp"],
  ["8A","Kamis",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8A","Kamis",2,"M03","G25","MATEMATIKA","Ust.Eriza Briliyan Prasetya"],
  ["8A","Kamis",3,"M02","G26","B.ARAB","Ust.Mad Kopal"],
  ["8A","Kamis",4,"M02","G26","B.ARAB","Ust.Mad Kopal"],
  ["8B","Kamis",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8B","Kamis",2,"M03","G05","MATEMATIKA","Usth.Sayati"],
  ["8B","Kamis",3,"M02","G18","B.ARAB","Usth.Diva Bunga Aulia"],
  ["8B","Kamis",4,"M02","G18","B.ARAB","Usth.Diva Bunga Aulia"],
  ["9A","Kamis",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Kamis",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Kamis",3,"M08","G24","FIQH","Ust.Juhro"],
  ["9A","Kamis",4,"M15","G30","B. INGRRIS","Ust.Sultonu Luthfi Al-Jabar"],
  ["9B","Kamis",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Kamis",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Kamis",3,"M08","G07","FIQH","Usth.Resi Erawati"],
  ["9B","Kamis",4,"M15","G08","B. INGRRIS","Usth.Ria Ananda Apriyani"],
  ["10","Kamis",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Kamis",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Kamis",3,"M03","G28","MATEMATIKA","Ust.Ibnu Aqil"],
  ["10","Kamis",4,"M03","G28","MATEMATIKA","Ust.Ibnu Aqil"],
  ["11","Kamis",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Kamis",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Kamis",3,"M01","G03","MAHFUDZOT","Usth.respati novatria dewi"],
  ["11","Kamis",4,"M15","G32","B. INGRRIS","Ust.Ahmad Muchtar Luthfi"],
  ["12","Kamis",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Kamis",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Kamis",3,"M02","G04","B.ARAB","Usth.Aliyah fatiyah"],
  ["12","Kamis",4,"M02","G04","B.ARAB","Usth.Aliyah fatiyah"],

  // JUMAT
  ["1","Jumat",1,"M03","G15","MATEMATIKA","Usth.Nisa Alfia"],
  ["1","Jumat",2,"M03","G15","MATEMATIKA","Usth.Nisa Alfia"],
  ["1","Jumat",3,"M04","G17","MEMBACA","Usth.Windy Gishella Putri"],
  ["1","Jumat",4,"M04","G17","MEMBACA","Usth.Windy Gishella Putri"],
  ["2","Jumat",1,"M08","G14","FIQH","Usth.Ginayatul Rizqiyah"],
  ["2","Jumat",2,"M08","G14","FIQH","Usth.Ginayatul Rizqiyah"],
  ["2","Jumat",3,"M09","G23","B.INDONESIA","Usth.Nur Fatihatul Abidah"],
  ["2","Jumat",4,"M09","G23","B.INDONESIA","Usth.Nur Fatihatul Abidah"],
  ["3","Jumat",1,"M01","G17","MAHFUDZOT","Usth.Windy Gishella Putri"],
  ["3","Jumat",2,"M01","G17","MAHFUDZOT","Usth.Windy Gishella Putri"],
  ["3","Jumat",3,"M06","G18","KETERAMPILAN","Usth.Diva Bunga Aulia"],
  ["3","Jumat",4,"M06","G18","KETERAMPILAN","Usth.Diva Bunga Aulia"],
  ["4","Jumat",1,"M03","G23","MATEMATIKA","Usth.Nur Fatihatul Abidah"],
  ["4","Jumat",2,"M03","G23","MATEMATIKA","Usth.Nur Fatihatul Abidah"],
  ["4","Jumat",3,"M07","G07","MENGGAMBAR","Usth.Resi Erawati"],
  ["4","Jumat",4,"M07","G07","MENGGAMBAR","Usth.Resi Erawati"],
  ["5","Jumat",1,"M02","G05","B.ARAB","Usth.Sayati"],
  ["5","Jumat",2,"M02","G05","B.ARAB","Usth.Sayati"],
  ["5","Jumat",3,"M08","G13","FIQH","Usth.Nurul Hamah"],
  ["5","Jumat",4,"M18","G13","AL QURAN HADIST","Usth.Nurul Hamah"],
  ["6","Jumat",1,"M01","G06","MAHFUDZOT","Usth.Julaeha"],
  ["6","Jumat",2,"M01","G06","MAHFUDZOT","Usth.Julaeha"],
  ["6","Jumat",3,"M16","G15","PKN","Usth.Nisa Alfia"],
  ["6","Jumat",4,"M13","G15","MENGARANG","Usth.Nisa Alfia"],
  ["7A","Jumat",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7A","Jumat",2,"M01","G29","MAHFUDZOT","Ust.Al-Addin Zakariya"],
  ["7A","Jumat",3,"M15","G02","B. INGRRIS","Ust.Muhamad Ikmalul Ahya"],
  ["7A","Jumat",4,"M15","G02","B. INGRRIS","Ust.Muhamad Ikmalul Ahya"],
  ["7B","Jumat",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7B","Jumat",2,"M01","G07","MAHFUDZOT","Usth.Resi Erawati"],
  ["7B","Jumat",3,"M15","G14","B. INGRRIS","Usth.Ginayatul Rizqiyah"],
  ["7B","Jumat",4,"M15","G14","B. INGRRIS","Usth.Ginayatul Rizqiyah"],
  ["8A","Jumat",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8A","Jumat",2,"M13","G31","MENGARANG","Ust.Ananta Fajrif Irawan"],
  ["8A","Jumat",3,"M19","G25","TARJAMAH","Ust.Eriza Briliyan Prasetya"],
  ["8A","Jumat",4,"M19","G25","TARJAMAH","Ust.Eriza Briliyan Prasetya"],
  ["8B","Jumat",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8B","Jumat",2,"M13","G09","MENGARANG","Usth.Nurul Anisa Llp"],
  ["8B","Jumat",3,"M19","G12","TARJAMAH","Usth.Apriliani"],
  ["8B","Jumat",4,"M19","G12","TARJAMAH","Usth.Apriliani"],
  ["9A","Jumat",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Jumat",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9A","Jumat",3,"M19","G27","TARJAMAH","Ust.Achmad Syechabuddin"],
  ["9A","Jumat",4,"M22","G30","HADIST","Ust.Sultonu Luthfi Al-Jabar"],
  ["9B","Jumat",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Jumat",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["9B","Jumat",3,"M19","G10","TARJAMAH","Usth.Lintang Laska Salsabila"],
  ["9B","Jumat",4,"M22","G10","HADIST","Usth.Lintang Laska Salsabila"],
  ["10","Jumat",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Jumat",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["10","Jumat",3,"M02","G04","B.ARAB","Usth.Aliyah fatiyah"],
  ["10","Jumat",4,"M02","G04","B.ARAB","Usth.Aliyah fatiyah"],
  ["11","Jumat",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Jumat",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["11","Jumat",3,"M14","G30","MENULIS AL QURAN","Ust.Sultonu Luthfi Al-Jabar"],
  ["11","Jumat",4,"M21","G31","TAJWID","Ust.Ananta Fajrif Irawan"],
  ["12","Jumat",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Jumat",2,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["12","Jumat",3,"M08","G05","FIQH","Usth.Sayati"],
  ["12","Jumat",4,"M14","G05","MENULIS AL QURAN","Usth.Sayati"],

  // SABTU
  ["1","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["1","Sabtu",2,"M07","G17","MENGGAMBAR","Usth.Windy Gishella Putri"],
  ["1","Sabtu",3,"M05","G21","MENULIS","Usth.Supriyati"],
  ["1","Sabtu",4,"M05","G21","MENULIS","Usth.Supriyati"],
  ["2","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["2","Sabtu",2,"M04","G04","MEMBACA","Usth.Aliyah fatiyah"],
  ["2","Sabtu",3,"M03","G23","MATEMATIKA","Usth.Nur Fatihatul Abidah"],
  ["2","Sabtu",4,"M03","G23","MATEMATIKA","Usth.Nur Fatihatul Abidah"],
  ["3","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["3","Sabtu",2,"M13","G22","MENGARANG","Usth.Mufidah Putri Adzahra"],
  ["3","Sabtu",3,"M09","G07","B.INDONESIA","Usth.Resi Erawati"],
  ["3","Sabtu",4,"M09","G07","B.INDONESIA","Usth.Resi Erawati"],
  ["4","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["4","Sabtu",2,"M13","G15","MENGARANG","Usth.Nisa Alfia"],
  ["4","Sabtu",3,"M10","G20","AQIDAH AKHLAK","Usth.Nezla Kanaya Lintang Alafy"],
  ["4","Sabtu",4,"M10","G20","AQIDAH AKHLAK","Usth.Nezla Kanaya Lintang Alafy"],
  ["5","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["5","Sabtu",2,"M13","G12","MENGARANG","Usth.Apriliani"],
  ["5","Sabtu",3,"M10","G17","AQIDAH AKHLAK","Usth.Windy Gishella Putri"],
  ["5","Sabtu",4,"M16","G17","PKN","Usth.Windy Gishella Putri"],
  ["6","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["6","Sabtu",2,"M18","G30","AL QURAN HADIST","Ust.Sultonu Luthfi Al-Jabar"],
  ["6","Sabtu",3,"M14","G30","MENULIS AL QURAN","Ust.Sultonu Luthfi Al-Jabar"],
  ["6","Sabtu",4,"M14","G30","MENULIS AL QURAN","Ust.Sultonu Luthfi Al-Jabar"],
  ["7A","Sabtu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7A","Sabtu",2,"M01","G29","MAHFUDZOT","Ust.Al-Addin Zakariya"],
  ["7A","Sabtu",3,"M19","G28","TARJAMAH","Ust.Ibnu Aqil"],
  ["7A","Sabtu",4,"M19","G28","TARJAMAH","Ust.Ibnu Aqil"],
  ["7B","Sabtu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["7B","Sabtu",2,"M01","G07","MAHFUDZOT","Usth.Resi Erawati"],
  ["7B","Sabtu",3,"M03","G15","MATEMATIKA","Usth.Nisa Alfia"],
  ["7B","Sabtu",4,"M03","G15","MATEMATIKA","Usth.Nisa Alfia"],
  ["8A","Sabtu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8A","Sabtu",2,"M13","G27","MENGARANG","Ust.Achmad Syechabuddin"],
  ["8A","Sabtu",3,"M22","G24","HADIST","Ust.Juhro"],
  ["8A","Sabtu",4,"M22","G24","HADIST","Ust.Juhro"],
  ["8B","Sabtu",1,"HALAQOH TAHFIDZ","","HALAQOH TAHFIDZ",""],
  ["8B","Sabtu",2,"M13","G09","MENGARANG","Usth.Nurul Anisa Llp"],
  ["8B","Sabtu",3,"M20","G12","BERHITUNG","Usth.Apriliani"],
  ["8B","Sabtu",4,"M20","G12","BERHITUNG","Usth.Apriliani"],
  ["9A","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["9A","Sabtu",2,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["9A","Sabtu",3,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["9A","Sabtu",4,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["9B","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["9B","Sabtu",2,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["9B","Sabtu",3,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["9B","Sabtu",4,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["10","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["10","Sabtu",2,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["10","Sabtu",3,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["10","Sabtu",4,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["11","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["11","Sabtu",2,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["11","Sabtu",3,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["11","Sabtu",4,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["12","Sabtu",1,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["12","Sabtu",2,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["12","Sabtu",3,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
  ["12","Sabtu",4,"PROGRAM UNGGULAN","","PROGRAM UNGGULAN",""],
];

async function seedJadwalBakuMMA() {
  console.log("=== MEMULAI SINKRONISASI JADWAL BAKU MMA ===");

  await withTransaction(async (client) => {
    // 1. Sinkronisasi Data Guru (32 Guru)
    console.log("1. Menyinkronkan 32 Data Guru...");
    for (const g of GURU_LIST) {
      const existing = await client.query('SELECT "id" FROM "MasterGuru" WHERE "nama" = $1 OR "kodeGuru" = $2', [g.nama, g.kodeGuru]);
      if (existing.rowCount) {
        await client.query('UPDATE "MasterGuru" SET "kodeGuru" = $1, "keterangan" = $2 WHERE "id" = $3', [g.kodeGuru, g.keterangan || null, existing.rows[0].id]);
      } else {
        await client.query(`
          INSERT INTO "MasterGuru" ("id", "kodeGuru", "nama", "keterangan", "statusKepegawaian", "statusAktif", "jenisKelamin")
          VALUES ($1, $2, $3, $4, 'Tetap', 'Aktif', $5)
        `, [uid(), g.kodeGuru, g.nama, g.keterangan || null, g.nama.startsWith("Usth") ? "P" : "L"]);
      }
    }

    // 2. Sinkronisasi Data Mapel (22 Mapel)
    console.log("2. Menyinkronkan 22 Data Mata Pelajaran...");
    for (const m of MAPEL_LIST) {
      await client.query(`
        INSERT INTO "MasterMapel" ("id", "kodeMapel", "nama", "kategori", "kkm", "aktif")
        VALUES ($1, $2, $3, $4, 75, TRUE)
        ON CONFLICT ("kodeMapel")
        DO UPDATE SET "nama" = EXCLUDED."nama", "kategori" = EXCLUDED."kategori"
      `, [uid(), m.kodeMapel, m.nama, m.kategori]);
    }

    // 3. Sinkronisasi Data Kelas (15 Kelas dengan Lokasi & Wali Kelas)
    console.log("3. Menyinkronkan 15 Kelas & Lokasi...");
    for (const k of KELAS_LIST) {
      // Cari ID guru wali kelas jika ada
      let waliId = null;
      if (k.wali) {
        const gRow = await client.query('SELECT "id" FROM "MasterGuru" WHERE LOWER("nama") LIKE $1', [`%${k.wali.toLowerCase().trim()}%`]);
        if (gRow.rowCount) waliId = gRow.rows[0].id;
      }

      await client.query(`
        INSERT INTO "MasterKelas" ("id", "nama", "lokasiKelas", "waliKelasId")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ("nama")
        DO UPDATE SET "lokasiKelas" = EXCLUDED."lokasiKelas", "waliKelasId" = COALESCE(EXCLUDED."waliKelasId", "MasterKelas"."waliKelasId")
      `, [uid(), k.nama, k.lokasi, waliId]);
    }

    // 4. Sinkronisasi 360 Slot Jadwal KBM (Grid Lengkap Anti-Bentrok)
    console.log(`4. Menyinkronkan ${JADWAL_RAW.length} Slot Jadwal KBM...`);
    for (const s of JADWAL_RAW) {
      const [kelas, hari, jamKe, kodeMapel, kodeGuru, namaMapel, namaGuru] = s;
      const id = uid();
      await client.query(`
        INSERT INTO "JadwalKBM" (
          "id", "hari", "jamKe", "kelas", "kodeMapel", "namaMapel", "kodeGuru", "namaGuru",
          "tahunAjaran", "semester", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, '2026/2027', 'Ganjil',
          to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
        ON CONFLICT ("hari", "jamKe", "kelas", "tahunAjaran", "semester")
        DO UPDATE SET
          "kodeMapel" = EXCLUDED."kodeMapel",
          "namaMapel" = EXCLUDED."namaMapel",
          "kodeGuru" = EXCLUDED."kodeGuru",
          "namaGuru" = EXCLUDED."namaGuru",
          "updatedAt" = EXCLUDED."updatedAt"
      `, [
        id, hari, jamKe, kelas,
        kodeMapel || null, namaMapel || null,
        kodeGuru || null, namaGuru || null,
      ]);
    }
  });

  console.log("=== SINKRONISASI JADWAL BAKU MMA BERHASIL 100%! ===");
}

module.exports = {
  GURU_LIST,
  KELAS_LIST,
  MAPEL_LIST,
  JADWAL_RAW,
  seedJadwalBakuMMA,
};

if (require.main === module) {
  require("dotenv").config({ quiet: true });
  const { pool, initializeDatabase } = require("../src/db");
  initializeDatabase()
    .then(() => seedJadwalBakuMMA())
    .then(() => {
      console.log("Selesai!");
      return pool.end();
    })
    .catch((err) => {
      console.error("Gagal seed:", err);
      process.exit(1);
    });
}
