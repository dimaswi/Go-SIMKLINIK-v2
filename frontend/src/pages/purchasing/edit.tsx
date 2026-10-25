import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { purchaseOrdersApi, suppliersApi, medicinesApi, type Supplier, type Medicine } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell } from '@/pages/master-data/shared';
import { PURCHASE_STATUS_OPTIONS } from './constants';

interface ItemRow {
  medicine_id: number;
  quantity: number;
  unit_price: number;
}

export default function PurchaseOrderEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  const [formData, setFormData] = useState({
    supplier_id: '',
    order_date: '',
    status: 'draft',
    notes: '',
  });

  const [items, setItems] = useState<ItemRow[]>([]);

  useEffect(() => {
    setPageTitle('Edit Purchase Order');
    Promise.all([
      purchaseOrdersApi.getById(Number(id)),
      suppliersApi.getAll(),
      medicinesApi.getAll(),
    ]).then(([poRes, sRes, mRes]) => {
      const po = poRes.data.data;
      if (po.status !== 'draft') {
        toast({ variant: 'destructive', title: 'Perhatian', description: 'Hanya PO draft yang bisa diedit.' });
        navigate(`/purchasing/${id}`);
        return;
      }
      setFormData({
        supplier_id: String(po.supplier_id),
        order_date: po.order_date ? po.order_date.split('T')[0] : '',
        status: po.status,
        notes: po.notes || '',
      });
      setItems(
        po.items && po.items.length > 0
          ? po.items.map((it: any) => ({
              medicine_id: it.medicine_id,
              quantity: it.quantity,
              unit_price: it.unit_price,
            }))
          : [{ medicine_id: 0, quantity: 1, unit_price: 0 }]
      );
      setSuppliers(sRes.data.data);
      setMedicines(mRes.data.data);
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat PO.' });
    }).finally(() => {
      setFetching(false);
    });
  }, [id]);

  const addItem = () => {
    setItems(prev => [...prev, { medicine_id: 0, quantity: 1, unit_price: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemRow, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const parsedValue = field === 'medicine_id' || field === 'quantity' || field === 'unit_price' ? Number(value) : value;
      const row = { ...updated[index], [field]: parsedValue };
      if (field === 'medicine_id') {
        const med = medicines.find(m => m.id === Number(value));
        if (med) {
          row.unit_price = med.purchase_price || 0;
        }
      }
      updated[index] = row;
      return updated;
    });
  };

  const totalAmount = items.reduce((sum, r) => sum + (r.quantity * r.unit_price), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplier_id) {
      toast({ variant: 'destructive', title: 'Error!', description: 'Pilih supplier.' });
      return;
    }
    const validItems = items.filter(r => Number(r.medicine_id) > 0 && Number(r.quantity) > 0);
    if (validItems.length === 0) {
      toast({ variant: 'destructive', title: 'Error!', description: 'Tambahkan minimal 1 item obat.' });
      return;
    }
    setLoading(true);
    try {
      await purchaseOrdersApi.update(Number(id), {
        supplier_id: Number(formData.supplier_id),
        order_date: formData.order_date,
        status: formData.status,
        notes: formData.notes,
        items: validItems.map(r => ({
          medicine_id: Number(r.medicine_id),
          quantity: Number(r.quantity),
          unit_price: Number(r.unit_price),
        })),
      });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Purchase order diperbarui.' });
      setTimeout(() => navigate(`/purchasing/${id}`), 400);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error!', description: err.response?.data?.error || 'Gagal.' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const medicineOptions = medicines.map(m => ({ value: String(m.id), label: `${m.name}${m.strength ? ` ${m.strength}` : ''}` }));

  return (
    <form id="purchase-order-edit-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Edit Purchase Order"
        subtitle="Perbarui supplier, item, dan catatan PO draft."
        onBack={() => navigate(`/purchasing/${id}`)}
        actions={
          <Button type="submit" form="purchase-order-edit-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Update PO
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Pemesanan</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Supplier *</Label>
                <SearchableSelect
                  options={suppliers.filter(s => s.is_active).map(s => ({ value: String(s.id), label: s.name }))}
                  value={formData.supplier_id}
                  onValueChange={v => setFormData({ ...formData, supplier_id: v })}
                  placeholder="Pilih supplier..."
                  searchPlaceholder="Cari supplier..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="order_date" className="text-xs font-medium">Tanggal Pesan *</Label>
                <Input
                  id="order_date"
                  type="date"
                  value={formData.order_date}
                  onChange={e => setFormData({ ...formData, order_date: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Status *</Label>
                <SearchableSelect
                  options={PURCHASE_STATUS_OPTIONS}
                  value={formData.status}
                  onValueChange={value => setFormData({ ...formData, status: value })}
                  placeholder="Pilih status..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs font-medium">Catatan</Label>
                <Input
                  id="notes"
                  placeholder="Catatan tambahan..."
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Daftar Item Obat</span>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-7 px-2.5 text-xs rounded-none shadow-none">
                <Plus className="mr-1 h-3 w-3" /> Tambah Baris
              </Button>
            </div>

            <div className="overflow-x-auto border border-border/70">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-border/70">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Obat</th>
                    <th className="w-28 px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                    <th className="w-36 px-3 py-2 text-right font-medium text-muted-foreground">Harga Beli (Rp)</th>
                    <th className="w-36 px-3 py-2 text-right font-medium text-muted-foreground">Subtotal</th>
                    <th className="w-10 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/10">
                      <td className="p-2">
                        <SearchableSelect
                          options={medicineOptions}
                          value={item.medicine_id ? String(item.medicine_id) : ''}
                          onValueChange={v => updateItem(idx, 'medicine_id', v)}
                          placeholder="Pilih obat..."
                          searchPlaceholder="Cari obat..."
                          square
                          className="h-8 text-xs rounded-none"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                          className="h-8 text-right text-xs font-mono rounded-none"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min="0"
                          value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                          className="h-8 text-right text-xs font-mono rounded-none"
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-medium text-xs">
                        {(item.quantity * item.unit_price).toLocaleString('id-ID')}
                      </td>
                      <td className="p-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={items.length === 1}
                          onClick={() => removeItem(idx)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive rounded-none"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t border-border/70 font-medium">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold">Total Nilai PO:</td>
                    <td className="px-3 py-2 text-right text-xs font-mono font-bold text-primary">
                      Rp {totalAmount.toLocaleString('id-ID')}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
