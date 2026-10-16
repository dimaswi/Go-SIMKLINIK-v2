import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { patientsApi, type Patient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { setPageTitle } from '@/lib/page-title';
import { Plus, Loader2, Users, RefreshCw } from 'lucide-react';
import { createColumns } from './columns';

export default function PatientsIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await patientsApi.getAll();
      setData(res.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data pasien.' });
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Data Pasien');
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    patientsApi.delete(deleteId)
      .then(() => { toast({ variant: 'success', title: 'Berhasil!', description: 'Pasien dihapus.' }); loadData(); })
      .catch((e: any) => toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal menghapus.' }))
      .finally(() => { setDeleteDialogOpen(false); setDeleteId(null); });
  };

  const columns = useMemo(() => createColumns((id) => { setDeleteId(id); setDeleteDialogOpen(true); }), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(p => {
      if (genderFilter && p.gender !== genderFilter) return false;
      if (insuranceFilter && (p.insurance_type || 'umum') !== insuranceFilter) return false;
      if (q) {
        const matchName = p.full_name?.toLowerCase().includes(q);
        const matchRm = p.medical_record_number?.toLowerCase().includes(q);
        const matchNik = p.nik?.toLowerCase().includes(q);
        const matchPhone = p.phone?.toLowerCase().includes(q);
        if (!matchName && !matchRm && !matchNik && !matchPhone) return false;
      }
      return true;
    });
  }, [data, genderFilter, insuranceFilter, search]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Data Pasien
              </h1>
              <p className="text-xs text-muted-foreground">
                Kelola master data pasien dan rekam medis ({filtered.length} pasien)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pasien / RM / NIK..."
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />
            <SearchableSelect
              options={[
                { value: '', label: 'Semua JK' },
                { value: 'L', label: 'Laki-laki' },
                { value: 'P', label: 'Perempuan' },
              ]}
              value={genderFilter}
              onValueChange={setGenderFilter}
              placeholder="Semua JK"
              className="h-9 w-32 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />
            <SearchableSelect
              options={[
                { value: '', label: 'Semua Asuransi' },
                { value: 'umum', label: 'Umum' },
                { value: 'bpjs', label: 'BPJS' },
                { value: 'asuransi', label: 'Asuransi' },
              ]}
              value={insuranceFilter}
              onValueChange={setInsuranceFilter}
              placeholder="Semua Asuransi"
              className="h-9 w-36 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
            >
              <RefreshCw className={refreshing ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
              Segarkan
            </Button>
            <Button
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
              onClick={() => navigate('/patients/create')}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Tambah Pasien
            </Button>
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={filtered}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Tidak ada data pasien yang sesuai."
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Hapus Pasien"
        description="Data pasien akan dihapus permanen jika tidak memiliki riwayat kunjungan."
        onConfirm={confirmDelete}
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}
