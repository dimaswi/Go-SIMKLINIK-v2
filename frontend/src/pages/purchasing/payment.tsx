import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { paymentMethodsApi, purchaseOrdersApi, type PaymentMethod, type PurchaseOrder } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { getLocalISODate } from '@/lib/utils';
import { MasterDataDetailItem, MasterDataPageShell, MasterDataSection } from '@/pages/master-data/shared';
import { Banknote, Loader2 } from 'lucide-react';

export default function PurchaseOrderPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    payment_method_id: '',
    payment_date: getLocalISODate(),
    amount: 0,
    reference_number: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [poRes, pmRes] = await Promise.all([
        purchaseOrdersApi.getById(Number(id)),
        paymentMethodsApi.getAll('is_active=true'),
      ]);
      const order: PurchaseOrder = poRes.data.data;
      const methods: PaymentMethod[] = pmRes.data.data || [];
      setPo(order);
      setPaymentMethods(methods);

      const remaining = Math.max(0, (order.total_amount || 0) - (order.paid_amount || 0));
      setFormData((prev) => ({
        ...prev,
        payment_method_id: prev.payment_method_id || (methods[0] ? String(methods[0].id) : ''),
        amount: remaining,
      }));
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data pembayaran PO.' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setPageTitle('Pembayaran Purchase Order');
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!po) {
    return (
      <MasterDataPageShell title="Pembayaran PO" onBack={() => navigate('/purchasing')}>
        <p className="text-sm text-muted-foreground">Data purchase order tidak ditemukan.</p>
      </MasterDataPageShell>
    );
  }

  const paidAmount = po.paid_amount || 0;
  const remainingAmount = Math.max(0, (po.total_amount || 0) - paidAmount);
  const isPaid = po.payment_status === 'paid' || remainingAmount <= 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.amount <= 0) {
      toast({ variant: 'destructive', title: 'Validasi', description: 'Nominal pembayaran harus lebih dari 0.' });
      return;
    }

    setSubmitting(true);
    try {
      await purchaseOrdersApi.recordPayment(po.id, {
        payment_method_id: formData.payment_method_id ? Number(formData.payment_method_id) : undefined,
        payment_date: formData.payment_date,
        amount: Number(formData.amount),
        reference_number: formData.reference_number,
        notes: formData.notes,
      });
      toast({ variant: 'success', title: 'Berhasil!', description: 'Pembayaran PO berhasil dicatat.' });
      navigate(`/purchasing/${po.id}`);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.response?.data?.error || 'Gagal mencatat pembayaran.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form id="purchase-order-payment-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <MasterDataPageShell
        title={`Pembayaran ${po.po_number}`}
        onBack={() => navigate(`/purchasing/${po.id}`)}
        badges={
          <Badge
            variant={isPaid ? 'default' : 'outline'}
            className={`h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none ${
              isPaid ? 'bg-emerald-600 text-white' : 'border-amber-500 text-amber-600'
            }`}
          >
            {isPaid ? 'Lunas' : po.payment_status === 'partial' ? 'Dibayar Sebagian' : 'Belum Lunas'}
          </Badge>
        }
        actions={
          !isPaid ? (
            <Button
              type="submit"
              form="purchase-order-payment-form"
              disabled={submitting}
              size="sm"
              className="h-8 px-4 text-xs rounded-none shadow-none"
            >
              {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Banknote className="mr-1.5 h-3.5 w-3.5" />}
              Simpan Pembayaran
            </Button>
          ) : undefined
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Ringkasan Tagihan">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <MasterDataDetailItem label="Supplier" value={po.supplier?.name || '-'} />
              <MasterDataDetailItem label="Total Tagihan PO" value={`Rp ${po.total_amount.toLocaleString('id-ID')}`} />
              <MasterDataDetailItem label="Sudah Dibayar" value={`Rp ${paidAmount.toLocaleString('id-ID')}`} />
              <MasterDataDetailItem
                label="Sisa Tagihan"
                value={<span className={remainingAmount > 0 ? 'font-bold text-rose-600' : 'font-bold text-emerald-600'}>Rp {remainingAmount.toLocaleString('id-ID')}</span>}
              />
            </div>
          </MasterDataSection>

          {!isPaid && (
            <MasterDataSection title="Input Pembayaran">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-start">
                <div className="space-y-1">
                  <div className="h-5 flex items-center">
                    <Label className="text-xs font-medium leading-none">Metode Pembayaran *</Label>
                  </div>
                  <SearchableSelect
                    options={paymentMethods.map((m) => ({ value: String(m.id), label: m.name }))}
                    value={formData.payment_method_id}
                    onValueChange={(v) => setFormData({ ...formData, payment_method_id: v })}
                    placeholder="Pilih metode..."
                    square
                    className="h-8 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <div className="h-5 flex items-center">
                    <Label htmlFor="payment_date" className="text-xs font-medium leading-none">Tanggal Bayar *</Label>
                  </div>
                  <Input
                    id="payment_date"
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                    className="h-8 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <div className="h-5 flex items-center justify-between gap-2">
                    <Label htmlFor="amount" className="text-xs font-medium leading-none">Nominal Bayar (Rp) *</Label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, amount: remainingAmount })}
                      className="text-[11px] leading-none text-primary hover:underline"
                    >
                      Bayar Lunas
                    </button>
                  </div>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    max={remainingAmount}
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                    className="h-8 text-right text-xs font-mono rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <div className="h-5 flex items-center">
                    <Label htmlFor="reference_number" className="text-xs font-medium leading-none">No. Referensi / Bukti</Label>
                  </div>
                  <Input
                    id="reference_number"
                    placeholder="Misal: TRF-001"
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    className="h-8 text-xs rounded-none"
                  />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label htmlFor="notes" className="text-xs font-medium">Catatan</Label>
                  <Textarea
                    id="notes"
                    rows={2}
                    placeholder="Catatan pembayaran (opsional)..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="text-xs rounded-none resize-y"
                  />
                </div>
              </div>
            </MasterDataSection>
          )}

          {(po.payments || []).length > 0 && (
            <MasterDataSection title="Riwayat Pembayaran">
              <div className="overflow-x-auto border border-border/70">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 border-b border-border/70">
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
                        <td className="px-2.5 py-1.5">
                          {pay.payment_date ? new Date(pay.payment_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </td>
                        <td className="px-2.5 py-1.5">{pay.payment_method?.name || '-'}</td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{pay.reference_number || '-'}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-medium">
                          Rp {pay.amount.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MasterDataSection>
          )}
        </div>
      </MasterDataPageShell>
    </form>
  );
}
