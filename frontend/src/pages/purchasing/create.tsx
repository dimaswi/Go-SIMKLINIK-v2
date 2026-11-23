import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { purchaseOrdersApi, suppliersApi, medicinesApi, medicineRoomsApi, type Supplier, type Medicine, type MedicineRoom } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { getLocalISODate } from '@/lib/utils';
import { MasterDataPageShell } from '@/pages/master-data/shared';
import { PURCHASE_STATUS_OPTIONS } from './constants';

interface ItemRow {
  medicine_id: number;
  large_quantity: number;
  small_quantity: number;
  unit_price: number;
  selling_price: number;
}

export default function PurchaseOrderCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [rooms, setRooms] = useState<MedicineRoom[]>([]);

  const [formData, setFormData] = useState({
    supplier_id: '',
    destination_room_id: '',
    order_date: getLocalISODate(),
    status: 'draft',
    discount_type: 'percent' as 'percent' | 'amount',
    discount_value: 0,
    include_ppn: true,
    ppn_percent: 11,
    notes: '',
  });

  const [items, setItems] = useState<ItemRow[]>([
    { medicine_id: 0, large_quantity: 1, small_quantity: 1, unit_price: 0, selling_price: 0 },
  ]);

  useEffect(() => {
    setPageTitle('Buat Purchase Order');
    Promise.all([
      suppliersApi.getAll(),
      medicinesApi.getAll('per_page=100'),
      medicineRoomsApi.getAll('is_active=true'),
    ]).then(([sRes, mRes, rRes]) => {
      setSuppliers(sRes.data.data);
      setMedicines(mRes.data.data);
      const roomList = rRes.data.data || [];
      setRooms(roomList);
      const defaultDepo = roomList.find(r => r.is_default_depo) || roomList.find(r => r.type === 'depo') || roomList[0];
      if (defaultDepo) {
        setFormData(prev => ({ ...prev, destination_room_id: prev.destination_room_id || String(defaultDepo.id) }));
      }
    }).catch(() => {});
  }, []);

  const addItem = () => {
    setItems(prev => [...prev, { medicine_id: 0, large_quantity: 1, small_quantity: 1, unit_price: 0, selling_price: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemRow, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const numVal = Number(value) || 0;
      const row = { ...updated[index], [field]: numVal };
      const med = medicines.find(m => m.id === (field === 'medicine_id' ? numVal : row.medicine_id));
      const hasLargeUnit = Boolean(med?.large_unit_id && (med?.conversion_factor || 1) > 1);
      const factor = hasLargeUnit ? (med?.conversion_factor || 1) : 1;

      if (field === 'medicine_id') {
        if (med) {
          row.large_quantity = hasLargeUnit ? 1 : 0;
          row.small_quantity = hasLargeUnit ? factor : 1;
          row.unit_price = med.purchase_price || 0;
          row.selling_price = med.selling_price || 0;
        } else {
          row.large_quantity = 1;
          row.small_quantity = 1;
          row.unit_price = 0;
          row.selling_price = 0;
        }
      } else if (field === 'large_quantity') {
        row.large_quantity = Math.max(0, numVal);
        row.small_quantity = Math.round(row.large_quantity * factor);
      } else if (field === 'small_quantity') {
        row.small_quantity = Math.max(0, Math.round(numVal));
        row.large_quantity = hasLargeUnit ? Number((row.small_quantity / factor).toFixed(2)) : 0;
      }

      updated[index] = row;
      return updated;
    });
  };

  const subtotal = items.reduce((sum, r) => sum + (r.small_quantity * r.unit_price), 0);
  const discountAmount = formData.discount_type === 'percent'
    ? subtotal * (Math.min(100, Math.max(0, Number(formData.discount_value) || 0)) / 100)
    : Math.min(subtotal, Math.max(0, Number(formData.discount_value) || 0));
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const ppnAmount = formData.include_ppn ? afterDiscount * ((Math.max(0, Number(formData.ppn_percent) || 0)) / 100) : 0;
  const totalAmount = afterDiscount + ppnAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplier_id) {
      toast({ variant: 'destructive', title: 'Error!', description: 'Pilih supplier terlebih dahulu.' });
      return;
    }
    const validItems = items.filter(r => Number(r.medicine_id) > 0 && Number(r.small_quantity) > 0);
    if (validItems.length === 0) {
      toast({ variant: 'destructive', title: 'Error!', description: 'Tambahkan minimal 1 item obat.' });
      return;
    }
    setLoading(true);
    try {
      await purchaseOrdersApi.create({
        supplier_id: Number(formData.supplier_id),
        destination_room_id: formData.destination_room_id ? Number(formData.destination_room_id) : undefined,
        order_date: formData.order_date,
        status: formData.status,
        discount_percent: formData.discount_type === 'percent' ? Number(formData.discount_value) || 0 : 0,
        discount_amount: formData.discount_type === 'amount' ? Number(formData.discount_value) || 0 : 0,
        include_ppn: formData.include_ppn,
        ppn_percent: Number(formData.ppn_percent) || 0,
        notes: formData.notes,
        items: validItems.map(r => ({
          medicine_id: Number(r.medicine_id),
          unit_mode: 'small',
          quantity: Number(r.small_quantity),
          unit_price: Number(r.unit_price),
          selling_price: Number(r.selling_price),
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

  return (
    <form id="purchase-order-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Buat Purchase Order"
        subtitle="Susun pesanan obat ke supplier."
        onBack={() => navigate('/purchasing')}
        actions={
          <Button type="submit" form="purchase-order-create-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Simpan PO
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
                <Label className="text-xs font-medium">Ruangan Tujuan *</Label>
                <SearchableSelect
                  options={rooms.map(r => ({ value: String(r.id), label: r.name }))}
                  value={formData.destination_room_id}
                  onValueChange={v => setFormData({ ...formData, destination_room_id: v })}
                  placeholder="Pilih ruangan tujuan..."
                  searchPlaceholder="Cari ruangan..."
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

              <div className="space-y-1 md:col-span-2 lg:col-span-4">
                <Label htmlFor="notes" className="text-xs font-medium">Catatan</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  placeholder="Catatan tambahan PO..."
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="text-xs rounded-none resize-y"
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
                    <th className="w-32 px-3 py-2 text-right font-medium text-muted-foreground">Jml. Besar</th>
                    <th className="w-32 px-3 py-2 text-right font-medium text-muted-foreground">Jml. Kecil</th>
                    <th className="w-36 px-3 py-2 text-right font-medium text-muted-foreground">Harga Beli (Rp)</th>
                    <th className="w-36 px-3 py-2 text-right font-medium text-muted-foreground">Subtotal</th>
                    <th className="w-10 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((item, idx) => {
                    const med = medicines.find(m => m.id === item.medicine_id);
                    const hasLargeUnit = Boolean(med?.large_unit_id && (med?.conversion_factor || 1) > 1);
                    const smallUnitName = med?.unit?.name || 'Kecil';
                    const largeUnitName = med?.large_unit?.name || 'Box';
                    return (
                    <tr key={idx} className="hover:bg-muted/10 align-top">
                      <td className="p-2 min-w-[260px]">
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
                        <div className="flex items-center">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            disabled={!med || !hasLargeUnit}
                            value={hasLargeUnit ? item.large_quantity : 0}
                            onChange={e => updateItem(idx, 'large_quantity', e.target.value)}
                            className="h-8 text-right text-xs font-mono rounded-none"
                          />
                          <span className="h-8 px-2 inline-flex items-center border border-l-0 border-border/70 bg-muted/40 text-[11px] text-muted-foreground shrink-0">
                            {hasLargeUnit ? largeUnitName : '-'}
                          </span>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center">
                          <Input
                            type="number"
                            min="1"
                            disabled={!med}
                            value={item.small_quantity}
                            onChange={e => updateItem(idx, 'small_quantity', e.target.value)}
                            className="h-8 text-right text-xs font-mono rounded-none"
                          />
                          <span className="h-8 px-2 inline-flex items-center border border-l-0 border-border/70 bg-muted/40 text-[11px] text-muted-foreground shrink-0">
                            {med ? smallUnitName : '-'}
                          </span>
                        </div>
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
                      <td className="p-2 pt-3.5 text-right font-mono font-medium text-xs">
                        {(item.small_quantity * item.unit_price).toLocaleString('id-ID')}
                      </td>
                      <td className="p-2 pt-2.5 text-center">
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
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 border-t border-border/70 font-medium">
                  <tr>
                    <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-muted-foreground">Subtotal:</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">
                      Rp {subtotal.toLocaleString('id-ID')}
                    </td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                      <div className="inline-flex items-center gap-2">
                        <span>Diskon:</span>
                        <select
                          value={formData.discount_type}
                          onChange={e => setFormData({ ...formData, discount_type: e.target.value as 'percent' | 'amount', discount_value: 0 })}
                          className="h-7 border border-border bg-background px-1.5 text-xs"
                        >
                          <option value="percent">%</option>
                          <option value="amount">Rp</option>
                        </select>
                        <Input
                          type="number"
                          min="0"
                          max={formData.discount_type === 'percent' ? 100 : undefined}
                          value={formData.discount_value}
                          onChange={e => setFormData({ ...formData, discount_value: Number(e.target.value) })}
                          className="h-7 w-24 text-right text-xs font-mono rounded-none"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-rose-600">
                      - Rp {discountAmount.toLocaleString('id-ID')}
                    </td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                      <div className="inline-flex items-center gap-2">
                        <Switch
                          id="include_ppn"
                          checked={formData.include_ppn}
                          onCheckedChange={checked => setFormData({ ...formData, include_ppn: checked })}
                        />
                        <Label htmlFor="include_ppn" className="text-xs cursor-pointer">PPN</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          disabled={!formData.include_ppn}
                          value={formData.ppn_percent}
                          onChange={e => setFormData({ ...formData, ppn_percent: Number(e.target.value) })}
                          className="h-7 w-16 text-right text-xs font-mono rounded-none"
                        />
                        <span>%</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">
                      Rp {ppnAmount.toLocaleString('id-ID')}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="border-t border-border/70">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold">Total Nilai PO:</td>
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
