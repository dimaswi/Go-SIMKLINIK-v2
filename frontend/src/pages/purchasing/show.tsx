import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { purchaseOrdersApi, type PurchaseOrder, type PurchaseOrderItem } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/usePermission';
import { Loader2, Edit, PackageCheck, Truck, Banknote } from 'lucide-react';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataDetailItem, MasterDataPageShell, MasterDataSection } from '@/pages/master-data/shared';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  ordered: { label: 'Dipesan', variant: 'default' },
  partial: { label: 'Diterima Sebagian', variant: 'outline' },
  received: { label: 'Diterima', variant: 'default', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
};

interface ReceiveRow {
  item_id: number;
  received_quantity: number;
  batch_number: string;
  expiry_date: string;
}

function formatDate(value?: string) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function PurchasingShow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
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

  const handleFillFullReceive = () => {
    if (!po) return;
    setReceiveRows(
      (po.items || [])
        .filter(i => i.received_quantity < i.quantity)
        .map(i => {
          const existing = receiveRows.find(r => r.item_id === i.id);
          return {
            item_id: i.id,
            received_quantity: i.quantity - i.received_quantity,
            batch_number: existing?.batch_number || i.batch_number || '',
            expiry_date: existing?.expiry_date || (i.expiry_date ? i.expiry_date.split('T')[0] : ''),
          };
        })
    );
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
  if (!po) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="space-y-3 border border-border/70 bg-background p-6 text-center">
          <p className="text-sm font-medium">Data purchase order tidak ditemukan.</p>
          <Button variant="outline" className="rounded-none shadow-none" onClick={() => navigate('/purchasing')}>
            Kembali ke Purchasing
          </Button>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[po.status] || { label: po.status, variant: 'secondary' as const };
  const canReceive = po.status === 'ordered' || po.status === 'partial';
  const pendingItems = (po.items || []).filter(i => i.received_quantity < i.quantity);

  return (
    <MasterDataPageShell
      title={po.po_number}
      subtitle={`Purchase order untuk ${po.supplier?.name || 'supplier tidak diketahui'} pada ${formatDate(po.order_date)}.`}
      onBack={() => navigate('/purchasing')}
      badges={
        <>
          <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{po.id}</Badge>
          <Badge variant={statusInfo.variant} className={statusInfo.className ? `rounded-none shadow-none ${statusInfo.className}` : 'rounded-none shadow-none'}>{statusInfo.label}</Badge>
        </>
      }
      meta={
        <>
          <span>{(po.items || []).length} item</span>
          <span>Total Rp {po.total_amount.toLocaleString('id-ID')}</span>
          {pendingItems.length > 0 ? <span>{pendingItems.length} item menunggu penerimaan</span> : <span>Semua item sudah diterima</span>}
        </>
      }
      actions={
        <>
          {po.status === 'draft' && hasPermission('purchase_orders.update') ? (
            <Button variant="outline" className="rounded-none shadow-none" onClick={() => navigate(`/purchasing/${po.id}/edit`)}>
              <Edit className="mr-2 h-4 w-4" />Edit
            </Button>
          ) : null}
          {po.status !== 'draft' && po.payment_status !== 'paid' && hasPermission('purchase_orders.pay') ? (
            <Button variant="outline" className="rounded-none shadow-none" onClick={() => navigate(`/purchasing/${po.id}/payment`)}>
              <Banknote className="mr-2 h-4 w-4" />Bayar
            </Button>
          ) : null}
          {canReceive && hasPermission('purchase_orders.receive') ? (
            <Button className="rounded-none shadow-none" onClick={() => navigate(`/purchasing/${po.id}/receive`)}>
              <PackageCheck className="mr-2 h-4 w-4" />Terima Barang
            </Button>
          ) : null}
        </>
      }
    >
      <div className="divide-y divide-border/70">
        <MasterDataSection title="Informasi Purchase Order" helper="Detail nomor pesanan, supplier, tanggal transaksi, dan status pengadaan.">
          <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4">
            <MasterDataDetailItem label="Nomor PO" value={po.po_number} />
            <MasterDataDetailItem
              label="Status"
              value={
                <Badge variant={statusInfo.variant} className={statusInfo.className ? `rounded-none shadow-none ${statusInfo.className}` : 'rounded-none shadow-none'}>
                  {statusInfo.label}
                </Badge>
              }
            />
            <MasterDataDetailItem label="Supplier" value={po.supplier?.name || '-'} />
            <MasterDataDetailItem label="Ruangan Tujuan" value={po.destination_room?.name || 'Depo Farmasi'} />
            <MasterDataDetailItem label="Tanggal Pesan" value={formatDate(po.order_date)} />
            <MasterDataDetailItem label="Tanggal Terima" value={formatDate(po.received_date)} />
            <MasterDataDetailItem label="Dibuat Oleh" value={po.creator?.full_name || po.creator?.username || '-'} />
            <MasterDataDetailItem label="Total Pembelian" value={`Rp ${po.total_amount.toLocaleString('id-ID')}`} />
            <MasterDataDetailItem
              label="Status Pembayaran"
              value={
                po.payment_status === 'paid' ? (
                  <Badge className="rounded-none shadow-none bg-emerald-600 text-white">Lunas</Badge>
                ) : po.payment_status === 'partial' ? (
                  <Badge variant="outline" className="rounded-none shadow-none border-amber-500 text-amber-600">Sebagian</Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-none shadow-none">Belum Lunas</Badge>
                )
              }
            />
            <MasterDataDetailItem label="Sudah Dibayar" value={`Rp ${(po.paid_amount || 0).toLocaleString('id-ID')}`} />
            <MasterDataDetailItem label="Sisa Tagihan" value={`Rp ${Math.max(0, po.total_amount - (po.paid_amount || 0)).toLocaleString('id-ID')}`} />
            <div className="col-span-2 md:col-span-4">
              <MasterDataDetailItem label="Catatan" value={po.notes || '-'} />
            </div>
          </div>
        </MasterDataSection>

        <MasterDataSection title="Daftar Item" helper="Bandingkan jumlah yang dipesan, diterima, dan nilai pembelian per item.">
          <div className="overflow-x-auto border border-border/70">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/70">
                <tr>
                  <th className="px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground">Obat</th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-medium text-muted-foreground">Dipesan</th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-medium text-muted-foreground">Diterima</th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-medium text-muted-foreground">Harga Satuan</th>
                  <th className="px-2.5 py-1.5 text-right text-xs font-medium text-muted-foreground">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(po.items || []).map((item: PurchaseOrderItem) => {
                  const fullyReceived = item.received_quantity >= item.quantity;
                  return (
                    <tr key={item.id} className={fullyReceived ? 'bg-green-50/40 dark:bg-green-950/20' : ''}>
                      <td className="px-2.5 py-1.5">
                        <p className="font-medium leading-tight">{item.medicine?.name || `Medicine #${item.medicine_id}`}</p>
                        {item.medicine?.strength ? <p className="text-[11px] text-muted-foreground leading-tight">{item.medicine.strength}</p> : null}
                        {item.batch_number ? <p className="text-[11px] text-muted-foreground leading-tight">Batch: {item.batch_number}</p> : null}
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        {item.quantity} {item.unit_mode === 'large' && item.medicine?.large_unit?.name ? item.medicine.large_unit.name : (item.medicine?.unit?.name || '')}
                        {item.unit_mode === 'large' && (item.conversion_factor || 1) > 1 && (
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            ({(item.quantity * (item.conversion_factor || 1)).toLocaleString('id-ID')} {item.medicine?.unit?.name || 'kecil'})
                          </p>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        <span className={fullyReceived ? 'font-medium text-green-600' : 'text-orange-600'}>
                          {item.received_quantity}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 text-right">Rp {item.unit_price.toLocaleString('id-ID')}</td>
                      <td className="px-2.5 py-1.5 text-right font-medium">Rp {item.total_price.toLocaleString('id-ID')}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/30 border-t border-border/70">
                <tr>
                  <td colSpan={4} className="px-2.5 py-1.5 text-right text-xs text-muted-foreground">Subtotal</td>
                  <td className="px-2.5 py-1.5 text-right text-xs font-medium">Rp {(po.subtotal || po.total_amount).toLocaleString('id-ID')}</td>
                </tr>
                {(po.discount_amount || 0) > 0 && (
                  <tr>
                    <td colSpan={4} className="px-2.5 py-1.5 text-right text-xs text-muted-foreground">
                      Diskon {po.discount_percent ? `(${po.discount_percent}%)` : ''}
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-xs font-medium text-rose-600">
                      - Rp {(po.discount_amount || 0).toLocaleString('id-ID')}
                    </td>
                  </tr>
                )}
                {po.include_ppn && (
                  <tr>
                    <td colSpan={4} className="px-2.5 py-1.5 text-right text-xs text-muted-foreground">
                      PPN ({po.ppn_percent ?? 11}%)
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-xs font-medium">
                      Rp {(po.ppn_amount || 0).toLocaleString('id-ID')}
                    </td>
                  </tr>
                )}
                <tr className="border-t border-border/70">
                  <td colSpan={4} className="px-2.5 py-2 text-right text-xs font-semibold">Total</td>
                  <td className="px-2.5 py-2 text-right text-xs font-bold">Rp {po.total_amount.toLocaleString('id-ID')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </MasterDataSection>

        {(po.payments || []).length > 0 && (
          <MasterDataSection title="Riwayat Pembayaran">
            <div className="overflow-x-auto border border-border/70">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 border-b border-border/70">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left font-medium text-muted-foreground">No. Pembayaran</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-muted-foreground">Tanggal</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-muted-foreground">Metode</th>
                    <th className="px-2.5 py-1.5 text-left font-medium text-muted-foreground">Referensi</th>
                    <th className="px-2.5 py-1.5 text-right font-medium text-muted-foreground">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {(po.payments || []).map((pay) => (
                    <tr key={pay.id}>
                      <td className="px-2.5 py-1.5 font-mono font-medium">{pay.payment_number}</td>
                      <td className="px-2.5 py-1.5">{formatDate(pay.payment_date)}</td>
                      <td className="px-2.5 py-1.5">{pay.payment_method?.name || '-'}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{pay.reference_number || '-'}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-medium">Rp {pay.amount.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MasterDataSection>
        )}

        {showReceiveForm && pendingItems.length > 0 ? (
          <MasterDataSection title="Form Penerimaan Barang" helper="Masukkan barang yang benar-benar diterima untuk memperbarui stok dan status PO.">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Truck className="h-4 w-4 text-primary" />
                  Isi jumlah diterima (0 jika item belum datang untuk penerimaan sebagian).
                </p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-none text-xs" onClick={handleFillFullReceive}>
                    Terima Full
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-none" onClick={() => setShowReceiveForm(false)}>Batal</Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Obat</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Sisa PO</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Jml. Terima</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">No. Batch</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Kadaluarsa</th>
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
                            {item.medicine?.strength ? <p className="text-xs text-muted-foreground">{item.medicine.strength}</p> : null}
                          </td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground">
                            {remaining} {item.unit_mode === 'large' && item.medicine?.large_unit?.name ? item.medicine.large_unit.name : (item.medicine?.unit?.name || '')}
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              type="number"
                              min="0"
                              max={remaining}
                              value={row.received_quantity}
                              onChange={e => updateRow(item.id, 'received_quantity', Math.min(remaining, Math.max(0, Number(e.target.value) || 0)))}
                              className="mx-auto block h-8 w-20 text-center text-sm"
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
                <Button type="button" onClick={handleReceive} disabled={receiving} className="rounded-none shadow-none gap-2">
                  {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  Konfirmasi Penerimaan & Update Stok
                </Button>
              </div>
            </div>
          </MasterDataSection>
        ) : null}
      </div>
    </MasterDataPageShell>
  );
}
