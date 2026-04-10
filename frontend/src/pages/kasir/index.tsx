import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { getLocalISODate } from '@/lib/utils';
import { billingApi } from '@/lib/api';
import type { CashierQueueItem, Invoice } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { formatCurrency, formatDateTime } from './utils';
import { ArrowRight, Eye, Loader2, Plus, Printer, RefreshCw } from 'lucide-react';

// ── Status helpers ─────────────────────────────────────────────────────────

const INVOICE_STATUS_LABEL: Record<string, string> = {
  belum_bayar: 'Belum Bayar',
  sebagian: 'Bayar Sebagian',
  lunas: 'Lunas',
  batal: 'Dibatalkan',
};

const INVOICE_STATUS_CLASS: Record<string, string> = {
  belum_bayar: 'border-red-300 bg-red-50 text-red-700',
  sebagian: 'border-amber-300 bg-amber-50 text-amber-700',
  lunas: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  batal: 'border-slate-300 bg-slate-50 text-slate-500',
};

// ── Kasir stat card ─────────────────────────────────────────────────────────

function KasirStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/70 bg-background px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-2 text-lg font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function KasirIndexPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [queue, setQueue] = useState<CashierQueueItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [date, setDate] = useState(getLocalISODate());
  const [search] = useState('');
  // search field: DataTable has built-in search; state kept for API call
  const [statusFilter, setStatusFilter] = useState('');
  const [syncingVisitId, setSyncingVisitId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<'queue' | 'invoices'>('queue');

  const loadData = useCallback(async () => {
    const [queueRes, invoiceParams] = await Promise.all([
      billingApi.getQueue(date, search),
      (() => {
        const params = new URLSearchParams({ per_page: '10' });
        if (statusFilter) params.append('status', statusFilter);
        if (search) params.append('search', search);
        return billingApi.getAll(params.toString());
      })(),
    ]);
    setQueue(queueRes.data?.data || []);
    setInvoices(invoiceParams.data?.data || []);
    return { queue: queueRes.data?.data || [], invoices: invoiceParams.data?.data || [] };
  }, [date, search, statusFilter]);

  useEffect(() => {
    setPageTitle('Kasir');
    const run = async () => {
      setLoading(true);
      try {
        await loadData();
      } catch (error) {
        const requestError = error as AxiosError<{ error?: string }>;
        toast({
          variant: 'destructive',
          title: 'Gagal memuat data kasir',
          description: requestError.response?.data?.error || 'Terjadi kesalahan saat memuat antrean kasir.',
        });
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [loadData, toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch {
      toast({ variant: 'destructive', title: 'Gagal memuat ulang data kasir' });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSyncInvoice = useCallback(async (visitId: number) => {
    setSyncingVisitId(visitId);
    try {
      const res = await billingApi.syncVisit(visitId);
      toast({ title: res.data?.message || 'Invoice berhasil dibuat' });
      const refreshed = await loadData();
      // Navigate to the new invoice
      const createdInvoice = refreshed.invoices.find(inv => inv.visit_id === visitId);
      if (createdInvoice) {
        navigate(`/kasir/${createdInvoice.id}`);
      }
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal membuat invoice',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat membuat invoice.',
      });
    } finally {
      setSyncingVisitId(null);
    }
  }, [loadData, navigate, toast]);

  const handlePrint = useCallback(async (invoiceId: number) => {
    try {
      const res = await billingApi.print(invoiceId);
      const blob = new Blob([res.data as ArrayBuffer], { type: 'application/pdf' });
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      toast({ variant: 'destructive', title: 'Gagal mencetak invoice' });
    }
  }, [toast]);

  // ── Stats derived from loaded data ──
  const stats = useMemo(() => {
    const belumBayar = invoices.filter(i => i.status === 'belum_bayar').length;
    const sebagian = invoices.filter(i => i.status === 'sebagian').length;
    const lunas = invoices.filter(i => i.status === 'lunas').length;
    const revenue = invoices
      .filter(i => i.status === 'lunas' || i.status === 'sebagian')
      .reduce((sum, i) => sum + i.paid_amount, 0);
    const pending = invoices
      .filter(i => i.status === 'belum_bayar' || i.status === 'sebagian')
      .reduce((sum, i) => sum + (i.total_amount - i.paid_amount), 0);
    return { total: invoices.length, belumBayar, sebagian, lunas, revenue, pending };
  }, [invoices]);

  // ── Queue columns ──
  const queueColumns: ColumnDef<CashierQueueItem>[] = useMemo(() => [
    {
      id: 'antrian',
      header: 'Antrian',
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold">
          {String(row.original.visit.queue_number || 0).padStart(3, '0')}
        </span>
      ),
    },
    {
      id: 'pasien',
      header: 'Pasien',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.visit.patient?.full_name || '-'}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.original.visit.patient?.medical_record_number || '-'}</p>
        </div>
      ),
    },
    {
      id: 'kunjungan',
      header: 'Kunjungan',
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs text-muted-foreground">{row.original.visit.visit_number}</p>
          <p className="text-xs text-muted-foreground">{row.original.visit.polyclinic?.name || '-'}</p>
        </div>
      ),
    },
    {
      id: 'dokter',
      header: 'Dokter',
      cell: ({ row }) => (
        <p className="text-sm">{row.original.visit.doctor?.full_name || '-'}</p>
      ),
    },
    {
      id: 'status_invoice',
      header: 'Status Invoice',
      cell: ({ row }) => (
        row.original.has_invoice ? (
          <Badge variant="outline" className={`rounded-none shadow-none ${INVOICE_STATUS_CLASS[row.original.invoice_status] || ''}`}>
            {INVOICE_STATUS_LABEL[row.original.invoice_status] || row.original.invoice_status}
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-none shadow-none border-slate-200 bg-slate-50 text-slate-400">
            Belum Ada Invoice
          </Badge>
        )
      ),
    },
    {
      id: 'total',
      header: 'Total',
      cell: ({ row }) => (
        row.original.has_invoice
          ? <span className="text-sm font-medium">{formatCurrency(row.original.total_amount)}</span>
          : <span className="text-muted-foreground">-</span>
      ),
    },
    {
      id: 'sisa',
      header: 'Sisa',
      cell: ({ row }) => {
        const sisa = row.original.total_amount - row.original.paid_amount;
        return row.original.has_invoice && sisa > 0
          ? <span className="text-sm text-red-600 font-medium">{formatCurrency(sisa)}</span>
          : <span className="text-muted-foreground">-</span>;
      },
    },
    {
      id: 'aksi',
      header: '',
      cell: ({ row }) => {
        const item = row.original;
        if (!item.has_invoice) {
          return (
            <Button
              size="sm"
              className="rounded-none shadow-none"
              disabled={syncingVisitId === item.visit.id}
              onClick={() => void handleSyncInvoice(item.visit.id)}
            >
              {syncingVisitId === item.visit.id
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Plus className="mr-1.5 h-4 w-4" />}
              Buat Invoice
            </Button>
          );
        }
        return (
          <Button
            size="sm"
            variant="outline"
            className="rounded-none shadow-none"
            onClick={() => navigate(`/kasir/${item.invoice_id}`)}
          >
            <ArrowRight className="mr-1.5 h-4 w-4" />
            {item.invoice_status === 'lunas' ? 'Lihat' : 'Proses'}
          </Button>
        );
      },
    },
  ], [handleSyncInvoice, navigate, syncingVisitId]);

  // ── Invoice columns ──
  const invoiceColumns: ColumnDef<Invoice>[] = useMemo(() => [
    {
      accessorKey: 'invoice_number',
      header: 'No. Invoice',
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.invoice_number}</span>
      ),
    },
    {
      id: 'pasien',
      header: 'Pasien',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.patient?.full_name || '-'}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.original.patient?.medical_record_number || '-'}</p>
        </div>
      ),
    },
    {
      id: 'tanggal',
      header: 'Tanggal',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(row.original.invoice_date)}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={`rounded-none shadow-none ${INVOICE_STATUS_CLASS[row.original.status] || ''}`}
        >
          {INVOICE_STATUS_LABEL[row.original.status] || row.original.status}
        </Badge>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      cell: ({ row }) => (
        <span className="text-sm font-medium">{formatCurrency(row.original.total_amount)}</span>
      ),
    },
    {
      id: 'dibayar',
      header: 'Dibayar',
      cell: ({ row }) => (
        <span className="text-sm text-emerald-600">{formatCurrency(row.original.paid_amount)}</span>
      ),
    },
    {
      id: 'sisa',
      header: 'Sisa',
      cell: ({ row }) => {
        const sisa = row.original.total_amount - row.original.paid_amount;
        return sisa > 0
          ? <span className="text-sm text-red-600 font-medium">{formatCurrency(sisa)}</span>
          : <span className="text-muted-foreground">-</span>;
      },
    },
    {
      id: 'aksi',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="rounded-none shadow-none"
            onClick={() => navigate(`/kasir/${row.original.id}`)}
          >
            <Eye className="mr-1.5 h-4 w-4" />
            {row.original.status === 'lunas' ? 'Lihat' : 'Proses'}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-none shadow-none"
            onClick={() => void handlePrint(row.original.id)}
          >
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [handlePrint, navigate]);

  // ── Render ──
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6">
      {/* Stat cards */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <KasirStatCard
          label="Total Invoice"
          value={String(stats.total)}
        />
        <KasirStatCard
          label="Lunas"
          value={String(stats.lunas)}
        />
        <KasirStatCard
          label="Bayar Sebagian"
          value={String(stats.sebagian)}
        />
        <KasirStatCard
          label="Belum Bayar"
          value={String(stats.belumBayar)}
        />
        <KasirStatCard
          label="Hari Ini"
          value={formatCurrency(stats.revenue)}
        />
        <KasirStatCard
          label="Pending"
          value={formatCurrency(stats.pending)}
        />
      </section>

      {/* View switcher + filters */}
      <section className="border border-border/70 bg-background px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex items-center gap-1 rounded-none border border-border/70 xl:min-w-[420px]">
              <button
                type="button"
                onClick={() => setActiveView('queue')}
                className={`flex-1 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${activeView === 'queue' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Antrian Kasir ({queue.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveView('invoices')}
                className={`flex-1 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${activeView === 'invoices' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Invoice ({invoices.length})
              </button>
            </div>
            {activeView === 'queue' ? (
              <div className="w-full sm:w-[220px] xl:w-[220px]">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-none"
                />
              </div>
            ) : (
              <div className="inline-flex min-h-10 items-center border border-dashed border-border/70 px-3 text-xs text-muted-foreground xl:max-w-[280px]">
                Menampilkan 10 invoice terbaru tanpa filter tanggal.
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
            <div className="w-full sm:w-[220px]">
              <SearchableSelect
                options={[
                  { value: 'belum_bayar', label: 'Belum Bayar' },
                  { value: 'sebagian', label: 'Bayar Sebagian' },
                  { value: 'lunas', label: 'Lunas' },
                  { value: 'batal', label: 'Dibatalkan' },
                ]}
                value={statusFilter}
                onValueChange={setStatusFilter}
                placeholder="Semua Status"
                noneLabel="Semua Status"
                square
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-none shadow-none sm:self-stretch"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Muat Ulang
            </Button>
          </div>
        </div>
      </section>

      {/* DataTable */}
      <section className="flex min-h-0 flex-1 flex-col">
        {activeView === 'queue' ? (
          <DataTable
            columns={queueColumns}
            data={queue}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={15}
            emptyMessage="Tidak ada kunjungan yang menunggu kasir hari ini."
            className="min-h-0 flex-1"
          />
        ) : (
          <DataTable
            columns={invoiceColumns}
            data={invoices}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Tidak ada invoice untuk filter yang dipilih."
            className="min-h-0 flex-1"
          />
        )}
      </section>
    </div>
  );
}
