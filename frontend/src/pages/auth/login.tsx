import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi, resolveAssetUrl, settingsApi } from '@/lib/api';
import { getStoredAppLogo, getStoredAppName, getStoredAppSubtitle, updateDocumentFavicon, updateDocumentTitle } from '@/lib/branding';
import { useAuthStore } from '@/lib/store';
import { setPageTitle, getAppName } from '@/lib/page-title';
import { ArrowRight, Building2, Loader2, LockKeyhole, ShieldCheck, User } from 'lucide-react';

const GRID_SIZE = 40;
const INFLUENCE_RADIUS = 220;

function InteractiveGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const smoothMouseRef = useRef({ x: -9999, y: -9999 });
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      mouseRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      animFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const { width, height } = container.getBoundingClientRect();
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const canvasWidth = Math.round(width * devicePixelRatio);
    const canvasHeight = Math.round(height * devicePixelRatio);

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    const smoothMouse = smoothMouseRef.current;
    const targetMouse = mouseRef.current;
    smoothMouse.x += (targetMouse.x - smoothMouse.x) * 0.15;
    smoothMouse.y += (targetMouse.y - smoothMouse.y) * 0.15;

    context.clearRect(0, 0, width, height);

    const mouseX = smoothMouse.x;
    const mouseY = smoothMouse.y;
    const columns = Math.ceil(width / GRID_SIZE) + 1;
    const rows = Math.ceil(height / GRID_SIZE) + 1;

    context.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    context.lineWidth = 0.5;

    for (let column = 0; column <= columns; column += 1) {
      const x = column * GRID_SIZE;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    for (let row = 0; row <= rows; row += 1) {
      const y = row * GRID_SIZE;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    if (mouseX > -1000 && mouseY > -1000) {
      const glow = context.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, INFLUENCE_RADIUS * 1.3);
      glow.addColorStop(0, 'rgba(16, 185, 129, 0.08)');
      glow.addColorStop(0.5, 'rgba(14, 165, 233, 0.04)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
    }

    for (let column = 0; column <= columns; column += 1) {
      const x = column * GRID_SIZE;
      const clampedY = Math.max(0, Math.min(height, mouseY));
      const distance = Math.abs(x - mouseX);
      if (distance < INFLUENCE_RADIUS) {
        const ratio = 1 - distance / INFLUENCE_RADIUS;
        const alpha = ratio * ratio * 0.35;
        const segmentTop = Math.max(0, clampedY - INFLUENCE_RADIUS);
        const segmentBottom = Math.min(height, clampedY + INFLUENCE_RADIUS);
        const gradient = context.createLinearGradient(x, segmentTop, x, segmentBottom);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0)');
        gradient.addColorStop(0.5, `rgba(16, 185, 129, ${alpha})`);
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
        context.strokeStyle = gradient;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, segmentTop);
        context.lineTo(x, segmentBottom);
        context.stroke();
      }
    }

    for (let row = 0; row <= rows; row += 1) {
      const y = row * GRID_SIZE;
      const clampedX = Math.max(0, Math.min(width, mouseX));
      const distance = Math.abs(y - mouseY);
      if (distance < INFLUENCE_RADIUS) {
        const ratio = 1 - distance / INFLUENCE_RADIUS;
        const alpha = ratio * ratio * 0.35;
        const segmentLeft = Math.max(0, clampedX - INFLUENCE_RADIUS);
        const segmentRight = Math.min(width, clampedX + INFLUENCE_RADIUS);
        const gradient = context.createLinearGradient(segmentLeft, y, segmentRight, y);
        gradient.addColorStop(0, 'rgba(14, 165, 233, 0)');
        gradient.addColorStop(0.5, `rgba(14, 165, 233, ${alpha})`);
        gradient.addColorStop(1, 'rgba(14, 165, 233, 0)');
        context.strokeStyle = gradient;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(segmentLeft, y);
        context.lineTo(segmentRight, y);
        context.stroke();
      }
    }

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * GRID_SIZE;
        const y = row * GRID_SIZE;
        const deltaX = x - mouseX;
        const deltaY = y - mouseY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const ratio = Math.max(0, 1 - distance / INFLUENCE_RADIUS);
        const eased = ratio * ratio;
        const baseRadius = 1.2;
        const baseOpacity = 0.1;

        if (eased > 0.01) {
          const dotRadius = baseRadius + eased * 5;
          const dotOpacity = baseOpacity + eased * 0.9;
          const glow = context.createRadialGradient(x, y, 0, x, y, dotRadius + 16);
          glow.addColorStop(0, `rgba(34, 211, 238, ${eased * 0.34})`);
          glow.addColorStop(0.4, `rgba(16, 185, 129, ${eased * 0.18})`);
          glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          context.fillStyle = glow;
          context.beginPath();
          context.arc(x, y, dotRadius + 16, 0, Math.PI * 2);
          context.fill();

          context.beginPath();
          context.arc(x, y, dotRadius, 0, Math.PI * 2);
          context.fillStyle = `rgba(240, 253, 250, ${dotOpacity})`;
          context.fill();
        } else {
          context.beginPath();
          context.arc(x, y, baseRadius, 0, Math.PI * 2);
          context.fillStyle = `rgba(255, 255, 255, ${baseOpacity})`;
          context.fill();
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [appName, setAppName] = useState(getStoredAppName());
  const [appSubtitle, setAppSubtitle] = useState(getStoredAppSubtitle());
  const [hospitalName, setHospitalName] = useState(getStoredAppName());
  const [appLogo, setAppLogo] = useState(getStoredAppLogo());

  useEffect(() => {
    setPageTitle('Masuk');
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsApi.getAll();
      const settings = response.data.data;

      if (settings.app_name) {
        setAppName(settings.app_name);
        localStorage.setItem('appName', settings.app_name);
        updateDocumentTitle('Masuk', settings.app_name);
      }
      if (settings.app_subtitle) {
        setAppSubtitle(settings.app_subtitle);
        localStorage.setItem('appSubtitle', settings.app_subtitle);
      }
      setHospitalName(settings.hospital_name || settings.app_name || 'SIMKLINIK');
      setAppLogo(settings.app_logo || settings.app_print_logo || '');
      if (settings.app_logo || settings.app_print_logo) {
        localStorage.setItem('appLogo', settings.app_logo || settings.app_print_logo || '');
      }
      if (settings.app_favicon) {
        localStorage.setItem('appFavicon', settings.app_favicon);
        updateDocumentFavicon(settings.app_favicon);
      }
    } catch {
      setAppName(getAppName());
      const savedSubtitle = localStorage.getItem('appSubtitle');
      if (savedSubtitle) {
        setAppSubtitle(savedSubtitle);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.login({ username, password });
      login(response.data.token, response.data.user);
      const logoElement = (
        <div className="flex aspect-square size-10 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/10 backdrop-blur">
          {logoUrl ? (
            <img src={logoUrl} alt={hospitalName} className="size-10 object-contain" />
          ) : (
            <Building2 className="size-5 text-white" />
          )}
        </div>
      );

      const fadeUp = {
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login gagal. Periksa kembali username dan password Anda.');
    } finally {
      setLoading(false);
    }
        <div className="min-h-screen flex flex-col lg:flex-row">
          <div className="relative hidden overflow-hidden bg-gray-950 lg:flex lg:w-[55%]">
            <InteractiveGrid />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-gray-950/80 via-transparent to-gray-950/40" />

            <div className="relative z-10 flex w-full flex-col justify-between p-10 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="flex items-center gap-3"
              >
                {logoElement}
                <span className="text-xl font-bold tracking-tight text-white">{appName}</span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.4 }}
                className="max-w-md"
              >
                <h1 className="mb-4 text-4xl font-bold leading-tight text-white xl:text-5xl">
                  Sistem Informasi
                  <br />
                  <span className="text-emerald-400">Manajemen</span>
                  <br />
                  Klinik
                </h1>
                {appSubtitle ? (
                  <p className="text-lg leading-relaxed text-gray-400">{appSubtitle}</p>
                ) : (
                  <p className="text-lg leading-relaxed text-gray-400">Platform operasional klinik untuk pendaftaran, pelayanan, penunjang, dan administrasi dalam satu workspace.</p>
                )}
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.8 }}
                className="text-sm text-gray-600"
              >
                &copy; {new Date().getFullYear()} {hospitalName}
              </motion.p>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center bg-background p-6 sm:p-10">
            <div className="absolute inset-0 bg-gray-950 lg:hidden">
              <InteractiveGrid />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gray-950/50 to-gray-950/80" />
            </div>

  const fadeUp = {
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
              className="relative z-10 w-full max-w-sm"
          variants={{
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mb-8 flex items-center justify-center gap-3 lg:hidden"
              >
                {logoElement}
                <span className="text-xl font-bold tracking-tight text-white">{appName}</span>
              </motion.div>

              <div className="rounded-2xl border border-border/50 bg-background/95 p-8 backdrop-blur-xl lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold tracking-tight">Selamat datang</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Masukkan kredensial untuk mengakses akun anda
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="username"
                        type="text"
                        placeholder="Masukkan username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        className="h-11 pl-11"
                        required
                        autoFocus
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-11 pl-11"
                        required
                        autoComplete="current-password"
                      />
                    </div>
                  </div>

                  {error ? (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                    >
                      {error}
                    </motion.div>
                  ) : null}

                  <Button type="submit" className="h-11 w-full text-sm font-medium" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Memproses login...
                      </>
                    ) : (
                      <>
                        Masuk
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <div className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-emerald-700">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Akses internal klinik</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Gunakan username internal yang terdaftar. Jika akses bermasalah, hubungi administrator {hospitalName}.</p>
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              <p className="mt-8 text-center text-xs text-gray-500 lg:hidden">
                &copy; {new Date().getFullYear()} {hospitalName}
              </p>
            </motion.section>
          </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Masuk menggunakan username internal. Bila akses bermasalah, silakan hubungi administrator klinik.</p>
                  </div>
                </div>
              </div>
            </motion.form>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
