import { useEffect, useMemo, useState } from 'react';
import { Film, Megaphone, MonitorPlay, Sparkles } from 'lucide-react';
import { resolveAssetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface DisplayAdItem {
  url: string;
  title?: string;
  subtitle?: string;
}

export function parseDisplayMediaUrl(url?: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  return resolveAssetUrl(trimmed);
}

export function parseYouTubeEmbedUrl(rawUrl: string): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    let videoId = '';

    if (host === 'youtu.be') {
      videoId = u.pathname.replace(/^\//, '').split('/')[0];
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') {
        videoId = u.searchParams.get('v') || '';
      } else if (u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/embed/')[1]?.split('/')[0] || '';
      } else if (u.pathname.startsWith('/shorts/')) {
        videoId = u.pathname.split('/shorts/')[1]?.split('/')[0] || '';
      }
    }

    if (!videoId) return null;
    const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanId) return null;
    return `https://www.youtube.com/embed/${cleanId}?autoplay=1&mute=1&loop=1&playlist=${cleanId}&controls=0&modestbranding=1&rel=0`;
  } catch {
    return null;
  }
}

export function parseDisplayAds(raw?: string): DisplayAdItem[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') {
            return { url: item.trim() };
          }
          if (item && typeof item === 'object' && typeof item.url === 'string') {
            return {
              url: item.url.trim(),
              title: typeof item.title === 'string' ? item.title : undefined,
              subtitle: typeof item.subtitle === 'string' ? item.subtitle : undefined,
            };
          }
          return null;
        })
        .filter((item): item is DisplayAdItem => Boolean(item && item.url));
    }
  } catch {
    return trimmed
      .split(/[\n,]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((url) => ({ url }));
  }

  return [];
}

const DEFAULT_CLINIC_SLIDES = [
  {
    badge: '1 TIKET TERPADU',
    title: 'Satu Nomor Antrian Untuk Semua Layanan',
    subtitle:
      'Gunakan nomor tiket pendaftaran Anda mulai dari Pendaftaran, Poliklinik, Laboratorium, Radiologi, Farmasi hingga Kasir.',
    accent: 'from-emerald-50 via-white to-teal-50',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    badge: 'ANJUNGAN MANDIRI',
    title: 'Daftar Cepat Melalui Kiosk & Pendaftaran Online',
    subtitle:
      'Siapkan NIK / KTP atau Kartu BPJS Kesehatan saat menuju loket pendaftaran dan ruang pemeriksaan.',
    accent: 'from-sky-50 via-white to-cyan-50',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  {
    badge: 'LAYANAN TERPADU',
    title: 'Menunggu Dengan Nyaman Hingga Nomor Dipanggil',
    subtitle:
      'Perhatikan layar monitor dan dengarkan panggilan suara sebelum menuju loket, poliklinik, atau instalasi penunjang.',
    accent: 'from-amber-50 via-white to-orange-50',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
];

interface DisplayMediaPanelProps {
  videoUrl?: string;
  adsRaw?: string;
  hospitalName: string;
  hospitalSubtitle?: string;
  appLogo?: string;
  className?: string;
}

export function DisplayMediaPanel({
  videoUrl,
  adsRaw,
  hospitalName,
  hospitalSubtitle,
  appLogo,
  className,
}: DisplayMediaPanelProps) {
  const ads = useMemo(() => parseDisplayAds(adsRaw), [adsRaw]);
  const slideCount = ads.length > 0 ? ads.length : DEFAULT_CLINIC_SLIDES.length;
  const [adIndex, setAdIndex] = useState(0);

  useEffect(() => {
    setAdIndex(0);
  }, [slideCount]);

  useEffect(() => {
    if (slideCount <= 1) return;
    const timer = window.setInterval(() => {
      setAdIndex((prev) => (prev + 1) % slideCount);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [slideCount]);

  const youtubeEmbed = useMemo(() => parseYouTubeEmbedUrl(videoUrl || ''), [videoUrl]);
  const directVideoUrl = useMemo(() => {
    if (!videoUrl || youtubeEmbed) return '';
    return parseDisplayMediaUrl(videoUrl);
  }, [videoUrl, youtubeEmbed]);

  const currentAd = ads.length > 0 ? ads[adIndex % ads.length] : null;
  const currentDefaultSlide = DEFAULT_CLINIC_SLIDES[adIndex % DEFAULT_CLINIC_SLIDES.length];

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      {/* Slot Tayangan Video */}
      <div className="flex flex-col overflow-hidden border border-slate-300 bg-white shadow-xs shrink-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-800 px-3.5 py-2 text-white">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]">
            <Film className="h-3.5 w-3.5 text-sky-400" />
            <span>Tayangan Video</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {youtubeEmbed || directVideoUrl ? 'Aktif' : 'Info Klinik'}
          </span>
        </div>

        <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
          {youtubeEmbed ? (
            <iframe
              src={youtubeEmbed}
              title="Video Layanan Klinik"
              allow="autoplay; encrypted-media"
              className="h-full w-full border-0 pointer-events-none"
            />
          ) : directVideoUrl ? (
            <video
              key={directVideoUrl}
              src={directVideoUrl}
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 text-center">
              <div className="relative flex flex-col items-center gap-2">
                {appLogo ? (
                  <img
                    src={parseDisplayMediaUrl(appLogo)}
                    alt="Logo"
                    className="h-12 w-12 object-contain"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center border border-emerald-300 bg-emerald-50">
                    <MonitorPlay className="h-6 w-6 text-emerald-700" />
                  </div>
                )}
                <div className="text-sm font-extrabold uppercase tracking-tight text-slate-900 line-clamp-1">
                  {hospitalName}
                </div>
                {hospitalSubtitle ? (
                  <div className="max-w-xs text-[11px] text-slate-600 line-clamp-2">
                    {hospitalSubtitle}
                  </div>
                ) : null}
                <div className="mt-1 inline-flex items-center border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Slot Video Edukasi &amp; Profil
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slot Iklan / Banner Informasi */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-300 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-800 px-3.5 py-2 text-white shrink-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Iklan &amp; Informasi</span>
          </div>
          {slideCount > 1 ? (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: slideCount }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAdIndex(idx)}
                  aria-label={`Slide ${idx + 1}`}
                  className={cn(
                    'h-1.5 transition-all',
                    idx === adIndex ? 'w-5 bg-amber-400' : 'w-1.5 bg-slate-500 hover:bg-slate-400'
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative flex min-h-[160px] flex-1 overflow-hidden bg-slate-50">
          {currentAd ? (
            <div className="relative h-full w-full">
              <img
                key={currentAd.url}
                src={parseDisplayMediaUrl(currentAd.url)}
                alt={currentAd.title || 'Informasi Layanan'}
                className="h-full w-full object-cover"
              />
              {currentAd.title || currentAd.subtitle ? (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent px-4 py-3">
                  {currentAd.title ? (
                    <div className="text-sm font-bold text-white">{currentAd.title}</div>
                  ) : null}
                  {currentAd.subtitle ? (
                    <div className="mt-0.5 text-xs text-slate-200 line-clamp-2">
                      {currentAd.subtitle}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className={cn(
                'flex h-full w-full flex-col justify-between bg-gradient-to-br p-4 transition-all duration-500',
                currentDefaultSlide.accent
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]',
                    currentDefaultSlide.badgeClass
                  )}
                >
                  {currentDefaultSlide.badge}
                </span>
                <span className="font-mono text-[10px] font-semibold text-slate-500">
                  {adIndex + 1}/{slideCount}
                </span>
              </div>
              <div className="my-auto py-2">
                <div className="text-base font-bold leading-snug text-slate-900">
                  {currentDefaultSlide.title}
                </div>
                <div className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {currentDefaultSlide.subtitle}
                </div>
              </div>
              <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-slate-500">
                {hospitalName}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DisplayRunningTextTicker({
  text,
  hospitalName,
}: {
  text?: string;
  hospitalName: string;
}) {
  const message =
    (text || '').trim() ||
    `Selamat datang di ${hospitalName} • Gunakan 1 nomor antrian terpadu untuk layanan Pendaftaran, Poliklinik, Laboratorium, Radiologi, Farmasi hingga Kasir • Siapkan kartu identitas / BPJS Kesehatan Anda sebelum menuju loket atau ruangan.`;

  return (
    <div className="relative flex h-9 shrink-0 items-center overflow-hidden border-t border-slate-700 bg-slate-950 text-slate-100">
      <style>{`
        @keyframes simklinikDisplayTicker {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .simklinik-ticker-track {
          display: flex;
          width: max-content;
          animation: simklinikDisplayTicker 36s linear infinite;
        }
      `}</style>
      <div className="z-10 flex h-full shrink-0 items-center gap-2 border-r border-emerald-700 bg-emerald-600 px-3.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
        <Megaphone className="h-3.5 w-3.5" />
        <span>Informasi</span>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="simklinik-ticker-track whitespace-nowrap text-xs font-medium tracking-wide text-slate-100">
          <span className="px-8">{message}</span>
          <span className="px-8">{message}</span>
        </div>
      </div>
      <span className="hidden border-l border-slate-800 px-3 font-mono text-[10px] text-slate-400 md:inline shrink-0">
        Auto Sync 4 Detik
      </span>
    </div>
  );
}
