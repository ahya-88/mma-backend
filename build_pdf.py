import os
from fpdf import FPDF
from fpdf.enums import XPos, YPos

class PDFGuide(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "B", 8)
            self.set_text_color(100, 116, 139)
            self.cell(0, 8, "PANDUAN LENGKAP APLIKASI CASHLESS & MANAJEMEN MA'HAD MUDAIYATUL ANWAR", border=0, new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")
            self.cell(0, 8, f"Halaman {self.page_no()}", border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")
            self.set_draw_color(203, 213, 225)
            self.line(12, 16, 198, 16)
            self.ln(4)

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(148, 163, 184)
        self.cell(0, 8, "Ma'had Mudaiyatul Anwar - Dokumen Operasional Internal & Panduan Pengguna Lengkap", align="C")

def create_guide_pdf(filename="Panduan_Penggunaan_Aplikasi_MMA.pdf"):
    pdf = PDFGuide(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(12, 16, 12)

    pdf.add_page()

    # Title Banner (Cover / Page 1)
    pdf.set_fill_color(12, 74, 110) # #0C4A6E
    pdf.rect(12, 16, 186, 32, style="F")

    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(255, 255, 255)
    pdf.set_y(21)
    pdf.cell(0, 8, "PANDUAN LENGKAP PENGGUNAAN APLIKASI MMA", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
    pdf.set_font("Helvetica", "", 10.5)
    pdf.cell(0, 6, "Sistem Cashless BMT, Keuangan, Unit Usaha, & Operasional Pesantren", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(186, 230, 253)
    pdf.cell(0, 6, "Ma'had Mudaiyatul Anwar - Mudah Dipahami & Gampang Diingat", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")

    pdf.set_y(52)

    # Helper Functions
    def section_h1(title):
        pdf.ln(3)
        pdf.set_fill_color(241, 245, 249)
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(0, 8, f"  {title}", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_draw_color(2, 132, 199)
        pdf.line(12, pdf.get_y(), 198, pdf.get_y())
        pdf.ln(2)

    def section_h2(title):
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_text_color(3, 105, 161)
        pdf.cell(0, 6, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(1)

    def p(text):
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(51, 65, 85)
        pdf.multi_cell(0, 4.8, text)
        pdf.ln(1.5)

    def bullet(title, desc):
        pdf.set_font("Helvetica", "B", 9.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(6, 4.8, " - ", align="R")
        pdf.cell(46, 4.8, f" {title}:", align="L")
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(51, 65, 85)
        pdf.multi_cell(0, 4.8, desc)
        pdf.ln(1)

    def info_box(text, title="CATATAN PENTING & RUMUS CEPAT"):
        pdf.ln(2)
        pdf.set_fill_color(240, 249, 255)
        pdf.set_draw_color(186, 230, 253)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(3, 105, 161)

        y_start = pdf.get_y()
        pdf.set_x(14)
        pdf.cell(0, 5, f" [i] {title}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(15, 23, 42)
        pdf.set_x(14)
        pdf.multi_cell(182, 4.5, text)
        y_end = pdf.get_y() + 2
        pdf.rect(12, y_start, 186, y_end - y_start, style="D")
        pdf.set_y(y_end + 2)

    # ---- 1. KONSEP DASAR APLIKASI ----
    section_h1("1. PENDAHULUAN & KONSEP DASAR APLIKASI")
    p("Aplikasi Sistem Terpadu Ma'had Mudaiyatul Anwar (MMA) dirancang untuk mengintegrasikan seluruh operasional pesantren ke dalam satu platform digital yang aman, transparan, dan terhubung secara real-time. Seluruh transaksi berbasis cashless (tanpa uang tunai fisik) dan tersinkronisasi otomatis dengan laporan keuangan.")

    info_box("1. Tanpa Uang Tunai Fisik: Belanja santri di Kantin, Kopel, maupun BMT menggunakan Saldo Debit Santri.\n2. Batas Jajan Harian (Limit): Santri dibatasi nominal jajan harian agar hemat dan teratur.\n3. Otomatisasi Cashflow: Semua arus kas masuk/keluar dari unit usaha langsung tercatat di Laporan Keuangan.")

    # ---- 2. MANAJEMEN PERAN & HAK AKSES ----
    section_h1("2. MANAJEMEN PERAN & HAK AKSES OPERASIONAL")
    p("Aplikasi memiliki 8 peran pengguna dengan kewenangan yang disesuaikan dengan tugas masing-masing:")

    bullet("Superadmin", "Pemegang kewenangan tertinggi. Mengelola akun staf, unit usaha, tahun ajaran, tampilan logo/aplikasi, serta audit rekonsiliasi saldo cashless.")
    bullet("Staf Keuangan", "Admin Unit Usaha & Keuangan Pesantren. Mengelola tagihan santri, penerimaan pembayaran, pengajuan anggaran, serta transaksi & arus kas seluruh unit usaha.")
    bullet("Staf BMT", "Admin Unit Usaha & Operator BMT. Memproses permohonan top-up wali, penerbitan kartu/PIN santri, audit saldo, serta transaksi unit usaha.")
    bullet("Staf Kasir Unit", "Kasir Kantin, Kopel, Dapur, dll. Memproses transaksi belanja debit santri (QR, Wajah, Manual), mengelola katalog produk, dan sinkronisasi offline.")
    bullet("Pengasuhan", "Mengelola absensi harian santri, perizinan keluar/pulang, serta catatan pelanggaran & poin pembinaan santri.")
    bullet("Pengajaran / LPTQ", "Menginput nilai akademik, catatan prestasi, setoran hafalan Al-Qur'an, dan penilaian ubudiyah santri.")
    bullet("Sekretariat", "Mengelola Master Data Santri, biodata lengkap, kelengkapan berkas, impor data Excel/CSV, serta penautan akun wali santri.")
    bullet("Wali Santri", "Memantau saldo anak, mengajukan permohonan top-up saldo & batas jajan harian, serta melihat riwayat belanja anak secara real-time.")

    # ---- 3. KEUANGAN & TRANSKASI UNIT USAHA ----
    section_h1("3. PANDUAN TRANSAKSI KEUANGAN & SALDO UNIT USAHA")
    p("Keuangan Pesantren dan BMT dapat mengelola arus kas unit usaha pada tab 'Keuangan Unit' melalui 3 jenis transaksi yang otomatis tersinkronisasi dengan Laporan Arus Kas (Cashflow):")

    bullet("Dana Masuk", "Injeksi modal atau penambahan saldo kasir awal pada unit usaha tujuan (contoh: Modal Awal Kasir Kantin Rp 100.000). Otomatis mencatat Cashflow MASUK pada unit tujuan.")
    bullet("Dana Keluar", "Pencairan saldo kasir hasil penjualan atau pembayaran biaya operasional unit usaha asal (contoh: Pencairan Saldo Kasir Kantin Rp 400.000 ke BMT). Otomatis mencatat Cashflow KELUAR pada unit asal.")
    bullet("Transfer Antar Unit", "Pemindahan dana langsung antar unit usaha (contoh: Transfer dari Kantin ke Kopel Rp 50.000). Otomatis mencatat 2 entri Cashflow sinkron (Keluar dari unit asal & Masuk ke unit tujuan).")

    info_box("Saldo Kas Unit Usaha = (Penerimaan Belanja Santri + Total Dana Masuk) - Total Dana Keluar\nSemua perubahan saldo dihitung secara otomatis dan dapat dipantau pada kartu ringkasan real-time per unit usaha.")

    # ---- 4. PETUNJUK OPERASIONAL LANGKAH DEMI LANGKAH ----
    section_h1("4. PETUNJUK OPERASIONAL LANGKAH DEMI LANGKAH (STEP-BY-STEP)")

    section_h2("A. Mengoperasikan Kasir Cashless (Kantin / Kopel / BMT)")
    bullet("Langkah 1", "Buka halaman Kasir. Pilih metode identifikasi santri: Scan QR Kartu, Kamera Wajah, atau Cari Nama/NIS secara manual.")
    bullet("Langkah 2", "Pilih produk belanja dari katalog atau ketik nominal belanja secara manual.")
    bullet("Langkah 3", "Minta santri memasukkan PIN (khusus penarikan tunai atau transaksi di atas limit). Sistem memeriksa sisa limit jajan harian.")
    bullet("Langkah 4", "Sistem memotong saldo secara instant. Jika sinyal mati, transaksi tersimpan offline dan otomatis tersinkron saat terhubung internet.")

    section_h2("B. Mencatat Transaksi Unit Usaha (Keuangan & BMT)")
    bullet("Langkah 1", "Klik tab/menu 'Keuangan Unit'.")
    bullet("Langkah 2", "Pilih jenis transaksi: 'Dana Masuk', 'Dana Keluar', atau 'Transfer Antar Bagian'.")
    bullet("Langkah 3", "Pilih Unit Asal / Unit Tujuan, ketik Nominal (Rp), dan berikan Catatan Keterangan.")
    bullet("Langkah 4", "Klik 'Simpan Transaksi Unit'. Saldo kas unit dan laporan arus kas akan langsung terbarui secara otomatis.")

    section_h2("C. Memproses Top-Up Saldo dari Wali Santri (BMT / Keuangan)")
    bullet("Langkah 1", "Buka menu 'Permintaan BMT'. Pilih permohonan berstatus 'Menunggu'.")
    bullet("Langkah 2", "Periksa bukti transfer foto/resi yang dikirimkan oleh wali santri.")
    bullet("Langkah 3", "Klik tombol 'Setujui'. Saldo akun santri akan langsung bertambah dan riwayat transaksi tercatat.")

    section_h2("D. Impor Data Santri Baru dari Excel (Sekretariat)")
    bullet("Langkah 1", "Buka menu 'Data Santri', klik tombol 'Unduh Template' untuk mengunduh berkas CSV/Excel standar.")
    bullet("Langkah 2", "Isi data santri (Nama, NIS, NISN, Kelas, Nama Wali, No HP Wali).")
    bullet("Langkah 3", "Klik tombol 'Impor Excel', periksa laporan simulasi (dry-run). Jika valid, klik 'Konfirmasi Eksekusi'. Akun wali santri akan dibuatkan otomatis.")

    # ---- 5. TIPS KUNCI & RUJUKAN CEPAT ----
    section_h1("5. TIPS KUNCI & RUJUKAN CEPAT (GAMPANG DIINGAT)")

    pdf.set_fill_color(248, 250, 252)
    pdf.set_draw_color(203, 213, 225)

    y_start = pdf.get_y()
    pdf.set_font("Helvetica", "B", 9.5)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, "  RINGKASAN FORMULA & AKSI CEPAT OPERATOR:", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    summary_lines = [
        " 1. QR / Wajah / PIN   -> Belanja Santri Cepat & Bebas Uang Tunai",
        " 2. Dana Masuk        -> Tambah Modal / Injeksi Saldo Kasir Unit Usaha",
        " 3. Dana Keluar       -> Pencairan Saldo Kasir / Biaya Operasional Unit",
        " 4. Transfer Unit     -> Pindah Dana Langsung Antar Bagian (e.g. Kantin -> BMT)",
        " 5. Impor Excel       -> Auto-generate Santri & Akun Wali Otomatis",
        " 6. Rekonsiliasi      -> Audit Saldo Ledger vs Saldo Tersimpan Santri"
    ]

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(51, 65, 85)
    for line in summary_lines:
        pdf.cell(0, 5, f"  {line}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    y_end = pdf.get_y() + 2
    pdf.rect(12, y_start, 186, y_end - y_start, style="D")

    pdf.output(filename)
    print(f"PDF successfully created at: {os.path.abspath(filename)}")

if __name__ == "__main__":
    create_guide_pdf()
