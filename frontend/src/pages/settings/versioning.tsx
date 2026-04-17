import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  Database,
  LayoutDashboard,
  Loader2,
  PlugZap,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
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
import { useToast } from "@/hooks/use-toast";
import { settingsApi } from "@/lib/api";
import { setPageTitle } from "@/lib/page-title";
import {
  MasterDataAsideSection,
  MasterDataAsideStack,
  MasterDataLegacySections,
  MasterDataPageShell,
} from "@/pages/master-data/shared";

type FeatureSection = {
  title: string;
  summary: string;
  icon: LucideIcon;
  items: VersioningListItem[];
};

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
  {
    name: "Go",
    logo: <SiGo className="h-4.5 w-4.5" />,
    version: "1.21",
    iconClassName: "text-cyan-500",
  },
  {
    name: "PostgreSQL",
    logo: <SiPostgresql className="h-4.5 w-4.5" />,
    version: "15",
    iconClassName: "text-sky-700",
  },
  {
    name: "React",
    logo: <SiReact className="h-4.5 w-4.5" />,
    version: "19",
    iconClassName: "text-cyan-500",
  },
  {
    name: "TypeScript",
    logo: <SiTypescript className="h-4.5 w-4.5" />,
    version: "5.9",
    iconClassName: "text-blue-600",
  },
  {
    name: "Vite",
    logo: <SiVite className="h-4.5 w-4.5" />,
    version: "7.2",
    iconClassName: "text-violet-500",
  },
  {
    name: "Tailwind",
    logo: <SiTailwindcss className="h-4.5 w-4.5" />,
    version: "3.4",
    iconClassName: "text-sky-400",
  },
  {
    name: "Docker",
    logo: <SiDocker className="h-4.5 w-4.5" />,
    version: "Compose",
    iconClassName: "text-blue-500",
  },
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
      <Badge className="rounded-none border-0 bg-amber-500 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white shadow-none">
        Upcoming
      </Badge>
    );
  }

  return (
    <Badge className="rounded-none border-0 bg-emerald-600 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white shadow-none">
      New
    </Badge>
  );
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: "Governance Dan Konfigurasi",
    summary: "Fondasi akses, pengaturan, branding, dan kontrol aplikasi yang sudah dipakai lintas modul.",
    icon: ShieldCheck,
    items: [
      "Autentikasi login, profil akun, dan session aplikasi",
      "Manajemen users lengkap: list, create, edit, show, dan aktivasi user",
      "Manajemen roles dan permission berbasis module.action",
      "Permission guard di frontend dan backend untuk akses halaman serta endpoint",
      "Settings aplikasi untuk nama sistem, subtitle, logo, favicon, dan branding utama",
      "Konfigurasi KOP atau print header untuk PDF klinis dan administrasi",
      "Upload aset branding ke server melalui settings",
      "Pemisahan settings umum, integrasi, dan monitoring operasional",
    ],
  },
  {
    title: "Master Data Dan Referensi Klinik",
    summary: "Referensi utama yang sudah tersedia untuk menopang front office, EMR, farmasi, unit penunjang, dan billing.",
    icon: Database,
    items: [
      "Master poliklinik dengan identitas, kode, warna, dan urutan tampil",
      "Master dokter dan relasi banyak poli",
      "Jadwal dokter per hari, jam praktik, dan kapasitas pasien",
      "Master pasien lengkap dengan identitas, alamat, penjamin, dan histori kunjungan",
      "Master ICD-10 untuk kebutuhan diagnosis klinis",
      "Master obat, kategori obat, unit, supplier, dan purchase order",
      "Master layanan medis, kategori layanan, serta struktur parameter layanan",
      "Master metode pembayaran untuk kasir dan invoice",
      "Master gambar pemeriksaan fisik untuk kebutuhan EMR",
      "Master region Indonesia: provinsi, kabupaten, kecamatan, dan kelurahan",
      "Specimen template dan relasinya ke medical service untuk laboratorium",
    ],
  },
  {
    title: "Front Office Dan Antrian",
    summary: "Alur pendaftaran dan arus pasien rawat jalan dari loket sampai siap masuk konsultasi.",
    icon: Stethoscope,
    items: [
      "Pendaftaran kunjungan pasien baru maupun lama",
      "Pemilihan poli, dokter, jenis kunjungan, tipe bayar, dan nomor penjamin",
      "Pembuatan nomor visit dan nomor antrian otomatis",
      "Manajemen tiket antrian pendaftaran dan proses panggil berikutnya",
      "Dashboard antrian poli untuk memantau waiting, called, in consultation, dan done",
      "Layar display antrian untuk TV atau monitor ruang tunggu",
      "Status visit dan queue status yang saling terhubung dengan alur pelayanan",
      "Print tiket antrian pendaftaran dalam format PDF",
      "Registrasi terhubung langsung ke EMR dan billing context",
      { text: "Monitoring jadwal kontrol front office dengan indikator urgensi follow up tanpa filter wajib.", badge: "new" },
      { text: "Pengingat WhatsApp manual dari monitoring jadwal kontrol dengan modal nomor dan pesan yang tetap editable.", badge: "new" },
      { text: "Aksi Daftarkan Kontrol untuk membuka workspace pendaftaran dengan data kontrol yang sudah diprefill.", badge: "new" },
    ],
  },
  {
    title: "EMR Dan Dokumen Klinis",
    summary: "Pencatatan klinis rawat jalan yang menjadi pusat workflow dokter dan rekam medis.",
    icon: BadgeCheck,
    items: [
      "Daftar EMR berbasis visit aktif dengan fokus workspace yang sedang berjalan",
      "Form EMR dan sheet EMR untuk pencatatan SOAP serta data klinis utama",
      "Workspace EMR aktif agar dokter dan operator fokus pada kunjungan yang sedang dikerjakan",
      "Diagnosis rekam medis berbasis ICD-10",
      "Vital sign, assessment, plan, allergy, dan elemen klinis lain dalam rekam medis",
      "Tindakan medis umum dan tindakan dental dengan target klinis",
      "Odontogram dan dokumen dental pendukung",
      "Informed consent umum dan medical action consent",
      "Resume medis, ringkasan tindakan, dan print dokumen medis",
      "Cetak informed consent, prescription order, procedure, dan medical record printout",
      { text: "Surat kontrol hasil finalisasi kunjungan kini ikut masuk ke katalog dokumen TTE internal.", badge: "new" },
      { text: "TTE hasil laboratorium dan radiologi kini menampilkan pasangan dokumen dokter dan petugas dalam satu alur yang lebih mudah dibaca.", badge: "new" },
    ],
  },
  {
    title: "Farmasi, Laboratorium, Radiologi, Dan Kasir",
    summary: "Workflow unit layanan dan penagihan yang sudah terhubung dengan EMR dan visit.",
    icon: LayoutDashboard,
    items: [
      "Workflow farmasi bertahap: ordered, preparing, ready, dan dispensed",
      "Queue farmasi untuk resep aktif, resep siap, dan riwayat dispensing",
      "Validasi stok saat proses persiapan resep",
      "Workflow laboratorium bertahap: receive, process, completed, dan return to queue bila perlu",
      "Order laboratorium dari EMR dengan item, specimen, parameter hasil, dan print hasil",
      "Workflow radiologi bertahap: receive, process, completed, dan input hasil naratif maupun parameter",
      "Order radiologi dari EMR dengan hasil dan supporting order print",
      "Kasir dan billing untuk invoice visit, invoice item, pembayaran, dan status pelunasan",
      "Validasi bahwa visit selesai sebelum pembayaran diterima penuh",
      "Dokumen kasir dan cetak invoice atau kwitansi berbasis data transaksi",
    ],
  },
  {
    title: "Dashboard, Reports, Dan Operasional Sistem",
    summary: "Ringkasan manajemen dan alat operasional yang sudah tersedia untuk monitoring klinik sehari-hari.",
    icon: LayoutDashboard,
    items: [
      "Dashboard KPI harian untuk kunjungan, pasien baru, antrian, pendapatan, dan stok rendah",
      "Dashboard registrasi, farmasi, laboratorium, dan radiologi berbasis antrean kerja",
      "Report center untuk laporan operasional dan finance",
      "Export PDF dan Excel untuk management report serta finance report",
      "Monitoring backup storage, disk usage, dan file backup yang tersedia",
      "Auto backup scheduler, manual backup run, dan download hasil backup",
      "Retensi backup lokal dan ringkasan hasil backup terakhir",
      "Dokumen panduan env dan strategi backup untuk deployment satu klinik satu VPS",
    ],
  },
  {
    title: "Integrasi SATUSEHAT Yang Sudah Tersedia",
    summary: "Integrasi eksternal yang memang sudah aktif di produk saat ini, tanpa memasukkan roadmap BPJS atau modul lain yang belum mandatory.",
    icon: PlugZap,
    items: [
      "Settings mode sandbox dan production untuk SATUSEHAT",
      "Konfigurasi auth URL, FHIR URL, organization ID, client ID, dan client secret",
      "Preview dan sync Patient, Practitioner, Encounter, dan Organization atau Location poli",
      "Preview dan sync Observation vital sign, ClinicalImpression, Condition diagnosis, CarePlan, Goal, AllergyIntolerance, FamilyMemberHistory, Procedure, dan Composition",
      "Preview dan sync ServiceRequest, Specimen, Observation, dan DiagnosticReport untuk laboratorium dan radiologi",
      "Preview dan sync Medication, MedicationRequest, dan MedicationDispense untuk alur farmasi non-racikan",
      "Pemeriksaan prerequisite resource sebelum sync dikirim",
      "Log SATUSEHAT, filter status berhasil atau gagal, serta retry sinkronisasi",
      "Persist ID resource SATUSEHAT pada model transaksi lokal agar sinkronisasi tidak duplikat",
    ],
  },
  {
    title: "Integrasi BPJS Yang Sedang Disiapkan",
    summary: "Fondasi integrasi BPJS sudah tersedia di kode dan halaman operasional, tetapi masih ditandai upcoming sampai rollout operasional klinik dinyatakan siap.",
    icon: PlugZap,
    items: [
      { text: "Settings provider BPJS Antrean FKTP dan P-Care dengan toggle per domain, kredensial, dan base URL.", badge: "upcoming" },
      { text: "Status BPJS di header aplikasi dan halaman settings berdasarkan agregasi enable state Antrean atau P-Care.", badge: "upcoming" },
      { text: "Test connection, preflight, dan activity log untuk domain BPJS Antrean FKTP dan P-Care.", badge: "upcoming" },
      { text: "Reference picker poli dan dokter BPJS dari WS Antrean FKTP untuk mapping data master lokal.", badge: "upcoming" },
      { text: "Webhook autentikasi, tambah antrean, dan batal antrean dari jalur BPJS Mobile JKN.", badge: "upcoming" },
      { text: "Aksi Panggil BPJS dari workspace EMR untuk mengirim status Hadir ke BPJS saat pasien diproses.", badge: "upcoming" },
    ],
  },
];

export default function VersioningPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [appName, setAppName] = useState("SIMKLINIK");

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

  const totalFeatureItems = useMemo(
    () => FEATURE_SECTIONS.reduce((total, section) => total + section.items.length, 0),
    [],
  );

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
        title="Versioning"
        subtitle="Daftar cakupan fitur SIMKLINIK yang sudah aktif pada versi saat ini. Halaman ini dibuat sebagai inventaris produk berjalan, bukan roadmap dan bukan history release penuh."
        meta={
          <>
            <span>{VERSION_LABEL}</span>
            <span>{totalFeatureItems} fitur terpetakan</span>
          </>
        }
        onBack={() => navigate("/settings")}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Versioning" helper="Nama aplikasi, badge versi aktif, dan logo teknologi yang dipakai pada sistem ini.">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-base font-semibold tracking-tight text-foreground">{appName}</p>
                    <Badge className="rounded-none border-0 bg-emerald-600 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">{VERSION_LABEL}</Badge>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Legenda Badge</p>
                    <div className="flex flex-wrap gap-2">
                      <VersioningItemBadge badge="new" />
                      <VersioningItemBadge badge="upcoming" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Tech Stack</p>
                    <div className="flex flex-col items-start gap-2">
                      {TECH_STACK_ITEMS.map((item) => (
                        <div key={item.name} className="flex w-full items-center justify-between gap-3 py-1">
                          <div className="inline-flex min-w-0 items-center gap-2">
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${item.iconClassName}`}>
                              {item.logo}
                            </span>
                            <p className="text-[12px] font-semibold leading-4 text-foreground">{item.name}</p>
                          </div>
                          <Badge variant="outline" className="rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {item.version}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-tight">Catatan Rilis Terbaru</h2>
              <p className="text-[11px] leading-5 text-muted-foreground">Ringkasan perubahan terkini yang sudah dirilis ke sistem.</p>
            </div>

            <div className="space-y-3">
              {RELEASE_NOTES.map((release) => (
                <article key={release.version} className="space-y-3 border border-border/80 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-none border-0 bg-stone-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">
                      v{release.version}
                    </Badge>
                    {release.isNew ? (
                      <Badge className="rounded-none border-0 bg-emerald-600 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">NEW</Badge>
                    ) : null}
                    <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {release.date}
                    </Badge>
                  </div>

                  <ul className="grid gap-2">
                    {release.items.map((item) => (
                      <li key={getVersioningItemText(item)} className="flex items-start gap-3 border border-border/80 bg-background px-3 py-3 text-[12px] leading-5 text-foreground">
                        <span className="mt-1 h-2 w-2 shrink-0 bg-foreground/70" />
                        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
                          <span className="min-w-0 flex-1">{getVersioningItemText(item)}</span>
                          <VersioningItemBadge badge={getVersioningItemBadge(item)} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/80 p-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-tight">Daftar Fitur Versi Aktif</h2>
              <p className="text-[11px] leading-5 text-muted-foreground">Semua poin di bawah ini merepresentasikan fitur yang sudah ada pada basis produk saat ini. Badge hijau menandai penambahan terbaru di versi 1.0.2, sedangkan badge kuning menandai fondasi BPJS yang sudah dibuat tetapi masih upcoming untuk rollout operasional penuh.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-none border-0 bg-stone-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">{VERSION_LABEL}</Badge>
              <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">{FEATURE_SECTIONS.length} kelompok fitur</Badge>
              <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">{totalFeatureItems} poin fitur</Badge>
            </div>
          </section>

          <section className="space-y-4">
            {FEATURE_SECTIONS.map((section) => (
              <FeatureListSection key={section.title} section={section} />
            ))}
          </section>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </div>
  );
}

function FeatureListSection({ section }: { section: FeatureSection }) {
  const Icon = section.icon;

  return (
    <section className="space-y-4 rounded-lg border border-border/80 bg-background p-5 shadow-sm">
      <div className="space-y-2 border-b border-border/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {section.title}
          </div>
          <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">
            {section.items.length} fitur
          </Badge>
        </div>
        <p className="text-[11px] leading-5 text-muted-foreground">{section.summary}</p>
      </div>

      <ul className="grid gap-2 xl:grid-cols-2">
        {section.items.map((item) => (
          <li key={getVersioningItemText(item)} className="flex items-start gap-3 border border-border/80 bg-muted/20 px-3 py-3 text-[12px] leading-5 text-foreground">
            <span className="mt-1 h-2 w-2 shrink-0 bg-foreground/70" />
            <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
              <span className="min-w-0 flex-1">{getVersioningItemText(item)}</span>
              <VersioningItemBadge badge={getVersioningItemBadge(item)} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

