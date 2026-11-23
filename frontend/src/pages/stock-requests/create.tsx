import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  medicineRoomsApi,
  medicinesApi,
  stockRequestsApi,
  type Medicine,
  type MedicineRoom,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { setPageTitle } from '@/lib/page-title';
import { getLocalISODate } from '@/lib/utils';
import { MasterDataPageShell } from '@/pages/master-data/shared';
import { Loader2, Plus, Trash2 } from 'lucide-react';

interface RequestItemRow {
  medicine_id: number;
  unit_mode: 'small' | 'large';
  requested_quantity: number;
  notes: string;
}

export default function StockRequestCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<MedicineRoom[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  const [formData, setFormData] = useState({
    from_room_id: '',
    to_room_id: '',
    request_date: getLocalISODate(),
    notes: '',
  });

  const [items, setItems] = useState<RequestItemRow[]>([
    { medicine_id: 0, unit_mode: 'small', requested_quantity: 1, notes: '' },
  ]);

  useEffect(() => {
    setPageTitle('Buat Permintaan Stok');
    Promise.all([
      medicineRoomsApi.getAll('is_active=true'),
      medicinesApi.getAll('per_page=100&is_active=true'),
    ])
      .then(([roomRes, medRes]) => {
        const roomList = roomRes.data.data || [];
        setRooms(roomList);
        setMedicines(medRes.data.data || []);

        const defaultDepo = roomList.find((r) => r.is_default_depo) || roomList.find((r) => (r.room_type || r.type) === 'depo');
        const defaultApotek = roomList.find((r) => r.is_default_apotek) || roomList.find((r) => (r.room_type || r.type) === 'apotek');

        setFormData((prev) => ({
          ...prev,
          from_room_id: prev.from_room_id || (defaultDepo ? String(defaultDepo.id) : ''),
          to_room_id: prev.to_room_id || (defaultApotek ? String(defaultApotek.id) : ''),
        }));
      })
      .catch(() => {});
  }, []);

  const getMedicineStockInRoom = (medicineId: number, roomIdStr: string) => {
    const roomId = Number(roomIdStr);
    if (!medicineId || !roomId) return 0;
    const med = medicines.find((m) => m.id === medicineId);
    const rs = med?.room_stocks?.find((s) => s.room_id === roomId);
    return rs?.quantity ?? 0;
  };

  const addItem = () => {
    setItems((prev) => [...prev, { medicine_id: 0, unit_mode: 'small', requested_quantity: 1, notes: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof RequestItemRow, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        ...(field === 'medicine_id' ? { unit_mode: 'small' as const } : {}),
        [field]: field === 'medicine_id' || field === 'requested_quantity' ? Number(value) : value,
      };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.from_room_id || !formData.to_room_id) {
      toast({ variant: 'destructive', title: 'Validasi', description: 'Pilih ruangan asal dan ruangan tujuan.' });
      return;
    }
    if (formData.from_room_id === formData.to_room_id) {
      toast({ variant: 'destructive', title: 'Validasi', description: 'Ruangan asal dan ruangan tujuan tidak boleh sama.' });
      return;
    }

    const validItems = items.filter((it) => it.medicine_id > 0 && it.requested_quantity > 0);
    if (validItems.length === 0) {
      toast({ variant: 'destructive', title: 'Validasi', description: 'Tambahkan minimal 1 item obat yang diminta.' });
      return;
    }

    setLoading(true);
    try {
      const res = await stockRequestsApi.create({
        from_room_id: Number(formData.from_room_id),
        to_room_id: Number(formData.to_room_id),
        request_date: formData.request_date,
        notes: formData.notes,
        items: validItems,
      });
      toast({ variant: 'success', title: 'Berhasil', description: 'Permintaan stok berhasil diajukan ke Depo.' });
      navigate(`/stock-requests/${res.data.data.id}`);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.response?.data?.error || 'Gagal membuat permintaan stok.' });
    } finally {
      setLoading(false);
    }
  };

  const medicineOptions = medicines.map((m) => ({
    value: String(m.id),
    label: `${m.name}${m.strength ? ` ${m.strength}` : ''} (Depo/Asal: ${getMedicineStockInRoom(m.id, formData.from_room_id)})`,
  }));

  return (
    <form id="stock-request-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title="Buat Permintaan Stok"
        subtitle="Ajukan permintaan pemindahan stok obat dari Depo Farmasi ke Ruangan Apotek / Unit."
        onBack={() => navigate('/stock-requests')}
        actions={
          <Button type="submit" form="stock-request-create-form" disabled={loading} size="sm" className="h-8 px-4 text-xs rounded-none shadow-none">
            {loading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Ajukan Permintaan
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Informasi Permintaan</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Ruangan Asal (Sumber) *</Label>
                <SearchableSelect
                  options={rooms.map((r) => ({ value: String(r.id), label: r.name }))}
                  value={formData.from_room_id}
                  onValueChange={(v) => setFormData({ ...formData, from_room_id: v })}
                  placeholder="Pilih ruangan asal..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Ruangan Tujuan (Peminta) *</Label>
                <SearchableSelect
                  options={rooms.map((r) => ({ value: String(r.id), label: r.name }))}
                  value={formData.to_room_id}
                  onValueChange={(v) => setFormData({ ...formData, to_room_id: v })}
                  placeholder="Pilih ruangan tujuan..."
                  square
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="request_date" className="text-xs font-medium">Tanggal Permintaan *</Label>
                <Input
                  id="request_date"
                  type="date"
                  value={formData.request_date}
                  onChange={(e) => setFormData({ ...formData, request_date: e.target.value })}
                  className="h-9 text-xs rounded-none"
                />
              </div>

              <div className="space-y-1 md:col-span-3">
                <Label htmlFor="notes" className="text-xs font-medium">Catatan</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  placeholder="Keterangan permintaan stok..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="text-xs rounded-none resize-y"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-border/60 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Daftar Obat yang Diminta</span>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-7 px-2.5 text-xs rounded-none shadow-none">
                <Plus className="mr-1 h-3 w-3" /> Tambah Baris
              </Button>
            </div>

            <div className="border border-border/70 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border/70">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium">Obat *</th>
                    <th className="text-left px-3 py-2 text-xs font-medium w-44">Satuan</th>
                    <th className="text-right px-3 py-2 text-xs font-medium w-28">Stok Asal</th>
                    <th className="text-right px-3 py-2 text-xs font-medium w-28">Stok Tujuan</th>
                    <th className="text-right px-3 py-2 text-xs font-medium w-32">Jumlah Minta *</th>
                    <th className="text-left px-3 py-2 text-xs font-medium w-48">Catatan Item</th>
                    <th className="w-12 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => {
                    const med = medicines.find((m) => m.id === row.medicine_id);
                    const hasLargeUnit = Boolean(med?.large_unit_id && (med?.conversion_factor || 1) > 1);
                    const factor = row.unit_mode === 'large' && hasLargeUnit ? (med?.conversion_factor || 1) : 1;
                    const unitOptions = med ? [
                      { value: 'small', label: med.unit?.name || 'Satuan Kecil' },
                      ...(hasLargeUnit ? [{ value: 'large', label: `${med.large_unit?.name || 'Box'} (${med.conversion_factor} ${med.unit?.name || ''})` }] : []),
                    ] : [{ value: 'small', label: 'Satuan Kecil' }];
                    const fromStock = getMedicineStockInRoom(row.medicine_id, formData.from_room_id);
                    const toStock = getMedicineStockInRoom(row.medicine_id, formData.to_room_id);
                    return (
                      <tr key={idx} className="border-b border-border/50 last:border-b-0">
                        <td className="px-2 py-1.5 min-w-[240px]">
                          <SearchableSelect
                            options={medicineOptions}
                            value={row.medicine_id ? String(row.medicine_id) : ''}
                            onValueChange={(v) => updateItem(idx, 'medicine_id', v)}
                            placeholder="Pilih obat..."
                            searchPlaceholder="Cari nama obat..."
                            square
                            className="h-8 text-xs rounded-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <SearchableSelect
                            options={unitOptions}
                            value={row.unit_mode}
                            onValueChange={(v) => updateItem(idx, 'unit_mode', (v as 'small' | 'large') || 'small')}
                            disabled={!med || !hasLargeUnit}
                            placeholder="Satuan..."
                            square
                            className="h-8 text-xs rounded-none"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs font-medium">
                          {row.medicine_id ? fromStock.toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                          {row.medicine_id ? toStock.toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={1}
                            value={row.requested_quantity}
                            onChange={(e) => updateItem(idx, 'requested_quantity', e.target.value)}
                            className="h-8 text-xs text-right rounded-none"
                          />
                          {factor > 1 && row.requested_quantity > 0 && (
                            <p className="text-[10px] text-right text-muted-foreground mt-0.5">
                              = {(row.requested_quantity * factor).toLocaleString('id-ID')} {med?.unit?.name || 'kecil'}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={row.notes}
                            onChange={(e) => updateItem(idx, 'notes', e.target.value)}
                            placeholder="Opsional..."
                            className="h-8 text-xs rounded-none"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(idx)}
                            disabled={items.length === 1}
                            className="h-8 w-8 rounded-none text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </MasterDataPageShell>
    </form>
  );
}
