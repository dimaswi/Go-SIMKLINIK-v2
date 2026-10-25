import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSpecimenTemplateColumns } from './columns';
import { specimenTemplatesApi, type SpecimenTemplate } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { FlaskConical, Loader2, Plus, RefreshCw } from 'lucide-react';

export default function SpecimenTemplatesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<SpecimenTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await specimenTemplatesApi.getAll();
      setData(res.data.data || []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error!', description: error instanceof Error ? error.message : 'Gagal memuat template specimen.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { setPageTitle('Template Specimen'); void loadData(); }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await specimenTemplatesApi.delete(itemToDelete);
      toast({ variant: 'success', title: 'Berhasil!', description: 'Template specimen berhasil dihapus.' });
      void loadData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal menghapus template specimen.' });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = useMemo(() => createSpecimenTemplateColumns({
    onView: (id) => navigate(`/specimen-templates/${id}`),
    onEdit: (id) => navigate(`/specimen-templates/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    hasViewPermission: hasPermission('medical_services.view'),
    hasEditPermission: hasPermission('medical_services.update'),
    hasDeletePermission: hasPermission('medical_services.delete'),
  }), [hasPermission, navigate]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((item) =>
      item.name?.toLowerCase().includes(q) ||
      item.code?.toLowerCase().includes(q) ||
      item.type_code?.toLowerCase().includes(q) ||
      item.type_display?.toLowerCase().includes(q)
    );
  }, [data, search]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Template Specimen
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari template atau SNOMED..."
              className="h-9 w-52 sm:w-60 rounded-none text-xs focus:ring-inset"
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Segarkan
            </Button>

            {hasPermission('medical_services.create') && (
              <Button
                type="button"
                size="sm"
                onClick={() => navigate('/specimen-templates/create')}
                className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Tambah Template
              </Button>
            )}
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={filteredData}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage={
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                <FlaskConical className="h-8 w-8" />
                <p>Belum ada template specimen.</p>
              </div>
            }
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus Template Specimen"
        description="Apakah Anda yakin ingin menghapus template specimen ini?"
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}