import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, RefreshCw, Users } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { type Employee, employeesApi, satusehatApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { MasterDataDetailItem, formatMasterDataDateTime } from '@/pages/master-data/shared';
import { createEmployeeColumns } from './columns';

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

export default function EmployeesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [data, setData] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [satusehatFilter, setSatusehatFilter] = useState<'all' | 'required' | 'not-required'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewEmployee, setPreviewEmployee] = useState<Employee | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);
  const [previewingEmployeeId, setPreviewingEmployeeId] = useState<number | null>(null);
  const [syncingEmployeeId, setSyncingEmployeeId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (satusehatFilter === 'required') {
        params.set('requires_satusehat', 'true');
      }
      if (satusehatFilter === 'not-required') {
        params.set('requires_satusehat', 'false');
      }
      if (activeFilter === 'active') {
        params.set('is_active', 'true');
      }
      if (activeFilter === 'inactive') {
        params.set('is_active', 'false');
      }

      const listResponse = await employeesApi.getAll(params.toString());
      setData(listResponse.data.data);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error!', description: error instanceof Error ? error.message : 'Gagal memuat data pegawai.' });
    } finally {
      setLoading(false);
    }
  }, [activeFilter, satusehatFilter, toast]);

  useEffect(() => {
    setPageTitle('Pegawai');
    void loadData();
  }, [loadData]);

  const confirmDelete = async () => {
    if (!itemToDelete) {
      return;
    }

    try {
      await employeesApi.delete(itemToDelete);
      toast({ variant: 'success', title: 'Berhasil!', description: 'Pegawai berhasil dihapus.' });
      void loadData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error!', description: error.response?.data?.error || 'Gagal menghapus pegawai.' });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const handlePreviewSatusehat = useCallback(async (employee: Employee) => {
    setPreviewingEmployeeId(employee.id);
    try {
      const response = await satusehatApi.previewResource('employee-practitioner', employee.id);
      setPreviewEmployee(employee);
      setPreviewData(asRecord(response.data.data));
      setPreviewDialogOpen(true);
    } catch (error: any) {
      const fallbackPreview = asRecord(error.response?.data?.data?.preview) || asRecord(error.response?.data?.data);
      if (fallbackPreview) {
        setPreviewEmployee(employee);
        setPreviewData(fallbackPreview);
        setPreviewDialogOpen(true);
      }
      toast({
        variant: 'destructive',
        title: 'Gagal memuat preview Practitioner',
        description: error.response?.data?.error || 'Preview SATUSEHAT pegawai belum bisa disiapkan.',
      });
    } finally {
      setPreviewingEmployeeId(null);
    }
  }, [toast]);

  const handleSyncSatusehat = useCallback(async (employee: Employee) => {
    setSyncingEmployeeId(employee.id);
    try {
      const response = await satusehatApi.syncResource('employee-practitioner', employee.id);
      const syncedEmployee = asRecord(response.data?.data?.employee);
      toast({
        variant: 'success',
        title: 'Practitioner berhasil disinkronkan',
        description: response.data?.message || `Pegawai ${employee.full_name} berhasil disinkronkan ke SATUSEHAT.`,
      });

      await loadData();

      const previewResponse = await satusehatApi.previewResource('employee-practitioner', employee.id);
      const refreshedEmployee = syncedEmployee ? ({ ...employee, ...syncedEmployee } as Employee) : employee;
      setPreviewEmployee(refreshedEmployee);
      setPreviewData(asRecord(previewResponse.data.data));
      setPreviewDialogOpen(true);
    } catch (error: any) {
      const fallbackPreview = asRecord(error.response?.data?.data?.preview) || asRecord(error.response?.data?.data);
      if (fallbackPreview) {
        setPreviewEmployee(employee);
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
      setSyncingEmployeeId(null);
    }
  }, [loadData, toast]);

  const columns = createEmployeeColumns({
    onView: (id) => navigate(`/employees/${id}`),
    onEdit: (id) => navigate(`/employees/${id}/edit`),
    onDelete: (id) => {
      setItemToDelete(id);
      setDeleteDialogOpen(true);
    },
    onPreviewSatusehat: (employee) => void handlePreviewSatusehat(employee),
    onSyncSatusehat: (employee) => void handleSyncSatusehat(employee),
    hasViewPermission: hasPermission('employees.view'),
    hasEditPermission: hasPermission('employees.update'),
    hasDeletePermission: hasPermission('employees.delete'),
    hasPreviewSatusehatPermission: hasPermission('employees.view') || hasPermission('settings.view'),
    hasSyncSatusehatPermission: hasPermission('employees.update') || hasPermission('settings.update'),
    previewingEmployeeId,
    syncingEmployeeId,
  });

  const previewWarnings = asArray(previewData?.warnings).map((item) => asString(item).trim()).filter(Boolean);
  const previewResource = asRecord(previewData?.resource);
  const previewReady = typeof previewData?.ready === 'boolean' ? previewData.ready : null;

  const filteredEmployees = data.filter((emp) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      emp.full_name?.toLowerCase().includes(q) ||
      emp.employee_code?.toLowerCase().includes(q) ||
      emp.nik_number?.toLowerCase().includes(q) ||
      emp.nip_number?.toLowerCase().includes(q) ||
      emp.profession?.toLowerCase().includes(q)
    );
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Data Pegawai
              </h1>
              <p className="text-xs text-muted-foreground">
                Kelola master pegawai klinik, profesi, dan akun sistem ({filteredEmployees.length} pegawai)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / kode / NIK / profesi..."
              className="h-9 w-48 sm:w-56 rounded-none text-xs focus:ring-inset"
            />

            <SearchableSelect
              options={[
                { value: 'all', label: 'Semua SATUSEHAT' },
                { value: 'required', label: 'Perlu SATUSEHAT' },
                { value: 'not-required', label: 'Tidak Perlu SATUSEHAT' },
              ]}
              value={satusehatFilter}
              onValueChange={(val) => setSatusehatFilter(val as any)}
              placeholder="SATUSEHAT"
              className="h-9 w-40 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />

            <SearchableSelect
              options={[
                { value: 'all', label: 'Semua Status' },
                { value: 'active', label: 'Aktif' },
                { value: 'inactive', label: 'Nonaktif' },
              ]}
              value={activeFilter}
              onValueChange={(val) => setActiveFilter(val as any)}
              placeholder="Status"
              className="h-9 w-32 rounded-none text-xs focus:ring-inset shrink-0"
              square
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
            >
              <RefreshCw className={refreshing ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
              Segarkan
            </Button>

            {hasPermission('employees.create') ? (
              <Button
                className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
                onClick={() => navigate('/employees/create')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Tambah Pegawai
              </Button>
            ) : null}
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={columns}
            data={filteredEmployees}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage="Tidak ada data pegawai yang sesuai."
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Hapus Pegawai"
        description="Apakah Anda yakin ingin menghapus pegawai ini? Tindakan ini tidak dapat dibatalkan."
        confirmText="Hapus"
        cancelText="Batal"
        variant="destructive"
      />

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl rounded-none border border-border/70 p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-4">
            <DialogTitle className="text-base font-semibold tracking-tight">Preview Practitioner SATUSEHAT Pegawai</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              {previewEmployee ? `${previewEmployee.full_name} · ${previewEmployee.employee_code || 'Tanpa kode pegawai'}` : 'Ringkasan lookup SATUSEHAT dari daftar pegawai.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 p-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4 border border-border/70 bg-muted/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Ringkasan Lookup</h3>
                  <p className="text-[11px] leading-5 text-muted-foreground">Preview ini memakai endpoint pegawai yang sama dengan halaman detail.</p>
                </div>
                <Badge variant={previewReady ? 'default' : 'outline'} className="rounded-none">
                  {previewReady === null ? 'Belum dimuat' : previewReady ? 'Ready' : 'Perlu perhatian'}
                </Badge>
              </div>

              {previewResource ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <MasterDataDetailItem label="Mode Lookup" value={asString(previewResource.lookupStrategy) || 'nik'} />
                  <MasterDataDetailItem label="Status Aktif" value={previewResource.active ? 'Ya' : 'Tidak'} />
                  <MasterDataDetailItem label="Nama Lokal" value={asString(previewResource.fullName) || previewEmployee?.full_name || '-'} />
                  <MasterDataDetailItem label="Profesi" value={asString(previewResource.profession) || previewEmployee?.profession || '-'} />
                  <MasterDataDetailItem label="NIK Pencarian" value={asString(previewResource.identifierValue) || previewEmployee?.nik_number || '-'} />
                  <MasterDataDetailItem label="Identifier System" value={asString(previewResource.identifierSystem) || '-'} />
                  <MasterDataDetailItem label="Practitioner ID Tersimpan" value={asString(previewResource.storedPractitionerID) || previewEmployee?.satusehat_practitioner_id || '-'} />
                  <MasterDataDetailItem label="Kode Pegawai" value={asString(previewResource.employeeCode) || previewEmployee?.employee_code || '-'} />
                  <MasterDataDetailItem label="Telepon" value={asString(previewResource.phone) || previewEmployee?.phone || '-'} />
                  <MasterDataDetailItem label="Sync Terakhir" value={formatMasterDataDateTime(previewEmployee?.satusehat_synced_at)} />
                  <MasterDataDetailItem label="Query Pencarian" value={<span className="break-all">{asString(previewResource.searchQuery) || '-'}</span>} />
                  <MasterDataDetailItem label="Organization ID Aktif" value={asString(previewResource.organizationID) || '-'} />
                </div>
              ) : (
                <div className="border border-dashed border-border/70 bg-background px-4 py-6 text-sm text-muted-foreground">
                  Preview belum tersedia untuk pegawai ini.
                </div>
              )}
            </div>

            <div className="space-y-4 border border-border/70 bg-muted/[0.03] p-4">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Warning Backend</h3>
                <p className="text-[11px] leading-5 text-muted-foreground">Gunakan warning ini untuk memperbaiki data master sebelum sync ulang.</p>
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
            {previewEmployee && (hasPermission('employees.update') || hasPermission('settings.update')) ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-none shadow-none"
                onClick={() => void handleSyncSatusehat(previewEmployee)}
                disabled={!previewEmployee.requires_satusehat || syncingEmployeeId === previewEmployee.id || previewingEmployeeId === previewEmployee.id}
              >
                {syncingEmployeeId === previewEmployee.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {previewEmployee.satusehat_practitioner_id ? 'Sync Ulang SATUSEHAT' : 'Sync ke SATUSEHAT'}
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