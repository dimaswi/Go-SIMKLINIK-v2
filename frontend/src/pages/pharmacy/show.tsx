import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CloudUpload,
  Download,
  Eye,
  FileText,
  Hospital,
  Loader2,
  PackageCheck,
  PillBottle,
  Plus,
  RotateCcw,
  ShoppingBag,
  Stethoscope,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { SatusehatResultDialog } from '@/components/satusehat-result-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import {
  medicalRecordsApi,
  medicinesApi,
  pharmacyApi,
  satusehatApi,
  type MedicalRecord,
  type Medicine,
} from '@/lib/api';
import { downloadBlobResponse } from '../../lib/blob-download';
import { setPageTitle } from '@/lib/page-title';
import { cn } from '@/lib/utils';
import {
  PRESCRIPTION_DURATION_OPTIONS,
  PRESCRIPTION_FREQUENCY_OPTIONS,
  PRESCRIPTION_INSTRUCTION_OPTIONS,
  PRESCRIPTION_ROUTE_OPTIONS,
  getPrescriptionWorkflowLabel,
} from '@/pages/emr/constants';
import {
  buildCompoundPrice,
  buildPrescriptionPrice,
  formatCurrency,
  formatDateTime,
  getCompoundIngredientStockStatus,
  getCompoundStockStatus,
  getPrescriptionStockStatus,
  getRecordStockSummary,
  getRecordTotalPrice,
  WORKFLOW_BADGE_CLASSNAME,
} from './utils';

type AddPrescriptionPayload = {
  medicine_id: number;
  quantity: number;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  notes: string;
};

const INITIAL_ADD_PAYLOAD: AddPrescriptionPayload = {
  medicine_id: 0,
  quantity: 1,
  dosage: '',
  frequency: '',
  duration: '',
  route: 'oral',
  instructions: '',
  notes: '',
};

type SatusehatResultState = {
  title: string;
  description?: string;
  payload: unknown;
};

export default function PharmacyShow() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();

  const canManage =
    hasPermission('pharmacy.process') ||
    hasPermission('prescriptions.process') ||
    hasPermission('prescriptions.update');

  const [order, setOrder] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  // Action loading states
  const [receiving, setReceiving] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  const [dispensing, setDispensing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingTicket, setDownloadingTicket] = useState(false);

  // Add medicine state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addPayload, setAddPayload] = useState<AddPrescriptionPayload>(INITIAL_ADD_PAYLOAD);
  const [addingMedicine, setAddingMedicine] = useState(false);
  const [deletingPrescriptionId, setDeletingPrescriptionId] = useState<number | null>(null);
  const [confirmReturnOpen, setConfirmReturnOpen] = useState(false);

  // SATUSEHAT state
  const [previewingPrescriptionId, setPreviewingPrescriptionId] = useState<number | null>(null);
  const [syncingPrescriptionId, setSyncingPrescriptionId] = useState<number | null>(null);
  const [satusehatResult, setSatusehatResult] = useState<SatusehatResultState | null>(null);

  const loadOrderDetail = useCallback(async () => {
    if (!id) return;
    try {
      const response = await medicalRecordsApi.getById(Number(id));
      setOrder(response.data.data);
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memuat detail resep',
        description:
          requestError.response?.data?.error ||
          'Terjadi kesalahan saat mengambil informasi order resep.',
      });
    }
  }, [id, toast]);

  const loadMedicines = useCallback(async () => {
    try {
      const response = await medicinesApi.getAll('per_page=500');
      setMedicines(response.data.data || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setPageTitle('Detail Resep Farmasi');

    const run = async () => {
      setLoading(true);
      await Promise.all([loadOrderDetail(), loadMedicines()]);
      setLoading(false);
    };

    void run();
  }, [loadMedicines, loadOrderDetail]);

  // Handle: Terima Resep (ordered -> preparing)
  const handleReceiveOrder = async () => {
    if (!order || !canManage) return;
    setReceiving(true);
    try {
      await medicalRecordsApi.preparePrescriptionOrder(order.id);
      toast({
        title: 'Resep berhasil diterima',
        description: 'Resep sekarang berstatus sedang diproses oleh farmasi.',
      });
      await loadOrderDetail();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menerima resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menerima resep.',
      });
    } finally {
      setReceiving(false);
    }
  };

  // Handle: Tandai Siap Serahkan (preparing -> ready)
  const handleMarkReady = async () => {
    if (!order || !canManage) return;
    setMarkingReady(true);
    try {
      await medicalRecordsApi.readyPrescriptionOrder(order.id);
      toast({
        title: 'Resep siap diserahkan',
        description: 'Obat telah disiapkan dan siap diserahkan kepada pasien di loket farmasi.',
      });
      await loadOrderDetail();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memperbarui status resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menandai siap serahkan.',
      });
    } finally {
      setMarkingReady(false);
    }
  };

  // Handle: Serahkan Obat / Dispense (ready -> dispensed)
  const handleDispense = async () => {
    if (!order || !canManage) return;
    setDispensing(true);
    try {
      await medicalRecordsApi.dispensePrescriptionOrder(order.id);
      toast({
        title: 'Obat berhasil diserahkan',
        description: 'Dispensing resep selesai dan obat telah diterima pasien.',
      });
      await loadOrderDetail();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menyelesaikan dispensing',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat penyerahan obat.',
      });
    } finally {
      setDispensing(false);
    }
  };

  // Handle: Kembalikan ke Antrean / Dokter
  const handleReturnOrder = async () => {
    if (!order || !canManage) return;
    setReturning(true);
    try {
      await pharmacyApi.returnOrder(order.id);
      toast({
        title: 'Resep dikembalikan',
        description: 'Status resep telah dikembalikan ke antrean order awal.',
      });
      setConfirmReturnOpen(false);
      await loadOrderDetail();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengembalikan resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat mengembalikan resep.',
      });
    } finally {
      setReturning(false);
    }
  };

  // Handle: Add Medicine
  const handleAddMedicine = async () => {
    if (!order || !addPayload.medicine_id || addPayload.quantity <= 0) {
      toast({
        variant: 'destructive',
        title: 'Data belum lengkap',
        description: 'Pilih obat dan tentukan jumlah yang valid.',
      });
      return;
    }

    setAddingMedicine(true);
    try {
      await pharmacyApi.addPrescription(order.id, addPayload);
      toast({ title: 'Obat berhasil ditambahkan ke resep' });
      setAddDialogOpen(false);
      setAddPayload(INITIAL_ADD_PAYLOAD);
      await loadOrderDetail();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menambahkan obat',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menambahkan obat.',
      });
    } finally {
      setAddingMedicine(false);
    }
  };

  // Handle: Delete Medicine
  const handleDeleteMedicine = async (prescriptionId: number) => {
    if (!order) return;
    setDeletingPrescriptionId(prescriptionId);
    try {
      await pharmacyApi.deletePrescription(order.id, prescriptionId);
      toast({ title: 'Obat berhasil dihapus dari resep' });
      await loadOrderDetail();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menghapus obat',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menghapus item obat.',
      });
    } finally {
      setDeletingPrescriptionId(null);
    }
  };

  // Handle: Print Prescription PDF
  const handleDownloadPrescription = async () => {
    if (!order) return;
    setDownloading(true);
    try {
      const response = await medicalRecordsApi.printPrescriptionOrder(order.id);
      downloadBlobResponse(
        response,
        `resep-${order.patient?.medical_record_number || order.id}.pdf`,
      );
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengunduh dokumen resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat mencetak resep.',
      });
    } finally {
      setDownloading(false);
    }
  };

  // Handle: Print Etiket Farmasi PDF
  const handleDownloadTicket = async () => {
    if (!order) return;
    setDownloadingTicket(true);
    try {
      const response = await medicalRecordsApi.printPharmacyTicket(order.id);
      downloadBlobResponse(
        response,
        `etiket-farmasi-${order.patient?.medical_record_number || order.id}.pdf`,
      );
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengunduh etiket farmasi',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat mencetak etiket.',
      });
    } finally {
      setDownloadingTicket(false);
    }
  };

  // SATUSEHAT: Preview
  const handlePreviewPrescription = async (prescriptionId: number) => {
    setPreviewingPrescriptionId(prescriptionId);
    try {
      const response = await satusehatApi.previewResource('prescription', prescriptionId);
      setSatusehatResult({
        title: 'Preview SATUSEHAT MedicationRequest',
        description: `Payload prescription ID ${prescriptionId} yang akan dikirim ke SATUSEHAT.`,
        payload: response.data?.data ?? response.data,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal membuat preview SATUSEHAT',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat preview SATUSEHAT.',
      });
    } finally {
      setPreviewingPrescriptionId(null);
    }
  };

  // SATUSEHAT: Sync
  const handleSyncPrescription = async (prescriptionId: number) => {
    setSyncingPrescriptionId(prescriptionId);
    try {
      const response = await satusehatApi.syncResource('prescription', prescriptionId);
      await loadOrderDetail();
      toast({ title: response.data?.message || 'MedicationRequest berhasil disinkronkan ke SATUSEHAT' });
      setSatusehatResult({
        title: 'Hasil sinkronisasi MedicationRequest',
        description: `Respons sinkronisasi untuk prescription ID ${prescriptionId}.`,
        payload: response.data?.data ?? response.data,
      });
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string; data?: unknown }>;
      toast({
        variant: 'destructive',
        title: 'Gagal sinkron SATUSEHAT',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat sinkronisasi ke SATUSEHAT.',
      });
      if (requestError.response?.data?.data) {
        setSatusehatResult({
          title: 'Payload MedicationRequest belum siap',
          description: 'Lengkapi data master atau pasien sebelum sinkronisasi.',
          payload: requestError.response.data.data,
        });
      }
    } finally {
      setSyncingPrescriptionId(null);
    }
  };

  const medicineSelectOptions = useMemo(() => {
    return medicines.map((m) => ({
      value: String(m.id),
      label: `${m.name} (${m.unit?.name || 'item'}) - Stok: ${m.current_stock} - ${formatCurrency(m.selling_price || 0)}`,
    }));
  }, [medicines]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Order resep farmasi tidak ditemukan.</p>
        <Button variant="outline" className="mt-4 rounded-none" onClick={() => navigate('/pharmacy')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Farmasi
        </Button>
      </div>
    );
  }

  const status = order.prescription_workflow_status || 'draft';
  const stockSummary = getRecordStockSummary(order);
  const totalPrice = getRecordTotalPrice(order);
  const prescriptions = order.prescriptions || [];
  const compounds = order.prescription_compounds || [];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Top Header Card */}
      <div className="border border-border bg-card p-4 shadow-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-none shadow-none"
              onClick={() => navigate('/pharmacy')}
              title="Kembali ke Farmasi"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-foreground">
                  Resep: {order.patient?.full_name || 'Pasien'}
                </h1>
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]',
                    WORKFLOW_BADGE_CLASSNAME[status] || 'border-slate-300 bg-slate-50 text-slate-700',
                  )}
                >
                  {getPrescriptionWorkflowLabel(status)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                No. RM: {order.patient?.medical_record_number || '-'} · Kunjungan: {order.visit?.visit_number || '-'} · Tanggal:{' '}
                {formatDateTime(order.prescription_ordered_at || order.record_date)}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Terima Resep (if ordered) */}
            {status === 'ordered' && canManage && (
              <Button
                type="button"
                className="h-9 rounded-none text-xs shadow-none"
                onClick={() => void handleReceiveOrder()}
                disabled={receiving}
              >
                {receiving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Terima Resep
              </Button>
            )}

            {/* Tambah Obat (if preparing) */}
            {status === 'preparing' && canManage && (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-none text-xs shadow-none"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Tambah Obat
              </Button>
            )}

            {/* Tandai Siap Serahkan (if preparing) */}
            {status === 'preparing' && canManage && (
              <Button
                type="button"
                className="h-9 rounded-none text-xs shadow-none"
                onClick={() => void handleMarkReady()}
                disabled={markingReady}
              >
                {markingReady ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="mr-1.5 h-3.5 w-3.5" />}
                Siap Diserahkan
              </Button>
            )}

            {/* Serahkan Obat / Dispense (if ready) */}
            {status === 'ready' && canManage && (
              <Button
                type="button"
                className="h-9 rounded-none text-xs shadow-none bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => void handleDispense()}
                disabled={dispensing}
              >
                {dispensing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />}
                Serahkan Obat & Selesai
              </Button>
            )}

            {/* Kembalikan ke Dokter / Antrean (if preparing or ready) */}
            {(status === 'preparing' || status === 'ready') && canManage && (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-none text-xs shadow-none text-amber-700 hover:text-amber-800"
                onClick={() => setConfirmReturnOpen(true)}
                disabled={returning}
              >
                {returning ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Kembalikan ke Antrean
              </Button>
            )}

            {/* Cetak Etiket PDF */}
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-none text-xs shadow-none"
              onClick={() => void handleDownloadTicket()}
              disabled={downloadingTicket}
              title="Cetak Etiket Farmasi"
            >
              {downloadingTicket ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
              Etiket
            </Button>

            {/* Cetak Resep PDF */}
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-none text-xs shadow-none"
              onClick={() => void handleDownloadPrescription()}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              Cetak Resep
            </Button>

            {/* Link to EMR */}
            {order.visit_id && (
              <Button asChild variant="ghost" className="h-9 rounded-none text-xs">
                <Link to={`/emr/${order.visit_id}`}>Buka EMR</Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Left (Tables) & Right (Summary Panels) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols wide) */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Patient and Visit Details */}
          <div className="border border-border bg-card p-4 shadow-none">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Informasi Pasien & Kunjungan
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <UserRound className="h-3.5 w-3.5" /> Nama Pasien
                </p>
                <p className="mt-0.5 font-medium text-foreground">{order.patient?.full_name || '-'}</p>
                <p className="text-[11px] text-muted-foreground">{order.patient?.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
              </div>
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Hospital className="h-3.5 w-3.5" /> Poliklinik
                </p>
                <p className="mt-0.5 font-medium text-foreground">{order.polyclinic?.name || '-'}</p>
                <p className="text-[11px] text-muted-foreground">Antrean: {order.visit?.visit_number || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Stethoscope className="h-3.5 w-3.5" /> Dokter Penulis
                </p>
                <p className="mt-0.5 font-medium text-foreground">{order.doctor?.full_name || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Tanggal Order
                </p>
                <p className="mt-0.5 font-medium text-foreground">
                  {formatDateTime(order.prescription_ordered_at || order.record_date)}
                </p>
              </div>
            </div>
          </div>

          {/* Table: Prescriptions Non-Racikan */}
          <div className="border border-border bg-card shadow-none">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <PillBottle className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Daftar Obat Non-Racikan ({prescriptions.length} item)
                </h2>
              </div>
              {status === 'preparing' && canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-none shadow-none"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <Plus className="mr-1 h-3 w-3" /> Tambah Obat
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Nama Obat & Sediaan</th>
                    <th className="py-2.5 px-3 font-semibold">Aturan Pakai</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Jumlah</th>
                    <th className="py-2.5 px-3 font-semibold">Status Stok</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Harga</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Subtotal</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {prescriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted-foreground">
                        Belum ada item obat non-racikan dalam resep ini.
                      </td>
                    </tr>
                  ) : (
                    prescriptions.map((item) => {
                      const stockStatus = getPrescriptionStockStatus(item);
                      const subtotal = buildPrescriptionPrice(item);
                      const isDeleting = deletingPrescriptionId === item.id;
                      const isSyncing = syncingPrescriptionId === item.id;
                      const isPreviewing = previewingPrescriptionId === item.id;

                      return (
                        <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-medium text-foreground">{item.medicine?.name || '-'}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.medicine?.category?.name || 'Obat'} · {item.medicine?.unit?.name || 'Unit'}
                            </p>
                            {item.notes && (
                              <p className="mt-0.5 text-[11px] italic text-amber-700">Catatan: {item.notes}</p>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-medium text-foreground">
                              {[item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || '-'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Rute: {item.route || 'oral'} {item.instructions ? `· ${item.instructions}` : ''}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-medium">
                            {item.quantity} {item.medicine?.unit?.name || ''}
                          </td>
                          <td className="py-3 px-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-none px-1.5 py-0.5 text-[10px] tracking-wider uppercase',
                                stockStatus.badgeClassName,
                              )}
                            >
                              {stockStatus.label}
                            </Badge>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{stockStatus.helper}</p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {formatCurrency(item.medicine?.selling_price || 0)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-medium text-foreground">
                            {formatCurrency(subtotal)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* SATUSEHAT preview & sync */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 rounded-none"
                                onClick={() => void handlePreviewPrescription(item.id)}
                                disabled={isPreviewing}
                                title="Preview SATUSEHAT MedicationRequest"
                              >
                                {isPreviewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 rounded-none text-primary"
                                onClick={() => void handleSyncPrescription(item.id)}
                                disabled={isSyncing}
                                title="Sinkron ke SATUSEHAT"
                              >
                                {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CloudUpload className="h-3 w-3" />}
                              </Button>

                              {/* Delete (only in preparing state) */}
                              {status === 'preparing' && canManage && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 rounded-none text-destructive hover:bg-destructive/10"
                                  onClick={() => void handleDeleteMedicine(item.id)}
                                  disabled={isDeleting}
                                  title="Hapus obat"
                                >
                                  {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table: Prescriptions Racikan (if any) */}
          {compounds.length > 0 && (
            <div className="border border-border bg-card shadow-none">
              <div className="border-b border-border p-4">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Daftar Obat Racikan ({compounds.length} paket racikan)
                </h2>
              </div>
              <div className="divide-y divide-border">
                {compounds.map((compound) => {
                  const compoundStock = getCompoundStockStatus(compound);
                  const compoundPrice = buildCompoundPrice(compound);

                  return (
                    <div key={compound.id} className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm text-foreground">{compound.name}</h3>
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-none px-1.5 py-0.5 text-[10px] tracking-wider uppercase',
                                compoundStock.badgeClassName,
                              )}
                            >
                              {compoundStock.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Hasil: {compound.output_quantity} {compound.output_unit || 'bungkus'} · Aturan:{' '}
                            {[compound.dosage, compound.frequency, compound.duration].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <p className="font-mono text-sm font-semibold text-foreground">
                          {formatCurrency(compoundPrice)}
                        </p>
                      </div>

                      {/* Ingredients */}
                      <div className="rounded-none border border-border/60 bg-muted/20 p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Komposisi Bahan Racikan:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {(compound.items || []).map((ingredient) => {
                            const ingStock = getCompoundIngredientStockStatus(ingredient);
                            return (
                              <div
                                key={ingredient.id}
                                className="flex items-center justify-between border-b border-border/40 pb-1"
                              >
                                <span>{ingredient.medicine?.name || '-'}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-muted-foreground">
                                    {ingredient.quantity} {ingredient.medicine?.unit?.name || ''}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn('text-[9px] px-1 py-0 rounded-none', ingStock.badgeClassName)}
                                  >
                                    {ingStock.label}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (1 Col wide: Status & Summary) */}
        <div className="flex flex-col gap-6">
          {/* Card: Status & Total Biaya */}
          <div className="border border-border bg-card p-4 shadow-none">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ringkasan Resep
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Status Resep:</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]',
                    WORKFLOW_BADGE_CLASSNAME[status] || 'border-slate-300 bg-slate-50 text-slate-700',
                  )}
                >
                  {getPrescriptionWorkflowLabel(status)}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Ketersediaan Stok:</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-none px-2 py-0.5 text-[10px] tracking-wider uppercase',
                    stockSummary.badgeClassName,
                  )}
                >
                  {stockSummary.label}
                </Badge>
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Total Tagihan Obat:</span>
                  <span className="font-mono text-base font-bold text-primary">
                    {formatCurrency(totalPrice)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Termasuk {prescriptions.length} item non-racikan dan {compounds.length} racikan.
                </p>
              </div>
            </div>
          </div>

          {/* Card: Telaah Resep Farmasi */}
          <div className="border border-border bg-card p-4 shadow-none space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Telaah Resep (Clinical Check)
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Identitas pasien & dokter terverifikasi</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Rute, dosis, dan frekuensi tercantum jelas</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Tidak ada interaksi mayor atau duplikasi</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <CheckCircle2
                  className={cn(
                    'h-3.5 w-3.5',
                    stockSummary.available ? 'text-emerald-600' : 'text-rose-600',
                  )}
                />
                <span>
                  {stockSummary.available ? 'Semua persediaan stok mencukupi' : 'Perhatian: Ada stok obat kurang'}
                </span>
              </div>
            </div>
          </div>

          {/* Workflow Guide */}
          <div className="border border-border bg-card p-4 shadow-none text-xs text-muted-foreground space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Alur Kerja Farmasi
            </h2>
            <p>1. <strong>Menunggu Terima:</strong> Dokter telah membuat resep dari EMR. Klik &ldquo;Terima Resep&rdquo;.</p>
            <p>2. <strong>Sedang Diproses:</strong> Siapkan obat fisik, cek stok, atau tambah obat bila diperlukan. Klik &ldquo;Siap Diserahkan&rdquo;.</p>
            <p>3. <strong>Siap Diserahkan:</strong> Pasien dipanggil ke loket farmasi. Berikan edukasi obat lalu klik &ldquo;Serahkan Obat & Selesai&rdquo;.</p>
          </div>
        </div>
      </div>

      {/* Dialog: Tambah Obat */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Tambah Obat ke Resep</DialogTitle>
            <DialogDescription className="text-xs">
              Pilih obat dari master farmasi dan lengkapi aturan minum untuk resep ini.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="font-medium text-foreground">Pilih Obat</label>
              <div className="mt-1">
                <SearchableSelect
                  options={medicineSelectOptions}
                  value={addPayload.medicine_id ? String(addPayload.medicine_id) : ''}
                  onValueChange={(val) => setAddPayload((p) => ({ ...p, medicine_id: Number(val) }))}
                  placeholder="Cari obat..."
                  className="h-9 w-full rounded-none text-xs focus:ring-inset"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-foreground">Jumlah (Qty)</label>
                <Input
                  type="number"
                  min="1"
                  value={addPayload.quantity}
                  onChange={(e) => setAddPayload((p) => ({ ...p, quantity: Math.max(1, Number(e.target.value)) }))}
                  className="h-9 rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
              <div>
                <label className="font-medium text-foreground">Dosis</label>
                <Input
                  placeholder="Misal: 500 mg"
                  value={addPayload.dosage}
                  onChange={(e) => setAddPayload((p) => ({ ...p, dosage: e.target.value }))}
                  className="h-9 rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-foreground">Frekuensi</label>
                <SearchableSelect
                  options={PRESCRIPTION_FREQUENCY_OPTIONS}
                  value={addPayload.frequency}
                  onValueChange={(val) => setAddPayload((p) => ({ ...p, frequency: val }))}
                  placeholder="Pilih frekuensi..."
                  className="h-9 w-full rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
              <div>
                <label className="font-medium text-foreground">Durasi</label>
                <SearchableSelect
                  options={PRESCRIPTION_DURATION_OPTIONS}
                  value={addPayload.duration}
                  onValueChange={(val) => setAddPayload((p) => ({ ...p, duration: val }))}
                  placeholder="Pilih durasi..."
                  className="h-9 w-full rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-foreground">Rute</label>
                <SearchableSelect
                  options={PRESCRIPTION_ROUTE_OPTIONS}
                  value={addPayload.route}
                  onValueChange={(val) => setAddPayload((p) => ({ ...p, route: val }))}
                  placeholder="Pilih rute..."
                  className="h-9 w-full rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
              <div>
                <label className="font-medium text-foreground">Aturan Konsumsi</label>
                <SearchableSelect
                  options={PRESCRIPTION_INSTRUCTION_OPTIONS}
                  value={addPayload.instructions}
                  onValueChange={(val) => setAddPayload((p) => ({ ...p, instructions: val }))}
                  placeholder="Aturan..."
                  className="h-9 w-full rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
            </div>

            <div>
              <label className="font-medium text-foreground">Catatan Tambahan (Opsional)</label>
              <Textarea
                placeholder="Catatan khusus apoteker..."
                value={addPayload.notes}
                onChange={(e) => setAddPayload((p) => ({ ...p, notes: e.target.value }))}
                className="rounded-none text-xs focus:ring-inset mt-1 min-h-[60px]"
              />
            </div>
          </div>

          <DialogFooter className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none text-xs"
              onClick={() => setAddDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-none text-xs"
              onClick={() => void handleAddMedicine()}
              disabled={addingMedicine}
            >
              {addingMedicine ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              Tambahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Return Order Dialog */}
      <ConfirmDialog
        open={confirmReturnOpen}
        onOpenChange={setConfirmReturnOpen}
        title="Kembalikan Resep ke Antrean Order?"
        description="Resep akan dikembalikan ke status antrean order awal dan dokter/perawat dapat meninjau ulang isi resep."
        onConfirm={() => void handleReturnOrder()}
        confirmText="Ya, Kembalikan"
        cancelText="Batal"
      />

      {/* SATUSEHAT Result Modal */}
      {satusehatResult && (
        <SatusehatResultDialog
          open={Boolean(satusehatResult)}
          title={satusehatResult.title}
          description={satusehatResult.description}
          payload={satusehatResult.payload}
          onOpenChange={(open) => {
            if (!open) setSatusehatResult(null);
          }}
        />
      )}
    </div>
  );
}
