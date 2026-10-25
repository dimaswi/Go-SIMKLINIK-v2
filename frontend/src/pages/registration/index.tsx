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
  { value: 'waiting', label: 'Menunggu' },
  { value: 'called', label: 'Dipanggil' },
  { value: 'processing', label: 'Diproses' },
  { value: 'completed', label: 'Selesai' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

export default function RegistrationIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<RegistrationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
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


  const visibleData = useMemo(
    () => data,
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="border border-border/70 bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border/70 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border/70 bg-muted/20">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground">
                Pendaftaran Pasien
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Daftar antrian tiket yang siap diproses pendaftaran kunjungan poli.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTicket ? (
              <div className="flex items-center gap-1.5 border border-border/70 bg-muted/30 px-2.5 py-1 text-xs">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Aktif:</span>
                <span className="font-bold text-foreground">#{String(activeTicket.ticket_number).padStart(3, '0')}</span>
                <span className="text-[11px] text-muted-foreground">({STATUS_OPTIONS.find((item) => item.value === activeTicket.status)?.label || activeTicket.status})</span>
              </div>
            ) : null}

            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="h-9 w-36 border border-border/70 bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />

            <SearchableSelect
              options={STATUS_OPTIONS}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Status Tiket"
              noneLabel="Semua Status"
              className="h-9 w-36 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
              onClick={() => void loadData()}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Segarkan
            </Button>
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={visibleData}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            borderless
            pageSize={10}
            emptyMessage="Belum ada tiket yang dipanggil dari halaman antrian."
          />
        </div>
      </div>

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