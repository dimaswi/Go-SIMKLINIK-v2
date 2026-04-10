import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { ICD10, MedicalRecordDiagnosis } from '@/lib/api';
import { FilePlus2 } from 'lucide-react';
import { PAPER_SELECT_TRIGGER_CLASSNAME, TableCell, TableRow, TableSection, TextEditor } from './form-fields';

type DiagnosisPayload = {
  icd10_id: number;
  diagnosis_type: 'primer' | 'sekunder';
  working_diagnosis: string;
  differential_diagnosis: string;
  assessment_narrative: string;
  notes: string;
};

type DiagnosisEditorProps = {
  diagnoses: MedicalRecordDiagnosis[];
  icd10List: ICD10[];
  onAdd: (payload: DiagnosisPayload) => void;
  onDelete: (diagnosisId: number) => void;
  readOnly: boolean;
};

export function DiagnosisEditor({
  diagnoses,
  icd10List,
  onAdd,
  onDelete,
  readOnly,
}: DiagnosisEditorProps) {
  const [selectedIcd10, setSelectedIcd10] = useState('');
  const [diagnosisType, setDiagnosisType] = useState<'primer' | 'sekunder'>('primer');
  const [workingDiagnosis, setWorkingDiagnosis] = useState('');
  const [differentialDiagnosis, setDifferentialDiagnosis] = useState('');
  const [assessmentNarrative, setAssessmentNarrative] = useState('');
  const [notes, setNotes] = useState('');

  const icd10Options = icd10List.map((item) => ({
    value: String(item.id),
    label: `${item.code} — ${item.name_id || item.name}`,
  }));

  return (
    <section className="space-y-2">
      <div className="px-0.5">
        <p className="text-[13px] font-semibold tracking-tight">Diagnosis ICD-10</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Setiap diagnosis menyimpan diagnosa kerja, diagnosis banding, dan narasi assessment masing-masing.</p>
      </div>

      <div className="border border-border/70 bg-background">
        {diagnoses.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">Belum ada diagnosis.</div>
        ) : (
          diagnoses.map((diagnosis) => (
            <div key={diagnosis.id} className="border-t border-border/70 px-3 py-3 first:border-t-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/75">
                      {diagnosis.diagnosis_type === 'primer' ? 'Diagnosis Primer' : 'Diagnosis Sekunder'}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{diagnosis.icd10?.code || '-'}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium leading-5">{diagnosis.icd10?.name_id || diagnosis.icd10?.name || '-'}</p>
                </div>
                {!readOnly && (
                  <Button type="button" variant="ghost" size="sm" className="rounded-none text-destructive" onClick={() => onDelete(diagnosis.id)}>
                    Hapus
                  </Button>
                )}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Diagnosa Kerja</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-foreground/90">{diagnosis.working_diagnosis || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Diagnosis Banding</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-foreground/90">{diagnosis.differential_diagnosis || '-'}</p>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Narasi Assessment</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-foreground/90">{diagnosis.assessment_narrative || '-'}</p>
              </div>

              {diagnosis.notes && (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Catatan Tambahan</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-foreground/90">{diagnosis.notes}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {!readOnly && (
        <TableSection title="Tambah Diagnosis">
          <TableRow>
            <TableCell label="Kode ICD-10" colSpan={2}>
              <SearchableSelect
                options={icd10Options}
                value={selectedIcd10}
                onValueChange={setSelectedIcd10}
                placeholder="Cari ICD-10"
                searchPlaceholder="Kode atau nama diagnosis"
                square
                className={PAPER_SELECT_TRIGGER_CLASSNAME}
              />
            </TableCell>
            <TableCell label="Tipe Diagnosis">
              <SearchableSelect
                options={[
                  { value: 'primer', label: 'Primer' },
                  { value: 'sekunder', label: 'Sekunder' },
                ]}
                value={diagnosisType}
                onValueChange={(value) => setDiagnosisType((value as 'primer' | 'sekunder') || 'primer')}
                placeholder="Tipe diagnosis"
                square
                className={PAPER_SELECT_TRIGGER_CLASSNAME}
              />
            </TableCell>
            <TableCell label="Aksi" className="w-[160px]">
              <div className="flex min-h-8 items-center">
                <Button
                  type="button"
                  className="gap-1.5 rounded-none"
                  disabled={!selectedIcd10 || !workingDiagnosis.trim() || !assessmentNarrative.trim()}
                  onClick={() => {
                    if (!selectedIcd10 || !workingDiagnosis.trim() || !assessmentNarrative.trim()) return;
                    onAdd({
                      icd10_id: Number(selectedIcd10),
                      diagnosis_type: diagnosisType,
                      working_diagnosis: workingDiagnosis.trim(),
                      differential_diagnosis: differentialDiagnosis.trim(),
                      assessment_narrative: assessmentNarrative.trim(),
                      notes: notes.trim(),
                    });
                    setSelectedIcd10('');
                    setDiagnosisType('primer');
                    setWorkingDiagnosis('');
                    setDifferentialDiagnosis('');
                    setAssessmentNarrative('');
                    setNotes('');
                  }}
                >
                  <FilePlus2 className="h-4 w-4" /> Tambah
                </Button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell label="Diagnosa Kerja" colSpan={2}>
              <TextEditor label="Diagnosa Kerja" hideLabel value={workingDiagnosis} onChange={setWorkingDiagnosis} disabled={readOnly} rows={3} />
            </TableCell>
            <TableCell label="Diagnosis Banding" colSpan={2}>
              <TextEditor label="Diagnosis Banding" hideLabel value={differentialDiagnosis} onChange={setDifferentialDiagnosis} disabled={readOnly} rows={3} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell label="Narasi Assessment" colSpan={4}>
              <TextEditor label="Narasi Assessment" hideLabel value={assessmentNarrative} onChange={setAssessmentNarrative} disabled={readOnly} rows={4} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell label="Catatan Tambahan" colSpan={4}>
              <TextEditor label="Catatan Tambahan" hideLabel value={notes} onChange={setNotes} disabled={readOnly} rows={3} />
            </TableCell>
          </TableRow>
        </TableSection>
      )}
    </section>
  );
}
