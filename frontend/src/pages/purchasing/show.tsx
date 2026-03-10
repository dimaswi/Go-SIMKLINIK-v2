import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { purchaseOrdersApi, type PurchaseOrder, type PurchaseOrderItem } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, PackageCheck, ChevronLeft, Truck } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  ordered: { label: 'Dipesan', variant: 'default' },
  partial: { label: 'Diterima Sebagian', variant: 'outline' },
  received: { label: 'Diterima', variant: 'default' },
};

interface ReceiveRow {
  item_id: number;
  received_quantity: number;
  batch_number: string;
  expiry_date: string;
}

export default function PurchasingShow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState(false);
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [receiveRows, setReceiveRows] = useState<ReceiveRow[]>([]);
  const [receiveNotes, setReceiveNotes] = useState('');

  useEffect(() => {
    setPageTitle('Detail Purchase Order');
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await purchaseOrdersApi.getById(Number(id));
      const data: PurchaseOrder = res.data.data;
      setPo(data);
      // Init receive rows from items that are not fully received
      const rows = (data.items || [])
        .filter(item => item.received_quantity < item.quantity)
        .map(item => ({
          item_id: item.id,
          received_quantity: item.quantity - item.received_quantity,
          batch_number: '',
          expiry_date: '',
        }));
      setReceiveRows(rows);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data.' });
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (itemId: number, field: keyof ReceiveRow, value: string | number) => {
    setReceiveRows(prev => prev.map(r => r.item_id === itemId ? { ...r, [field]: value } : r));
  };

  const handleReceive = async () => {
    const validRows = receiveRows.filter(r => r.received_quantity > 0);
    if (validRows.length === 0) {
      toast({ variant: 'destructive', title: 'Error!', description: 'Masukkan jumlah yang diterima.' });
      return;
    }
    setReceiving(true);
    try {
      await purchaseOrdersApi.receive(Number(id), {
        items: validRows.map(r => ({
          item_id: r.item_id,
          received_quantity: Number(r.received_quantity),
          batch_number: r.batch_number,
          expiry_date: r.expiry_date,
        })),
        notes: receiveNotes,
      });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Stok berhasil diperbarui.' });
      setShowReceiveForm(false);
      loadData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error!', description: err.response?.data?.error || 'Gagal menerima barang.' });
    } finally {
      setReceiving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!po) return null;

  const statusInfo = STATUS_MAP[po.status] || { label: po.status, variant: 'secondary' as const };
  const canReceive = po.status === 'ordered' || po.status === 'partial';
  const pendingItems = (po.items || []).filter(i => i.received_quantity < i.quantity);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/purchasing')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {po.supplier?.name} · {new Date(po.order_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {po.status === 'draft' && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/purchasing/${po.id}/edit`}><Edit className="mr-1 h-3.5 w-3.5" />Edit</Link>
            </Button>
          )}
          {canReceive && !showReceiveForm && (
            <Button size="sm" onClick={() => setShowReceiveForm(true)}>
              <PackageCheck className="mr-2 h-4 w-4" />Terima Barang
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Left: Items */}
        <div className="space-y-5">
          <div className="rounded-lg border border-border/80 overflow-hidden">
            <div className="p-4 bg-muted/30 border-b">
              <p className="text-sm font-semibold">Daftar Item</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Obat</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Dipesan</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Diterima</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Harga Satuan</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(po.items || []).map((item: PurchaseOrderItem) => {
                    const fullyReceived = item.received_quantity >= item.quantity;
                    return (
                      <tr key={item.id} className={fullyReceived ? 'bg-green-50/50 dark:bg-green-950/20' : ''}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{item.medicine?.name || `Medicine #${item.medicine_id}`}</p>
                          {item.medicine?.strength && <p className="text-xs text-muted-foreground">{item.medicine.strength}</p>}
                          {item.batch_number && <p className="text-xs text-muted-foreground">Batch: {item.batch_number}</p>}
                        </td>
                        <td className="px-4 py-3 text-right">{item.quantity} {item.medicine?.unit?.name || ''}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={fullyReceived ? 'text-green-600 font-medium' : 'text-orange-600'}>
                            {item.received_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">Rp {item.unit_price.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3 text-right font-medium">Rp {item.total_price.toLocaleString('id-ID')}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold text-sm">Total</td>
                    <td className="px-4 py-3 text-right font-bold">Rp {po.total_amount.toLocaleString('id-ID')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Receive Form */}
          {showReceiveForm && pendingItems.length > 0 && (
            <div className="rounded-lg border-2 border-primary/30 p-5 space-y-4 bg-primary/5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  Form Penerimaan Barang
                </p>
                <Button variant="ghost" size="sm" onClick={() => setShowReceiveForm(false)}>Batal</Button>
              </div>
              <div className="rounded-md border overflow-x-auto bg-background">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Obat</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Sisa PO</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Jml. Terima</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">No. Batch</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Kadaluarsa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pendingItems.map(item => {
                      const row = receiveRows.find(r => r.item_id === item.id);
                      if (!row) return null;
                      const remaining = item.quantity - item.received_quantity;
                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-2.5">
                            <p className="font-medium">{item.medicine?.name}</p>
                            {item.medicine?.strength && <p className="text-xs text-muted-foreground">{item.medicine.strength}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground">{remaining}</td>
                          <td className="px-3 py-2.5">
                            <Input
                              type="number"
                              min="1"
                              max={remaining}
                              value={row.received_quantity}
                              onChange={e => updateRow(item.id, 'received_quantity', Number(e.target.value))}
                              className="h-8 text-sm text-center w-20 mx-auto block"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              placeholder="BATCH-001"
                              value={row.batch_number}
                              onChange={e => updateRow(item.id, 'batch_number', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              type="date"
                              value={row.expiry_date}
                              onChange={e => updateRow(item.id, 'expiry_date', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Catatan Penerimaan</Label>
                <Input
                  placeholder="Catatan opsional..."
                  value={receiveNotes}
                  onChange={e => setReceiveNotes(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleReceive} disabled={receiving} className="gap-2">
                  {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  Konfirmasi Penerimaan & Update Stok
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Info */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border/80 p-4 space-y-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Informasi PO</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">No. PO</span>
                <span className="font-mono font-medium">{po.po_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Supplier</span>
                <span className="font-medium text-right">{po.supplier?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tgl. Pesan</span>
                <span>{new Date(po.order_date).toLocaleDateString('id-ID')}</span>
              </div>
              {po.received_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tgl. Terima</span>
                  <span>{new Date(po.received_date).toLocaleDateString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dibuat oleh</span>
                <span>{po.creator?.full_name || po.creator?.username || '-'}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>Rp {po.total_amount.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          {po.notes && (
            <div className="rounded-lg border border-border/80 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Catatan</p>
              <p className="text-muted-foreground">{po.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
