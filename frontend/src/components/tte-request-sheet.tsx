import { useEffect, useMemo, useState } from 'react';
import { FileCheck2, FileText, Loader2, Pencil, Stamp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/usePermission';
import { api, tteApi, type TteEmployeeOption, type TteVisitDocument } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type TTERequestSheetProps = {
  visitId: number;
  buttonClassName?: string;
};

type TteDocumentGroup = {
  key: string;
  label: string;
  description: string;
  documents: TteVisitDocument[];
};

type SignTargetMode =
  | { kind: 'single'; document: TteVisitDocument }
  | { kind: 'all'; documents: TteVisitDocument[] };

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getStatusClassName(status: string) {
  switch (status) {
    case 'signed':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700';
    case 'pending':
      return 'border-amber-300 bg-amber-50 text-amber-700';
    case 'rejected':
      return 'border-rose-300 bg-rose-50 text-rose-700';
    case 'revoked':
      return 'border-slate-300 bg-slate-100 text-slate-700';
    default:
      return 'border-border bg-background text-foreground';
  }
}

function getPairedSupportingDocumentKey(document: TteVisitDocument) {
  const sourceId = document.source_id ?? document.medical_record_id;
  if (!sourceId) {
    return null;
  }

  switch (document.document_type) {
    case 'laboratory_result':
    case 'laboratory_result_staff':
      return `laboratory_result:${sourceId}`;
    case 'radiology_result':
    case 'radiology_result_staff':
      return `radiology_result:${sourceId}`;
    default:
      return null;
  }
}

function getGroupedDocumentLabel(groupKey: string, documents: TteVisitDocument[]) {
  const primaryDocument = documents.find((document) => document.signer_scope === 'doctor') || documents[0];
  const cleanedLabel = primaryDocument?.document_label.replace(/\s+·\s+TTD.+$/i, '').trim();
  if (cleanedLabel) {
    return cleanedLabel;
  }

  if (groupKey.startsWith('laboratory_result:')) {
    return 'Hasil Laboratorium';
  }

  if (groupKey.startsWith('radiology_result:')) {
    return 'Hasil Radiologi';
  }

  return primaryDocument?.document_label || 'Dokumen';
}

function getGroupedDocumentDescription(documents: TteVisitDocument[]) {
  return documents.find((document) => document.signer_scope === 'doctor')?.description || documents[0]?.description || '';
}

function sortGroupedDocuments(documents: TteVisitDocument[]) {
  return [...documents].sort((left, right) => {
    const leftWeight = left.signer_scope === 'doctor' ? 0 : left.signer_scope === 'staff' ? 1 : 2;
    const rightWeight = right.signer_scope === 'doctor' ? 0 : right.signer_scope === 'staff' ? 1 : 2;
    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    return left.document_label.localeCompare(right.document_label, 'id-ID');
  });
}

async function openAuthenticatedPdf(printPath: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Izinkan popup browser untuk membuka preview dokumen.');
  }

  printWindow.document.write('<html><head><title>Menyiapkan dokumen...</title></head><body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;">Menyiapkan dokumen PDF...</body></html>');
  printWindow.document.close();

  try {
    const response = await api.get(printPath.replace(/^\/api/, ''), { responseType: 'blob' });
    const contentType = response.headers['content-type'] || 'application/pdf';
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType });
    const objectUrl = URL.createObjectURL(blob);
    printWindow.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

export function TTERequestSheet({ visitId, buttonClassName }: TTERequestSheetProps) {
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<TteVisitDocument[]>([]);
  const [employees, setEmployees] = useState<TteEmployeeOption[]>([]);
  const [visitNumber, setVisitNumber] = useState('');
  const [patientName, setPatientName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<SignTargetMode | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const canSignTTE = hasPermission('document_signatures.request') || hasPermission('document_signatures.approve');

  useEffect(() => {
    if (!open || !canSignTTE) {
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const [documentsResponse, employeesResponse] = await Promise.all([
          tteApi.getVisitDocuments(visitId),
          tteApi.getEmployees(),
        ]);

        if (cancelled) {
          return;
        }

        setDocuments(documentsResponse.data.data.documents || []);
        setVisitNumber(documentsResponse.data.data.visit_number || '');
        setPatientName(documentsResponse.data.data.patient_name || '');
        setEmployees(employeesResponse.data.data || []);
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        toast({
          variant: 'destructive',
          title: 'Gagal memuat data TTE',
          description: error.response?.data?.error || 'Daftar dokumen atau pegawai TTE tidak dapat dimuat.',
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [canSignTTE, open, toast, visitId]);

  useEffect(() => {
    if (!open) {
      setPickerOpen(false);
      setSignTarget(null);
      setSelectedEmployeeId('');
    }
  }, [open]);

  const employeeOptions = useMemo(
    () =>
      employees.map((emp) => ({
        value: String(emp.id),
        label: emp.full_name,
        description: [emp.profession, emp.employee_code, emp.license_number].filter(Boolean).join(' · ') || undefined,
        searchText: [emp.full_name, emp.profession, emp.employee_code, emp.license_number].filter(Boolean).join(' '),
      })),
    [employees],
  );

  const documentGroups = useMemo<TteDocumentGroup[]>(() => {
    const groupedDocuments = new Map<string, TteVisitDocument[]>();
    const documentGroupsList: TteDocumentGroup[] = [];

    documents.forEach((document) => {
      const pairedGroupKey = getPairedSupportingDocumentKey(document);
      if (!pairedGroupKey) {
        documentGroupsList.push({
          key: document.document_key,
          label: document.document_label,
          description: document.description,
          documents: [document],
        });
        return;
      }

      if (!groupedDocuments.has(pairedGroupKey)) {
        groupedDocuments.set(pairedGroupKey, []);
        documentGroupsList.push({
          key: pairedGroupKey,
          label: '',
          description: '',
          documents: groupedDocuments.get(pairedGroupKey) || [],
        });
      }

      groupedDocuments.get(pairedGroupKey)?.push(document);
    });

    return documentGroupsList.map((group) => {
      if (group.documents.length === 1 && group.key === group.documents[0].document_key) {
        return group;
      }

      const normalizedDocuments = sortGroupedDocuments(group.documents);
      return {
        key: group.key,
        label: getGroupedDocumentLabel(group.key, normalizedDocuments),
        description: getGroupedDocumentDescription(normalizedDocuments),
        documents: normalizedDocuments,
      };
    });
  }, [documents]);

  const unsignedDocuments = useMemo(
    () => documents.filter((doc) => doc.status !== 'signed'),
    [documents],
  );

  if (!canSignTTE) {
    return null;
  }

  const findMatchingEmployeeId = (document?: TteVisitDocument | null) => {
    if (!document || employees.length === 0) return '';

    if (document.preferred_signer_user_id) {
      const byUser = employees.find((emp) => emp.user_id === document.preferred_signer_user_id);
      if (byUser) return String(byUser.id);
    }

    const candidateName = (document.signer_name || document.preferred_signer_name || '').trim().toLowerCase();
    if (candidateName) {
      const exact = employees.find((emp) => emp.full_name.trim().toLowerCase() === candidateName);
      if (exact) return String(exact.id);
      const partial = employees.find(
        (emp) =>
          emp.full_name.trim().toLowerCase().includes(candidateName) ||
          candidateName.includes(emp.full_name.trim().toLowerCase()),
      );
      if (partial) return String(partial.id);
    }

    return '';
  };

  const openSignPickerForDocument = (document: TteVisitDocument) => {
    setSignTarget({ kind: 'single', document });
    setSelectedEmployeeId(findMatchingEmployeeId(document));
    setPickerOpen(true);
  };

  const openSignPickerForAll = () => {
    if (unsignedDocuments.length === 0) return;
    setSignTarget({ kind: 'all', documents: unsignedDocuments });
    setSelectedEmployeeId(findMatchingEmployeeId(unsignedDocuments[0]));
    setPickerOpen(true);
  };

  const handleConfirmSign = async () => {
    if (!signTarget) return;
    if (!selectedEmployeeId) {
      toast({
        variant: 'destructive',
        title: 'Pilih pegawai penandatangan',
        description: 'Pilih pegawai yang akan tercantum pada tanda tangan elektronik & QR validasi.',
      });
      return;
    }

    const employeeId = Number(selectedEmployeeId);
    const chosenEmp = employees.find((emp) => emp.id === employeeId);
    setSubmitting(true);

    try {
      if (signTarget.kind === 'single') {
        const response = await tteApi.sign({
          visit_id: visitId,
          document_key: signTarget.document.document_key,
          employee_id: employeeId,
        });
        const updatedDocument = response.data.data;
        setDocuments((current) =>
          current.map((item) => (item.document_key === updatedDocument.document_key ? updatedDocument : item)),
        );
        setPickerOpen(false);
        setSignTarget(null);
        setSelectedEmployeeId('');
        toast({
          variant: 'success',
          title: 'Dokumen berhasil di-TTE',
          description: `${updatedDocument.document_label} ditandatangani atas nama ${chosenEmp?.full_name || updatedDocument.signer_name}.`,
        });
      } else {
        let successCount = 0;
        let lastError = '';
        for (const doc of signTarget.documents) {
          try {
            const response = await tteApi.sign({
              visit_id: visitId,
              document_key: doc.document_key,
              employee_id: employeeId,
            });
            const updatedDocument = response.data.data;
            setDocuments((current) =>
              current.map((item) => (item.document_key === updatedDocument.document_key ? updatedDocument : item)),
            );
            successCount += 1;
          } catch (error: any) {
            lastError = error.response?.data?.error || 'Sebagian dokumen gagal di-TTE.';
          }
        }

        setPickerOpen(false);
        setSignTarget(null);
        setSelectedEmployeeId('');

        if (successCount > 0) {
          toast({
            variant: 'success',
            title: `${successCount} dokumen berhasil di-TTE`,
            description: lastError
              ? `Sebagian dokumen gagal: ${lastError}`
              : `Ditandatangani atas nama ${chosenEmp?.full_name || 'pegawai terpilih'}.`,
          });
        } else if (lastError) {
          toast({
            variant: 'destructive',
            title: 'Gagal melakukan TTE',
            description: lastError,
          });
        }
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal melakukan TTE',
        description: error.response?.data?.error || 'Dokumen tidak dapat ditandatangani.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreview = async (document: TteVisitDocument) => {
    if (!document.print_path) {
      return;
    }

    setPreviewingKey(document.document_key);
    try {
      await openAuthenticatedPdf(document.print_path);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal membuka preview dokumen',
        description: error.response?.data?.error || error.message || 'Preview PDF tidak tersedia.',
      });
    } finally {
      setPreviewingKey(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        className={cn('gap-1.5', buttonClassName)}
        onClick={() => setOpen(true)}
        title="Tanda Tangan Elektronik (TTE) dokumen"
      >
        <FileCheck2 className="h-4 w-4" />
      </Button>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[50vw]">
        <div className="flex min-h-full flex-col">
          <SheetHeader className="border-b border-border/70 px-6 py-5 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div>
                <SheetTitle>Tanda Tangan Elektronik (TTE)</SheetTitle>
                <SheetDescription className="mt-1">
                  {visitNumber ? `Visit ${visitNumber}` : 'Visit final'}{patientName ? ` · ${patientName}` : ''}. Klik tombol TTE lalu pilih pegawai penandatangan untuk langsung mengesahkan dokumen.
                </SheetDescription>
              </div>
              {!loading && unsignedDocuments.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 rounded-none"
                  onClick={openSignPickerForAll}
                  disabled={submitting}
                >
                  <Stamp className="h-4 w-4" />
                  TTE Semua ({unsignedDocuments.length})
                </Button>
              ) : null}
            </div>
          </SheetHeader>

          <div className="space-y-4 px-6 py-5">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : documentGroups.length === 0 ? (
              <Card className="rounded-none border-dashed border-border/70 shadow-none">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Tidak ada dokumen yang memenuhi syarat TTE pada visit ini.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {documentGroups.map((group) => (
                  <Card key={group.key} className="rounded-none border-border/70 shadow-none">
                    <CardContent className="space-y-3 px-4 py-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold tracking-tight">{group.label}</h3>
                        <p className="text-xs text-muted-foreground">{group.description}</p>
                      </div>

                      <div className="space-y-3">
                        {group.documents.map((document) => {
                          const isSigned = document.status === 'signed';
                          const displaySigner = document.signer_name || document.preferred_signer_name;

                          return (
                            <div key={document.document_key} className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium text-foreground">{document.signer_scope_label || document.document_label}</p>
                                  <Badge variant="outline" className={cn('rounded-none shadow-none', getStatusClassName(document.status))}>
                                    {document.status_label}
                                  </Badge>
                                </div>
                                {displaySigner ? (
                                  <p className="text-xs text-muted-foreground">
                                    Penandatangan: {displaySigner}
                                    {document.signed_at ? ` · Ditandatangani ${formatDateTime(document.signed_at)}` : ''}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 rounded-none"
                                  onClick={() => void handlePreview(document)}
                                  disabled={previewingKey === document.document_key || !document.print_path}
                                >
                                  {previewingKey === document.document_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                  Preview
                                </Button>
                                {isSigned ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 rounded-none border-emerald-300 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                    onClick={() => openSignPickerForDocument(document)}
                                    title="Ubah pegawai penandatangan TTE"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Ubah TTE
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="gap-1.5 rounded-none"
                                    onClick={() => openSignPickerForDocument(document)}
                                  >
                                    <Stamp className="h-4 w-4" />
                                    TTE
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <Dialog
          open={pickerOpen}
          onOpenChange={(nextOpen) => {
            if (!submitting) {
              setPickerOpen(nextOpen);
              if (!nextOpen) {
                setSignTarget(null);
                setSelectedEmployeeId('');
              }
            }
          }}
        >
          <DialogContent className="max-w-lg rounded-none border-border/70">
            <DialogHeader>
              <DialogTitle>Pilih Pegawai Penandatangan (TTE)</DialogTitle>
              <DialogDescription>
                {signTarget?.kind === 'single'
                  ? `Pilih pegawai yang menandatangani ${signTarget.document.document_label}. Validasi QR akan tercatat atas nama pegawai terpilih.`
                  : signTarget?.kind === 'all'
                    ? `Pilih pegawai yang menandatangani ${signTarget.documents.length} dokumen belum TTE. Validasi QR akan tercatat atas nama pegawai terpilih.`
                    : 'Pilih pegawai penandatangan dokumen.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-1">
              <label className="text-xs font-medium text-foreground">Pegawai Penandatangan</label>
              <SearchableSelect
                options={employeeOptions}
                value={selectedEmployeeId}
                onValueChange={setSelectedEmployeeId}
                placeholder="Cari & pilih pegawai..."
                searchPlaceholder="Ketik nama, profesi, atau kode pegawai..."
                emptyText="Pegawai tidak ditemukan."
                square
              />
              {employeeOptions.length === 0 ? (
                <p className="text-xs text-destructive">
                  Belum ada data pegawai aktif di master Pegawai.
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                onClick={() => setPickerOpen(false)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="gap-1.5 rounded-none"
                onClick={() => void handleConfirmSign()}
                disabled={!selectedEmployeeId || submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />}
                {submitting ? 'Memproses...' : 'Setujui & TTE'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
