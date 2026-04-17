import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight, FileText, Loader2, UserRoundSearch } from "lucide-react";
import {
  billingApi,
  informedConsentsApi,
  medicalRecordsApi,
  odontogramApi,
  patientsApi,
  type InformedConsent,
  type Invoice,
  type MedicalRecord,
  type OdontogramEntry,
  type Patient,
  type Visit,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { setPageTitle } from "@/lib/page-title";
import { formatDate, formatDateTime } from "@/pages/emr/utils";
import { isAxiosError } from "axios";
import { cn } from "@/lib/utils";
import {
  PatientDetailItem,
  PatientPageShell,
  getPatientAddressLabel,
  getPatientAgeLabel,
  getPatientEmergencyLabel,
  getPatientGenderLabel,
  getPatientInsuranceLabel,
} from "@/pages/patients/shared";

const STATUS_LABEL: Record<string, string> = {
  registered: "Terdaftar",
  in_progress: "Dalam Konsultasi",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const QUEUE_LABEL: Record<string, string> = {
  waiting: "Menunggu",
  in_consultation: "Konsultasi",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

type PatientSearchDetailTab =
  | "detail"
  | "pembayaran"
  | "kunjungan"
  | "rekam-medis";

type MedicalRecordPdfNodeSourceType =
  | "initial-assessment"
  | "surat"
  | "prescription"
  | "procedure"
  | "laboratory-ticket"
  | "laboratory-result"
  | "radiology-ticket"
  | "radiology-result"
  | "informed-consent"
  | "odontogram";

type MedicalRecordPdfNode = {
  key: string;
  title: string;
  sourceType: MedicalRecordPdfNodeSourceType;
  visitId: number;
  visitNumber: string;
  recordDate: string;
  statusLabel: string;
  primaryMedicalRecordId?: number;
  informedConsentId?: number;
  odontogramEntryId?: number;
  recordIds: number[];
  entryGroupKey?: string;
  sheetKey?: "pengkajian-awal-medis" | "pengkajian-awal-gigi";
  timestamp: number;
};

type MedicalRecordVisitGroup = {
  visitId: number;
  visitNumber: string;
  visitDate: string;
  polyclinicName: string;
  pdfNodes: MedicalRecordPdfNode[];
  latestRecordTime: number;
};

const SEARCH_FILTER_KEYS = [
  "q",
  "parent_name",
  "birth_date",
  "address",
  "rt",
  "rw",
  "kelurahan",
  "kecamatan",
  "city",
  "province",
];
const DETAIL_TAB_VALUES: PatientSearchDetailTab[] = [
  "detail",
  "pembayaran",
  "kunjungan",
  "rekam-medis",
];
const SURAT_TYPE_LABELS: Record<string, string> = {
  "surat-sakit": "Surat Sakit",
  "surat-sehat": "Surat Sehat",
  "surat-mcu": "Surat MCU",
  "surat-buta-warna": "Surat Buta Warna",
  "surat-keterangan": "Surat Keterangan",
};

function resolveDetailTab(value: string | null): PatientSearchDetailTab {
  if (!value) {
    return "detail";
  }

  if (DETAIL_TAB_VALUES.includes(value as PatientSearchDetailTab)) {
    return value as PatientSearchDetailTab;
  }

  return "detail";
}

export default function PatientSearchDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [odontogramEntries, setOdontogramEntries] = useState<OdontogramEntry[]>(
    [],
  );
  const [matchedPatients, setMatchedPatients] = useState<Patient[]>([]);
  const [loadingMatchedPatients, setLoadingMatchedPatients] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openingPdfNodeKey, setOpeningPdfNodeKey] = useState<string | null>(
    null,
  );
  const [selectedMedicalRecordNodeKey, setSelectedMedicalRecordNodeKey] =
    useState<string | null>(null);
  const [selectedMedicalRecordPdfUrl, setSelectedMedicalRecordPdfUrl] =
    useState<string | null>(null);
  const [
    selectedMedicalRecordPdfLoadedNodeKey,
    setSelectedMedicalRecordPdfLoadedNodeKey,
  ] = useState<string | null>(null);
  const [selectedMedicalRecordPdfError, setSelectedMedicalRecordPdfError] =
    useState<string | null>(null);
  const [collapsedVisitNodes, setCollapsedVisitNodes] = useState<
    Record<number, boolean>
  >({});
  const [activeTab, setActiveTab] = useState<PatientSearchDetailTab>(() =>
    resolveDetailTab(searchParams.get("tab")),
  );

  const listFilterParams = useMemo(() => {
    const params = new URLSearchParams();

    SEARCH_FILTER_KEYS.forEach((key) => {
      const value = (searchParams.get(key) || "").trim();
      if (!value) {
        return;
      }
      params.set(key, value);
    });

    return params;
  }, [searchParams]);

  const listFilterQuery = useMemo(
    () => listFilterParams.toString(),
    [listFilterParams],
  );
  const hasListFilters = listFilterQuery !== "";

  const backUrl = useMemo(() => {
    return listFilterQuery
      ? `/patient-search?${listFilterQuery}`
      : "/patient-search";
  }, [listFilterQuery]);

  useEffect(() => {
    const nextTab = resolveDetailTab(searchParams.get("tab"));
    setActiveTab((currentTab) =>
      currentTab === nextTab ? currentTab : nextTab,
    );
  }, [searchParams]);

  const handleTabChange = (nextTabValue: string) => {
    const resolvedTab = resolveDetailTab(nextTabValue);
    setActiveTab(resolvedTab);

    const nextParams = new URLSearchParams(searchParams);
    if (resolvedTab === "detail") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", resolvedTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const buildDetailUrl = (
    patientId: number,
    tab: PatientSearchDetailTab = activeTab,
  ) => {
    const params = new URLSearchParams(listFilterParams);
    if (tab === "detail") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    return `/patient-search/${patientId}${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const normalizeRecordLabel = (value?: string | null) => {
    if (!value) {
      return "-";
    }

    return value
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const inferSuratTypeFromEntryGroupKey = (entryGroupKey?: string | null) => {
    const normalized = String(entryGroupKey || "")
      .trim()
      .toLowerCase();
    if (!normalized) return "surat-keterangan";
    if (normalized === "surat-sakit" || normalized.startsWith("surat-sakit-"))
      return "surat-sakit";
    if (normalized === "surat-sehat" || normalized.startsWith("surat-sehat-"))
      return "surat-sehat";
    if (normalized === "surat-mcu" || normalized.startsWith("surat-mcu-"))
      return "surat-mcu";
    if (
      normalized === "surat-buta-warna" ||
      normalized.startsWith("surat-buta-warna-")
    )
      return "surat-buta-warna";
    return "surat-keterangan";
  };

  const resolveInitialAssessmentSheetFromRecord = (record: MedicalRecord) => {
    const normalizedSheet = String(record.sheet_key || "")
      .trim()
      .toLowerCase();
    if (
      normalizedSheet === "pengkajian-awal-medis" ||
      normalizedSheet === "pengkajian-awal-gigi"
    ) {
      return normalizedSheet as "pengkajian-awal-medis" | "pengkajian-awal-gigi";
    }

    const normalizedEntryGroupKey = String(record.entry_group_key || "")
      .trim()
      .toLowerCase();
    if (normalizedEntryGroupKey.startsWith("pengkajian-gigi")) {
      return "pengkajian-awal-gigi";
    }
    if (normalizedEntryGroupKey.startsWith("pengkajian-awal")) {
      return "pengkajian-awal-medis";
    }

    const normalizedSection = String(record.section_type || "")
      .trim()
      .toLowerCase();
    if (
      normalizedSection === "anamnesis" ||
      normalizedSection === "physical_exam" ||
      normalizedSection === "assessment"
    ) {
      return "pengkajian-awal-medis";
    }

    return undefined;
  };

  const resolvePdfNodeSourceType = (
    record: MedicalRecord,
  ): MedicalRecordPdfNodeSourceType | null => {
    const normalizedStatus = String(record.status || "")
      .trim()
      .toLowerCase();
    if (normalizedStatus === "cancelled") {
      return null;
    }

    const normalizedSheet = String(record.sheet_key || "")
      .trim()
      .toLowerCase();
    if (normalizedSheet === "surat") {
      return "surat";
    }

    if (resolveInitialAssessmentSheetFromRecord(record)) {
      return "initial-assessment";
    }

    const normalizedSection = String(record.section_type || "")
      .trim()
      .toLowerCase();
    if (normalizedSection === "prescription") {
      return "prescription";
    }
    if (normalizedSection === "procedure") {
      return "procedure";
    }
    if (normalizedSection === "laboratory") {
      const workflow = String(record.laboratory_workflow_status || "")
        .trim()
        .toLowerCase();
      if (workflow === "completed") {
        return "laboratory-result";
      }
      if (workflow === "ordered" || workflow === "preparing") {
        return "laboratory-ticket";
      }
      return null;
    }
    if (normalizedSection === "radiology") {
      const workflow = String(record.radiology_workflow_status || "")
        .trim()
        .toLowerCase();
      if (workflow === "completed") {
        return "radiology-result";
      }
      if (workflow === "ordered" || workflow === "preparing") {
        return "radiology-ticket";
      }
      return null;
    }

    return null;
  };

  const getMedicalRecordNodeTitle = (
    record: MedicalRecord,
    sourceType: MedicalRecordPdfNodeSourceType,
    entryGroupKey?: string,
  ) => {
    if (sourceType === "surat") {
      return (
        SURAT_TYPE_LABELS[inferSuratTypeFromEntryGroupKey(entryGroupKey)] ||
        "Surat Keterangan"
      );
    }

    if (sourceType === "initial-assessment") {
      const resolvedSheet = resolveInitialAssessmentSheetFromRecord(record);
      return resolvedSheet === "pengkajian-awal-gigi"
        ? "Pengkajian Awal Gigi"
        : "Pengkajian Awal Medis";
    }

    if (sourceType === "prescription") {
      return "Prescription";
    }
    if (sourceType === "procedure") {
      return "Tindakan";
    }
    if (sourceType === "laboratory-result") {
      return "Laboratory Result";
    }
    if (sourceType === "laboratory-ticket") {
      return "Laboratory Ticket";
    }
    if (sourceType === "radiology-result") {
      return "Radiology Result";
    }
    if (sourceType === "radiology-ticket") {
      return "Radiology Ticket";
    }

    return normalizeRecordLabel(record.sheet_key || record.section_type);
  };

  const getPdfNodeIdentifierLabel = (node: MedicalRecordPdfNode) => {
    if (node.sourceType === "informed-consent") {
      return `IC#${node.informedConsentId || "-"}`;
    }
    if (node.sourceType === "odontogram") {
      return `ODG#${node.odontogramEntryId || "-"}`;
    }

    const primaryRecordId = node.primaryMedicalRecordId;
    if (!primaryRecordId) {
      return "MR#-";
    }

    if (node.recordIds.length > 1) {
      return `MR#${primaryRecordId} (+${node.recordIds.length - 1})`;
    }

    return `MR#${primaryRecordId}`;
  };

  const medicalRecordGroups = useMemo<MedicalRecordVisitGroup[]>(() => {
    const sortedRecords = [...medicalRecords].sort((a, b) => {
      const firstDate = new Date(a.record_date || a.created_at || "").getTime();
      const secondDate = new Date(b.record_date || b.created_at || "").getTime();
      return secondDate - firstDate;
    });

    const grouped = new Map<
      number,
      {
        visitId: number;
        visitNumber: string;
        visitDate: string;
        polyclinicName: string;
        records: MedicalRecord[];
        informedConsents: InformedConsent[];
        latestRecordTime: number;
      }
    >();

    visits.forEach((visit) => {
      const visitId = Number(visit.id || 0);
      if (!visitId) {
        return;
      }

      const visitTime = new Date(visit.visit_date || "").getTime();
      grouped.set(visitId, {
        visitId,
        visitNumber: visit.visit_number || `Visit #${visitId}`,
        visitDate: visit.visit_date || "",
        polyclinicName: visit.polyclinic?.name || "-",
        records: [],
        informedConsents: [],
        latestRecordTime: Number.isFinite(visitTime) ? visitTime : 0,
      });
    });

    sortedRecords.forEach((record) => {
      const visitId = Number(record.visit_id || 0);
      if (!visitId) {
        return;
      }

      const recordTime = new Date(record.record_date || record.created_at || "").getTime();
      const recordVisitNumber = record.visit?.visit_number || `Visit #${visitId}`;

      if (!grouped.has(visitId)) {
        grouped.set(visitId, {
          visitId,
          visitNumber: recordVisitNumber,
          visitDate: record.visit?.visit_date || record.record_date || "",
          polyclinicName: record.visit?.polyclinic?.name || "-",
          records: [],
          informedConsents: [],
          latestRecordTime: Number.isFinite(recordTime) ? recordTime : 0,
        });
      }

      const targetGroup = grouped.get(visitId)!;
      targetGroup.records.push(record);
      if (record.informed_consents?.length) {
        targetGroup.informedConsents.push(...record.informed_consents);
      }
      if (Number.isFinite(recordTime) && recordTime > targetGroup.latestRecordTime) {
        targetGroup.latestRecordTime = recordTime;
      }
    });

    const visitGroups = Array.from(grouped.values())
      .map((group) => {
        const nodeMap = new Map<string, MedicalRecordPdfNode>();

        group.records.forEach((record) => {
          const sourceType = resolvePdfNodeSourceType(record);
          if (!sourceType) {
            return;
          }

          const entryGroupKey = String(record.entry_group_key || "").trim();
          const shouldGroupByEntry =
            sourceType === "surat" || sourceType === "initial-assessment";
          const nodeKey = shouldGroupByEntry
            ? `visit-${group.visitId}::${sourceType}::${entryGroupKey || `record-${record.id}`}`
            : `visit-${group.visitId}::${sourceType}::record-${record.id}`;
          const timestamp = new Date(record.record_date || record.created_at || "").getTime();
          const safeTimestamp = Number.isFinite(timestamp) ? timestamp : 0;

          const currentNode = nodeMap.get(nodeKey);
          if (!currentNode) {
            nodeMap.set(nodeKey, {
              key: nodeKey,
              title: getMedicalRecordNodeTitle(record, sourceType, entryGroupKey),
              sourceType,
              visitId: group.visitId,
              visitNumber: group.visitNumber,
              recordDate: record.record_date || record.created_at || group.visitDate,
              statusLabel:
                sourceType === "laboratory-result" ||
                sourceType === "laboratory-ticket"
                  ? normalizeRecordLabel(record.laboratory_workflow_status || "-")
                  : sourceType === "radiology-result" ||
                      sourceType === "radiology-ticket"
                    ? normalizeRecordLabel(record.radiology_workflow_status || "-")
                    : normalizeRecordLabel(record.status || "Draft"),
              primaryMedicalRecordId: record.id,
              recordIds: [record.id],
              entryGroupKey: entryGroupKey || undefined,
              sheetKey:
                sourceType === "initial-assessment"
                  ? resolveInitialAssessmentSheetFromRecord(record)
                  : undefined,
              timestamp: safeTimestamp,
            });
            return;
          }

          if (!currentNode.recordIds.includes(record.id)) {
            currentNode.recordIds.push(record.id);
          }

          if (safeTimestamp >= currentNode.timestamp) {
            currentNode.timestamp = safeTimestamp;
            currentNode.primaryMedicalRecordId = record.id;
            currentNode.recordDate = record.record_date || record.created_at || group.visitDate;
            currentNode.statusLabel =
              sourceType === "laboratory-result" ||
              sourceType === "laboratory-ticket"
                ? normalizeRecordLabel(record.laboratory_workflow_status || "-")
                : sourceType === "radiology-result" ||
                    sourceType === "radiology-ticket"
                  ? normalizeRecordLabel(record.radiology_workflow_status || "-")
                  : normalizeRecordLabel(record.status || "Draft");
            currentNode.entryGroupKey = entryGroupKey || currentNode.entryGroupKey;
            currentNode.title = getMedicalRecordNodeTitle(
              record,
              sourceType,
              entryGroupKey || currentNode.entryGroupKey,
            );
            if (sourceType === "initial-assessment") {
              currentNode.sheetKey = resolveInitialAssessmentSheetFromRecord(record);
            }
          }
        });

        const consentMap = new Map<number, InformedConsent>();
        group.informedConsents.forEach((consent) => {
          if (consent?.id) {
            consentMap.set(consent.id, consent);
          }
        });

        consentMap.forEach((consent) => {
          const relatedRecord = group.records.find(
            (record) => Number(record.id) === Number(consent.medical_record_id),
          );
          const consentTimestamp = new Date(
            consent.consent_date ||
              consent.updated_at ||
              consent.created_at ||
              relatedRecord?.record_date ||
              group.visitDate ||
              "",
          ).getTime();
          const safeConsentTimestamp = Number.isFinite(consentTimestamp)
            ? consentTimestamp
            : 0;

          nodeMap.set(`visit-${group.visitId}::informed-consent::${consent.id}`, {
            key: `visit-${group.visitId}::informed-consent::${consent.id}`,
            title: consent.action_name?.trim()
              ? `Informed Consent - ${consent.action_name.trim()}`
              : "Informed Consent",
            sourceType: "informed-consent",
            visitId: group.visitId,
            visitNumber: group.visitNumber,
            recordDate:
              consent.consent_date ||
              consent.updated_at ||
              consent.created_at ||
              relatedRecord?.record_date ||
              group.visitDate,
            statusLabel: normalizeRecordLabel(
              consent.patient_decision || "Consent",
            ),
            primaryMedicalRecordId: relatedRecord?.id || consent.medical_record_id,
            informedConsentId: consent.id,
            recordIds: relatedRecord?.id ? [relatedRecord.id] : [],
            timestamp: safeConsentTimestamp,
          });
        });

        odontogramEntries
          .filter(
            (entry) =>
              Number(entry.visit_id) === Number(group.visitId) &&
              String(entry.status || "").trim().toLowerCase() !== "cancelled",
          )
          .forEach((entry) => {
            const entryTimestamp = new Date(
              entry.updated_at || entry.created_at || group.visitDate || "",
            ).getTime();
            const safeEntryTimestamp = Number.isFinite(entryTimestamp)
              ? entryTimestamp
              : 0;

            nodeMap.set(`visit-${group.visitId}::odontogram::${entry.id}`, {
              key: `visit-${group.visitId}::odontogram::${entry.id}`,
              title: "Odontogram",
              sourceType: "odontogram",
              visitId: group.visitId,
              visitNumber: group.visitNumber,
              recordDate: entry.updated_at || entry.created_at || group.visitDate,
              statusLabel: normalizeRecordLabel(entry.status || "Draft"),
              odontogramEntryId: entry.id,
              recordIds: [],
              timestamp: safeEntryTimestamp,
            });
          });

        const pdfNodes = Array.from(nodeMap.values()).sort(
          (a, b) => b.timestamp - a.timestamp,
        );
        if (pdfNodes.length === 0) {
          return null;
        }

        const latestNodeTime = pdfNodes[0]?.timestamp || 0;
        return {
          visitId: group.visitId,
          visitNumber: group.visitNumber,
          visitDate: group.visitDate,
          polyclinicName: group.polyclinicName,
          pdfNodes,
          latestRecordTime: Math.max(group.latestRecordTime, latestNodeTime),
        };
      })
      .filter((group): group is MedicalRecordVisitGroup => Boolean(group));

    return visitGroups.sort((a, b) => b.latestRecordTime - a.latestRecordTime);
  }, [medicalRecords, odontogramEntries, visits]);

  const totalMedicalRecordPdfNodes = useMemo(
    () =>
      medicalRecordGroups.reduce(
        (accumulator, group) => accumulator + group.pdfNodes.length,
        0,
      ),
    [medicalRecordGroups],
  );

  const selectedMedicalRecordNode = useMemo(() => {
    if (!selectedMedicalRecordNodeKey) {
      return null;
    }

    for (const group of medicalRecordGroups) {
      const node = group.pdfNodes.find(
        (candidate) => candidate.key === selectedMedicalRecordNodeKey,
      );
      if (node) {
        return node;
      }
    }

    return null;
  }, [medicalRecordGroups, selectedMedicalRecordNodeKey]);

  const toggleVisitNode = (visitId: number) => {
    setCollapsedVisitNodes((current) => ({
      ...current,
      [visitId]: !current[visitId],
    }));
  };

  useEffect(() => {
    if (medicalRecordGroups.length === 0) {
      setSelectedMedicalRecordNodeKey(null);
      return;
    }

    const isSelectedStillAvailable = medicalRecordGroups.some((group) =>
      group.pdfNodes.some((node) => node.key === selectedMedicalRecordNodeKey),
    );
    if (isSelectedStillAvailable) {
      return;
    }

    const firstNode = medicalRecordGroups[0]?.pdfNodes[0];
    setSelectedMedicalRecordNodeKey(firstNode?.key || null);
  }, [medicalRecordGroups, selectedMedicalRecordNodeKey]);

  useEffect(() => {
    setCollapsedVisitNodes((current) => {
      const next: Record<number, boolean> = {};

      medicalRecordGroups.forEach((group) => {
        next[group.visitId] = current[group.visitId] ?? false;
      });

      return next;
    });
  }, [medicalRecordGroups]);

  useEffect(() => {
    return () => {
      if (selectedMedicalRecordPdfUrl) {
        URL.revokeObjectURL(selectedMedicalRecordPdfUrl);
      }
    };
  }, [selectedMedicalRecordPdfUrl]);

  useEffect(() => {
    if (!hasListFilters) {
      setMatchedPatients([]);
      setLoadingMatchedPatients(false);
      return;
    }

    let isCurrent = true;

    const loadMatchedPatients = async () => {
      setLoadingMatchedPatients(true);
      try {
        const requestParams = new URLSearchParams(listFilterParams);
        requestParams.set("page", "1");
        requestParams.set("per_page", "30");

        const response = await patientsApi.getAll(requestParams.toString());
        if (!isCurrent) {
          return;
        }

        setMatchedPatients(response.data.data || []);
      } catch {
        if (!isCurrent) {
          return;
        }
        setMatchedPatients([]);
      } finally {
        if (isCurrent) {
          setLoadingMatchedPatients(false);
        }
      }
    };

    void loadMatchedPatients();

    return () => {
      isCurrent = false;
    };
  }, [hasListFilters, listFilterParams]);

  const fetchMedicalRecordPdfBlob = useCallback(
    async (node: MedicalRecordPdfNode) => {
      let response: any;

      if (node.sourceType === "surat") {
        response = await medicalRecordsApi.printSuratEntry(node.visitId, {
          entryGroupKey: node.entryGroupKey,
          recordIds: node.recordIds,
          autoPrint: false,
        });
      } else if (node.sourceType === "initial-assessment") {
        response = await medicalRecordsApi.printInitialAssessmentEntry(
          node.visitId,
          {
            entryGroupKey: node.entryGroupKey,
            recordIds: node.recordIds,
            sheetKey: node.sheetKey,
            autoPrint: false,
          },
        );
      } else if (node.sourceType === "prescription") {
        if (!node.primaryMedicalRecordId) {
          throw new Error("ID rekam medis prescription tidak tersedia.");
        }
        response = await medicalRecordsApi.printPrescriptionOrder(
          node.primaryMedicalRecordId,
        );
      } else if (node.sourceType === "procedure") {
        if (!node.primaryMedicalRecordId) {
          throw new Error("ID rekam medis tindakan tidak tersedia.");
        }
        response = await medicalRecordsApi.printProcedureRecord(
          node.primaryMedicalRecordId,
        );
      } else if (node.sourceType === "laboratory-result") {
        if (!node.primaryMedicalRecordId) {
          throw new Error("ID rekam medis laboratorium tidak tersedia.");
        }
        response = await medicalRecordsApi.printLaboratoryOrderResult(
          node.primaryMedicalRecordId,
        );
      } else if (node.sourceType === "laboratory-ticket") {
        if (!node.primaryMedicalRecordId) {
          throw new Error("ID rekam medis laboratorium tidak tersedia.");
        }
        response = await medicalRecordsApi.printLaboratoryOrderTicket(
          node.primaryMedicalRecordId,
        );
      } else if (node.sourceType === "radiology-result") {
        if (!node.primaryMedicalRecordId) {
          throw new Error("ID rekam medis radiology tidak tersedia.");
        }
        response = await medicalRecordsApi.printRadiologyOrderResult(
          node.primaryMedicalRecordId,
        );
      } else if (node.sourceType === "radiology-ticket") {
        if (!node.primaryMedicalRecordId) {
          throw new Error("ID rekam medis radiology tidak tersedia.");
        }
        response = await medicalRecordsApi.printRadiologyOrderTicket(
          node.primaryMedicalRecordId,
        );
      } else if (node.sourceType === "informed-consent") {
        if (!node.informedConsentId) {
          throw new Error("ID informed consent tidak tersedia.");
        }
        response = await informedConsentsApi.print(node.informedConsentId);
      } else if (node.sourceType === "odontogram") {
        if (!node.odontogramEntryId) {
          throw new Error("ID odontogram tidak tersedia.");
        }
        response = await odontogramApi.print(node.odontogramEntryId);
      } else {
        throw new Error("Jenis dokumen belum didukung.");
      }

      const contentType = response.headers["content-type"] || "application/pdf";
      return response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: contentType });
    },
    [],
  );

  const resolveBlobApiErrorMessage = useCallback(
    async (error: unknown, fallbackMessage: string) => {
      if (!isAxiosError(error)) {
        return fallbackMessage;
      }

      const responseData = error.response?.data;
      if (typeof responseData === "string") {
        return responseData || fallbackMessage;
      }

      if (responseData instanceof Blob) {
        try {
          const responseText = (await responseData.text()).trim();
          if (!responseText) {
            return fallbackMessage;
          }

          try {
            const parsed = JSON.parse(responseText) as { error?: string };
            if (typeof parsed.error === "string" && parsed.error.trim() !== "") {
              return parsed.error;
            }
          } catch {
            return responseText;
          }
        } catch {
          return fallbackMessage;
        }
      }

      if (
        responseData &&
        typeof responseData === "object" &&
        "error" in (responseData as Record<string, unknown>)
      ) {
        const backendError = (responseData as { error?: unknown }).error;
        if (typeof backendError === "string" && backendError.trim() !== "") {
          return backendError;
        }
      }

      return fallbackMessage;
    },
    [],
  );

  const loadMedicalRecordPdfForViewer = useCallback(
    async (node: MedicalRecordPdfNode) => {
      setOpeningPdfNodeKey(node.key);
      setSelectedMedicalRecordPdfError(null);

      try {
        const blob = await fetchMedicalRecordPdfBlob(node);
        const blobUrl = URL.createObjectURL(blob);

        setSelectedMedicalRecordPdfUrl((currentUrl) => {
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }
          return blobUrl;
        });
        setSelectedMedicalRecordPdfLoadedNodeKey(node.key);
      } catch (error: unknown) {
        const errorMessage = await resolveBlobApiErrorMessage(
          error,
          "PDF rekam medis belum dapat dibuat.",
        );

        setSelectedMedicalRecordPdfError(errorMessage);
        setSelectedMedicalRecordPdfLoadedNodeKey(null);
        setSelectedMedicalRecordPdfUrl((currentUrl) => {
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }
          return null;
        });
      } finally {
        setOpeningPdfNodeKey((currentKey) =>
          currentKey === node.key ? null : currentKey,
        );
      }
    },
    [fetchMedicalRecordPdfBlob, resolveBlobApiErrorMessage],
  );

  useEffect(() => {
    if (!selectedMedicalRecordNode) {
      setSelectedMedicalRecordPdfLoadedNodeKey(null);
      setSelectedMedicalRecordPdfError(null);
      setSelectedMedicalRecordPdfUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }
        return null;
      });
      return;
    }

    const shouldReload =
      selectedMedicalRecordPdfLoadedNodeKey !== selectedMedicalRecordNode.key;
    if (!shouldReload) {
      return;
    }

    void loadMedicalRecordPdfForViewer(selectedMedicalRecordNode);
  }, [
    loadMedicalRecordPdfForViewer,
    selectedMedicalRecordNode,
    selectedMedicalRecordPdfLoadedNodeKey,
  ]);

  const loadPatient = useCallback(async () => {
    const patientId = Number(id);
    if (!patientId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const patientResponse = await patientsApi.getById(patientId);
      const resolvedPatient = patientResponse.data.data as Patient | null;
      const patientSearchToken = (
        resolvedPatient?.medical_record_number ||
        resolvedPatient?.full_name ||
        ""
      ).trim();

      const historyParams = new URLSearchParams({
        page: "1",
        per_page: "200",
        status: "all",
      });
      if (patientSearchToken !== "") {
        historyParams.set("search", patientSearchToken);
      }

      const [
        visitHistoryResponse,
        invoiceHistoryResponse,
        medicalRecordHistoryResponse,
      ] = await Promise.all([
        patientsApi.getHistory(patientId),
        billingApi.getAll(historyParams.toString()),
        medicalRecordsApi.getAll(`patient_id=${patientId}&page=1&per_page=200`),
      ]);

      const invoiceRows = (invoiceHistoryResponse.data.data || []) as Invoice[];
      const medicalRecordRows = (medicalRecordHistoryResponse.data.data ||
        []) as MedicalRecord[];
      const visitRows = (visitHistoryResponse.data.data || []) as Visit[];

      const odontogramResponses = await Promise.all(
        visitRows.map((visit) =>
          odontogramApi
            .getByVisit(visit.id)
            .then((response) => response.data.data || [])
            .catch(() => [] as OdontogramEntry[]),
        ),
      );
      const odontogramRows = odontogramResponses.flat();

      setPatient(resolvedPatient);
      setVisits(visitRows);
      setInvoices(
        invoiceRows.filter(
          (invoice) => Number(invoice.patient_id) === patientId,
        ),
      );
      setMedicalRecords(medicalRecordRows);
      setOdontogramEntries(odontogramRows);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal memuat detail pasien",
        description: isAxiosError<{ error?: string }>(error)
          ? error.response?.data?.error ||
            "Data pasien tidak dapat ditampilkan."
          : "Data pasien tidak dapat ditampilkan.",
      });
      setPatient(null);
      setVisits([]);
      setInvoices([]);
      setMedicalRecords([]);
      setOdontogramEntries([]);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setPageTitle("Detail Pasien Hasil Pencarian");
    void loadPatient();
  }, [loadPatient]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="space-y-4 p-4 lg:p-5">
        <div className="rounded-xl border border-border/80 bg-background px-5 py-8">
          <h1 className="text-lg font-semibold">Pasien tidak ditemukan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Data pasien tidak tersedia atau sudah dihapus.
          </p>
          <div className="mt-4">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => navigate(backUrl)}
            >
              Kembali ke hasil pencarian
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const ageLabel = getPatientAgeLabel(patient.birth_date);
  const formatValue = (value?: string | null, fallback = "-") =>
    value || fallback;

  return (
    <PatientPageShell
      title={patient.full_name}
      subtitle="Halaman detail pasien khusus hasil pencarian cepat dari app header."
      onBack={() => navigate(backUrl)}
      badges={
        <>
          <Badge
            variant="secondary"
            className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none"
          >
            {patient.medical_record_number}
          </Badge>
          <Badge
            className={
              patient.is_active
                ? "h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none"
                : "h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none"
            }
          >
            {patient.is_active ? "Pasien Aktif" : "Nonaktif"}
          </Badge>
          <Badge
            variant="outline"
            className="h-5 rounded-none px-2 text-[10px] font-medium shadow-none"
          >
            {getPatientGenderLabel(patient.gender)}
          </Badge>
        </>
      }
      meta={
        <>
          <span>Usia {ageLabel}</span>
          <span>Telepon {formatValue(patient.phone)}</span>
          <span>
            Asuransi {getPatientInsuranceLabel(patient.insurance_type)}
          </span>
          <span>{visits.length} riwayat kunjungan</span>
          <span>{invoices.length} riwayat pembayaran</span>
          <span>{medicalRecords.length} rekam medis</span>
        </>
      }
      actions={
        <>
          <Button
            className="gap-1.5 rounded-none shadow-none"
            onClick={() =>
              navigate(`/registration/create?patient_id=${patient.id}`)
            }
          >
            Daftarkan Kunjungan
          </Button>
          <Button
            variant="outline"
            className="gap-1.5 rounded-none shadow-none"
            onClick={() => navigate(`/patients/${patient.id}`)}
          >
            <UserRoundSearch className="h-4 w-4" />
            Buka Data Master
          </Button>
        </>
      }
    >
      {hasListFilters ? (
        <div className="border-b border-border/70 px-4 py-3 lg:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground/95">
                List Hasil Pencarian
              </p>
              <p className="text-[11px] text-muted-foreground">
                {loadingMatchedPatients
                  ? "Memuat kandidat pasien..."
                  : `${matchedPatients.length} data ditemukan dari filter aktif`}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-7 rounded-none px-2 text-[11px] uppercase tracking-wide shadow-none"
              onClick={() => navigate(backUrl)}
            >
              Buka List Lengkap
            </Button>
          </div>

          {!loadingMatchedPatients && matchedPatients.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {matchedPatients.map((candidate) => {
                const isCurrentPatient =
                  Number(candidate.id) === Number(patient.id);

                return (
                  <Button
                    key={candidate.id}
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-8 rounded-none border-border/70 px-3 text-left text-xs shadow-none",
                      isCurrentPatient &&
                        "border-foreground bg-foreground text-background hover:bg-foreground hover:text-background",
                    )}
                    onClick={() => navigate(buildDetailUrl(candidate.id))}
                  >
                    <span className="truncate">
                      {candidate.full_name || "-"} ·{" "}
                      {candidate.medical_record_number || "-"}
                    </span>
                  </Button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-0"
      >
        <div className="border-b border-border/70 px-4 pt-2 lg:px-5">
          <TabsList className="h-auto w-full justify-start rounded-none border-0 bg-transparent p-0">
            <TabsTrigger
              value="detail"
              className="rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-3 py-2 text-sm text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Detail
            </TabsTrigger>
            <TabsTrigger
              value="pembayaran"
              className="rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-3 py-2 text-sm text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Riwayat Pembayaran
            </TabsTrigger>
            <TabsTrigger
              value="kunjungan"
              className="rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-3 py-2 text-sm text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Riwayat Kunjungan
            </TabsTrigger>
            <TabsTrigger
              value="rekam-medis"
              className="rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-3 py-2 text-sm text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Rekam Medis
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="detail" className="mt-0 divide-y divide-border/70">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="grid gap-x-6 gap-y-4  bg-muted/[0.03] p-4 md:grid-cols-2">
              <PatientDetailItem
                label="Nama Lengkap"
                value={patient.full_name}
              />
              <PatientDetailItem
                label="No. Rekam Medis"
                value={patient.medical_record_number}
              />
              <PatientDetailItem label="NIK" value={formatValue(patient.nik)} />
              <PatientDetailItem
                label="Tempat Lahir"
                value={formatValue(patient.birth_place)}
              />
              <PatientDetailItem
                label="Tanggal Lahir"
                value={
                  patient.birth_date
                    ? `${formatDate(patient.birth_date)}${ageLabel !== "-" ? ` (${ageLabel})` : ""}`
                    : "-"
                }
              />
              <PatientDetailItem
                label="Golongan Darah"
                value={formatValue(patient.blood_type)}
              />
              <PatientDetailItem
                label="Status Pernikahan"
                value={formatValue(patient.marital_status)}
              />
              <PatientDetailItem
                label="Pekerjaan"
                value={formatValue(patient.occupation)}
              />
            </div>

            <div className="grid gap-x-6 gap-y-4  bg-muted/[0.03] p-4 md:grid-cols-2">
              <PatientDetailItem
                label="Alamat Lengkap"
                value={formatValue(patient.address)}
              />
              <PatientDetailItem
                label="RT / RW"
                value={
                  patient.rt || patient.rw
                    ? `${patient.rt || "-"}/${patient.rw || "-"}`
                    : "-"
                }
              />
              <PatientDetailItem
                label="Kelurahan"
                value={formatValue(patient.kelurahan)}
              />
              <PatientDetailItem
                label="Kecamatan"
                value={formatValue(patient.kecamatan)}
              />
              <PatientDetailItem
                label="Kota / Kabupaten"
                value={formatValue(patient.city)}
              />
              <PatientDetailItem
                label="Provinsi"
                value={formatValue(patient.province)}
              />
              <PatientDetailItem
                label="Kode Pos"
                value={formatValue(patient.postal_code)}
              />
              <PatientDetailItem
                label="Telepon"
                value={formatValue(patient.phone)}
              />
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-4  bg-muted/[0.03] p-4 md:grid-cols-2 xl:grid-cols-3">
            <PatientDetailItem
              label="Orang Tua / Wali"
              value={formatValue(patient.emergency_contact_name)}
            />
            <PatientDetailItem
              label="Kontak Darurat"
              value={getPatientEmergencyLabel(patient)}
            />
            <PatientDetailItem
              label="Alamat Ringkas"
              value={getPatientAddressLabel(patient)}
            />
            <PatientDetailItem
              label="Tipe Asuransi"
              value={getPatientInsuranceLabel(patient.insurance_type)}
            />
            {patient.insurance_type !== "umum" ? (
              <PatientDetailItem
                label="Nomor Asuransi"
                value={formatValue(patient.insurance_number)}
              />
            ) : null}
            <PatientDetailItem
              label="Alergi"
              value={formatValue(patient.allergies, "Tidak ada data alergi")}
            />
            <PatientDetailItem
              label="Catatan Tambahan"
              value={formatValue(patient.notes, "Tidak ada catatan tambahan")}
            />
            <PatientDetailItem
              label="Terakhir Diubah"
              value={formatDateTime(patient.updated_at)}
            />
          </div>
        </TabsContent>

        <TabsContent value="pembayaran" className="mt-0">
          {invoices.length === 0 ? (
            <div className="border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
              Belum ada riwayat pembayaran.
            </div>
          ) : (
            <div className="overflow-hidden  bg-background">
              <div className="divide-y divide-border/70">
                {invoices.map((invoice) => {
                  const paidAmount = Number(invoice.paid_amount || 0);
                  const totalAmount = Number(invoice.total_amount || 0);
                  const outstandingAmount = Math.max(
                    totalAmount - paidAmount,
                    0,
                  );

                  return (
                    <div
                      key={invoice.id}
                      className="grid gap-3 px-4 py-4 lg:grid-cols-[180px_220px_minmax(0,1fr)_170px]"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground/95">
                          {formatDate(invoice.invoice_date)}
                        </p>
                        <p className="text-[11px] font-mono text-muted-foreground">
                          {invoice.invoice_number}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground/95">
                          Visit {invoice.visit?.visit_number || "-"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {invoice.payments && invoice.payments.length > 0
                            ? `${invoice.payments.length} transaksi`
                            : "Belum ada transaksi"}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Nominal
                        </p>
                        <p className="text-sm leading-6 text-foreground/95">
                          Total Rp {totalAmount.toLocaleString("id-ID")} ·
                          Terbayar Rp {paidAmount.toLocaleString("id-ID")} ·
                          Sisa Rp {outstandingAmount.toLocaleString("id-ID")}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                        <Badge
                          variant="outline"
                          className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none"
                        >
                          {invoice.status || "-"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="kunjungan" className="mt-0">
          {visits.length === 0 ? (
            <div className="border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
              Belum ada riwayat kunjungan.
            </div>
          ) : (
            <div className="overflow-hidden  bg-background">
              <div className="divide-y divide-border/70">
                {visits.map((visit) => (
                  <div
                    key={visit.id}
                    className="grid gap-3 px-4 py-4 lg:grid-cols-[180px_220px_minmax(0,1fr)_170px]"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground/95">
                        {formatDate(visit.visit_date)}
                      </p>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {visit.visit_number}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground/95">
                        {visit.polyclinic?.name || "-"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {visit.doctor?.full_name || "-"}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Keluhan
                      </p>
                      <p className="text-sm leading-6 text-foreground/95">
                        {formatValue(visit.complaint)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                      <Badge
                        variant="outline"
                        className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none"
                      >
                        {STATUS_LABEL[visit.status] || visit.status}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none"
                      >
                        {QUEUE_LABEL[visit.queue_status] || visit.queue_status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rekam-medis" className="mt-0">
          {medicalRecordGroups.length === 0 ? (
            <div className="border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
              Belum ada rekam medis untuk pasien ini.
            </div>
          ) : (
            <div className="grid min-h-[520px] overflow-hidden  bg-background lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="border-b border-border/70 lg:border-b-0 lg:border-r lg:border-border/70">
                <div className="border-b border-border/70 px-4 py-3">
                  <p className="text-sm font-semibold tracking-tight text-foreground/95">
                    Riwayat Registrasi
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {medicalRecordGroups.length} registrasi ·{" "}
                    {totalMedicalRecordPdfNodes} PDF
                  </p>
                </div>

                <div className="max-h-[520px] overflow-auto p-3">
                  {medicalRecordGroups.map((group, groupIndex) => {
                    const isGroupLast =
                      groupIndex === medicalRecordGroups.length - 1;
                    const isCollapsed =
                      collapsedVisitNodes[group.visitId] ?? false;

                    return (
                      <div
                        key={`${group.visitId}-${group.visitNumber}`}
                        className="relative pb-3 pl-7 last:pb-0"
                      >
                        {!isGroupLast ? (
                          <div className="absolute bottom-0 left-3 top-6 w-px bg-border/70" />
                        ) : null}
                        <div className="absolute left-2 top-4 h-2 w-2 rounded-full bg-foreground/60" />
                        <div className="absolute left-3 top-5 h-px w-3 bg-border/70" />

                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2  bg-muted/[0.02] px-2.5 py-2 text-left transition-colors hover:bg-muted/30"
                          onClick={() => toggleVisitNode(group.visitId)}
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <ChevronRight
                              className={cn(
                                "mt-[1px] h-3.5 w-3.5 shrink-0 transition-transform",
                                !isCollapsed && "rotate-90",
                              )}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/90">
                                {group.visitNumber}
                              </p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {formatDate(group.visitDate)} ·{" "}
                                {group.polyclinicName}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none"
                          >
                            {group.pdfNodes.length}
                          </Badge>
                        </button>

                        {!isCollapsed ? (
                          <div className="mt-1.5 space-y-1 pl-4">
                            {group.pdfNodes.map((node, recordIndex) => {
                              const isActiveRecord =
                                selectedMedicalRecordNodeKey === node.key;
                              const isLastRecord =
                                recordIndex === group.pdfNodes.length - 1;

                              return (
                                <div key={node.key} className="relative pl-5">
                                  {!isLastRecord ? (
                                    <div className="absolute bottom-[-8px] left-1.5 top-3.5 w-px bg-border/70" />
                                  ) : null}
                                  <div className="absolute left-1.5 top-3.5 h-px w-3 bg-border/70" />
                                  <div
                                    className={cn(
                                      "absolute left-1 top-[11px] h-1.5 w-1.5 rounded-full",
                                      isActiveRecord
                                        ? "bg-foreground"
                                        : "bg-muted-foreground/60",
                                    )}
                                  />

                                  <button
                                    type="button"
                                    className={cn(
                                      "flex w-full items-center justify-between gap-2 border px-2 py-1.5 text-left text-[11px] transition-colors",
                                      isActiveRecord
                                        ? "border-foreground bg-foreground text-background"
                                        : "border-border/70 bg-background text-foreground/90 hover:bg-muted/30",
                                    )}
                                    onClick={() =>
                                      setSelectedMedicalRecordNodeKey(node.key)
                                    }
                                  >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <FileText
                                        className={cn(
                                          "h-3.5 w-3.5 shrink-0",
                                          isActiveRecord
                                            ? "text-background"
                                            : "text-muted-foreground",
                                        )}
                                      />
                                      <span className="truncate">
                                        {node.title}
                                      </span>
                                    </span>
                                    <span
                                      className={cn(
                                        "font-mono text-[10px]",
                                        isActiveRecord
                                          ? "text-background/90"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {getPdfNodeIdentifierLabel(node)}
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex min-h-[520px] flex-col">
                {selectedMedicalRecordNode ? (
                  <>
                    <div className="border-b border-border/70 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold tracking-tight text-foreground/95">
                            {selectedMedicalRecordNode.title}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {formatDate(selectedMedicalRecordNode.recordDate)} ·{" "}
                            {selectedMedicalRecordNode.visitNumber}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none"
                          >
                            {selectedMedicalRecordNode.statusLabel || "-"}
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-none px-2 text-[11px] uppercase tracking-wide shadow-none"
                            onClick={() => {
                              if (selectedMedicalRecordPdfUrl) {
                                window.open(
                                  selectedMedicalRecordPdfUrl,
                                  "_blank",
                                );
                              }
                            }}
                            disabled={
                              !selectedMedicalRecordPdfUrl ||
                              openingPdfNodeKey === selectedMedicalRecordNode.key
                            }
                          >
                            {openingPdfNodeKey === selectedMedicalRecordNode.key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                            Buka Di Tab Baru
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 bg-muted/[0.02] p-3">
                      {openingPdfNodeKey === selectedMedicalRecordNode.key ? (
                        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 border border-dashed border-border/70 bg-background text-muted-foreground">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <p className="text-sm">Menyiapkan PDF blob...</p>
                        </div>
                      ) : selectedMedicalRecordPdfError ? (
                        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 border border-dashed border-destructive/40 bg-background px-4 text-center text-muted-foreground">
                          <FileText className="h-8 w-8 text-destructive/70" />
                          <p className="text-sm text-foreground">
                            Gagal memuat PDF rekam medis
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {selectedMedicalRecordPdfError}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-none px-2 text-[11px] uppercase tracking-wide shadow-none"
                            onClick={() => {
                              if (selectedMedicalRecordNode) {
                                void loadMedicalRecordPdfForViewer(
                                  selectedMedicalRecordNode,
                                );
                              }
                            }}
                          >
                            Muat Ulang
                          </Button>
                        </div>
                      ) : selectedMedicalRecordPdfUrl ? (
                        <iframe
                          key={selectedMedicalRecordNode.key}
                          title={`PDF Rekam Medis ${selectedMedicalRecordNode.key}`}
                          src={selectedMedicalRecordPdfUrl}
                          className="h-full min-h-[420px] w-full  bg-background"
                        />
                      ) : (
                        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 border border-dashed border-border/70 bg-background text-muted-foreground">
                          <FileText className="h-8 w-8 text-muted-foreground/60" />
                          <p className="text-sm">
                            PDF belum tersedia untuk ditampilkan
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
                    <FileText className="h-10 w-10 text-muted-foreground/60" />
                    <p className="text-sm">
                      Pilih dokumen dari sidebar untuk melihat rekam medis
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PatientPageShell>
  );
}
