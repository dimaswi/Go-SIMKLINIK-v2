import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  EyeOff,
  FlaskConical,
  Globe,
  Key,
  Loader2,
  LockKeyhole,
  Play,
  PlugZap,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  polyclinicsApi,
  satusehatApi,
  settingsApi,
  type Polyclinic,
  type SatusehatLog,
  type SatusehatPrerequisite,
  type SatusehatResourceKey,
} from "@/lib/api";
import { setPageTitle } from "@/lib/page-title";

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

type SatusehatStatusState = {
  enabled: boolean;
  disabled_reason?: string;
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

type IntegrationKey = "satusehat" | "bpjs";

type SatusehatLogQuickFilter = string;
type SatusehatLogOperationFilter = "all" | "sync" | "token" | "retry-sync";
type SatusehatLogStatusFilter = "all" | "success" | "failed";

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

function buildFallbackPrerequisites(resourceKey: SatusehatResourceKey): SatusehatPrerequisite[] {
  switch (resourceKey) {
    case "location":
      return [{ key: "organization", label: "Organization Poli", required: true, ready: false, next_step: "Sinkronkan poli terlebih dahulu untuk Organization SATUSEHAT." }];
    case "encounter":
      return [
        { key: "patient", label: "Patient (IHS Number)", required: true, ready: false, next_step: "Pastikan pasien pada visit ini sudah memiliki IHS number." },
        { key: "practitioner", label: "Practitioner (IHS Number)", required: true, ready: false, next_step: "Pastikan dokter pada visit ini sudah memiliki IHS number." },
        { key: "location", label: "Location Poli", required: true, ready: false, next_step: "Pastikan poli pada visit ini sudah memiliki ID Location SATUSEHAT." },
      ];
    case "vital-signs":
    case "clinical-impression":
    case "procedure":
    case "care-plan":
    case "goal":
    case "allergy-intolerance":
    case "family-member-history":
    case "composition":
    case "diagnosis":
    case "laboratory-order-item":
    case "radiology-order-item":
    case "prescription":
      return [
        { key: "encounter", label: "Encounter Visit", required: true, ready: false, next_step: "Encounter visit harus sudah berstatus synced sebelum resource turunan dikirim." },
        { key: "patient", label: "Patient (IHS Number)", required: true, ready: false, next_step: "Pasien harus memiliki IHS number yang valid." },
      ];
    case "dispensing":
      return [
        { key: "prescription", label: "MedicationRequest", required: true, ready: false, next_step: "Resep obat harus sudah disinkronkan ke SATUSEHAT terlebih dahulu." },
        { key: "encounter", label: "Encounter Visit", required: true, ready: false, next_step: "Encounter visit harus sudah berstatus synced." },
      ];
    default:
      return [];
  }
}

export default function IntegrationSettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [settings, setSettings] = useState<IntegrationSettingsState>(DEFAULT_INTEGRATION_SETTINGS);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationKey>("satusehat");
  const [satusehatSideTab, setSatusehatSideTab] = useState<"settings" | "endpoints" | "polyclinics" | "test-connection" | "workbench" | "logs">("settings");

  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [satusehatStatus, setSatusehatStatus] = useState<SatusehatStatusState>(DEFAULT_SATUSEHAT_STATUS);
  const [polyclinics, setPolyclinics] = useState<Polyclinic[]>([]);
  const [syncingPoliId, setSyncingPoliId] = useState<number | null>(null);
  const [resourceKey, setResourceKey] = useState<SatusehatResourceKey>("encounter");
  const [resourceLocalId, setResourceLocalId] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [autoSyncLoading, setAutoSyncLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<string>("");
  const [syncResult, setSyncResult] = useState<string>("");
  const [autoSyncResult, setAutoSyncResult] = useState<string>("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<string>("");
  const [satusehatLogs, setSatusehatLogs] = useState<SatusehatLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [logQuickFilter, setLogQuickFilter] = useState<SatusehatLogQuickFilter>("all");
  const [logOperationFilter, setLogOperationFilter] = useState<SatusehatLogOperationFilter>("all");
  const [logStatusFilter, setLogStatusFilter] = useState<SatusehatLogStatusFilter>("all");
  const [retryingLogId, setRetryingLogId] = useState<number | null>(null);
  const [retryResult, setRetryResult] = useState<string>("");

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
      ...resourceTypes.map((resType) => ({
        key: resType,
        label: getSatusehatLogResourceLabel(resType),
        count: counts.get(resType) || 0,
      })),
    ];
  }, [satusehatLogs]);

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

  const satusehatSyncEnabled = satusehatStatus.enabled;
  const showSatusehatFields = settings.satusehatEnabled;

  useEffect(() => {
    setPageTitle("Pengaturan Integrasi");
    void loadSettings();
    void loadSatusehatStatus();
    void loadPolyclinics();
  }, []);

  useEffect(() => {
    const successFilter =
      logStatusFilter === "all"
        ? undefined
        : logStatusFilter === "success";
    void loadSatusehatLogs(logOperationFilter, successFilter);
  }, [logOperationFilter, logStatusFilter]);

  const loadPolyclinics = async () => {
    try {
      const response = await polyclinicsApi.getAll();
      setPolyclinics(response.data.data || []);
    } catch {
      setPolyclinics([]);
    }
  };

  const loadSatusehatStatus = async () => {
    try {
      const response = await satusehatApi.getStatus();
      setSatusehatStatus(response.data.data || DEFAULT_SATUSEHAT_STATUS);
    } catch {
      setSatusehatStatus(DEFAULT_SATUSEHAT_STATUS);
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
      localStorage.setItem(BPJS_ENABLED_STORAGE_KEY, (settings.bpjsAntreanEnabled || settings.bpjsPCareEnabled) ? "1" : "0");
      window.dispatchEvent(new CustomEvent("satusehat-status-changed", { detail: { enabled: settings.satusehatEnabled } }));
      window.dispatchEvent(new CustomEvent("bpjs-status-changed", { detail: { enabled: (settings.bpjsAntreanEnabled || settings.bpjsPCareEnabled) } }));
      void loadSatusehatStatus();
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

  const handlePreviewResource = async () => {
    const targetId = Number(resourceLocalId);
    if (!targetId || targetId <= 0) {
      toast({ variant: "destructive", title: "Target ID belum valid", description: "Masukkan ID lokal bertipe angka untuk resource yang dipilih." });
      return;
    }

    setPreviewLoading(true);
    setPreviewResult("");
    try {
      const response = await satusehatApi.previewResource(resourceKey, targetId);
      setPreviewResult(JSON.stringify(response.data, null, 2));
      toast({ variant: "success", title: "Preview siap", description: `Payload ${selectedResource.label} berhasil disusun.` });
    } catch (error) {
      const message = extractApiErrorMessage(error, `Gagal menyusun preview ${selectedResource.label}.`);
      setPreviewResult(JSON.stringify({ error: message }, null, 2));
      toast({ variant: "destructive", title: "Preview gagal", description: message });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSyncResource = async () => {
    const targetId = Number(resourceLocalId);
    if (!targetId || targetId <= 0) {
      toast({ variant: "destructive", title: "Target ID belum valid", description: "Masukkan ID lokal bertipe angka untuk resource yang dipilih." });
      return;
    }

    setSyncLoading(true);
    setSyncResult("");
    try {
      const response = await satusehatApi.syncResource(resourceKey, targetId);
      setSyncResult(JSON.stringify(response.data, null, 2));
      toast({ variant: "success", title: "Sinkronisasi berhasil", description: `Resource ${selectedResource.label} berhasil dikirim ke SATUSEHAT.` });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } catch (error) {
      const message = extractApiErrorMessage(error, `Sinkronisasi ${selectedResource.label} gagal dijalankan.`);
      setSyncResult(JSON.stringify({ error: message }, null, 2));
      toast({ variant: "destructive", title: "Sinkronisasi gagal", description: message });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSyncPolyclinic = async (poli: Polyclinic) => {
    setSyncingPoliId(poli.id);
    try {
      const response = await satusehatApi.syncResource("organization", poli.id);
      await satusehatApi.syncResource("location", poli.id);
      toast({
        variant: "success",
        title: "Poli berhasil disinkronkan",
        description: `${poli.name} telah diproses untuk Organization dan Location SATUSEHAT.`,
      });
      setSyncResult(JSON.stringify(response.data, null, 2));
      void loadPolyclinics();
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } catch (error) {
      const message = extractApiErrorMessage(error, `Sinkronisasi poli ${poli.name} gagal dijalankan.`);
      toast({ variant: "destructive", title: "Sinkronisasi poli gagal", description: message });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } finally {
      setSyncingPoliId(null);
    }
  };

  const handleTriggerAutoSyncVisit = async () => {
    const targetVisitId = Number(resourceLocalId);
    if (!targetVisitId || targetVisitId <= 0) {
      toast({ variant: "destructive", title: "Target Visit ID belum valid", description: "Masukkan ID kunjungan lokal pada kolom input target." });
      return;
    }

    setAutoSyncLoading(true);
    setAutoSyncResult("");
    try {
      const response = await satusehatApi.autoSyncVisit(targetVisitId);
      setAutoSyncResult(JSON.stringify(response.data, null, 2));
      toast({ variant: "success", title: "Auto sync kunjungan dijalankan", description: `Rangkaian sync visit #${targetVisitId} berhasil diproses backend.` });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } catch (error) {
      const message = extractApiErrorMessage(error, `Auto sync kunjungan #${targetVisitId} gagal dijalankan.`);
      setAutoSyncResult(JSON.stringify({ error: message }, null, 2));
      toast({ variant: "destructive", title: "Auto sync visit gagal", description: message });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } finally {
      setAutoSyncLoading(false);
    }
  };

  const handleRetryLog = async (logId: number) => {
    setRetryingLogId(logId);
    setRetryResult("");
    try {
      const response = await satusehatApi.retryLog(logId);
      setRetryResult(JSON.stringify(response.data, null, 2));
      toast({ variant: "success", title: "Retry log berhasil", description: `Log #${logId} berhasil diproses ulang.` });
      void loadSatusehatLogs(logOperationFilter, logStatusFilter === "all" ? undefined : logStatusFilter === "success");
    } catch (error) {
      const message = extractApiErrorMessage(error, `Retry log #${logId} gagal dijalankan.`);
      setRetryResult(JSON.stringify({ error: message }, null, 2));
      toast({ variant: "destructive", title: "Retry log gagal", description: message });
    } finally {
      setRetryingLogId(null);
    }
  };

  const renderSectionHeader = (icon: ReactNode, title: string) => (
    <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/60 pb-2 mb-4">
      {icon}
      <span>{title}</span>
    </div>
  );

  const renderSatusehatSettings = () => (
    <div className="space-y-6">
      {/* 1. STATUS INTEGRASI */}
      <div>
        {renderSectionHeader(<ShieldCheck className="size-4 text-muted-foreground" />, "Status Integrasi SATUSEHAT")}
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setSettings((current) => ({ ...current, satusehatEnabled: true }))}
            className={cn(
              "p-3 text-left border transition-all rounded-none",
              settings.satusehatEnabled
                ? "border-emerald-600 bg-emerald-500/5 ring-1 ring-emerald-600"
                : "border-border/70 bg-card hover:bg-muted/40"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground uppercase">Aktif</span>
              {settings.satusehatEnabled && <BadgeCheck className="size-4 text-emerald-600" />}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Mengizinkan test koneksi, retry log, sync manual, dan auto sync SATUSEHAT.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSettings((current) => ({ ...current, satusehatEnabled: false }))}
            className={cn(
              "p-3 text-left border transition-all rounded-none",
              !settings.satusehatEnabled
                ? "border-rose-600 bg-rose-500/5 ring-1 ring-rose-600"
                : "border-border/70 bg-card hover:bg-muted/40"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground uppercase">Nonaktif</span>
              {!settings.satusehatEnabled && <XCircle className="size-4 text-rose-600" />}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Memblokir semua operasi keluar ke SATUSEHAT, sambil tetap menyimpan konfigurasi.
            </p>
          </button>
        </div>
      </div>

      {showSatusehatFields ? (
        <>
          {/* 2. MODE AKTIF */}
          <div>
            {renderSectionHeader(<Database className="size-4 text-muted-foreground" />, "Mode Aktif SATUSEHAT")}
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setSettings((current) => ({ ...current, satusehatActiveMode: "sandbox" }))}
                className={cn(
                  "p-3 text-left border transition-all rounded-none",
                  settings.satusehatActiveMode === "sandbox"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border/70 bg-card hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground uppercase">Sandbox (Staging)</span>
                  {settings.satusehatActiveMode === "sandbox" && <CheckCircle2 className="size-4 text-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Direkomendasikan untuk pengujian alur fhir-r4 sebelum cutover ke production.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSettings((current) => ({ ...current, satusehatActiveMode: "production" }))}
                className={cn(
                  "p-3 text-left border transition-all rounded-none",
                  settings.satusehatActiveMode === "production"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border/70 bg-card hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground uppercase">Production</span>
                  {settings.satusehatActiveMode === "production" && <CheckCircle2 className="size-4 text-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Gunakan saat organisasi faskes dan client credential production resmi sudah aktif.
                </p>
              </button>
            </div>
          </div>

          {/* 3. KREDENSIAL OAUTH2 */}
          <div>
            {renderSectionHeader(<Key className="size-4 text-muted-foreground" />, "Kredensial OAuth2 & Organisasi")}
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground uppercase">Organization ID Induk</Label>
                  <Input
                    value={settings.satusehatOrganizationId}
                    onChange={(e) => handleFieldChange("satusehatOrganizationId", e.target.value)}
                    placeholder="Contoh: 1000001"
                    className="h-9 rounded-none font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground uppercase">Client ID</Label>
                  <Input
                    value={settings.satusehatClientId}
                    onChange={(e) => handleFieldChange("satusehatClientId", e.target.value)}
                    placeholder="Client ID dari portal pengembang DTO Kemkes"
                    className="h-9 rounded-none font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground uppercase">Client Secret</Label>
                  <button
                    type="button"
                    onClick={() => setShowSecret((prev) => !prev)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {showSecret ? "Sembunyikan" : "Tampilkan"}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={settings.satusehatClientSecret}
                    onChange={(e) => handleFieldChange("satusehatClientSecret", e.target.value)}
                    placeholder="Client Secret OAuth2 SATUSEHAT"
                    className="h-9 rounded-none font-mono text-xs pr-9"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-muted-foreground">
                    <LockKeyhole className="size-3.5" />
                  </div>
                </div>
              </div>
            </div>
          </div>




        </>
      ) : (
        <div className="p-6 border border-dashed border-border/80 text-center space-y-1">
          <p className="text-xs font-semibold text-foreground">Field SATUSEHAT Disembunyikan</p>
          <p className="text-xs text-muted-foreground">Aktifkan kembali SATUSEHAT jika Anda ingin melihat atau mengubah konfigurasi.</p>
        </div>
      )}
    </div>
  );


  const renderSatusehatEndpoints = () => (
    <div className="space-y-6">
      {renderSectionHeader(<Globe className="size-4 text-muted-foreground" />, "Endpoint Base URL SATUSEHAT")}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 border border-border/70 p-4 bg-card">
          <p className="text-xs font-bold text-foreground uppercase">Sandbox Endpoint</p>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground uppercase">OAuth2 URL</Label>
            <Input
              value={settings.satusehatSandboxAuthUrl}
              onChange={(e) => handleFieldChange("satusehatSandboxAuthUrl", e.target.value)}
              className="h-8 rounded-none font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground uppercase">FHIR R4 URL</Label>
            <Input
              value={settings.satusehatSandboxFhirUrl}
              onChange={(e) => handleFieldChange("satusehatSandboxFhirUrl", e.target.value)}
              className="h-8 rounded-none font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-3 border border-border/70 p-4 bg-card">
          <p className="text-xs font-bold text-foreground uppercase">Production Endpoint</p>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground uppercase">OAuth2 URL</Label>
            <Input
              value={settings.satusehatProductionAuthUrl}
              onChange={(e) => handleFieldChange("satusehatProductionAuthUrl", e.target.value)}
              className="h-8 rounded-none font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground uppercase">FHIR R4 URL</Label>
            <Input
              value={settings.satusehatProductionFhirUrl}
              onChange={(e) => handleFieldChange("satusehatProductionFhirUrl", e.target.value)}
              className="h-8 rounded-none font-mono text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderSatusehatPolyclinics = () => (
    <div className="space-y-4">
      {renderSectionHeader(<Building2 className="size-4 text-muted-foreground" />, "Resource Awal Master Poli")}
      <div className="overflow-x-auto border border-border/70 bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b border-border/70">
            <tr>
              <th className="py-2.5 px-3 text-left font-semibold text-muted-foreground uppercase">Poli Lokal</th>
              <th className="py-2.5 px-3 text-left font-semibold text-muted-foreground uppercase">Organization ID</th>
              <th className="py-2.5 px-3 text-left font-semibold text-muted-foreground uppercase">Location ID</th>
              <th className="py-2.5 px-3 text-right font-semibold text-muted-foreground uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {activePolyclinics.map((poli) => (
              <tr key={poli.id} className="hover:bg-muted/20">
                <td className="py-2.5 px-3 font-medium text-foreground">{poli.name}</td>
                <td className="py-2.5 px-3 font-mono text-muted-foreground">{poli.satusehat_organization_id || "-"}</td>
                <td className="py-2.5 px-3 font-mono text-muted-foreground">{poli.satusehat_location_id || "-"}</td>
                <td className="py-2.5 px-3 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={syncingPoliId === poli.id}
                    onClick={() => handleSyncPolyclinic(poli)}
                    className="h-7 text-xs rounded-none shadow-none"
                  >
                    {syncingPoliId === poli.id ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCw className="size-3 mr-1" />}
                    Sync
                  </Button>
                </td>
              </tr>
            ))}
            {activePolyclinics.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">Tidak ada master poli aktif.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSatusehatTestConnection = () => (
    <div className="space-y-4">
      {renderSectionHeader(<ShieldCheck className="size-4 text-muted-foreground" />, "Status Operasional & Test Koneksi OAuth")}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-border/70 p-3 bg-card">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">READINESS</p>
          <div className="mt-1">
            <Badge variant={satusehatStatus.ready ? "default" : "secondary"} className="rounded-none text-[10px] px-1.5 py-0">
              {satusehatStatus.ready ? "READY" : "BELUM SIAP"}
            </Badge>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">MODE AKTIF</p>
          <p className="font-medium text-foreground mt-1 text-xs uppercase">{satusehatStatus.active_mode}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">CLIENT ID</p>
          <p className="font-medium text-foreground mt-1 text-xs">{satusehatStatus.client_id_configured ? "TERISI" : "KOSONG"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">CLIENT SECRET</p>
          <p className="font-medium text-foreground mt-1 text-xs">{satusehatStatus.client_secret_configured ? "TERISI" : "KOSONG"}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadSatusehatStatus}
          className="h-8 text-xs rounded-none shadow-none"
        >
          <RefreshCw className="size-3.5 mr-1.5" />
          Refresh Status
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={testingConnection}
          onClick={handleTestConnection}
          className="h-8 text-xs rounded-none shadow-none"
        >
          {testingConnection ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <FlaskConical className="size-3.5 mr-1.5" />}
          Test Koneksi OAuth
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-semibold text-foreground uppercase">Hasil Respon Test Koneksi</Label>
        <Textarea
          value={connectionResult || "Klik 'Test Koneksi OAuth' untuk memverifikasi handshake token dengan SATUSEHAT."}
          readOnly
          className="min-h-[160px] max-h-[220px] rounded-none font-mono text-xs bg-muted/10"
        />
      </div>
    </div>
  );

  const renderSatusehatWorkbench = () => {
    const activeResult = syncResult || previewResult || autoSyncResult || "";
    const activeResultLabel = syncResult ? "Hasil Sinkronisasi" : previewResult ? "Payload Preview" : autoSyncResult ? "Hasil Auto-Sync Visit" : "Hasil Operasi Workbench";

    return (
      <div className="space-y-4">
        {renderSectionHeader(<Send className="size-4 text-muted-foreground" />, "Workbench Preview & Sinkronisasi Resource")}
        <div className="space-y-3 border border-border/70 p-4 bg-card">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground uppercase">Pilih Resource</Label>
              <select
                value={resourceKey}
                onChange={(e) => {
                  setResourceKey(e.target.value as SatusehatResourceKey);
                  setPreviewResult("");
                  setSyncResult("");
                }}
                className="w-full h-8 rounded-none border border-input bg-background px-3 text-xs"
              >
                {SATUSEHAT_RESOURCE_OPTIONS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground uppercase">{selectedResource.idLabel}</Label>
              <Input
                type="number"
                value={resourceLocalId}
                onChange={(e) => setResourceLocalId(e.target.value)}
                placeholder="Masukkan ID angka data lokal"
                className="h-8 rounded-none font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={previewLoading}
              onClick={handlePreviewResource}
              className="h-8 text-xs rounded-none shadow-none"
            >
              {previewLoading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Eye className="size-3.5 mr-1.5" />}
              Preview Payload
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={syncLoading || !satusehatSyncEnabled}
              onClick={handleSyncResource}
              className="h-8 text-xs rounded-none shadow-none"
            >
              {syncLoading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Send className="size-3.5 mr-1.5" />}
              Kirim ke SATUSEHAT
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={autoSyncLoading || !satusehatSyncEnabled}
              onClick={handleTriggerAutoSyncVisit}
              className="h-8 text-xs rounded-none shadow-none"
            >
              {autoSyncLoading ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Play className="size-3.5 mr-1.5" />}
              Auto-Sync Visit
            </Button>
          </div>

          {selectedResourcePrerequisites.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prasyarat Resource</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {selectedResourcePrerequisites.map((req, idx) => (
                  <div key={req.key || idx} className="border border-border/70 px-2 py-1 text-xs flex items-center gap-2 bg-background">
                    <span className={cn("size-2 rounded-full shrink-0", req.ready ? "bg-emerald-600" : "bg-amber-500")} />
                    <span className="font-semibold text-foreground text-[11px] truncate">{req.label}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{req.next_step || req.detail || ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground uppercase">{activeResultLabel}</Label>
              {(previewResult || syncResult || autoSyncResult) && (
                <button
                  type="button"
                  onClick={() => { setPreviewResult(""); setSyncResult(""); setAutoSyncResult(""); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Bersihkan
                </button>
              )}
            </div>
            <Textarea
              value={activeResult || "Hasil payload preview atau respons kirim SATUSEHAT akan tampil di sini."}
              readOnly
              className="min-h-[150px] max-h-[220px] rounded-none font-mono text-xs bg-muted/10"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderSatusehatLogs = () => (
    <div className="space-y-4">
      {renderSectionHeader(<TerminalSquare className="size-4 text-muted-foreground" />, "Log Aktivitas SATUSEHAT")}

      <div className="flex flex-wrap items-center justify-between gap-3 border border-border/70 p-3 bg-card">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={logOperationFilter}
            onChange={(e) => setLogOperationFilter(e.target.value as SatusehatLogOperationFilter)}
            className="h-8 rounded-none border border-input bg-background px-2 text-xs"
          >
            <option value="all">Semua Operasi</option>
            <option value="sync">sync</option>
            <option value="token">token</option>
            <option value="retry-sync">retry-sync</option>
          </select>
          <select
            value={logStatusFilter}
            onChange={(e) => setLogStatusFilter(e.target.value as SatusehatLogStatusFilter)}
            className="h-8 rounded-none border border-input bg-background px-2 text-xs"
          >
            <option value="all">Semua Status</option>
            <option value="success">Sukses</option>
            <option value="failed">Gagal</option>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={logsLoading}
          onClick={() => void loadSatusehatLogs()}
          className="h-8 text-xs rounded-none shadow-none"
        >
          {logsLoading ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <RefreshCw className="size-3.5 mr-1" />}
          Refresh Log
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {satusehatLogFilters.map((flt) => (
          <button
            key={flt.key}
            type="button"
            onClick={() => setLogQuickFilter(flt.key)}
            className={cn(
              "px-2.5 py-1 text-xs border rounded-none transition-colors",
              logQuickFilter === flt.key
                ? "border-primary bg-primary text-primary-foreground font-semibold"
                : "border-border/70 bg-card text-muted-foreground hover:bg-muted/40"
            )}
          >
            {flt.label} ({flt.count})
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
        <div className="border border-border/70 overflow-hidden bg-card">
          <div className="max-h-[480px] overflow-y-auto divide-y divide-border/60">
            {filteredSatusehatLogs.map((entry) => {
              const active = selectedLog?.id === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedLogId(entry.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 p-2.5 text-left transition-colors",
                    active ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {entry.operation} · {getSatusehatLogResourceLabel(entry.resource_type || "")}
                    </span>
                    <Badge variant={entry.success ? "default" : "destructive"} className="rounded-none text-[9px] px-1 py-0">
                      {entry.success ? "Sukses" : "Gagal"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-foreground font-medium">{new Date(entry.created_at).toLocaleString("id-ID")}</p>
                  <p className="truncate text-[10px] font-mono text-muted-foreground">{entry.error_message || `${entry.method} ${entry.endpoint}`}</p>
                </button>
              );
            })}
            {filteredSatusehatLogs.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {satusehatLogs.length === 0 ? "Belum ada log aktivitas tersimpan." : "Tidak ada log pada filter ini."}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 border border-border/70 p-4 bg-card min-w-0">
          {selectedLog ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div>
                  <p className="text-xs font-bold text-foreground uppercase">
                    Log #{selectedLog.id} · {selectedLog.operation}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{new Date(selectedLog.created_at).toLocaleString("id-ID")}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={retryingLogId === selectedLog.id}
                  onClick={() => handleRetryLog(selectedLog.id)}
                  className="h-7 text-xs rounded-none shadow-none"
                >
                  {retryingLogId === selectedLog.id ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCw className="size-3 mr-1" />}
                  Retry Log
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">METHOD & STATUS</p>
                  <p className="font-mono mt-0.5">{selectedLog.method} · {selectedLog.status_code || "-"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">ENDPOINT</p>
                  <p className="font-mono mt-0.5 truncate" title={selectedLog.endpoint}>{selectedLog.endpoint}</p>
                </div>
              </div>

              {selectedLog.error_message && (
                <div>
                  <p className="text-[10px] font-semibold text-rose-600 uppercase">PESAN ERROR</p>
                  <p className="text-xs text-rose-600 font-mono mt-0.5">{selectedLog.error_message}</p>
                </div>
              )}

              <div className="space-y-2">
                <div>
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase">Request Body</Label>
                  <Textarea value={selectedLog.request_payload || ""} readOnly className="min-h-[140px] rounded-none font-mono text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase">Response Body</Label>
                  <Textarea value={selectedLog.response_body || ""} readOnly className="min-h-[180px] rounded-none font-mono text-xs mt-1" />
                </div>
              </div>

              {retryResult && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground uppercase">Hasil Retry</Label>
                  <Textarea value={retryResult} readOnly className="min-h-[120px] rounded-none font-mono text-xs" />
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground">Pilih log di sebelah kiri untuk melihat detail.</div>
          )}
        </div>
      </div>
    </div>
  );

  if (fetching) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-muted/20 min-h-full">
      {/* Satu Card Utuh Menggabungkan Header dan Body Sesuai Halaman Detail Pasien SIMKLINIK */}
      <div className="border border-border/80 bg-card shadow-none">
        {/* Card Header (Baris Atas di dalam Satu Card) */}
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={() => navigate(-1)}
              aria-label="Kembali"
              title="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border/70 bg-muted/20">
              <PlugZap className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-foreground truncate">
                  Pengaturan Integrasi
                </h1>
                <Badge className={settings.satusehatEnabled ? "h-5 rounded-none border-0 bg-emerald-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none" : "h-5 rounded-none border-0 bg-zinc-600 px-2 text-[10px] uppercase tracking-wide text-white shadow-none"}>
                  {settings.satusehatEnabled ? "SATUSEHAT AKTIF" : "SATUSEHAT NONAKTIF"}
                </Badge>
                <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide text-muted-foreground shadow-none">
                  BPJS SEGERA HADIR
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {selectedIntegration === "satusehat" && (satusehatSideTab === "settings" || satusehatSideTab === "endpoints") && (
              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className="gap-1.5 h-8 text-xs rounded-none shadow-none"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Simpan Konfigurasi
              </Button>
            )}
          </div>
        </div>

        {/* Card Body Langsung di Dalam Card yang Sama Tanpa Pemisah */}
        <div className="p-4 sm:p-5">
          <Tabs value={selectedIntegration} onValueChange={(val) => setSelectedIntegration(val as IntegrationKey)} className="w-full">
            {/* Main Tabs (Horizontal Style Detail Pasien) */}
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 gap-6">
              <TabsTrigger
                value="satusehat"
                className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 pt-1 px-1 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
              >
                <PlugZap className="size-4" />
                Satu Sehat
              </TabsTrigger>
              <TabsTrigger
                value="bpjs"
                className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 pt-1 px-1 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground flex items-center gap-2"
              >
                <Clock className="size-4" />
                BPJS Kesehatan
              </TabsTrigger>
            </TabsList>

            {/* TAB CONTENT: SATU SEHAT */}
            <TabsContent value="satusehat" className="mt-5 space-y-6 pt-2">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* KOLOM KIRI (Gaya Profil Kiri Detail Pasien): Card Ringkasan Status & Side Tabs Navigasi */}
                <div className="lg:col-span-4 xl:col-span-3 space-y-4">
                  {/* Kartu Profil Provider */}
                  <div className="border border-border/70 bg-muted/[0.03] p-4 relative shadow-none">
                    <Badge className={cn("absolute top-3.5 right-3.5 text-[10px] font-bold tracking-wider rounded-md px-2 py-0.5 shadow-none border-0 text-white", settings.satusehatEnabled ? "bg-emerald-600 hover:bg-emerald-600" : "bg-zinc-600 hover:bg-zinc-600")}>
                      {settings.satusehatEnabled ? "ACTIVE" : "INACTIVE"}
                    </Badge>

                    <div className="flex flex-col items-center pt-2">
                      <div className="size-20 rounded-lg border border-border bg-zinc-950 dark:bg-zinc-900 text-white flex items-center justify-center font-bold shadow-sm">
                        <PlugZap className="size-10 text-primary" />
                      </div>
                      <h2 className="text-base font-bold text-center mt-3 text-foreground tracking-tight uppercase leading-snug">
                        SATUSEHAT
                      </h2>
                      <p className="text-xs text-muted-foreground text-center mt-0.5 font-mono">
                        KEMENKES RI · FHIR R4
                      </p>
                      <div className="mt-2.5">
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 border border-border rounded-md text-foreground bg-muted/30 uppercase tracking-wider">
                          {settings.satusehatActiveMode}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-border/60 my-4" />

                    <div className="space-y-3 text-xs">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">ORGANIZATION ID</p>
                        <p className="font-mono text-foreground mt-0.5 truncate">{settings.satusehatOrganizationId || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CLIENT ID</p>
                        <p className="font-mono text-foreground mt-0.5 truncate">{settings.satusehatClientId ? "TERSIMPAN" : "BELUM DIISI"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">API READINESS</p>
                        <p className="font-medium text-foreground mt-0.5">{satusehatStatus.ready ? "Siap Digunakan" : "Konfigurasi Belum Lengkap"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Sidetabs Navigasi */}
                  <div className="border border-border/70 bg-card p-1.5 space-y-1">
                    <button
                      type="button"
                      onClick={() => setSatusehatSideTab("settings")}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                        satusehatSideTab === "settings"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                      )}
                    >
                      <Key className="size-4 shrink-0" />
                      <span>Pengaturan & Kunci API</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSatusehatSideTab("endpoints")}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                        satusehatSideTab === "endpoints"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                      )}
                    >
                      <Globe className="size-4 shrink-0" />
                      <span>Endpoint API</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSatusehatSideTab("polyclinics")}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                        satusehatSideTab === "polyclinics"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                      )}
                    >
                      <Building2 className="size-4 shrink-0" />
                      <span>Pemetaan Poli</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSatusehatSideTab("test-connection")}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                        satusehatSideTab === "test-connection"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                      )}
                    >
                      <FlaskConical className="size-4 shrink-0" />
                      <span>Test Koneksi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSatusehatSideTab("workbench")}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                        satusehatSideTab === "workbench"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                      )}
                    >
                      <Send className="size-4 shrink-0" />
                      <span>Workbench Resource</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSatusehatSideTab("logs")}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                        satusehatSideTab === "logs"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                      )}
                    >
                      <TerminalSquare className="size-4 shrink-0" />
                      <span>Log Aktivitas</span>
                    </button>
                  </div>
                </div>

                {/* KOLOM KANAN: Isi Sidetab Aktif */}
                <div className="lg:col-span-8 xl:col-span-9 min-w-0">
                  {satusehatSideTab === "settings" && renderSatusehatSettings()}
                  {satusehatSideTab === "endpoints" && renderSatusehatEndpoints()}
                  {satusehatSideTab === "polyclinics" && renderSatusehatPolyclinics()}
                  {satusehatSideTab === "test-connection" && renderSatusehatTestConnection()}
                  {satusehatSideTab === "workbench" && renderSatusehatWorkbench()}
                  {satusehatSideTab === "logs" && renderSatusehatLogs()}
                </div>
              </div>
            </TabsContent>

            {/* TAB CONTENT: BPJS */}
            <TabsContent value="bpjs" className="mt-5 space-y-6 pt-2">
              <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-border/80 bg-background/50 my-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/40 text-muted-foreground mb-4">
                  <Clock className="size-7 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Integrasi BPJS Kesehatan</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-md">
                  konten akan segera datang pada versi selanjutnya stay tune
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
