import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { purchaseOrdersApi, suppliersApi, medicinesApi, type Supplier, type Medicine } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, ShoppingCart } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { getLocalISODate } from '@/lib/utils';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataLegacySections, MasterDataPageShell } from '@/pages/master-data/shared';

const PURCHASE_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft (belum dikirim ke supplier)' },
  { value: 'ordered', label: 'Dipesan (sudah dikirim ke supplier)' },
];

const getPurchaseStatusLabel = (value: string) => PURCHASE_STATUS_OPTIONS.find(option => option.value === value)?.label || value;

interface ItemRow {
  medicine_id: number;
  medicine_name: string;
  quantity: number;
  unit_price: number;
}

export default function PurchasingCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [formData, setFormData] = useState({
    supplier_id: '',
    order_date: getLocalISODate(),
    status: 'ordered',
    notes: '',
  });
  const [items, setItems] = useState<ItemRow[]>([
    { medicine_id: 0, medicine_name: '', quantity: 1, unit_price: 0 },
  ]);

  useEffect(() => {
    setPageTitle('Buat Purchase Order');
    Promise.all([
      suppliersApi.getAll(),
      medicinesApi.getAll('per_page=500&is_active=true'),
    ]).then(([sRes, mRes]) => {
      setSuppliers(sRes.data.data);
      setMedicines(mRes.data.data || []);
    }).catch(() => {});
  }, []);

  const addItem = () => setItems(prev => [...prev, { medicine_id: 0, medicine_name: '', quantity: 1, unit_price: 0 }]);

  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof ItemRow, value: number | string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === 'medicine_id') {
        const med = medicines.find(m => m.id === Number(value));
        return { ...item, medicine_id: Number(value), medicine_name: med?.name || '', unit_price: med?.purchase_price || item.unit_price };
      }
      return { ...item, [field]: value };
    }));
  };

  const totalAmount = items.reduce((sum, r) => sum + r.quantity * r.unit_price, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplier_id) {
      toast({ variant: 'destructive', title: 'Error!', description: 'Pilih supplier terlebih dahulu.' });
      return;
    }
    const validItems = items.filter(r => r.medicine_id > 0 && r.quantity > 0);
    if (validItems.length === 0) {
      toast({ variant: 'destructive', title: 'Error!', description: 'Tambahkan minimal 1 item obat.' });
      return;
    }
    setLoading(true);
    try {
      await purchaseOrdersApi.create({
        supplier_id: Number(formData.supplier_id),
        order_date: formData.order_date,
        status: formData.status,
        notes: formData.notes,
        items: validItems.map(r => ({
          medicine_id: r.medicine_id,
          quantity: Number(r.quantity),
          unit_price: Number(r.unit_price),
        })),
      });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Purchase order berhasil dibuat.' });
      setTimeout(() => navigate('/purchasing'), 400);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error!', description: err.response?.data?.error || 'Gagal membuat PO.' });
    } finally {
      setLoading(false);
    }
  };

  const medicineOptions = medicines.map(m => ({ value: String(m.id), label: `${m.name}${m.strength ? ` ${m.strength}` : ''}` }));
  const selectedSupplier = suppliers.find(supplier => String(supplier.id) === formData.supplier_id) || null;
  const validItemCount = items.filter(row => row.medicine_id > 0).length;

  return (
    <form id="purchase-order-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Buat Purchase Order"
        subtitle="Susun pesanan obat ke supplier, lengkapi item, lalu simpan sebagai draft atau PO yang sudah dikirim."
        onBack={() => navigate('/purchasing')}
        actions={<Button type="submit" form="purchase-order-create-form" disabled={loading} className="rounded-none shadow-none">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan PO</Button>}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan" helper="Pantau supplier, status, dan total pesanan sebelum PO dibuat.">
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">Supplier: <span className="text-foreground font-medium">{selectedSupplier?.name || '-'}</span></p>
                  <p className="text-muted-foreground">Items: <span className="text-foreground font-medium">{validItemCount}</span></p>
                  <p className="text-muted-foreground">Status: <span className="text-foreground font-medium">{getPurchaseStatusLabel(formData.status)}</span></p>
                  <p className="text-muted-foreground">Tanggal: <span className="text-foreground font-medium">{formData.order_date || '-'}</span></p>
                  <p className="pt-2 font-semibold">Total: Rp {totalAmount.toLocaleString('id-ID')}</p>
                </div>
              </MasterDataAsideSection>
            </div>

            <div>
              <MasterDataAsideSection title="Catatan" helper="Status draft masih bisa diedit. Status dipesan siap diproses pada halaman detail PO.">
                <p className="text-sm text-muted-foreground">Harga beli akan terisi otomatis dari master obat, tetapi masih bisa disesuaikan per baris sebelum disimpan.</p>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                Informasi Pemesanan
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs font-medium">Supplier <span className="text-destructive">*</span></Label>
                  <SearchableSelect
                    options={suppliers.filter(s => s.is_active).map(s => ({ value: String(s.id), label: s.name }))}
                    value={formData.supplier_id}
                    onValueChange={v => setFormData({ ...formData, supplier_id: v })}
                    placeholder="Pilih supplier..."
                    searchPlaceholder="Cari supplier..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="order_date" className="text-xs font-medium">Tanggal Pesan</Label>
                  <Input
                    id="order_date"
                    type="date"
                    value={formData.order_date}
                    onChange={e => setFormData({ ...formData, order_date: e.target.value })}
                    className="h-10 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Status</Label>
                  <SearchableSelect
                    options={PURCHASE_STATUS_OPTIONS}
                    value={formData.status}
                    onValueChange={value => setFormData({ ...formData, status: value })}
                    placeholder="Pilih status..."
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="notes" className="text-xs font-medium">Catatan</Label>
                  <Input
                    id="notes"
                    placeholder="Catatan tambahan..."
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="h-10 text-sm"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Daftar Obat</p>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Tambah Baris
                </Button>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="w-[40%] px-3 py-2 text-left text-xs font-medium text-muted-foreground">Obat</th>
                      <th className="w-24 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="w-36 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Harga Beli (Rp)</th>
                      <th className="w-32 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Subtotal</th>
                      <th className="w-10 px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <SearchableSelect
                            options={medicineOptions}
                            value={item.medicine_id ? String(item.medicine_id) : ''}
                            onValueChange={v => updateItem(idx, 'medicine_id', v)}
                            placeholder="Pilih obat..."
                            searchPlaceholder="Cari obat..."
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                            className="ml-auto h-9 w-20 text-right text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            value={item.unit_price}
                            onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                            className="h-9 text-right text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {(item.quantity * item.unit_price).toLocaleString('id-ID')}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeItem(idx)}
                            disabled={items.length === 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold">Total</td>
                      <td className="px-3 py-2 text-right text-sm font-bold">Rp {totalAmount.toLocaleString('id-ID')}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </form>
  );
}
