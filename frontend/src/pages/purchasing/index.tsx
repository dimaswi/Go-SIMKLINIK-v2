import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { purchaseOrdersApi, suppliersApi, type PurchaseOrder, type Supplier } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ClipboardList, Loader2, Plus, ReceiptText, Truck, Wallet } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { createColumns } from './columns';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  ordered: 'Dipesan',
  partial: 'Diterima Sebagian',
  received: 'Diterima',
};

function formatCurrency(value: number) {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export default function PurchasingIndex() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (supplierFilter) params.set('supplier_id', supplierFilter);
      const res = await purchaseOrdersApi.getAll(params.toString());
      setData(res.data.data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data.' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, supplierFilter, toast]);

  useEffect(() => {
    setPageTitle('Pembelian');
    suppliersApi.getAll().then(res => setSuppliers(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const confirmDelete = () => {
    if (!deleteId) return;
    purchaseOrdersApi.delete(deleteId)
      .then(() => { toast({ variant: 'success', title: 'Berhasil!', description: 'Purchase order dihapus.' }); loadData(); })
      .catch((e: any) => toast({ variant: 'destructive', title: 'Error!', description: e.response?.data?.error || 'Gagal menghapus.' }))
      .finally(() => { setDeleteDialogOpen(false); setDeleteId(null); });
  };

  const columns = createColumns((id) => { setDeleteId(id); setDeleteDialogOpen(true); });
  const totalPurchaseOrders = data.length;
  const totalAmount = data.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const draftCount = data.filter((item) => item.status === 'draft').length;
  const completedCount = data.filter((item) => item.status === 'received').length;
  const activeFilterBadges = [
    statusFilter ? `Status: ${STATUS_LABELS[statusFilter] || statusFilter}` : '',
    supplierFilter ? `Supplier: ${suppliers.find((item) => String(item.id) === supplierFilter)?.name || supplierFilter}` : '',
  ].filter(Boolean);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total Purchase Order" value={String(totalPurchaseOrders)} helper="Jumlah PO pada hasil filter aktif." icon={ClipboardList} />
        <SummaryCard title="Nilai Purchase" value={formatCurrency(totalAmount)} helper="Akumulasi nominal PO yang tampil saat ini." icon={Wallet} />
        <SummaryCard title="Masih Draft" value={String(draftCount)} helper="PO yang masih bisa diedit atau dihapus." icon={ReceiptText} />
        <SummaryCard title="Sudah Diterima" value={String(completedCount)} helper="PO yang sudah selesai diterima di gudang." icon={Truck} />
      </section>

      <section className="flex flex-col overflow-visible border border-border/70 bg-background md:min-h-0 md:flex-1 md:overflow-hidden">
        <div className="shrink-0 border-b border-border/70 px-4 py-4 lg:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Daftar Purchase Order</h2>
              <p className="text-[11px] leading-5 text-muted-foreground">Pantau draft, pesanan yang sedang diproses supplier, sampai PO yang sudah diterima penuh dalam satu tabel kerja.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">
                {totalPurchaseOrders} data
              </Badge>
              {activeFilterBadges.map((item) => (
                <Badge key={item} variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 md:min-h-0 md:flex-1 lg:p-5">
          <DataTable
            className="md:h-full"
            columns={columns}
            data={data}
            fixedLayout
            searchPlaceholder="Cari nomor PO atau supplier..."
            pageSize={10}
            showSelectionSummary={false}
            emptyMessage="Belum ada purchase order yang sesuai dengan filter aktif."
            toolbarActions={
              <>
                <div className="w-full sm:w-44">
                  <SearchableSelect
                    options={[
                      { value: 'draft', label: 'Draft' },
                      { value: 'ordered', label: 'Dipesan' },
                      { value: 'partial', label: 'Diterima Sebagian' },
                      { value: 'received', label: 'Diterima' },
                    ]}
                    value={statusFilter}
                    onValueChange={setStatusFilter}
                    placeholder="Semua Status"
                    searchPlaceholder="Cari status..."
                    noneLabel="Semua Status"
                  />
                </div>
                <div className="w-full sm:w-48">
                  <SearchableSelect
                    options={suppliers.filter((supplier) => supplier.is_active).map((supplier) => ({ value: String(supplier.id), label: supplier.name }))}
                    value={supplierFilter}
                    onValueChange={setSupplierFilter}
                    placeholder="Semua Supplier"
                    searchPlaceholder="Cari supplier..."
                    noneLabel="Semua Supplier"
                  />
                </div>
                <Button onClick={() => navigate('/purchasing/create')} className="w-full rounded-none shadow-none sm:w-auto">
                  <Plus className="h-4 w-4" />Buat PO
                </Button>
              </>
            }
          />
        </div>
      </section>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Hapus Purchase Order"
        description="Purchase order ini akan dihapus permanen. Lanjutkan?"
        onConfirm={confirmDelete}
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: typeof ClipboardList;
}) {
  return (
    <div className="border border-border/70 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
          <p className="text-xl font-semibold text-foreground">{value}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center border border-border/70 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{helper}</p>
    </div>
  );
}
