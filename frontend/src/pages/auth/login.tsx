import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi, settingsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { setPageTitle, getAppName } from '@/lib/page-title';
import { ArrowRight, Building2, LockKeyhole, Mail, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [appName, setAppName] = useState('StarterKits');
  const [appSubtitle, setAppSubtitle] = useState('Control Panel');
  const [heroBadge, setHeroBadge] = useState('Portal Administrasi');
  const [heroTitlePrimary, setHeroTitlePrimary] = useState('Operasional Klinik');
  const [heroTitleSecondary, setHeroTitleSecondary] = useState('Dalam Satu Command Center');
  const [heroDescription, setHeroDescription] = useState(
    'Pantau pengguna, atur hak akses, dan jalankan alur kerja harian lewat dashboard yang lebih cepat dan rapi.'
  );

  const mouseX = useMotionValue(380);
  const mouseY = useMotionValue(220);
  const smoothX = useSpring(mouseX, { stiffness: 220, damping: 28 });
  const smoothY = useSpring(mouseY, { stiffness: 220, damping: 28 });
  const rotateX = useTransform(smoothY, [0, 720], [6, -6]);
  const rotateY = useTransform(smoothX, [0, 1100], [-8, 8]);
  const spotlight = useMotionTemplate`radial-gradient(320px circle at ${smoothX}px ${smoothY}px, rgba(56,189,248,0.24), rgba(15,23,42,0.04) 55%, rgba(2,6,23,0.8) 100%)`;

  useEffect(() => {
    setPageTitle('Login');
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsApi.getAll();
      const settings = response.data.data;

      if (settings.app_name) {
        setAppName(settings.app_name);
        localStorage.setItem('appName', settings.app_name);
      }
      if (settings.app_subtitle) {
        setAppSubtitle(settings.app_subtitle);
        localStorage.setItem('appSubtitle', settings.app_subtitle);
      }

      // Optional custom login copy from settings if available.
      if (settings.login_badge) setHeroBadge(settings.login_badge);
      if (settings.login_title_primary) setHeroTitlePrimary(settings.login_title_primary);
      if (settings.login_title_secondary) setHeroTitleSecondary(settings.login_title_secondary);
      if (settings.login_description) setHeroDescription(settings.login_description);

      // If custom copy isn't set, derive visible text from existing settings.
      if (!settings.login_title_primary && settings.app_name) {
        setHeroTitlePrimary(settings.app_name);
      }
      if (!settings.login_title_secondary && settings.app_subtitle) {
        setHeroTitleSecondary(settings.app_subtitle);
      }
      if (!settings.login_badge && settings.app_subtitle) {
        setHeroBadge(settings.app_subtitle);
      }
    } catch {
      setAppName(getAppName());
      const savedSubtitle = localStorage.getItem('appSubtitle');
      if (savedSubtitle) {
        setAppSubtitle(savedSubtitle);
        setHeroTitleSecondary(savedSubtitle);
        setHeroBadge(savedSubtitle);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.login({ email, password });
      login(response.data.token, response.data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[1.5fr_1fr]">
      <motion.section
        initial={{ opacity: 0, x: -26 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="relative hidden overflow-hidden bg-slate-950 p-8 text-white lg:flex lg:flex-col"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mouseX.set(e.clientX - rect.left);
          mouseY.set(e.clientY - rect.top);
        }}
        onMouseLeave={() => {
          mouseX.set(380);
          mouseY.set(220);
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="pointer-events-none absolute left-20 top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-20 right-16 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <motion.div className="pointer-events-none absolute inset-0" style={{ background: spotlight }} />
        {[0, 1, 2, 3].map((item) => (
          <motion.div
            key={item}
            className="pointer-events-none absolute h-2 w-2 rounded-full bg-cyan-300/60"
            style={{
              left: `${16 + item * 22}%`,
              top: `${20 + (item % 2) * 18}%`,
            }}
            animate={{
              y: [0, -18, 0],
              opacity: [0.25, 0.85, 0.25],
              scale: [1, 1.25, 1],
            }}
            transition={{
              duration: 3.2 + item * 0.4,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: item * 0.25,
            }}
          />
        ))}

        <motion.div
          style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
          className="relative h-full pb-36"
        >
          <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="relative flex items-center gap-3"
          >
          <div className="flex h-9 w-9 items-center justify-center rounded bg-white/10 ring-1 ring-white/20">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-base font-semibold">{appName}</p>
            <p className="text-xs text-slate-300">{appSubtitle}</p>
          </div>
          </motion.div>

          <div className="relative mt-24 max-w-xl space-y-4">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.16 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {heroBadge}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.22 }}
            className="text-5xl font-semibold leading-[1.05]"
          >
            {heroTitlePrimary}
            <span className="block text-blue-300">{heroTitleSecondary}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="text-sm text-slate-300"
          >
            {heroDescription}
          </motion.p>
          </div>

          <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="absolute bottom-0 left-0 right-0 grid grid-cols-2 gap-3"
          >
            <motion.div
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="rounded-xl border border-white/15 bg-white/5 p-3"
            >
            <p className="text-xs text-slate-300">Authentication</p>
            <p className="mt-1 text-sm font-semibold">Secure Token Session</p>
            </motion.div>
            <motion.div
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="rounded-xl border border-white/15 bg-white/5 p-3"
            >
            <p className="text-xs text-slate-300">Access Layer</p>
            <p className="mt-1 text-sm font-semibold">Role & Permission Gate</p>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.section>

      <motion.section
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0, y: 18 },
          show: {
            opacity: 1,
            y: 0,
            transition: { staggerChildren: 0.08, delayChildren: 0.08 },
          },
        }}
        className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8"
      >
        <div className="w-full max-w-md">
          <motion.div variants={fadeUp} className="mb-8 space-y-2">
            <h2 className="text-3xl font-semibold text-slate-900">Selamat datang</h2>
            <p className="text-sm text-slate-500">Masukkan kredensial untuk mengakses akun anda.</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <motion.div variants={fadeUp} className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-slate-600">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@simrs.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 border-slate-300 bg-white pl-10 text-sm"
                  required
                />
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-slate-600">Password</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 border-slate-300 bg-white pl-10 text-sm"
                  required
                />
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
            </motion.div>

            <motion.div variants={fadeUp}>
              <Button type="submit" className="h-12 w-full gap-2 text-sm" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </motion.div>
          </form>

          <motion.div variants={fadeUp} className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Demo credentials</p>
            <p className="mt-1 font-mono text-xs text-slate-700">admin@simrs.com / admin123</p>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}
