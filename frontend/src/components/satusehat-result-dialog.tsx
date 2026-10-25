import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FileCode,
  Info,
  Lightbulb,
  ListChecks,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ResourcePrerequisite {
  key: string;
  label: string;
  required: boolean;
  ready: boolean;
  current_value?: string;
  detail?: string;
  next_step?: string;
}

export interface NamedResourcePreview {
  name: string;
  resource: Record<string, unknown>;
  ready?: boolean;
  warnings?: string[];
}

export type SatusehatResultDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  errorMessage?: string;
  payload: unknown;
  onOpenChange: (open: boolean) => void;
};

export interface SatusehatSuggestion {
  title: string;
  description: string;
  actionHint: string;
  actionUrl?: string;
}

export function detectSatusehatSuggestions(errorText?: string): SatusehatSuggestion[] {
  if (!errorText) return [];
  const lower = errorText.toLowerCase();
  const suggestions: SatusehatSuggestion[] = [];

  if (
    lower.includes('unitsofmeasure') ||
    lower.includes('10348') ||
    lower.includes('orderabledrugform') ||
    (lower.includes('code not found') && lower.includes('system: http://unitsofmeasure.org'))
  ) {
    suggestions.push({
      title: 'Satuan Takaran / Sediaan Obat Tidak Sesuai Standar (Rule 10348)',
      description:
        'SATUSEHAT menolak unit kuantitas karena bentuk sediaan fisik dikirim ke sistem satuan UCUM. Standar FHIR Kemenkes mensyaratkan kuantitas menggunakan satuan kemasan/dispense resmi (seperti Botol, Tablet, Kapsul, Ampul, Vial) dengan CodeSystem HL7/UCUM.',
      actionHint:
        'Sistem telah diperbarui untuk memetakan satuan kemasan secara otomatis. Pastikan satuan obat di Master Obat terisi sesuai (misal: Botol / Tablet / Kapsul), lalu coba kirim ulang.',
      actionUrl: '/medicines',
    });
  }

  if (
    (!lower.includes('unitsofmeasure') && lower.includes('code not found')) ||
    lower.includes('kfa') ||
    lower.includes('medication.code')
  ) {
    suggestions.push({
      title: 'Kode KFA Obat Tidak Valid / Belum Terdaftar di Kemenkes',
      description:
        'Kode KFA yang digunakan pada master obat ini tidak ditemukan di sistem SATUSEHAT Kemenkes (Kamus Farmasi & Alkes). Format kode internal atau kode lama tidak diterima oleh SATUSEHAT.',
      actionHint:
        'Buka menu Master Data > Obat, klik Edit pada obat terkait, lalu perbarui kolom Kode KFA dengan kode KFA 8-9 digit resmi yang aktif dari Kemenkes (atau gunakan fitur KFA Browser).',
      actionUrl: '/medicines',
    });
  }

  if (
    lower.includes('patient') ||
    lower.includes('patient.id') ||
    lower.includes('subject') ||
    lower.includes('ihs') ||
    lower.includes('pasien')
  ) {
    suggestions.push({
      title: 'Pasien Belum Memiliki ID SATUSEHAT (IHS)',
      description:
        'Resource MedicationRequest membutuhkan referensi subject Patient dengan IHS Number resmi yang valid dari Kemenkes.',
      actionHint:
        'Buka detail Data Pasien, pastikan NIK 16 digit sesuai KTP dan klik tombol "Sync SATUSEHAT" agar sistem mengambil ID IHS Pasien terlebih dahulu.',
      actionUrl: '/patients',
    });
  }

  if (lower.includes('encounter') || lower.includes('kunjungan')) {
    suggestions.push({
      title: 'Encounter Kunjungan Belum Tersinkronisasi',
      description:
        'Resep obat harus dihubungkan dengan Encounter kunjungan aktif yang telah berhasil disinkronkan ke SATUSEHAT.',
      actionHint:
        'Pastikan pendaftaran atau kunjungan pasien di poliklinik sudah berstatus sinkron SATUSEHAT sebelum mengirim resep farmasi.',
    });
  }

  if (
    lower.includes('practitioner') ||
    lower.includes('requester') ||
    lower.includes('dokter') ||
    lower.includes('petugas')
  ) {
    suggestions.push({
      title: 'Dokter / Petugas Pengaju Belum Terdaftar di SATUSEHAT',
      description:
        'Dokter yang meresepkan belum memiliki SATUSEHAT Practitioner ID di database Kemenkes.',
      actionHint:
        'Buka menu Master Data > Dokter atau Pegawai, pastikan NIK dokter terisi benar dan lakukan sinkronisasi data dokter ke SATUSEHAT.',
      actionUrl: '/doctors',
    });
  }

  if (
    lower.includes('unauthorized') ||
    lower.includes('token') ||
    lower.includes('401') ||
    lower.includes('oauth') ||
    lower.includes('client')
  ) {
    suggestions.push({
      title: 'Koneksi / Token SATUSEHAT Bermasalah',
      description:
        'Autentikasi ke server SATUSEHAT gagal atau masa berlaku token OAuth2 telah kedaluwarsa.',
      actionHint:
        'Buka Pengaturan > Integrasi SATUSEHAT, cek kredensial (Client ID & Client Secret) dan klik tombol Uji Koneksi.',
      actionUrl: '/settings/integrations',
    });
  }

  if (lower.includes('organization') || lower.includes('assigner')) {
    suggestions.push({
      title: 'ID Organisasi Faskes Belum Dikonfigurasi',
      description:
        'Organization ID klinik / faskes diperlukan sebagai identitas pengirim resep dan performer dispense.',
      actionHint:
        'Buka Pengaturan > Integrasi SATUSEHAT dan pastikan Organization ID faskes sudah diisi sesuai environment (Dev/Prod).',
      actionUrl: '/settings/integrations',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      title: 'Pemeriksaan Data Master & Format Payload',
      description:
        'Server SATUSEHAT mengembalikan penolakan atau validasi gagal pada data yang dikirim.',
      actionHint:
        'Periksa tab "Payload JSON" untuk melihat struktur data FHIR yang dikirim dan periksa prasyarat kelengkapan di tab Kesiapan.',
    });
  }

  return suggestions;
}

export function SatusehatResultDialog({
  open,
  title,
  description,
  errorMessage,
  payload,
  onOpenChange,
}: SatusehatResultDialogProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('analysis');

  // Normalize payload
  const normalized = payload && typeof payload === 'object' ? (payload as Record<string, any>) : {};
  const innerData = normalized.data && typeof normalized.data === 'object' ? normalized.data : normalized;

  // Extract structured elements
  const prerequisites: ResourcePrerequisite[] = Array.isArray(innerData.prerequisites)
    ? innerData.prerequisites
    : [];
  const warnings: string[] = Array.isArray(innerData.warnings) ? innerData.warnings : [];
  const isReady: boolean = Boolean(innerData.ready);
  const relatedResources: NamedResourcePreview[] = Array.isArray(innerData.related_resources)
    ? innerData.related_resources
    : [];

  // Active error detection
  const activeError =
    errorMessage ||
    (typeof innerData.error === 'string' ? innerData.error : '') ||
    (typeof normalized.error === 'string' ? normalized.error : '');

  const suggestions = detectSatusehatSuggestions(activeError);

  const unmetPrerequisites = prerequisites.filter((p) => !p.ready);
  const readyPrerequisites = prerequisites.filter((p) => p.ready);

  const formattedPayload =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(formattedPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasAnalysisContent =
    Boolean(activeError) ||
    prerequisites.length > 0 ||
    warnings.length > 0 ||
    suggestions.length > 0;

  const isPreview = title.toLowerCase().includes('preview');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[880px] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-none border border-border/80 p-0 shadow-lg">
        {/* Header Dialog */}
        <DialogHeader className="border-b border-border/70 bg-card px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-bold tracking-tight text-foreground">
                  {title}
                </DialogTitle>
                {activeError ? (
                  <Badge variant="destructive" className="rounded-none text-[10px] uppercase font-mono tracking-wide">
                    Gagal / Error
                  </Badge>
                ) : isPreview ? (
                  isReady ? (
                    <Badge className="rounded-none bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] uppercase font-mono tracking-wide">
                      Siap Kirim
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-none border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 text-[10px] uppercase font-mono tracking-wide">
                      Belum Siap
                    </Badge>
                  )
                ) : (
                  <Badge className="rounded-none bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] uppercase font-mono tracking-wide">
                    Tersinkron / Sukses
                  </Badge>
                )}
              </div>
              {description ? (
                <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                  {description}
                </DialogDescription>
              ) : null}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyJson}
              className="h-8 gap-1.5 rounded-none text-xs self-start sm:self-auto shrink-0 shadow-none"
            >
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              {copied ? 'Tersalin' : 'Salin JSON'}
            </Button>
          </div>
        </DialogHeader>

        {/* Tabs Control */}
        <Tabs
          value={hasAnalysisContent ? activeTab : 'json'}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="border-b border-border/70 bg-muted/20 px-6">
            <TabsList className="h-10 w-full justify-start rounded-none bg-transparent p-0 gap-4">
              {hasAnalysisContent && (
                <TabsTrigger
                  value="analysis"
                  className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-2.5 pt-2 px-1 text-xs font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
                >
                  <ListChecks className="size-4" />
                  Kesiapan & Solusi
                  {unmetPrerequisites.length > 0 && (
                    <span className="rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400 px-1.5 py-0.2 text-[10px] font-mono font-bold">
                      {unmetPrerequisites.length} Kurang
                    </span>
                  )}
                  {activeError && (
                    <span className="size-2 rounded-full bg-rose-500"></span>
                  )}
                </TabsTrigger>
              )}

              <TabsTrigger
                value="json"
                className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-2.5 pt-2 px-1 text-xs font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
              >
                <FileCode className="size-4" />
                Payload JSON (FHIR)
              </TabsTrigger>

              {relatedResources.length > 0 && (
                <TabsTrigger
                  value="related"
                  className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-2.5 pt-2 px-1 text-xs font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
                >
                  <Package className="size-4" />
                  Resource Terkait ({relatedResources.length})
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* TAB 1: ANALISIS KESIAPAN & SOLUSI */}
          {hasAnalysisContent && (
            <TabsContent value="analysis" className="m-0 flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6">
                  {/* BOX ERROR UTAMA (Bila Ada Error dari SATUSEHAT) */}
                  {activeError && (
                    <div className="border border-rose-300 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="size-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1 min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                            Penyebab Kegagalan Sinkronisasi SATUSEHAT
                          </p>
                          <p className="text-xs font-mono font-medium text-rose-950 dark:text-rose-200 break-words leading-relaxed bg-white/70 dark:bg-black/30 p-2.5 border border-rose-200 dark:border-rose-900/50">
                            {activeError}
                          </p>
                        </div>
                      </div>

                      {/* SARAN PERBAIKAN BERDASARKAN ERROR */}
                      {suggestions.length > 0 && (
                        <div className="pt-2 border-t border-rose-200/80 dark:border-rose-900/60 space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-900 dark:text-rose-300 flex items-center gap-1.5">
                            <Lightbulb className="size-4 text-amber-600 dark:text-amber-400" />
                            Rekomendasi Tindakan / Solusi:
                          </p>
                          <div className="space-y-2">
                            {suggestions.map((sug, idx) => (
                              <div
                                key={idx}
                                className="border border-border/80 bg-background/90 p-3 space-y-1 text-xs"
                              >
                                <p className="font-bold text-foreground flex items-center gap-1.5">
                                  <span>👉</span> {sug.title}
                                </p>
                                <p className="text-muted-foreground text-[11px] leading-relaxed">
                                  {sug.description}
                                </p>
                                <div className="mt-1.5 pt-1.5 border-t border-border/50 text-foreground font-medium text-[11px] flex items-start gap-1">
                                  <span className="text-primary font-bold">Langkah:</span>
                                  <span>{sug.actionHint}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STATUS BANNER JIKA BELUM SIAP / SIAP */}
                  {!activeError && (
                    <div
                      className={cn(
                        'border p-4 flex items-start gap-3',
                        isReady && unmetPrerequisites.length === 0
                          ? 'border-emerald-300 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20'
                          : 'border-amber-300 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20'
                      )}
                    >
                      {isReady && unmetPrerequisites.length === 0 ? (
                        <>
                          <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                              Semua Prasyarat Terpenuhi & Payload Siap Dikirim
                            </p>
                            <p className="text-xs text-emerald-900/80 dark:text-emerald-200/80 leading-relaxed">
                              Data resep, master obat (KFA), pasien, dan dokter telah sesuai dengan standar FHIR MedicationRequest SATUSEHAT Kemenkes.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                              Payload Belum Siap Dikirim ({unmetPrerequisites.length} Data Perlu Dilengkapi)
                            </p>
                            <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                              Lengkapi data master atau referensi berikut sebelum melakukan sinkronisasi ke SATUSEHAT agar pengiriman tidak ditolak server Kemenkes.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* WARNINGS */}
                  {warnings.length > 0 && (
                    <div className="border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/15 p-4 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <Info className="size-4" />
                        Peringatan Validasi Payload ({warnings.length})
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                        {warnings.map((warn, i) => (
                          <li key={i} className="leading-relaxed">
                            {warn}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* SECTION 1: YANG BELUM LENGKAP (UNMET PREREQUISITES) */}
                  {unmetPrerequisites.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-border/80 pb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                            Data yang Kurang & Saran Perbaikan ({unmetPrerequisites.length})
                          </h4>
                        </div>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          Wajib dilengkapi sebelum submit
                        </span>
                      </div>

                      <div className="border border-border/80 bg-card divide-y divide-border/60">
                        {unmetPrerequisites.map((item) => (
                          <div key={item.key} className="p-4 space-y-2 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="size-2 rounded-full bg-rose-500"></span>
                                <p className="text-xs font-bold text-foreground">{item.label}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {item.current_value && (
                                  <span className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 border border-border/60">
                                    Nilai saat ini: {item.current_value}
                                  </span>
                                )}
                                <Badge
                                  variant={item.required ? 'destructive' : 'outline'}
                                  className="rounded-none text-[10px] uppercase font-mono"
                                >
                                  {item.required ? 'Wajib' : 'Opsional'}
                                </Badge>
                              </div>
                            </div>

                            {item.detail && (
                              <p className="text-xs text-muted-foreground leading-relaxed pl-4 border-l-2 border-rose-300 dark:border-rose-800">
                                <span className="font-semibold text-foreground">Kekurangan:</span> {item.detail}
                              </p>
                            )}

                            {item.next_step && (
                              <div className="flex items-start gap-1.5 pl-4 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 p-2 border border-amber-200 dark:border-amber-900/40">
                                <Lightbulb className="size-4 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold">Saran Tindakan:</span> {item.next_step}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SECTION 2: YANG SUDAH TERPENUHI (READY PREREQUISITES) */}
                  {readyPrerequisites.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-border/80 pb-2">
                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Prasyarat yang Sudah Terpenuhi ({readyPrerequisites.length})
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {readyPrerequisites.map((item) => (
                          <div
                            key={item.key}
                            className="border border-border/60 bg-muted/10 p-3 flex items-start justify-between gap-2"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <p className="font-semibold text-foreground truncate">{item.label}</p>
                              {item.current_value && (
                                <p className="text-[11px] text-muted-foreground font-mono truncate" title={item.current_value}>
                                  {item.current_value}
                                </p>
                              )}
                            </div>
                            <Badge variant="outline" className="rounded-none border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 text-[10px] uppercase font-mono shrink-0">
                              Siap
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* TAB 2: PAYLOAD JSON MENTAH */}
          <TabsContent value="json" className="m-0 flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full bg-muted/10">
              <div className="p-6 space-y-4">
                {!activeError && !isPreview && (
                  <div className="flex items-center gap-2.5 border border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-medium">
                      Data berhasil diterima dan diproses oleh server SATUSEHAT Kemenkes RI (Status 200 OK). Resource ID tersimpan.
                    </span>
                  </div>
                )}
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground/95 selection:bg-primary/20 bg-background border border-border/80 p-4">
                  {formattedPayload}
                </pre>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* TAB 3: RESOURCE TERKAIT (MEDICATION) */}
          {relatedResources.length > 0 && (
            <TabsContent value="related" className="m-0 flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-4">
                  <div className="border border-border/80 bg-muted/20 p-3.5 text-xs space-y-1">
                    <p className="font-bold text-foreground uppercase tracking-wide">
                      Resource Terkait yang Terbentuk Otomatis
                    </p>
                    <p className="text-muted-foreground">
                      Sebelum MedicationRequest dikirimkan, resource master Medication berikut akan disinkronkan terlebih dahulu ke SATUSEHAT.
                    </p>
                  </div>

                  {relatedResources.map((rel, idx) => (
                    <div key={idx} className="border border-border/80 bg-card rounded-none overflow-hidden">
                      <div className="flex items-center justify-between border-b border-border/80 bg-muted/30 px-4 py-2.5">
                        <span className="text-xs font-bold uppercase font-mono text-foreground">
                          {rel.name}
                        </span>
                        <Badge variant={rel.ready !== false ? 'outline' : 'destructive'} className="rounded-none text-[10px] font-mono">
                          {rel.ready !== false ? 'Siap' : 'Belum Siap'}
                        </Badge>
                      </div>
                      <ScrollArea className="max-h-[300px] bg-muted/5 p-4">
                        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground/90">
                          {JSON.stringify(rel.resource, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>

        {/* Footer Dialog */}
        <DialogFooter className="border-t border-border/70 bg-card px-6 py-3.5 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground hidden sm:block font-mono">
            FHIR R4 • SATUSEHAT Kemenkes RI
          </p>
          <Button
            type="button"
            variant="outline"
            className="rounded-none shadow-none text-xs h-8 px-4"
            onClick={() => onOpenChange(false)}
          >
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}