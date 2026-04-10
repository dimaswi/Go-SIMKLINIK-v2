import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { billingApi, paymentMethodsApi } from '@/lib/api';
import type { Invoice, PaymentMethod } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { formatCurrency, formatDateTime } from './utils';
import { MasterDataPageShell, MasterDataAsideSection, MasterDataAsideStack, MasterDataSection } from '@/pages/master-data/shared';
import {
  CreditCard,
  Loader2,
  Percent,
  Printer,
  RefreshCw,
} from 'lucide-react';

// ── Status helpers ─────────────────────────────────────────────────────────

const INVOICE_STATUS_LABEL: Record<string, string> = {
  belum_bayar: 'Belum Bayar',
  sebagian: 'Bayar Sebagian',
  lunas: 'Lunas',
  batal: 'Dibatalkan',
};

const INVOICE_STATUS_CLASS: Record<string, string> = {
  belum_bayar: 'border-red-300 bg-red-50 text-red-700',
  sebagian: 'border-amber-300 bg-amber-50 text-amber-700',
  lunas: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  batal: 'border-slate-300 bg-slate-50 text-slate-500',
};

const ITEM_TYPE_CLASS: Record<string, string> = {
  pendaftaran: 'border-slate-300 bg-slate-50 text-slate-600',
  tindakan: 'border-blue-300 bg-blue-50 text-blue-700',
  obat: 'border-green-300 bg-green-50 text-green-700',
  racikan: 'border-purple-300 bg-purple-50 text-purple-700',
  laboratorium: 'border-orange-300 bg-orange-50 text-orange-700',
  radiologi: 'border-pink-300 bg-pink-50 text-pink-700',
};

function getEditableDiscountAmount(invoice: Invoice) {
  const storedDiscount = Number(invoice.discount ?? 0);
  if (!Number.isFinite(storedDiscount) || storedDiscount <= 0) {
    return '0';
  }

  if (invoice.discount_type === 'persen' && invoice.sub_total > 0) {
    const percentage = (storedDiscount / invoice.sub_total) * 100;
    if (Number.isFinite(percentage)) {
      return String(Number(percentage.toFixed(2)));
    }
  }

  return String(storedDiscount);
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function KasirDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Payment dialog
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  // Discount dialog
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [discountType, setDiscountType] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [savingDiscount, setSavingDiscount] = useState(false);

  const remaining = invoice ? Math.max(0, invoice.total_amount - invoice.paid_amount) : 0;
  const isPaid = invoice?.status === 'lunas';
  const isCancelled = invoice?.status === 'batal';
  const isVisitFinalized = invoice?.visit?.status === 'completed';
  const canEdit = !isPaid && !isCancelled;
  const canPay = canEdit && remaining > 0 && isVisitFinalized;
  const hasDiscount = (invoice?.discount ?? 0) > 0 || Boolean(invoice?.discount_type);

  const fetchInvoice = useCallback(async () => {
    try {
      const res = await billingApi.getById(Number(id));
      const data = res.data?.data;
      setInvoice(data || null);
      if (data) {
        setDiscountAmount(getEditableDiscountAmount(data));
        setDiscountType(data.discount_type || '');
        setTaxAmount(String(data.tax ?? 0));
        setInvoiceNotes(data.notes || '');
      }
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memuat invoice',
        description: requestError.response?.data?.error || 'Invoice tidak ditemukan atau terjadi kesalahan.',
      });
      navigate('/kasir');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    setPageTitle('Detail Invoice');
    void fetchInvoice();
    paymentMethodsApi.getAll('per_page=100').then(r => setPaymentMethods(r.data?.data || [])).catch(() => {});
  }, [fetchInvoice]);

  const handleSyncInvoice = async () => {
    if (!invoice?.visit_id) return;
    setLoading(true);
    try {
      const res = await billingApi.syncVisit(invoice.visit_id);
      toast({ title: res.data?.message || 'Invoice berhasil di-sync' });
      await fetchInvoice();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal sync invoice',
        description: requestError.response?.data?.error,
      });
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    try {
      const res = await billingApi.print(Number(id));
      const blob = new Blob([res.data as ArrayBuffer], { type: 'application/pdf' });
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      toast({ variant: 'destructive', title: 'Gagal mencetak invoice' });
    }
  };

  const handlePayment = async () => {
    if (!isVisitFinalized) {
      toast({
        variant: 'destructive',
        title: 'Kunjungan belum final',
        description: 'Finalisasikan kunjungan di EMR sebelum menerima pembayaran di kasir.',
      });
      return;
    }
    if (!paymentMethodId) {
      toast({ variant: 'destructive', title: 'Pilih metode pembayaran' });
      return;
    }
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Masukkan jumlah pembayaran yang valid' });
      return;
    }
    setProcessingPayment(true);
    try {
      const res = await billingApi.pay(Number(id), {
        payment_method_id: Number(paymentMethodId),
        amount,
        reference_number: referenceNumber,
        notes: paymentNotes,
      });
      toast({ title: res.data?.message || 'Pembayaran berhasil dicatat' });
      setPaymentOpen(false);
      setPaymentMethodId('');
      setPaymentAmount('');
      setReferenceNumber('');
      setPaymentNotes('');
      await fetchInvoice();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memproses pembayaran',
        description: requestError.response?.data?.error,
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  const saveInvoiceAdjustments = async (overrides?: {
    discountAmount?: string;
    discountType?: string;
    taxAmount?: string;
    invoiceNotes?: string;
    successMessage?: string;
    closeDialog?: boolean;
  }) => {
    const nextDiscountType = (overrides?.discountType ?? discountType).trim();
    const nextDiscountAmount = nextDiscountType
      ? (parseFloat(overrides?.discountAmount ?? discountAmount) || 0)
      : 0;
    const nextTaxAmount = parseFloat(overrides?.taxAmount ?? taxAmount) || 0;
    const nextInvoiceNotes = overrides?.invoiceNotes ?? invoiceNotes;

    setSavingDiscount(true);
    try {
      await billingApi.update(Number(id), {
        discount: nextDiscountAmount,
        discount_type: nextDiscountType,
        tax: nextTaxAmount,
        notes: nextInvoiceNotes,
      });
      toast({ title: overrides?.successMessage || 'Invoice berhasil diupdate' });
      if (overrides?.closeDialog !== false) {
        setDiscountOpen(false);
      }
      await fetchInvoice();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengupdate invoice',
        description: requestError.response?.data?.error,
      });
    } finally {
      setSavingDiscount(false);
    }
  };

  const handleUpdateDiscount = async () => {
    await saveInvoiceAdjustments();
  };

  const handleRemoveDiscount = async () => {
    await saveInvoiceAdjustments({
      discountAmount: '0',
      discountType: '',
      successMessage: 'Diskon berhasil dihapus',
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="space-y-3 border border-border/70 bg-background p-6 text-center">
          <p className="text-sm font-medium">Invoice tidak ditemukan.</p>
          <Button variant="outline" className="rounded-none shadow-none" onClick={() => navigate('/kasir')}>
            Kembali ke Kasir
          </Button>
        </div>
      </div>
    );
  }

  const statusClass = INVOICE_STATUS_CLASS[invoice.status] || '';
  const statusLabel = INVOICE_STATUS_LABEL[invoice.status] || invoice.status;

  return (
    <>
      <MasterDataPageShell
        title={invoice.invoice_number}
        subtitle={`Invoice untuk ${invoice.patient?.full_name || 'pasien tidak diketahui'} — kunjungan ${invoice.visit?.visit_number || '-'}`}
        onBack={() => navigate('/kasir')}
        badges={
          <Badge variant="outline" className={`rounded-none shadow-none ${statusClass}`}>
            {statusLabel}
          </Badge>
        }
        meta={
          <>
            <span>{invoice.items?.length || 0} item tagihan</span>
            <span>Total {formatCurrency(invoice.total_amount)}</span>
            {remaining > 0 && <span className="text-red-600">Sisa {formatCurrency(remaining)}</span>}
          </>
        }
        actions={
          <>
            {canEdit && (
              <Button
                variant="outline"
                className="rounded-none shadow-none"
                onClick={() => void handleSyncInvoice()}
                disabled={loading}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Ulang
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline"
                className="rounded-none shadow-none"
                onClick={() => setDiscountOpen(true)}
              >
                <Percent className="mr-2 h-4 w-4" />
                Diskon / Pajak
              </Button>
            )}
            <Button
              variant="outline"
              className="rounded-none shadow-none"
              onClick={() => void handlePrint()}
            >
              <Printer className="mr-2 h-4 w-4" />
              Cetak
            </Button>
            {canPay && (
              <Button
                className="rounded-none shadow-none"
                onClick={() => setPaymentOpen(true)}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Proses Pembayaran
              </Button>
            )}
          </>
        }
        aside={
          <MasterDataAsideStack>
            {/* Informasi Pasien */}
            <div>
              <MasterDataAsideSection
                title="Informasi Pasien"
                helper="Data pasien dan kunjungan yang terkait dengan invoice ini."
              >
                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Nama Pasien</span>
                    <span className="font-medium text-right">{invoice.patient?.full_name || '-'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">No. RM</span>
                    <span className="font-mono font-medium text-right">{invoice.patient?.medical_record_number || '-'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">No. Kunjungan</span>
                    <span className="font-mono text-right">{invoice.visit?.visit_number || '-'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Poli</span>
                    <span className="text-right">{invoice.visit?.polyclinic?.name || '-'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Dokter</span>
                    <span className="text-right">{invoice.visit?.doctor?.full_name || '-'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Tgl. Invoice</span>
                    <span className="text-right">{formatDateTime(invoice.invoice_date)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Status Kunjungan</span>
                    <span className="text-right">{isVisitFinalized ? 'Final / Selesai' : 'Belum Final'}</span>
                  </div>
                </div>
                {!isVisitFinalized && (
                  <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Pembayaran kasir baru bisa diproses setelah kunjungan difinalisasi di EMR.
                  </div>
                )}
              </MasterDataAsideSection>
            </div>

            {/* Ringkasan Pembayaran */}
            <div>
              <MasterDataAsideSection
                title="Ringkasan Pembayaran"
                helper="Kalkulasi total tagihan setelah diskon dan pajak diterapkan."
              >
                <div className="space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(invoice.sub_total)}</span>
                  </div>
                  {invoice.discount > 0 && (
                    <div className="flex items-start justify-between gap-3 text-emerald-600">
                      <span>Diskon{invoice.discount_type === 'persen' ? ' (%)' : ''}</span>
                      <span>− {formatCurrency(invoice.discount)}</span>
                    </div>
                  )}
                  {invoice.tax > 0 && (
                    <div className="flex items-start justify-between gap-3 text-orange-600">
                      <span>Pajak</span>
                      <span>+ {formatCurrency(invoice.tax)}</span>
                    </div>
                  )}
                  <div className="border-t border-border/70 pt-2">
                    <div className="flex items-start justify-between gap-3 font-semibold">
                      <span>Total</span>
                      <span>{formatCurrency(invoice.total_amount)}</span>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-emerald-600">
                    <span>Sudah Dibayar</span>
                    <span>{formatCurrency(invoice.paid_amount)}</span>
                  </div>
                  {remaining > 0 && (
                    <div className="flex items-start justify-between gap-3 font-semibold text-red-600">
                      <span>Sisa Tagihan</span>
                      <span>{formatCurrency(remaining)}</span>
                    </div>
                  )}
                </div>
              </MasterDataAsideSection>
            </div>

            {/* Catatan */}
            {invoice.notes && (
              <div>
                <MasterDataAsideSection title="Catatan">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes}</p>
                </MasterDataAsideSection>
              </div>
            )}
          </MasterDataAsideStack>
        }
      >
        {/* ── Rincian Tagihan ── */}
        <MasterDataSection
          title="Rincian Tagihan"
          helper={`${invoice.items?.length || 0} item dari kunjungan ini.`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left">
                  <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">No</th>
                  <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Jenis</th>
                  <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Deskripsi</th>
                  <th className="pb-2 pr-4 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Qty</th>
                  <th className="pb-2 pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Harga Satuan</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="py-3 pr-4 text-muted-foreground">{idx + 1}</td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant="outline"
                          className={`rounded-none shadow-none text-[10px] ${ITEM_TYPE_CLASS[item.item_type] || 'border-slate-200 bg-slate-50 text-slate-500'}`}
                        >
                          {item.item_type}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-medium">{item.description}</td>
                      <td className="py-3 pr-4 text-center">{item.quantity}</td>
                      <td className="py-3 pr-4 text-right text-muted-foreground">{formatCurrency(item.unit_price)}</td>
                      <td className="py-3 text-right font-medium">{formatCurrency(item.total_price)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      Tidak ada item pada invoice ini. Klik "Sync Ulang" untuk mengambil item terbaru dari kunjungan.
                    </td>
                  </tr>
                )}
              </tbody>
              {invoice.items && invoice.items.length > 0 && (
                <tfoot className="border-t border-border/70">
                  <tr>
                    <td colSpan={5} className="pt-3 pr-4 text-right text-muted-foreground">Subtotal</td>
                    <td className="pt-3 text-right">{formatCurrency(invoice.sub_total)}</td>
                  </tr>
                  {invoice.discount > 0 && (
                    <tr>
                      <td colSpan={5} className="pr-4 text-right text-emerald-600">Diskon</td>
                      <td className="text-right text-emerald-600">− {formatCurrency(invoice.discount)}</td>
                    </tr>
                  )}
                  {invoice.tax > 0 && (
                    <tr>
                      <td colSpan={5} className="pr-4 text-right text-orange-600">Pajak</td>
                      <td className="text-right text-orange-600">+ {formatCurrency(invoice.tax)}</td>
                    </tr>
                  )}
                  <tr className="font-semibold">
                    <td colSpan={5} className="pt-2 pr-4 text-right">Total</td>
                    <td className="pt-2 text-right">{formatCurrency(invoice.total_amount)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </MasterDataSection>

        {/* ── Riwayat Pembayaran ── */}
        {invoice.payments && invoice.payments.length > 0 && (
          <MasterDataSection
            title="Riwayat Pembayaran"
            helper={`${invoice.payments.length} transaksi pembayaran.`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left">
                    <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tanggal</th>
                    <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Metode</th>
                    <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Referensi</th>
                    <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Kasir</th>
                    <th className="pb-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Catatan</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {invoice.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{formatDateTime(payment.payment_date)}</td>
                      <td className="py-3 pr-4">{payment.payment_method?.name || '-'}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{payment.reference_number || '-'}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{payment.receiver?.full_name || '-'}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{payment.notes || '-'}</td>
                      <td className="py-3 text-right font-medium text-emerald-600">{formatCurrency(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MasterDataSection>
        )}
      </MasterDataPageShell>

      {/* ── Payment Dialog ── */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Proses Pembayaran</DialogTitle>
            <DialogDescription>
              Sisa tagihan: <span className="font-semibold text-red-600">{formatCurrency(remaining)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <SearchableSelect
                options={paymentMethods.map(pm => ({ value: String(pm.id), label: pm.name }))}
                value={paymentMethodId}
                onValueChange={setPaymentMethodId}
                placeholder="Pilih metode pembayaran"
                searchPlaceholder="Cari metode..."
                square
                portal={false}
              />
            </div>
            <div className="space-y-2">
              <Label>Jumlah Pembayaran</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0"
                className="rounded-none"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-none shadow-none"
                onClick={() => setPaymentAmount(String(remaining))}
              >
                Bayar Lunas ({formatCurrency(remaining)})
              </Button>
            </div>
            <div className="space-y-2">
              <Label>No. Referensi (Opsional)</Label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Nomor referensi transaksi"
                className="rounded-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan (Opsional)</Label>
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Catatan pembayaran"
                className="rounded-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-none shadow-none"
              onClick={() => setPaymentOpen(false)}
            >
              Batal
            </Button>
            <Button
              className="rounded-none shadow-none"
              onClick={() => void handlePayment()}
              disabled={processingPayment}
            >
              {processingPayment && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Proses Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Discount / Tax Dialog ── */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Diskon & Pajak</DialogTitle>
            <DialogDescription>
              Subtotal saat ini: {formatCurrency(invoice.sub_total)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipe Diskon</Label>
              <SearchableSelect
                options={[
                  { value: 'nominal', label: 'Nominal (Rp)' },
                  { value: 'persen', label: 'Persentase (%)' },
                ]}
                value={discountType}
                onValueChange={setDiscountType}
                placeholder="Tipe diskon"
                noneLabel="Tanpa diskon"
                square
                portal={false}
              />
            </div>
            <div className="space-y-2">
              <Label>Diskon {discountType === 'persen' ? '(%)' : '(Rp)'}</Label>
              <Input
                type="number"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="0"
                className="rounded-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Pajak (Rp)</Label>
              <Input
                type="number"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                placeholder="0"
                className="rounded-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan Invoice</Label>
              <Textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                placeholder="Catatan untuk invoice"
                className="rounded-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-none shadow-none"
              onClick={() => setDiscountOpen(false)}
            >
              Batal
            </Button>
            {hasDiscount && (
              <Button
                variant="outline"
                className="rounded-none shadow-none"
                onClick={() => void handleRemoveDiscount()}
                disabled={savingDiscount}
              >
                Hapus Diskon
              </Button>
            )}
            <Button
              className="rounded-none shadow-none"
              onClick={() => void handleUpdateDiscount()}
              disabled={savingDiscount}
            >
              {savingDiscount && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

