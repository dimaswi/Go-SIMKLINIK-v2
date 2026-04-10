import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Clock3,
  Moon,
  Sun,
} from 'lucide-react';

type RouteMeta = {
  pattern: RegExp;
  title: string;
  subtitle: string;
  badgeLabel?: string;
  breadcrumb?: string;
};

const MODULE_META: Record<string, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Pantau ringkasan sistem dan aktivitas harian',
  },
  users: {
    title: 'Users',
    subtitle: 'Kelola akun dan akses pengguna aplikasi',
  },
  roles: {
    title: 'Roles',
    subtitle: 'Atur struktur hak akses berbasis peran',
  },
  permissions: {
    title: 'Permissions',
    subtitle: 'Kelola izin granular setiap fitur sistem',
  },
  account: {
    title: 'Account',
    subtitle: 'Lihat dan ubah informasi profil Anda',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Konfigurasi preferensi aplikasi',
  },
  emr: {
    title: 'Rekam Medis',
    subtitle: 'Kelola catatan klinis, diagnosis, resep, dan tindakan pasien',
  },
  pharmacy: {
    title: 'Farmasi',
    subtitle: 'Kelola penerimaan, proses, dan penyerahan resep internal',
  },
  laboratory: {
    title: 'Laboratorium',
    subtitle: 'Kelola penerimaan order laboratorium, pengisian hasil, dan penyelesaian order',
  },
  radiology: {
    title: 'Radiologi',
    subtitle: 'Kelola penerimaan order radiologi, pelaporan hasil, dan penyelesaian order',
  },
};

const ROUTE_META: RouteMeta[] = [
  {
    pattern: /^\/pharmacy\/?$/,
    title: 'Farmasi',
    subtitle: 'Ringkasan operasional unit farmasi dan antrean resep aktif',
    badgeLabel: 'Ringkasan',
    breadcrumb: 'Farmasi / Ringkasan',
  },
  {
    pattern: /^\/pharmacy\/receive(?:\/.*)?$/,
    title: 'Farmasi',
    subtitle: 'Terima resep baru dari EMR dan validasi order sebelum diproses',
    badgeLabel: 'Terima Resep',
    breadcrumb: 'Farmasi / Terima Resep',
  },
  {
    pattern: /^\/pharmacy\/process(?:\/.*)?$/,
    title: 'Farmasi',
    subtitle: 'Kelola item resep, cek stok, dan siapkan obat untuk penyerahan',
    badgeLabel: 'Proses Resep',
    breadcrumb: 'Farmasi / Proses Resep',
  },
  {
    pattern: /^\/pharmacy\/handover(?:\/.*)?$/,
    title: 'Farmasi',
    subtitle: 'Verifikasi akhir dan serahkan obat kepada pasien',
    badgeLabel: 'Serahkan Resep',
    breadcrumb: 'Farmasi / Serahkan Resep',
  },
  {
    pattern: /^\/pharmacy\/completed(?:\/.*)?$/,
    title: 'Farmasi',
    subtitle: 'Lihat resep yang sudah selesai dispensing dan sudah diserahkan',
    badgeLabel: 'Resep Selesai',
    breadcrumb: 'Farmasi / Resep Selesai',
  },
  {
    pattern: /^\/laboratory\/?$/,
    title: 'Laboratorium',
    subtitle: 'Ringkasan operasional unit laboratorium dan antrean order aktif',
    badgeLabel: 'Ringkasan',
    breadcrumb: 'Laboratorium / Ringkasan',
  },
  {
    pattern: /^\/laboratory\/receive(?:\/.*)?$/,
    title: 'Laboratorium',
    subtitle: 'Terima order laboratorium baru dari EMR dan validasi order sebelum diproses',
    badgeLabel: 'Terima Order',
    breadcrumb: 'Laboratorium / Terima Order',
  },
  {
    pattern: /^\/laboratory\/process(?:\/.*)?$/,
    title: 'Laboratorium',
    subtitle: 'Isi hasil laboratorium dan selesaikan order penunjang yang sedang diproses',
    badgeLabel: 'Proses Hasil',
    breadcrumb: 'Laboratorium / Proses Hasil',
  },
  {
    pattern: /^\/laboratory\/completed(?:\/.*)?$/,
    title: 'Laboratorium',
    subtitle: 'Lihat order laboratorium yang sudah selesai dan hasilnya sudah tersedia',
    badgeLabel: 'Hasil Selesai',
    breadcrumb: 'Laboratorium / Hasil Selesai',
  },
  {
    pattern: /^\/radiology\/?$/,
    title: 'Radiologi',
    subtitle: 'Ringkasan operasional unit radiologi dan antrean order aktif',
    badgeLabel: 'Ringkasan',
    breadcrumb: 'Radiologi / Ringkasan',
  },
  {
    pattern: /^\/radiology\/receive(?:\/.*)?$/,
    title: 'Radiologi',
    subtitle: 'Terima order radiologi baru dari EMR dan validasi order sebelum diproses',
    badgeLabel: 'Terima Order',
    breadcrumb: 'Radiologi / Terima Order',
  },
  {
    pattern: /^\/radiology\/process(?:\/.*)?$/,
    title: 'Radiologi',
    subtitle: 'Isi temuan dan kesan radiologi untuk order yang sedang diproses',
    badgeLabel: 'Proses Hasil',
    breadcrumb: 'Radiologi / Proses Hasil',
  },
  {
    pattern: /^\/radiology\/completed(?:\/.*)?$/,
    title: 'Radiologi',
    subtitle: 'Lihat order radiologi yang sudah selesai dan kembali ke EMR',
    badgeLabel: 'Hasil Selesai',
    breadcrumb: 'Radiologi / Hasil Selesai',
  },
  {
    pattern: /^\/settings\/integrations(?:\/.*)?$/,
    title: 'Integrasi',
    subtitle: 'Kelola koneksi sistem eksternal dan kredensial integrasi aplikasi',
    badgeLabel: 'Integrasi',
    breadcrumb: 'Settings / Integrasi',
  },
];

function getThemeFromDom(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function prettifySegment(segment: string): string {
  if (!segment) return '';
  if (/^\d+$/.test(segment)) return `#${segment}`;
  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function AppHeader() {
  const location = useLocation();
  const headerRef = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [clockLabel, setClockLabel] = useState('');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      return;
    }

    const domTheme = getThemeFromDom();
    setTheme(domTheme);
    localStorage.setItem('theme', domTheme);
  }, []);

  useEffect(() => {
    const updateClock = () => {
      setClockLabel(
        new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };

    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    const headerElement = headerRef.current;
    if (!headerElement) return;

    const rootElement = document.documentElement;
    const updateHeaderHeight = () => {
      rootElement.style.setProperty('--app-header-height', `${headerElement.offsetHeight}px`);
    };

    updateHeaderHeight();

    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    resizeObserver.observe(headerElement);
    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const moduleKey = pathSegments[0] || 'dashboard';
  const matchedRouteMeta = useMemo(
    () => ROUTE_META.find((route) => route.pattern.test(location.pathname)),
    [location.pathname],
  );

  const pageMeta = matchedRouteMeta || MODULE_META[moduleKey] || {
    title: prettifySegment(moduleKey) || 'Overview',
    subtitle: 'Halaman aplikasi',
  };

  const pageStateLabel = useMemo(() => {
    if (matchedRouteMeta?.badgeLabel) return matchedRouteMeta.badgeLabel;
    if (pathSegments.some(segment => segment === 'edit')) return 'Edit';
    if (pathSegments.some(segment => segment === 'create' || segment === 'new')) return 'Create';
    if (pathSegments.some(segment => segment === 'show')) return 'Detail';
    return 'Overview';
  }, [matchedRouteMeta, pathSegments]);

  const breadcrumbLabel = matchedRouteMeta?.breadcrumb
    || pathSegments.map(prettifySegment).join(' / ')
    || 'Dashboard';

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-border/70 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-h-14 items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SidebarTrigger className="size-8" />
          <Separator orientation="vertical" className="h-8" />

          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{pageMeta.title}</p>
              <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px] uppercase tracking-wider">
                {pageStateLabel}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">{pageMeta.subtitle} · {breadcrumbLabel}</p>
          </div>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            <span>{clockLabel}</span>
          </div>

          <Button variant="ghost" size="icon" onClick={toggleTheme} className="size-8">
            {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

export { AppHeader };
export default AppHeader;
