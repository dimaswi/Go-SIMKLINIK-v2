import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit, Eye, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { employeesApi, satusehatApi, type Employee } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataAsideSection, MasterDataAsideStack, MasterDataDetailItem, MasterDataPageShell, MasterDataSection, formatMasterDataDateTime } from '@/pages/master-data/shared';
import { getEmployeeProfessionLabel } from './options';

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

function buildPractitionerChecklist(employee: Employee) {
  return [
    {
      label: 'Nama lengkap',
      ready: Boolean(employee.full_name?.trim()),
      hint: 'Nama pegawai dipakai untuk membantu verifikasi kandidat Practitioner yang ditemukan.',
    },
    {
      label: 'NIK pegawai',
      ready: looksLikeNIK(employee.nik_number),
      hint: 'Wajib 16 digit karena lookup Practitioner SATUSEHAT dilakukan menggunakan NIK.',
    },
    {
      label: 'Profesi',
      ready: Boolean(employee.profession?.trim()),
      hint: 'Profesi membantu pembacaan konteks actor SATUSEHAT di modul operasional.',
    },
    {
      label: 'Telepon',
      ready: Boolean(employee.phone?.trim()),
      hint: 'Opsional untuk master lokal dan tidak menjadi syarat lookup Practitioner.',
    },
  ];
}

export default function EmployeeShow() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const [data, setData] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewingSatusehat, setPreviewingSatusehat] = useState(false);
  const [syncingSatusehat, setSyncingSatusehat] = useState(false);
  const [practitionerPreview, setPractitionerPreview] = useState<Record<string, unknown> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await employeesApi.getById(Number(id));
      setData(response.data.data);
    } catch {
      toast({ variant: 'destructive', title: 'Error!', description: 'Gagal memuat data pegawai.' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setPageTitle('Detail Pegawai');
    void loadData();
  }, [loadData]);

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteDialogOpen(false);
    try {
      await employeesApi.delete(Number(id));
      toast({ variant: 'success', title: 'Berhasil!', description: 'Pegawai berhasil dihapus.' });
      setTimeout(() => navigate('/employees'), 400);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal menghapus pegawai.' });
      setDeleting(false);
    }
  };

  const handlePreviewSatusehat = async () => {
    if (!id) return;

    setPreviewingSatusehat(true);
    try {
      const response = await satusehatApi.previewResource('employee-practitioner', Number(id));
      setPractitionerPreview(asRecord(response.data.data));
      toast({
        variant: 'success',
        title: 'Preview Practitioner siap',
        description: 'Ringkasan lookup SATUSEHAT pegawai sudah diperbarui di halaman ini.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal memuat preview Practitioner',
        description: error.response?.data?.error || 'Preview SATUSEHAT pegawai belum bisa disiapkan.',
      });
    } finally {
      setPreviewingSatusehat(false);
    }
  };

  const handleSyncSatusehat = async () => {
    if (!id || !data) return;

    setSyncingSatusehat(true);
    try {
      const response = await satusehatApi.syncResource('employee-practitioner', Number(id));
      toast({
        variant: 'success',
        title: 'Practitioner berhasil disinkronkan',
        description: response.data?.message || `Pegawai ${data.full_name} sudah disinkronkan ke SATUSEHAT.`,
      });
      await loadData();
      const previewResponse = await satusehatApi.previewResource('employee-practitioner', Number(id));
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

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center"><div className="text-center"><p className="text-lg font-semibold">Pegawai tidak ditemukan</p><Button onClick={() => navigate('/employees')} className="mt-5">Kembali</Button></div></div>;
  }

  const canPreviewSatusehat = hasPermission('employees.view') || hasPermission('settings.view');
  const canSyncSatusehat = hasPermission('employees.update') || hasPermission('settings.update');
  const satusehatRequired = Boolean(data.requires_satusehat);
  const satusehatDisabledReason = satusehatRequired
    ? ''
    : 'Master pegawai menandai profil ini tidak perlu SATUSEHAT, jadi preview dan sync practitioner dinonaktifkan.';
  const satusehatChecklist = buildPractitionerChecklist(data);
  const satusehatReadyCount = satusehatChecklist.filter((item) => item.ready).length;
  const previewWarnings = asArray(practitionerPreview?.warnings).map((item) => asString(item).trim()).filter(Boolean);
  const previewResource = asRecord(practitionerPreview?.resource);
  const previewReady = typeof practitionerPreview?.ready === 'boolean' ? practitionerPreview.ready : null;

  return (
    <>
      <ConfirmDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={confirmDelete} title="Hapus Pegawai" description="Apakah Anda yakin ingin menghapus pegawai ini?" confirmText="Hapus" cancelText="Batal" variant="destructive" />

      <MasterDataPageShell
        title={data.full_name}
        subtitle={getEmployeeProfessionLabel(data.profession)}
        onBack={() => navigate('/employees')}
        badges={
          <>
            <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">ID #{data.id}</Badge>
            <Badge className={data.is_active ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>{data.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
            <Badge variant={data.user ? 'default' : 'secondary'} className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none">{data.user ? 'Akun Tertaut' : 'Tanpa Akun'}</Badge>
            <Badge className={satusehatRequired ? (data.satusehat_practitioner_id ? 'h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none' : 'h-5 rounded-none border-0 bg-amber-500 px-2 text-[10px] uppercase tracking-wide text-white shadow-none') : 'h-5 rounded-none border-0 bg-slate-500 px-2 text-[10px] uppercase tracking-wide text-white shadow-none'}>
              {satusehatRequired ? (data.satusehat_practitioner_id ? 'Practitioner Sync' : `${satusehatReadyCount}/${satusehatChecklist.length} SATUSEHAT`) : 'SATUSEHAT Opsional'}
            </Badge>
          </>
        }
        meta={
          <>
            <span>Kode {data.employee_code || '-'}</span>
            <span>NIK {data.nik_number || '-'}</span>
            <span>NIP {data.nip_number || '-'}</span>
            <span>Telepon {data.phone || '-'}</span>
          </>
        }
        actions={
          <>
            {canPreviewSatusehat ? <Button variant="outline" className="rounded-none shadow-none" onClick={() => void handlePreviewSatusehat()} disabled={!satusehatRequired || previewingSatusehat || syncingSatusehat}>{previewingSatusehat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Preview SATUSEHAT</Button> : null}
            {canSyncSatusehat ? <Button variant="outline" className="rounded-none shadow-none" onClick={() => void handleSyncSatusehat()} disabled={!satusehatRequired || syncingSatusehat || previewingSatusehat}>{syncingSatusehat ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{data.satusehat_practitioner_id ? 'Sync Ulang SATUSEHAT' : 'Sync ke SATUSEHAT'}</Button> : null}
            {hasPermission('employees.update') ? <Button className="rounded-none shadow-none" onClick={() => navigate(`/employees/${id}/edit`)}><Edit className="h-4 w-4" />Edit</Button> : null}
            {hasPermission('employees.delete') ? <Button variant="destructive" className="rounded-none shadow-none" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Hapus</Button> : null}
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Akun" helper="Tautan akun operasional untuk login dan approval.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Email: <span className="font-medium text-foreground">{data.user?.email || '-'}</span></p>
                  <p>Username: <span className="font-medium text-foreground">{data.user?.username || '-'}</span></p>
                  <p>Role: <span className="font-medium text-foreground">{data.user?.role?.name || '-'}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Integrasi" helper="Penanda apakah pegawai ini perlu disiapkan untuk kebutuhan SATUSEHAT.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Kebutuhan SATUSEHAT: <span className="font-medium text-foreground">{satusehatRequired ? 'Perlu integrasi' : 'Tidak perlu integrasi'}</span></p>
                  <p>Practitioner ID: <span className="font-medium break-all text-foreground">{data.satusehat_practitioner_id || '-'}</span></p>
                  <p>Sync terakhir: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.satusehat_synced_at)}</span></p>
                  <p>Status preview: <span className="font-medium text-foreground">{previewReady === null ? 'Belum dimuat' : previewReady ? 'Siap dikirim' : 'Perlu perhatian'}</span></p>
                  {satusehatDisabledReason ? <p className="text-amber-700">{satusehatDisabledReason}</p> : null}
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Metadata" helper="Riwayat pembuatan dan perubahan data.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Dibuat: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.created_at)}</span></p>
                  <p>Terakhir diubah: <span className="font-medium text-foreground">{formatMasterDataDateTime(data.updated_at)}</span></p>
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <div className="divide-y divide-border/70">
          <MasterDataSection title="Identitas Pegawai" helper="Master pegawai pusat untuk seluruh profesi operasional klinik.">
            <div className="grid gap-4 md:grid-cols-2">
              <MasterDataDetailItem label="Nama Lengkap" value={data.full_name} />
              <MasterDataDetailItem label="Profesi" value={getEmployeeProfessionLabel(data.profession)} />
              <MasterDataDetailItem label="Kode Pegawai" value={data.employee_code || '-'} />
              <MasterDataDetailItem label="NIK" value={data.nik_number || '-'} />
              <MasterDataDetailItem label="NIP" value={data.nip_number || '-'} />
              <MasterDataDetailItem label="Nomor Izin/STR/SIP" value={data.license_number || '-'} />
              <MasterDataDetailItem label="Telepon" value={data.phone || '-'} />
              <MasterDataDetailItem label="Perlu SATUSEHAT" value={data.requires_satusehat ? 'Ya' : 'Tidak'} />
              <MasterDataDetailItem label="Practitioner ID SATUSEHAT" value={data.satusehat_practitioner_id || '-'} />
              <MasterDataDetailItem label="Sync SATUSEHAT Terakhir" value={formatMasterDataDateTime(data.satusehat_synced_at)} />
              <MasterDataDetailItem label="Status" value={data.is_active ? 'Aktif' : 'Nonaktif'} />
            </div>
          </MasterDataSection>

          <MasterDataSection title="Kesiapan SATUSEHAT Practitioner" helper="Pegawai yang menjadi performer atau requester SATUSEHAT akan dicari IHS number-nya lewat Master Nakes Index berdasarkan NIK pegawai.">
            <div className="space-y-4">
              {satusehatDisabledReason ? (
                <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {satusehatDisabledReason}
                </div>
              ) : null}

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
                      <p className="text-[11px] leading-5 text-muted-foreground">Muat preview untuk melihat kesiapan pencarian IHS number pegawai ke SATUSEHAT tanpa membuka JSON mentah.</p>
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
                      <MasterDataDetailItem label="Profesi lokal" value={asString(previewResource.profession) || getEmployeeProfessionLabel(data.profession) || '-'} />
                      <MasterDataDetailItem label="Kode pegawai" value={asString(previewResource.employeeCode) || data.employee_code || '-'} />
                      <MasterDataDetailItem label="Telepon lokal" value={asString(previewResource.phone) || data.phone || '-'} />
                      <MasterDataDetailItem label="Query pencarian" value={<span className="break-all">{asString(previewResource.searchQuery) || '-'}</span>} />
                      <MasterDataDetailItem label="Organization ID aktif" value={asString(previewResource.organizationID) || '-'} />
                    </div>
                  ) : (
                    <div className="mt-4 border border-dashed border-border/70 bg-background px-4 py-6 text-sm text-muted-foreground">
                      Preview belum dimuat. Gunakan tombol Preview SATUSEHAT untuk melihat kesiapan lookup Practitioner dari data pegawai.
                    </div>
                  )}
                </div>

                <div className="border border-border/70 bg-muted/[0.03] p-4">
                  <h3 className="text-sm font-semibold tracking-tight">Warning Backend</h3>
                  <p className="text-[11px] leading-5 text-muted-foreground">Backend akan menampilkan warning di sini bila data pegawai masih kurang optimal untuk SATUSEHAT.</p>
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
        </div>
      </MasterDataPageShell>
    </>
  );
}