import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { purchaseOrdersApi, type PurchaseOrder, type PurchaseOrderItem } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataPageShell, MasterDataSection } from '@/pages/master-data/shared';
import { Loader2, PackageCheck } from 'lucide-react';

interface ReceiveRow {
  item_id: number;
  received_quantity: number;
  batch_number: string;
  expiry_date: string;
}

export default function PurchaseOrderReceive() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState(false);
  const [receiveRows, setReceiveRows] = useState<ReceiveRow[]>([]);
  const [receiveNotes, setReceiveNotes] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await purchaseOrdersApi.getById(Number(id));
      const data: PurchaseOrder = res.data.data;
      setPo(data);
      const rows = (data.items || [])
        .filter((item: PurchaseOrderItem) => item.received_quantity < item.quantity)
        .map((item: PurchaseOrderItem) => ({
          item_id: item.id,
          received_quantity: item.quantity - item.received_quantity,
          batch_number: item.batch_number || '',
          expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '',
        }));
      setReceiveRows(rows);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data purchase order.' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setPageTitle('Penerimaan Barang PO');
    void loadData();
  }, [loadData]);

  const updateRow = (itemId: number, field: keyof ReceiveRow, value: string | number) => {
    setReceiveRows((prev) => prev.map((r) => (r.item_id === itemId ? { ...r, [field]: value } : r)));
  };

  const handleFillFullReceive = () => {
    if (!po) return;
    setReceiveRows(
      (po.items || [])
        .filter((i) => i.received_quantity < i.quantity)
        .map((i) => {
          const existing = receiveRows.find((r) => r.item_id === i.id);
          return {
            item_id: i.id,
            received_quantity: i.quantity - i.received_quantity,
            batch_number: existing?.batch_number || i.batch_number || '',
            expiry_date: existing?.expiry_date || (i.expiry_date ? i.expiry_date.split('T')[0] : ''),
          };
        })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = receiveRows.filter((r) => r.received_quantity > 0);
    if (validRows.length === 0) {
      toast({ variant: 'destructive', title: 'Validasi', description: 'Masukkan minimal 1 item dengan jumlah diterima > 0.' });
      return;
    }

    setReceiving(true);
    try {
      await purchaseOrdersApi.receive(Number(id), {
        items: validRows.map((r) => ({
          item_id: r.item_id,
          received_quantity: Number(r.received_quantity),
          batch_number: r.batch_number,
          expiry_date: r.expiry_date,
        })),
        notes: receiveNotes,
      });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Penerimaan barang berhasil disimpan dan stok ruangan diperbarui.' });
      navigate(`/purchasing/${id}`);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error!', description: err.response?.data?.error || 'Gagal menerima barang.' });
    } finally {
      setReceiving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!po) {
    return (
      <MasterDataPageShell title="Penerimaan Barang" onBack={() => navigate('/purchasing')}>
        <p className="text-sm text-muted-foreground">Data purchase order tidak ditemukan.</p>
      </MasterDataPageShell>
    );
  }

  const pendingItems = (po.items || []).filter((i) => i.received_quantity < i.quantity);

  return (
    <form id="purchase-order-receive-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title={`Penerimaan ${po.po_number}`}
        subtitle={`Terima barang dari ${po.supplier?.name || '-'} ke ${po.destination_room?.name || 'Depo Farmasi'}.`}
        onBack={() => navigate(`/purchasing/${po.id}`)}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">
              {po.destination_room?.name || 'Depo Farmasi'}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">
              {pendingItems.length} Item Tersisa
            </Badge>
          </>
        }
        actions={
          pendingItems.length > 0 ? (
            <Button
              type="submit"
              form="purchase-order-receive-form"
              disabled={receiving}
              size="sm"
              className="h-8 px-4 text-xs rounded-none shadow-none"
            >
              {receiving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="mr-1.5 h-3.5 w-3.5" />}
              Konfirmasi Penerimaan &amp; Update Stok
            </Button>
          ) : undefined
        }
      >
        {pendingItems.length === 0 ? (
          <div className="border border-border/70 p-6 text-center space-y-3">
            <p className="text-sm font-medium">Seluruh item pada PO ini sudah diterima penuh.</p>
            <Button type="button" variant="outline" className="rounded-none" onClick={() => navigate(`/purchasing/${po.id}`)}>
              Kembali ke Detail PO
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            <MasterDataSection
              title="Daftar Barang Diterima"
              helper="Isi jumlah diterima (isi 0 jika item belum datang untuk penerimaan sebagian)."
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 rounded-none text-xs shadow-none" onClick={handleFillFullReceive}>
                    Terima Full
                  </Button>
                </div>

                <div className="overflow-x-auto border border-border/70 bg-background">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 border-b border-border/70">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground">Obat</th>
                        <th className="px-2.5 py-1.5 text-center text-xs font-medium text-muted-foreground">Sisa PO</th>
                        <th className="px-2.5 py-1.5 text-center text-xs font-medium text-muted-foreground">Jml. Terima</th>
                        <th className="px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground">No. Batch</th>
                        <th className="px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground">Kadaluarsa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {pendingItems.map((item) => {
                        const row = receiveRows.find((r) => r.item_id === item.id);
                        if (!row) return null;
                        const remaining = item.quantity - item.received_quantity;
                        const unitName = item.unit_mode === 'large' && item.medicine?.large_unit?.name
                          ? item.medicine.large_unit.name
                          : (item.medicine?.unit?.name || '');

                        return (
                          <tr key={item.id}>
                            <td className="px-2.5 py-1.5">
                              <p className="font-medium text-xs leading-tight">{item.medicine?.name || `Obat #${item.medicine_id}`}</p>
                              {item.medicine?.strength ? (
                                <p className="text-[11px] text-muted-foreground leading-tight">{item.medicine.strength}</p>
                              ) : null}
                            </td>
                            <td className="px-2.5 py-1.5 text-center text-xs text-muted-foreground">
                              {remaining} {unitName}
                            </td>
                            <td className="px-2.5 py-1.5">
                              <Input
                                type="number"
                                min="0"
                                max={remaining}
                                value={row.received_quantity}
                                onChange={(e) =>
                                  updateRow(
                                    item.id,
                                    'received_quantity',
                                    Math.min(remaining, Math.max(0, Number(e.target.value) || 0))
                                  )
                                }
                                className="mx-auto block h-7 w-24 text-center text-xs font-mono rounded-none"
                              />
                            </td>
                            <td className="px-2.5 py-1.5">
                              <Input
                                placeholder="BATCH-001"
                                value={row.batch_number}
                                onChange={(e) => updateRow(item.id, 'batch_number', e.target.value)}
                                className="h-7 text-xs rounded-none"
                              />
                            </td>
                            <td className="px-2.5 py-1.5">
                              <Input
                                type="date"
                                value={row.expiry_date}
                                onChange={(e) => updateRow(item.id, 'expiry_date', e.target.value)}
                                className="h-7 text-xs rounded-none"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="receive_notes" className="text-xs font-medium">Catatan Penerimaan</Label>
                  <Textarea
                    id="receive_notes"
                    rows={2}
                    placeholder="Catatan penerimaan barang (opsional)..."
                    value={receiveNotes}
                    onChange={(e) => setReceiveNotes(e.target.value)}
                    className="text-xs rounded-none resize-y"
                  />
                </div>
              </div>
            </MasterDataSection>
          </div>
        )}
      </MasterDataPageShell>
    </form>
  );
}
