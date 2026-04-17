import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Clock3,
  Database,
  HardDrive,
  Loader2,
  Play,
  RefreshCcw,
  Save,
  Server,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/usePermission';
import { downloadBlobResponse } from '@/lib/blob-download';
import {
  systemBackupsApi,
  type SystemBackupFile,
  type SystemBackupOverview,
} from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import {
  MasterDataAsideSection,
  MasterDataAsideStack,
  MasterDataLegacySections,
  MasterDataPageShell,
} from '@/pages/master-data/shared';

const FILES_PER_PAGE = 12;

type CronPreview = {
  isValid: boolean;
  description: string;
  nextRuns: string[];
  error?: string;
};

export default function OperationsGuidePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const canManageBackup = hasPermission('settings.update');

  const [overview, setOverview] = useState<SystemBackupOverview | null>(null);
  const [files, setFiles] = useState<SystemBackupFile[]>([]);
  const [filesPage, setFilesPage] = useState(1);
  const [filesTotal, setFilesTotal] = useState(0);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);

  const [autoEnabled, setAutoEnabled] = useState(true);
  const [cronExpression, setCronExpression] = useState('0 2 * * *');
  const [retentionDays, setRetentionDays] = useState('7');
  const [includeUploads, setIncludeUploads] = useState(true);

  const cronPreview = buildCronPreview(cronExpression);

  useEffect(() => {
    setPageTitle('Monitoring Backup');
    void Promise.all([loadOverview(), loadFiles(1)]);
  }, []);

  useEffect(() => {
    if (!overview) {
      return;
    }

    setAutoEnabled(overview.settings.auto_enabled);
    setCronExpression(overview.settings.cron_expression || '0 2 * * *');
    setRetentionDays(String(overview.settings.retention_days || 7));
    setIncludeUploads(overview.settings.include_uploads);
  }, [overview]);

  const loadOverview = async () => {
    setLoadingOverview(true);
    try {
      const response = await systemBackupsApi.getOverview();
      setOverview(response.data.data);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal memuat monitoring backup',
        description: getErrorMessage(error, 'Data storage dan backup belum bisa diambil dari server.'),
      });
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadFiles = async (page: number) => {
    setLoadingFiles(true);
    try {
      const response = await systemBackupsApi.getFiles(page, FILES_PER_PAGE);
      setFiles(response.data.data);
      setFilesTotal(response.data.total);
      setFilesPage(response.data.page);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal memuat file backup',
        description: getErrorMessage(error, 'Daftar file backup belum bisa diambil.'),
      });
    } finally {
      setLoadingFiles(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([loadOverview(), loadFiles(filesPage)]);
  };

  const handleRunBackup = async () => {
    setRunningBackup(true);
    try {
      const response = await systemBackupsApi.runNow();
      toast({
        variant: response.data.data.status === 'failed' ? 'destructive' : 'success',
        title: 'Backup sistem dijalankan',
        description: response.data.message,
      });
      await Promise.all([loadOverview(), loadFiles(1)]);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Backup gagal dijalankan',
        description: getErrorMessage(error, 'Manual backup belum berhasil diproses.'),
      });
    } finally {
      setRunningBackup(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const response = await systemBackupsApi.updateSettings({
        system_backup_auto_enabled: autoEnabled ? '1' : '0',
        system_backup_cron: cronExpression.trim(),
        system_backup_retention_days: retentionDays.trim() || '7',
        system_backup_include_uploads: includeUploads ? '1' : '0',
      });
      toast({
        variant: 'success',
        title: 'Pengaturan backup disimpan',
        description: response.data.message,
      });
      await loadOverview();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Pengaturan gagal disimpan',
        description: getErrorMessage(error, 'Cron atau retensi backup belum berhasil diperbarui.'),
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDownloadFile = async (file: SystemBackupFile) => {
    setDownloadingFileId(file.id);
    try {
      const response = await systemBackupsApi.downloadFile(file.id);
      downloadBlobResponse(response, file.file_name || `backup-${file.id}.bin`);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Download gagal',
        description: getErrorMessage(error, 'File backup belum berhasil diunduh.'),
      });
    } finally {
      setDownloadingFileId(null);
    }
  };

  const filePageCount = Math.max(1, Math.ceil(filesTotal / FILES_PER_PAGE));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Monitoring Backup Dan Storage"
        subtitle="Dashboard operasional untuk memantau kapasitas penyimpanan, mengatur auto backup, menjalankan backup manual, dan mengunduh file backup yang dibuat sistem."
        badges={
          <>
            <Badge className="rounded-none border-0 bg-stone-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">Backup Ops</Badge>
            <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">Storage Monitor</Badge>
            <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">Download Ready</Badge>
          </>
        }
        meta={<><span>Fokus: database dan uploads</span><span>Model: satu klinik satu VPS</span></>}
        onBack={() => navigate('/settings')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="rounded-none shadow-none" onClick={() => void refreshAll()} disabled={loadingOverview || loadingFiles}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Data
            </Button>
            <Button className="rounded-none shadow-none" onClick={() => void handleRunBackup()} disabled={!canManageBackup || runningBackup || overview?.settings.running}>
              {runningBackup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Jalankan Backup
            </Button>
          </div>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Status Runtime">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <AsideMetric label="Scheduler" value={overview?.settings.auto_enabled ? 'Aktif' : 'Nonaktif'} tone={overview?.settings.auto_enabled ? 'good' : 'neutral'} />
                  <AsideMetric label="Proses Backup" value={overview?.settings.running ? 'Sedang Berjalan' : 'Idle'} tone={overview?.settings.running ? 'warn' : 'good'} />
                  <AsideMetric label="Status Terakhir" value={formatStatusLabel(overview?.settings.last_status)} tone={statusTone(overview?.settings.last_status)} />
                  <AsideMetric label="Next Run" value={formatDateTime(overview?.settings.next_run_at)} tone="neutral" />
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Path Operasional">
                <div className="space-y-3 text-[11px] leading-5 text-muted-foreground">
                  <div className="border border-border/70 px-3 py-2">
                    <p className="font-medium text-foreground">Backup Storage</p>
                    <p className="mt-1 break-all">{overview?.settings.storage_path || '-'}</p>
                  </div>
                  <div className="border border-border/70 px-3 py-2">
                    <p className="font-medium text-foreground">Uploads Path</p>
                    <p className="mt-1 break-all">{overview?.settings.uploads_path || '-'}</p>
                  </div>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Akses Cepat">
                <div className="space-y-2">
                  <Button asChild variant="outline" className="w-full rounded-none shadow-none">
                    <Link to="/settings">Settings Utama</Link>
                  </Button>
                  {canManageBackup ? (
                    <Button asChild variant="outline" className="w-full rounded-none shadow-none">
                      <Link to="/settings/integrations">
                        Integrasi
                        <ArrowUpRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight">Ringkasan Operasional</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Storage, scheduler, dan hasil backup terakhir ditampilkan di satu tempat agar operator bisa memutuskan tindakan lebih cepat.</p>
              </div>
              {loadingOverview ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={HardDrive} title="Disk VPS" value={overview?.disk_usage ? `${overview.disk_usage.used_percent.toFixed(1)}%` : '-'} helper={overview?.disk_usage ? `${formatBytes(overview.disk_usage.used_bytes)} terpakai dari ${formatBytes(overview.disk_usage.total_bytes)}` : 'Belum ada data disk'} tone={diskTone(overview?.disk_usage?.used_percent)} />
              <MetricCard icon={Database} title="Folder Backup" value={formatBytes(overview?.backup_storage.size_bytes)} helper={`${formatCount(overview?.backup_storage.file_count)} file backup tersimpan`} tone="sky" />
              <MetricCard icon={Server} title="Folder Uploads" value={formatBytes(overview?.uploads_storage.size_bytes)} helper={`${formatCount(overview?.uploads_storage.file_count)} file produksi terdeteksi`} tone="amber" />
              <MetricCard icon={Clock3} title="Backup Terakhir" value={formatDateTime(overview?.latest_run?.finished_at || overview?.settings.last_finished_at)} helper={overview?.latest_run?.message || overview?.settings.last_message || 'Belum ada backup'} tone={statusCardTone(overview?.latest_run?.status || overview?.settings.last_status)} />
            </div>
          </section>

          <section className="space-y-4">
            <Tabs defaultValue="monitoring" className="space-y-4">
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-none bg-transparent p-0">
                <TabsTrigger value="monitoring" className="rounded-none border border-border/70 data-[state=active]:border-foreground data-[state=active]:bg-foreground data-[state=active]:text-background">Monitoring Storage</TabsTrigger>
                <TabsTrigger value="automation" className="rounded-none border border-border/70 data-[state=active]:border-foreground data-[state=active]:bg-foreground data-[state=active]:text-background">Auto Backup</TabsTrigger>
                <TabsTrigger value="files" className="rounded-none border border-border/70 data-[state=active]:border-foreground data-[state=active]:bg-foreground data-[state=active]:text-background">File Backup</TabsTrigger>
              </TabsList>

              <TabsContent value="monitoring" className="mt-0 space-y-4">
                <div className="grid gap-3 lg:grid-cols-3">
                  <StoragePanel title="Disk Yang Dipakai Backup" icon={Activity} summary={overview?.disk_usage ? `${overview.disk_usage.used_percent.toFixed(1)}%` : '-'} rows={[
                    { label: 'Mount Path', value: overview?.disk_usage?.mountpoint || '-' },
                    { label: 'Terpakai', value: formatBytes(overview?.disk_usage?.used_bytes) },
                    { label: 'Sisa', value: formatBytes(overview?.disk_usage?.free_bytes) },
                    { label: 'Total', value: formatBytes(overview?.disk_usage?.total_bytes) },
                  ]} />
                  <StoragePanel title="Direktori Backup" icon={Database} summary={formatBytes(overview?.backup_storage.size_bytes)} rows={[
                    { label: 'Path', value: overview?.backup_storage.path || '-' },
                    { label: 'Jumlah File', value: formatCount(overview?.backup_storage.file_count) },
                    { label: 'File Terakhir', value: formatDateTime(overview?.backup_storage.last_file_at) },
                    { label: 'Status Path', value: overview?.backup_storage.exists ? 'Tersedia' : 'Belum ada' },
                  ]} />
                  <StoragePanel title="Direktori Uploads" icon={HardDrive} summary={formatBytes(overview?.uploads_storage.size_bytes)} rows={[
                    { label: 'Path', value: overview?.uploads_storage.path || '-' },
                    { label: 'Jumlah File', value: formatCount(overview?.uploads_storage.file_count) },
                    { label: 'File Terakhir', value: formatDateTime(overview?.uploads_storage.last_file_at) },
                    { label: 'Status Path', value: overview?.uploads_storage.exists ? 'Tersedia' : 'Belum ada' },
                  ]} />
                </div>

                <div className="border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Hasil Backup Terbaru</h3>
                      <p className="text-[11px] leading-5 text-muted-foreground">Menampilkan status run terakhir yang tercatat oleh backend.</p>
                    </div>
                    <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">{formatStatusLabel(overview?.latest_run?.status || overview?.settings.last_status)}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <KeyValueCard label="Run Key" value={overview?.latest_run?.run_key || overview?.settings.last_run_key || '-'} />
                    <KeyValueCard label="Trigger" value={formatTriggerLabel(overview?.latest_run?.trigger_source || overview?.settings.last_trigger_source)} />
                    <KeyValueCard label="Mulai" value={formatDateTime(overview?.latest_run?.started_at || overview?.settings.last_started_at)} />
                    <KeyValueCard label="Selesai" value={formatDateTime(overview?.latest_run?.finished_at || overview?.settings.last_finished_at)} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="automation" className="mt-0 space-y-4">
                <div className="border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Konfigurasi Auto Backup</h3>
                      <p className="text-[11px] leading-5 text-muted-foreground">Pengaturan ini langsung mempengaruhi scheduler di backend. Database selalu dibackup, uploads bersifat opsional.</p>
                    </div>
                    <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">Cron Standard</Badge>
                  </div>

                  <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    <div className="space-y-4 border border-border/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Label className="text-sm font-semibold">Aktifkan Auto Backup</Label>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Saat aktif, backend akan menjadwalkan backup otomatis sesuai cron expression di bawah.</p>
                        </div>
                        <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} disabled={!canManageBackup || savingSettings} />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="backup-cron">Cron Expression</Label>
                        <Input id="backup-cron" value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} disabled={!canManageBackup || savingSettings} className="rounded-none" placeholder="0 2 * * *" />
                        <p className="text-[11px] leading-5 text-muted-foreground">
                          {cronPreview.isValid ? (
                            <>
                              Jadwal: <span className="font-medium text-foreground">{cronPreview.description}</span>
                              {cronPreview.nextRuns[0] ? (
                                <>
                                  {' '}
                                  | Berikutnya: <span className="font-medium text-foreground">{cronPreview.nextRuns[0]}</span>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <>
                              Contoh harian jam 02:00: <span className="font-medium text-foreground">0 2 * * *</span>
                              {cronExpression.trim() ? (
                                <>
                                  {' '}
                                  | <span className="text-rose-700">{cronPreview.error || 'Ekspresi cron belum valid.'}</span>
                                </>
                              ) : null}
                            </>
                          )}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="backup-retention">Retensi Lokal (hari)</Label>
                        <Input id="backup-retention" type="number" min={1} value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} disabled={!canManageBackup || savingSettings} className="rounded-none" />
                        <p className="text-[11px] leading-5 text-muted-foreground">File backup yang melewati retensi akan dibersihkan otomatis saat job berikutnya berjalan.</p>
                      </div>
                    </div>

                    <div className="space-y-4 border border-border/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Label className="text-sm font-semibold">Sertakan Uploads</Label>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Jika aktif, sistem membuat arsip `.tar.gz` dari folder uploads setiap kali backup dijalankan.</p>
                        </div>
                        <Switch checked={includeUploads} onCheckedChange={setIncludeUploads} disabled={!canManageBackup || savingSettings} />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <KeyValueCard label="Path Backup" value={overview?.settings.storage_path || '-'} />
                        <KeyValueCard label="Path Uploads" value={overview?.settings.uploads_path || '-'} />
                        <KeyValueCard label="Next Run" value={cronPreview.isValid ? cronPreview.nextRuns[0] || '-' : formatDateTime(overview?.settings.next_run_at)} />
                        <KeyValueCard label="Status Scheduler" value={overview?.settings.auto_enabled ? 'Aktif' : 'Nonaktif'} />
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button className="rounded-none shadow-none" onClick={() => void handleSaveSettings()} disabled={!canManageBackup || savingSettings}>
                          {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                          Simpan Pengaturan
                        </Button>
                        <Button variant="outline" className="rounded-none shadow-none" onClick={() => void loadOverview()} disabled={loadingOverview}>
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          Muat Ulang Status
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="files" className="mt-0 space-y-4">
                <div className="border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Daftar File Backup</h3>
                      <p className="text-[11px] leading-5 text-muted-foreground">File yang berhasil dibuat sistem bisa diunduh langsung dari halaman ini oleh user yang memiliki akses settings.</p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Total {filesTotal.toLocaleString('id-ID')} file</span>
                      <Button variant="outline" className="rounded-none shadow-none" onClick={() => void loadFiles(filesPage)} disabled={loadingFiles}>
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Refresh File
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nama File</TableHead>
                          <TableHead>Tipe</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Ukuran</TableHead>
                          <TableHead>Dibuat</TableHead>
                          <TableHead>Trigger</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingFiles ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                              <div className="inline-flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Memuat file backup...
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : files.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Belum ada file backup yang tercatat.</TableCell>
                          </TableRow>
                        ) : (
                          files.map((file) => (
                            <TableRow key={file.id}>
                              <TableCell>
                                <div className="space-y-1">
                                  <p className="font-medium text-foreground">{file.file_name || `Backup #${file.id}`}</p>
                                  <p className="text-[11px] leading-5 text-muted-foreground">{file.relative_path || file.error_message || '-'}</p>
                                </div>
                              </TableCell>
                              <TableCell>{formatBackupType(file.backup_type)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${statusBadgeClassName(file.status)}`}>
                                  {formatStatusLabel(file.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatBytes(file.size_bytes)}</TableCell>
                              <TableCell>{formatDateTime(file.completed_at || file.created_at)}</TableCell>
                              <TableCell>{formatTriggerLabel(file.trigger_source)}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="outline" className="rounded-none shadow-none" onClick={() => void handleDownloadFile(file)} disabled={file.status !== 'completed' || downloadingFileId === file.id}>
                                  {downloadingFileId === file.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="mr-2 h-4 w-4" />}
                                  Download
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span>Halaman {filesPage} dari {filePageCount}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="rounded-none shadow-none" onClick={() => void loadFiles(filesPage - 1)} disabled={filesPage <= 1 || loadingFiles}>Sebelumnya</Button>
                      <Button variant="outline" className="rounded-none shadow-none" onClick={() => void loadFiles(filesPage + 1)} disabled={filesPage >= filePageCount || loadingFiles}>Berikutnya</Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </section>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  helper,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  helper: string;
  tone: 'good' | 'warn' | 'critical' | 'sky' | 'amber' | 'neutral';
}) {
  const toneClassName = {
    good: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
    warn: 'border-amber-200 bg-amber-50/70 text-amber-950',
    critical: 'border-rose-200 bg-rose-50/70 text-rose-950',
    sky: 'border-sky-200 bg-sky-50/70 text-sky-950',
    amber: 'border-amber-200 bg-amber-50/70 text-amber-950',
    neutral: 'border-border bg-card text-card-foreground',
  }[tone];

  return (
    <div className={`border p-4 ${toneClassName}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-[11px] leading-5 opacity-85">{helper}</p>
    </div>
  );
}

function StoragePanel({
  title,
  icon: Icon,
  summary,
  rows,
}: {
  title: string;
  icon: React.ElementType;
  summary: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="border border-border/70 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{summary}</p>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 border border-border/70 px-3 py-2 text-[11px] leading-5">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="max-w-[70%] break-all text-right font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyValueCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/70 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function AsideMetric({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'neutral' | 'critical' }) {
  const toneClassName = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    critical: 'text-rose-700',
    neutral: 'text-foreground',
  }[tone];

  return (
    <div className="flex items-start justify-between gap-3 border border-border/70 px-3 py-2">
      <span>{label}</span>
      <span className={`text-right font-medium ${toneClassName}`}>{value}</span>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const apiMessage = error.response?.data?.error;
    if (typeof apiMessage === 'string' && apiMessage.trim()) {
      return apiMessage;
    }
  }

  return fallback;
}

function formatBytes(value?: number) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let currentValue = bytes;
  let unitIndex = 0;

  while (currentValue >= 1024 && unitIndex < units.length - 1) {
    currentValue /= 1024;
    unitIndex += 1;
  }

  return `${currentValue.toLocaleString('id-ID', { maximumFractionDigits: currentValue >= 10 ? 1 : 2 })} ${units[unitIndex]}`;
}

function formatDateTime(value?: string | Date) {
  if (!value) {
    return '-';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatStatusLabel(value?: string) {
  switch ((value || '').toLowerCase()) {
    case 'completed':
      return 'Berhasil';
    case 'partial':
      return 'Parsial';
    case 'failed':
      return 'Gagal';
    case 'running':
      return 'Berjalan';
    case 'idle':
      return 'Idle';
    default:
      return value ? value.replace(/_/g, ' ') : '-';
  }
}

function formatTriggerLabel(value?: string) {
  switch ((value || '').toLowerCase()) {
    case 'manual':
      return 'Manual';
    case 'scheduled':
      return 'Terjadwal';
    default:
      return value ? value.replace(/_/g, ' ') : '-';
  }
}

function formatBackupType(value?: string) {
  switch ((value || '').toLowerCase()) {
    case 'database':
      return 'Database';
    case 'uploads':
      return 'Uploads';
    default:
      return value ? value.replace(/_/g, ' ') : '-';
  }
}

function formatCount(value?: number) {
  return Number(value || 0).toLocaleString('id-ID');
}

function diskTone(value?: number): 'good' | 'warn' | 'critical' | 'neutral' {
  if (typeof value !== 'number') {
    return 'neutral';
  }
  if (value >= 90) {
    return 'critical';
  }
  if (value >= 80) {
    return 'warn';
  }
  return 'good';
}

function statusCardTone(value?: string): 'good' | 'warn' | 'critical' | 'neutral' {
  switch ((value || '').toLowerCase()) {
    case 'completed':
    case 'idle':
      return 'good';
    case 'partial':
    case 'running':
      return 'warn';
    case 'failed':
      return 'critical';
    default:
      return 'neutral';
  }
}

function statusTone(value?: string): 'good' | 'warn' | 'neutral' | 'critical' {
  switch ((value || '').toLowerCase()) {
    case 'completed':
    case 'idle':
      return 'good';
    case 'running':
    case 'partial':
      return 'warn';
    case 'failed':
      return 'critical';
    default:
      return 'neutral';
  }
}

function statusBadgeClassName(value?: string) {
  switch ((value || '').toLowerCase()) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'partial':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'running':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:
      return 'border-border bg-background text-foreground';
  }
}

function buildCronPreview(expression: string): CronPreview {
  const trimmedExpression = expression.trim();
  if (!trimmedExpression) {
    return {
      isValid: false,
      description: '',
      nextRuns: [],
      error: 'Isi cron expression terlebih dulu untuk melihat preview jadwal.',
    };
  }

  try {
    const interval = CronExpressionParser.parse(trimmedExpression, {
      currentDate: new Date(),
      tz: 'Asia/Jakarta',
    });
    const nextRuns = interval.take(3).map((date) => formatDateTime(date.toDate()));
    const description = cronstrue.toString(trimmedExpression, {
      use24HourTimeFormat: true,
      verbose: true,
      throwExceptionOnParseError: true,
    });

    return {
      isValid: true,
      description: capitalizeSentence(description),
      nextRuns,
    };
  } catch (error) {
    return {
      isValid: false,
      description: '',
      nextRuns: [],
      error: error instanceof Error ? error.message : 'Ekspresi cron tidak dapat diparse.',
    };
  }
}

function capitalizeSentence(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}