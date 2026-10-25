import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, Plus, RefreshCw } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { physicalExamImagesApi, type PhysicalExamImageMaster } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { createPhysicalExamImageColumns } from './columns';

export default function PhysicalExamImagesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<PhysicalExamImageMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  useEffect(() => {
    setPageTitle('Template Gambar Pemeriksaan Fisik');
  }, []);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      setData((await physicalExamImagesApi.getAll()).data.data || []);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description: error.response?.data?.error || 'Gagal memuat template gambar.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) {
      return;
    }

    try {
      await physicalExamImagesApi.delete(itemToDelete);
      toast({ variant: 'success', title: 'Berhasil!' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error!',
        description: error.response?.data?.error || 'Gagal menghapus template gambar.',
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = useMemo(() => createPhysicalExamImageColumns({
    onEdit: (id) => navigate(`/physical-exam-images/${id}/edit`),
    onDelete: (id) => {
      setItemToDelete(id);
      setDeleteDialogOpen(true);
    },
    hasEditPermission: hasPermission('physical_exam_images.update'),
    hasDeletePermission: hasPermission('physical_exam_images.delete'),
  }), [hasPermission, navigate]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((item) =>
      item.name?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)
    );
  }, [data, search]);

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
              <Camera className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Template Gambar Pemeriksaan Fisik
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari template gambar..."
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

            {hasPermission('physical_exam_images.create') && (
              <Button
                type="button"
                size="sm"
                onClick={() => navigate('/physical-exam-images/create')}
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
                <Camera className="h-8 w-8" />
                <p>Belum ada template gambar pemeriksaan fisik.</p>
              </div>
            }
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus Template Gambar"
        description="Yakin hapus template gambar ini? Template yang sudah dipakai pada rekam medis tidak bisa dihapus."
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}