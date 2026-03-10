import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { visitsApi, polyclinicsApi, type Visit, type Polyclinic } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { createColumns } from './columns';

const STATUS_OPTIONS = [
  { value: 'registered',  label: 'Terdaftar' },
  { value: 'in_progress', label: 'Konsultasi' },
  { value: 'completed',   label: 'Selesai' },
  { value: 'cancelled',   label: 'Dibatalkan' },
];

const QUEUE_OPTIONS = [
  { value: 'waiting',         label: 'Menunggu' },
  { value: 'in_consultation', label: 'Konsultasi' },
  { value: 'done',            label: 'Selesai' },
  { value: 'cancelled',       label: 'Dibatalkan' },
];

export default function RegistrationIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<Visit[]>([]);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [queueFilter, setQueueFilter] = useState('');
  const [poliFilter, setPoliFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (queueFilter) params.set('queue_status', queueFilter);
      if (poliFilter) params.set('polyclinic_id', poliFilter);
      if (dateFilter) params.set('date', dateFilter);
      const res = await visitsApi.getAll(params.toString());
      setData(res.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data kunjungan.' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, queueFilter, poliFilter, dateFilter, toast]);

  useEffect(() => {
    setPageTitle('Pendaftaran Kunjungan');
    polyclinicsApi.getAll().then(r => setPolyclinics(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const confirmDelete = () => {
    if (!deleteId) return;
    visitsApi.delete(deleteId)
      .then(() => {
        toast({ variant: 'success', title: 'Berhasil!', description: 'Kunjungan berhasil dihapus.' });
        loadData();
      })
      .catch((e: any) => toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal menghapus.' }))
      .finally(() => { setDeleteDialogOpen(false); setDeleteId(null); });
  };

  const columns = createColumns((id) => { setDeleteId(id); setDeleteDialogOpen(true); });

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Cari nama pasien, no. kunjungan, no. RM..."
        pageSize={20}
        toolbarActions={
          <>
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <SearchableSelect
              options={polyclinics.map(p => ({ value: String(p.id), label: p.name }))}
              value={poliFilter}
              onValueChange={setPoliFilter}
              placeholder="Semua Poli"
              searchPlaceholder="Cari poli..."
              noneLabel="Semua Poli"
              className="w-44"
            />
            <SearchableSelect
              options={QUEUE_OPTIONS}
              value={queueFilter}
              onValueChange={setQueueFilter}
              placeholder="Status Antrian"
              noneLabel="Semua Antrian"
              className="w-44"
            />
            <SearchableSelect
              options={STATUS_OPTIONS}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Status Kunjungan"
              noneLabel="Semua Status"
              className="w-44"
            />
            <Button onClick={() => navigate('/registration/create')}>
              <Plus className="h-4 w-4" />Pendaftaran
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Hapus Kunjungan"
        description="Data kunjungan ini akan dihapus permanen. Lanjutkan?"
        onConfirm={confirmDelete}
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}
