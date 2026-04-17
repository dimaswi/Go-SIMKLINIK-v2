import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Database,
  Download,
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
import { useToast } from "@/hooks/use-toast";
import { downloadBlobResponse } from "@/lib/blob-download";
import { settingsApi } from "@/lib/api";
import { setPageTitle } from "@/lib/page-title";
import {
  MasterDataAsideSection,
  MasterDataAsideStack,
  MasterDataLegacySections,
  MasterDataPageShell,
} from "@/pages/master-data/shared";
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
        description: `Dokumen ${DOCUMENT_TITLE} berhasil diunduh dengan format PDF yang sama seperti dokumen lain.`,
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title={DOCUMENT_TITLE}
        subtitle="Dokumen ketentuan penggunaan internal yang disusun dalam format legal formal untuk akses aplikasi, pencatatan data, keamanan sistem, dan integrasi operasional klinik."
        meta={
          <>
            <span>{appName}</span>
            <span>{DOCUMENT_LABEL}</span>
            <span>{TERMS_ARTICLES.length} pasal</span>
            <span>{totalClauses} ayat operasional</span>
          </>
        }
        onBack={() => navigate("/settings")}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-none shadow-none"
              onClick={() => void handlePrint()}
              disabled={printing || exportingPdf}
            >
              {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Buka PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-none shadow-none"
              onClick={() => void handleExportPdf()}
              disabled={printing || exportingPdf}
            >
              {exportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export PDF
            </Button>
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Dokumen" helper="Identitas dokumen legal yang sedang berlaku pada operasional SIMKLINIK.">
                <div className="space-y-3 text-sm">
                  <div className="space-y-2">
                    <p className="text-base font-semibold tracking-tight text-foreground">{appName}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="rounded-none border-0 bg-stone-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">{DOCUMENT_LABEL}</Badge>
                      <Badge className="rounded-none border-0 bg-emerald-600 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">Berlaku Aktif</Badge>
                    </div>
                  </div>

                  <div className="space-y-1 text-[12px] leading-5 text-muted-foreground">
                    <p>Efektif: {EFFECTIVE_DATE}</p>
                    <p>Bentuk dokumen: penomoran pasal dengan ayat operasional.</p>
                    <p>Output tersedia: PDF viewer dan unduh PDF native backend.</p>
                  </div>
                </div>
              </MasterDataAsideSection>
            </div>

            <div>
              <MasterDataAsideSection title="Ruang Lingkup" helper="Area penggunaan aplikasi yang diikat oleh dokumen ini.">
                <div className="space-y-2">
                  {APPLICABLE_AREAS.map((area) => (
                    <div key={area} className="border border-border/80 px-3 py-2 text-[12px] leading-5 text-foreground">
                      {area}
                    </div>
                  ))}
                </div>
              </MasterDataAsideSection>
            </div>

            <div>
              <MasterDataAsideSection title="Prinsip Kunci" helper="Landasan minimum yang harus dipatuhi seluruh pengguna aplikasi.">
                <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
                  {KEY_PRINCIPLES.map((principle) => (
                    <p key={principle}>{principle}</p>
                  ))}
                </div>
              </MasterDataAsideSection>
            </div>

            <div>
              <MasterDataAsideSection title="Saran Penguatan" helper="Rekomendasi saya supaya dokumen Terms & Conditions ini lebih kuat secara operasional.">
                <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
                  {IMPROVEMENT_SUGGESTIONS.map((suggestion) => (
                    <p key={suggestion}>{suggestion}</p>
                  ))}
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <section className="space-y-5 rounded-lg border border-border/80 p-5">
            <div className="terms-document mx-auto w-full max-w-[860px] space-y-5 bg-white text-slate-900">
              <div className="terms-cover space-y-4 border border-border/80 px-5 py-5 md:px-7 md:py-7" style={{ breakInside: "avoid-page" }}>
                <div className="space-y-2 border-b border-border/70 pb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Dokumen Kebijakan Internal</p>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{DOCUMENT_TITLE}</h2>
                  <p className="text-sm text-slate-600">{appName}</p>
                </div>

                <div className="grid gap-3 border border-border/70 px-4 py-4 md:grid-cols-3">
                  <DocumentMetaItem label="Versi Dokumen" value={DOCUMENT_LABEL} />
                  <DocumentMetaItem label="Tanggal Berlaku" value={EFFECTIVE_DATE} />
                  <DocumentMetaItem label="Status" value="Aktif" />
                </div>

                <div className="space-y-3 text-[13px] leading-6 text-slate-700">
                  <p>
                    Dokumen ini merupakan ketentuan penggunaan resmi untuk seluruh user internal yang mengakses dan mengoperasikan {appName} dalam kegiatan pelayanan, administrasi, penunjang medis, dan pengelolaan sistem.
                  </p>
                  <p>
                    Dengan menggunakan aplikasi, setiap pengguna dianggap memahami bahwa seluruh input data, perubahan status layanan, penggunaan fitur cetak, proses sinkronisasi, dan aktivitas administrasi digital wajib mengikuti SOP internal klinik, kewenangan jabatan, serta prinsip kerahasiaan data pasien.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {TERMS_ARTICLES.map((article, index) => (
                  <LegalArticleCard key={article.title} article={article} articleNumber={index + 1} />
                ))}
              </div>

              <div className="terms-closing space-y-3 border border-border/80 px-5 py-5 text-[13px] leading-6 text-slate-700 md:px-7 md:py-6" style={{ breakInside: "avoid-page" }}>
                <p className="text-sm font-semibold tracking-tight text-slate-950">Penutup</p>
                <p>
                  Dokumen ini menjadi acuan minimum penggunaan sistem pada versi aktif dan tetap dapat ditinjau ulang oleh pengelola aplikasi apabila terjadi perubahan regulasi, penyesuaian proses bisnis, pengembangan modul, atau kebutuhan penguatan keamanan informasi.
                </p>
                <p>
                  Setiap pengguna wajib mematuhi ketentuan ini selama tetap menggunakan {appName} sebagai sistem operasional klinik.
                </p>
              </div>
            </div>
          </section>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </div>
  );
}

function DocumentMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}

function LegalArticleCard({ article, articleNumber }: { article: TermsArticle; articleNumber: number }) {
  const Icon = article.icon;

  return (
    <article className="terms-article space-y-4 border border-border/80 px-5 py-5 md:px-7 md:py-6" style={{ breakInside: "avoid-page" }}>
      <div className="space-y-3 border-b border-border/70 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-border/80 text-slate-700">
              <Icon className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Pasal {articleNumber}</p>
              <h3 className="text-base font-semibold tracking-tight text-slate-950">{article.title}</h3>
            </div>
          </div>

          <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-700">
            {article.clauses.length} ayat
          </Badge>
        </div>

        <p className="text-[13px] leading-6 text-slate-700">{article.summary}</p>
      </div>

      <ol className="space-y-3 pl-5 text-[13px] leading-6 text-slate-800 marker:font-semibold marker:text-slate-950">
        {article.clauses.map((clause) => (
          <li key={clause}>{clause}</li>
        ))}
      </ol>
    </article>
  );
}