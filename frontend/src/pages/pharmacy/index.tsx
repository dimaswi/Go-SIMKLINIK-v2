import { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { pharmacyApi, type MedicalRecord } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { Link } from 'react-router-dom';
import { PharmacyStatCard } from './components/stat-card';
import { getRecordStockIssueCount, getRecordTotalPrice } from './utils';
import { ArrowRight, FlaskConical, History, Loader2, PillBottle, ShoppingBag } from 'lucide-react';

const WORKFLOW_LINKS = [
  {
    title: 'Terima Resep',
    description: 'Ambil resep baru yang sudah dikirim dari EMR, verifikasi data pasien dan isi resep, lalu pindahkan ke tahap proses farmasi.',
    href: '/pharmacy/receive',
    icon: PillBottle,
    key: 'ordered',
  },
  {
    title: 'Proses Resep',
    description: 'Kelola item resep, tambahkan obat bila dibutuhkan, cek harga, dan verifikasi stok sebelum resep siap diserahkan.',
    href: '/pharmacy/process',
    icon: FlaskConical,
    key: 'preparing',
  },
  {
    title: 'Serahkan Resep',
    description: 'Lakukan verifikasi akhir dan selesaikan dispensing saat obat diserahkan kepada pasien dari loket farmasi.',
    href: '/pharmacy/handover',
    icon: ShoppingBag,
    key: 'ready',
  },
  {
    title: 'Resep Selesai',
    description: 'Lihat resep yang sudah selesai dispensing atau sudah diserahkan kepada pasien untuk kebutuhan monitoring dan audit cepat.',
    href: '/pharmacy/completed',
    icon: History,
    key: 'dispensed',
  },
] as const;

export default function PharmacyIndex() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    const response = await pharmacyApi.getPrescriptionOrders('per_page=200');
    const nextOrders = response.data.data || [];
    setOrders(nextOrders);
    return nextOrders;
  }, []);

  useEffect(() => {
    setPageTitle('Farmasi');

    const run = async () => {
      setLoading(true);
      try {
        await loadOrders();
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: 'Gagal memuat ringkasan farmasi',
          description: requestError.response?.data?.error || 'Terjadi kesalahan saat memuat dashboard farmasi.',
        });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [loadOrders, toast]);

  const stats = useMemo(() => {
    const ordered = orders.filter((record) => record.prescription_workflow_status === 'ordered').length;
    const preparing = orders.filter((record) => record.prescription_workflow_status === 'preparing').length;
    const ready = orders.filter((record) => record.prescription_workflow_status === 'ready').length;
    const dispensed = orders.filter((record) => record.prescription_workflow_status === 'dispensed').length;
    const stockIssues = orders.filter((record) => getRecordStockIssueCount(record) > 0).length;
    const totalActiveValue = orders
      .filter((record) => ['ordered', 'preparing', 'ready'].includes(record.prescription_workflow_status || ''))
      .reduce((total, record) => total + getRecordTotalPrice(record), 0);

    return {
      ordered,
      preparing,
      ready,
      dispensed,
      stockIssues,
      totalActiveValue,
    };
  }, [orders]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6">
      {/* <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Button type="button" variant="outline" className="rounded-none" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          Muat Ulang
        </Button>
      </div> */}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <PharmacyStatCard label="Menunggu Diterima" value={String(stats.ordered)} helper="Resep internal baru yang menunggu diambil alih farmasi." />
        <PharmacyStatCard label="Sedang Diproses" value={String(stats.preparing)} helper="Resep yang sedang dicek stok, harga, dan kelengkapan itemnya." />
        <PharmacyStatCard label="Siap Diserahkan" value={String(stats.ready)} helper="Resep yang sudah selesai diproses dan tinggal diserahkan ke pasien." />
        <PharmacyStatCard label="Selesai" value={String(stats.dispensed)} helper="Jumlah resep yang sudah dispensing dan keluar dari antrean aktif." />
        <PharmacyStatCard label="Stok Bermasalah" value={String(stats.stockIssues)} helper="Order yang masih mengandung item dengan stok kurang." />
        <PharmacyStatCard label="Nilai Antrean Aktif" value={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(stats.totalActiveValue)} helper="Akumulasi nilai resep yang masih aktif di farmasi." />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {WORKFLOW_LINKS.map((item) => {
          const Icon = item.icon;
          const queueCountMap = {
            ordered: stats.ordered,
            preparing: stats.preparing,
            ready: stats.ready,
            dispensed: stats.dispensed,
          } as const;
          const queueCount = queueCountMap[item.key];

          return (
            <div key={item.href} className="border border-border/70 bg-background p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center border border-border/70 bg-muted/20">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Antrean</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{queueCount}</p>
                </div>
              </div>
              <div className="mt-5">
                <h2 className="text-base font-semibold tracking-tight">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </div>
              <div className="mt-5">
                <Button asChild className="w-full rounded-none">
                  <Link to={item.href}>
                    Buka Halaman
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="border border-border/70 bg-background p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Alur Kerja</p>
          <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>1. Terima resep untuk memastikan order dari EMR sudah lengkap dan benar.</p>
            <p>2. Proses resep untuk cek stok, tambah item jika perlu, dan siapkan obat.</p>
            <p>3. Serahkan resep untuk menyelesaikan dispensing dan pengurangan stok.</p>
          </div>
        </div>

        <div className="border border-border/70 bg-background p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fokus Hari Ini</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border border-border/70 bg-muted/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Prioritas</p>
              <p className="mt-2 text-base font-semibold tracking-tight">{stats.stockIssues} order butuh cek stok</p>
              <p className="mt-1 text-sm text-muted-foreground">Selesaikan kendala stok agar antrean proses tidak tertahan.</p>
            </div>
            <div className="border border-border/70 bg-muted/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Output</p>
              <p className="mt-2 text-base font-semibold tracking-tight">{stats.dispensed} resep selesai</p>
              <p className="mt-1 text-sm text-muted-foreground">Pantau ritme handover untuk menjaga waktu tunggu pasien tetap singkat.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}