import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

/* ------------------------------------------------------------------ */
/*  Plain table — NO DataTable, NO overflow-hidden wrappers            */
/* ------------------------------------------------------------------ */
function TTETable<T>({
  columns,
  data,
  searchPlaceholder,
  emptyMessage,
}: {
  columns: ColumnDef<T, any>[];
  data: T[];
  searchPlaceholder: string;
  emptyMessage: string;
}) {
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <div>
      <div className="pb-4">
        <Input
          placeholder={searchPlaceholder}
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-full max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { headerClassName?: string } | undefined;
                  return (
                    <TableHead key={header.id} className={meta?.headerClassName}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { cellClassName?: string } | undefined;
                    return (
                      <TableCell key={cell.id} className={meta?.cellClassName}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-4 pt-3">
        <p className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} row(s)
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-none" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-none" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function TTERequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<TteInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [previewingId, setPreviewingId] = useState<number | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const response = await tteApi.getInbox();
      setRequests(response.data.data || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal memuat inbox TTE", description: error.response?.data?.error || "Daftar request TTE tidak dapat dimuat." });
    } finally {
      setLoading(false);
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
      toast({ variant: "success", title: "Request TTE di-ACC", description: `${updated.document_label} sudah ditandatangani secara internal.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal ACC request TTE", description: error.response?.data?.error || "Request TTE tidak dapat diproses." });
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
      toast({ variant: "destructive", title: "Gagal membuka preview dokumen", description: error.response?.data?.error || error.message || "Preview PDF tidak tersedia." });
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
          <div className="space-y-1.5 py-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">{item.document_label}</p>
              <Badge variant="outline" className={cn("rounded-none shadow-none", getStatusClassName(item.status))}>{item.status_label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{item.document_type || "-"}</p>
          </div>
        );
      },
      meta: { headerClassName: "w-[280px]", cellClassName: "align-top" },
    },
    {
      accessorFn: (item) => `${item.patient_name} ${item.visit_number} ${item.polyclinic_name}`,
      id: "visit",
      header: "Pasien / Kunjungan",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1 py-1">
            <p className="text-sm font-medium">{item.patient_name || "-"}</p>
            <p className="font-mono text-xs text-muted-foreground">{item.visit_number || "-"}</p>
            <p className="text-xs text-muted-foreground">{item.polyclinic_name || "Poliklinik"}</p>
          </div>
        );
      },
      meta: { headerClassName: "w-[220px]", cellClassName: "align-top" },
    },
    {
      accessorFn: (item) => `${item.requested_by_name} ${item.requested_at} ${item.signed_at || ""}`,
      id: "timeline",
      header: "Timeline",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1 py-1 text-xs">
            <p className="text-muted-foreground">Diminta oleh {item.requested_by_name || "-"} pada {formatDateTime(item.requested_at)}</p>
            {item.signed_at ? <p className="text-emerald-700">Ditandatangani {formatDateTime(item.signed_at)}</p> : null}
            {item.responded_at && !item.signed_at ? <p className="text-muted-foreground">Diproses {formatDateTime(item.responded_at)}</p> : null}
          </div>
        );
      },
      meta: { headerClassName: "w-[260px]", cellClassName: "align-top" },
    },
    {
      accessorFn: (item) => `${item.signer_name} ${item.notes || ""} ${item.rejection_reason || ""}`,
      id: "notes",
      header: "Signer / Catatan",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1 py-1 text-xs">
            <p className="text-muted-foreground">Signer: {item.signer_name || "-"}</p>
            {item.rejection_reason ? <p className="text-rose-700">Alasan: {item.rejection_reason}</p> : null}
            {item.notes ? <p className="text-muted-foreground">Catatan: {item.notes}</p> : null}
          </div>
        );
      },
      meta: { headerClassName: "w-[240px]", cellClassName: "align-top" },
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex flex-wrap justify-end gap-2 py-1">
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => void handlePreview(item)} disabled={previewingId === item.id || !item.print_path}>
              {previewingId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
              Preview
            </Button>
            <Button type="button" size="sm" className="rounded-none" onClick={() => void handleApprove(item.id)} disabled={approvingId === item.id}>
              {approvingId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              ACC
            </Button>
          </div>
        );
      },
      meta: { headerClassName: "w-[170px] text-right", cellClassName: "align-top" },
    },
  ], [approvingId, previewingId]);

  const historyColumns = useMemo<ColumnDef<TteInboxItem>[]>(() => [
    {
      accessorKey: "document_label",
      header: "Dokumen",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1.5 py-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">{item.document_label}</p>
              <Badge variant="outline" className={cn("rounded-none shadow-none", getStatusClassName(item.status))}>{item.status_label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{item.document_type || "-"}</p>
          </div>
        );
      },
      meta: { headerClassName: "w-[280px]", cellClassName: "align-top" },
    },
    {
      accessorFn: (item) => `${item.patient_name} ${item.visit_number} ${item.polyclinic_name}`,
      id: "visit",
      header: "Pasien / Kunjungan",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1 py-1">
            <p className="text-sm font-medium">{item.patient_name || "-"}</p>
            <p className="font-mono text-xs text-muted-foreground">{item.visit_number || "-"}</p>
            <p className="text-xs text-muted-foreground">{item.polyclinic_name || "Poliklinik"}</p>
          </div>
        );
      },
      meta: { headerClassName: "w-[220px]", cellClassName: "align-top" },
    },
    {
      accessorFn: (item) => `${item.requested_by_name} ${item.requested_at} ${item.signed_at || ""} ${item.responded_at || ""}`,
      id: "timeline",
      header: "Timeline",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1 py-1 text-xs">
            <p className="text-muted-foreground">Diminta oleh {item.requested_by_name || "-"} pada {formatDateTime(item.requested_at)}</p>
            {item.signed_at ? (
              <p className="text-emerald-700">Ditandatangani {formatDateTime(item.signed_at)}</p>
            ) : item.responded_at ? (
              <p className="text-muted-foreground">Diproses {formatDateTime(item.responded_at)}</p>
            ) : null}
          </div>
        );
      },
      meta: { headerClassName: "w-[260px]", cellClassName: "align-top" },
    },
    {
      accessorFn: (item) => `${item.signer_name} ${item.notes || ""} ${item.rejection_reason || ""}`,
      id: "notes",
      header: "Signer / Catatan",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-1 py-1 text-xs">
            <p className="text-muted-foreground">Signer: {item.signer_name || "-"}</p>
            {item.rejection_reason ? <p className="text-rose-700">Alasan: {item.rejection_reason}</p> : null}
            {item.notes ? <p className="text-muted-foreground">Catatan: {item.notes}</p> : null}
          </div>
        );
      },
      meta: { headerClassName: "w-[240px]", cellClassName: "align-top" },
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex justify-end py-1">
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => void handlePreview(item)} disabled={previewingId === item.id || !item.print_path}>
              {previewingId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
              Preview
            </Button>
          </div>
        );
      },
      meta: { headerClassName: "w-[110px] text-right", cellClassName: "align-top" },
    },
  ], [previewingId]);

  return (
    <div className="p-4">
      <div className="border border-border/70 bg-background">
        {/* Header */}
        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">ACC Request TTE</h2>
              <p className="text-[11px] leading-5 text-muted-foreground">Tinjau dokumen yang dimintakan TTE ke akun Anda, preview PDF, lalu ACC dokumen yang sudah sesuai.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">{requests.length} data</Badge>
              <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">{pendingRequests.length} menunggu ACC</Badge>
              <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">{historyRequests.length} riwayat</Badge>
              <Button type="button" variant="outline" className="gap-1.5 rounded-none" onClick={() => void loadRequests()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Muat Ulang
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Tabs defaultValue="pending">
              <TabsList className="w-full justify-start rounded-none border-0 bg-transparent p-0">
                <TabsTrigger value="pending" className="rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-3 py-2 text-sm text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
                  Menunggu ACC
                </TabsTrigger>
                <TabsTrigger value="history" className="rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-3 py-2 text-sm text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">
                  Riwayat
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-4">
                <TTETable columns={pendingColumns} data={pendingRequests} searchPlaceholder="Cari dokumen / pasien / kunjungan..." emptyMessage="Tidak ada request TTE yang sedang menunggu ACC." />
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <TTETable columns={historyColumns} data={historyRequests} searchPlaceholder="Cari dokumen / pasien / kunjungan..." emptyMessage="Belum ada riwayat request TTE untuk akun ini." />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
