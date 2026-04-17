import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  CalendarCheck2,
  Clock3,
  FlaskConical,
  Loader2,
  Pill,
  RefreshCw,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import {
  dashboardApi,
  type DashboardSummary,
} from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

// ---- Chart configs ----
const trendChartConfig: ChartConfig = {
  total: { label: 'Total', color: '#0f766e' },
  completed: { label: 'Selesai', color: '#f59e0b' },
  cancelled: { label: 'Batal', color: '#dc2626' },
};

const revenueChartConfig: ChartConfig = {
  amount: { label: 'Pendapatan', color: '#0d9488' },
};

const polyChartConfig: ChartConfig = {
  visits: { label: 'Kunjungan', color: '#0f766e' },
};

const diagnosisChartConfig: ChartConfig = {
  count: { label: 'Jumlah', color: '#7c3aed' },
};

const patientTrendConfig: ChartConfig = {
  new_patients: { label: 'Pasien Baru', color: '#0ea5e9' },
  total_visits: { label: 'Total Kunjungan', color: '#f59e0b' },
};

const labRadChartConfig: ChartConfig = {
  ordered: { label: 'Ordered', color: '#f59e0b' },
  preparing: { label: 'Preparing', color: '#3b82f6' },
  completed: { label: 'Completed', color: '#10b981' },
};

const statusColors = ['#1d4ed8', '#d97706', '#0f766e', '#dc2626'];
const rxPieColors = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981'];
const queuePieColors = ['#f59e0b', '#0ea5e9', '#8b5cf6', '#10b981'];

// ---- Helpers ----

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatCurrencyShort(value: number) {
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `Rp${(value / 1_000).toFixed(0)}rb`;
  return `Rp${value}`;
}

function formatNumber(value: number) {
  return value.toLocaleString('id-ID');
}

function shortDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { weekday: 'short' });
}

function shortMonth(monthStr: string) {
  const d = new Date(monthStr + '-01T00:00:00');
  if (Number.isNaN(d.getTime())) return monthStr;
  return d.toLocaleDateString('id-ID', { month: 'short' });
}

function visitStatusLabel(status: string) {
  switch (status) {
    case 'registered': return 'Terdaftar';
    case 'in_progress': return 'Berlangsung';
    case 'completed': return 'Selesai';
    case 'cancelled': return 'Batal';
    default: return status;
  }
}

function visitStatusClass(status: string) {
  switch (status) {
    case 'registered': return 'bg-blue-100 text-blue-800';
    case 'in_progress': return 'bg-amber-100 text-amber-800';
    case 'completed': return 'bg-emerald-100 text-emerald-800';
    case 'cancelled': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-700';
  }
}

// ---- Component ----

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    setPageTitle('Dashboard');
    void loadData();
  }, []);

  const loadData = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await dashboardApi.getSummary();
      setData(res.data?.data || null);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  };

  const d = data;

  // derived
  const completionRate = useMemo(() => {
    if (!d || d.today_visits === 0) return 0;
    return Math.round((d.today_completed / d.today_visits) * 100);
  }, [d]);

  const monthCompletionRate = useMemo(() => {
    if (!d || d.month_visits === 0) return 0;
    return Math.round((d.month_completed / d.month_visits) * 100);
  }, [d]);

  const queueTotal = useMemo(() => {
    if (!d) return 0;
    return d.queue_waiting + d.queue_called + d.queue_processing + d.queue_done;
  }, [d]);

  const trendData = useMemo(() => {
    return (d?.visit_trend_7d || []).map((item) => ({
      ...item,
      label: shortDay(item.date),
    }));
  }, [d]);

  const revenueData = useMemo(() => {
    return (d?.revenue_trend_7d || []).map((item) => ({
      ...item,
      label: shortDay(item.date),
    }));
  }, [d]);

  const patientData = useMemo(() => {
    return (d?.patient_trend_6m || []).map((item) => ({
      ...item,
      label: shortMonth(item.month),
    }));
  }, [d]);

  const statusPie = useMemo(() => {
    if (!d) return [];
    return [
      { key: 'registered', label: 'Terdaftar', value: d.today_registered, color: statusColors[0] },
      { key: 'in_progress', label: 'Berlangsung', value: d.today_in_progress, color: statusColors[1] },
      { key: 'completed', label: 'Selesai', value: d.today_completed, color: statusColors[2] },
      { key: 'cancelled', label: 'Batal', value: d.today_cancelled, color: statusColors[3] },
    ];
  }, [d]);

  const queuePie = useMemo(() => {
    if (!d) return [];
    return [
      { key: 'waiting', label: 'Menunggu', value: d.queue_waiting, color: queuePieColors[0] },
      { key: 'called', label: 'Dipanggil', value: d.queue_called, color: queuePieColors[1] },
      { key: 'processing', label: 'Diproses', value: d.queue_processing, color: queuePieColors[2] },
      { key: 'done', label: 'Selesai', value: d.queue_done, color: queuePieColors[3] },
    ];
  }, [d]);

  const rxPie = useMemo(() => {
    if (!d) return [];
    return [
      { key: 'ordered', label: 'Ordered', value: d.rx_ordered, color: rxPieColors[0] },
      { key: 'preparing', label: 'Preparing', value: d.rx_preparing, color: rxPieColors[1] },
      { key: 'ready', label: 'Ready', value: d.rx_ready, color: rxPieColors[2] },
      { key: 'dispensed', label: 'Dispensed', value: d.rx_dispensed, color: rxPieColors[3] },
    ];
  }, [d]);

  const rxTotal = useMemo(() => {
    if (!d) return 0;
    return d.rx_ordered + d.rx_preparing + d.rx_ready + d.rx_dispensed;
  }, [d]);

  const labRadData = useMemo(() => {
    if (!d) return [];
    return [
      { name: 'Lab', ordered: d.lab_ordered, preparing: d.lab_preparing, completed: d.lab_completed },
      { name: 'Radiologi', ordered: d.rad_ordered, preparing: 0, completed: d.rad_completed },
    ];
  }, [d]);

  if (loading || !d) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      {/* ====== HEADER ====== */}
      <section className="relative overflow-hidden border border-border/70 bg-[linear-gradient(125deg,#fffbeb_0%,#ecfeff_48%,#f8fafc_100%)] p-5 lg:p-7">
        <div className="pointer-events-none absolute -left-10 -top-14 h-40 w-40 rounded-full bg-amber-300/25 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-6 h-52 w-52 rounded-full bg-cyan-300/25 blur-2xl" />

        <div className="relative z-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-none border-0 bg-stone-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">Dashboard Operasional</Badge>
              <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">{formatNumber(d.today_visits)} kunjungan hari ini</Badge>
              {d.invoices_unpaid > 0 && (
                <Badge variant="outline" className="rounded-none border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-800">{d.invoices_unpaid} invoice belum lunas</Badge>
              )}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground lg:text-2xl">Selamat datang, {user?.full_name || 'Tim Klinik'}</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Ringkasan operasional klinik hari ini. Pantau kunjungan, antrian, pendapatan, farmasi, dan laboratorium dalam satu tempat.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Data per: <span className="font-medium text-foreground">{new Date(d.generated_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></span>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 rounded-none px-3 text-xs" onClick={() => void loadData(true)} disabled={refreshing}>
                {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Segarkan
              </Button>
            </div>
          </div>

          {/* Quick stats summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-border/70 bg-background/90 px-3 py-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Hari Ini</p>
              <p className="text-lg font-bold text-emerald-700">{formatCurrency(d.revenue_today)}</p>
            </div>
            <div className="border border-border/70 bg-background/90 px-3 py-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Bulan Ini</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(d.revenue_month)}</p>
            </div>
            <div className="border border-border/70 bg-background/90 px-3 py-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Completion Rate</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-foreground">{completionRate}%</p>
                <Progress value={completionRate} className="h-1.5 flex-1 rounded-none [&>div]:bg-emerald-600" />
              </div>
            </div>
            <div className="border border-border/70 bg-background/90 px-3 py-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Bulan Ini</p>
              <p className="text-lg font-bold text-foreground">{formatNumber(d.month_visits)} <span className="text-xs font-normal text-muted-foreground">kunjungan</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== KPI CARDS ====== */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={CalendarCheck2} iconClass="bg-emerald-100 text-emerald-700" title="Kunjungan Hari Ini" value={d.today_visits} sub={`${d.today_completed} selesai · ${d.today_in_progress} berjalan`} />
        <KpiCard icon={Clock3} iconClass="bg-amber-100 text-amber-800" title="Antrian Menunggu" value={d.queue_waiting + d.queue_called} sub={`${d.queue_processing} diproses · ${d.queue_done} selesai`} />
        <KpiCard icon={Users} iconClass="bg-sky-100 text-sky-700" title="Total Pasien" value={d.total_patients} sub={`+${d.new_patients_month} bulan ini`} />
        <KpiCard icon={Stethoscope} iconClass="bg-violet-100 text-violet-700" title="Dokter Aktif" value={d.active_doctors} sub={`${d.active_polyclinics} poli aktif`} />
        <KpiCard icon={Banknote} iconClass="bg-teal-100 text-teal-700" title="Invoice Lunas" value={d.invoices_paid} sub={`${d.invoices_unpaid} belum lunas`} />
        <KpiCard icon={Pill} iconClass="bg-rose-100 text-rose-700" title="Resep Hari Ini" value={rxTotal} sub={`${d.rx_dispensed} selesai · ${d.rx_ordered + d.rx_preparing} proses`} />
      </section>

      {/* ====== ROW 1: Visit Trend + Status Pie ====== */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-emerald-600" /> Tren Kunjungan 7 Hari</CardTitle>
            <p className="text-xs text-muted-foreground">Total, selesai, dan batal per hari.</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendChartConfig} className="h-[260px] w-full aspect-auto">
              <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="total" stroke="var(--color-total)" fill="var(--color-total)" fillOpacity={0.16} strokeWidth={2} />
                <Area type="monotone" dataKey="completed" stroke="var(--color-completed)" fill="var(--color-completed)" fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="cancelled" stroke="var(--color-cancelled)" fill="var(--color-cancelled)" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base">Status Kunjungan Hari Ini</CardTitle>
            <p className="text-xs text-muted-foreground">Komposisi throughput layanan harian.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ChartContainer config={{ value: { label: 'Jumlah', color: '#0f766e' } }} className="h-[180px] w-full aspect-auto">
              <PieChart>
                <Pie data={statusPie.filter((i) => i.value > 0)} dataKey="value" nameKey="label" innerRadius={48} outerRadius={72} paddingAngle={3}>
                  {statusPie.filter((i) => i.value > 0).map((item) => <Cell key={item.key} fill={item.color} />)}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>
            <div className="grid grid-cols-2 gap-1.5">
              {statusPie.map((item) => (
                <div key={item.key} className="flex items-center gap-2 border border-border/60 px-2.5 py-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-foreground">{item.label}</span>
                  <span className="ml-auto text-xs font-medium text-foreground">{formatNumber(item.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ====== ROW 2: Revenue Trend + Top Polyclinics ====== */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4 text-teal-600" /> Pendapatan 7 Hari Terakhir</CardTitle>
            <p className="text-xs text-muted-foreground">Tren pendapatan harian dari pembayaran.</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={revenueChartConfig} className="h-[240px] w-full aspect-auto">
              <BarChart data={revenueData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrencyShort(v as number)} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />} />
                <Bar dataKey="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base">Top Poliklinik Hari Ini</CardTitle>
            <p className="text-xs text-muted-foreground">Poliklinik dengan volume kunjungan tertinggi.</p>
          </CardHeader>
          <CardContent>
            {(d.top_polyclinics || []).length === 0 ? (
              <div className="border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">Belum ada data.</div>
            ) : (
              <ChartContainer config={polyChartConfig} className="h-[240px] w-full aspect-auto">
                <BarChart data={d.top_polyclinics} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={100} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="visits" fill="var(--color-visits)" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ====== ROW 3: Queue Donut + Pharmacy Donut + Lab/Radiology Bar ====== */}
      <section className="grid gap-4 md:grid-cols-3">
        {/* Queue donut */}
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-amber-600" /> Antrian Registrasi</CardTitle>
            <p className="text-xs text-muted-foreground">{queueTotal} total antrian hari ini</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {queueTotal === 0 ? (
              <div className="border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">Belum ada antrian.</div>
            ) : (
              <>
                <ChartContainer config={{ value: { label: 'Antrian', color: '#f59e0b' } }} className="h-[160px] w-full aspect-auto">
                  <PieChart>
                    <Pie data={queuePie.filter((i) => i.value > 0)} dataKey="value" nameKey="label" innerRadius={42} outerRadius={64} paddingAngle={3}>
                      {queuePie.filter((i) => i.value > 0).map((item) => <Cell key={item.key} fill={item.color} />)}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
                  </PieChart>
                </ChartContainer>
                <div className="grid grid-cols-2 gap-1.5">
                  {queuePie.map((item) => (
                    <div key={item.key} className="flex items-center gap-2 border border-border/60 px-2.5 py-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-foreground">{item.label}</span>
                      <span className="ml-auto text-xs font-semibold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pharmacy donut */}
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Pill className="h-4 w-4 text-rose-600" /> Alur Farmasi</CardTitle>
            <p className="text-xs text-muted-foreground">{rxTotal} resep hari ini</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {rxTotal === 0 ? (
              <div className="border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">Belum ada resep.</div>
            ) : (
              <>
                <ChartContainer config={{ value: { label: 'Resep', color: '#e11d48' } }} className="h-[160px] w-full aspect-auto">
                  <PieChart>
                    <Pie data={rxPie.filter((i) => i.value > 0)} dataKey="value" nameKey="label" innerRadius={42} outerRadius={64} paddingAngle={3}>
                      {rxPie.filter((i) => i.value > 0).map((item) => <Cell key={item.key} fill={item.color} />)}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
                  </PieChart>
                </ChartContainer>
                <div className="grid grid-cols-2 gap-1.5">
                  {rxPie.map((item) => (
                    <div key={item.key} className="flex items-center gap-2 border border-border/60 px-2.5 py-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-foreground">{item.label}</span>
                      <span className="ml-auto text-xs font-semibold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Lab + Radiology grouped bar */}
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-4 w-4 text-indigo-600" /> Lab &amp; Radiologi</CardTitle>
            <p className="text-xs text-muted-foreground">Perbandingan status order penunjang.</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={labRadChartConfig} className="h-[220px] w-full aspect-auto">
              <BarChart data={labRadData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="ordered" fill="var(--color-ordered)" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar dataKey="preparing" fill="var(--color-preparing)" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} barSize={18} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      {/* ====== ROW 4: Top Diagnoses Chart + Patient Growth ====== */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Top diagnoses - horizontal bar */}
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Stethoscope className="h-4 w-4 text-violet-600" /> Top Diagnosa Bulan Ini</CardTitle>
            <p className="text-xs text-muted-foreground">5 diagnosa ICD-10 paling sering bulan ini.</p>
          </CardHeader>
          <CardContent>
            {(d.top_diagnoses || []).length === 0 ? (
              <div className="border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">Belum ada data diagnosa.</div>
            ) : (
              <ChartContainer config={diagnosisChartConfig} className="h-[240px] w-full aspect-auto">
                <BarChart data={d.top_diagnoses.map((item) => ({ ...item, label: `${item.code} - ${item.name.length > 30 ? item.name.slice(0, 30) + '…' : item.name}` }))} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={180} tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Patient growth 6 months */}
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-sky-600" /> Tren Pasien &amp; Kunjungan 6 Bulan</CardTitle>
            <p className="text-xs text-muted-foreground">Pasien baru dan total kunjungan per bulan.</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={patientTrendConfig} className="h-[240px] w-full aspect-auto">
              <AreaChart data={patientData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="total_visits" stroke="var(--color-total_visits)" fill="var(--color-total_visits)" fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="new_patients" stroke="var(--color-new_patients)" fill="var(--color-new_patients)" fillOpacity={0.16} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      {/* ====== ROW 5: Revenue Panel + Low Stock + Recent Visits ====== */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Revenue panel */}
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4 text-teal-600" /> Pendapatan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border border-border/70 bg-emerald-50/60 px-4 py-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Hari Ini</p>
              <p className="text-2xl font-bold text-emerald-700">{formatCurrency(d.revenue_today)}</p>
              <p className="text-xs text-muted-foreground">{d.invoices_paid} invoice lunas · {d.invoices_unpaid} belum lunas</p>
            </div>
            <div className="border border-border/70 bg-background px-4 py-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Bulan Ini</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(d.revenue_month)}</p>
              <p className="text-xs text-muted-foreground">{formatNumber(d.month_visits)} kunjungan · {monthCompletionRate}% selesai</p>
            </div>
          </CardContent>
        </Card>

        {/* Low stock */}
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Stok Obat Rendah
            </CardTitle>
            <p className="text-xs text-muted-foreground">Obat dengan stok di bawah minimum.</p>
          </CardHeader>
          <CardContent>
            {(d.low_stock || []).length === 0 ? (
              <div className="border border-dashed border-emerald-200 bg-emerald-50/60 px-4 py-8 text-center text-sm text-emerald-800">Semua stok obat aman.</div>
            ) : (
              <div className="space-y-2">
                {d.low_stock.map((item) => {
                  const pct = item.min_stock > 0 ? Math.min(100, Math.round((item.current_stock / item.min_stock) * 100)) : 0;
                  const isOut = item.current_stock === 0;
                  return (
                    <div key={item.id} className={cn('border px-3 py-2', isOut ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/40')}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                        <span className={cn('text-xs font-bold', isOut ? 'text-red-700' : 'text-amber-700')}>{item.current_stock}/{item.min_stock}</span>
                      </div>
                      <Progress value={pct} className={cn('mt-1 h-1.5 rounded-none', isOut ? '[&>div]:bg-red-500' : '[&>div]:bg-amber-500')} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent visits */}
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base">Kunjungan Terbaru Hari Ini</CardTitle>
          </CardHeader>
          <CardContent>
            {(d.recent_visits || []).length === 0 ? (
              <div className="border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">Belum ada kunjungan hari ini.</div>
            ) : (
              <div className="space-y-1.5">
                {d.recent_visits.map((item) => (
                  <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-border/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.patient_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.doctor_name} · {item.poly_name}</p>
                    </div>
                    <Badge className={cn('rounded-none text-[10px]', visitStatusClass(item.status))}>{visitStatusLabel(item.status)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ---- Sub-components ----

function KpiCard({ icon: Icon, iconClass, title, value, sub }: { icon: React.ElementType; iconClass: string; title: string; value: number; sub: string }) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
        <div className="flex items-start justify-between gap-3">
          <div className={cn('rounded-none p-2.5', iconClass)}><Icon className="h-4 w-4" /></div>
          <div className="text-right">
            <p className="text-2xl font-semibold leading-none text-foreground">{formatNumber(value)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
