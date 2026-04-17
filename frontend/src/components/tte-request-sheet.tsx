import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/usePermission';
import { api, tteApi, type TteSigner, type TteVisitDocument } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

function hasTTEBypassRole(roleName?: string | null) {
  const normalized = (roleName || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  return (
    normalized === 'admin' ||
    normalized === 'administrator' ||
    normalized === 'sysadmin' ||
    normalized === 'systemadmin' ||
    normalized === 'systemadministrator' ||
    normalized === 'superadmin' ||
    normalized === 'superadministrator'
  );
}

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
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<TteVisitDocument[]>([]);
  const [signers, setSigners] = useState<TteSigner[]>([]);
  const [visitNumber, setVisitNumber] = useState('');
  const [patientName, setPatientName] = useState('');
  const [requestingKey, setRequestingKey] = useState<string | null>(null);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSignerId, setSelectedSignerId] = useState('');
  const [activeDocument, setActiveDocument] = useState<TteVisitDocument | null>(null);

  const canRequest = hasPermission('document_signatures.request');
  const canBypassDoctorSignerScope = useMemo(() => hasTTEBypassRole(user?.role?.name), [user?.role?.name]);

  useEffect(() => {
    if (!open || !canRequest) {
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const [documentsResponse, signersResponse] = await Promise.all([
          tteApi.getVisitDocuments(visitId),
          tteApi.getSigners(),
        ]);

        if (cancelled) {
          return;
        }

        setDocuments(documentsResponse.data.data.documents || []);
        setVisitNumber(documentsResponse.data.data.visit_number || '');
        setPatientName(documentsResponse.data.data.patient_name || '');
        setSigners(signersResponse.data.data || []);
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        toast({
          variant: 'destructive',
          title: 'Gagal memuat pengajuan TTE',
          description: error.response?.data?.error || 'Daftar dokumen TTE tidak dapat dimuat.',
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
  }, [canRequest, open, toast, visitId]);

  useEffect(() => {
    if (!open) {
      setPickerOpen(false);
      setActiveDocument(null);
      setSelectedSignerId('');
    }
  }, [open]);

  const signerOptions = useMemo(
    () => signers.map((signer) => ({ value: String(signer.id), label: `${signer.full_name} (${signer.email})` })),
    [signers]
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

  const getSignerOptionsForDocument = (document?: TteVisitDocument | null) => {
    if (canBypassDoctorSignerScope) {
      return signerOptions;
    }

    if (!document) {
      return signerOptions;
    }

    if (document.signer_candidates && document.signer_candidates.length > 0) {
      return document.signer_candidates.map((signer) => ({ value: String(signer.id), label: `${signer.full_name} (${signer.email})` }));
    }

    if (document.signer_scope === 'doctor') {
      return [];
    }

    return signerOptions;
  };

  const activeSignerOptions = getSignerOptionsForDocument(activeDocument);

  if (!canRequest) {
    return null;
  }

  const submitRequest = async (document: TteVisitDocument, signerId: string) => {
    if (!signerId) {
      toast({
        variant: 'destructive',
        title: 'Pilih user tujuan TTE',
        description: 'Pilih dulu user yang akan dimintai ACC dokumen.',
      });
      return;
    }

    setRequestingKey(document.document_key);
    try {
      const response = await tteApi.request({
        visit_id: visitId,
        document_key: document.document_key,
        requested_to_user_id: Number(signerId),
        notes: '',
      });
      const updatedDocument = response.data.data;
      setDocuments((current) => current.map((item) => item.document_key === updatedDocument.document_key ? updatedDocument : item));
      setPickerOpen(false);
      setActiveDocument(null);
      setSelectedSignerId('');
      toast({
        variant: 'success',
        title: 'Request TTE dikirim',
        description: `${updatedDocument.document_label} berhasil diajukan.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal mengirim request TTE',
        description: error.response?.data?.error || 'Request TTE tidak dapat diproses.',
      });
    } finally {
      setRequestingKey(null);
    }
  };

  const openRequestPicker = (document: TteVisitDocument) => {
    const targetOptions = getSignerOptionsForDocument(document);
    const preferredSignerId = document.preferred_signer_user_id ? String(document.preferred_signer_user_id) : '';
    const hasPreferredSigner = targetOptions.some((option) => option.value === preferredSignerId);

    setActiveDocument(document);
    setSelectedSignerId(hasPreferredSigner ? preferredSignerId : '');
    setPickerOpen(true);
  };

  const handleRequest = async (document: TteVisitDocument) => {
    if (document.signer_scope === 'doctor' || document.signer_scope === 'staff') {
      openRequestPicker(document);
      return;
    }

    if (document.preferred_signer_user_id) {
      await submitRequest(document, String(document.preferred_signer_user_id));
      return;
    }

    openRequestPicker(document);
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
        title="Ajukan TTE dokumen visit final"
      >
        <FileText className="h-4 w-4" />
      </Button>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[50vw]">
        <div className="flex min-h-full flex-col">
          <SheetHeader className="border-b border-border/70 px-6 py-5 text-left">
            <SheetTitle>Pengajuan TTE Internal</SheetTitle>
            <SheetDescription>
              {visitNumber ? `Visit ${visitNumber}` : 'Visit final'}{patientName ? ` · ${patientName}` : ''}. Pemilihan user TTD mengikuti tipe dokumen, dan dokumen dokter akan memprioritaskan akun yang tertaut lewat master pegawai.
            </SheetDescription>
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
                          const isPending = document.status === 'pending';
                          const isSigned = document.status === 'signed';
                          const canSubmit = !isPending && !isSigned;

                          return (
                            <div key={document.document_key} className="flex flex-wrap items-start justify-between gap-3 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium text-foreground">{document.signer_scope_label || document.document_label}</p>
                                  <Badge variant="outline" className={cn('rounded-none shadow-none', getStatusClassName(document.status))}>
                                    {document.status_label}
                                  </Badge>
                                </div>
                                {document.preferred_signer_name ? (
                                  <p className="text-xs text-muted-foreground">Prioritas signer: {document.preferred_signer_name}</p>
                                ) : null}
                                {document.signer_resolution_note ? (
                                  <p className="text-xs text-amber-700">{document.signer_resolution_note}</p>
                                ) : null}
                                {document.signer_name ? (
                                  <p className="text-xs text-muted-foreground">
                                    Signer: {document.signer_name}
                                    {document.signed_at ? ` · Signed ${formatDateTime(document.signed_at)}` : document.requested_at ? ` · Requested ${formatDateTime(document.requested_at)}` : ''}
                                  </p>
                                ) : null}
                                {document.rejection_reason ? (
                                  <p className="text-xs text-rose-700">Alasan: {document.rejection_reason}</p>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-none"
                                  onClick={() => void handlePreview(document)}
                                  disabled={previewingKey === document.document_key || !document.print_path}
                                >
                                  {previewingKey === document.document_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                  Preview
                                </Button>
                                {canSubmit ? (
                                  <Button
                                    type="button"
                                    className="gap-1.5 rounded-none"
                                    onClick={() => void handleRequest(document)}
                                    disabled={requestingKey === document.document_key}
                                  >
                                    {requestingKey === document.document_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    {document.signer_scope === 'doctor' || document.signer_scope === 'staff' ? 'Pilih TTD' : 'Kirim Request'}
                                  </Button>
                                ) : null}
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

        <Dialog open={pickerOpen} onOpenChange={(nextOpen) => {
          setPickerOpen(nextOpen);
          if (!nextOpen) {
            setActiveDocument(null);
            setSelectedSignerId('');
          }
        }}>
          <DialogContent className="max-w-lg rounded-none border-border/70">
            <DialogHeader>
              <DialogTitle>{activeDocument?.signer_scope_label || 'Pilih User TTD'}</DialogTitle>
              <DialogDescription>
                {activeDocument ? `Pilih user tujuan TTE untuk ${activeDocument.document_label}.` : 'Pilih user tujuan TTE dokumen.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {activeDocument?.signer_scope === 'doctor' ? (
                <p className="text-sm text-muted-foreground">
                  Daftar ini sudah dibatasi ke user dokter yang terkait langsung dengan dokumen dan memiliki akses ACC TTE.
                </p>
              ) : null}

              {activeDocument?.signer_scope === 'staff' ? (
                <p className="text-sm text-muted-foreground">
                  Pilih petugas pengisi hasil yang akan menerima request TTE untuk dokumen ini.
                </p>
              ) : null}

              {activeDocument?.signer_resolution_note ? (
                <p className="text-sm text-amber-700">
                  {activeDocument.signer_resolution_note}
                </p>
              ) : null}

              <SearchableSelect
                options={activeSignerOptions}
                value={selectedSignerId}
                onValueChange={setSelectedSignerId}
                placeholder={activeDocument?.signer_scope === 'doctor' ? 'Pilih dokter penandatangan' : activeDocument?.signer_scope === 'staff' ? 'Pilih petugas penandatangan' : 'Pilih user ACC TTE'}
                searchPlaceholder="Cari user..."
                square
              />

              {activeDocument?.preferred_signer_name && !selectedSignerId ? (
                <p className="text-xs text-muted-foreground">
                  Prioritas dokumen ini: {activeDocument.preferred_signer_name}.
                </p>
              ) : null}

              {activeSignerOptions.length === 0 ? (
                <p className="text-sm text-rose-700">
                  Tidak ada user yang tersedia untuk target TTD dokumen ini.
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => setPickerOpen(false)}>
                Batal
              </Button>
              <Button
                type="button"
                className="gap-1.5 rounded-none"
                onClick={() => activeDocument ? void submitRequest(activeDocument, selectedSignerId) : undefined}
                disabled={!activeDocument || !selectedSignerId || requestingKey === activeDocument.document_key}
              >
                {activeDocument && requestingKey === activeDocument.document_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Kirim Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}