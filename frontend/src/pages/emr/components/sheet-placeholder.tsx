import type { MedicalRecordSectionType, Visit } from '@/lib/api';
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

  return (
    <div className="space-y-3">
      <TableSection title={sheet.label} helper={sheet.helper}>
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
              {sheet.sections.length > 0
                ? `Mengambil data dari: ${sheet.sections.join(', ')}. Saat ini tersedia ${relatedRecords.length} entri terkait dalam kunjungan ini.`
                : 'Belum ada section klinis yang langsung dipakai; lembar ini akan memakai struktur data khusus.'}
            </p>
          </TableCell>
        </TableRow>
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