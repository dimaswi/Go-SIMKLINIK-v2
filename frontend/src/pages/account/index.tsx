import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usersApi } from '@/lib/api';
import { setPageTitle } from '@/lib/page-title';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
} from 'lucide-react';

function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setPageTitle('Pengaturan Akun');
  }, []);

  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        full_name: user.full_name || '',
        email: user.email || '',
      }));
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.full_name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validasi Gagal',
        description: 'Nama lengkap tidak boleh kosong.',
      });
      return;
    }

    setUpdatingProfile(true);
    try {
      const updateData = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        role_id: user.role_id,
        is_active: user.is_active,
      };

      await usersApi.update(user.id, updateData);

      setUser({
        ...user,
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
      });

      toast({
        variant: 'success',
        title: 'Profil Diperbarui',
        description: 'Informasi akun Anda berhasil disimpan.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Memperbarui Profil',
        description: error.response?.data?.error || 'Terjadi kesalahan saat memperbarui data profil.',
      });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.new_password) {
      toast({
        variant: 'destructive',
        title: 'Validasi Gagal',
        description: 'Kata sandi baru tidak boleh kosong.',
      });
      return;
    }

    if (formData.new_password.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Kata Sandi Terlalu Pendek',
        description: 'Kata sandi baru minimal terdiri dari 6 karakter.',
      });
      return;
    }

    if (formData.new_password !== formData.confirm_password) {
      toast({
        variant: 'destructive',
        title: 'Konfirmasi Sandi Tidak Cocok',
        description: 'Kata sandi baru dan konfirmasi kata sandi harus sama.',
      });
      return;
    }

    setChangingPassword(true);
    try {
      await usersApi.update(user.id, {
        password: formData.new_password,
      });

      toast({
        variant: 'success',
        title: 'Kata Sandi Berhasil Diubah',
        description: 'Kata sandi baru Anda telah aktif. Harap simpan dengan baik.',
      });

      setFormData((prev) => ({
        ...prev,
        current_password: '',
        new_password: '',
        confirm_password: '',
      }));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Mengubah Kata Sandi',
        description: error.response?.data?.error || 'Terjadi kesalahan saat mengubah kata sandi.',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const passwordsMatch = Boolean(
    formData.new_password &&
    formData.confirm_password &&
    formData.new_password === formData.confirm_password
  );

  const passwordMismatch = Boolean(
    formData.confirm_password &&
    formData.new_password !== formData.confirm_password
  );

  return (
    <div className="p-4 lg:p-6 bg-muted/20 min-h-full flex flex-col flex-1">
      {/* Satu Card Utuh Sesuai Standar SIMKLINIK */}
      <div className="border border-border/80 bg-card shadow-none flex-1 flex flex-col">
        {/* Card Header (Baris Atas di dalam Satu Card) */}
        <div className="flex flex-col gap-3 p-4 border-b border-border xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-none shadow-none shrink-0"
              onClick={() => navigate(-1)}
              aria-label="Kembali"
              title="Kembali"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border/70 bg-muted/20">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-foreground truncate">
                  Pengaturan Akun
                </h1>
                <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide font-mono shadow-none">
                  {user?.role?.name || 'User'}
                </Badge>
                <Badge variant="outline" className="h-5 rounded-none px-2 text-[10px] font-mono shadow-none text-muted-foreground">
                  @{user?.username || '-'}
                </Badge>
                <Badge
                  className={cn(
                    'h-5 rounded-none px-2 text-[10px] uppercase tracking-wide shadow-none border-0 text-white',
                    user?.is_active ? 'bg-emerald-600' : 'bg-zinc-500'
                  )}
                >
                  {user?.is_active ? 'Aktif' : 'Non-aktif'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-xs font-mono text-muted-foreground">
            <Badge variant="outline" className="rounded-none font-mono text-xs shadow-none">
              #ID-{user?.id ?? '-'}
            </Badge>
          </div>
        </div>

        {/* Card Body Langsung di Dalam Card yang Sama */}
        <div className="p-4 sm:p-5 flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* KOLOM KIRI: Card Profil Pengguna & Sidetabs Navigasi */}
            <div className="lg:col-span-4 xl:col-span-3 space-y-4">
              <div className="border border-border/70 bg-muted/[0.03] p-4 relative shadow-none">
                <Badge
                  className={cn(
                    'absolute top-3.5 right-3.5 text-[10px] font-bold tracking-wider rounded-none px-2 py-0.5 shadow-none border-0 text-white',
                    user?.is_active ? 'bg-emerald-600' : 'bg-zinc-500'
                  )}
                >
                  {user?.is_active ? 'AKTIF' : 'NONAKTIF'}
                </Badge>

                <div className="flex flex-col items-center pt-2">
                  <div className="size-20 rounded-none border border-border bg-zinc-950 dark:bg-zinc-900 text-white flex items-center justify-center font-bold text-2xl shadow-sm">
                    {getInitials(user?.full_name || user?.username)}
                  </div>
                  <h2 className="text-base font-bold text-center mt-3 text-foreground tracking-tight leading-snug">
                    {user?.full_name || user?.username || 'User'}
                  </h2>
                  <p className="text-xs text-muted-foreground text-center mt-0.5 font-mono">
                    @{user?.username || '-'}
                  </p>
                  <div className="mt-2.5">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 border border-border rounded-none text-foreground bg-muted/30 uppercase tracking-wider">
                      {user?.role?.name || 'STAF'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-border/60 my-4" />

                <div className="space-y-3 text-xs">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">EMAIL TERDAFTAR</p>
                    <p className="font-mono text-foreground mt-0.5 truncate" title={user?.email || '-'}>
                      {user?.email || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">STATUS AUTENTIKASI</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Terverifikasi Sesi Aktif</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidetabs Navigasi */}
              <div className="border border-border/70 bg-card p-1.5 space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-none transition-colors text-left',
                    activeTab === 'profile'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span>Informasi Profil</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('security')}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-none transition-colors text-left',
                    activeTab === 'security'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  <KeyRound className="h-4 w-4 shrink-0" />
                  <span>Keamanan & Sandi</span>
                </button>
              </div>

              {/* Security Callout Tip */}
              <div className="border border-border/60 bg-muted/10 p-3 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px] uppercase tracking-wider">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                  <span>Tips Keamanan</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Gunakan kata sandi unik dan perbarui secara berkala. Jangan membagikan kredensial login kepada pihak lain.
                </p>
              </div>
            </div>

            {/* KOLOM KANAN: Konten Form Tab */}
            <div className="lg:col-span-8 xl:col-span-9">
              {activeTab === 'profile' && (
                <div className="border border-border/70 bg-card">
                  <div className="p-4 border-b border-border/70 flex items-center justify-between bg-muted/[0.04]">
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary" />
                        Informasi Profil Pribadi
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Kelola nama lengkap dan kontak email akun petugas SIMKLINIK Anda.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleUpdateProfile} className="p-4 sm:p-6 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="full_name" className="text-xs font-semibold flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          Nama Lengkap
                        </Label>
                        <Input
                          id="full_name"
                          value={formData.full_name}
                          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                          placeholder="Masukkan nama lengkap"
                          className="h-9 text-xs rounded-none shadow-none"
                          required
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Nama yang akan dicetak pada rekam medis dan lembar telaah resep.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="username" className="text-xs font-semibold flex items-center gap-1.5">
                          <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                          Username
                        </Label>
                        <Input
                          id="username"
                          value={user?.username || ''}
                          disabled
                          className="h-9 text-xs rounded-none bg-muted/40 font-mono shadow-none text-muted-foreground cursor-not-allowed"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Username digunakan untuk proses login akun dan bersifat permanen.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-xs font-semibold flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          Alamat Email
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="nama@klinik.co.id"
                          className="h-9 text-xs rounded-none shadow-none font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Email aktif untuk keperluan notifikasi sistem.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                          Peran / Hak Akses
                        </Label>
                        <div className="h-9 px-3 flex items-center border border-border bg-muted/20">
                          <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-wider font-mono bg-background">
                            {user?.role?.name || 'User'}
                          </Badge>
                          <span className="ml-2 text-xs text-muted-foreground">
                            (Dikelola oleh Administrator)
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Hak akses diatur melalui menu Manajemen Pengguna.
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-border/70 pt-4 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-muted-foreground">
                        Pastikan data yang diisi telah sesuai sebelum menyimpan.
                      </p>
                      <Button
                        type="submit"
                        disabled={updatingProfile}
                        size="sm"
                        className="rounded-none shadow-none text-xs px-4"
                      >
                        {updatingProfile ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Simpan Profil
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="border border-border/70 bg-card">
                  <div className="p-4 border-b border-border/70 flex items-center justify-between bg-muted/[0.04]">
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-primary" />
                        Keamanan & Kata Sandi
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Perbarui kata sandi secara berkala untuk menjaga keamanan akun Anda.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleChangePassword} className="p-4 sm:p-6 space-y-5">
                    <div className="max-w-md space-y-4">
                      {/* Current Password (Optional helper/verification) */}
                      <div className="space-y-1.5">
                        <Label htmlFor="current_password" className="text-xs font-semibold flex items-center gap-1.5">
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          Kata Sandi Lama (Opsional)
                        </Label>
                        <div className="relative">
                          <Input
                            id="current_password"
                            type={showCurrentPassword ? 'text' : 'password'}
                            value={formData.current_password}
                            onChange={(e) => setFormData({ ...formData, current_password: e.target.value })}
                            placeholder="Ketik kata sandi lama jika ingat"
                            className="h-9 text-xs rounded-none shadow-none pr-9 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* New Password */}
                      <div className="space-y-1.5">
                        <Label htmlFor="new_password" className="text-xs font-semibold flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          Kata Sandi Baru <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <Input
                            id="new_password"
                            type={showNewPassword ? 'text' : 'password'}
                            value={formData.new_password}
                            onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                            placeholder="Minimal 6 karakter"
                            className="h-9 text-xs rounded-none shadow-none pr-9 font-mono"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Gunakan kombinasi huruf, angka, dan simbol untuk keamanan lebih tinggi.
                        </p>
                      </div>

                      {/* Confirm New Password */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="confirm_password" className="text-xs font-semibold flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            Konfirmasi Kata Sandi Baru <span className="text-destructive">*</span>
                          </Label>
                          {passwordsMatch && (
                            <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="h-3 w-3" /> Cocok
                            </span>
                          )}
                          {passwordMismatch && (
                            <span className="text-[10px] text-destructive flex items-center gap-1 font-semibold">
                              <AlertCircle className="h-3 w-3" /> Tidak Cocok
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            id="confirm_password"
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={formData.confirm_password}
                            onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                            placeholder="Ketik ulang kata sandi baru"
                            className={cn(
                              'h-9 text-xs rounded-none shadow-none pr-9 font-mono',
                              passwordsMatch && 'border-emerald-500 focus-visible:ring-emerald-500',
                              passwordMismatch && 'border-destructive focus-visible:ring-destructive'
                            )}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border/70 pt-4 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-muted-foreground">
                        Setelah disimpan, Anda dapat menggunakan kata sandi baru untuk login selanjutnya.
                      </p>
                      <Button
                        type="submit"
                        disabled={changingPassword || !formData.new_password}
                        size="sm"
                        className="rounded-none shadow-none text-xs px-4"
                      >
                        {changingPassword ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Lock className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Perbarui Kata Sandi
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
