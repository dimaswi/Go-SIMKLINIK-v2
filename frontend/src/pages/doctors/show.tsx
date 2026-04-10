import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { doctorsApi, satusehatApi, type Doctor } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { Edit, Eye, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  MasterDataAsideSection,
  MasterDataAsideStack,
  MasterDataDetailItem,
  MasterDataPageShell,
  MasterDataSection,
  formatMasterDataDateTime,
} from '@/pages/master-data/shared';

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

function normalizeNIK(value?: string) {
  return (value || '').replace(/\D/g, '');
}

function looksLikeNIK(value?: string) {
  return normalizeNIK(value).length === 16;
}

function buildPractitionerChecklist(doctor: Doctor) {
  return [
    {
      label: 'Nama lengkap',
      ready: Boolean(doctor.full_name?.trim()),
      hint: 'Nama dokter tetap dipakai untuk verifikasi kandidat Practitioner yang ditemukan.',
    },
    {
      label: 'NIK dokter',
      ready: looksLikeNIK(doctor.nik_number),
      hint: 'Wajib 16 digit karena SATUSEHAT Practitioner dicari lewat Master Nakes Index menggunakan NIK.',
    },
    {
      label: 'Spesialisasi',
      ready: Boolean(doctor.specialization?.trim()),
      hint: 'Opsional untuk data lokal, tetapi tetap berguna saat verifikasi kecocokan nakes.',
    },
    {
      label: 'Telepon',
      ready: Boolean(doctor.phone?.trim()),
      hint: 'Opsional untuk master lokal dan tidak lagi dipakai sebagai syarat sync Practitioner.',
    },
  ];
}

export default function DoctorShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewingSatusehat, setPreviewingSatusehat] = useState(false);
  const [syncingSatusehat, setSyncingSatusehat] = useState(false);
  const [practitionerPreview, setPractitionerPreview] = useState<Record<string, unknown> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await doctorsApi.getById(Number(id));
      setData(res.data.data);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data.' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setPageTitle('Detail Dokter');
    void loadData();
  }, [loadData]);

  const handlePreviewSatusehat = async () => {
    if (!id) return;

    setPreviewingSatusehat(true);
    try {
      const response = await satusehatApi.previewResource('practitioner', Number(id));
      setPractitionerPreview(asRecord(response.data.data));
      toast({
        variant: 'success',
        title: 'Preview Practitioner siap',
        description: 'Ringkasan payload SATUSEHAT dokter sudah diperbarui di halaman ini.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal memuat preview Practitioner',
        description: error.response?.data?.error || 'Preview SATUSEHAT dokter belum bisa disiapkan.',
      });
    } finally {
      setPreviewingSatusehat(false);
    }
  };

  const handleSyncSatusehat = async () => {
    if (!id || !data) return;

    setSyncingSatusehat(true);
    try {
      const response = await satusehatApi.syncResource('practitioner', Number(id));
      toast({
        variant: 'success',
        title: 'Practitioner berhasil disinkronkan',
        description: response.data?.message || `Dokter ${data.full_name} sudah dikirim ke SATUSEHAT.`,
      });
      await loadData();
      const previewResponse = await satusehatApi.previewResource('practitioner', Number(id));
      setPractitionerPreview(asRecord(previewResponse.data.data));
    } catch (error: any) {
      const previewData = asRecord(error.response?.data?.data?.preview) || asRecord(error.response?.data?.data);
      const warnings = previewData?.warnings;
      const warningText = Array.isArray(warnings) && warnings.length > 0 ? warnings[0] : null;
      toast({
        variant: 'destructive',
        title: 'Gagal sync Practitioner',
        description: warningText || error.response?.data?.error || 'Sinkronisasi Practitioner SATUSEHAT gagal dijalankan.',
      });
      if (previewData) {
        setPractitionerPreview(previewData);
      }
    } finally {
      setSyncingSatusehat(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await doctorsApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!', description: 'Dokter berhasil dihapus.' });
      setTimeout(() => navigate('/doctors'), 500);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal menghapus.' });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Dokter tidak ditemukan</p><Button onClick={() => navigate('/doctors')} className="mt-5">Kembali</Button></div></div>;
  }

  const canPreviewSatusehat = hasPermission('doctors.view') || hasPermission('settings.view');
  const canSyncSatusehat = hasPermission('doctors.update') || hasPermission('settings.update');
  const satusehatChecklist = buildPractitionerChecklist(data);
  const satusehatReadyCount = satusehatChecklist.filter((item) => item.ready).length;
  const previewWarnings = asArray(practitionerPreview?.warnings).map((item) => asString(item).trim()).filter(Boolean);
  const previewResource = asRecord(practitionerPreview?.resource);
  const previewReady = typeof practitionerPreview?.ready === 'boolean' ? practitionerPreview.ready : null;

  return (
    <>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Dokter" description="Apakah Anda yakin ingin menghapus dokter ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />

      <MasterDataPageShell
        title={data.full_name}
        subtitle={data.specialization || 'Dokter umum'}
        onBack={() => navigate('/doctors')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{data.id}</Badge>
            <Badge className={data.is_active ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {data.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
            <Badge className={data.satusehat_practitioner_id ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-amber-500 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {data.satusehat_practitioner_id ? 'Practitioner Sync' : `${satusehatReadyCount}/${satusehatChecklist.length} SATUSEHAT`}
            </Badge>
          </>
        }
        meta={
          <>
            <span>NIK {data.nik_number || '-'}</span>
            <span>NIP {data.nip_number || '-'}</span>
            <span>SIP {data.sip_number || '-'}</span>
            <span>Telepon {data.phone || '-'}</span>
            <span>Sync terakhir {formatMasterDataDateTime(data.satusehat_synced_at)}</span>
          </>
        }
        actions={
          <>
            {canPreviewSatusehat ? <Button variant="outline" className="rounded-none shadow-none" onClick={() => void handlePreviewSatusehat()} disabled={previewingSatusehat || syncingSatusehat}>{previewingSatusehat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Preview SATUSEHAT</Button> : null}
            {canSyncSatusehat ? <Button variant="outline" className="rounded-none shadow-none" onClick={() => void handleSyncSatusehat()} disabled={syncingSatusehat || previewingSatusehat}>{syncingSatusehat ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{data.satusehat_practitioner_id ? 'Sync Ulang SATUSEHAT' : 'Sync ke SATUSEHAT'}</Button> : null}
            {hasPermission('doctors.update') && <Button className="rounded-none shadow-none" onClick={() => navigate(`/doctors/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button>}
            {hasPermission('doctors.delete') && <Button variant="destructive" className="rounded-none shadow-none" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button>}
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="SATUSEHAT" helper="Status sinkronisasi Practitioner untuk dokter ini.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Practitioner ID: <span className="font-medium break-all text-foreground">{data.satusehat_practitioner_id || '-'}</span></p>
                  <p>Sync terakhir: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.satusehat_synced_at)}</span></p>
                  <p>Status preview: <span className="font-medium text-foreground">{previewReady === null ? 'Belum dimuat' : previewReady ? 'Siap dikirim' : 'Perlu perhatian'}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Metadata" helper="Status keaktifan dan riwayat perubahan data dokter.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Status: <span className="font-medium text-foreground">{data.is_active ? 'Aktif' : 'Tidak aktif'}</span></p>
                  <p>Dibuat: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.created_at)}</span></p>
                  <p>Terakhir diubah: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.updated_at)}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Identitas Dokter" helper="Data profesi dan kontak yang dipakai untuk penjadwalan dan pelayanan klinik.">
            <div className="grid gap-4 md:grid-cols-2">
              <MasterDataDetailItem label="Nama Lengkap" value={data.full_name} />
              <MasterDataDetailItem label="NIK" value={data.nik_number || '-'} />
              <MasterDataDetailItem label="NIP" value={data.nip_number || '-'} />
              <MasterDataDetailItem label="Nomor SIP" value={data.sip_number || '-'} />
              <MasterDataDetailItem label="Spesialisasi" value={data.specialization || '-'} />
              <MasterDataDetailItem label="Telepon" value={data.phone || '-'} />
            </div>
          </MasterDataSection>

          <MasterDataSection title="Kesiapan SATUSEHAT Practitioner" helper="SATUSEHAT Practitioner sekarang tidak dibuat dari SIMKLINIK. Sistem akan mencari IHS number tenaga kesehatan lewat Master Nakes Index berdasarkan NIK dokter.">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {satusehatChecklist.map((item) => (
                  <div key={item.label} className="border border-border/70 bg-muted/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground/95">{item.label}</p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.hint}</p>
                      </div>
                      <Badge variant={item.ready ? 'default' : 'outline'} className="rounded-none whitespace-nowrap">
                        {item.ready ? 'Siap' : 'Perlu isi'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="border border-border/70 bg-muted/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">Ringkasan Lookup Practitioner</h3>
                      <p className="text-[11px] leading-5 text-muted-foreground">Muat preview untuk melihat kesiapan pencarian IHS number dokter ke SATUSEHAT berdasarkan NIK.</p>
                    </div>
                    <Badge variant={previewReady ? 'default' : 'outline'} className="rounded-none">
                      {previewReady === null ? 'Belum dimuat' : previewReady ? 'Ready' : 'Perlu perhatian'}
                    </Badge>
                  </div>

                  {previewResource ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <MasterDataDetailItem label="Mode Lookup" value={asString(previewResource.lookupStrategy) || 'nik'} />
                      <MasterDataDetailItem label="Active" value={previewResource.active ? 'Ya' : 'Tidak'} />
                      <MasterDataDetailItem label="Nama lokal" value={asString(previewResource.fullName) || data.full_name || '-'} />
                      <MasterDataDetailItem label="NIK pencarian" value={asString(previewResource.identifierValue) || normalizeNIK(data.nik_number) || '-'} />
                      <MasterDataDetailItem label="Identifier system" value={asString(previewResource.identifierSystem) || '-'} />
                      <MasterDataDetailItem label="Practitioner ID tersimpan" value={asString(previewResource.storedPractitionerID) || data.satusehat_practitioner_id || '-'} />
                      <MasterDataDetailItem label="Spesialisasi lokal" value={asString(previewResource.specialization) || data.specialization || '-'} />
                      <MasterDataDetailItem label="Telepon lokal" value={asString(previewResource.phone) || data.phone || '-'} />
                      <MasterDataDetailItem label="Query pencarian" value={<span className="break-all">{asString(previewResource.searchQuery) || '-'}</span>} />
                      <MasterDataDetailItem label="Organization ID aktif" value={asString(previewResource.organizationID) || '-'} />
                    </div>
                  ) : (
                    <div className="mt-4 border border-dashed border-border/70 bg-background px-4 py-6 text-sm text-muted-foreground">
                      Preview belum dimuat. Gunakan tombol Preview SATUSEHAT untuk melihat kesiapan pencarian Practitioner tanpa JSON mentah.
                    </div>
                  )}
                </div>

                <div className="border border-border/70 bg-muted/[0.03] p-4">
                  <h3 className="text-sm font-semibold tracking-tight">Warning Backend</h3>
                  <p className="text-[11px] leading-5 text-muted-foreground">Backend akan menampilkan warning di sini bila data dokter masih kurang optimal untuk SATUSEHAT.</p>
                  {previewWarnings.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {previewWarnings.map((warning) => (
                        <div key={warning} className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                          {warning}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 border border-dashed border-border/70 bg-background px-4 py-6 text-sm text-muted-foreground">
                      {previewReady === null ? 'Warning akan muncul setelah preview dimuat.' : 'Tidak ada warning dari backend.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </MasterDataSection>

          <MasterDataSection title="Poliklinik Terkait" helper="Daftar poliklinik tempat dokter ini dapat dijadwalkan.">
            {(data.polyclinics || []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(data.polyclinics || []).map((polyclinic) => (
                  <Badge key={polyclinic.id} variant="outline" className="rounded-none px-2 py-1 text-[11px] shadow-none">
                    {polyclinic.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada poliklinik yang terhubung.</p>
            )}
          </MasterDataSection>
        </div>
      </MasterDataPageShell>
    </>
  );
}