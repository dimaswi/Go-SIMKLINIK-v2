import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, FileSignature, FileText, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { api, tteApi, type TteInboxItem } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { setPageTitle } from "@/lib/page-title";
import { notifyTTEBadgeRefresh } from "@/lib/tte-badge-events";
import { cn } from "@/lib/utils";

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function getStatusClassName(status: string) {
  switch (status) {
    case "signed":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "pending":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "rejected":
      return "border-rose-300 bg-rose-50 text-rose-700";
    case "revoked":
      return "border-slate-300 bg-slate-100 text-slate-700";
    default:
      return "border-border bg-background text-foreground";
  }
}

async function openAuthenticatedPdf(printPath: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Izinkan popup browser untuk membuka preview dokumen.");
  printWindow.document.write('<html><head><title>Menyiapkan dokumen...</title></head><body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;">Menyiapkan dokumen PDF...</body></html>');
  printWindow.document.close();
  try {
    const response = await api.get(printPath.replace(/^\/api/, ""), { responseType: "blob" });
    const contentType = response.headers["content-type"] || "application/pdf";
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType });
    const objectUrl = URL.createObjectURL(blob);
    printWindow.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

export default function TTERequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<TteInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [search, setSearch] = useState("");
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [previewingId, setPreviewingId] = useState<number | null>(null);

  const loadRequests = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await tteApi.getInbox();
      setRequests(response.data.data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal memuat inbox TTE",
        description: error.response?.data?.error || "Daftar request TTE tidak dapat dimuat.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    setPageTitle("ACC Request TTE");
    void loadRequests();
  }, [loadRequests]);

  const pendingRequests = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const historyRequests = useMemo(() => requests.filter((r) => r.status !== "pending"), [requests]);

  const handleApprove = async (requestId: number) => {
    setApprovingId(requestId);
    try {
      const response = await tteApi.approve(requestId);
      const updated = response.data.data;
      setRequests((cur) => cur.map((item) => (item.id === updated.id ? updated : item)));
      notifyTTEBadgeRefresh();
      toast({
        variant: "success",
        title: "Request TTE di-ACC",
        description: `${updated.document_label} sudah ditandatangani secara internal.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal ACC request TTE",
        description: error.response?.data?.error || "Request TTE tidak dapat diproses.",
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handlePreview = async (item: TteInboxItem) => {
    if (!item.print_path) return;
    setPreviewingId(item.id);
    try {
      await openAuthenticatedPdf(item.print_path);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal membuka preview dokumen",
        description: error.response?.data?.error || error.message || "Preview PDF tidak tersedia.",
      });
    } finally {
      setPreviewingId(null);
    }
  };

  const pendingColumns = useMemo<ColumnDef<TteInboxItem>[]>(() => [
    {
      accessorKey: "document_label",
      header: "Dokumen",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="max-w-[260px] space-y-0.5">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold tracking-tight">{item.document_label}</p>
              <Badge variant="outline" className={cn("shrink-0 rounded-none shadow-none text-xs", getStatusClassName(item.status))}>
                {item.status_label}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">{item.document_type || "-"}</p>
          </div>
        );
      },
    },
    {
      accessorFn: (item) => `${item.patient_name} ${item.visit_number} ${item.polyclinic_name}`,
      id: "visit",
      header: "Pasien / Kunjungan",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="max-w-[220px] space-y-0.5">
            <p className="truncate text-sm font-medium">{item.patient_name || "-"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.visit_number || "-"} · {item.polyclinic_name || "Poliklinik"}
            </p>
          </div>
        );
      },
    },
    {
      accessorFn: (item) => `${item.requested_by_name} ${item.requested_at} ${item.signed_at || ""}`,
      id: "timeline",
      header: "Timeline",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="max-w-[260px] space-y-0.5 text-xs">
            <p className="truncate text-muted-foreground">
              Diminta oleh {item.requested_by_name || "-"} · {formatDateTime(item.requested_at)}
            </p>
            {item.signed_at ? (
              <p className="truncate text-emerald-700">Ditandatangani {formatDateTime(item.signed_at)}</p>
            ) : item.responded_at ? (
              <p className="truncate text-muted-foreground">Diproses {formatDateTime(item.responded_at)}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorFn: (item) => `${item.signer_name} ${item.notes || ""} ${item.rejection_reason || ""}`,
      id: "notes",
      header: "Signer / Catatan",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="max-w-[220px] space-y-0.5 text-xs">
            <p className="truncate font-medium text-foreground">Signer: {item.signer_name || "-"}</p>
            {item.rejection_reason ? <p className="truncate text-rose-700">Alasan: {item.rejection_reason}</p> : null}
            {item.notes ? <p className="truncate text-muted-foreground">Catatan: {item.notes}</p> : null}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs rounded-none shadow-none"
              onClick={() => void handlePreview(item)}
              disabled={previewingId === item.id || !item.print_path}
            >
              {previewingId === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
              Preview
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-2.5 text-xs rounded-none shadow-none"
              onClick={() => void handleApprove(item.id)}
              disabled={approvingId === item.id}
            >
              {approvingId === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              ACC
            </Button>
          </div>
        );
      },
    },
  ], [approvingId, previewingId]);

  const historyColumns = useMemo<ColumnDef<TteInboxItem>[]>(() => [
    {
      accessorKey: "document_label",
      header: "Dokumen",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="max-w-[260px] space-y-0.5">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold tracking-tight">{item.document_label}</p>
              <Badge variant="outline" className={cn("shrink-0 rounded-none shadow-none text-xs", getStatusClassName(item.status))}>
                {item.status_label}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">{item.document_type || "-"}</p>
          </div>
        );
      },
    },
    {
      accessorFn: (item) => `${item.patient_name} ${item.visit_number} ${item.polyclinic_name}`,
      id: "visit",
      header: "Pasien / Kunjungan",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="max-w-[220px] space-y-0.5">
            <p className="truncate text-sm font-medium">{item.patient_name || "-"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.visit_number || "-"} · {item.polyclinic_name || "Poliklinik"}
            </p>
          </div>
        );
      },
    },
    {
      accessorFn: (item) => `${item.requested_by_name} ${item.requested_at} ${item.signed_at || ""} ${item.responded_at || ""}`,
      id: "timeline",
      header: "Timeline",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="max-w-[260px] space-y-0.5 text-xs">
            <p className="truncate text-muted-foreground">
              Diminta oleh {item.requested_by_name || "-"} · {formatDateTime(item.requested_at)}
            </p>
            {item.signed_at ? (
              <p className="truncate text-emerald-700">Ditandatangani {formatDateTime(item.signed_at)}</p>
            ) : item.responded_at ? (
              <p className="truncate text-muted-foreground">Diproses {formatDateTime(item.responded_at)}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorFn: (item) => `${item.signer_name} ${item.notes || ""} ${item.rejection_reason || ""}`,
      id: "notes",
      header: "Signer / Catatan",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="max-w-[220px] space-y-0.5 text-xs">
            <p className="truncate font-medium text-foreground">Signer: {item.signer_name || "-"}</p>
            {item.rejection_reason ? <p className="truncate text-rose-700">Alasan: {item.rejection_reason}</p> : null}
            {item.notes ? <p className="truncate text-muted-foreground">Catatan: {item.notes}</p> : null}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex justify-end whitespace-nowrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs rounded-none shadow-none"
              onClick={() => void handlePreview(item)}
              disabled={previewingId === item.id || !item.print_path}
            >
              {previewingId === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
              Preview
            </Button>
          </div>
        );
      },
    },
  ], [previewingId]);

  const displayedList = activeTab === "pending" ? pendingRequests : historyRequests;

  const filteredData = useMemo(() => {
    if (!search.trim()) return displayedList;
    const q = search.toLowerCase();
    return displayedList.filter((item) =>
      item.document_label?.toLowerCase().includes(q) ||
      item.patient_name?.toLowerCase().includes(q) ||
      item.visit_number?.toLowerCase().includes(q) ||
      item.polyclinic_name?.toLowerCase().includes(q) ||
      item.signer_name?.toLowerCase().includes(q) ||
      item.requested_by_name?.toLowerCase().includes(q)
    );
  }, [displayedList, search]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="border border-border bg-card shadow-none">
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center border border-border bg-muted/20">
              <FileSignature className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Permintaan TTE
              </h1>
              <p className="text-xs text-muted-foreground">
                {activeTab === "pending"
                  ? `Daftar permintaan persetujuan tanda tangan elektronik (${pendingRequests.length} menunggu)`
                  : `Riwayat permintaan tanda tangan elektronik (${historyRequests.length} riwayat)`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-none border border-border/70 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("pending")}
                className={`h-7 px-3 text-xs font-medium transition-colors ${
                  activeTab === "pending"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Menunggu ACC ({pendingRequests.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`h-7 px-3 text-xs font-medium transition-colors ${
                  activeTab === "history"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Riwayat ({historyRequests.length})
              </button>
            </div>

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari dokumen, pasien, dokter..."
              className="h-9 w-52 sm:w-60 rounded-none text-xs focus:ring-inset"
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadRequests(true)}
              disabled={refreshing}
              className="h-9 px-3 rounded-none text-xs shadow-none shrink-0"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Segarkan
            </Button>
          </div>
        </div>

        <div className="p-0">
          <DataTable
            columns={activeTab === "pending" ? pendingColumns : historyColumns}
            data={filteredData}
            showSearch={false}
            showColumnVisibility={false}
            showSelectionSummary={false}
            pageSize={10}
            emptyMessage={
              activeTab === "pending"
                ? "Tidak ada request TTE yang sedang menunggu ACC."
                : "Belum ada riwayat request TTE untuk akun ini."
            }
          />
        </div>
      </div>
    </div>
  );
}
