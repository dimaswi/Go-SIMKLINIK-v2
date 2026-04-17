import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createDoctorColumns } from './columns';
import { doctorsApi, satusehatApi, type Doctor, type DoctorListSummary } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { setPageTitle } from '@/lib/page-title';
import { Loader2, Plus } from 'lucide-react';
import { MasterDataDetailItem, MasterDataListShell, formatMasterDataDateTime } from '@/pages/master-data/shared';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export default function DoctorsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<Doctor[]>([]);
  const [summary, setSummary] = useState<DoctorListSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [satusehatFilter, setSatusehatFilter] = useState<'all' | 'required' | 'not-required' | 'unlinked'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewDoctor, setPreviewDoctor] = useState<Doctor | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);
  const [previewingDoctorId, setPreviewingDoctorId] = useState<number | null>(null);
  const [syncingDoctorId, setSyncingDoctorId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (satusehatFilter === 'required') {
        params.set('requires_satusehat', 'true');
      }
      if (satusehatFilter === 'not-required') {
        params.set('requires_satusehat', 'false');
      }
      if (satusehatFilter === 'unlinked') {
        params.set('employee_linked', 'false');
      }
      if (activeFilter === 'active') {
        params.set('is_active', 'true');
      }
      if (activeFilter === 'inactive') {
        params.set('is_active', 'false');
      }

      const [summaryResponse, listResponse] = await Promise.all([
        doctorsApi.getSummary(),
        doctorsApi.getAll(params.toString()),
      ]);

      setSummary(summaryResponse.data.data);
      setData(listResponse.data.data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal memuat data." });
    } finally {
      setLoading(false);
    }
  }, [activeFilter, satusehatFilter, toast]);

  useEffect(() => {
    setPageTitle('Dokter');
    loadData();
  }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await doctorsApi.delete(itemToDelete);
      toast({ variant: "success", title: "Berhasil!", description: "Dokter berhasil dihapus." });
      loadData();
    } catch (error) {
      toast({ variant: "destructive", title: "Error!", description: error instanceof Error ? error.message : "Gagal menghapus." });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const handlePreviewSatusehat = useCallback(async (doctor: Doctor) => {
    setPreviewingDoctorId(doctor.id);
    try {
      const response = await satusehatApi.previewResource('practitioner', doctor.id);
      setPreviewDoctor(doctor);
      setPreviewData(asRecord(response.data.data));
      setPreviewDialogOpen(true);
    } catch (error: any) {
      const fallbackPreview = asRecord(error.response?.data?.data?.preview) || asRecord(error.response?.data?.data);
      if (fallbackPreview) {
        setPreviewDoctor(doctor);
        setPreviewData(fallbackPreview);
        setPreviewDialogOpen(true);
      }
      toast({
        variant: 'destructive',
        title: 'Gagal memuat preview Practitioner',
        description: error.response?.data?.error || 'Preview SATUSEHAT dokter belum bisa disiapkan.',
      });
    } finally {
      setPreviewingDoctorId(null);
    }
  }, [toast]);

  const handleSyncSatusehat = useCallback(async (doctor: Doctor) => {
    setSyncingDoctorId(doctor.id);
    try {
      const response = await satusehatApi.syncResource('practitioner', doctor.id);
      const syncedDoctor = asRecord(response.data?.data?.doctor);
      toast({
        variant: 'success',
        title: 'Practitioner berhasil disinkronkan',
        description: response.data?.message || `Dokter ${doctor.full_name} berhasil disinkronkan ke SATUSEHAT.`,
      });

      await loadData();

      const previewResponse = await satusehatApi.previewResource('practitioner', doctor.id);
      const refreshedDoctor = syncedDoctor ? ({ ...doctor, ...syncedDoctor } as Doctor) : doctor;
      setPreviewDoctor(refreshedDoctor);
      setPreviewData(asRecord(previewResponse.data.data));
      setPreviewDialogOpen(true);
    } catch (error: any) {
      const fallbackPreview = asRecord(error.response?.data?.data?.preview) || asRecord(error.response?.data?.data);
      if (fallbackPreview) {
        setPreviewDoctor(doctor);
        setPreviewData(fallbackPreview);
        setPreviewDialogOpen(true);
      }
      const warnings = asArray(fallbackPreview?.warnings).map((item) => asString(item).trim()).filter(Boolean);
      toast({
        variant: 'destructive',
        title: 'Gagal sync Practitioner',
        description: warnings[0] || error.response?.data?.error || 'Sinkronisasi Practitioner SATUSEHAT gagal dijalankan.',
      });
    } finally {
      setSyncingDoctorId(null);
    }
  }, [loadData, toast]);

  const columns = createDoctorColumns({
    onView: (id) => navigate(`/doctors/${id}`),
    onEdit: (id) => navigate(`/doctors/${id}/edit`),
    onDelete: (id) => { setItemToDelete(id); setDeleteDialogOpen(true); },
    onPreviewSatusehat: (doctor) => void handlePreviewSatusehat(doctor),
    onSyncSatusehat: (doctor) => void handleSyncSatusehat(doctor),
    hasViewPermission: hasPermission('doctors.view'),
    hasEditPermission: hasPermission('doctors.update'),
    hasDeletePermission: hasPermission('doctors.delete'),
    hasPreviewSatusehatPermission: hasPermission('doctors.view') || hasPermission('settings.view'),
    hasSyncSatusehatPermission: hasPermission('doctors.update') || hasPermission('settings.update'),
    previewingDoctorId,
    syncingDoctorId,
  });

  const satusehatRequiredCount = summary?.satusehat_required_count ?? 0
  const satusehatOptionalCount = summary?.satusehat_optional_count ?? 0
  const unlinkedEmployeeCount = summary?.unlinked_employee_count ?? 0
  const activeCount = summary?.active_count ?? 0
  const inactiveCount = summary?.inactive_count ?? 0
  const previewWarnings = asArray(previewData?.warnings).map((item) => asString(item).trim()).filter(Boolean)
  const previewResource = asRecord(previewData?.resource)
  const previewReady = typeof previewData?.ready === 'boolean' ? previewData.ready : null

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <MasterDataListShell
        title="Daftar Dokter"
        subtitle="Kelola data identitas dokter, spesialisasi, dan informasi SIP untuk operasional klinik."
        totalCount={data.length}
        badges={
          <>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {satusehatRequiredCount} perlu SATUSEHAT
            </Badge>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {satusehatOptionalCount} tidak perlu
            </Badge>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {unlinkedEmployeeCount} belum tertaut pegawai
            </Badge>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {activeCount} aktif
            </Badge>
            <Badge variant="outline" className="rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {inactiveCount} nonaktif
            </Badge>
          </>
        }
      >
        <DataTable
          className="h-full"
          columns={columns}
          data={data}
          searchPlaceholder="Cari dokter berdasarkan nama, NIK, NIP, spesialisasi, atau SIP..."
          pageSize={10}
          toolbarActions={
            <>
              <Select value={satusehatFilter} onValueChange={(value: 'all' | 'required' | 'not-required' | 'unlinked') => setSatusehatFilter(value)}>
                <SelectTrigger className="w-[220px] rounded-none">
                  <SelectValue placeholder="Filter SATUSEHAT" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua dokter</SelectItem>
                  <SelectItem value="required">Perlu SATUSEHAT</SelectItem>
                  <SelectItem value="not-required">Tidak perlu SATUSEHAT</SelectItem>
                  <SelectItem value="unlinked">Belum tertaut pegawai</SelectItem>
                </SelectContent>
              </Select>
              <Select value={activeFilter} onValueChange={(value: 'all' | 'active' | 'inactive') => setActiveFilter(value)}>
                <SelectTrigger className="w-[180px] rounded-none">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
              {hasPermission('doctors.create') ? (
                <Button onClick={() => navigate('/doctors/create')} className="rounded-none shadow-none"><Plus className="h-4 w-4" />Tambah Dokter</Button>
              ) : null}
            </>
          }
        />
      </MasterDataListShell>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Dokter" description="Apakah Anda yakin ingin menghapus dokter ini? Tindakan ini tidak dapat dibatalkan." confirmText="Hapus" cancelText="Batal" variant="destructive" />

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
    <DialogContent className="max-w-4xl rounded-none border border-border/70 p-0">
      <DialogHeader className="border-b border-border/70 px-6 py-4">
        <DialogTitle className="text-base font-semibold tracking-tight">Preview Practitioner SATUSEHAT Dokter</DialogTitle>
        <DialogDescription className="text-xs leading-5">
          {previewDoctor ? `${previewDoctor.full_name} · ${previewDoctor.specialization || 'Dokter umum'}` : 'Ringkasan lookup SATUSEHAT dari daftar dokter.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 p-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4 border border-border/70 bg-muted/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Ringkasan Lookup</h3>
              <p className="text-[11px] leading-5 text-muted-foreground">Preview ini memakai endpoint practitioner dokter yang sama dengan halaman detail.</p>
            </div>
            <Badge variant={previewReady ? 'default' : 'outline'} className="rounded-none">
              {previewReady === null ? 'Belum dimuat' : previewReady ? 'Ready' : 'Perlu perhatian'}
            </Badge>
          </div>

          {previewResource ? (
            <div className="grid gap-4 md:grid-cols-2">
              <MasterDataDetailItem label="Mode Lookup" value={asString(previewResource.lookupStrategy) || 'nik'} />
              <MasterDataDetailItem label="Status Aktif" value={previewResource.active ? 'Ya' : 'Tidak'} />
              <MasterDataDetailItem label="Nama Lokal" value={asString(previewResource.fullName) || previewDoctor?.full_name || '-'} />
              <MasterDataDetailItem label="NIK Pencarian" value={asString(previewResource.identifierValue) || previewDoctor?.nik_number || '-'} />
              <MasterDataDetailItem label="Identifier System" value={asString(previewResource.identifierSystem) || '-'} />
              <MasterDataDetailItem label="Practitioner ID Tersimpan" value={asString(previewResource.storedPractitionerID) || previewDoctor?.satusehat_practitioner_id || '-'} />
              <MasterDataDetailItem label="Spesialisasi" value={asString(previewResource.specialization) || previewDoctor?.specialization || '-'} />
              <MasterDataDetailItem label="Pegawai Tertaut" value={previewDoctor?.employee?.employee_code || previewDoctor?.employee?.full_name || '-'} />
              <MasterDataDetailItem label="Telepon" value={asString(previewResource.phone) || previewDoctor?.phone || '-'} />
              <MasterDataDetailItem label="Sync Terakhir" value={formatMasterDataDateTime(previewDoctor?.satusehat_synced_at)} />
              <MasterDataDetailItem label="Query Pencarian" value={<span className="break-all">{asString(previewResource.searchQuery) || '-'}</span>} />
              <MasterDataDetailItem label="Organization ID Aktif" value={asString(previewResource.organizationID) || '-'} />
            </div>
          ) : (
            <div className="border border-dashed border-border/70 bg-background px-4 py-6 text-sm text-muted-foreground">
              Preview belum tersedia untuk dokter ini.
            </div>
          )}
        </div>

        <div className="space-y-4 border border-border/70 bg-muted/[0.03] p-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Warning Backend</h3>
            <p className="text-[11px] leading-5 text-muted-foreground">Gunakan warning ini untuk memperbaiki data dokter sebelum sync ulang.</p>
          </div>

          {previewWarnings.length > 0 ? (
            <div className="space-y-2">
              {previewWarnings.map((warning) => (
                <div key={warning} className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                  {warning}
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-border/70 bg-background px-4 py-6 text-sm text-muted-foreground">
              {previewReady === null ? 'Warning akan muncul setelah preview dimuat.' : 'Tidak ada warning dari backend.'}
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
        {previewDoctor && (hasPermission('doctors.update') || hasPermission('settings.update')) ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-none shadow-none"
            onClick={() => void handleSyncSatusehat(previewDoctor)}
            disabled={(previewDoctor.employee ? !previewDoctor.employee.requires_satusehat : false) || syncingDoctorId === previewDoctor.id || previewingDoctorId === previewDoctor.id}
          >
            {syncingDoctorId === previewDoctor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {previewDoctor.satusehat_practitioner_id ? 'Sync Ulang SATUSEHAT' : 'Sync ke SATUSEHAT'}
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => setPreviewDialogOpen(false)}>
          Tutup
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
    </div>
  );
}
