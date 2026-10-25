import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MedicalRecordSectionType, Visit } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SURAT_TYPE_OPTIONS, type SuratTypeOptionValue } from '../constants';
import type { MedicalSheetConfig } from '../types';
import { collectVisitInformedConsents, getRecordsForSheetSections } from '../utils';
import { TableCell, TableRow, TableSection } from './form-fields';

type SheetPlaceholderProps = {
  sheet: MedicalSheetConfig;
  visit: Visit;
  recordsBySection: Record<MedicalRecordSectionType, any[]>;
};

export function SheetPlaceholder({ sheet, visit, recordsBySection }: SheetPlaceholderProps) {
  const relatedRecords = getRecordsForSheetSections(recordsBySection as Record<MedicalRecordSectionType, any[]>, sheet.sections);
  const consents = collectVisitInformedConsents(relatedRecords as any[]);
  const [selectedSuratType, setSelectedSuratType] = useState<SuratTypeOptionValue>(SURAT_TYPE_OPTIONS[0].value);

  const activeSuratType = useMemo(
    () => SURAT_TYPE_OPTIONS.find((option) => option.value === selectedSuratType) || SURAT_TYPE_OPTIONS[0],
    [selectedSuratType]
  );

  return (
    <div className="space-y-3">
      <TableSection title={sheet.label}>
        <TableRow>
          <TableCell label="Status Implementasi" colSpan={2}>
            <p className="text-sm text-foreground/90">
              {sheet.availability === 'planned'
                ? 'Lembar ini sudah masuk katalog EMR dan berikutnya akan disiapkan sebagai form serta format cetak khusus.'
                : 'Lembar ini sudah mulai dipetakan dari data kunjungan yang ada dan akan disempurnakan menjadi form khusus.'}
            </p>
          </TableCell>
          <TableCell label="Kunjungan" colSpan={2}>
            <p className="text-sm text-foreground/90">{visit.visit_number} · {visit.patient?.full_name || '-'} · {visit.polyclinic?.name || '-'}</p>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell label="Sumber Data Saat Ini" colSpan={4}>
            <p className="text-sm text-foreground/90">
              {sheet.key === 'surat'
                ? `Mengambil data pendukung dari: ${sheet.sections.join(', ')}. Saat ini tersedia ${relatedRecords.length} entri terkait dalam kunjungan ini.`
                : sheet.sections.length > 0
                ? `Mengambil data dari: ${sheet.sections.join(', ')}. Saat ini tersedia ${relatedRecords.length} entri terkait dalam kunjungan ini.`
                : 'Belum ada section klinis yang langsung dipakai; lembar ini akan memakai struktur data khusus.'}
            </p>
          </TableCell>
        </TableRow>
        {sheet.key === 'surat' && (
          <>
            <TableRow>
              <TableCell label="Jenis Surat" colSpan={2}>
                <div className="space-y-2">
                  <Select value={selectedSuratType} onValueChange={(value) => setSelectedSuratType(value as SuratTypeOptionValue)}>
                    <SelectTrigger className="h-9 rounded-none border border-border/70 bg-background px-2.5 text-sm shadow-none">
                      <SelectValue placeholder="Pilih jenis surat" />
                    </SelectTrigger>
                    <SelectContent>
                      {SURAT_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Pilih jenis surat yang akan disiapkan untuk pasien pada kunjungan ini.
                  </p>
                </div>
              </TableCell>
              <TableCell label="Ringkasan Terpilih" colSpan={2}>
                <div className="space-y-2">
                  <Badge variant="outline" className={cn('rounded-none px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', activeSuratType.accentClassName)}>
                    {activeSuratType.shortLabel}
                  </Badge>
                  <p className="text-sm text-foreground/90">{activeSuratType.description}</p>
                  <p className="text-xs text-muted-foreground">{activeSuratType.supportHint}</p>
                </div>
              </TableCell>
            </TableRow>

            <TableRow>
              <TableCell label="Pilihan Surat" colSpan={4}>
                <div className="grid gap-2 md:grid-cols-2">
                  {SURAT_TYPE_OPTIONS.map((option) => {
                    const isActive = option.value === selectedSuratType;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedSuratType(option.value)}
                        className={cn(
                          'border border-border/70 bg-background px-3 py-2 text-left transition-colors hover:bg-muted/20',
                          isActive && 'border-foreground/30 bg-muted/20'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{option.label}</p>
                          <Badge variant="outline" className={cn('rounded-none px-2 py-0.5 text-[10px] uppercase tracking-wide', option.accentClassName)}>
                            {option.shortLabel}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </TableCell>
            </TableRow>

            <TableRow>
              <TableCell label="Panduan Data Pendukung" colSpan={4}>
                <div className="space-y-2 text-sm text-foreground/90">
                  <p>Untuk menjaga kualitas surat, pastikan data kunjungan sudah memadai sebelum pencetakan.</p>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    <li>Lengkapi assessment dan outcome sebagai dasar kesimpulan medis.</li>
                    <li>Gunakan lembar penunjang bila surat membutuhkan hasil laboratorium atau radiologi.</li>
                    <li>Pastikan identitas pasien dan nomor kunjungan sudah sesuai.</li>
                  </ul>
                </div>
              </TableCell>
            </TableRow>
          </>
        )}
        {sheet.key === 'informed-consent' && (
          <TableRow>
            <TableCell label="Consent Tersimpan" colSpan={4}>
              {consents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada informed consent yang tersimpan pada kunjungan ini.</p>
              ) : (
                <div className="space-y-2">
                  {consents.map((consent: any) => (
                    <div key={consent.id} className="border border-border/60 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{consent.action_name || 'Tindakan'}</p>
                        <span className="border border-border/70 bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {consent.patient_decision && consent.patient_decision !== 'pending' ? consent.patient_decision : 'Draft otomatis'}
                        </span>
                      </div>
                      {consent.action_description && <p className="mt-1 text-muted-foreground">{consent.action_description}</p>}
                      <p className="mt-1 text-muted-foreground">Pemberi persetujuan: {consent.consent_giver_name || visit.patient?.full_name || '-'}</p>
                      <p className="mt-1 text-muted-foreground">Saksi: {consent.witness_name || '-'} </p>
                    </div>
                  ))}
                </div>
              )}
            </TableCell>
          </TableRow>
        )}
      </TableSection>
    </div>
  );
}