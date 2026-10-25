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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowRight, Eye, FileSpreadsheet, FileText, Loader2, Plus, Printer, Receipt, RefreshCw } from 'lucide-react';

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
        const params = new URLSearchParams({ per_page: '50' });
        if (statusFilter) params.append('status', statusFilter);
        if (search) params.append('search', search);
        if (date) {
          params.append('date_from', date);
          params.append('date_to', date);
        }
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

  const handlePrint = useCallback(async (invoiceId: number, format: 'a4' | 'a5' | 'thermal' = 'a4') => {
    try {
      const res = await billingApi.print(invoiceId, format);
      const blob = new Blob([res.data as ArrayBuffer], { type: 'application/pdf' });
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      toast({ variant: 'destructive', title: 'Gagal mencetak kwitansi' });
    }
  }, [toast]);


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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-none shadow-none"
                title="Cetak Kwitansi"
              >
                <Printer className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-none shadow-lg">
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Format Kwitansi
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handlePrint(row.original.id, 'a4')} className="gap-2.5 cursor-pointer py-1.5">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="text-xs">Kwitansi A4</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handlePrint(row.original.id, 'a5')} className="gap-2.5 cursor-pointer py-1.5">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-xs">Kwitansi A5</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handlePrint(row.original.id, 'thermal')} className="gap-2.5 cursor-pointer py-1.5">
                <Receipt className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-xs">Struk Thermal (80mm)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Kasir & Billing
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-none border border-border/70 p-0.5">
              <button
                type="button"
                onClick={() => setActiveView('queue')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${activeView === 'queue' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Antrean Kasir ({queue.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveView('invoices')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${activeView === 'invoices' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Invoice ({invoices.length})
              </button>
            </div>

            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-36 rounded-none text-xs shrink-0"
              title="Filter tanggal transaksi"
            />

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
              className="h-9 w-36 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Segarkan
            </Button>
          </div>
        </div>

        <div className="p-0">
          {activeView === 'queue' ? (
            <DataTable
              columns={queueColumns}
              data={queue}
              showSearch={false}
              showColumnVisibility={false}
              showSelectionSummary={false}
              pageSize={10}
              emptyMessage="Tidak ada kunjungan yang menunggu kasir hari ini."
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
