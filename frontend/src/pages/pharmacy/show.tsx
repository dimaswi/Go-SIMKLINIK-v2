import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CloudUpload,
  CornerDownRight,
  Eye,
  FileCheck,
  FileText,
  FlaskConical,
  Loader2,
  PackageCheck,
  Pencil,
  PillBottle,
  Plus,
  Printer,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  type Prescription,
} from '@/lib/api';
import { downloadBlobResponse } from '../../lib/blob-download';
import { setPageTitle } from '@/lib/page-title';
import { cn } from '@/lib/utils';
import {
  PRESCRIPTION_SIGNA_OPTIONS,
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
import {
  InitialReviewModal,
  FinalReviewModal,
  type InitialReviewData,
  type FinalReviewData,
} from './components/prescription-review-modal';
import {
  CompoundDeductionModal,
  type CompoundDeductionItem,
} from './components/compound-deduction-modal';

type PharmacyPrescriptionFormPayload = {
  medicine_id: number;
  quantity: number;
  dosage: string;
  instructions: string;
  notes: string;
};

const INITIAL_FORM_PAYLOAD: PharmacyPrescriptionFormPayload = {
  medicine_id: 0,
  quantity: 1,
  dosage: '',
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
  const [downloadingTicket, setDownloadingTicket] = useState(false);
  const [downloadingDoctor, setDownloadingDoctor] = useState(false);
  const [downloadingPharmacy, setDownloadingPharmacy] = useState(false);

  // Add medicine state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addPayload, setAddPayload] = useState<PharmacyPrescriptionFormPayload>(INITIAL_FORM_PAYLOAD);
  const [addingMedicine, setAddingMedicine] = useState(false);

  // Edit medicine state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);
  const [editPayload, setEditPayload] = useState<PharmacyPrescriptionFormPayload>(INITIAL_FORM_PAYLOAD);
  const [updatingMedicine, setUpdatingMedicine] = useState(false);

  const [deletingPrescriptionId, setDeletingPrescriptionId] = useState<number | null>(null);
  const [confirmReturnOpen, setConfirmReturnOpen] = useState(false);
  const [patientModalOpen, setPatientModalOpen] = useState(false);

  // Prescription Review Modal state (Terpisah: Awal & Akhir)
  const [initialReviewOpen, setInitialReviewOpen] = useState(false);
  const [finalReviewOpen, setFinalReviewOpen] = useState(false);

  // Compound deduction validation modal state
  const [compoundDeductionModalOpen, setCompoundDeductionModalOpen] = useState(false);
  const [pendingCompoundDeductions, setPendingCompoundDeductions] = useState<CompoundDeductionItem[] | null>(null);

  // SATUSEHAT state
  const [previewingPrescriptionId, setPreviewingPrescriptionId] = useState<number | null>(null);
  const [syncingPrescriptionId, setSyncingPrescriptionId] = useState<number | null>(null);
  const [satusehatResult, setSatusehatResult] = useState<SatusehatResultState | null>(null);

  // Collapsible state for racikan ingredients
  const [expandedCompoundIds, setExpandedCompoundIds] = useState<Record<number, boolean>>({});

  const toggleCompoundExpand = (compoundId: number) => {
    setExpandedCompoundIds((prev) => ({
      ...prev,
      [compoundId]: !prev[compoundId],
    }));
  };

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

  // Submit Telaah Awal (Jika ordered -> terima resep & update status ke preparing; Jika selain itu -> update data telaah awal)
  const handleConfirmInitialReview = async (reviewData: InitialReviewData) => {
    if (!order || !canManage) return;
    setReceiving(true);
    try {
      if (status === 'ordered') {
        await medicalRecordsApi.preparePrescriptionOrder(order.id, {
          prescription_review_initial: JSON.stringify(reviewData),
        });
        toast({
          title: 'Resep berhasil diterima & ditelaah',
          description: 'Status resep telah diperbarui menjadi sedang diproses oleh farmasi.',
        });
      } else {
        await medicalRecordsApi.updatePrescriptionReview(order.id, {
          prescription_review_initial: JSON.stringify(reviewData),
        });
        toast({
          title: 'Telaah resep berhasil disimpan',
          description: 'Data telaah awal resep tersimpan.',
        });
      }
      await loadOrderDetail();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memproses telaah resep',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat memproses telaah resep.',
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

  // Konfirmasi Validasi Pemotongan Stok Racikan -> Lanjut ke Verifikasi Akhir (5 Benar & PIO)
  const handleConfirmCompoundDeductions = (deductions: CompoundDeductionItem[]) => {
    setPendingCompoundDeductions(deductions);
    setCompoundDeductionModalOpen(false);
    setFinalReviewOpen(true);
  };

  // Simpan Penyesuaian Pengurangan Stok Racikan (tanpa langsung menyerahkan)
  const handleSaveCompoundDeductionsOnly = async (deductions: CompoundDeductionItem[]) => {
    if (!order) return;
    try {
      await medicalRecordsApi.updatePrescriptionCompoundDeductions(order.id, deductions);
      toast({
        title: 'Pengurangan stok racikan berhasil disimpan',
        description: 'Penyesuaian kuantitas bahan racikan berhasil diperbarui di database.',
      });
      await loadOrderDetail();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal menyimpan penyesuaian racikan',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat menyimpan penyesuaian stok racikan.',
      });
    }
  };

  // Submit Verifikasi Akhir & PIO (Jika ready -> dispense & update status ke dispensed; Jika selain itu -> update data verifikasi)
  const handleConfirmFinalReview = async (reviewData: FinalReviewData) => {
    if (!order || !canManage) return;
    setDispensing(true);
    try {
      if (status === 'ready') {
        await medicalRecordsApi.dispensePrescriptionOrder(order.id, {
          prescription_review_final: JSON.stringify(reviewData),
          compound_deductions: pendingCompoundDeductions || undefined,
        });
        toast({
          title: 'Obat berhasil diserahkan',
          description: 'Dispensing resep selesai dan pengurangan stok racikan telah diproses sesuai validasi farmasi.',
        });
      } else {
        await medicalRecordsApi.updatePrescriptionReview(order.id, {
          prescription_review_final: JSON.stringify(reviewData),
        });
        toast({
          title: 'Verifikasi akhir berhasil disimpan',
          description: 'Data verifikasi akhir & PIO resep tersimpan.',
        });
      }
      setPendingCompoundDeductions(null);
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
      await pharmacyApi.addPrescription(order.id, {
        medicine_id: addPayload.medicine_id,
        quantity: addPayload.quantity,
        dosage: addPayload.dosage,
        instructions: addPayload.instructions,
        notes: addPayload.notes,
        route: 'oral',
      });
      toast({ title: 'Obat berhasil ditambahkan ke resep' });
      setAddDialogOpen(false);
      setAddPayload(INITIAL_FORM_PAYLOAD);
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

  // Handle: Open Edit Dialog
  const handleOpenEditDialog = (item: Prescription) => {
    setEditingPrescription(item);
    setEditPayload({
      medicine_id: item.medicine_id,
      quantity: item.quantity,
      dosage: item.dosage || '',
      instructions: item.instructions || '',
      notes: item.notes || '',
    });
    setEditDialogOpen(true);
  };

  // Handle: Update Medicine
  const handleUpdateMedicine = async () => {
    if (!order || !editingPrescription || !editPayload.medicine_id || editPayload.quantity <= 0) {
      toast({
        variant: 'destructive',
        title: 'Data belum lengkap',
        description: 'Pilih obat dan tentukan jumlah yang valid.',
      });
      return;
    }

    setUpdatingMedicine(true);
    try {
      await pharmacyApi.updatePrescription(order.id, editingPrescription.id, {
        medicine_id: editPayload.medicine_id,
        quantity: editPayload.quantity,
        dosage: editPayload.dosage,
        instructions: editPayload.instructions,
        notes: editPayload.notes,
        route: 'oral',
      });
      toast({ title: 'Obat resep berhasil diperbarui' });
      setEditDialogOpen(false);
      setEditingPrescription(null);
      setEditPayload(INITIAL_FORM_PAYLOAD);
      await loadOrderDetail();
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal memperbarui obat',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat memperbarui item obat.',
      });
    } finally {
      setUpdatingMedicine(false);
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

  // Handle: Print Resep Dokter Asli
  const handleDownloadDoctorPrescription = async () => {
    if (!order) return;
    setDownloadingDoctor(true);
    try {
      const response = await medicalRecordsApi.printPrescriptionOrder(order.id, 'doctor');
      downloadBlobResponse(
        response,
        `resep-asli-dokter-${order.visit?.visit_number || order.patient?.medical_record_number || order.id}.pdf`,
      );
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengunduh resep asli dokter',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat mencetak resep dokter.',
      });
    } finally {
      setDownloadingDoctor(false);
    }
  };

  // Handle: Print Lembar Resep Petugas Farmasi
  const handleDownloadPharmacyPrescription = async () => {
    if (!order) return;
    setDownloadingPharmacy(true);
    try {
      const response = await medicalRecordsApi.printPrescriptionOrder(order.id, 'pharmacy');
      downloadBlobResponse(
        response,
        `resep-farmasi-${order.visit?.visit_number || order.patient?.medical_record_number || order.id}.pdf`,
      );
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string }>;
      toast({
        variant: 'destructive',
        title: 'Gagal mengunduh resep farmasi',
        description: requestError.response?.data?.error || 'Terjadi kesalahan saat mencetak resep farmasi.',
      });
    } finally {
      setDownloadingPharmacy(false);
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
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 p-4 md:p-6 pb-6">
        {/* Single Unified Card */}
        <div className="border border-border bg-card shadow-none">
          <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={() => navigate('/pharmacy')}
                title="Kembali ke Farmasi"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20 shrink-0">
                <PillBottle className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-bold text-foreground truncate">
                    {order.patient?.full_name || 'Pasien'}
                  </h1>
                  <Badge variant="outline" className="rounded-none font-mono text-xs shadow-none">
                    RM: {order.patient?.medical_record_number || '-'}
                  </Badge>
                  <Badge variant="outline" className="rounded-none text-xs shadow-none">
                    #{order.visit?.visit_number || '-'}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]',
                      WORKFLOW_BADGE_CLASSNAME[status] || 'border-slate-300 bg-slate-50 text-slate-700',
                    )}
                  >
                    {getPrescriptionWorkflowLabel(status)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-none px-2 py-0.5 text-[10px] tracking-wider uppercase',
                      stockSummary.badgeClassName,
                    )}
                  >
                    {stockSummary.label}
                  </Badge>
                  <Badge variant="outline" className="rounded-none font-mono text-xs shadow-none border-primary/30 text-primary">
                    {formatCurrency(totalPrice)}
                  </Badge>
                  <Badge variant="outline" className="rounded-none text-xs shadow-none hidden sm:inline-flex">
                    {prescriptions.length} non-racikan{compounds.length > 0 ? `, ${compounds.length} racikan` : ''}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{order.polyclinic?.name || '-'}</span>
                  <span>•</span>
                  <span>dr. {order.doctor?.full_name || '-'}</span>
                  <span>•</span>
                  <span>{formatDateTime(order.prescription_ordered_at || order.record_date)}</span>
                  <span>•</span>
                  <span className="uppercase">{order.visit?.payment_type || 'UMUM'}</span>
                </div>
              </div>
            </div>

            {/* Action buttons: Patient info & Unified print */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Modal Detail Pasien & Kunjungan */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
                onClick={() => setPatientModalOpen(true)}
                title="Informasi Pasien & Kunjungan"
              >
                <UserRound className="h-4 w-4 text-primary" />
              </Button>

              {/* 1 Tombol Dropdown Cetak Terpadu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 rounded-none shadow-none shrink-0 gap-1.5 text-xs"
                    disabled={downloadingDoctor || downloadingPharmacy || downloadingTicket}
                    title="Cetak Dokumen Resep & Etiket"
                  >
                    {downloadingDoctor || downloadingPharmacy || downloadingTicket ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Printer className="h-4 w-4 text-primary" />
                    )}
                    <span>Cetak</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-none">
                  <DropdownMenuItem
                    onClick={() => void handleDownloadPharmacyPrescription()}
                    disabled={downloadingPharmacy}
                    className="cursor-pointer text-xs py-2"
                  >
                    <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                    <span>Resep Farmasi</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void handleDownloadDoctorPrescription()}
                    disabled={downloadingDoctor}
                    className="cursor-pointer text-xs py-2"
                  >
                    <FileCheck className="mr-2 h-4 w-4 text-blue-600" />
                    <span>Resep Asli Dokter</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void handleDownloadTicket()}
                    disabled={downloadingTicket}
                    className="cursor-pointer text-xs py-2"
                  >
                    <Tag className="mr-2 h-4 w-4 text-purple-600" />
                    <span>Etiket Obat</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Section: Unified Prescriptions & Compounds Table */}
          <div>
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <PillBottle className="h-3.5 w-3.5 text-primary" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Daftar Obat Resep ({prescriptions.length + compounds.length} item)
                </h2>
              </div>
              {status === 'preparing' && canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs rounded-none shadow-none"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Obat
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
                  {prescriptions.length === 0 && compounds.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        Belum ada item obat dalam resep ini.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* Non-Racikan Rows */}
                      {prescriptions.map((item) => {
                        const stockStatus = getPrescriptionStockStatus(item);
                        const subtotal = buildPrescriptionPrice(item);
                        const isDeleting = deletingPrescriptionId === item.id;
                        const isSyncing = syncingPrescriptionId === item.id;
                        const isPreviewing = previewingPrescriptionId === item.id;

                        return (
                          <tr key={`prescription-${item.id}`} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-foreground">{item.medicine?.name || '-'}</span>
                                <Badge variant="outline" className="text-[9px] uppercase px-1 py-0 rounded-none bg-muted/40 text-muted-foreground">
                                  Non-Racikan
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
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
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 rounded-none shadow-none"
                                  onClick={() => void handlePreviewPrescription(item.id)}
                                  disabled={isPreviewing}
                                  title="Preview SATUSEHAT MedicationRequest"
                                >
                                  {isPreviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 rounded-none text-primary shadow-none"
                                  onClick={() => void handleSyncPrescription(item.id)}
                                  disabled={isSyncing}
                                  title="Sinkron ke SATUSEHAT"
                                >
                                  {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                                </Button>

                                {status === 'preparing' && canManage && (
                                  <>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 rounded-none text-muted-foreground hover:text-foreground shadow-none"
                                      onClick={() => handleOpenEditDialog(item)}
                                      title="Edit obat & aturan pakai"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 rounded-none text-destructive hover:bg-destructive/10 shadow-none"
                                      onClick={() => void handleDeleteMedicine(item.id)}
                                      disabled={isDeleting}
                                      title="Hapus obat dari resep"
                                    >
                                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Racikan Rows */}
                      {compounds.map((compound) => {
                        const compoundStock = getCompoundStockStatus(compound);
                        const compoundPrice = buildCompoundPrice(compound);
                        const isExpanded = Boolean(expandedCompoundIds[compound.id]);

                        return (
                          <Fragment key={`compound-group-${compound.id}`}>
                            <tr
                              className={cn(
                                'hover:bg-muted/20 transition-colors cursor-pointer select-none',
                                isExpanded && 'bg-muted/15'
                              )}
                              onClick={() => toggleCompoundExpand(compound.id)}
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 rounded-none shadow-none text-muted-foreground hover:text-foreground shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleCompoundExpand(compound.id);
                                    }}
                                    title={isExpanded ? 'Tutup rincian bahan' : 'Buka rincian bahan'}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-primary" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <FlaskConical className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="font-semibold text-foreground">{compound.name}</span>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] uppercase px-1 py-0 rounded-none bg-primary/10 text-primary border-primary/30"
                                  >
                                    Racikan
                                  </Badge>
                                  <span className="text-[11px] text-muted-foreground font-normal">
                                    ({compound.items?.length || 0} bahan)
                                  </span>
                                  {compound.notes && (
                                    <span className="text-[11px] italic text-muted-foreground font-normal">
                                      · {compound.notes}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <p className="font-medium text-foreground">
                                  {[compound.dosage, compound.frequency, compound.duration].filter(Boolean).join(' · ') || compound.instructions || '-'}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  Rute: {compound.route || 'oral'} {compound.instructions && compound.instructions !== [compound.dosage, compound.frequency, compound.duration].filter(Boolean).join(' · ') ? `· ${compound.instructions}` : ''}
                                </p>
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-medium">
                                {compound.output_quantity} {compound.output_unit || 'bungkus'}
                              </td>
                              <td className="py-3 px-3">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'rounded-none px-1.5 py-0.5 text-[10px] tracking-wider uppercase',
                                    compoundStock.badgeClassName,
                                  )}
                                >
                                  {compoundStock.label}
                                </Badge>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">{compoundStock.helper}</p>
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                                -
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-medium text-foreground">
                                {formatCurrency(compoundPrice)}
                              </td>
                              <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 rounded-none shadow-none text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleCompoundExpand(compound.id)}
                                  title={isExpanded ? 'Tutup rincian bahan' : 'Buka rincian bahan'}
                                >
                                  {isExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                              </td>
                            </tr>

                            {/* Ingredient Sub-Rows directly in the table */}
                            {isExpanded &&
                              (compound.items || []).map((ingredient) => {
                                const ingStock = getCompoundIngredientStockStatus(ingredient);
                                const doseMatch = ingredient.notes?.match(/Dosis:\s*([^·]+)/i)?.[1]?.trim();
                                const extraNote = ingredient.notes?.replace(/Dosis:\s*[^·]+(·\s*)?/i, '').trim();
                                const ingredientSubtotal = (ingredient.medicine?.selling_price || 0) * (ingredient.quantity || 0);

                                return (
                                  <tr
                                    key={`ingredient-${ingredient.id}`}
                                    className="bg-muted/15 hover:bg-muted/25 transition-colors border-b border-border/50 text-xs"
                                  >
                                    <td className="py-2.5 px-4 pl-9">
                                      <div className="flex items-center gap-2">
                                        <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-medium text-foreground">
                                            {ingredient.medicine?.name || '-'}
                                          </span>
                                          {ingredient.medicine?.strength && (
                                            <span className="text-[11px] text-muted-foreground">
                                              ({ingredient.medicine.strength})
                                            </span>
                                          )}
                                          {doseMatch && (
                                            <Badge
                                              variant="outline"
                                              className="text-[9px] font-mono px-1 py-0 rounded-none bg-primary/10 text-primary border-primary/25"
                                            >
                                              {doseMatch}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-muted-foreground">
                                      {extraNote || (doseMatch ? `Bahan racikan` : 'Komposisi bahan')}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-mono">
                                      {ingredient.quantity} {ingredient.medicine?.unit?.name || 'item'}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <Badge
                                        variant="outline"
                                        className={cn('text-[9px] px-1 py-0 rounded-none', ingStock.badgeClassName)}
                                      >
                                        {ingStock.label}
                                      </Badge>
                                      <p className="mt-0.5 text-[10px] text-muted-foreground">{ingStock.helper}</p>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                                      {formatCurrency(ingredient.medicine?.selling_price || 0)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-foreground font-medium">
                                      {formatCurrency(ingredientSubtotal)}
                                    </td>
                                    <td className="py-2.5 px-4 text-center text-muted-foreground">
                                      -
                                    </td>
                                  </tr>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar with Telaah, Kembalikan, and Siap Serahkan */}
      <div className="sticky bottom-0 z-30 mt-auto border-t border-border/70 bg-card/95 px-4 py-2.5 backdrop-blur sm:px-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>Status: <strong className="text-foreground">{getPrescriptionWorkflowLabel(status)}</strong></span>
            <span>•</span>
            <span className="font-mono font-medium text-foreground">{formatCurrency(totalPrice)}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tombol Telaah Awal: jika sudah ada telaah awal tersimpan */}
            {status !== 'ordered' && Boolean(order.prescription_review_initial) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 rounded-none shadow-none text-xs gap-1.5 border-emerald-600/50 text-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20"
                onClick={() => setInitialReviewOpen(true)}
                title="Lihat Hasil Telaah Resep (Awal)"
              >
                <ClipboardCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Telaah Awal</span>
              </Button>
            )}

            {/* Tombol Verifikasi Akhir: jika resep sudah dispensed dan ada verifikasi tersimpan */}
            {status === 'dispensed' && Boolean(order.prescription_review_final) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 rounded-none shadow-none text-xs gap-1.5 border-emerald-600/50 text-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20"
                onClick={() => setFinalReviewOpen(true)}
                title="Lihat Hasil Verifikasi Akhir & PIO"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Verifikasi Akhir</span>
              </Button>
            )}

            {/* Tombol Kembalikan ke Antrean (if preparing or ready) */}
            {(status === 'preparing' || status === 'ready') && canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 rounded-none shadow-none text-xs gap-1.5 text-amber-700 hover:text-amber-800 border-amber-600/40"
                onClick={() => setConfirmReturnOpen(true)}
                disabled={returning}
                title="Kembalikan Resep ke Antrean Order"
              >
                {returning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                <span>Kembalikan</span>
              </Button>
            )}

            {/* Tombol Terima Resep / Telaah Awal (if ordered) */}
            {status === 'ordered' && canManage && (
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 rounded-none shadow-none text-xs gap-1.5 bg-primary text-primary-foreground font-medium"
                onClick={() => setInitialReviewOpen(true)}
                disabled={receiving}
                title="Telaah Resep & Terima Order"
              >
                {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>Terima Resep</span>
              </Button>
            )}

            {/* Tombol Validasi Pengurangan Stok Racikan (jika ada racikan & status preparing/ready) */}
            {compounds.length > 0 && (status === 'preparing' || status === 'ready') && canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 rounded-none shadow-none text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/5 font-medium"
                onClick={() => setCompoundDeductionModalOpen(true)}
                title="Validasi & Sesuaikan Pemotongan Stok Bahan Racikan"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                <span>Validasi Stok Racikan</span>
              </Button>
            )}

            {/* Tombol Siap Serahkan (if preparing) */}
            {status === 'preparing' && canManage && (
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 rounded-none shadow-none text-xs gap-1.5 bg-primary text-primary-foreground font-medium"
                onClick={() => void handleMarkReady()}
                disabled={markingReady}
                title="Tandai Obat Siap Diserahkan"
              >
                {markingReady ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                <span>Siap Serahkan</span>
              </Button>
            )}

            {/* Tombol Serahkan Obat (if ready) */}
            {status === 'ready' && canManage && (
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 rounded-none shadow-none text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                onClick={() => {
                  if (compounds.length > 0) {
                    setCompoundDeductionModalOpen(true);
                  } else {
                    setFinalReviewOpen(true);
                  }
                }}
                disabled={dispensing}
                title="Verifikasi Akhir & Serahkan Obat"
              >
                {dispensing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
                <span>Serahkan Obat</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Patient & Visit Detail Dialog */}
      <Dialog open={patientModalOpen} onOpenChange={setPatientModalOpen}>
        <DialogContent className="max-w-xl rounded-none border-border/70 p-6">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center border border-border bg-muted/20 shrink-0">
                <UserRound className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Informasi Pasien & Kunjungan
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Ringkasan data identitas pasien dan konteks kunjungan resep farmasi.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="border border-border bg-card p-3 space-y-2">
              <h4 className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground">
                Data Identitas Pasien
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Nama Pasien:</span>
                  <p className="font-medium text-foreground">{order.patient?.full_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">No. Rekam Medis:</span>
                  <p className="font-mono font-medium text-foreground">{order.patient?.medical_record_number || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Jenis Kelamin:</span>
                  <p className="text-foreground">{order.patient?.gender === 'L' ? 'Laki-laki' : order.patient?.gender === 'P' ? 'Perempuan' : '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">NIK / Identitas:</span>
                  <p className="font-mono text-foreground">{order.patient?.nik || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">No. Telepon:</span>
                  <p className="text-foreground">{order.patient?.phone || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Alamat:</span>
                  <p className="text-foreground truncate">{order.patient?.address || '-'}</p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-3 space-y-2">
              <h4 className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground">
                Konteks Kunjungan & Resep
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">No. Kunjungan:</span>
                  <p className="font-mono font-medium text-foreground">{order.visit?.visit_number || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Poliklinik:</span>
                  <p className="font-medium text-foreground">{order.polyclinic?.name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Dokter Penulis:</span>
                  <p className="font-medium text-foreground">{order.doctor?.full_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tanggal Order:</span>
                  <p className="text-foreground">{formatDateTime(order.prescription_ordered_at || order.record_date)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Penjamin / Pembayaran:</span>
                  <p className="uppercase text-foreground">{order.visit?.payment_type || 'UMUM'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Tagihan Obat:</span>
                  <p className="font-mono font-bold text-primary">{formatCurrency(totalPrice)}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none text-xs"
              onClick={() => setPatientModalOpen(false)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Tambah Obat */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Tambah Obat ke Resep</DialogTitle>
            <DialogDescription className="text-xs">
              Pilih obat dari master farmasi dan lengkapi signa aturan pakai untuk resep ini.
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
                  placeholder="Contoh: 10 mg / 1 tablet"
                  value={addPayload.dosage}
                  onChange={(e) => setAddPayload((p) => ({ ...p, dosage: e.target.value }))}
                  className="h-9 rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
            </div>

            <div>
              <label className="font-medium text-foreground">Signa (Aturan Pakai)</label>
              <div className="mt-1">
                <SearchableSelect
                  options={PRESCRIPTION_SIGNA_OPTIONS}
                  value={addPayload.instructions}
                  onValueChange={(val) => setAddPayload((p) => ({ ...p, instructions: val }))}
                  placeholder="Pilih atau ketik signa (contoh: 3 × 1 Setelah Makan)"
                  searchPlaceholder="Cari atau ketik signa..."
                  allowCustom
                  className="h-9 w-full rounded-none text-xs focus:ring-inset"
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

      {/* Dialog: Edit Obat */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Edit Obat Resep</DialogTitle>
            <DialogDescription className="text-xs">
              Sesuaikan obat, jumlah, dosis, atau signa aturan pakai untuk proses farmasi ini.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="font-medium text-foreground">Obat</label>
              <div className="mt-1">
                <SearchableSelect
                  options={medicineSelectOptions}
                  value={editPayload.medicine_id ? String(editPayload.medicine_id) : ''}
                  onValueChange={(val) => setEditPayload((p) => ({ ...p, medicine_id: Number(val) }))}
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
                  value={editPayload.quantity}
                  onChange={(e) => setEditPayload((p) => ({ ...p, quantity: Math.max(1, Number(e.target.value)) }))}
                  className="h-9 rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
              <div>
                <label className="font-medium text-foreground">Dosis</label>
                <Input
                  placeholder="Contoh: 10 mg / 1 tablet"
                  value={editPayload.dosage}
                  onChange={(e) => setEditPayload((p) => ({ ...p, dosage: e.target.value }))}
                  className="h-9 rounded-none text-xs focus:ring-inset mt-1"
                />
              </div>
            </div>

            <div>
              <label className="font-medium text-foreground">Signa (Aturan Pakai)</label>
              <div className="mt-1">
                <SearchableSelect
                  options={PRESCRIPTION_SIGNA_OPTIONS}
                  value={editPayload.instructions}
                  onValueChange={(val) => setEditPayload((p) => ({ ...p, instructions: val }))}
                  placeholder="Pilih atau ketik signa (contoh: 3 × 1 Setelah Makan)"
                  searchPlaceholder="Cari atau ketik signa..."
                  allowCustom
                  className="h-9 w-full rounded-none text-xs focus:ring-inset"
                />
              </div>
            </div>

            <div>
              <label className="font-medium text-foreground">Catatan Tambahan (Opsional)</label>
              <Textarea
                placeholder="Catatan khusus apoteker..."
                value={editPayload.notes}
                onChange={(e) => setEditPayload((p) => ({ ...p, notes: e.target.value }))}
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
              onClick={() => setEditDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-none text-xs"
              onClick={() => void handleUpdateMedicine()}
              disabled={updatingMedicine}
            >
              {updatingMedicine ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Pencil className="mr-1 h-3.5 w-3.5" />}
              Simpan Perubahan
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

      {/* Modal 1: Telaah Resep (Awal) */}
      <InitialReviewModal
        open={initialReviewOpen}
        onOpenChange={setInitialReviewOpen}
        savedDataString={order?.prescription_review_initial}
        patientName={order?.patient?.full_name}
        medicalRecordNumber={order?.patient?.medical_record_number}
        doctorName={order?.doctor?.full_name}
        isOrderStep={status === 'ordered'}
        onConfirm={handleConfirmInitialReview}
        loading={receiving}
      />

      {/* Modal 2: Verifikasi Akhir & PIO (Telaah Akhir) */}
      <FinalReviewModal
        open={finalReviewOpen}
        onOpenChange={setFinalReviewOpen}
        savedDataString={order?.prescription_review_final}
        patientName={order?.patient?.full_name}
        medicalRecordNumber={order?.patient?.medical_record_number}
        doctorName={order?.doctor?.full_name}
        isDispenseStep={status === 'ready'}
        onConfirm={handleConfirmFinalReview}
        loading={dispensing}
      />

      {/* Modal 3: Validasi Pengurangan Stok Obat/Bahan Racikan (Farmasi) */}
      {compounds.length > 0 && (
        <CompoundDeductionModal
          open={compoundDeductionModalOpen}
          onOpenChange={setCompoundDeductionModalOpen}
          compounds={compounds}
          patientName={order?.patient?.full_name}
          isDispenseStep={status === 'ready'}
          onConfirm={handleConfirmCompoundDeductions}
          onSaveOnly={handleSaveCompoundDeductionsOnly}
          loading={dispensing}
        />
      )}
    </div>
  );
}
