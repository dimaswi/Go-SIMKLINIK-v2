import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { registrationQueueApi, type RegistrationQueueItem } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { getLocalISODate } from '@/lib/utils';
import { createColumns } from './columns';

const STATUS_OPTIONS = [
  { value: 'called', label: 'Dipanggil' },
  { value: 'processing', label: 'Diproses' },
  { value: 'completed', label: 'Selesai' },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/70 bg-background px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

export default function RegistrationIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<RegistrationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('called');
  const [dateFilter, setDateFilter] = useState(getLocalISODate());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cancelId, setCancelId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (dateFilter) params.set('date', dateFilter);
      const response = await registrationQueueApi.getAll(params.toString());
      setData(response.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat antrian pendaftaran.' });
    } finally {
      setLoading(false);
    }
  }, [dateFilter, statusFilter, toast]);

  useEffect(() => {
    setPageTitle('Front Office · Proses Pendaftaran');
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const startProcessing = useCallback(async (item: RegistrationQueueItem, mode: 'existing' | 'new') => {
    navigate(`/registration/create?ticket_id=${item.id}&mode=${mode}`);
  }, [navigate]);

  const confirmCancel = useCallback(() => {
    if (!cancelId) {
      return;
    }

    registrationQueueApi.updateStatus(cancelId, { status: 'cancelled' })
      .then(() => {
        toast({ variant: 'success', title: 'Berhasil!', description: 'Tiket pendaftaran dibatalkan.' });
        void loadData();
      })
      .catch((error: any) => {
        toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal membatalkan tiket.' });
      })
      .finally(() => {
        setDeleteDialogOpen(false);
        setCancelId(null);
      });
  }, [cancelId, loadData, toast]);

  const queueStats = useMemo(() => ({
    called: data.filter((item) => item.status === 'called').length,
    processing: data.filter((item) => item.status === 'processing').length,
    completed: data.filter((item) => item.status === 'completed').length,
  }), [data]);

  const visibleData = useMemo(
    () => data.filter((item) => item.status === 'called' || item.status === 'processing' || item.status === 'completed'),
    [data]
  );

  const activeTicket = useMemo(
    () => data.find((item) => item.status === 'processing') || data.find((item) => item.status === 'called') || null,
    [data]
  );

  const columns = useMemo(() => createColumns({
    onProcess: startProcessing,
    onCancel: (item) => {
      setCancelId(item.id);
      setDeleteDialogOpen(true);
    },
  }), [startProcessing]);

  const tableToolbarActions = useMemo(() => (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto lg:overflow-visible">
      <div className="relative shrink-0">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className="h-9 w-[150px] border border-border/70 bg-background pl-10 pr-3 text-sm outline-none"
        />
      </div>
      <SearchableSelect
        options={STATUS_OPTIONS}
        value={statusFilter}
        onValueChange={setStatusFilter}
        placeholder="Status Tiket"
        noneLabel="Semua Status"
        className="w-[150px] shrink-0"
        square
      />
      <Button type="button" variant="outline" className="h-9 shrink-0 rounded-none shadow-none" onClick={() => void loadData()}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Muat Ulang
      </Button>
    </div>
  ), [dateFilter, loadData, statusFilter]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-var(--app-header-height))] min-h-0 flex-1 flex-col overflow-hidden gap-3 p-3 lg:p-4">
      <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-3">
        <StatCard label="Siap Diproses" value={String(queueStats.called)} />
        <StatCard label="Sedang Diproses" value={String(queueStats.processing)} />
        <StatCard label="Selesai" value={String(queueStats.completed)} />
      </section>

      <section className="border border-border/70 bg-background px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Proses Pendaftaran</p>
            <h1 className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">Tiket yang sudah dipanggil dari halaman antrian diproses di sini.</h1>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            <div className="min-w-[120px] border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tiket Aktif</p>
              <p className="mt-1 text-3xl font-black leading-none tracking-tight text-foreground">
                {activeTicket ? String(activeTicket.ticket_number).padStart(3, '0') : '---'}
              </p>
            </div>
            <div className="min-w-[180px] border border-border/70 bg-muted/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <p>Status: {activeTicket ? STATUS_OPTIONS.find((item) => item.value === activeTicket.status)?.label || activeTicket.status : '-'}</p>
              <p>Dipanggil: {activeTicket?.called_at ? new Date(activeTicket.called_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
              <p className="text-foreground">Yang muncul di sini hanya tiket yang sudah dipanggil dari halaman Antrian.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/70 bg-background px-4 py-3">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Daftar Tiket Pendaftaran</p>
            <h2 className="mt-0.5 text-base font-semibold tracking-tight">Tiket yang sudah masuk ke tahap pendaftaran</h2>
          </div>
          {tableToolbarActions}
        </div>

        <DataTable
          columns={columns}
          data={visibleData}
          showSearch={false}
          pageSize={10}
          showSelectionSummary={false}
          emptyMessage="Belum ada tiket yang dipanggil dari halaman antrian."
          className="min-h-0 flex-1"
        />
      </section>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Batalkan Tiket"
        description="Tiket pendaftaran ini akan dibatalkan dan tidak bisa diproses lagi. Lanjutkan?"
        onConfirm={confirmCancel}
        confirmText="Batalkan Tiket"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}