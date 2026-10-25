import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AxiosError } from "axios";
import { Link, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  LockKeyhole,
  PlugZap,
  Save,
  ShieldCheck,
  Stethoscope,
  TerminalSquare,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  API_ORIGIN,
  bpjsBridgeApi,
  polyclinicsApi,
  satusehatApi,
  settingsApi,
  type BpjsDomainKey,
  type BpjsLog,
  type BpjsStatusResponse,
  type Polyclinic,
  type SatusehatLog,
  type SatusehatPrerequisite,
  type SatusehatResourceKey,
} from "@/lib/api";
import { setPageTitle } from "@/lib/page-title";
import {
  MasterDataAsideSection,
  MasterDataAsideStack,
  MasterDataLegacySections,
  MasterDataPageShell,
} from "@/pages/master-data/shared";

const SATUSEHAT_ENABLED_STORAGE_KEY = "satusehat_enabled";
const BPJS_ENABLED_STORAGE_KEY = "bpjs_enabled";

type IntegrationSettingsState = {
  satusehatEnabled: boolean;
  satusehatActiveMode: "sandbox" | "production";
  satusehatSandboxAuthUrl: string;
  satusehatProductionAuthUrl: string;
  satusehatSandboxFhirUrl: string;
  satusehatProductionFhirUrl: string;
  satusehatOrganizationId: string;
  satusehatClientId: string;
  satusehatClientSecret: string;
  bpjsAntreanEnabled: boolean;
  bpjsAntreanConsId: string;
  bpjsAntreanSecretKey: string;
  bpjsAntreanUserKey: string;
  bpjsAntreanBaseUrl: string;
  bpjsPCareEnabled: boolean;
  bpjsPCareConsId: string;
  bpjsPCareSecretKey: string;
  bpjsPCareUserKey: string;
  bpjsPCareBaseUrl: string;
};

const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettingsState = {
  satusehatEnabled: true,
  satusehatActiveMode: "sandbox",
  satusehatSandboxAuthUrl: "https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1",
  satusehatProductionAuthUrl: "https://api-satusehat.kemkes.go.id/oauth2/v1",
  satusehatSandboxFhirUrl: "https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1",
  satusehatProductionFhirUrl: "https://api-satusehat.kemkes.go.id/fhir-r4/v1",
  satusehatOrganizationId: "",
  satusehatClientId: "",
  satusehatClientSecret: "",
  bpjsAntreanEnabled: false,
  bpjsAntreanConsId: "",
  bpjsAntreanSecretKey: "",
  bpjsAntreanUserKey: "",
  bpjsAntreanBaseUrl: "https://apijkn-dev.bpjs-kesehatan.go.id/antreanrs_dev",
  bpjsPCareEnabled: false,
  bpjsPCareConsId: "",
  bpjsPCareSecretKey: "",
  bpjsPCareUserKey: "",
  bpjsPCareBaseUrl: "https://apijkn-dev.bpjs-kesehatan.go.id/pcare-rest-dev",
};

type IntegrationKey = "satusehat" | "bpjs" | "bridging";

type SatusehatStatusState = {
  enabled: boolean;
  disabled_reason: string;
  active_mode: string;
  auth_url: string;
  fhir_url: string;
  organization_id: string;
  client_id_configured: boolean;
  client_secret_configured: boolean;
  missing_fields: string[];
  ready: boolean;
};

type SatusehatWorkbenchResource = {
  key: SatusehatResourceKey;
  label: string;
  idLabel: string;
  helper: string;
};

type SatusehatPrerequisiteTemplate = {
  key: string;
  label: string;
  required: boolean;
  detail: string;
  nextStep: string;
};

type SatusehatLogQuickFilter = string;
type SatusehatLogOperationFilter = "all" | "sync" | "token" | "retry-sync";
type SatusehatLogStatusFilter = "all" | "success" | "failed";
type BpjsLogStatusFilter = "all" | "success" | "failed";

const SATUSEHAT_LOG_RESOURCE_ORDER = [
  "OAuthToken",
  "Organization",
  "Location",
  "Patient",
  "Practitioner",
  "Encounter",
  "Observation",
  "Procedure",
  "CarePlan",
  "Goal",
  "AllergyIntolerance",
  "FamilyMemberHistory",
  "Composition",
  "ClinicalImpression",
  "Condition",
  "ServiceRequest",
  "Specimen",
  "DiagnosticReport",
  "Medication",
  "MedicationRequest",
  "MedicationDispense",
  "QuestionnaireResponse",
];

function getSatusehatLogResourceLabel(resourceType: string) {
  if (!resourceType || resourceType === "Lainnya") {
    return "Lainnya";
  }

  switch (resourceType) {
    case "OAuthToken":
      return "Autentikasi";
    case "ClinicalImpression":
      return "Clinical Impression";
    case "Condition":
      return "Diagnosis";
    default:
      return resourceType;
  }
}

const SATUSEHAT_RESOURCE_OPTIONS: SatusehatWorkbenchResource[] = [
  { key: "organization", label: "Organization Poli", idLabel: "Polyclinic ID", helper: "Membentuk resource Organization SATUSEHAT dari master poli lokal." },
  { key: "location", label: "Location Poli", idLabel: "Polyclinic ID", helper: "Membentuk resource Location SATUSEHAT dari master poli lokal. Pastikan Organization poli sudah tersinkron lebih dulu." },
  { key: "patient", label: "Patient", idLabel: "Patient ID Lokal", helper: "Gunakan ID tabel pasien lokal untuk preview atau sync resource Patient." },
  { key: "practitioner", label: "Practitioner", idLabel: "Doctor ID Lokal", helper: "Mengambil data dokter lokal lalu membentuk resource Practitioner." },
  { key: "encounter", label: "Encounter", idLabel: "Visit ID Lokal", helper: "Membentuk Encounter rawat jalan dari data kunjungan yang sudah sinkron patient dan practitioner." },
  { key: "vital-signs", label: "Vital Signs Observation", idLabel: "Medical Record ID", helper: "Memecah vital signs numerik dari rekam medis menjadi beberapa Observation." },
  { key: "clinical-impression", label: "ClinicalImpression", idLabel: "Medical Record ID", helper: "Mengirim assessment klinis rekam medis menjadi ClinicalImpression." },
  { key: "procedure", label: "Procedure", idLabel: "Medical Action ID", helper: "Mengirim tindakan medis per item medical action menjadi Procedure SATUSEHAT." },
  { key: "care-plan", label: "CarePlan", idLabel: "Medical Record ID", helper: "Mengirim rencana perawatan dari plan dan follow-up instruction rekam medis." },
  { key: "goal", label: "Goal", idLabel: "Medical Record ID", helper: "Mengirim target perawatan dari plan/follow-up rekam medis menjadi Goal SATUSEHAT." },
  { key: "allergy-intolerance", label: "AllergyIntolerance", idLabel: "Medical Record ID", helper: "Mengirim catatan alergi dari rekam medis/pasien sebagai AllergyIntolerance." },
  { key: "family-member-history", label: "FamilyMemberHistory", idLabel: "Medical Record ID", helper: "Mengirim riwayat keluarga dari rekam medis sebagai FamilyMemberHistory." },
  { key: "composition", label: "Composition", idLabel: "Medical Record ID", helper: "Menyusun ringkasan rekam medis rawat jalan menjadi Composition." },
  { key: "diagnosis", label: "Condition Diagnosis", idLabel: "Diagnosis ID", helper: "Mengirim diagnosis ICD-10 lokal sebagai Condition." },
  { key: "laboratory-order-item", label: "Laboratory Item", idLabel: "Laboratory Order Item ID", helper: "Mengirim item lab sebagai ServiceRequest, Observation, dan DiagnosticReport jika hasil sudah ada." },
  { key: "radiology-order-item", label: "Radiology Item", idLabel: "Radiology Order Item ID", helper: "Mengirim item radiologi sebagai ServiceRequest, Observation parameter, dan DiagnosticReport naratif." },
  { key: "prescription", label: "MedicationRequest", idLabel: "Prescription ID", helper: "Mengirim resep non-racikan sebagai MedicationRequest." },
  { key: "dispensing", label: "MedicationDispense", idLabel: "Dispensing ID", helper: "Mengirim dispensing aktual farmasi sebagai MedicationDispense setelah MedicationRequest tersedia." },
];

const DEFAULT_SATUSEHAT_STATUS: SatusehatStatusState = {
  enabled: true,
  disabled_reason: "",
  active_mode: "sandbox",
  auth_url: "",
  fhir_url: "",
  organization_id: "",
  client_id_configured: false,
  client_secret_configured: false,
  missing_fields: [],
  ready: false,
};

function buildDefaultBpjsDomainStatus(domain: BpjsDomainKey, label: string) {
  return {
    domain,
    label,
    enabled: false,
    disabled_reason: "",
    base_url: "",
    cons_id_configured: false,
    secret_key_configured: false,
    user_key_configured: false,
    missing_fields: [],
    ready: false,
  };
}

const DEFAULT_BPJS_STATUS: BpjsStatusResponse = {
  provider: "bpjs",
  enabled_domains: 0,
  ready_domains: 0,
  total_domains: 2,
  domains: {
    antrean: buildDefaultBpjsDomainStatus("antrean", "Antrean FKTP"),
    pcare: buildDefaultBpjsDomainStatus("pcare", "P-Care"),
  },
};

function parseSettingsFlag(value: unknown, defaultValue = true) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  return defaultValue;
}

const SATUSEHAT_PREREQUISITE_TEMPLATES: Partial<Record<SatusehatResourceKey, SatusehatPrerequisiteTemplate[]>> = {
  procedure: [
    { key: "patient", label: "Patient", required: true, detail: "Procedure membutuhkan Patient SATUSEHAT sebagai subject.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "encounter", label: "Encounter", required: true, detail: "Procedure membutuhkan Encounter sebagai konteks tindakan.", nextStep: "Sinkronkan Encounter lebih dulu." },
    { key: "practitioner", label: "Practitioner", required: false, detail: "Practitioner digunakan sebagai performer tindakan.", nextStep: "Sinkronkan Practitioner bila performer perlu lengkap." },
    { key: "procedure-master", label: "Master Tindakan", required: true, detail: "Nama atau kode tindakan perlu tersedia pada data medical action.", nextStep: "Pastikan snapshot nama/kode layanan tindakan terisi." },
  ],
  "care-plan": [
    { key: "patient", label: "Patient", required: true, detail: "CarePlan membutuhkan Patient SATUSEHAT sebagai subject.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "encounter", label: "Encounter", required: true, detail: "CarePlan membutuhkan Encounter sebagai konteks kunjungan.", nextStep: "Sinkronkan Encounter lebih dulu." },
    { key: "care-plan-content", label: "Konten Rencana", required: true, detail: "Plan atau follow-up instruction perlu terisi untuk membentuk CarePlan.", nextStep: "Isi plan/follow-up instruction pada rekam medis." },
    { key: "diagnosis-reference", label: "Referensi Diagnosis", required: false, detail: "CarePlan dapat mereferensikan Condition diagnosis yang sudah tersinkron.", nextStep: "Sinkronkan diagnosis jika ingin reference Condition ikut terkirim." },
  ],
  goal: [
    { key: "patient", label: "Patient", required: true, detail: "Goal membutuhkan Patient SATUSEHAT sebagai subject.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "goal-content", label: "Konten Goal", required: true, detail: "Goal dibentuk dari plan, follow-up instruction, atau assessment rekam medis.", nextStep: "Isi plan/follow-up instruction/assessment pada rekam medis." },
    { key: "encounter", label: "Encounter", required: false, detail: "Encounter opsional untuk konteks kunjungan pada Goal.", nextStep: "Sinkronkan Encounter jika ingin konteks kunjungan ikut direferensikan." },
    { key: "follow-up-date", label: "Tanggal Kontrol", required: false, detail: "Tanggal follow-up dapat dikirim sebagai target dueDate pada Goal.", nextStep: "Isi jadwal follow-up bila ingin menambahkan target tanggal kontrol." },
  ],
  "allergy-intolerance": [
    { key: "patient", label: "Patient", required: true, detail: "AllergyIntolerance membutuhkan Patient SATUSEHAT sebagai subject.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "allergy-content", label: "Konten Alergi", required: true, detail: "Data alergi diambil dari patient allergies, allergy notes, atau clinical alert.", nextStep: "Lengkapi data alergi pasien atau catatan alergi rekam medis." },
    { key: "encounter", label: "Encounter", required: false, detail: "Encounter opsional untuk konteks kapan alergi dicatat.", nextStep: "Sinkronkan Encounter jika ingin konteks kunjungan ikut terkirim." },
  ],
  "family-member-history": [
    { key: "patient", label: "Patient", required: true, detail: "FamilyMemberHistory membutuhkan Patient SATUSEHAT sebagai subject.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "family-history-content", label: "Riwayat Keluarga", required: true, detail: "FamilyMemberHistory dibentuk dari kolom family_history pada rekam medis.", nextStep: "Isi riwayat keluarga pada rekam medis." },
    { key: "organization", label: "Organization Faskes", required: false, detail: "Organization dipakai untuk namespace identifier lokal FamilyMemberHistory.", nextStep: "Isi Organization ID SATUSEHAT pada settings." },
  ],
  composition: [
    { key: "patient", label: "Patient", required: true, detail: "Composition membutuhkan Patient SATUSEHAT sebagai subject dokumen.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "encounter", label: "Encounter", required: true, detail: "Composition membutuhkan Encounter SATUSEHAT untuk konteks episode kunjungan.", nextStep: "Sinkronkan Encounter lebih dulu." },
    { key: "composition-content", label: "Konten Resume", required: true, detail: "Konten resume diambil dari anamnesis, pemeriksaan, assessment, diagnosis, tindakan, dan rencana.", nextStep: "Lengkapi minimal satu bagian konten rekam medis." },
    { key: "practitioner", label: "Practitioner", required: false, detail: "Practitioner dipakai sebagai author dokumen Composition.", nextStep: "Sinkronkan Practitioner bila author ingin terkirim lengkap." },
  ],
  "laboratory-order-item": [
    { key: "patient", label: "Patient", required: true, detail: "Patient SATUSEHAT menjadi subject untuk order dan hasil laboratorium.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "practitioner", label: "Practitioner", required: false, detail: "Practitioner dipakai sebagai requester order laboratorium.", nextStep: "Sinkronkan Practitioner jika requester perlu lengkap." },
    { key: "encounter", label: "Encounter", required: true, detail: "Encounter aktif menjadi konteks ServiceRequest, Observation, dan DiagnosticReport.", nextStep: "Sinkronkan Encounter lebih dulu." },
    { key: "specimen", label: "Specimen", required: false, detail: "Pada collection SATUSEHAT, hasil laboratorium biasanya merujuk ke resource Specimen yang terhubung ke ServiceRequest.", nextStep: "Siapkan mapping specimen lokal sebelum mengirim hasil lab final." },
    { key: "lab-master", label: "Master Pemeriksaan Laboratorium", required: true, detail: "Nama dan kode layanan laboratorium harus tersedia di snapshot item.", nextStep: "Pastikan data layanan laboratorium lokal lengkap." },
    { key: "lab-result", label: "Hasil Laboratorium", required: false, detail: "Observation dan DiagnosticReport baru lengkap jika hasil sudah tersedia.", nextStep: "Lengkapi hasil bila ingin mengirim result final." },
  ],
  "radiology-order-item": [
    { key: "patient", label: "Patient", required: true, detail: "Patient SATUSEHAT menjadi subject untuk order dan hasil radiologi.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "practitioner", label: "Practitioner", required: false, detail: "Practitioner dipakai sebagai requester order radiologi.", nextStep: "Sinkronkan Practitioner jika requester perlu lengkap." },
    { key: "encounter", label: "Encounter", required: true, detail: "Encounter aktif menjadi konteks radiologi.", nextStep: "Sinkronkan Encounter lebih dulu." },
    { key: "radiology-master", label: "Master Pemeriksaan Radiologi", required: true, detail: "Nama dan kode layanan radiologi harus tersedia di snapshot item.", nextStep: "Pastikan data layanan radiologi lokal lengkap." },
    { key: "radiology-result", label: "Hasil Radiologi", required: false, detail: "DiagnosticReport final menunggu hasil atau narasi temuan radiologi.", nextStep: "Lengkapi hasil radiologi bila ingin mengirim report final." },
  ],
  prescription: [
    { key: "patient", label: "Patient", required: true, detail: "MedicationRequest membutuhkan Patient SATUSEHAT sebagai subject.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "practitioner", label: "Practitioner", required: false, detail: "Practitioner dipakai sebagai requester resep.", nextStep: "Sinkronkan Practitioner jika requester perlu lengkap." },
    { key: "encounter", label: "Encounter", required: true, detail: "Encounter aktif menjadi konteks resep.", nextStep: "Sinkronkan Encounter lebih dulu." },
    { key: "medication-master", label: "Medication Master", required: true, detail: "MedicationRequest SATUSEHAT umumnya merujuk ke resource Medication sebagai master obat.", nextStep: "Siapkan mapping resource Medication dari master obat lokal." },
    { key: "kfa-code", label: "Kode KFA Obat", required: true, detail: "Collection SATUSEHAT farmasi biasanya memakai kode KFA pada resource Medication.", nextStep: "Isi kode KFA pada master obat, bukan hanya kode internal." },
    { key: "medicine-form", label: "Bentuk Sediaan", required: false, detail: "Bentuk sediaan dipakai saat membentuk resource Medication master.", nextStep: "Lengkapi bentuk sediaan obat." },
    { key: "manufacturer", label: "Manufacturer", required: false, detail: "Collection contoh Medication juga menyertakan manufacturer pada master obat.", nextStep: "Lengkapi pabrikan obat atau siapkan mapping Organization manufacturer." },
    { key: "organization", label: "Organization Faskes", required: false, detail: "Organization dipakai pada identifier medication dan performer di alur farmasi SATUSEHAT.", nextStep: "Isi Organization ID SATUSEHAT pada settings." },
    { key: "medicine-quantity", label: "Jumlah Resep", required: true, detail: "Quantity resep tetap diperlukan saat membentuk MedicationRequest.", nextStep: "Pastikan quantity resep terisi." },
  ],
  dispensing: [
    { key: "patient", label: "Patient", required: true, detail: "MedicationDispense membutuhkan Patient SATUSEHAT sebagai subject.", nextStep: "Sinkronkan Patient lebih dulu." },
    { key: "encounter", label: "Encounter", required: true, detail: "Encounter aktif menjadi konteks dispensing.", nextStep: "Sinkronkan Encounter lebih dulu." },
    { key: "medication-request", label: "MedicationRequest", required: true, detail: "MedicationDispense membutuhkan authorizingPrescription yang sudah tersinkron.", nextStep: "Sinkronkan MedicationRequest resep lebih dulu." },
    { key: "medication-master", label: "Medication Master", required: true, detail: "MedicationDispense idealnya memakai master Medication yang sama dengan MedicationRequest.", nextStep: "Siapkan mapping resource Medication dari master obat lokal." },
    { key: "kfa-code", label: "Kode KFA Obat", required: true, detail: "Master farmasi SATUSEHAT biasanya memakai kode KFA pada resource Medication.", nextStep: "Isi kode KFA pada master obat sebelum sync farmasi." },
    { key: "medicine-form", label: "Bentuk Sediaan", required: false, detail: "Bentuk sediaan membantu membentuk resource Medication yang konsisten.", nextStep: "Lengkapi bentuk sediaan obat." },
    { key: "manufacturer", label: "Manufacturer", required: false, detail: "Collection contoh Medication juga menyertakan manufacturer.", nextStep: "Lengkapi pabrikan obat atau siapkan mapping Organization manufacturer." },
    { key: "organization", label: "Organization Faskes", required: false, detail: "Organization dipakai sebagai performer pada alur farmasi SATUSEHAT.", nextStep: "Isi Organization ID SATUSEHAT pada settings." },
    { key: "medicine-quantity", label: "Jumlah Dispensing", required: true, detail: "Quantity dispensing tetap diperlukan saat membentuk MedicationDispense.", nextStep: "Pastikan quantity dispensing terisi." },
  ],
};

function buildFallbackPrerequisites(resourceKey: SatusehatResourceKey): SatusehatPrerequisite[] {
  const templates = SATUSEHAT_PREREQUISITE_TEMPLATES[resourceKey] || [];
  return templates.map((item) => ({
    key: item.key,
    label: item.label,
    required: item.required,
    ready: false,
    current_value: "",
    detail: item.detail,
    next_step: item.nextStep,
  }));
}

const INTEGRATION_CARDS: Array<{
  key: IntegrationKey;
  title: string;
  description: string;
  status: ReactNode;
  enabled: boolean;
}> = [
  {
    key: "satusehat",
    title: "SATUSEHAT",
    description: "Integrasi FHIR R4 Kemenkes untuk data klinis, encounter, observasi, dan resource turunan.",
    status: <CheckCircle2 className="text-green-500" size={16} />,
    enabled: true,
  },
  {
    key: "bpjs",
    title: "BPJS FKTP + P-Care",
    description: "Panel operasional Antrean FKTP dan fondasi konfigurasi P-Care tanpa memecah flow lokal yang sudah ada.",
    status: <CheckCircle2 className="text-green-500" size={16} />,
    enabled: true,
  },
  {
    key: "bridging",
    title: "Integrasi Lainnya",
    description: "Tempat untuk WhatsApp gateway, LIS, RIS, payment gateway, atau partner API berikutnya.",
    status: <XCircle className="text-red-500" size={16} />,
    enabled: false,
  },
];

export default function IntegrationSettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationKey>("satusehat");
  const [settings, setSettings] = useState<IntegrationSettingsState>(DEFAULT_INTEGRATION_SETTINGS);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [satusehatStatus, setSatusehatStatus] = useState<SatusehatStatusState>(DEFAULT_SATUSEHAT_STATUS);
  const [statusLoading, setStatusLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [resourceKey, setResourceKey] = useState<SatusehatResourceKey>("patient");
  const [resourceId, setResourceId] = useState("");
  const [previewingResource, setPreviewingResource] = useState(false);
  const [syncingResource, setSyncingResource] = useState(false);
  const [previewResult, setPreviewResult] = useState<string>("");
  const [syncResult, setSyncResult] = useState<string>("");
  const [autoSyncVisitId, setAutoSyncVisitId] = useState("");
  const [autoSyncingVisit, setAutoSyncingVisit] = useState(false);
  const [autoSyncVisitResult, setAutoSyncVisitResult] = useState<string>("");
  const [connectionResult, setConnectionResult] = useState<string>("");
  const [satusehatLogs, setSatusehatLogs] = useState<SatusehatLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [logQuickFilter, setLogQuickFilter] = useState<SatusehatLogQuickFilter>("all");
  const [logOperationFilter, setLogOperationFilter] = useState<SatusehatLogOperationFilter>("all");
  const [logStatusFilter, setLogStatusFilter] = useState<SatusehatLogStatusFilter>("all");
  const [retryingLogId, setRetryingLogId] = useState<number | null>(null);
  const [retryResult, setRetryResult] = useState<string>("");
  const [bpjsStatus, setBpjsStatus] = useState<BpjsStatusResponse>(DEFAULT_BPJS_STATUS);
  const [bpjsStatusLoading, setBpjsStatusLoading] = useState(true);
  const [testingBpjsDomain, setTestingBpjsDomain] = useState<BpjsDomainKey | null>(null);
  const [bpjsConnectionResults, setBpjsConnectionResults] = useState<Record<BpjsDomainKey, string>>({ antrean: "", pcare: "" });
  const [bpjsLogs, setBpjsLogs] = useState<BpjsLog[]>([]);
  const [bpjsLogsLoading, setBpjsLogsLoading] = useState(true);
  const [bpjsLogDomainFilter, setBpjsLogDomainFilter] = useState<BpjsDomainKey | "all">("all");
  const [bpjsLogStatusFilter, setBpjsLogStatusFilter] = useState<BpjsLogStatusFilter>("all");

  const filteredSatusehatLogs = useMemo(() => {
    if (logQuickFilter === "all") {
      return satusehatLogs;
    }
    return satusehatLogs.filter((entry) => entry.resource_type === logQuickFilter);
  }, [logQuickFilter, satusehatLogs]);

  const satusehatLogFilters = useMemo(() => {
    const counts = new Map<string, number>();

    for (const entry of satusehatLogs) {
      const resourceType = entry.resource_type || "Lainnya";
      counts.set(resourceType, (counts.get(resourceType) || 0) + 1);
    }

    const resourceTypes = Array.from(counts.keys()).sort((left, right) => {
      const leftIndex = SATUSEHAT_LOG_RESOURCE_ORDER.indexOf(left);
      const rightIndex = SATUSEHAT_LOG_RESOURCE_ORDER.indexOf(right);

      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) {
          return 1;
        }
        if (rightIndex === -1) {
          return -1;
        }
        return leftIndex - rightIndex;
      }

      return left.localeCompare(right, "id-ID");
    });

    return [
      { key: "all", label: "Semua Resource", count: satusehatLogs.length },
      ...resourceTypes.map((resourceType) => ({
        key: resourceType,
        label: getSatusehatLogResourceLabel(resourceType),
        count: counts.get(resourceType) || 0,
      })),
    ];
  }, [satusehatLogs]);

  const selectedCard = useMemo(
    () => INTEGRATION_CARDS.find((item) => item.key === selectedIntegration) ?? INTEGRATION_CARDS[0],
    [selectedIntegration],
  );

  const selectedResource = useMemo(
    () => SATUSEHAT_RESOURCE_OPTIONS.find((item) => item.key === resourceKey) ?? SATUSEHAT_RESOURCE_OPTIONS[0],
    [resourceKey],
  );

  const selectedLog = useMemo(
    () => filteredSatusehatLogs.find((item) => item.id === selectedLogId) ?? filteredSatusehatLogs[0] ?? null,
    [filteredSatusehatLogs, selectedLogId],
  );

  const selectedResourcePrerequisites = useMemo(() => {
    if (!previewResult) {
      return buildFallbackPrerequisites(resourceKey);
    }

    try {
      const parsed = JSON.parse(previewResult) as { data?: { prerequisites?: SatusehatPrerequisite[] } };
      const prerequisites = parsed.data?.prerequisites;
      if (Array.isArray(prerequisites) && prerequisites.length > 0) {
        return prerequisites;
      }
    } catch {
      return buildFallbackPrerequisites(resourceKey);
    }

    return buildFallbackPrerequisites(resourceKey);
  }, [previewResult, resourceKey]);

  const activePolyclinics = useMemo(
    () => polyclinics
      .filter((item) => item.is_active)
      .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0) || left.name.localeCompare(right.name, "id-ID")),
    [polyclinics],
  );

  const filteredBpjsLogs = useMemo(() => {
    return bpjsLogs.filter((entry) => {
      if (bpjsLogDomainFilter !== "all" && entry.domain !== bpjsLogDomainFilter) {
        return false;
      }
      if (bpjsLogStatusFilter === "success" && !entry.success) {
        return false;
      }
      if (bpjsLogStatusFilter === "failed" && entry.success) {
        return false;
      }
      return true;
    });
  }, [bpjsLogDomainFilter, bpjsLogStatusFilter, bpjsLogs]);

  const bpjsAntreanStatus = bpjsStatus.domains.antrean ?? DEFAULT_BPJS_STATUS.domains.antrean;
  const bpjsPCareStatus = bpjsStatus.domains.pcare ?? DEFAULT_BPJS_STATUS.domains.pcare;
  const satusehatSyncEnabled = satusehatStatus.enabled;
  const showSatusehatFields = settings.satusehatEnabled;
  const showBpjsFields = settings.bpjsAntreanEnabled || settings.bpjsPCareEnabled;

  useEffect(() => {
    setPageTitle("Integrations");
    void loadSettings();
    void loadSatusehatStatus();
    void loadBPJSStatus();
    void loadBPJSLogs();
    void loadPolyclinics();
  }, []);

  useEffect(() => {
    const successFilter =
      logStatusFilter === "all"
        ? undefined
        : logStatusFilter === "success";
    void loadSatusehatLogs(logOperationFilter, successFilter);
  }, [logOperationFilter, logStatusFilter]);

  useEffect(() => {
    const successFilter =
      bpjsLogStatusFilter === "all"
        ? undefined
        : bpjsLogStatusFilter === "success";
    void loadBPJSLogs(bpjsLogDomainFilter, successFilter);
  }, [bpjsLogDomainFilter, bpjsLogStatusFilter]);

  useEffect(() => {
    if (filteredSatusehatLogs.length === 0) {
      if (selectedLogId !== null) {
        setSelectedLogId(null);
      }
      return;
    }

    const hasSelectedLog = filteredSatusehatLogs.some((item) => item.id === selectedLogId);
    if (!hasSelectedLog) {
      setSelectedLogId(filteredSatusehatLogs[0].id);
    }
  }, [filteredSatusehatLogs, selectedLogId]);

  const loadPolyclinics = async () => {
    try {
      const response = await polyclinicsApi.getAll("per_page=200");
      setPolyclinics(response.data.data || []);
    } catch {
      setPolyclinics([]);
    }
  };

  const loadSatusehatStatus = async () => {
    setStatusLoading(true);
    try {
      const response = await satusehatApi.getStatus();
      setSatusehatStatus(response.data.data || DEFAULT_SATUSEHAT_STATUS);
    } catch {
      setSatusehatStatus(DEFAULT_SATUSEHAT_STATUS);
    } finally {
      setStatusLoading(false);
    }
  };

  const loadBPJSStatus = async () => {
    setBpjsStatusLoading(true);
    try {
      const response = await bpjsBridgeApi.getStatus();
      setBpjsStatus(response.data.data || DEFAULT_BPJS_STATUS);
    } catch {
      setBpjsStatus(DEFAULT_BPJS_STATUS);
    } finally {
      setBpjsStatusLoading(false);
    }
  };

  const loadSatusehatLogs = async (
    operation: SatusehatLogOperationFilter = logOperationFilter,
    success?: boolean,
  ) => {
    setLogsLoading(true);
    try {
      const operationFilter = operation === "all" ? undefined : operation;
      const response = await satusehatApi.getLogs(200, undefined, operationFilter, success);
      const logs = response.data.data || [];
      setSatusehatLogs(logs);
      setSelectedLogId((current) => current ?? logs[0]?.id ?? null);
    } catch {
      setSatusehatLogs([]);
      setSelectedLogId(null);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadBPJSLogs = async (
    domain: BpjsDomainKey | "all" = bpjsLogDomainFilter,
    success?: boolean,
  ) => {
    setBpjsLogsLoading(true);
    try {
      const response = await bpjsBridgeApi.getLogs(100, domain, success);
      setBpjsLogs(response.data.data || []);
    } catch {
      setBpjsLogs([]);
    } finally {
      setBpjsLogsLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await settingsApi.getAll();
      const data = response.data.data || {};

      setSettings({
        satusehatEnabled: parseSettingsFlag(data.satusehat_enabled, DEFAULT_INTEGRATION_SETTINGS.satusehatEnabled),
        satusehatActiveMode: data.satusehat_active_mode === "production" ? "production" : DEFAULT_INTEGRATION_SETTINGS.satusehatActiveMode,
        satusehatSandboxAuthUrl: data.satusehat_sandbox_auth_url || DEFAULT_INTEGRATION_SETTINGS.satusehatSandboxAuthUrl,
        satusehatProductionAuthUrl: data.satusehat_production_auth_url || DEFAULT_INTEGRATION_SETTINGS.satusehatProductionAuthUrl,
        satusehatSandboxFhirUrl: data.satusehat_sandbox_fhir_url || DEFAULT_INTEGRATION_SETTINGS.satusehatSandboxFhirUrl,
        satusehatProductionFhirUrl: data.satusehat_production_fhir_url || DEFAULT_INTEGRATION_SETTINGS.satusehatProductionFhirUrl,
        satusehatOrganizationId: data.satusehat_organization_id || DEFAULT_INTEGRATION_SETTINGS.satusehatOrganizationId,
        satusehatClientId: data.satusehat_client_id || DEFAULT_INTEGRATION_SETTINGS.satusehatClientId,
        satusehatClientSecret: data.satusehat_client_secret || DEFAULT_INTEGRATION_SETTINGS.satusehatClientSecret,
        bpjsAntreanEnabled: parseSettingsFlag(data.bpjs_antrean_enabled, DEFAULT_INTEGRATION_SETTINGS.bpjsAntreanEnabled),
        bpjsAntreanConsId: data.bpjs_cons_id || DEFAULT_INTEGRATION_SETTINGS.bpjsAntreanConsId,
        bpjsAntreanSecretKey: data.bpjs_secret_key || DEFAULT_INTEGRATION_SETTINGS.bpjsAntreanSecretKey,
        bpjsAntreanUserKey: data.bpjs_user_key || DEFAULT_INTEGRATION_SETTINGS.bpjsAntreanUserKey,
        bpjsAntreanBaseUrl: data.bpjs_base_url || DEFAULT_INTEGRATION_SETTINGS.bpjsAntreanBaseUrl,
        bpjsPCareEnabled: parseSettingsFlag(data.bpjs_pcare_enabled, DEFAULT_INTEGRATION_SETTINGS.bpjsPCareEnabled),
        bpjsPCareConsId: data.bpjs_pcare_cons_id || data.bpjs_cons_id || DEFAULT_INTEGRATION_SETTINGS.bpjsPCareConsId,
        bpjsPCareSecretKey: data.bpjs_pcare_secret_key || data.bpjs_secret_key || DEFAULT_INTEGRATION_SETTINGS.bpjsPCareSecretKey,
        bpjsPCareUserKey: data.bpjs_pcare_user_key || data.bpjs_user_key || DEFAULT_INTEGRATION_SETTINGS.bpjsPCareUserKey,
        bpjsPCareBaseUrl: data.bpjs_pcare_base_url || DEFAULT_INTEGRATION_SETTINGS.bpjsPCareBaseUrl,
      });
      localStorage.setItem(SATUSEHAT_ENABLED_STORAGE_KEY, parseSettingsFlag(data.satusehat_enabled, DEFAULT_INTEGRATION_SETTINGS.satusehatEnabled) ? "1" : "0");
      localStorage.setItem(BPJS_ENABLED_STORAGE_KEY, (parseSettingsFlag(data.bpjs_antrean_enabled, DEFAULT_INTEGRATION_SETTINGS.bpjsAntreanEnabled) || parseSettingsFlag(data.bpjs_pcare_enabled, DEFAULT_INTEGRATION_SETTINGS.bpjsPCareEnabled)) ? "1" : "0");
    } catch {
      toast({
        variant: "destructive",
        title: "Gagal memuat integrasi",
        description: "Pengaturan integrasi belum bisa diambil dari server.",
      });
    } finally {
      setFetching(false);
    }
  };

  const handleFieldChange = (field: keyof IntegrationSettingsState, value: string) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.update({
        satusehat_enabled: settings.satusehatEnabled ? "1" : "0",
        satusehat_active_mode: settings.satusehatActiveMode,
        satusehat_sandbox_auth_url: settings.satusehatSandboxAuthUrl.trim(),
        satusehat_production_auth_url: settings.satusehatProductionAuthUrl.trim(),
        satusehat_sandbox_fhir_url: settings.satusehatSandboxFhirUrl.trim(),
        satusehat_production_fhir_url: settings.satusehatProductionFhirUrl.trim(),
        satusehat_organization_id: settings.satusehatOrganizationId.trim(),
        satusehat_client_id: settings.satusehatClientId.trim(),
        satusehat_client_secret: settings.satusehatClientSecret,
        bpjs_antrean_enabled: settings.bpjsAntreanEnabled ? "1" : "0",
        bpjs_cons_id: settings.bpjsAntreanConsId.trim(),
        bpjs_secret_key: settings.bpjsAntreanSecretKey,
        bpjs_user_key: settings.bpjsAntreanUserKey.trim(),
        bpjs_base_url: settings.bpjsAntreanBaseUrl.trim(),
        bpjs_pcare_enabled: settings.bpjsPCareEnabled ? "1" : "0",
        bpjs_pcare_cons_id: settings.bpjsPCareConsId.trim(),
        bpjs_pcare_secret_key: settings.bpjsPCareSecretKey,
        bpjs_pcare_user_key: settings.bpjsPCareUserKey.trim(),
        bpjs_pcare_base_url: settings.bpjsPCareBaseUrl.trim(),
      });

      toast({ variant: "success", title: "Integrasi tersimpan", description: "Konfigurasi Integrasi berhasil diperbarui." });
      localStorage.setItem(SATUSEHAT_ENABLED_STORAGE_KEY, settings.satusehatEnabled ? "1" : "0");
      localStorage.setItem(BPJS_ENABLED_STORAGE_KEY, showBpjsFields ? "1" : "0");
      window.dispatchEvent(new CustomEvent("satusehat-status-changed", { detail: { enabled: settings.satusehatEnabled } }));
      window.dispatchEvent(new CustomEvent("bpjs-status-changed", { detail: { enabled: showBpjsFields } }));
      void loadSatusehatStatus();
      void loadBPJSStatus();
      void loadBPJSLogs();
    } catch {
      toast({ variant: "destructive", title: "Gagal menyimpan integrasi", description: "Perubahan konfigurasi integrasi belum berhasil disimpan." });
    } finally {
      setSaving(false);
    }
  };

  const extractApiErrorMessage = (error: unknown, fallback: string) => {
    const requestError = error as AxiosError<{ error?: string } | string>;
    const statusCode = requestError.response?.status;
    const responseData = requestError.response?.data;

    if (responseData && typeof responseData === "object" && !Array.isArray(responseData)) {
      const apiError = responseData.error;
      if (typeof apiError === "string" && apiError.trim() !== "") {
        return apiError;
      }
    }

    if (typeof responseData === "string" && responseData.trim() !== "") {
      const compactMessage = responseData.replace(/\s+/g, " ").trim();
      const snippet = compactMessage.length > 220 ? `${compactMessage.slice(0, 220)}...` : compactMessage;
      return statusCode ? `HTTP ${statusCode}: ${snippet}` : snippet;
    }

    if (typeof requestError.message === "string" && requestError.message.trim() !== "") {
      return statusCode ? `HTTP ${statusCode}: ${requestError.message}` : requestError.message;
    }

    return fallback;
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult("");
    try {
      const response = await satusehatApi.testConnection();
      setConnectionResult(JSON.stringify(response.data, null, 2));
      toast({ variant: "success", title: "Koneksi berhasil", description: "SATUSEHAT merespons proses autentikasi dengan baik." });
      void loadSatusehatStatus();
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } catch (error) {
      const message = extractApiErrorMessage(error, "Test koneksi SATUSEHAT gagal dijalankan.");
      setConnectionResult(JSON.stringify({ error: message }, null, 2));
      toast({ variant: "destructive", title: "Koneksi gagal", description: message });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleTestBPJSConnection = async (domain: BpjsDomainKey) => {
    setTestingBpjsDomain(domain);
    setBpjsConnectionResults((current) => ({ ...current, [domain]: "" }));
    try {
      const response = await bpjsBridgeApi.testConnection(domain);
      setBpjsConnectionResults((current) => ({ ...current, [domain]: JSON.stringify(response.data, null, 2) }));
      toast({
        variant: "success",
        title: `Preflight ${domain === "antrean" ? "Antrean FKTP" : "P-Care"} berhasil`,
        description: response.data?.data?.message || "Endpoint dasar BPJS berhasil dijangkau.",
      });
      void loadBPJSStatus();
      void loadBPJSLogs(bpjsLogDomainFilter, bpjsLogStatusFilter === "all" ? undefined : bpjsLogStatusFilter === "success");
    } catch (error) {
      const requestError = error as AxiosError<{ error?: string; data?: unknown }>;
      const message = extractApiErrorMessage(error, "Preflight BPJS gagal dijalankan.");
      const payload = requestError.response?.data || { error: message };
      setBpjsConnectionResults((current) => ({ ...current, [domain]: JSON.stringify(payload, null, 2) }));
      toast({
        variant: "destructive",
        title: `Preflight ${domain === "antrean" ? "Antrean FKTP" : "P-Care"} gagal`,
        description: message,
      });
      void loadBPJSLogs(bpjsLogDomainFilter, bpjsLogStatusFilter === "all" ? undefined : bpjsLogStatusFilter === "success");
    } finally {
      setTestingBpjsDomain(null);
    }
  };

  const parseResourceId = () => {
    const trimmed = resourceId.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isInteger(parsed) || parsed <= 0) {
      toast({ variant: "destructive", title: "ID tidak valid", description: `Masukkan ${selectedResource.idLabel.toLowerCase()} berupa angka positif.` });
      return null;
    }
    return parsed;
  };

  const handlePreviewResource = async () => {
    const parsedId = parseResourceId();
    if (!parsedId) {
      return;
    }

    setPreviewingResource(true);
    setPreviewResult("");
    try {
      const response = await satusehatApi.previewResource(resourceKey, parsedId);
      setPreviewResult(JSON.stringify(response.data, null, 2));
      toast({ variant: "success", title: "Preview berhasil", description: `Payload ${selectedResource.label} berhasil dimuat.` });
    } catch (error) {
      const message = extractApiErrorMessage(error, `Preview ${selectedResource.label} gagal dimuat.`);
      setPreviewResult(JSON.stringify({ error: message }, null, 2));
      toast({ variant: "destructive", title: "Preview gagal", description: message });
    } finally {
      setPreviewingResource(false);
    }
  };

  const handleSyncResource = async () => {
    const parsedId = parseResourceId();
    if (!parsedId) {
      return;
    }

    setSyncingResource(true);
    setSyncResult("");
    try {
      const response = await satusehatApi.syncResource(resourceKey, parsedId);
      setSyncResult(JSON.stringify(response.data, null, 2));
      toast({ variant: "success", title: "Sinkron berhasil", description: `${selectedResource.label} berhasil dikirim ke SATUSEHAT.` });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } catch (error) {
      const message = extractApiErrorMessage(error, `Sinkron ${selectedResource.label} gagal dijalankan.`);
      setSyncResult(JSON.stringify({ error: message }, null, 2));
      toast({ variant: "destructive", title: "Sinkron gagal", description: message });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } finally {
      setSyncingResource(false);
    }
  };

  const handleAutoSyncVisit = async () => {
    const trimmed = autoSyncVisitId.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isInteger(parsed) || parsed <= 0) {
      toast({ variant: "destructive", title: "Visit ID tidak valid", description: "Masukkan visit ID berupa angka positif untuk menjalankan auto sync manual." });
      return;
    }

    setAutoSyncingVisit(true);
    setAutoSyncVisitResult("");
    try {
      const response = await satusehatApi.autoSyncVisit(parsed, true);
      setAutoSyncVisitResult(JSON.stringify(response.data, null, 2));
      const isBackground = response.status === 202 || response.data?.data?.job_status === "queued" || response.data?.data?.job_status === "running";
      toast({
        variant: "success",
        title: isBackground ? "Auto sync berjalan di background" : "Auto sync selesai",
        description: isBackground
          ? `Auto sync SATUSEHAT untuk visit ${parsed} berjalan di background. Anda dapat lanjut pekerjaan lain.`
          : `Auto sync SATUSEHAT untuk visit ${parsed} selesai diproses.`,
      });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } catch (error) {
      const message = extractApiErrorMessage(error, "Auto sync SATUSEHAT gagal dijalankan.");
      setAutoSyncVisitResult(JSON.stringify({ error: message }, null, 2));
      toast({ variant: "destructive", title: "Auto sync gagal", description: message });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } finally {
      setAutoSyncingVisit(false);
    }
  };

  const handleRetryLog = async (entry: SatusehatLog) => {
    if (entry.success || entry.operation.toLowerCase() !== "sync") {
      toast({ variant: "destructive", title: "Retry tidak tersedia", description: "Hanya log sync yang gagal yang bisa di-retry." });
      return;
    }

    setRetryingLogId(entry.id);
    setRetryResult("");
    try {
      const response = await satusehatApi.retryLog(entry.id);
      setRetryResult(JSON.stringify(response.data, null, 2));
      toast({ variant: "success", title: "Retry berhasil dijalankan", description: `Log #${entry.id} berhasil diproses ulang.` });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } catch (error) {
      const message = extractApiErrorMessage(error, "Retry log SATUSEHAT gagal dijalankan.");
      setRetryResult(JSON.stringify({ error: message }, null, 2));
      toast({ variant: "destructive", title: "Retry gagal", description: message });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } finally {
      setRetryingLogId(null);
    }
  };

  const buildRetryCurlCommand = (entry: SatusehatLog) => {
    const token = localStorage.getItem("token") || "<TOKEN>";
    const endpoint = `${API_ORIGIN}/api/satusehat/logs/${entry.id}/retry`;
    return `curl -X POST "${endpoint}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json"`;
  };

  const handleCopyRetryCurl = async (entry: SatusehatLog) => {
    if (entry.success || entry.operation.toLowerCase() !== "sync") {
      toast({ variant: "destructive", title: "cURL tidak tersedia", description: "Hanya log sync yang gagal yang bisa di-copy cURL retry." });
      return;
    }

    const command = buildRetryCurlCommand(entry);

    try {
      await navigator.clipboard.writeText(command);
      toast({ variant: "success", title: "cURL retry disalin", description: `Perintah retry untuk log #${entry.id} sudah ada di clipboard.` });
    } catch {
      setRetryResult(command);
      toast({
        variant: "destructive",
        title: "Gagal mengakses clipboard",
        description: "Perintah cURL ditampilkan di panel Hasil Retry. Silakan salin manual dari sana.",
      });
    }
  };

  if (fetching) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <MasterDataPageShell
        title="Integrasi"
        subtitle="Kelola provider integrasi dengan pola katalog di aside dan detail konfigurasi di area konten utama."
        meta={<><span>{selectedCard.title}</span><span>{selectedCard.status}</span></>}
        onBack={() => navigate(-1)}
        actions={selectedIntegration === "satusehat" || selectedIntegration === "bpjs" ? (
          <Button onClick={handleSave} disabled={saving} className="rounded-none shadow-none">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan Konfigurasi
          </Button>
        ) : undefined}
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Daftar Integrasi" >
                <div className="space-y-3">
                  {INTEGRATION_CARDS.map((integration) => {
                    const isActive = integration.key === selectedIntegration;
                    return (
                      <button
                        key={integration.key}
                        type="button"
                        onClick={() => setSelectedIntegration(integration.key)}
                        className={`w-full rounded-none border px-3 py-3 text-left transition-colors ${isActive ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <PlugZap className="h-4 w-4 text-muted-foreground" />
                              {integration.title}
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">{integration.description}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${integration.enabled ? "" : ""}`}>
                            {integration.status}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Akses Cepat" helper="Kembali ke settings umum atau lanjutkan menambah provider lain dengan pola layout yang sama.">
                <Button asChild variant="outline" className="w-full rounded-none shadow-none">
                  <Link to="/settings">Kembali ke Settings</Link>
                </Button>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          {selectedIntegration === "satusehat" ? (
            <>
              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Ringkasan Provider</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">SATUSEHAT memakai kombinasi identitas organisasi, kredensial OAuth2, dan base URL FHIR untuk proses sinkronisasi resource.</p>
                </div>

                <div className="rounded-lg border border-dashed p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <BadgeCheck className="h-4 w-4 text-emerald-600" />
                    {selectedCard.title}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{selectedCard.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant={satusehatSyncEnabled ? "default" : "secondary"} className="rounded-none">
                      {satusehatSyncEnabled ? "Integrasi Aktif" : "Integrasi Nonaktif"}
                    </Badge>
                    <Badge variant={satusehatStatus.ready ? "default" : "secondary"} className="rounded-none">
                      {!satusehatSyncEnabled ? "Dinonaktifkan" : satusehatStatus.ready ? "Konfigurasi Siap" : "Konfigurasi Belum Lengkap"}
                    </Badge>
                    <Badge variant="outline" className="rounded-none uppercase">
                      {satusehatStatus.active_mode || settings.satusehatActiveMode}
                    </Badge>
                    <Badge variant={satusehatStatus.client_id_configured ? "default" : "secondary"} className="rounded-none">
                      Client ID {satusehatStatus.client_id_configured ? "Terisi" : "Kosong"}
                    </Badge>
                    <Badge variant={satusehatStatus.client_secret_configured ? "default" : "secondary"} className="rounded-none">
                      Secret {satusehatStatus.client_secret_configured ? "Terisi" : "Kosong"}
                    </Badge>
                    <Badge variant="outline" className="rounded-none">
                      Poli Aktif {activePolyclinics.length}
                    </Badge>
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Operasional SATUSEHAT</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Panel ini dipakai untuk verifikasi readiness konfigurasi, test koneksi OAuth, dan mengeksekusi preview atau sync resource tanpa harus keluar ke Postman.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-none border border-border/70 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" /> Readiness
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      {!satusehatSyncEnabled ? <XCircle className="h-4 w-4 text-amber-600" /> : satusehatStatus.ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
                      {statusLoading ? "Memuat..." : !satusehatSyncEnabled ? "Dinonaktifkan" : satusehatStatus.ready ? "Siap digunakan" : "Perlu dilengkapi"}
                    </div>
                  </div>
                  <div className="rounded-none border border-border/70 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <PlugZap className="h-3.5 w-3.5" /> Mode Aktif
                    </div>
                    <p className="mt-2 text-sm font-semibold uppercase">{statusLoading ? "Memuat..." : satusehatStatus.active_mode || "-"}</p>
                  </div>
                  <div className="rounded-none border border-border/70 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <LockKeyhole className="h-3.5 w-3.5" /> Auth URL
                    </div>
                    <p className="mt-2 break-all text-xs leading-5 text-muted-foreground">{statusLoading ? "Memuat..." : satusehatStatus.auth_url || "-"}</p>
                  </div>
                  <div className="rounded-none border border-border/70 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <Database className="h-3.5 w-3.5" /> FHIR URL
                    </div>
                    <p className="mt-2 break-all text-xs leading-5 text-muted-foreground">{statusLoading ? "Memuat..." : satusehatStatus.fhir_url || "-"}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => void loadSatusehatStatus()} disabled={statusLoading}>
                    {statusLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Refresh Status
                  </Button>
                  <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => void handleTestConnection()} disabled={testingConnection || !satusehatSyncEnabled}>
                    {testingConnection ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                    Test Koneksi
                  </Button>
                </div>

                {!satusehatSyncEnabled && satusehatStatus.disabled_reason ? (
                  <div className="rounded-none border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800">
                    <p className="font-medium">Integrasi sedang dinonaktifkan</p>
                    <p className="mt-1 text-xs leading-5">{satusehatStatus.disabled_reason}. Preview payload lokal tetap tersedia, tetapi test koneksi, retry, sync, dan auto sync diblokir.</p>
                  </div>
                ) : null}

                {satusehatStatus.missing_fields.length > 0 ? (
                  <div className="rounded-none border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">Field konfigurasi yang masih kosong</p>
                    <p className="mt-1 text-xs leading-5">{satusehatStatus.missing_fields.join(", ")}</p>
                  </div>
                ) : null}

                {connectionResult ? (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Hasil Test Koneksi</Label>
                    <Textarea value={connectionResult} readOnly className="min-h-[180px] rounded-none font-mono text-xs" />
                  </div>
                ) : null}
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Status Integrasi</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Gunakan toggle ini jika bridging SATUSEHAT perlu dihentikan sementara tanpa menghapus mode, endpoint, atau kredensial yang sudah tersimpan.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, satusehatEnabled: true }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${settings.satusehatEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Aktif</p>
                      <p className="text-xs leading-5 text-muted-foreground">Mengizinkan test koneksi, retry log, sync manual, dan auto sync SATUSEHAT.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, satusehatEnabled: false }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${!settings.satusehatEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Nonaktif</p>
                      <p className="text-xs leading-5 text-muted-foreground">Memblokir semua operasi yang menghubungi SATUSEHAT, sambil tetap menyimpan konfigurasi untuk diaktifkan lagi nanti.</p>
                    </div>
                  </button>
                </div>

                <div className="rounded-none border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                  {settings.satusehatEnabled
                    ? "Saat aktif, SATUSEHAT dapat dipakai normal sesuai mode yang dipilih."
                    : "Saat nonaktif, preview payload lokal masih bisa dipakai untuk pengecekan data, tetapi koneksi dan sinkronisasi ke SATUSEHAT akan ditolak oleh backend."}
                </div>
              </section>

              {showSatusehatFields ? (
                <>
              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Mode Aktif</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Pilih environment yang akan dipakai aplikasi saat integrasi SATUSEHAT dijalankan. Pengaturan endpoint sandbox dan production tetap disimpan bersamaan.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleFieldChange("satusehatActiveMode", "sandbox")}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${settings.satusehatActiveMode === "sandbox" ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Sandbox</p>
                      <p className="text-xs leading-5 text-muted-foreground">Dipakai untuk pengujian dan validasi integrasi tanpa menyentuh environment live.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFieldChange("satusehatActiveMode", "production")}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${settings.satusehatActiveMode === "production" ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Production</p>
                      <p className="text-xs leading-5 text-muted-foreground">Dipakai saat integrasi sudah siap berjalan dengan data live di SATUSEHAT.</p>
                    </div>
                  </button>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Resource Awal dari Master Poli</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Organization dan Location turunan tidak perlu diisi manual di settings. Resource awal ini diturunkan dari data master poli yang sudah ada di aplikasi.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="satusehatOrganizationId" className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />Organization Induk (Org_id)</Label>
                  <Input id="satusehatOrganizationId" value={settings.satusehatOrganizationId} onChange={(event) => handleFieldChange("satusehatOrganizationId", event.target.value)} placeholder="10000005" className="h-10 text-sm" />
                  <p className="text-[11px] leading-5 text-muted-foreground">Field ini tetap dibutuhkan sebagai fasilitas induk SATUSEHAT. Organization dan Location turunannya akan dibentuk dari master poli.</p>
                </div>

                {activePolyclinics.length > 0 ? (
                  <div className="overflow-x-auto rounded-none border border-border/70 bg-background">
                    <table className="w-full min-w-[920px] border-collapse text-sm">
                      <thead className="bg-muted/20">
                        <tr className="border-b border-border/70 text-left">
                          <th className="px-3 py-2 font-semibold text-foreground/90">Poli Lokal</th>
                          <th className="px-3 py-2 font-semibold text-foreground/90">Sumber Data</th>
                          <th className="px-3 py-2 font-semibold text-foreground/90">Turunan Organization</th>
                          <th className="px-3 py-2 font-semibold text-foreground/90">Turunan Location</th>
                          <th className="px-3 py-2 font-semibold text-foreground/90">Status SATUSEHAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activePolyclinics.map((polyclinic) => (
                          <tr key={polyclinic.id} className="border-b border-border/60 align-top last:border-b-0">
                            <td className="px-3 py-2">
                              <div className="space-y-0.5">
                                <p className="font-medium text-foreground/95">{polyclinic.name}</p>
                                <p className="text-xs text-muted-foreground">ID {polyclinic.id} · Kode {polyclinic.code || "-"}</p>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs leading-5 text-muted-foreground">
                              <p>Name poli menjadi nama resource.</p>
                              <p>Code poli menjadi identifier lokal.</p>
                              <p>Description poli menjadi deskripsi resource.</p>
                            </td>
                            <td className="px-3 py-2 text-xs leading-5 text-foreground/90">
                              <p className="font-medium text-foreground/95">{polyclinic.name}</p>
                              <p className="text-muted-foreground">Identifier kandidat: {polyclinic.code || `POLI-${polyclinic.id}`}</p>
                            </td>
                            <td className="px-3 py-2 text-xs leading-5 text-foreground/90">
                              <p className="font-medium text-foreground/95">Ruang {polyclinic.name}</p>
                              <p className="text-muted-foreground">Identifier kandidat: {(polyclinic.code || `POLI-${polyclinic.id}`).concat("-ROOM")}</p>
                            </td>
                            <td className="px-3 py-2 text-xs leading-5 text-foreground/90">
                              <div className="space-y-2">
                                <div>
                                  <p className="font-medium text-foreground/95">Organization</p>
                                  <p className="text-muted-foreground break-all">{polyclinic.satusehat_organization_id || "Belum tersinkron"}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-foreground/95">Location</p>
                                  <p className="text-muted-foreground break-all">{polyclinic.satusehat_location_id || "Belum tersinkron"}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-none border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                    Belum ada master poli aktif yang bisa dipakai sebagai sumber Organization dan Location turunan.
                  </div>
                )}

                <div className="rounded-none border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                  Frontend sekarang memakai master poli sebagai sumber resource awal. Organization dan Location poli sudah bisa dipreview maupun disinkronkan, lalu Encounter akan memakai `Location` hasil turunan itu.
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Kredensial OAuth2</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Kredensial ini khusus untuk generate token. Nilainya berbeda dari Organization dan Location resource di atas.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="satusehatClientId" className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />Client ID</Label>
                    <Input id="satusehatClientId" value={settings.satusehatClientId} onChange={(event) => handleFieldChange("satusehatClientId", event.target.value)} placeholder="client-id-satusehat" className="h-10 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="satusehatClientSecret" className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />Client Secret</Label>
                    <div className="relative">
                      <Input id="satusehatClientSecret" type={showClientSecret ? "text" : "password"} value={settings.satusehatClientSecret} onChange={(event) => handleFieldChange("satusehatClientSecret", event.target.value)} placeholder="Masukkan client secret SATUSEHAT" className="h-10 pr-12 text-sm" />
                      <button type="button" onClick={() => setShowClientSecret((current) => !current)} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground" aria-label={showClientSecret ? "Sembunyikan client secret" : "Tampilkan client secret"}>
                        {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Autentikasi</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Pisahkan endpoint sandbox dan production agar proses uji tidak pernah menyentuh environment live secara tidak sengaja.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="satusehatSandboxAuthUrl" className="flex items-center gap-2 text-xs font-medium"><LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />Sandbox OAuth URL</Label>
                    <Input id="satusehatSandboxAuthUrl" value={settings.satusehatSandboxAuthUrl} onChange={(event) => handleFieldChange("satusehatSandboxAuthUrl", event.target.value)} placeholder="https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1" className="h-10 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="satusehatProductionAuthUrl" className="flex items-center gap-2 text-xs font-medium"><LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />Production OAuth URL</Label>
                    <Input id="satusehatProductionAuthUrl" value={settings.satusehatProductionAuthUrl} onChange={(event) => handleFieldChange("satusehatProductionAuthUrl", event.target.value)} placeholder="https://api-satusehat.kemkes.go.id/oauth2/v1" className="h-10 text-sm" />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">API Resources</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Base URL FHIR menjadi pintu utama untuk mengirim Patient, Encounter, Observation, Procedure, dan resource lain dari SIMKLINIK.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="satusehatSandboxFhirUrl" className="flex items-center gap-2 text-xs font-medium"><Database className="h-3.5 w-3.5 text-muted-foreground" />Sandbox FHIR Base URL</Label>
                    <Input id="satusehatSandboxFhirUrl" value={settings.satusehatSandboxFhirUrl} onChange={(event) => handleFieldChange("satusehatSandboxFhirUrl", event.target.value)} placeholder="https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1" className="h-10 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="satusehatProductionFhirUrl" className="flex items-center gap-2 text-xs font-medium"><Database className="h-3.5 w-3.5 text-muted-foreground" />Production FHIR Base URL</Label>
                    <Input id="satusehatProductionFhirUrl" value={settings.satusehatProductionFhirUrl} onChange={(event) => handleFieldChange("satusehatProductionFhirUrl", event.target.value)} placeholder="https://api-satusehat.kemkes.go.id/fhir-r4/v1" className="h-10 text-sm" />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Workbench Preview dan Sync</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Pilih resource, isi ID lokalnya, lalu jalankan preview atau sync. Panel ini cocok untuk validasi bertahap selama rollout integrasi SATUSEHAT.</p>
                </div>

                {selectedResourcePrerequisites.length > 0 ? (
                  <div className="space-y-3 rounded-none border border-dashed border-border/80 p-3">
                    <div className="space-y-1">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pra-syarat Resource</h3>
                      <p className="text-xs leading-5 text-muted-foreground">Untuk lab, radiologi, dan farmasi, urutan master resource perlu dicek dulu sebelum data transaksi dikirim.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {selectedResourcePrerequisites.map((item) => (
                        <div key={item.key} className="rounded-none border border-border/70 bg-background p-3 text-xs leading-5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-foreground">{item.label}</p>
                              <p className="text-muted-foreground">{item.required ? "Wajib" : "Opsional"}</p>
                            </div>
                            <Badge variant={item.ready ? "default" : item.required ? "destructive" : "secondary"} className="rounded-none">
                              {item.ready ? "Siap" : item.required ? "Belum siap" : "Opsional"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-muted-foreground">{item.detail || "Pra-syarat resource ini belum dicek."}</p>
                          {item.current_value ? <p className="mt-2 break-all text-foreground">Nilai sekarang: {item.current_value}</p> : null}
                          {item.next_step ? <p className="mt-2 text-amber-700">Langkah: {item.next_step}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                  <div className="space-y-3 rounded-none border border-border/70 p-3">
                    <div className="space-y-2">
                      <Label htmlFor="satusehat-resource-type" className="text-xs font-medium">Tipe Resource</Label>
                      <select
                        id="satusehat-resource-type"
                        value={resourceKey}
                        onChange={(event) => setResourceKey(event.target.value as SatusehatResourceKey)}
                        className="flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm"
                      >
                        {SATUSEHAT_RESOURCE_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="satusehat-resource-id" className="text-xs font-medium">{selectedResource.idLabel}</Label>
                      <Input
                        id="satusehat-resource-id"
                        value={resourceId}
                        onChange={(event) => setResourceId(event.target.value)}
                        placeholder={`Masukkan ${selectedResource.idLabel.toLowerCase()}`}
                        className="h-10 text-sm"
                      />
                    </div>

                    <div className="rounded-none border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                      <div className="flex items-center gap-2 text-foreground">
                        <Stethoscope className="h-3.5 w-3.5" />
                        {selectedResource.label}
                      </div>
                      <p className="mt-2">{selectedResource.helper}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => void handlePreviewResource()} disabled={previewingResource || syncingResource}>
                        {previewingResource ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                        Preview Payload
                      </Button>
                      <Button type="button" className="rounded-none shadow-none" onClick={() => void handleSyncResource()} disabled={syncingResource || previewingResource || !satusehatSyncEnabled}>
                        {syncingResource ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
                        Sync ke SATUSEHAT
                      </Button>
                    </div>

                    <div className="space-y-2 rounded-none border border-dashed p-3">
                      <Label htmlFor="satusehat-auto-sync-visit-id" className="text-xs font-medium">Manual Trigger Auto Sync Visit</Label>
                      <Input
                        id="satusehat-auto-sync-visit-id"
                        value={autoSyncVisitId}
                        onChange={(event) => setAutoSyncVisitId(event.target.value)}
                        placeholder="Masukkan Visit ID"
                        className="h-10 text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-none shadow-none"
                        onClick={() => void handleAutoSyncVisit()}
                        disabled={autoSyncingVisit || previewingResource || syncingResource || !satusehatSyncEnabled}
                      >
                        {autoSyncingVisit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
                        Jalankan Auto Sync
                      </Button>
                      <p className="text-[11px] leading-5 text-muted-foreground">Event otomatis backend berjalan saat kunjungan difinalisasi. Tombol ini dipakai untuk trigger manual jika perlu re-run.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Hasil Preview</Label>
                      <Textarea value={previewResult} readOnly placeholder="Hasil preview payload akan muncul di sini." className="min-h-[320px] rounded-none font-mono text-xs" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Hasil Sync</Label>
                      <Textarea value={syncResult} readOnly placeholder="Hasil sync SATUSEHAT akan muncul di sini." className="min-h-[320px] rounded-none font-mono text-xs" />
                    </div>
                    <div className="space-y-2 xl:col-span-2">
                      <Label className="text-xs font-medium">Hasil Auto Sync Visit (Manual Trigger)</Label>
                      <Textarea value={autoSyncVisitResult} readOnly placeholder="Hasil auto sync visit akan muncul di sini." className="min-h-[220px] rounded-none font-mono text-xs" />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold tracking-tight">Log Aktivitas SATUSEHAT</h2>
                    <p className="text-[11px] leading-5 text-muted-foreground">Log ini menyimpan percobaan token dan sinkronisasi resource, termasuk payload request, response, dan pesan error backend.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={logOperationFilter}
                      onChange={(event) => setLogOperationFilter(event.target.value as SatusehatLogOperationFilter)}
                      className="h-9 rounded-none border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">Semua Operasi</option>
                      <option value="sync">sync</option>
                      <option value="token">token</option>
                      <option value="retry-sync">retry-sync</option>
                    </select>
                    <select
                      value={logStatusFilter}
                      onChange={(event) => setLogStatusFilter(event.target.value as SatusehatLogStatusFilter)}
                      className="h-9 rounded-none border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">Semua Status</option>
                      <option value="success">Sukses</option>
                      <option value="failed">Gagal</option>
                    </select>
                  <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success")} disabled={logsLoading}>
                    {logsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TerminalSquare className="mr-2 h-4 w-4" />}
                    Refresh Log
                  </Button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,360px)_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-none border border-border/70">
                    <div className="max-h-[420px] overflow-y-auto">
                      {satusehatLogFilters.map((filter) => {
                        const active = logQuickFilter === filter.key;
                        return (
                          <button
                            key={filter.key}
                            type="button"
                            onClick={() => setLogQuickFilter(filter.key)}
                            className={`flex w-full items-center justify-between gap-3 border-b border-border/70 px-3 py-3 text-left last:border-b-0 ${active ? "bg-primary/5" : "bg-background hover:bg-muted/40"}`}
                          >
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Kategori Log</p>
                              <p className="mt-1 text-sm text-foreground">{filter.label}</p>
                            </div>
                            <Badge variant={active ? "default" : "outline"} className="rounded-none">{filter.count}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-none border border-border/70">
                    <div className="max-h-[420px] overflow-y-auto">
                      {filteredSatusehatLogs.length > 0 ? filteredSatusehatLogs.map((entry) => {
                        const active = selectedLog?.id === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSelectedLogId(entry.id)}
                            className={`flex w-full flex-col gap-1 border-b border-border/70 px-3 py-3 text-left last:border-b-0 ${active ? "bg-primary/5" : "bg-background hover:bg-muted/40"}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{entry.operation} · {getSatusehatLogResourceLabel(entry.resource_type || "")}</p>
                              <Badge variant={entry.success ? "default" : "destructive"} className="rounded-none">{entry.success ? "Sukses" : "Gagal"}</Badge>
                            </div>
                            <p className="text-xs text-foreground/90">{new Date(entry.created_at).toLocaleString("id-ID")}</p>
                            <p className="truncate text-xs text-muted-foreground">{entry.error_message || `${entry.method} ${entry.endpoint}`}</p>
                          </button>
                        );
                      }) : (
                        <div className="px-3 py-4 text-xs leading-5 text-muted-foreground">
                          {satusehatLogs.length === 0 ? "Belum ada log SATUSEHAT yang tersimpan." : `Tidak ada log untuk kategori ${getSatusehatLogResourceLabel(logQuickFilter)}.`}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {selectedLog && !selectedLog.success && selectedLog.operation.toLowerCase() === "sync" ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-none shadow-none"
                          onClick={() => void handleCopyRetryCurl(selectedLog)}
                          disabled={retryingLogId === selectedLog.id}
                        >
                          Copy cURL Retry
                        </Button>
                      ) : null}
                      {selectedLog && !selectedLog.success && selectedLog.operation.toLowerCase() === "sync" ? (
                        <Button
                          type="button"
                          className="rounded-none shadow-none"
                          onClick={() => void handleRetryLog(selectedLog)}
                          disabled={retryingLogId === selectedLog.id || !satusehatSyncEnabled}
                        >
                          {retryingLogId === selectedLog.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TerminalSquare className="mr-2 h-4 w-4" />}
                          Retry Log Gagal
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                        <p className="font-medium text-muted-foreground">Operasi</p>
                        <p className="mt-1 text-foreground">{selectedLog?.operation || "-"}</p>
                      </div>
                      <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                        <p className="font-medium text-muted-foreground">Resource</p>
                        <p className="mt-1 text-foreground">{selectedLog?.resource_type ? getSatusehatLogResourceLabel(selectedLog.resource_type) : "-"}</p>
                      </div>
                      <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                        <p className="font-medium text-muted-foreground">HTTP</p>
                        <p className="mt-1 text-foreground">{selectedLog ? `${selectedLog.method || "-"} / ${selectedLog.status_code || 0}` : "-"}</p>
                      </div>
                      <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                        <p className="font-medium text-muted-foreground">Mode</p>
                        <p className="mt-1 text-foreground uppercase">{selectedLog?.mode || "-"}</p>
                      </div>
                    </div>

                    <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                      <p className="font-medium text-muted-foreground">Endpoint</p>
                      <p className="mt-1 break-all text-foreground">{selectedLog?.endpoint || "-"}</p>
                      {selectedLog?.error_message ? <p className="mt-2 break-words text-rose-700">{selectedLog.error_message}</p> : null}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Request Payload</Label>
                        <Textarea value={selectedLog?.request_payload || ""} readOnly placeholder="Payload request akan tampil di sini." className="min-h-[240px] rounded-none font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Response Body</Label>
                        <Textarea value={selectedLog?.response_body || ""} readOnly placeholder="Body response akan tampil di sini." className="min-h-[240px] rounded-none font-mono text-xs" />
                      </div>
                    </div>

                    {retryResult ? (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Hasil Retry</Label>
                        <Textarea value={retryResult} readOnly placeholder="Hasil retry log SATUSEHAT akan muncul di sini." className="min-h-[180px] rounded-none font-mono text-xs" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
                </>
              ) : (
                <section className="space-y-3 rounded-lg border border-dashed border-border/80 p-5">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold tracking-tight">Field SATUSEHAT Disembunyikan</h2>
                    <p className="text-[11px] leading-5 text-muted-foreground">Mode, endpoint, kredensial, workbench, dan log SATUSEHAT disembunyikan selama integrasi dalam status nonaktif agar halaman tetap fokus pada kontrol on/off.</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Aktifkan kembali SATUSEHAT jika Anda ingin melihat atau mengubah seluruh field konfigurasi dan operasionalnya.</p>
                </section>
              )}
            </>
          ) : selectedIntegration === "bpjs" ? (
            <>
              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Ringkasan Provider BPJS</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">BPJS dipecah menjadi dua domain kerja: Antrean FKTP untuk alur antrean operasional dan P-Care untuk fondasi sinkronisasi pelayanan tahap berikutnya.</p>
                </div>

                <div className="rounded-lg border border-dashed p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={bpjsStatus.enabled_domains > 0 ? "default" : "secondary"} className="rounded-none">
                      Domain Aktif {bpjsStatus.enabled_domains}/{bpjsStatus.total_domains}
                    </Badge>
                    <Badge variant={bpjsStatus.ready_domains > 0 ? "default" : "secondary"} className="rounded-none">
                      Domain Siap {bpjsStatus.ready_domains}/{bpjsStatus.total_domains}
                    </Badge>
                    <Badge variant={bpjsAntreanStatus.ready ? "default" : "secondary"} className="rounded-none">
                      Antrean {bpjsAntreanStatus.ready ? "Siap" : "Belum Siap"}
                    </Badge>
                    <Badge variant={bpjsPCareStatus.ready ? "default" : "secondary"} className="rounded-none">
                      P-Care {bpjsPCareStatus.ready ? "Siap" : "Belum Siap"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Preflight connection di bawah hanya memverifikasi endpoint dasar dan kelengkapan kredensial. Ia tidak mengeksekusi endpoint bisnis BPJS yang dapat memicu perubahan data nyata.</p>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Status Integrasi BPJS</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Kontrol ini tetap tampil saat BPJS nonaktif agar admin bisa menghidupkan kembali domain Antrean FKTP atau P-Care tanpa membuka field teknis lain.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, bpjsAntreanEnabled: true }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${settings.bpjsAntreanEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Antrean FKTP {settings.bpjsAntreanEnabled ? "Aktif" : "Nonaktif"}</p>
                      <p className="text-xs leading-5 text-muted-foreground">Mengatur webhook dan outbound antrean BPJS dari flow klinik.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, bpjsPCareEnabled: true }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${settings.bpjsPCareEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">P-Care {settings.bpjsPCareEnabled ? "Aktif" : "Nonaktif"}</p>
                      <p className="text-xs leading-5 text-muted-foreground">Mengatur readiness domain P-Care secara terpisah dari antrean.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, bpjsAntreanEnabled: false }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${!settings.bpjsAntreanEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Matikan Antrean FKTP</p>
                      <p className="text-xs leading-5 text-muted-foreground">Dipakai bila integrasi antrean perlu dihentikan sementara.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, bpjsPCareEnabled: false }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${!settings.bpjsPCareEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Matikan P-Care</p>
                      <p className="text-xs leading-5 text-muted-foreground">Dipakai bila modul P-Care belum siap atau perlu ditutup sementara.</p>
                    </div>
                  </button>
                </div>

                <div className="rounded-none border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                  {showBpjsFields
                    ? "Minimal satu domain BPJS aktif, sehingga field konfigurasi dan panel operasional tetap ditampilkan."
                    : "Semua domain BPJS nonaktif. Field konfigurasi BPJS disembunyikan agar halaman tetap fokus pada kontrol on/off."}
                </div>
              </section>

              {showBpjsFields ? (
                <>

              <section className="space-y-4 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Domain Antrean FKTP</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Dipakai untuk outbound panggil, batal, tambah antrean, serta inbound webhook Antrean FKTP yang sudah ada di backend.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-none border border-border/70 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" /> Readiness
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      {!bpjsAntreanStatus.enabled ? <XCircle className="h-4 w-4 text-amber-600" /> : bpjsAntreanStatus.ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
                      {bpjsStatusLoading ? "Memuat..." : !bpjsAntreanStatus.enabled ? "Dinonaktifkan" : bpjsAntreanStatus.ready ? "Siap dipakai" : "Perlu dilengkapi"}
                    </div>
                  </div>
                  <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                    <p className="font-medium text-muted-foreground">Base URL</p>
                    <p className="mt-2 break-all text-foreground">{bpjsStatusLoading ? "Memuat..." : bpjsAntreanStatus.base_url || "-"}</p>
                  </div>
                  <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                    <p className="font-medium text-muted-foreground">Cons ID</p>
                    <p className="mt-2 text-foreground">{bpjsAntreanStatus.cons_id_configured ? "Terisi" : "Kosong"}</p>
                  </div>
                  <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                    <p className="font-medium text-muted-foreground">Secret + User Key</p>
                    <p className="mt-2 text-foreground">{bpjsAntreanStatus.secret_key_configured && bpjsAntreanStatus.user_key_configured ? "Terisi" : "Belum lengkap"}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, bpjsAntreanEnabled: true }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${settings.bpjsAntreanEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Aktif</p>
                      <p className="text-xs leading-5 text-muted-foreground">Mengizinkan webhook FKTP dan outbound antrean BPJS dari visit atau workspace dokter.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, bpjsAntreanEnabled: false }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${!settings.bpjsAntreanEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Nonaktif</p>
                      <p className="text-xs leading-5 text-muted-foreground">Menolak webhook dan menahan outbound tanpa menghapus kredensial yang sudah tersimpan.</p>
                    </div>
                  </button>
                </div>

                {bpjsAntreanStatus.missing_fields.length > 0 ? (
                  <div className="rounded-none border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">Field Antrean FKTP yang masih kosong</p>
                    <p className="mt-1 text-xs leading-5">{bpjsAntreanStatus.missing_fields.join(", ")}</p>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bpjsAntreanConsId" className="flex items-center gap-2 text-xs font-medium"><LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />Cons ID</Label>
                    <Input id="bpjsAntreanConsId" value={settings.bpjsAntreanConsId} onChange={(event) => handleFieldChange("bpjsAntreanConsId", event.target.value)} placeholder="Masukkan Cons ID antrean" className="h-10 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bpjsAntreanSecretKey" className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />Secret Key</Label>
                    <div className="relative">
                      <Input
                        id="bpjsAntreanSecretKey"
                        type={showClientSecret ? "text" : "password"}
                        value={settings.bpjsAntreanSecretKey}
                        onChange={(event) => handleFieldChange("bpjsAntreanSecretKey", event.target.value)}
                        placeholder="Masukkan Secret Key antrean"
                        className="h-10 pr-10 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowClientSecret(!showClientSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bpjsAntreanUserKey" className="flex items-center gap-2 text-xs font-medium"><LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />User Key</Label>
                    <Input id="bpjsAntreanUserKey" value={settings.bpjsAntreanUserKey} onChange={(event) => handleFieldChange("bpjsAntreanUserKey", event.target.value)} placeholder="Masukkan User Key antrean" className="h-10 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bpjsAntreanBaseUrl" className="flex items-center gap-2 text-xs font-medium"><Database className="h-3.5 w-3.5 text-muted-foreground" />Base URL</Label>
                    <Input id="bpjsAntreanBaseUrl" value={settings.bpjsAntreanBaseUrl} onChange={(event) => handleFieldChange("bpjsAntreanBaseUrl", event.target.value)} placeholder="https://apijkn-dev.bpjs-kesehatan.go.id/antreanrs_dev" className="h-10 text-sm" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => void loadBPJSStatus()} disabled={bpjsStatusLoading}>
                    {bpjsStatusLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Refresh Status
                  </Button>
                  <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => void handleTestBPJSConnection("antrean")} disabled={testingBpjsDomain === "antrean"}>
                    {testingBpjsDomain === "antrean" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                    Preflight Antrean FKTP
                  </Button>
                </div>

                {bpjsConnectionResults.antrean ? (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Hasil Preflight Antrean FKTP</Label>
                    <Textarea value={bpjsConnectionResults.antrean} readOnly className="min-h-[180px] rounded-none font-mono text-xs" />
                  </div>
                ) : null}
              </section>

              <section className="space-y-4 rounded-lg border border-border/80 p-5">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-tight">Domain P-Care</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Domain ini disiapkan terpisah sejak awal agar readiness, toggle, dan endpoint P-Care tidak bercampur dengan Antrean FKTP.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-none border border-border/70 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" /> Readiness
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      {!bpjsPCareStatus.enabled ? <XCircle className="h-4 w-4 text-amber-600" /> : bpjsPCareStatus.ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
                      {bpjsStatusLoading ? "Memuat..." : !bpjsPCareStatus.enabled ? "Dinonaktifkan" : bpjsPCareStatus.ready ? "Siap dipakai" : "Perlu dilengkapi"}
                    </div>
                  </div>
                  <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                    <p className="font-medium text-muted-foreground">Base URL</p>
                    <p className="mt-2 break-all text-foreground">{bpjsStatusLoading ? "Memuat..." : bpjsPCareStatus.base_url || "-"}</p>
                  </div>
                  <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                    <p className="font-medium text-muted-foreground">Cons ID</p>
                    <p className="mt-2 text-foreground">{bpjsPCareStatus.cons_id_configured ? "Terisi" : "Kosong"}</p>
                  </div>
                  <div className="rounded-none border border-border/70 p-3 text-xs leading-5">
                    <p className="font-medium text-muted-foreground">Secret + User Key</p>
                    <p className="mt-2 text-foreground">{bpjsPCareStatus.secret_key_configured && bpjsPCareStatus.user_key_configured ? "Terisi" : "Belum lengkap"}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, bpjsPCareEnabled: true }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${settings.bpjsPCareEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Aktif</p>
                      <p className="text-xs leading-5 text-muted-foreground">Menandai domain P-Care siap dipakai saat package client dan submit pelayanan mulai diaktifkan.</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings((current) => ({ ...current, bpjsPCareEnabled: false }))}
                    className={`rounded-none border px-4 py-3 text-left transition-colors ${!settings.bpjsPCareEnabled ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Nonaktif</p>
                      <p className="text-xs leading-5 text-muted-foreground">Menyimpan kredensial P-Care tanpa membuka flow submit pelayanan sebelum modulnya siap.</p>
                    </div>
                  </button>
                </div>

                {bpjsPCareStatus.missing_fields.length > 0 ? (
                  <div className="rounded-none border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">Field P-Care yang masih kosong</p>
                    <p className="mt-1 text-xs leading-5">{bpjsPCareStatus.missing_fields.join(", ")}</p>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bpjsPCareConsId" className="flex items-center gap-2 text-xs font-medium"><LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />Cons ID</Label>
                    <Input id="bpjsPCareConsId" value={settings.bpjsPCareConsId} onChange={(event) => handleFieldChange("bpjsPCareConsId", event.target.value)} placeholder="Masukkan Cons ID P-Care" className="h-10 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bpjsPCareSecretKey" className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />Secret Key</Label>
                    <div className="relative">
                      <Input
                        id="bpjsPCareSecretKey"
                        type={showClientSecret ? "text" : "password"}
                        value={settings.bpjsPCareSecretKey}
                        onChange={(event) => handleFieldChange("bpjsPCareSecretKey", event.target.value)}
                        placeholder="Masukkan Secret Key P-Care"
                        className="h-10 pr-10 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowClientSecret(!showClientSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bpjsPCareUserKey" className="flex items-center gap-2 text-xs font-medium"><LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />User Key</Label>
                    <Input id="bpjsPCareUserKey" value={settings.bpjsPCareUserKey} onChange={(event) => handleFieldChange("bpjsPCareUserKey", event.target.value)} placeholder="Masukkan User Key P-Care" className="h-10 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bpjsPCareBaseUrl" className="flex items-center gap-2 text-xs font-medium"><Database className="h-3.5 w-3.5 text-muted-foreground" />Base URL</Label>
                    <Input id="bpjsPCareBaseUrl" value={settings.bpjsPCareBaseUrl} onChange={(event) => handleFieldChange("bpjsPCareBaseUrl", event.target.value)} placeholder="https://apijkn-dev.bpjs-kesehatan.go.id/pcare-rest-dev" className="h-10 text-sm" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => void handleTestBPJSConnection("pcare")} disabled={testingBpjsDomain === "pcare"}>
                    {testingBpjsDomain === "pcare" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                    Preflight P-Care
                  </Button>
                </div>

                {bpjsConnectionResults.pcare ? (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Hasil Preflight P-Care</Label>
                    <Textarea value={bpjsConnectionResults.pcare} readOnly className="min-h-[180px] rounded-none font-mono text-xs" />
                  </div>
                ) : null}
              </section>

              <section className="space-y-3 rounded-lg border border-border/80 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold tracking-tight">Log Aktivitas BPJS</h2>
                    <p className="text-[11px] leading-5 text-muted-foreground">Mencatat inbound webhook, outbound antrean, hasil preflight, dan kegagalan inisialisasi client agar error tidak lagi silent.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={bpjsLogDomainFilter}
                      onChange={(event) => setBpjsLogDomainFilter(event.target.value as BpjsDomainKey | "all")}
                      className="h-9 rounded-none border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">Semua Domain</option>
                      <option value="antrean">Antrean FKTP</option>
                      <option value="pcare">P-Care</option>
                    </select>
                    <select
                      value={bpjsLogStatusFilter}
                      onChange={(event) => setBpjsLogStatusFilter(event.target.value as BpjsLogStatusFilter)}
                      className="h-9 rounded-none border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">Semua Status</option>
                      <option value="success">Sukses</option>
                      <option value="failed">Gagal</option>
                    </select>
                    <Button type="button" variant="outline" className="rounded-none shadow-none" onClick={() => void loadBPJSLogs(bpjsLogDomainFilter, bpjsLogStatusFilter === "all" ? undefined : bpjsLogStatusFilter === "success")} disabled={bpjsLogsLoading}>
                      {bpjsLogsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TerminalSquare className="mr-2 h-4 w-4" />}
                      Refresh Log
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredBpjsLogs.length > 0 ? filteredBpjsLogs.map((entry) => (
                    <div key={entry.id} className="rounded-none border border-border/70 p-3 text-xs leading-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={entry.success ? "default" : "destructive"} className="rounded-none">{entry.success ? "Sukses" : "Gagal"}</Badge>
                          <Badge variant="outline" className="rounded-none uppercase">{entry.domain}</Badge>
                          <Badge variant="outline" className="rounded-none uppercase">{entry.direction}</Badge>
                          <Badge variant="outline" className="rounded-none">{entry.operation}</Badge>
                        </div>
                        <p className="text-muted-foreground">{new Date(entry.created_at).toLocaleString("id-ID")}</p>
                      </div>
                      <p className="mt-2 text-foreground">{entry.method || "-"} {entry.endpoint || "-"}</p>
                      {entry.error_message ? <p className="mt-1 text-rose-700">{entry.error_message}</p> : null}
                      <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-medium">Request</Label>
                          <Textarea value={entry.request_payload || ""} readOnly placeholder="Payload request BPJS akan muncul di sini." className="min-h-[140px] rounded-none font-mono text-[11px]" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-medium">Response</Label>
                          <Textarea value={entry.response_body || ""} readOnly placeholder="Payload response BPJS akan muncul di sini." className="min-h-[140px] rounded-none font-mono text-[11px]" />
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-none border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                      {bpjsLogsLoading ? "Memuat log BPJS..." : "Belum ada log BPJS untuk filter yang dipilih."}
                    </div>
                  )}
                </div>
              </section>
                </>
              ) : (
                <section className="space-y-3 rounded-lg border border-dashed border-border/80 p-5">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold tracking-tight">Field BPJS Disembunyikan</h2>
                    <p className="text-[11px] leading-5 text-muted-foreground">Kredensial, endpoint, preflight, dan log BPJS disembunyikan selama seluruh domain BPJS berada pada status nonaktif agar halaman tetap fokus pada kontrol on/off.</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Aktifkan kembali Antrean FKTP atau P-Care jika Anda ingin melihat atau mengubah seluruh field konfigurasi BPJS.</p>
                </section>
              )}
            </>
          ) : (
            <section className="space-y-3 rounded-lg border border-dashed border-border/80 p-5">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight">Template Integrasi</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Provider ini belum aktif. Struktur aside dan kontennya sudah disiapkan agar ekspansi integrasi berikutnya tetap seragam dengan SATUSEHAT.</p>
              </div>
              <p className="text-sm text-muted-foreground">Saat siap, saya bisa menambahkan field kredensial, test koneksi, status sinkronisasi, dan endpoint khusus untuk provider ini tanpa mengubah layout dasarnya.</p>
            </section>
          )}
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </div>
  );
}
