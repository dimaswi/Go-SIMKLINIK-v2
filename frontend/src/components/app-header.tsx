import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/use-toast';
import { patientsApi, settingsApi, type Patient } from '@/lib/api';
import { isAxiosError } from 'axios';
import { cn } from '@/lib/utils';
import {
  CornerDownLeft,
  Loader2,
  Moon,
  Search,
  Sun,
  X,
} from 'lucide-react';

type RouteMeta = {
  pattern: RegExp;
  title: string;
  subtitle: string;
  badgeLabel?: string;
  breadcrumb?: string;
};

const SATUSEHAT_ENABLED_STORAGE_KEY = 'satusehat_enabled';
const BPJS_ENABLED_STORAGE_KEY = 'bpjs_enabled';

const MODULE_META: Record<string, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Pantau ringkasan sistem dan aktivitas harian',
  },
  reports: {
    title: 'Laporan',
    subtitle: 'Pusat preview dan export laporan operasional klinik',
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
    pattern: /^\/patient-search\/?$/,
    title: 'Pencarian Pasien',
    subtitle: 'Lihat daftar hasil pencarian pasien dan terapkan filter administratif lanjutan',
    badgeLabel: 'Search',
    breadcrumb: 'Pencarian Pasien',
  },
  {
    pattern: /^\/patient-search\/\d+(?:\/.*)?$/,
    title: 'Detail Pasien',
    subtitle: 'Halaman detail pasien dari modul pencarian cepat app header',
    badgeLabel: 'Detail Search',
    breadcrumb: 'Pencarian Pasien / Detail',
  },
  {
    pattern: /^\/reports\/?$/,
    title: 'Laporan',
    subtitle: 'Preview data laporan per tab lalu export PDF atau Excel dari satu pusat laporan',
    badgeLabel: 'Report Center',
    breadcrumb: 'Laporan / Report Center',
  },
  {
    pattern: /^\/pharmacy\/?$/,
    title: 'Farmasi',
    subtitle: 'Kelola order dan penyerahan resep obat pasien',
    badgeLabel: 'Farmasi',
    breadcrumb: 'Farmasi',
  },
  {
    pattern: /^\/pharmacy\/\d+$/,
    title: 'Farmasi',
    subtitle: 'Detail resep dan telaah obat pasien',
    badgeLabel: 'Detail Resep',
    breadcrumb: 'Farmasi / Detail Resep',
  },
  {
    pattern: /^\/laboratory\/?$/,
    title: 'Laboratorium',
    subtitle: 'Kelola order pemeriksaan laboratorium',
    badgeLabel: 'Laboratorium',
    breadcrumb: 'Laboratorium',
  },
  {
    pattern: /^\/laboratory\/\d+$/,
    title: 'Laboratorium',
    subtitle: 'Detail pemeriksaan dan input hasil laboratorium',
    badgeLabel: 'Detail Hasil',
    breadcrumb: 'Laboratorium / Detail Hasil',
  },
  {
    pattern: /^\/radiology\/?$/,
    title: 'Radiologi',
    subtitle: 'Kelola order pemeriksaan radiologi',
    badgeLabel: 'Radiologi',
    breadcrumb: 'Radiologi',
  },
  {
    pattern: /^\/radiology\/\d+$/,
    title: 'Radiologi',
    subtitle: 'Detail pemeriksaan dan input ekspertise radiologi',
    badgeLabel: 'Detail Hasil',
    breadcrumb: 'Radiologi / Detail Hasil',
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

function parseSatusehatEnabledFlag(value: unknown, defaultValue = true): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return defaultValue;
}

function readStoredSatusehatEnabled() {
  return parseSatusehatEnabledFlag(localStorage.getItem(SATUSEHAT_ENABLED_STORAGE_KEY), true);
}

function readStoredBPJSEnabled() {
  return parseSatusehatEnabledFlag(localStorage.getItem(BPJS_ENABLED_STORAGE_KEY), false);
}

function getInitials(name?: string | null): string {
  if (!name) return 'PS';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getAgeFromBirthDate(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const ageDifMs = Date.now() - d.getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const headerRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [patientSearchKeyword, setPatientSearchKeyword] = useState('');
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [isSearchCommandOpen, setIsSearchCommandOpen] = useState(false);
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandResults, setCommandResults] = useState<Patient[]>([]);
  const [commandResultTotal, setCommandResultTotal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [satusehatEnabled, setSatusehatEnabled] = useState<boolean>(() => readStoredSatusehatEnabled());
  const [bpjsEnabled, setBpjsEnabled] = useState<boolean>(() => readStoredBPJSEnabled());
  const canUsePatientSearch = hasPermission('patients.view');

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

  useEffect(() => {
    if (!canUsePatientSearch) {
      return;
    }

    const isTypingContext = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) {
        return false;
      }

      const tagName = element.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return true;
      }

      return Boolean(element.closest('[contenteditable="true"], [role="textbox"], [cmdk-input-wrapper]'));
    };

    const handlePatientSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchCommandOpen(true);
        return;
      }

      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !isTypingContext(event.target)) {
        event.preventDefault();
        setIsSearchCommandOpen(true);
      }
    };

    window.addEventListener('keydown', handlePatientSearchShortcut);
    return () => window.removeEventListener('keydown', handlePatientSearchShortcut);
  }, [canUsePatientSearch]);

  useEffect(() => {
    if (!canUsePatientSearch || !isSearchCommandOpen) {
      setCommandResults([]);
      setCommandResultTotal(0);
      setCommandLoading(false);
      return;
    }

    const keyword = patientSearchKeyword.trim();
    if (!keyword) {
      setCommandResults([]);
      setCommandResultTotal(0);
      setCommandLoading(false);
      return;
    }

    let isCurrent = true;
    const timer = window.setTimeout(async () => {
      setCommandLoading(true);
      try {
        const requestParams = new URLSearchParams({
          q: keyword,
          page: '1',
          per_page: '20',
        });
        const response = await patientsApi.getAll(requestParams.toString());
        if (!isCurrent) {
          return;
        }
        const list = response.data.data || [];
        setCommandResults(list);
        setCommandResultTotal(Number(response.data.total || list.length));
      } catch {
        if (isCurrent) {
          setCommandResults([]);
          setCommandResultTotal(0);
        }
      } finally {
        if (isCurrent) {
          setCommandLoading(false);
        }
      }
    }, 250);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [canUsePatientSearch, isSearchCommandOpen, patientSearchKeyword]);

  useEffect(() => {
  let isCurrent = true;

  const syncSatusehatEnabled = async () => {
    try {
      const response = await settingsApi.getAll();
      const settingsMap = (response.data as { data?: Record<string, string> })?.data || {};
      const enabled = parseSatusehatEnabledFlag(settingsMap.satusehat_enabled, true);
      const bpjsAntreanEnabled = parseSatusehatEnabledFlag(settingsMap.bpjs_antrean_enabled, false);
      const bpjsPCareEnabled = parseSatusehatEnabledFlag(settingsMap.bpjs_pcare_enabled, false);
      const bpjsIsEnabled = bpjsAntreanEnabled || bpjsPCareEnabled;
      if (!isCurrent) {
        return;
      }
      setSatusehatEnabled(enabled);
      setBpjsEnabled(bpjsIsEnabled);
      localStorage.setItem(SATUSEHAT_ENABLED_STORAGE_KEY, enabled ? '1' : '0');
      localStorage.setItem(BPJS_ENABLED_STORAGE_KEY, bpjsIsEnabled ? '1' : '0');
    } catch {
      if (!isCurrent) {
        return;
      }
      setSatusehatEnabled(readStoredSatusehatEnabled());
      setBpjsEnabled(readStoredBPJSEnabled());
    }
  };

  const handleSatusehatStatusChanged = (event: Event) => {
    const defaultValue = readStoredSatusehatEnabled();
    const enabled = event instanceof CustomEvent
      ? parseSatusehatEnabledFlag(event.detail?.enabled, defaultValue)
      : defaultValue;
    setSatusehatEnabled(enabled);
    localStorage.setItem(SATUSEHAT_ENABLED_STORAGE_KEY, enabled ? '1' : '0');
  };

  const handleBpjsStatusChanged = (event: Event) => {
    const defaultValue = readStoredBPJSEnabled();
    const enabled = event instanceof CustomEvent
      ? parseSatusehatEnabledFlag(event.detail?.enabled, defaultValue)
      : defaultValue;
    setBpjsEnabled(enabled);
    localStorage.setItem(BPJS_ENABLED_STORAGE_KEY, enabled ? '1' : '0');
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === SATUSEHAT_ENABLED_STORAGE_KEY) {
      setSatusehatEnabled(parseSatusehatEnabledFlag(event.newValue, true));
      return;
    }

    if (event.key === BPJS_ENABLED_STORAGE_KEY) {
      setBpjsEnabled(parseSatusehatEnabledFlag(event.newValue, false));
    }
  };

  void syncSatusehatEnabled();
  window.addEventListener('satusehat-status-changed', handleSatusehatStatusChanged as EventListener);
  window.addEventListener('bpjs-status-changed', handleBpjsStatusChanged as EventListener);
  window.addEventListener('storage', handleStorage);

  return () => {
    isCurrent = false;
    window.removeEventListener('satusehat-status-changed', handleSatusehatStatusChanged as EventListener);
    window.removeEventListener('bpjs-status-changed', handleBpjsStatusChanged as EventListener);
    window.removeEventListener('storage', handleStorage);
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

  const openPatientSearchCommand = () => {
    if (!canUsePatientSearch) {
      return;
    }
    setIsSearchCommandOpen(true);
  };

  const runPatientSearch = async (rawKeyword: string) => {
    const keyword = rawKeyword.trim();
    if (!keyword || searchingPatient) {
      return;
    }

    setSearchingPatient(true);
    try {
      const requestParams = new URLSearchParams({
        q: keyword,
        page: '1',
        per_page: '50',
      });
      const response = await patientsApi.getAll(requestParams.toString());
      const list = response.data.data || [];
      const total = Number(response.data.total || list.length);

      if (total === 0) {
        setCommandResults([]);
        setCommandResultTotal(0);
        toast({
          variant: 'destructive',
          title: 'Pasien tidak ditemukan',
          description: 'Coba ubah kata kunci nama pasien atau nomor rekam medis.',
        });
        return;
      }

      if (total === 1 && list[0]?.id) {
        const detailParams = new URLSearchParams({ q: keyword });
        setIsSearchCommandOpen(false);
        navigate(`/patient-search/${list[0].id}?${detailParams.toString()}`);
        return;
      }

      if (total > 1) {
        const listParams = new URLSearchParams({ q: keyword });
        setCommandResults(list);
        setCommandResultTotal(total);
        setIsSearchCommandOpen(false);
        navigate(`/patient-search?${listParams.toString()}`);
        return;
      }

      setCommandResults(list);
      setCommandResultTotal(total);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Pencarian gagal',
        description: isAxiosError<{ error?: string }>(error)
          ? (error.response?.data?.error || 'Gagal melakukan pencarian pasien.')
          : 'Gagal melakukan pencarian pasien.',
      });
    } finally {
      setSearchingPatient(false);
    }
  };

  const handleQuickResultSelect = (patientId: number) => {
    const keyword = patientSearchKeyword.trim();
    const detailParams = new URLSearchParams();
    if (keyword) {
      detailParams.set('q', keyword);
    }
    setIsSearchCommandOpen(false);
    navigate(`/patient-search/${patientId}${detailParams.toString() ? `?${detailParams.toString()}` : ''}`);
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-border/70 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-h-14 items-start justify-between gap-2 sm:min-h-16 sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <SidebarTrigger className="mt-0.5 size-8 shrink-0 sm:mt-0" />
          <Separator orientation="vertical" className="hidden h-8 sm:block" />

          <div className="min-w-0">
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground sm:text-[15px]">{pageMeta.title}</p>
              <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px] uppercase tracking-wider">
                {pageStateLabel}
              </Badge>
              <Badge
                variant="outline"
                className={satusehatEnabled
                  ? 'h-5 rounded-full border-emerald-200 bg-emerald-50 px-2 text-[10px] uppercase tracking-wider text-emerald-700'
                  : 'h-5 rounded-full border-amber-200 bg-amber-50 px-2 text-[10px] uppercase tracking-wider text-amber-700'}
              >
                SATUSEHAT {satusehatEnabled ? 'On' : 'Off'}
              </Badge>
              <Badge
                variant="outline"
                className={bpjsEnabled
                  ? 'h-5 rounded-full border-emerald-200 bg-emerald-50 px-2 text-[10px] uppercase tracking-wider text-emerald-700'
                  : 'h-5 rounded-full border-amber-200 bg-amber-50 px-2 text-[10px] uppercase tracking-wider text-amber-700'}
              >
                BPJS {bpjsEnabled ? 'On' : 'Off'}
              </Badge>
            </div>
            <p className="line-clamp-1 text-[11px] leading-4 text-muted-foreground sm:truncate sm:text-xs">{breadcrumbLabel}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 self-start sm:gap-3 sm:self-auto">
          {canUsePatientSearch ? (
            <button
              type="button"
              onClick={openPatientSearchCommand}
              className="hidden h-8 w-[200px] items-center justify-between gap-2 rounded-none border border-input bg-background px-2 text-left text-xs text-muted-foreground md:flex lg:w-[260px]"
            >
              <span className="inline-flex items-center gap-2 truncate">
                <Search className="size-3.5" />
                <span className="truncate">{patientSearchKeyword.trim() || 'Cari pasien / No. RM'}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1">
                <span className="hidden text-[10px] text-muted-foreground/80 xl:inline">Tekan</span>
                <kbd className="rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px]">/</kbd>
              </span>
            </button>
          ) : null}

          <Button variant="ghost" size="icon" onClick={toggleTheme} className="size-8 rounded-full">
            {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>

      {canUsePatientSearch ? (
        <button
          type="button"
          onClick={openPatientSearchCommand}
          className="mt-2 flex h-8 w-full items-center justify-between gap-2 rounded-none border border-input bg-background px-2 text-left text-xs text-muted-foreground md:hidden"
        >
          <span className="inline-flex items-center gap-2 truncate">
            <Search className="size-3.5" />
            <span className="truncate">{patientSearchKeyword.trim() || 'Cari pasien / No. RM'}</span>
          </span>
          <kbd className="rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px]">/</kbd>
        </button>
      ) : null}

      {/* Global Spotlight Patient Search Modal (Sesuai Gambar 1) */}
      <Dialog open={isSearchCommandOpen} onOpenChange={setIsSearchCommandOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-background shadow-2xl [&>button]:hidden">
          {/* Top Search Input Bar */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border/70 bg-background">
            <Search className="size-5 text-muted-foreground/80 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={patientSearchKeyword}
              onChange={(e) => setPatientSearchKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (commandResults.length > 0) {
                    setSelectedIndex((prev) => (prev + 1) % commandResults.length);
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (commandResults.length > 0) {
                    setSelectedIndex((prev) => (prev - 1 + commandResults.length) % commandResults.length);
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (commandResults.length > 0 && commandResults[selectedIndex]) {
                    handleQuickResultSelect(commandResults[selectedIndex].id);
                  } else if (patientSearchKeyword.trim()) {
                    void runPatientSearch(patientSearchKeyword);
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsSearchCommandOpen(false);
                }
              }}
              placeholder="Ketik nama pasien, NIK, atau No. Rekam Medis..."
              autoFocus
              className="flex-1 bg-transparent text-sm sm:text-base outline-none placeholder:text-muted-foreground/50 text-foreground font-normal"
            />
            {patientSearchKeyword ? (
              <button
                type="button"
                onClick={() => {
                  setPatientSearchKeyword('');
                  searchInputRef.current?.focus();
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Hapus kata kunci"
              >
                <X className="size-4" />
              </button>
            ) : null}
            <kbd className="hidden sm:inline-flex items-center rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-mono font-medium text-muted-foreground shadow-2xs">
              ESC
            </kbd>
          </div>

          {/* Body List Item */}
          <div className="p-4 max-h-[380px] min-h-[140px] overflow-y-auto space-y-2.5">
            {commandLoading ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-2">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span>Mencari data pasien...</span>
              </div>
            ) : commandResults.length > 0 ? (
              commandResults.map((patient, index) => {
                const isSelected = index === selectedIndex;
                const initials = getInitials(patient.full_name);
                const age = getAgeFromBirthDate(patient.birth_date);
                const gender = patient.gender === 'L' ? 'Laki-laki' : patient.gender === 'P' ? 'Perempuan' : '';

                return (
                  <div
                    key={patient.id}
                    onClick={() => handleQuickResultSelect(patient.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "group relative flex items-center justify-between gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-150",
                      isSelected
                        ? "border-zinc-400 dark:border-zinc-600 bg-zinc-100/90 dark:bg-zinc-800/90 shadow-sm"
                        : "border-zinc-200/90 dark:border-zinc-800/90 bg-zinc-50/60 dark:bg-zinc-900/60 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/70"
                    )}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Avatar Inisial Kotak Hitam Sesuai Gambar 1 */}
                      <div className="size-11 rounded-lg bg-zinc-950 dark:bg-zinc-900 text-white font-bold text-sm tracking-wider flex items-center justify-center shrink-0 shadow-sm uppercase border border-zinc-800">
                        {initials}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors">
                            {patient.full_name || '-'}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-emerald-400/80 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider shrink-0">
                            {patient.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground mt-0.5">
                          {patient.medical_record_number || '-'}
                          <span className="mx-1.5 opacity-60">•</span>
                          NIK: {patient.nik || '-'}
                          <span className="mx-1.5 opacity-60">•</span>
                          {patient.occupation || (gender && age ? `${gender}, ${age} th` : patient.city || 'Pasien')}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className={cn(
                        "text-xs font-medium px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors",
                        isSelected
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs"
                          : "bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 group-hover:text-foreground"
                      )}>
                        Buka <CornerDownLeft className="size-3" />
                      </span>
                    </div>
                  </div>
                );
              })
            ) : patientSearchKeyword.trim() ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Tidak ada pasien ditemukan untuk kata kunci "{patientSearchKeyword}".
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Ketik nama pasien, NIK, atau No. Rekam Medis untuk mencari...
              </div>
            )}
          </div>

          {/* Footer Bar Sesuai Gambar 1 */}
          <div className="border-t border-border/70 bg-muted/30 px-5 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono shadow-2xs">↑</kbd>
                <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono shadow-2xs">↓</kbd>
                <span>Navigasi</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono shadow-2xs">↵</kbd>
                <span>Pilih</span>
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground/80 hidden sm:inline">
              {commandResultTotal > 0 ? `Total ${commandResultTotal} pasien · ` : ''}
              Gunakan pencarian untuk akses cepat data profil & rekap
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

export { AppHeader };
export default AppHeader;
