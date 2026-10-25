import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Cpu,
  Database,
  GitBranch,
  LayoutDashboard,
  Loader2,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import {
  SiDocker,
  SiGo,
  SiPostgresql,
  SiReact,
  SiTailwindcss,
  SiTypescript,
  SiVite,
} from "react-icons/si";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { settingsApi } from "@/lib/api";
import { setPageTitle } from "@/lib/page-title";

type VersioningBadge = "new" | "upcoming";

type VersioningListItem =
  | string
  | {
      text: string;
      badge?: VersioningBadge;
    };

type TechStackItem = {
  name: string;
  logo: ReactNode;
  version: string;
  iconClassName: string;
};

type ReleaseNote = {
  version: string;
  date: string;
  isNew?: boolean;
  items: VersioningListItem[];
};

const VERSION_LABEL = "SIMKLINIK V1.0.2";

const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.0.2",
    date: "17 Apr 2026",
    isNew: true,
    items: [
      { text: "Pencarian pasien dengan menekan tombol (/) untuk melakukan pencarian cepat dan melihat riwayat dan rekam medis pasien.", badge: "new" },
      { text: "Monitoring jadwal kontrol front office ditambahkan dengan indikator overdue, hari ini, dan mendekati jadwal.", badge: "new" },
      { text: "Reminder WhatsApp manual untuk kontrol kini memakai modal editable agar nomor pasien dan isi pesan bisa disesuaikan sebelum membuka WhatsApp.", badge: "new" },
      { text: "Aksi Daftarkan Kontrol sekarang membuka workspace pendaftaran dengan prefill pasien lama, poli, dokter, penjamin, prioritas, dan keluhan awal.", badge: "new" },
      { text: "Workspace pendaftaran diberi konteks visual Pasien Kontrol agar front office bisa membedakan registrasi kontrol dari pendaftaran pasien lama biasa.", badge: "new" },
      { text: "Surat kontrol sudah masuk ke alur TTE, dan permintaan TTE hasil laboratorium atau radiologi kini menampilkan jalur dokter dan petugas dengan lebih jelas.", badge: "new" },
      { text: "Fondasi integrasi BPJS FKTP dan P-Care sudah tersedia di settings, monitoring status, log, referensi poli atau dokter, webhook antrean, dan aksi panggil BPJS dari EMR; statusnya masih upcoming sampai rollout operasional selesai.", badge: "upcoming" },
    ],
  },
  {
    version: "1.0.1",
    date: "12 Apr 2026",
    items: [
      "Perbaikan tampilan mobile di beberapa halaman utama agar tidak terpotong dan lebih stabil saat scroll.",
      "Perapihan ulang layout login agar responsif di mobile dan kembali rapi di desktop.",
      "Perbaikan DataTable mobile (terutama Purchase Order) agar konten bawah tidak ter-clipping.",
      "Penguncian akses Settings dan Integrasi untuk user biasa melalui guard frontend + backend.",
      "Permission unduh/cetak dokumen dibuat lebih granular per modul (farmasi, laboratorium, radiologi), tidak wajib akses semua dokumen.",
    ],
  },
];

const TECH_STACK_ITEMS: TechStackItem[] = [
  { name: "Go", logo: <SiGo className="size-4" />, version: "1.21", iconClassName: "text-cyan-500" },
  { name: "PostgreSQL", logo: <SiPostgresql className="size-4" />, version: "15", iconClassName: "text-sky-700" },
  { name: "React", logo: <SiReact className="size-4" />, version: "19", iconClassName: "text-cyan-500" },
  { name: "TypeScript", logo: <SiTypescript className="size-4" />, version: "5.9", iconClassName: "text-blue-600" },
  { name: "Vite", logo: <SiVite className="size-4" />, version: "7.2", iconClassName: "text-violet-500" },
  { name: "Tailwind", logo: <SiTailwindcss className="size-4" />, version: "3.4", iconClassName: "text-sky-400" },
  { name: "Docker", logo: <SiDocker className="size-4" />, version: "Compose", iconClassName: "text-blue-500" },
];

function getVersioningItemText(item: VersioningListItem) {
  return typeof item === "string" ? item : item.text;
}

function getVersioningItemBadge(item: VersioningListItem): VersioningBadge | undefined {
  return typeof item === "string" ? undefined : item.badge;
}

function VersioningItemBadge({ badge }: { badge?: VersioningBadge }) {
  if (!badge) {
    return null;
  }

  if (badge === "upcoming") {
    return (
      <Badge className="rounded-none border-0 bg-amber-500 px-1.5 py-0 text-[9px] uppercase tracking-wider text-white shadow-none">
        Upcoming
      </Badge>
    );
  }

  return (
    <Badge className="rounded-none border-0 bg-emerald-600 px-1.5 py-0 text-[9px] uppercase tracking-wider text-white shadow-none">
      New
    </Badge>
  );
}

export default function VersioningPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [appName, setAppName] = useState("SIMKLINIK");
  const [activeTab, setActiveTab] = useState<"releases" | "clinical" | "operations" | "integrations" | "tech">("releases");

  useEffect(() => {
    setPageTitle("Versioning");
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
        description: "Identitas aplikasi untuk halaman versioning belum berhasil diambil.",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderSectionHeader = (icon: ReactNode, title: string) => (
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
              <GitBranch className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-foreground truncate">
                  Riwayat Versi & Fitur
                </h1>
                <Badge className="h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none">
                  {VERSION_LABEL}
                </Badge>
                <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide text-muted-foreground shadow-none">
                  Stable Release
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Card Body Langsung di Dalam Card yang Sama */}
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* KOLOM KIRI: Card Profil Versi & Sidetabs Navigasi */}
            <div className="lg:col-span-4 xl:col-span-3 space-y-4">
              <div className="border border-border/70 bg-muted/[0.03] p-4 relative shadow-none">
                <Badge className="absolute top-3.5 right-3.5 text-[10px] font-bold tracking-wider rounded-md px-2 py-0.5 shadow-none border-0 text-white bg-emerald-600">
                  CURRENT
                </Badge>

                <div className="flex flex-col items-center pt-2">
                  <div className="size-20 rounded-lg border border-border bg-zinc-950 dark:bg-zinc-900 text-white flex items-center justify-center font-bold shadow-sm">
                    <GitBranch className="size-10 text-primary" />
                  </div>
                  <h2 className="text-base font-bold text-center mt-3 text-foreground tracking-tight uppercase leading-snug">
                    {appName}
                  </h2>
                  <p className="text-xs text-muted-foreground text-center mt-0.5 font-mono">
                    {VERSION_LABEL}
                  </p>
                  <div className="mt-2.5">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 border border-border rounded-md text-foreground bg-muted/30 uppercase tracking-wider">
                      PRODUCTION READY
                    </span>
                  </div>
                </div>

                <div className="border-t border-border/60 my-4" />

                <div className="space-y-3 text-xs">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CORE RUNTIME</p>
                    <p className="font-mono text-foreground mt-0.5">Go 1.21 · React 19 · PostgreSQL 15</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">DEPLOYMENT</p>
                    <p className="font-medium text-foreground mt-0.5">Docker Compose VPS</p>
                  </div>
                </div>
              </div>

              {/* Sidetabs Navigasi */}
              <div className="border border-border/70 bg-card p-1.5 space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("releases")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "releases"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <Sparkles className="size-4 shrink-0" />
                  <span>Catatan Rilis (Changelog)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("clinical")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "clinical"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <Stethoscope className="size-4 shrink-0" />
                  <span>Front Office & EMR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("operations")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "operations"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <LayoutDashboard className="size-4 shrink-0" />
                  <span>Penunjang & Billing</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("integrations")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "integrations"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <PlugZap className="size-4 shrink-0" />
                  <span>Governance & Integrasi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("tech")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "tech"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <Cpu className="size-4 shrink-0" />
                  <span>Tech Stack Details</span>
                </button>
              </div>
            </div>

            {/* KOLOM KANAN: Isi Sidetab Aktif */}
            <div className="lg:col-span-8 xl:col-span-9 min-w-0">
              {activeTab === "releases" && (
                <div className="space-y-4">
                  {renderSectionHeader(<Sparkles className="size-4 text-muted-foreground" />, "Catatan Rilis SIMKLINIK")}
                  <div className="space-y-4">
                    {RELEASE_NOTES.map((release) => (
                      <div key={release.version} className="border border-border/70 p-4 bg-card space-y-3">
                        <div className="flex items-center justify-between border-b border-border/60 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">Versi {release.version}</span>
                            {release.isNew && (
                              <Badge className="rounded-none border-0 bg-emerald-600 px-1.5 py-0 text-[10px] text-white">
                                Terkini
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">{release.date}</span>
                        </div>
                        <div className="space-y-2">
                          {release.items.map((item, idx) => (
                            <div key={idx} className="flex items-start gap-2.5 text-xs text-foreground leading-relaxed">
                              <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                              <div className="space-y-1">
                                <span>{getVersioningItemText(item)}</span>
                                <VersioningItemBadge badge={getVersioningItemBadge(item)} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "clinical" && (
                <div className="space-y-6">
                  <div>
                    {renderSectionHeader(<Stethoscope className="size-4 text-muted-foreground" />, "Front Office Dan Antrian")}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        "Pendaftaran kunjungan pasien baru maupun lama",
                        "Pemilihan poli, dokter, jenis kunjungan, dan penjamin",
                        "Nomor visit dan tiket antrean otomatis",
                        "Dashboard antrian poli (waiting, called, done)",
                        "Layar display antrean untuk TV ruang tunggu",
                        "Monitoring jadwal kontrol front office & WhatsApp reminder",
                        "Aksi Daftarkan Kontrol dengan prefill data pasien",
                      ].map((item, idx) => (
                        <div key={idx} className="border border-border/70 p-3 bg-card text-xs flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-600 shrink-0" />
                          <span className="font-medium text-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    {renderSectionHeader(<BadgeCheck className="size-4 text-muted-foreground" />, "EMR Dan Dokumen Medis")}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        "Workspace konsultasi EMR aktif per kunjungan",
                        "Form SOAP klinis dan diagnosis ICD-10",
                        "Vital signs, assessment klinis, dan plan follow-up",
                        "Tindakan medis umum dan dental dengan odontogram",
                        "Informed consent dan medical action consent",
                        "Cetak resume medis, resep, order tindakan, dan PDF",
                        "Integrasi alur TTE internal surat kontrol dan lab/radiologi",
                      ].map((item, idx) => (
                        <div key={idx} className="border border-border/70 p-3 bg-card text-xs flex items-center gap-2">
                          <span className="size-2 rounded-full bg-primary shrink-0" />
                          <span className="font-medium text-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "operations" && (
                <div className="space-y-6">
                  <div>
                    {renderSectionHeader(<LayoutDashboard className="size-4 text-muted-foreground" />, "Farmasi, Laboratorium, Radiologi, & Kasir")}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        "Alur farmasi: ordered, preparing, ready, dispensed",
                        "Validasi stok real-time saat penyiapan obat",
                        "Laboratorium: receive, process, input hasil & specimen",
                        "Radiologi: receive, process, input hasil & parameter",
                        "Kasir & Billing invoice visit dan pelunasan pembayaran",
                        "Kwitansi transaksi dan billing statement PDF",
                      ].map((item, idx) => (
                        <div key={idx} className="border border-border/70 p-3 bg-card text-xs flex items-center gap-2">
                          <span className="size-2 rounded-full bg-primary shrink-0" />
                          <span className="font-medium text-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    {renderSectionHeader(<Database className="size-4 text-muted-foreground" />, "Dashboard & Backup")}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        "Dashboard KPI harian kunjungan, pasien baru, dan revenue",
                        "Report center laporan operasional dan finance",
                        "Export PDF dan Excel untuk laporan manajemen",
                        "Monitoring backup storage VPS dan disk usage",
                        "Auto backup scheduler dan manual backup trigger",
                      ].map((item, idx) => (
                        <div key={idx} className="border border-border/70 p-3 bg-card text-xs flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-600 shrink-0" />
                          <span className="font-medium text-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "integrations" && (
                <div className="space-y-6">
                  <div>
                    {renderSectionHeader(<ShieldCheck className="size-4 text-muted-foreground" />, "Governance & Master Data")}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        "Autentikasi role & permission berbasis module.action",
                        "Master poliklinik, dokter, jadwal, dan kapasitas",
                        "Master pasien, penjamin, dan histori kunjungan",
                        "Master obat, purchase order, dan supplier",
                        "Master layanan medis dan metode pembayaran",
                      ].map((item, idx) => (
                        <div key={idx} className="border border-border/70 p-3 bg-card text-xs flex items-center gap-2">
                          <span className="size-2 rounded-full bg-primary shrink-0" />
                          <span className="font-medium text-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    {renderSectionHeader(<PlugZap className="size-4 text-muted-foreground" />, "Integrasi Eksternal (SATUSEHAT & BPJS)")}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        "SATUSEHAT: Mode Sandbox & Production resmi",
                        "SATUSEHAT: Sync Organization, Location, Patient, Practitioner",
                        "SATUSEHAT: Sync Encounter, Vital Signs, Condition, Procedure",
                        "SATUSEHAT: Sync Lab, Radiologi, dan Medication Dispense",
                        "SATUSEHAT: Log audit sinkronisasi & retry mechanism",
                        "BPJS: Fondasi arsitektur Antrean FKTP & P-Care (Upcoming)",
                      ].map((item, idx) => (
                        <div key={idx} className="border border-border/70 p-3 bg-card text-xs flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-600 shrink-0" />
                          <span className="font-medium text-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "tech" && (
                <div className="space-y-4">
                  {renderSectionHeader(<Cpu className="size-4 text-muted-foreground" />, "Teknologi Dan Spesifikasi Teknis")}
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {TECH_STACK_ITEMS.map((item) => (
                      <div key={item.name} className="border border-border/70 p-3.5 bg-card flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("size-7 flex items-center justify-center border border-border/70 bg-muted/20", item.iconClassName)}>
                            {item.logo}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">{item.name}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">v{item.version}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] rounded-none">Active</Badge>
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
