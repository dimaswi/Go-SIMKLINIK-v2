import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { patientsApi, type Patient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, Users } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { createColumns } from './columns';

export default function PatientsIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [genderFilter, setGenderFilter] = useState('');
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await patientsApi.getAll();
      setData(res.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data pasien.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle('Data Pasien');
    loadData();
  }, [loadData]);

  const confirmDelete = () => {
    if (!deleteId) return;
    patientsApi.delete(deleteId)
      .then(() => { toast({ variant: 'success', title: 'Berhasil!', description: 'Pasien dihapus.' }); loadData(); })
      .catch((e: any) => toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal menghapus.' }))
      .finally(() => { setDeleteDialogOpen(false); setDeleteId(null); });
  };

  const columns = createColumns((id) => { setDeleteId(id); setDeleteDialogOpen(true); });

  const filtered = data.filter(p => {
    if (genderFilter && p.gender !== genderFilter) return false;
    if (insuranceFilter && (p.insurance_type || 'umum') !== insuranceFilter) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="Cari nama, NIK, atau No. RM..."
        pageSize={20}
        toolbarActions={
          <>
            <SearchableSelect
              options={[
                { value: 'L', label: 'Laki-laki' },
                { value: 'P', label: 'Perempuan' },
              ]}
              value={genderFilter}
              onValueChange={setGenderFilter}
              placeholder="Semua JK"
              noneLabel="Semua JK"
              className="w-36"
            />
            <SearchableSelect
              options={[
                { value: 'umum', label: 'Umum' },
                { value: 'bpjs', label: 'BPJS' },
                { value: 'asuransi', label: 'Asuransi' },
              ]}
              value={insuranceFilter}
              onValueChange={setInsuranceFilter}
              placeholder="Semua Asuransi"
              noneLabel="Semua Asuransi"
              className="w-44"
            />
            <Button onClick={() => navigate('/patients/create')}>
              <Plus className="h-4 w-4" />Tambah Pasien
            </Button>
          </>
        }
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
        <Users className="h-4 w-4" />
        <span>Total {data.length} pasien terdaftar</span>
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
