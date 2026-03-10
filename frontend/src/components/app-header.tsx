import { useEffect, useMemo, useState } from 'react';
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
};

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

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const moduleKey = pathSegments[0] || 'dashboard';

  const pageMeta = MODULE_META[moduleKey] || {
    title: prettifySegment(moduleKey) || 'Overview',
    subtitle: 'Halaman aplikasi',
  };

  const pageStateLabel = useMemo(() => {
    if (pathSegments.some(segment => segment === 'edit')) return 'Edit';
    if (pathSegments.some(segment => segment === 'create' || segment === 'new')) return 'Create';
    if (pathSegments.some(segment => segment === 'show')) return 'Detail';
    return 'Overview';
  }, [pathSegments]);

  const currentPath = location.pathname || '/';

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
            <p className="truncate text-xs text-muted-foreground">{pageMeta.subtitle} · {currentPath}</p>
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
