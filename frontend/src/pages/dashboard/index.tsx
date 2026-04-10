import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  CalendarCheck2,
  Clock3,
  Loader2,
  RefreshCw,
  Stethoscope,
  UserCheck2,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
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
import {
  doctorsApi,
  patientsApi,
  polyclinicsApi,
  registrationQueueApi,
  rolesApi,
  usersApi,
  visitsApi,
  type Doctor,
  type Patient,
  type Polyclinic,
  type RegistrationQueueItem,
  type Role,
  type User,
  type Visit,
} from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

type DailyTrendPoint = {
  key: string;
  label: string;
  total: number;
  completed: number;
  cancelled: number;
};

type StatusPoint = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type DashboardSnapshot = {
  totalUsers: number;
  activeUsers: number;
  totalRoles: number;
  newUsersThisMonth: number;
  totalPatients: number;
  activeDoctors: number;
  activePolyclinics: number;
  todayVisits: number;
  completedVisitsToday: number;
  inProgressVisitsToday: number;
  cancelledVisitsToday: number;
  waitingQueueToday: number;
  calledQueueToday: number;
  processingQueueToday: number;
  completedQueueToday: number;
  trend7Days: DailyTrendPoint[];
  statusDistribution: StatusPoint[];
  topPolyclinicsToday: Array<{ label: string; visits: number }>;
};

const INITIAL_SNAPSHOT: DashboardSnapshot = {
  totalUsers: 0,
  activeUsers: 0,
  totalRoles: 0,
  newUsersThisMonth: 0,
  totalPatients: 0,
  activeDoctors: 0,
  activePolyclinics: 0,
  todayVisits: 0,
  completedVisitsToday: 0,
  inProgressVisitsToday: 0,
  cancelledVisitsToday: 0,
  waitingQueueToday: 0,
  calledQueueToday: 0,
  processingQueueToday: 0,
  completedQueueToday: 0,
  trend7Days: [],
  statusDistribution: [],
  topPolyclinicsToday: [],
};

const trendChartConfig: ChartConfig = {
  total: { label: 'Kunjungan', color: '#0f766e' },
  completed: { label: 'Selesai', color: '#f59e0b' },
  cancelled: { label: 'Batal', color: '#dc2626' },
};

const statusChartConfig: ChartConfig = {
  value: { label: 'Jumlah', color: '#0f766e' },
};

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value && typeof value === 'object') {
    const maybeData = (value as { data?: unknown }).data;
    if (Array.isArray(maybeData)) {
      return maybeData as T[];
    }
  }
  return [];
}

function parseDate(value?: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function getSettledArray<T>(result: PromiseSettledResult<any>) {
  if (result.status !== 'fulfilled') {
    return [] as T[];
  }
  return asArray<T>(result.value?.data);
}

function buildSevenDayTrend(visits: Visit[]) {
  const today = new Date();
  const points: DailyTrendPoint[] = [];

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - index);
    points.push({
      key: localDateKey(date),
      label: date.toLocaleDateString('id-ID', { weekday: 'short' }),
      total: 0,
      completed: 0,
      cancelled: 0,
    });
  }

  const pointMap = new Map(points.map((point) => [point.key, point]));

  for (const visit of visits) {
    const visitDate = parseDate(visit.visit_date || visit.created_at || visit.updated_at);
    if (!visitDate) {
      continue;
    }

    const bucket = pointMap.get(localDateKey(visitDate));
    if (!bucket) {
      continue;
    }

    bucket.total += 1;
    if (visit.status === 'completed') {
      bucket.completed += 1;
    }
    if (visit.status === 'cancelled') {
      bucket.cancelled += 1;
    }
  }

  return points;
}

function buildStatusDistribution(visitsToday: Visit[]) {
  const scheduled = visitsToday.filter((item) => item.status === 'registered').length;
  const inProgress = visitsToday.filter((item) => item.status === 'in_progress').length;
  const completed = visitsToday.filter((item) => item.status === 'completed').length;
  const cancelled = visitsToday.filter((item) => item.status === 'cancelled').length;

  return [
    { key: 'scheduled', label: 'Terjadwal', value: scheduled, color: '#1d4ed8' },
    { key: 'in-progress', label: 'Berjalan', value: inProgress, color: '#d97706' },
    { key: 'completed', label: 'Selesai', value: completed, color: '#0f766e' },
    { key: 'cancelled', label: 'Batal', value: cancelled, color: '#dc2626' },
  ];
}

function buildTopPolyclinics(visitsToday: Visit[]) {
  const map = new Map<string, number>();

  for (const visit of visitsToday) {
    const label = (visit.polyclinic?.name || 'Poliklinik lainnya').trim();
    map.set(label, (map.get(label) || 0) + 1);
  }

  return Array.from(map.entries())
    .map(([label, visits]) => ({ label, visits }))
    .sort((left, right) => right.visits - left.visits)
    .slice(0, 5);
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    setPageTitle('Dashboard');
    void loadDashboardData();
  }, []);

  const loadDashboardData = async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [
        usersResult,
        rolesResult,
        patientsResult,
        doctorsResult,
        polyclinicsResult,
        visitsTodayResult,
        visitsAllResult,
        queueResult,
      ] = await Promise.allSettled([
        usersApi.getAll(),
        rolesApi.getAll(),
        patientsApi.getAll(),
        doctorsApi.getAll(),
        polyclinicsApi.getAll(),
        visitsApi.getToday(),
        visitsApi.getAll(),
        registrationQueueApi.getAll(),
      ]);

      const users = getSettledArray<User>(usersResult);
      const roles = getSettledArray<Role>(rolesResult);
      const patients = getSettledArray<Patient>(patientsResult);
      const doctors = getSettledArray<Doctor>(doctorsResult);
      const polyclinics = getSettledArray<Polyclinic>(polyclinicsResult);
      const visitsToday = getSettledArray<Visit>(visitsTodayResult);
      const allVisits = getSettledArray<Visit>(visitsAllResult);
      const queueItems = getSettledArray<RegistrationQueueItem>(queueResult);

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const activeUsers = users.filter((item) => item.is_active).length;
      const newUsersThisMonth = users.filter((item) => {
        const createdAt = parseDate((item as User & { created_at?: string }).created_at);
        if (!createdAt) {
          return false;
        }
        return createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear;
      }).length;

      const completedVisitsToday = visitsToday.filter((item) => item.status === 'completed').length;
      const inProgressVisitsToday = visitsToday.filter((item) => item.status === 'in_progress').length;
      const cancelledVisitsToday = visitsToday.filter((item) => item.status === 'cancelled').length;

      const waitingQueueToday = queueItems.filter((item) => item.status === 'waiting').length;
      const calledQueueToday = queueItems.filter((item) => item.status === 'called').length;
      const processingQueueToday = queueItems.filter((item) => item.status === 'processing').length;
      const completedQueueToday = queueItems.filter((item) => item.status === 'completed').length;

      const trend7Days = buildSevenDayTrend(allVisits.length > 0 ? allVisits : visitsToday);
      const statusDistribution = buildStatusDistribution(visitsToday);
      const topPolyclinicsToday = buildTopPolyclinics(visitsToday);

      setSnapshot({
        totalUsers: users.length,
        activeUsers,
        totalRoles: roles.length,
        newUsersThisMonth,
        totalPatients: patients.length,
        activeDoctors: doctors.filter((item) => item.is_active).length,
        activePolyclinics: polyclinics.filter((item) => item.is_active).length,
        todayVisits: visitsToday.length,
        completedVisitsToday,
        inProgressVisitsToday,
        cancelledVisitsToday,
        waitingQueueToday,
        calledQueueToday,
        processingQueueToday,
        completedQueueToday,
        trend7Days,
        statusDistribution,
        topPolyclinicsToday,
      });
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const readinessScore = useMemo(() => {
    const todayRatio = snapshot.todayVisits > 0
      ? snapshot.completedVisitsToday / snapshot.todayVisits
      : 0;
    const userRatio = snapshot.totalUsers > 0
      ? snapshot.activeUsers / snapshot.totalUsers
      : 0;
    const queueTotal = snapshot.waitingQueueToday + snapshot.calledQueueToday + snapshot.processingQueueToday + snapshot.completedQueueToday;
    const queueRatio = queueTotal > 0
      ? snapshot.completedQueueToday / queueTotal
      : 0;

    return Math.round((todayRatio * 0.55 + userRatio * 0.25 + queueRatio * 0.2) * 100);
  }, [
    snapshot.activeUsers,
    snapshot.calledQueueToday,
    snapshot.completedQueueToday,
    snapshot.completedVisitsToday,
    snapshot.processingQueueToday,
    snapshot.todayVisits,
    snapshot.totalUsers,
    snapshot.waitingQueueToday,
  ]);

  const kpiCards = [
    {
      title: 'Kunjungan Hari Ini',
      value: snapshot.todayVisits,
      note: `${snapshot.completedVisitsToday} selesai`,
      icon: CalendarCheck2,
      iconWrap: 'bg-emerald-100 text-emerald-700',
    },
    {
      title: 'Antrian Menunggu',
      value: snapshot.waitingQueueToday,
      note: `${snapshot.processingQueueToday} sedang diproses`,
      icon: Clock3,
      iconWrap: 'bg-amber-100 text-amber-800',
    },
    {
      title: 'Total Pasien',
      value: snapshot.totalPatients,
      note: 'Terdaftar di sistem',
      icon: Users,
      iconWrap: 'bg-sky-100 text-sky-700',
    },
    {
      title: 'Dokter Aktif',
      value: snapshot.activeDoctors,
      note: `${snapshot.activePolyclinics} poli aktif`,
      icon: Stethoscope,
      iconWrap: 'bg-violet-100 text-violet-700',
    },
    {
      title: 'Pengguna Aktif',
      value: snapshot.activeUsers,
      note: `${snapshot.totalUsers} total user`,
      icon: UserCheck2,
      iconWrap: 'bg-cyan-100 text-cyan-700',
    },
    {
      title: 'Role Sistem',
      value: snapshot.totalRoles,
      note: `+${snapshot.newUsersThisMonth} user bulan ini`,
      icon: Building2,
      iconWrap: 'bg-orange-100 text-orange-700',
    },
  ];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <section className="relative overflow-hidden border border-border/70 bg-[linear-gradient(125deg,#fffbeb_0%,#ecfeff_48%,#f8fafc_100%)] p-5 lg:p-7">
        <div className="pointer-events-none absolute -left-10 -top-14 h-40 w-40 rounded-full bg-amber-300/25 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-6 h-52 w-52 rounded-full bg-cyan-300/25 blur-2xl" />

        <div className="relative z-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-none border-0 bg-stone-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white">
                Dashboard Operasional
              </Badge>
              <Badge variant="outline" className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">
                {snapshot.todayVisits} kunjungan hari ini
              </Badge>
            </div>

            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground lg:text-2xl">
                Halo, {user?.full_name || 'Tim Klinik'}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Ringkasan data utama klinik untuk membantu Anda memantau beban layanan, throughput antrian, dan kesehatan operasional secara cepat.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Update terakhir:</span>
              <span className="font-medium text-foreground">
                {lastUpdated
                  ? lastUpdated.toLocaleString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '-'}
              </span>
            </div>
          </div>

          <div className="space-y-3 border border-border/70 bg-background/90 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Skor Kesiapan</p>
                <p className="mt-1 text-3xl font-semibold text-foreground">{readinessScore}%</p>
              </div>
              <Activity className="h-7 w-7 text-emerald-700" />
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Dihitung dari rasio kunjungan selesai, rasio user aktif, dan penyelesaian antrian registrasi.
            </p>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 rounded-none"
              onClick={() => void loadDashboardData(true)}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {refreshing ? 'Memuat data...' : 'Segarkan Data'}
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="border-border/70 shadow-none">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className={cn('rounded-none p-2.5', item.iconWrap)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold leading-none text-foreground">{item.value.toLocaleString('id-ID')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{item.title}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base">Tren Kunjungan 7 Hari</CardTitle>
            <p className="text-xs text-muted-foreground">Membandingkan total kunjungan, kunjungan selesai, dan batal per hari.</p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendChartConfig} className="h-[280px] w-full aspect-auto">
              <AreaChart data={snapshot.trend7Days} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--color-total)"
                  fill="var(--color-total)"
                  fillOpacity={0.16}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stroke="var(--color-completed)"
                  fill="var(--color-completed)"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="cancelled"
                  stroke="var(--color-cancelled)"
                  fill="var(--color-cancelled)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base">Distribusi Status Kunjungan Hari Ini</CardTitle>
            <p className="text-xs text-muted-foreground">Komposisi status untuk melihat throughput layanan harian.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ChartContainer config={statusChartConfig} className="h-[220px] w-full aspect-auto">
              <PieChart>
                <Pie
                  data={snapshot.statusDistribution.filter((item) => item.value > 0)}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {snapshot.statusDistribution
                    .filter((item) => item.value > 0)
                    .map((item) => (
                      <Cell key={item.key} fill={item.color} />
                    ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>

            <div className="space-y-2">
              {snapshot.statusDistribution.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 border border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-foreground">{item.label}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{item.value.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base">Top Poliklinik Hari Ini</CardTitle>
            <p className="text-xs text-muted-foreground">Poliklinik dengan volume kunjungan tertinggi hari ini.</p>
          </CardHeader>
          <CardContent>
            {snapshot.topPolyclinicsToday.length === 0 ? (
              <div className="border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                Belum ada data kunjungan hari ini.
              </div>
            ) : (
              <div className="space-y-2">
                {snapshot.topPolyclinicsToday.map((item, index) => (
                  <div key={item.label} className="grid grid-cols-[36px_minmax(0,1fr)_70px] items-center gap-3 border border-border/60 px-3 py-2.5">
                    <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
                    <div>
                      <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                      <div className="mt-1 h-1.5 bg-muted">
                        <div
                          className="h-full bg-emerald-600"
                          style={{ width: `${Math.max(8, (item.visits / Math.max(snapshot.topPolyclinicsToday[0]?.visits || 1, 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-right text-sm font-semibold text-foreground">{item.visits}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/70 shadow-none">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-base">Ringkasan Antrian Registrasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between border border-border/60 px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-foreground"><Clock3 className="h-4 w-4 text-amber-700" /> Menunggu</div>
                <span className="font-semibold">{snapshot.waitingQueueToday}</span>
              </div>
              <div className="flex items-center justify-between border border-border/60 px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-foreground"><Activity className="h-4 w-4 text-sky-700" /> Dipanggil</div>
                <span className="font-semibold">{snapshot.calledQueueToday}</span>
              </div>
              <div className="flex items-center justify-between border border-border/60 px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-foreground"><Loader2 className="h-4 w-4 text-violet-700" /> Diproses</div>
                <span className="font-semibold">{snapshot.processingQueueToday}</span>
              </div>
              <div className="flex items-center justify-between border border-border/60 px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-foreground"><UserCheck2 className="h-4 w-4 text-emerald-700" /> Selesai</div>
                <span className="font-semibold">{snapshot.completedQueueToday}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-none">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-base">Profil Pengguna</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-none bg-stone-900 text-lg font-semibold text-white">
                  {user?.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{user?.full_name || '-'}</p>
                  <p className="text-xs text-muted-foreground">{user?.email || '-'}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">Role</span>
                  <span className="font-medium text-foreground">{user?.role?.name || '-'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">Status</span>
                  <span className={cn('inline-flex items-center gap-1 text-sm font-medium', user?.is_active ? 'text-emerald-700' : 'text-rose-700')}>
                    {user?.is_active ? <UserCheck2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {user?.is_active ? 'Aktif' : 'Tidak aktif'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ID User</span>
                  <span className="font-medium text-foreground">#{user?.id || '-'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
