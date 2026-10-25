import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  FileText,
  HardDrive,
  Loader2,
  PlugZap,
  Printer,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { downloadBlobResponse } from "@/lib/blob-download";
import { settingsApi } from "@/lib/api";
import { setPageTitle } from "@/lib/page-title";
import { openPdfDocumentInNewWindow } from "@/pages/emr/print-document";

type TermsArticle = {
  title: string;
  summary: string;
  icon: LucideIcon;
  clauses: string[];
};

const DOCUMENT_LABEL = "Policy V1";
const DOCUMENT_TITLE = "Terms & Conditions";
const EFFECTIVE_DATE = "12 Apr 2026";

const TERMS_ARTICLES: TermsArticle[] = [
  {
    title: "Akses Dan Tanggung Jawab Akun",
    summary: "Setiap penggunaan akun dalam SIMKLINIK harus sesuai role, permission, dan kewenangan kerja yang sah di lingkungan klinik.",
    icon: ShieldCheck,
    clauses: [
      "Setiap user wajib menggunakan akun pribadi dan dilarang membagikan username, password, atau sesi login kepada pihak lain.",
      "Hak akses mengikuti role dan permission yang ditetapkan administrator, sehingga pengguna tidak diperkenankan mencoba melewati pembatasan menu, endpoint, atau data yang bukan kewenangannya.",
      "Seluruh aktivitas yang tercatat melalui akun pengguna menjadi tanggung jawab pemilik akun sepanjang sesi masih aktif atau belum diamankan dengan logout yang semestinya.",
      "Perubahan data master, settings, branding, dan pengelolaan akses hanya boleh dilakukan oleh personel yang mendapat mandat resmi dari pengelola fasilitas kesehatan.",
    ],
  },
  {
    title: "Data Pasien Dan Rekam Medis",
    summary: "Data klinis, identitas pasien, serta dokumen penunjang wajib dicatat secara akurat, lengkap, dan menjaga kerahasiaan medis.",
    icon: Database,
    clauses: [
      "Data pasien, diagnosis, tindakan, resep, hasil penunjang, dan persetujuan tindakan wajib diinput sesuai kondisi pelayanan yang sebenarnya.",
      "Pengguna dilarang mengakses, menyalin, memindahkan, atau menyebarkan data pasien di luar kebutuhan operasional dan kewenangan profesinya.",
      "Kesalahan input yang berdampak klinis, administratif, atau finansial harus segera diperbaiki mengikuti prosedur internal agar jejak data tetap dapat ditelusuri.",
      "Dokumen cetak, PDF, hasil ekspor, dan lampiran yang dihasilkan sistem tetap dianggap bagian dari catatan layanan dan harus dijaga kerahasiaannya.",
    ],
  },
  {
    title: "Penggunaan Fitur Operasional",
    summary: "Registrasi, EMR, farmasi, laboratorium, radiologi, dan kasir wajib digunakan mengikuti workflow resmi yang tersedia di sistem.",
    icon: Stethoscope,
    clauses: [
      "Nomor antrian, visit, order layanan, resep, serta transaksi billing harus dibuat melalui alur resmi aplikasi agar status pelayanan tetap sinkron antar unit.",
      "Pengguna tidak diperkenankan memanipulasi status layanan hanya untuk mempercepat proses administratif apabila kondisi riil pelayanan belum sesuai.",
      "Dokter, apoteker, analis, radiografer, dan petugas kasir wajib memastikan data yang disimpan sudah final sebelum dokumen dicetak, layanan dilanjutkan, atau visit dinyatakan selesai.",
      "Setiap penggunaan fitur yang memengaruhi stok, invoice, hasil layanan, atau penyelesaian kunjungan harus mengikuti validasi sistem yang tersedia.",
    ],
  },
  {
    title: "Backup, Audit, Dan Keamanan Sistem",
    summary: "Penggunaan aplikasi tunduk pada disiplin backup, pemantauan audit operasional, dan pengamanan perangkat serta lingkungan server.",
    icon: HardDrive,
    clauses: [
      "Administrator wajib memantau hasil backup, kapasitas penyimpanan, dan retensi file backup secara berkala melalui fitur monitoring yang tersedia.",
      "Perubahan settings penting, unggah aset, aktivitas sinkronisasi, dan transaksi operasional dapat menjadi bagian dari jejak audit penggunaan sistem.",
      "Pengguna wajib menjaga keamanan perangkat, browser, dan jaringan yang digunakan untuk mengakses aplikasi guna mencegah kebocoran data atau penyalahgunaan akses.",
      "Jika ditemukan insiden keamanan, kehilangan data, atau akses tidak sah, tim operasional wajib segera melakukan mitigasi sesuai prosedur internal klinik.",
    ],
  },
  {
    title: "Integrasi Eksternal Dan Sinkronisasi",
    summary: "Integrasi eksternal seperti SATUSEHAT hanya boleh dipakai dengan kredensial resmi dan data yang telah diverifikasi oleh klinik.",
    icon: PlugZap,
    clauses: [
      "Setiap credential integrasi, base URL, organization ID, client ID, client secret, dan parameter teknis lain harus dikelola oleh personel yang berwenang.",
      "Preview dan sinkronisasi resource hanya boleh dijalankan terhadap data yang sudah lolos verifikasi internal agar tidak menimbulkan duplikasi atau penolakan dari sistem mitra.",
      "Kegagalan sinkronisasi, retry, dan status log integrasi harus ditinjau terlebih dahulu sebelum data dianggap berhasil terkirim ke pihak eksternal.",
      "Roadmap atau modul integrasi yang belum aktif tidak boleh diperlakukan sebagai fitur produksi sampai benar-benar tersedia pada versi berjalan.",
    ],
  },
  {
    title: "Batasan Layanan Dan Perubahan Ketentuan",
    summary: "Ketentuan ini mengikat penggunaan aplikasi internal dan dapat diperbarui mengikuti perubahan proses bisnis, regulasi, atau kapabilitas sistem.",
    icon: AlertTriangle,
    clauses: [
      "SIMKLINIK disediakan untuk mendukung operasional klinik dan tidak menggantikan pertimbangan profesional medis, administratif, ataupun hukum.",
      "Keputusan layanan kepada pasien tetap berada pada tenaga profesional dan penanggung jawab fasilitas kesehatan.",
      "Tim pengelola sistem berhak memperbarui Terms & Conditions apabila terdapat perubahan modul, kebijakan keamanan, proses operasional, atau integrasi eksternal.",
      "Dengan tetap menggunakan aplikasi setelah ketentuan diperbarui, setiap pengguna dianggap telah memahami dan menerima versi terbaru dokumen ini.",
    ],
  },
];

const APPLICABLE_AREAS = [
  "Front Office, registrasi, dan antrean layanan",
  "EMR, rekam medis, dan dokumen klinis",
  "Farmasi, laboratorium, radiologi, dan kasir",
  "Settings, backup, serta integrasi eksternal",
];

const KEY_PRINCIPLES = [
  "Akses sistem wajib sesuai role dan permission.",
  "Data pasien wajib akurat, lengkap, dan rahasia.",
  "Workflow operasional tidak boleh dilompati di luar prosedur.",
  "Backup, audit, dan integrasi harus diawasi personel berwenang.",
];

const IMPROVEMENT_SUGGESTIONS = [
  "Tetapkan siklus review dokumen minimal setiap 6 atau 12 bulan agar Terms tidak tertinggal dari perubahan workflow nyata.",
  "Tambahkan pasal khusus insiden keamanan, pelaporan pelanggaran, dan jalur eskalasi supaya tanggung jawab operasional lebih tegas.",
  "Tambahkan ketentuan akses vendor, implementor, atau pihak ketiga jika nanti ada integrasi, support remote, atau maintenance server.",
  "Masukkan bukti persetujuan pengguna saat onboarding, misalnya checklist atau acknowledgement internal untuk user baru.",
];

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "simklinik";
}

export default function TermsAndConditionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [appName, setAppName] = useState("SIMKLINIK");
  const [activeTab, setActiveTab] = useState<"articles" | "scope" | "suggestions">("articles");

  useEffect(() => {
    setPageTitle("Terms & Conditions");
    void loadPage();
  }, []);

  const loadPage = async () => {
    setLoading(true);
    try {
      const response = await settingsApi.getAll();
      const settings = response.data.data;
      setAppName(settings.app_name || "SIMKLINIK");
    } catch {
      toast({
        variant: "destructive",
        title: "Settings belum bisa dimuat",
        description: "Nama aplikasi untuk halaman Terms & Conditions belum berhasil diambil.",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalClauses = useMemo(
    () => TERMS_ARTICLES.reduce((total, article) => total + article.clauses.length, 0),
    [],
  );
  const pdfFileName = useMemo(
    () => `terms-and-conditions-${sanitizeFileName(appName)}.pdf`,
    [appName],
  );

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await openPdfDocumentInNewWindow({
        toast,
        loadingLabel: DOCUMENT_TITLE,
        preparingMessage: "Menyiapkan PDF Terms & Conditions...",
        blockedDescription: "Izinkan popup browser untuk membuka PDF Terms & Conditions.",
        errorTitle: "Gagal membuka PDF Terms & Conditions",
        errorFallback: "PDF Terms & Conditions belum berhasil dibuat.",
        request: () => settingsApi.printTermsAndConditionsPdf(),
      });
    } finally {
      setPrinting(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const response = await settingsApi.printTermsAndConditionsPdf();
      downloadBlobResponse(response, pdfFileName);
      toast({
        variant: "success",
        title: "PDF berhasil dibuat",
        description: `Dokumen ${DOCUMENT_TITLE} berhasil diunduh.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Export PDF gagal",
        description: "Dokumen Terms & Conditions belum berhasil diexport ke PDF.",
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const renderSectionHeader = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/60 pb-2 mb-4">
      {icon}
      <span>{title}</span>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-muted/20 min-h-full">
      {/* Satu Card Utuh Sesuai Standar Detail SIMKLINIK */}
      <div className="border border-border/80 bg-card shadow-none">
        {/* Card Header (Baris Atas di dalam Satu Card) */}
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={() => navigate("/settings")}
              aria-label="Kembali"
              title="Kembali ke Settings"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border/70 bg-muted/20">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-foreground truncate">
                  Terms & Conditions
                </h1>
                <Badge className="h-5 rounded-none border-0 bg-stone-900 px-2 text-[10px] uppercase tracking-wide text-white shadow-none">
                  {DOCUMENT_LABEL}
                </Badge>
                <Badge className="h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none">
                  Berlaku Aktif
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-none shadow-none"
              onClick={() => void handlePrint()}
              disabled={printing || exportingPdf}
            >
              {printing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Printer className="mr-1.5 size-3.5" />}
              Buka PDF
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs rounded-none shadow-none"
              onClick={() => void handleExportPdf()}
              disabled={printing || exportingPdf}
            >
              {exportingPdf ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Download className="mr-1.5 size-3.5" />}
              Export PDF
            </Button>
          </div>
        </div>

        {/* Card Body Langsung di Dalam Card yang Sama */}
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* KOLOM KIRI: Card Profil Dokumen & Sidetabs Navigasi */}
            <div className="lg:col-span-4 xl:col-span-3 space-y-4">
              <div className="border border-border/70 bg-muted/[0.03] p-4 relative shadow-none">
                <Badge className="absolute top-3.5 right-3.5 text-[10px] font-bold tracking-wider rounded-md px-2 py-0.5 shadow-none border-0 text-white bg-emerald-600">
                  AKTIF
                </Badge>

                <div className="flex flex-col items-center pt-2">
                  <div className="size-20 rounded-lg border border-border bg-zinc-950 dark:bg-zinc-900 text-white flex items-center justify-center font-bold shadow-sm">
                    <FileText className="size-10 text-primary" />
                  </div>
                  <h2 className="text-base font-bold text-center mt-3 text-foreground tracking-tight uppercase leading-snug">
                    {DOCUMENT_TITLE}
                  </h2>
                  <p className="text-xs text-muted-foreground text-center mt-0.5 font-mono">
                    {appName}
                  </p>
                  <div className="mt-2.5">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 border border-border rounded-md text-foreground bg-muted/30 uppercase tracking-wider">
                      {DOCUMENT_LABEL}
                    </span>
                  </div>
                </div>

                <div className="border-t border-border/60 my-4" />

                <div className="space-y-3 text-xs">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">TANGGAL BERLAKU</p>
                    <p className="font-medium text-foreground mt-0.5">{EFFECTIVE_DATE}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CAKUPAN</p>
                    <p className="font-medium text-foreground mt-0.5">{TERMS_ARTICLES.length} Pasal · {totalClauses} Ayat</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">FORMAT OUTPUT</p>
                    <p className="font-medium text-foreground mt-0.5">PDF Native & Viewer</p>
                  </div>
                </div>
              </div>

              {/* Sidetabs Navigasi */}
              <div className="border border-border/70 bg-card p-1.5 space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("articles")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "articles"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <ShieldCheck className="size-4 shrink-0" />
                  <span>Pasal Ketentuan ({TERMS_ARTICLES.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("scope")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "scope"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>Ruang Lingkup & Prinsip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("suggestions")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "suggestions"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>Saran Penguatan</span>
                </button>
              </div>
            </div>

            {/* KOLOM KANAN: Isi Sidetab Aktif */}
            <div className="lg:col-span-8 xl:col-span-9 min-w-0">
              {activeTab === "articles" && (
                <div className="space-y-4">
                  {renderSectionHeader(<ShieldCheck className="size-4 text-muted-foreground" />, "Pasal & Ayat Ketentuan Penggunaan")}
                  <div className="space-y-4">
                    {TERMS_ARTICLES.map((article, index) => {
                      const Icon = article.icon;
                      return (
                        <div key={article.title} className="border border-border/70 p-4 bg-card space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="flex size-7 shrink-0 items-center justify-center border border-border/70 bg-muted/20 text-xs font-bold text-primary">
                              {index + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Icon className="size-4 text-muted-foreground shrink-0" />
                                <h3 className="text-sm font-bold text-foreground">
                                  Pasal {index + 1}: {article.title}
                                </h3>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {article.summary}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-1.5 pl-10 border-t border-border/50 pt-2.5">
                            {article.clauses.map((clause, cIdx) => (
                              <div key={cIdx} className="text-xs leading-relaxed text-foreground flex items-start gap-2">
                                <span className="font-mono text-[11px] text-muted-foreground shrink-0">({cIdx + 1})</span>
                                <span>{clause}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === "scope" && (
                <div className="space-y-6">
                  <div>
                    {renderSectionHeader(<CheckCircle2 className="size-4 text-muted-foreground" />, "Ruang Lingkup Penerapan")}
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {APPLICABLE_AREAS.map((area, idx) => (
                        <div key={idx} className="border border-border/70 p-3 bg-card text-xs flex items-center gap-2.5">
                          <span className="size-2 rounded-full bg-primary shrink-0" />
                          <span className="font-medium text-foreground">{area}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    {renderSectionHeader(<ShieldCheck className="size-4 text-muted-foreground" />, "Prinsip Kunci Operasional")}
                    <div className="space-y-2">
                      {KEY_PRINCIPLES.map((principle, idx) => (
                        <div key={idx} className="border border-border/70 p-3 bg-card text-xs flex items-start gap-2.5">
                          <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="text-foreground leading-relaxed">{principle}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "suggestions" && (
                <div className="space-y-4">
                  {renderSectionHeader(<AlertTriangle className="size-4 text-muted-foreground" />, "Rekomendasi Penguatan Kebijakan")}
                  <div className="space-y-2.5">
                    {IMPROVEMENT_SUGGESTIONS.map((suggestion, idx) => (
                      <div key={idx} className="border border-border/70 p-3.5 bg-card text-xs flex items-start gap-3">
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-none border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-[11px]">
                          {idx + 1}
                        </div>
                        <p className="text-foreground leading-relaxed">{suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}