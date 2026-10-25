import os
from PIL import Image, ImageDraw, ImageFont
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def create_logo_image(output_path):
    size = 400
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer rounded rectangle
    margin = 20
    rect_box = [margin, margin, size - margin, size - margin]
    draw.rounded_rectangle(rect_box, radius=80, fill="#effaf6", outline="#10b981", width=6)
    
    # Medical cross dimensions
    cx, cy = size // 2, size // 2
    arm_thickness = 44  # half thickness -> total thickness 88
    arm_length = 130     # half length -> total length 260
    
    # Vertical arm (Emerald to Teal)
    draw.rounded_rectangle(
        [cx - arm_thickness, cy - arm_length, cx + arm_thickness, cy + arm_length],
        radius=26,
        fill="#059669"
    )
    # Horizontal arm (Sky to Teal)
    draw.rounded_rectangle(
        [cx - arm_length, cy - arm_thickness, cx + arm_length, cy + arm_thickness],
        radius=26,
        fill="#0284c7"
    )
    # Center overlap overlay with vibrant teal
    draw.rounded_rectangle(
        [cx - arm_thickness, cy - arm_thickness, cx + arm_thickness, cy + arm_thickness],
        radius=14,
        fill="#0d9488"
    )
    
    # Small golden accent badge at bottom right
    badge_cx, badge_cy = size - 75, size - 75
    draw.ellipse([badge_cx - 36, badge_cy - 36, badge_cx + 36, badge_cy + 36], fill="#f59e0b", outline="#ffffff", width=6)
    
    # Plus inside golden badge
    draw.rectangle([badge_cx - 4, badge_cy - 16, badge_cx + 4, badge_cy + 16], fill="#ffffff")
    draw.rectangle([badge_cx - 16, badge_cy - 4, badge_cx + 16, badge_cy + 4], fill="#ffffff")
    
    img.save(output_path, "PNG")
    print(f"Logo created at {output_path}")

def set_cell_background(cell, fill_hex):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=140, bottom=140, left=200, right=200):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def add_header_styled(doc, text, level):
    h = doc.add_heading(text, level=level)
    h.paragraph_format.keep_with_next = True
    h.paragraph_format.space_before = Pt(14)
    h.paragraph_format.space_after = Pt(4)
    run = h.runs[0]
    if level == 1:
        run.font.color.rgb = RGBColor(15, 118, 110) # Teal-700
        run.font.size = Pt(16)
        run.bold = True
    elif level == 2:
        run.font.color.rgb = RGBColor(3, 105, 161) # Sky-700
        run.font.size = Pt(13)
        run.bold = True
    elif level == 3:
        run.font.color.rgb = RGBColor(71, 85, 105) # Slate-600
        run.font.size = Pt(11)
        run.bold = True
    return h

def add_callout(doc, title, text, bg_color="F0FDF4", border_color="059669"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    cell = tbl.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    
    # Left border only
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>
            <w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>
            <w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>
            <w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        </w:tcBorders>
    ''')
    tcPr.append(tcBorders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    run_title = p.add_run(f"📌 {title}: ")
    run_title.bold = True
    run_title.font.size = Pt(10)
    run_title.font.color.rgb = RGBColor(15, 118, 110)
    
    run_text = p.add_run(text)
    run_text.font.size = Pt(9.5)
    run_text.font.color.rgb = RGBColor(51, 65, 85)
    
    # spacing after callout
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_before = Pt(0)
    p_after.paragraph_format.space_after = Pt(4)

def build_technical_guide():
    doc = docx.Document()
    
    # Page setup: A4 with 1 inch margins
    sections = doc.sections
    for section in sections:
        section.page_width = Inches(8.27)
        section.page_height = Inches(11.69)
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)
        
    logo_path = os.path.join(os.path.dirname(__file__), "simklinik_logo.png")
    create_logo_image(logo_path)
    
    # ==================== HEADER COVER TABLE ====================
    header_table = doc.add_table(rows=1, cols=2)
    header_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    header_table.autofit = False
    
    col_logo = header_table.cell(0, 0)
    col_logo.width = Inches(1.4)
    col_text = header_table.cell(0, 1)
    col_text.width = Inches(5.1)
    
    set_cell_background(col_logo, "F8FAFC")
    set_cell_background(col_text, "F8FAFC")
    set_cell_margins(col_logo, top=160, bottom=160, left=160, right=100)
    set_cell_margins(col_text, top=160, bottom=160, left=100, right=160)
    
    p_logo = col_logo.paragraphs[0]
    p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_logo.paragraph_format.space_before = Pt(4)
    p_logo.paragraph_format.space_after = Pt(0)
    run_logo = p_logo.add_run()
    run_logo.add_picture(logo_path, width=Inches(1.15))
    
    p_title = col_text.paragraphs[0]
    p_title.paragraph_format.space_before = Pt(2)
    p_title.paragraph_format.space_after = Pt(2)
    
    run_inst = p_title.add_run("SIMKLINIK INDONESIA\n")
    run_inst.font.name = "Arial"
    run_inst.font.size = Pt(11)
    run_inst.font.bold = True
    run_inst.font.color.rgb = RGBColor(15, 118, 110)
    
    run_main_title = p_title.add_run("PETUNJUK TEKNIS SISTEM REKAM MEDIS ELEKTRONIK (RME)\n")
    run_main_title.font.name = "Arial"
    run_main_title.font.size = Pt(14)
    run_main_title.font.bold = True
    run_main_title.font.color.rgb = RGBColor(15, 23, 42)
    
    run_sub = p_title.add_run("Panduan Operasional Workflow Pelayanan Klinis Terintegrasi: Pendaftaran s/d Billing\nStandar Permenkes No. 24 Tahun 2022 & Interoperabilitas SATUSEHAT")
    run_sub.font.name = "Arial"
    run_sub.font.size = Pt(8.5)
    run_sub.font.color.rgb = RGBColor(100, 116, 139)
    
    p_div = doc.add_paragraph()
    p_div.paragraph_format.space_before = Pt(8)
    p_div.paragraph_format.space_after = Pt(8)
    
    # Metadata bar
    meta_p = doc.add_paragraph()
    meta_p.paragraph_format.space_before = Pt(0)
    meta_p.paragraph_format.space_after = Pt(10)
    r_meta = meta_p.add_run("Klasifikasi Dokumen: ")
    r_meta.bold = True
    r_meta.font.size = Pt(8.5)
    r_meta = meta_p.add_run("Standard Operating Procedure (SOP) & Juknis RME   |   ")
    r_meta.font.size = Pt(8.5)
    r_meta = meta_p.add_run("Versi Sistem: ")
    r_meta.bold = True
    r_meta.font.size = Pt(8.5)
    r_meta = meta_p.add_run("SIMKLINIK Enterprise v2.0 (Bridge KFA & SATUSEHAT)")
    r_meta.font.size = Pt(8.5)
    
    # ==================== RINGKASAN WORKFLOW UTAMA ====================
    add_header_styled(doc, "Alur Pelayanan Pasien Rawat Jalan (Workflow Overview)", level=1)
    
    overview_p = doc.add_paragraph(
        "Petunjuk teknis ini menjelaskan tata kelola operasional dan panduan langkah demi langkah implementasi Rekam Medis Elektronik (RME) "
        "mulai dari kedatangan pasien hingga penyelesaian tagihan (Billing). Sistem SIMKLINIK dirancang terintegrasi "
        "berdasarkan prinsip one-entry multi-use, audit-trail compliance, dan validasi data terstandar."
    )
    overview_p.paragraph_format.line_spacing = 1.2
    overview_p.paragraph_format.space_after = Pt(8)
    overview_p.runs[0].font.size = Pt(10)
    
    # Diagram Ringkas Alur
    wf_table = doc.add_table(rows=7, cols=3)
    wf_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    wf_table.autofit = False
    
    wf_headers = ["Tahap", "Modul / Layanan", "Output Utama Sistem"]
    widths = [Inches(0.8), Inches(2.5), Inches(3.2)]
    
    for i, h_text in enumerate(wf_headers):
        cell = wf_table.cell(0, i)
        cell.width = widths[i]
        set_cell_background(cell, "0F766E")
        set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
        run = p.add_run(h_text)
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(255, 255, 255)
        
    wf_steps = [
        ("1", "Pendaftaran & Registrasi", "Nomor Rekam Medis (RM), Nomor Visit, Tiket Antrian Poliklinik"),
        ("2", "Antrian & Triase", "Status Antrian 'Dipanggil', Data Tanda Vital (TTV) & Skrining Visual Awal"),
        ("3", "Pemeriksaan Medis (EMR)", "Anamnesis, Pemeriksaan Fisik Terstruktur, Diagnosis ICD-10, TTE Dokter"),
        ("4", "Pemeriksaan Penunjang", "Order Lab / Radiologi Terkirim, Lembar Hasil Terverifikasi & Terintegrasi"),
        ("5", "Peresepan & Farmasi", "E-Resep Masuk Farmasi, Etiket Obat Terbit, Dispensing & Monitoring Stok"),
        ("6", "Kasir & Billing", "Invoice Otomatis, Kuitansi Pembayaran Lunas, Sinkronisasi Data SATUSEHAT"),
    ]
    
    for row_idx, (st_num, st_name, st_out) in enumerate(wf_steps, start=1):
        bg = "FFFFFF" if row_idx % 2 != 0 else "F8FAFC"
        for col_idx, text_val in enumerate([st_num, st_name, st_out]):
            cell = wf_table.cell(row_idx, col_idx)
            cell.width = widths[col_idx]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=90, bottom=90, left=120, right=120)
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            if col_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(text_val)
            run.font.size = Pt(9)
            if col_idx == 1:
                run.bold = True
                
    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    
    # ==================== STEP 1: PENDAFTARAN ====================
    add_header_styled(doc, "1. Pendaftaran & Registrasi Pasien (Front Office)", level=1)
    
    p1 = doc.add_paragraph(
        "Modul Front Office merupakan pintu gerbang pertama pasien dalam sistem SIMKLINIK. "
        "Petugas pendaftaran bertugas memverifikasi identitas, memilih poliklinik tujuan, dan menerbitkan kunjungan (Visit)."
    )
    p1.paragraph_format.line_spacing = 1.2
    p1.runs[0].font.size = Pt(10)
    
    doc.add_paragraph("Langkah Operasional Pendaftaran Pasien:", style='List Bullet')
    steps_1 = [
        "Identifikasi Pasien: Buka menu Front Office > Pendaftaran. Lakukan pencarian data pasien melalui kolom pencarian menggunakan No. RM, NIK, atau Nama Lengkap.",
        "Pasien Baru: Jika data belum terdaftar, klik tombol 'Tambah Pasien Baru'. Isi Nama Lengkap, Tanggal Lahir, Jenis Kelamin, Nomor WhatsApp/HP, dan Alamat.",
        "Fitur Dummy NIK: Untuk pasien darurat, lansia, atau bayi yang belum memiliki/membawa e-KTP, sistem menyediakan fitur 'Generate Dummy NIK' otomatis berstandar Kemenkes.",
        "Penentuan Penjamin: Pilih jenis pembiayaan pasien (Umum / BPJS Kesehatan / Asuransi Swasta Rekanan).",
        "Registrasi Kunjungan (Visit): Pilih Poliklinik tujuan (Poli Umum, Gigi, Spesialis) dan pilih Dokter yang sedang bertugas.",
        "Cetak Antrian: Klik 'Simpan & Daftarkan'. Sistem secara otomatis membuat nomor kunjungan (No. Visit) dan memasukkan pasien ke sistem display antrian poli."
    ]
    for s in steps_1:
        p_item = doc.add_paragraph(s, style='List Bullet 2')
        p_item.paragraph_format.space_after = Pt(3)
        p_item.runs[0].font.size = Pt(9.5)
        
    add_callout(
        doc,
        "Validasi SATUSEHAT Pasien",
        "Saat pendaftaran dengan NIK valid, sistem otomatis melakukan verifikasi ID Pasien SATUSEHAT (IHS Number) di latar belakang sehingga rekam medis dapat langsung terhubung ke Kemenkes RI.",
        bg_color="EFF6FF", border_color="0284C7"
    )

    # ==================== STEP 2: ANTRAN & TRIASE ====================
    add_header_styled(doc, "2. Antrian & Triase / Skrining Awal (Nurse Station)", level=1)
    
    p2 = doc.add_paragraph(
        "Petugas perawat/bidan di Nurse Station memantau antrian poli dan melakukan pemeriksaan tanda-tanda vital sebelum pasien berkonsultasi dengan dokter."
    )
    p2.paragraph_format.line_spacing = 1.2
    p2.runs[0].font.size = Pt(10)
    
    steps_2 = [
        "Pemanggilan Pasien: Pada menu Front Office > Antrian Poli, klik tombol 'Panggil' untuk menampilkan nomor antrian di layar display poli dan memanggil pasien.",
        "Pengukuran Tanda Vital (TTV): Ukur dan masukkan data Tekanan Darah (Sistolik/Diastolik), Frekuensi Nadi, Frekuensi Pernapasan, Suhu Tubuh, SpO2, Berat Badan, dan Tinggi Badan.",
        "Kalkulasi IMT Otomatis: Sistem secara langsung menghitung Indeks Massa Tubuh (IMT) dan menampilkan kategori gizi (Kurus, Normal, Overweight, Obesitas).",
        "Skrining Riwayat Alergi: Catat riwayat alergi obat, makanan, atau bahan medis lainnya. Peringatan alergi akan otomatis muncul dengan badge merah di lembar EMR dokter."
    ]
    for s in steps_2:
        p_item = doc.add_paragraph(s, style='List Bullet 2')
        p_item.paragraph_format.space_after = Pt(3)
        p_item.runs[0].font.size = Pt(9.5)

    # ==================== STEP 3: PEMERIKSAAN EMR ====================
    add_header_styled(doc, "3. Pemeriksaan Medis & Rekam Medis Elektronik (Dokter / EMR)", level=1)
    
    p3 = doc.add_paragraph(
        "EMR SIMKLINIK mengadopsi format SOAP (Subjective, Objective, Assessment, Plan) yang terstandar dengan integrasi kode ICD-10, ICD-9-CM, odontogram digital, serta Tanda Tangan Elektronik (TTE)."
    )
    p3.paragraph_format.line_spacing = 1.2
    p3.runs[0].font.size = Pt(10)
    
    steps_3 = [
        "Anamnesis (Subjective): Catat Keluhan Utama, Riwayat Penyakit Sekarang (RPS), Riwayat Penyakit Dahulu (RPD), dan Riwayat Pengobatan.",
        "Pemeriksaan Fisik Terstruktur (Objective): Catat temuan fisik sistemik (Kepala, Thorax, Abdomen, Ekstremitas). Untuk Poli Gigi, lengkapi peta odontogram digital 32 gigi dengan kode restorasi/kelainan FDI.",
        "Diagnosis Medis (Assessment): Pilih diagnosis primer dan sekunder menggunakan pencarian ICD-10 terverifikasi (kode dan deskripsi resmi Kemenkes).",
        "Rencana Terapi (Plan): Masukkan instruksi medis, prosedur tindakan (ICD-9-CM), anjuran diet, serta jadwal kontrol lanjutan.",
        "Penguncian & TTE Dokter: Setelah data lengkap, klik 'Simpan & Tanda Tangan TTE'. Dokumen rekam medis akan terkunci aman (tamper-proof) dengan sertifikat digital."
    ]
    for s in steps_3:
        p_item = doc.add_paragraph(s, style='List Bullet 2')
        p_item.paragraph_format.space_after = Pt(3)
        p_item.runs[0].font.size = Pt(9.5)
        
    add_callout(
        doc,
        "Integritas Data Rekam Medis",
        "Rekam Medis Elektronik yang telah ditandatangani secara digital tidak dapat diubah sembarangan tanpa mencatat riwayat versi (versioning audit log) demi kepatuhan hukum Permenkes No. 24/2022.",
        bg_color="FEF3C7", border_color="D97706"
    )

    # ==================== STEP 4: PENUNJANG ====================
    add_header_styled(doc, "4. Pemeriksaan Penunjang (Laboratorium & Radiologi)", level=1)
    
    p4 = doc.add_paragraph(
        "Jika pasien memerlukan investigasi laboratorium atau pencitraan radiologi, order dilakukan langsung dari lembar EMR tanpa berkas kertas manual."
    )
    p4.paragraph_format.line_spacing = 1.2
    p4.runs[0].font.size = Pt(10)
    
    steps_4 = [
        "Order Penunjang dari EMR: Dokter mencentang paket/parameter laboratorium (Darah Lengkap, Gula Darah, Kolesterol, dsb.) atau rontgen radiologi pada tab Penunjang.",
        "Penerimaan Order di Unit Penunjang: Petugas analis lab/radiografer menerima notifikasi order, mencetak label spesimen, dan melakukan tindakan pengambilan sampel.",
        "Input & Validasi Hasil: Analis memasukkan nilai hasil pemeriksaan. Sistem otomatis memberi penanda (flag) 'Tinggi' (High), 'Rendah' (Low), atau 'Kritis' (Panic Value).",
        "Hasil Terintegrasi Real-Time: Begitu divalidasi oleh penanggung jawab lab, hasil secara otomatis muncul di layar dokter pemeriksa dan siap dicetak sebagai lampiran resume medis."
    ]
    for s in steps_4:
        p_item = doc.add_paragraph(s, style='List Bullet 2')
        p_item.paragraph_format.space_after = Pt(3)
        p_item.runs[0].font.size = Pt(9.5)

    # ==================== STEP 5: FARMASI ====================
    add_header_styled(doc, "5. Peresepan Elektronik & Pelayanan Farmasi (Dispensing)", level=1)
    
    p5 = doc.add_paragraph(
        "Alur peresepan digital menghubungkan dokter langsung ke instalasi farmasi klinik dengan proteksi stok real-time dan standar Kamus Farmasi & Alkes (KFA)."
    )
    p5.paragraph_format.line_spacing = 1.2
    p5.runs[0].font.size = Pt(10)
    
    steps_5 = [
        "E-Prescribing (Dokter): Dokter memilih obat dari master KFA, menentukan jumlah, dosis, aturan pakai, frekuensi, dan instruksi khusus (sebelum/sesudah makan).",
        "Penerimaan Resep di Farmasi: Apoteker/Asisten Apoteker membuka menu Farmasi > Order Resep. Status awal: 'Ordered'.",
        "Telaah Resep & Verifikasi: Lakukan kajian klinis dan administratif resep. Sistem memeriksa kecukupan stok fisik obat secara real-time.",
        "Penyiapan & Peracikan: Ubah status menjadi 'Preparing'. Petugas menyiapkan sediaan obat atau meracik puyer/kapsul sesuai komposisi.",
        "Cetak Etiket Elektronik: Cetak etiket obat otomatis berisi identitas pasien, nama obat, nomor resep, aturan pakai, dan tanggal kedaluwarsa.",
        "Penyerahan Obat (Dispensing): Panggil pasien, verifikasi identitas (2 indikator: Nama & Tgl Lahir), serahkan obat, dan berikan Konseling, Informasi, dan Edukasi (KIE). Status obat berubah menjadi 'Dispensed'."
    ]
    for s in steps_5:
        p_item = doc.add_paragraph(s, style='List Bullet 2')
        p_item.paragraph_format.space_after = Pt(3)
        p_item.runs[0].font.size = Pt(9.5)

    # ==================== STEP 6: KASIR & BILLING ====================
    add_header_styled(doc, "6. Kasir, Pembayaran & Penagihan (Billing)", level=1)
    
    p6 = doc.add_paragraph(
        "Modul Kasir mengumpulkan seluruh komponen biaya pelayanan pasien menjadi satu invoice terpadu tanpa risiko biaya tertinggal (loss revenue)."
    )
    p6.paragraph_format.line_spacing = 1.2
    p6.runs[0].font.size = Pt(10)
    
    steps_6 = [
        "Agregasi Biaya Otomatis: Masuk ke menu Kasir. Klik nama pasien pada antrian kasir. Sistem otomatis menjumlahkan: Jasa Konsultasi Dokter, Tindakan Medis, Biaya Lab/Radiologi, dan Biaya Resep Obat.",
        "Penyesuaian Diskon / Asuransi: Kasir dapat memasukkan potongan harga promosi, subsidi penjamin BPJS, atau klaim asuransi rekanan klinik.",
        "Pilihan Metode Pembayaran: Pilih metode pelunasan: Tunai (Cash), Transfer Bank, EDC (Debit/Kredit), atau QRIS dinamis.",
        "Penerbitan Kuitansi & Faktur: Klik 'Simpan Pembayaran & Lunas'. Cetak Kuitansi Resmi dan Faktur Rincian Biaya untuk diserahkan kepada pasien.",
        "Penyelesaian Kunjungan (Closing Visit): Status kunjungan berubah menjadi 'Completed'. Pasien selesai menjalani seluruh rangkaian layanan di klinik.",
        "Sinkronisasi SATUSEHAT Akhir: Sistem otomatis mengirimkan payload Encounter 'finished' dan riwayat Condition, Observation, Procedure, dan MedicationDispense ke SATUSEHAT Kemenkes."
    ]
    for s in steps_6:
        p_item = doc.add_paragraph(s, style='List Bullet 2')
        p_item.paragraph_format.space_after = Pt(3)
        p_item.runs[0].font.size = Pt(9.5)
        
    add_callout(
        doc,
        "Keamanan Keuangan & Rekonsiliasi",
        "Setiap transaksi di kasir tercatat dalam Laporan Keuangan Harian yang dapat direkonsiliasi per shift kasir untuk mencegah selisih fisik kas.",
        bg_color="F1F5F9", border_color="475569"
    )

    # ==================== MATRIKS HAK AKSES ====================
    add_header_styled(doc, "7. Matriks Hak Akses Pengguna (Role & Permission Matrix)", level=1)
    
    role_table = doc.add_table(rows=6, cols=5)
    role_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    role_table.autofit = False
    
    r_headers = ["Peran Pengguna", "Pendaftaran", "EMR & Tindakan", "Penunjang & Farmasi", "Kasir & Billing"]
    r_widths = [Inches(1.8), Inches(1.1), Inches(1.4), Inches(1.5), Inches(1.2)]
    
    for i, h in enumerate(r_headers):
        c = role_table.cell(0, i)
        c.width = r_widths[i]
        set_cell_background(c, "0F766E")
        set_cell_margins(c, top=80, bottom=80, left=100, right=100)
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(h)
        run.bold = True
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(255, 255, 255)
        
    roles_data = [
        ("Petugas Registrasi", "Full Access", "View Only", "No Access", "View Tagihan"),
        ("Perawat / Bidan", "View / Input", "TTV & Skrining", "Input Sampel", "No Access"),
        ("Dokter Pemeriksa", "View Kunjungan", "Full Akses & TTE", "Order Lab / Rad / Rx", "No Access"),
        ("Petugas Farmasi / Lab", "No Access", "View Resep / Order", "Full Dispensing / Hasil", "No Access"),
        ("Kasir Pembayaran", "View Data Pasien", "No Access", "View Item Tagihan", "Full Transaksi & Kuitansi"),
    ]
    
    for r_idx, row in enumerate(roles_data, start=1):
        bg = "FFFFFF" if r_idx % 2 != 0 else "F8FAFC"
        for c_idx, val in enumerate(row):
            c = role_table.cell(r_idx, c_idx)
            c.width = r_widths[c_idx]
            set_cell_background(c, bg)
            set_cell_margins(c, top=70, bottom=70, left=100, right=100)
            p = c.paragraphs[0]
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            if c_idx > 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(val)
            run.font.size = Pt(8.5)
            if c_idx == 0:
                run.bold = True
                
    doc.add_paragraph().paragraph_format.space_after = Pt(12)
    
    # Footer note
    footer = doc.sections[0].footer
    p_ft = footer.paragraphs[0]
    p_ft.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_ft = p_ft.add_run("SIMKLINIK Indonesia — Petunjuk Teknis RME Terintegrasi  |  Halaman Dokumen")
    r_ft.font.size = Pt(8)
    r_ft.font.color.rgb = RGBColor(148, 163, 184)
    
    target_docx = r"e:\Golang\Go-SIMKLINIK\Petunjuk_Teknis_Sistem_Rekam_Medis_Elektronik_SIMKLINIK.docx"
    doc.save(target_docx)
    print(f"Document successfully created at: {target_docx}")

if __name__ == "__main__":
    build_technical_guide()
