import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowLeft,
  Building,
  ChevronRight,
  CreditCard,
  Edit,
  FileText,
  History,
  Loader2,
  MapPin,
  Phone,
  PlusCircle,
  Printer,
  Search,
  ShieldCheck,
  User,
  UserCheck,
  Users,
} from "lucide-react";
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
import { formatDate } from "@/pages/emr/utils";
import { isAxiosError } from "axios";
import { cn } from "@/lib/utils";

function getInitials(name?: string | null): string {
  if (!name) return "PS";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatReligion(val?: string | null): string {
  if (!val) return "-";
  const v = val.trim().toLowerCase();
  switch (v) {
    case "islam":
      return "Islam";
    case "kristen":
      return "Kristen";
    case "katolik":
      return "Katolik";
    case "hindu":
      return "Hindu";
    case "buddha":
      return "Buddha";
    case "konghucu":
      return "Konghucu";
    default:
      return val.charAt(0).toUpperCase() + val.slice(1);
  }
}

function formatMaritalStatus(val?: string | null): string {
  if (!val) return "-";
  const v = val.trim().toLowerCase();
  switch (v) {
    case "single":
    case "belum_kawin":
    case "belum kawin":
      return "Belum Kawin";
    case "married":
    case "kawin":
      return "Kawin";
    case "divorced":
    case "cerai":
    case "cerai hidup":
      return "Cerai Hidup";
    case "cerai mati":
      return "Cerai Mati";
    default:
      return val.charAt(0).toUpperCase() + val.slice(1);
  }
}
import {
  getPatientAgeLabel,
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
  "surat-rujukan": "Surat Rujukan",
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
    if (
      normalized === "surat-rujukan" ||
      normalized.startsWith("surat-rujukan-")
    )
      return "surat-rujukan";
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

  const visitColumns = useMemo<ColumnDef<Visit>[]>(
    () => [
      {
        accessorKey: "visit_number",
        header: "No. Kunjungan",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => (
          <div className="min-w-[130px] space-y-0.5">
            <span className="font-mono text-sm sm:text-base font-bold text-foreground">
              {row.original.visit_number}
            </span>
            <p className="text-xs text-muted-foreground font-mono">
              {(row.original as any).visit_type || "Rawat Jalan"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "visit_date",
        header: "Tanggal",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => (
          <div className="min-w-[120px] space-y-0.5">
            <span className="whitespace-nowrap text-sm font-semibold text-foreground">
              {formatDate(row.original.visit_date)}
            </span>
            <p className="text-xs text-muted-foreground font-mono">
              {row.original.created_at ? new Date(row.original.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
            </p>
          </div>
        ),
      },
      {
        id: "polyclinic",
        header: "Poliklinik",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => (
          <div className="min-w-[140px] space-y-0.5">
            <span className="text-sm font-bold text-foreground">
              {(row.original as any).polyclinic?.name || "-"}
            </span>
            <p className="text-xs text-muted-foreground">
              {(row.original as any).polyclinic?.code || "Poli Klinik"}
            </p>
          </div>
        ),
      },
      {
        id: "doctor",
        header: "Dokter",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => (
          <div className="min-w-[150px] space-y-0.5">
            <span className="text-sm font-semibold text-foreground">
              {(row.original as any).doctor?.full_name || "-"}
            </span>
            <p className="text-xs text-muted-foreground">
              {(row.original as any).doctor?.specialization || "Dokter Pemeriksa"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "complaint",
        header: "Keluhan",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => (
          <div className="min-w-[190px] max-w-[280px] space-y-0.5">
            <span className="text-sm text-foreground/95 font-medium line-clamp-1" title={row.original.complaint || "-"}>
              {row.original.complaint || "-"}
            </span>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {(row.original as any).diagnoses?.[0]?.diagnosis_name || "Pemeriksaan Umum"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => (
          <div className="min-w-[140px] space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="h-6 rounded-none px-2.5 text-xs uppercase font-mono shadow-none font-semibold"
              >
                {STATUS_LABEL[row.original.status] || row.original.status}
              </Badge>
              <Badge
                variant="secondary"
                className="h-6 rounded-none px-2.5 text-xs uppercase font-mono shadow-none font-semibold"
              >
                {QUEUE_LABEL[row.original.queue_status] || row.original.queue_status}
              </Badge>
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  const invoiceColumns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      {
        accessorKey: "invoice_number",
        header: "No. Invoice",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => (
          <div className="min-w-[140px] space-y-0.5">
            <span className="font-mono text-sm sm:text-base font-bold text-foreground">
              {row.original.invoice_number}
            </span>
            <p className="text-xs text-muted-foreground font-mono">
              {(row.original as any).payment_method || "Invoice Tagihan"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "invoice_date",
        header: "Tanggal",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => (
          <div className="min-w-[120px] space-y-0.5">
            <span className="whitespace-nowrap text-sm font-semibold text-foreground">
              {formatDate(row.original.invoice_date)}
            </span>
            <p className="text-xs text-muted-foreground font-mono">
              {row.original.created_at ? new Date(row.original.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
            </p>
          </div>
        ),
      },
      {
        id: "visit_number",
        header: "Kunjungan",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => (
          <div className="min-w-[140px] space-y-0.5">
            <span className="font-mono text-sm font-bold text-foreground">
              {row.original.visit?.visit_number || "-"}
            </span>
            <p className="text-xs text-muted-foreground">
              {row.original.visit?.polyclinic?.name || "1 transaksi"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "total_amount",
        header: () => <div className="text-right">Total Tagihan</div>,
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground text-right",
          cellClassName: "py-3 px-3.5 align-middle text-right",
        },
        cell: ({ row }) => (
          <div className="text-right space-y-0.5 min-w-[120px]">
            <div className="font-mono text-sm sm:text-[15px] font-bold text-foreground">
              Rp {Number(row.original.total_amount || 0).toLocaleString("id-ID")}
            </div>
            <p className="text-xs text-muted-foreground">
              Total Nominal
            </p>
          </div>
        ),
      },
      {
        accessorKey: "paid_amount",
        header: () => <div className="text-right">Terbayar</div>,
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground text-right",
          cellClassName: "py-3 px-3.5 align-middle text-right",
        },
        cell: ({ row }) => (
          <div className="text-right space-y-0.5 min-w-[120px]">
            <div className="font-mono text-sm sm:text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
              Rp {Number(row.original.paid_amount || 0).toLocaleString("id-ID")}
            </div>
            <p className="text-xs text-muted-foreground">
              Jumlah Terbayar
            </p>
          </div>
        ),
      },
      {
        id: "outstanding",
        header: () => <div className="text-right">Sisa Tagihan</div>,
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground text-right",
          cellClassName: "py-3 px-3.5 align-middle text-right",
        },
        cell: ({ row }) => {
          const sisa = Math.max(
            0,
            Number(row.original.total_amount || 0) - Number(row.original.paid_amount || 0),
          );
          return (
            <div className="text-right space-y-0.5 min-w-[120px]">
              <div
                className={`font-mono text-sm sm:text-[15px] font-bold ${
                  sisa > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                }`}
              >
                Rp {sisa.toLocaleString("id-ID")}
              </div>
              <p className="text-xs text-muted-foreground">
                {sisa > 0 ? "Kurang Bayar" : "Lunas"}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: {
          headerClassName: "py-3 px-3.5 text-sm font-bold text-foreground",
          cellClassName: "py-3 px-3.5 align-middle",
        },
        cell: ({ row }) => {
          const st = (row.original.status || "").toLowerCase();
          const isPaid = st === "paid" || st === "lunas";
          return (
            <div className="min-w-[100px] space-y-0.5">
              <Badge
                className={
                  isPaid
                    ? "h-6 sm:h-7 rounded-none border-0 bg-emerald-600 text-white px-3 text-xs font-mono uppercase shadow-none font-bold inline-flex items-center"
                    : "h-6 sm:h-7 rounded-none border-0 bg-amber-500 text-white px-3 text-xs font-mono uppercase shadow-none font-bold inline-flex items-center"
                }
              >
                {row.original.status || "-"}
              </Badge>
            </div>
          );
        },
      },
    ],
    [],
  );

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
    <div className="p-4 lg:p-6 bg-muted/20 min-h-full">
      {/* Satu Card Utuh Menggabungkan Header dan Body Sesuai Index SIMKLINIK */}
      <div className="border border-border/80 bg-card shadow-none">
        {/* Card Header (Baris Atas di dalam Satu Card) */}
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={() => navigate(backUrl)}
              aria-label="Kembali"
              title="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border/70 bg-muted/20">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-foreground truncate">
                  Profil & Data Pasien
                </h1>
                <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide font-mono shadow-none">
                  {patient.medical_record_number}
                </Badge>
                <Badge className={patient.is_active !== false ? "h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none" : "h-5 rounded-none border-0 bg-rose-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none"}>
                  {patient.is_active !== false ? "Pasien Aktif" : "Nonaktif"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                Informasi administratif, identitas lengkap, dan riwayat rekam medis pasien
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasListFilters ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs rounded-none border-primary/40 text-primary hover:bg-primary/5 shadow-none"
                onClick={() => navigate(backUrl)}
                title="Buka kembali daftar hasil pencarian"
              >
                <Search className="size-3.5" />
                Hasil Pencarian {!loadingMatchedPatients && matchedPatients.length > 0 ? `(${matchedPatients.length})` : ""}
              </Button>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs rounded-none border-amber-500/80 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 shadow-none"
              onClick={() => navigate(`/patients/${patient.id}/edit`)}
            >
              <Edit className="size-3.5" />
              Edit
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs rounded-none shadow-none"
              onClick={() => navigate(`/registration/create?patient_id=${patient.id}`)}
            >
              <PlusCircle className="size-3.5" />
              Daftarkan Kunjungan
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs rounded-none shadow-none"
              onClick={() => window.print()}
            >
              <Printer className="size-3.5" />
              Cetak Label Pasien
            </Button>
          </div>
        </div>

        {/* Card Body Langsung di Dalam Card yang Sama Tanpa Pemisah */}
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* KOLOM KIRI: Card Profil Pasien */}
            <div className="lg:col-span-4 xl:col-span-3 space-y-4">
              <div className="border border-border/70 bg-muted/[0.03] p-4 relative shadow-none">
                {/* Badge ACTIVE di pojok kanan atas */}
                <Badge className="absolute top-3.5 right-3.5 bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] font-bold tracking-wider rounded-md px-2 py-0.5 shadow-none border-0">
                  {patient.is_active !== false ? "ACTIVE" : "INACTIVE"}
                </Badge>

                {/* Avatar / Foto Pasien di Tengah */}
                <div className="flex flex-col items-center pt-2">
                  <div className="size-24 rounded-lg overflow-hidden border border-border bg-zinc-950 dark:bg-zinc-900 text-white flex items-center justify-center font-bold text-2xl shadow-sm">
                    {patient.photo ? (
                      <img src={patient.photo} alt={patient.full_name} className="size-full object-cover" />
                    ) : (
                      <span>{getInitials(patient.full_name)}</span>
                    )}
                  </div>

                  <h2 className="text-base font-bold text-center mt-3 text-foreground tracking-tight uppercase leading-snug">
                    {patient.full_name || "-"}
                  </h2>
                  <p className="text-xs text-muted-foreground text-center mt-1 font-mono">
                    {patient.medical_record_number || "-"} • {patient.nik || "-"}
                  </p>

                  <div className="mt-2.5">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 border border-border rounded-md text-foreground bg-muted/30 uppercase tracking-wider">
                      {patient.occupation || patient.insurance_type || "PASIEN UMUM"}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border/60 my-4" />

                {/* Info List Atribut Pasien */}
                <div className="space-y-3.5">
                  <div className="flex items-start gap-2.5 text-xs">
                    <User className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">GENDER / UMUR</p>
                      <p className="font-medium text-foreground mt-0.5">
                        {getPatientGenderLabel(patient.gender)} • {ageLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs">
                    <Phone className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">KONTAK</p>
                      <p className="font-medium text-foreground mt-0.5">
                        {patient.phone || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs">
                    <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">DOMISILI</p>
                      <p className="font-medium text-foreground mt-0.5 leading-relaxed">
                        {patient.address ? `${patient.address}, ${patient.city || ""}` : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs">
                    <Building className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">ASURANSI / PENJAMIN</p>
                      <p className="font-medium text-foreground mt-0.5">
                        {getPatientInsuranceLabel(patient.insurance_type)} {patient.insurance_number ? `• No. ${patient.insurance_number}` : ""}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Box Status Berbingkai Merah Muda Sesuai Gambar 2 */}
                <div className="mt-5 rounded-lg border border-rose-200 dark:border-rose-950 bg-rose-50/60 dark:bg-rose-950/20 p-3.5 space-y-2.5">
                  <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
                    <span>▾</span> STATUS PASIEN & REKAM MEDIS
                  </p>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">STATUS & KATEGORI</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">
                      {patient.is_active !== false ? "Pasien Aktif" : "Nonaktif"} • {getPatientInsuranceLabel(patient.insurance_type)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">RIWAYAT KUNJUNGAN</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">
                      {visits.length} Kunjungan {visits[0] ? `(Terakhir: ${formatDate(visits[0].visit_date)})` : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* KOLOM KANAN: Main Tabbed Panel */}
            <div className="lg:col-span-8 xl:col-span-9">
              <Tabs
                value={activeTab}
                onValueChange={handleTabChange}
                className="space-y-4"
              >
                <TabsList className="h-auto w-full justify-start rounded-none border-b border-border/70 bg-transparent p-0 gap-6">
                  <TabsTrigger
                    value="detail"
                    className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 pt-1 px-1 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
                  >
                    <UserCheck className="size-4" />
                    Detail Profil
                  </TabsTrigger>
                  <TabsTrigger
                    value="kunjungan"
                    className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 pt-1 px-1 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
                  >
                    <History className="size-4" />
                    Rekap Kunjungan
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">{visits.length}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="pembayaran"
                    className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 pt-1 px-1 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
                  >
                    <CreditCard className="size-4" />
                    Riwayat Pembayaran
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">{invoices.length}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="rekam-medis"
                    className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 pt-1 px-1 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
                  >
                    <FileText className="size-4" />
                    Rekam Medis & Dokumen
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">{medicalRecords.length}</span>
                  </TabsTrigger>
                </TabsList>

                {/* TAB DETAIL PROFIL (Sesuai Gambar 2) */}
                <TabsContent value="detail" className="mt-0 space-y-6 pt-2">
                  {/* 1. IDENTITAS LENGKAP */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
                      <User className="size-4 text-muted-foreground" />
                      <span>IDENTITAS LENGKAP</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">TEMPAT LAHIR</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatValue(patient.birth_place)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">TANGGAL LAHIR</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{patient.birth_date ? formatDate(patient.birth_date) : "-"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">GOLONGAN DARAH</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatValue(patient.blood_type)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">AGAMA</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatReligion(patient.religion)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">STATUS KAWIN</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatMaritalStatus(patient.marital_status)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">PENDIDIKAN TERAKHIR</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatValue(patient.education)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border/60" />

                  {/* 2. INFORMASI ALAMAT */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
                      <MapPin className="size-4 text-muted-foreground" />
                      <span>INFORMASI ALAMAT</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-xs">
                      <div className="sm:col-span-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">ALAMAT LENGKAP (KTP & DOMISILI)</p>
                        <p className="font-medium text-foreground mt-1 text-[13px] leading-relaxed">{formatValue(patient.address)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">KOTA / KABUPATEN</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatValue(patient.city)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">PROVINSI</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatValue(patient.province)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">KECAMATAN / KELURAHAN</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{patient.kecamatan || "-"} / {patient.kelurahan || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">KODE POS / RT RW</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">
                          {formatValue(patient.postal_code)} {patient.rt || patient.rw ? `• RT ${patient.rt || "-"}/RW ${patient.rw || "-"}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border/60" />

                  {/* 3. KELUARGA & PENANGGUNG JAWAB */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
                      <Users className="size-4 text-muted-foreground" />
                      <span>KELUARGA & PENANGGUNG JAWAB</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">NAMA PENANGGUNG JAWAB (PJ)</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatValue(patient.emergency_contact_name)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">HUBUNGAN PJ</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatValue(patient.emergency_contact_relation)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">NO. TELP PJ</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">{formatValue(patient.emergency_contact_phone)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border/60" />

                  {/* 4. LEGALITAS, BPJS & JAMINAN KESEHATAN */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
                      <ShieldCheck className="size-4 text-muted-foreground" />
                      <span>LEGALITAS, BPJS & JAMINAN KESEHATAN</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">NOMOR NIK (KTP)</p>
                        <p className="font-medium text-foreground mt-1 text-[13px] font-mono">{formatValue(patient.nik)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">BPJS KESEHATAN / ASURANSI</p>
                        <p className="font-medium text-foreground mt-1 text-[13px]">
                          {formatValue(patient.insurance_number)} ({getPatientInsuranceLabel(patient.insurance_type)})
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">ID SATUSEHAT PASIEN</p>
                        <p className="font-medium text-foreground mt-1 text-[13px] font-mono truncate">
                          {patient.satusehat_patient_id || "Belum Terhubung"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border/60" />

                  {/* 5. CATATAN KLINIS & ALERGI */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
                      <AlertTriangle className="size-4 text-muted-foreground" />
                      <span>CATATAN KLINIS & ALERGI</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">RIWAYAT ALERGI</p>
                        <p className="font-medium text-rose-600 dark:text-rose-400 mt-1 text-[13px]">{formatValue(patient.allergies, "Tidak ada riwayat alergi")}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">CATATAN KHUSUS</p>
                        <p className="font-medium text-foreground mt-1 text-[13px] leading-relaxed">{formatValue(patient.notes, "Tidak ada catatan tambahan")}</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="pembayaran" className="mt-4">
                  <div className="border border-border/80 bg-card rounded-none overflow-hidden shadow-none">
                    <div className="flex items-center justify-between border-b border-border/80 bg-muted/20 px-4 py-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Riwayat Tagihan & Pembayaran
                      </h3>
                      <Badge variant="outline" className="h-6 rounded-none px-2.5 text-xs font-mono font-semibold">
                        Total {invoices.length} Pembayaran
                      </Badge>
                    </div>
                    <div className="p-0">
                      <DataTable
                        columns={invoiceColumns}
                        data={invoices}
                        borderless={false}
                        showSearch={false}
                        pageSize={10}
                        emptyMessage={
                          <div className="p-10 text-center text-sm text-muted-foreground">
                            Belum ada riwayat pembayaran untuk pasien ini.
                          </div>
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="kunjungan" className="mt-4">
                  <div className="border border-border/80 bg-card rounded-none overflow-hidden shadow-none">
                    <div className="flex items-center justify-between border-b border-border/80 bg-muted/20 px-4 py-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Rekap Riwayat Kunjungan Pasien
                      </h3>
                      <Badge variant="outline" className="h-6 rounded-none px-2.5 text-xs font-mono font-semibold">
                        Total {visits.length} Kunjungan
                      </Badge>
                    </div>
                    <div className="p-0">
                      <DataTable
                        columns={visitColumns}
                        data={visits}
                        borderless={false}
                        showSearch={false}
                        pageSize={10}
                        emptyMessage={
                          <div className="p-10 text-center text-sm text-muted-foreground">
                            Belum ada riwayat kunjungan untuk pasien ini.
                          </div>
                        }
                      />
                    </div>
                  </div>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

