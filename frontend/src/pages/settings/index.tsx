import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { isAxiosError } from "axios";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Eye,
  FileImage,
  FileText,
  HardDrive,
  Image,
  Loader2,
  PlugZap,
  Save,
  Settings,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import { settingsApi } from "@/lib/api";
import { setPageTitle } from "@/lib/page-title";

const getBaseUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8080/api";
  return apiUrl.replace(/\/api$/, "");
};

const BASE_URL = getBaseUrl();

function resolveUploadErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    if (error.code === "ECONNABORTED") {
      return "Upload timeout. Server tidak merespons dalam 95 detik.";
    }

    const apiError = error.response?.data?.error;
    if (typeof apiError === "string" && apiError.trim()) {
      return apiError;
    }
  }

  return fallback;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { toast } = useToast();
  const canAccessIntegrations = hasPermission("settings.update");

  const [activeTab, setActiveTab] = useState<"app" | "branding" | "kop">("app");

  const [appName, setAppName] = useState("SIMKLINIK");
  const [appSubtitle, setAppSubtitle] = useState("Sistem Informasi Manajemen Klinik");
  const [appLogo, setAppLogo] = useState("");
  const [appFavicon, setAppFavicon] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [hospitalCity, setHospitalCity] = useState("");
  const [hospitalPhone, setHospitalPhone] = useState("");
  const [hospitalFax, setHospitalFax] = useState("");
  const [hospitalEmail, setHospitalEmail] = useState("");
  const [hospitalWebsite, setHospitalWebsite] = useState("");
  const [printLogo, setPrintLogo] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingHospitalSettings, setSavingHospitalSettings] = useState(false);
  const [previewingHospitalPdf, setPreviewingHospitalPdf] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingPrintLogo, setUploadingPrintLogo] = useState(false);
  const [fetching, setFetching] = useState(true);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const printLogoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPageTitle("Settings");
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsApi.getAll();
      const settings = response.data.data;

      if (settings.app_name) {
        setAppName(settings.app_name);
        localStorage.setItem("appName", settings.app_name);
      }
      if (settings.app_subtitle) {
        setAppSubtitle(settings.app_subtitle);
        localStorage.setItem("appSubtitle", settings.app_subtitle);
      }
      if (settings.app_logo) {
        setAppLogo(settings.app_logo);
        localStorage.setItem("appLogo", settings.app_logo);
      }
      if (settings.app_favicon) {
        setAppFavicon(settings.app_favicon);
        localStorage.setItem("appFavicon", settings.app_favicon);
        updateFavicon(settings.app_favicon);
      }

      setHospitalName(settings.hospital_name || settings.app_name || "");
      setHospitalAddress(settings.hospital_address || "");
      setHospitalCity(settings.hospital_city || "");
      setHospitalPhone(settings.hospital_phone || "");
      setHospitalFax(settings.hospital_fax || "");
      setHospitalEmail(settings.hospital_email || "");
      setHospitalWebsite(settings.hospital_website || "");
      setPrintLogo(settings.app_print_logo || settings.app_logo || "");
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast({
        variant: "destructive",
        title: "Gagal memuat settings",
        description: "Pengaturan aplikasi belum bisa diambil dari server.",
      });
    } finally {
      setFetching(false);
    }
  };

  const updateFavicon = (faviconUrl: string) => {
    const fullUrl = faviconUrl.startsWith("http") ? faviconUrl : `${BASE_URL}${faviconUrl}`;
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = fullUrl;
  };

  const handleUploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const response = await settingsApi.uploadLogo(file, "logo");
      const url = response.data.url;
      setAppLogo(url);
      localStorage.setItem("appLogo", url);
      window.dispatchEvent(new Event("storage"));
      toast({ variant: "success", title: "Logo diperbarui", description: "Logo aplikasi berhasil diunggah." });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload gagal",
        description: resolveUploadErrorMessage(error, "Logo aplikasi belum berhasil diunggah."),
      });
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  };

  const handleUploadFavicon = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFavicon(true);
    try {
      const response = await settingsApi.uploadLogo(file, "favicon");
      const url = response.data.url;
      setAppFavicon(url);
      localStorage.setItem("appFavicon", url);
      updateFavicon(url);
      toast({ variant: "success", title: "Favicon diperbarui", description: "Favicon aplikasi berhasil diunggah." });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload gagal",
        description: resolveUploadErrorMessage(error, "Favicon belum berhasil diunggah."),
      });
    } finally {
      setUploadingFavicon(false);
      event.target.value = "";
    }
  };

  const handleUploadPrintLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingPrintLogo(true);
    try {
      const response = await settingsApi.uploadLogo(file, "print_logo");
      setPrintLogo(response.data.url);
      toast({ variant: "success", title: "Logo cetak diperbarui", description: "Logo untuk KOP PDF berhasil diunggah." });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload gagal",
        description: resolveUploadErrorMessage(error, "Logo cetak belum berhasil diunggah."),
      });
    } finally {
      setUploadingPrintLogo(false);
      event.target.value = "";
    }
  };

  const handleSaveAppSettings = async () => {
    setLoading(true);
    try {
      await settingsApi.update({
        app_name: appName,
        app_subtitle: appSubtitle,
      });

      localStorage.setItem("appName", appName);
      localStorage.setItem("appSubtitle", appSubtitle);
      window.dispatchEvent(new Event("storage"));

      toast({ variant: "success", title: "Aplikasi tersimpan", description: "Nama dan subtitle aplikasi berhasil diperbarui." });
    } catch {
      toast({ variant: "destructive", title: "Simpan gagal", description: "Pengaturan aplikasi belum berhasil disimpan." });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHospitalSettings = async () => {
    setSavingHospitalSettings(true);
    try {
      await settingsApi.update({
        hospital_name: hospitalName,
        hospital_address: hospitalAddress,
        hospital_city: hospitalCity,
        hospital_phone: hospitalPhone,
        hospital_fax: hospitalFax,
        hospital_email: hospitalEmail,
        hospital_website: hospitalWebsite,
      });

      toast({ variant: "success", title: "KOP tersimpan", description: "Identitas fasilitas untuk dokumen cetak berhasil diperbarui." });
    } catch {
      toast({ variant: "destructive", title: "Simpan gagal", description: "Pengaturan KOP belum berhasil disimpan." });
    } finally {
      setSavingHospitalSettings(false);
    }
  };

  const openPrintHeaderPreview = async () => {
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      toast({ variant: "destructive", title: "Popup diblokir", description: "Izinkan popup untuk membuka preview PDF KOP." });
      return;
    }

    previewWindow.document.write('<html><head><title>Menyiapkan preview...</title></head><body style="font-family:Segoe UI,Tahoma,sans-serif;padding:24px;">Menyiapkan preview PDF KOP...</body></html>');
    previewWindow.document.close();

    setPreviewingHospitalPdf(true);
    try {
      const response = await settingsApi.previewPrintHeader({
        app_name: appName,
        hospital_name: hospitalName,
        hospital_address: hospitalAddress,
        hospital_city: hospitalCity,
        hospital_phone: hospitalPhone,
        hospital_fax: hospitalFax,
        hospital_email: hospitalEmail,
        hospital_website: hospitalWebsite,
        app_print_logo: printLogo,
        app_logo: appLogo,
      });

      const contentType = response.headers["content-type"] || "application/pdf";
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType });
      const objectUrl = URL.createObjectURL(blob);
      previewWindow.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      previewWindow.close();
      toast({ variant: "destructive", title: "Preview gagal", description: "PDF KOP belum berhasil dibuat." });
    } finally {
      setPreviewingHospitalPdf(false);
    }
  };

  const previewLogoUrl = printLogo ? `${BASE_URL}${printLogo}` : appLogo ? `${BASE_URL}${appLogo}` : "";
  const previewHeaderTitle = hospitalName.trim() || appName.trim() || "SIMKLINIK";
  const previewAddressLine = [hospitalAddress.trim(), hospitalCity.trim()].filter(Boolean).join(", ") || "Alamat fasilitas kesehatan";
  const previewContactLine = [
    hospitalPhone.trim() ? `Telp: ${hospitalPhone.trim()}` : "",
    hospitalFax.trim() ? `Fax: ${hospitalFax.trim()}` : "",
    hospitalEmail.trim(),
  ].filter(Boolean).join(" | ") || "Telepon / fax / email";
  const previewWebsiteLine = hospitalWebsite.trim() || "www.klinik.co.id";

  const renderSectionHeader = (icon: ReactNode, title: string) => (
    <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/60 pb-2 mb-4">
      {icon}
      <span>{title}</span>
    </div>
  );

  if (fetching) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-muted/20 min-h-full">
      {/* Satu Card Utuh Sesuai Standar Detail SIMKLINIK */}
      <div className="border border-border/80 bg-card shadow-none">
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
              <Settings className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-foreground truncate">
                  Pengaturan Sistem
                </h1>
                <Badge variant="secondary" className="h-5 rounded-none px-2 text-[10px] uppercase tracking-wide font-mono shadow-none">
                  {appName}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs rounded-none shadow-none">
              <Link to="/settings/versioning">
                <BadgeCheck className="mr-1.5 size-3.5" />
                Versioning
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs rounded-none shadow-none">
              <Link to="/settings/terms-and-conditions">
                <FileText className="mr-1.5 size-3.5" />
                Terms & Conditions
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs rounded-none shadow-none">
              <Link to="/settings/operations">
                <HardDrive className="mr-1.5 size-3.5" />
                Monitoring Backup
              </Link>
            </Button>
            {canAccessIntegrations && (
              <Button asChild size="sm" className="h-8 text-xs rounded-none shadow-none">
                <Link to="/settings/integrations">
                  <PlugZap className="mr-1.5 size-3.5" />
                  Integrasi
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Card Body Langsung di Dalam Card yang Sama */}
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* KOLOM KIRI: Card Identitas Aplikasi & Sidetabs Navigasi */}
            <div className="lg:col-span-4 xl:col-span-3 space-y-4">
              <div className="border border-border/70 bg-muted/[0.03] p-4 relative shadow-none">
                <div className="flex flex-col items-center pt-2">
                  <div className="size-20 rounded-lg border border-border bg-zinc-950 dark:bg-zinc-900 text-white flex items-center justify-center font-bold shadow-sm overflow-hidden p-2">
                    {appLogo ? (
                      <img src={`${BASE_URL}${appLogo}`} alt="App Logo" className="size-full object-contain" />
                    ) : (
                      <Building2 className="size-10 text-primary" />
                    )}
                  </div>
                  <h2 className="text-base font-bold text-center mt-3 text-foreground tracking-tight uppercase leading-snug">
                    {appName}
                  </h2>
                  <p className="text-xs text-muted-foreground text-center mt-0.5 font-mono line-clamp-1">
                    {appSubtitle}
                  </p>
                </div>

                <div className="border-t border-border/60 my-4" />

                <div className="space-y-3 text-xs">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">LOGO APLIKASI</p>
                    <p className="font-medium text-foreground mt-0.5">{appLogo ? "Sudah Diunggah" : "Belum Ada"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">FAVICON BROWSER</p>
                    <p className="font-medium text-foreground mt-0.5">{appFavicon ? "Sudah Diunggah" : "Belum Ada"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">LOGO CETAK KOP</p>
                    <p className="font-medium text-foreground mt-0.5">{printLogo ? "Sudah Diunggah" : "Mengikuti Logo Utama"}</p>
                  </div>
                </div>
              </div>

              {/* Sidetabs Navigasi */}
              <div className="border border-border/70 bg-card p-1.5 space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("app")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "app"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <Settings className="size-4 shrink-0" />
                  <span>Identitas Aplikasi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("branding")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "branding"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <Image className="size-4 shrink-0" />
                  <span>Aset Branding (Logo)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("kop")}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors rounded-none",
                    activeTab === "kop"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground font-medium"
                  )}
                >
                  <FileText className="size-4 shrink-0" />
                  <span>KOP Dokumen PDF</span>
                </button>
              </div>
            </div>

            {/* KOLOM KANAN: Isi Sidetab Aktif */}
            <div className="lg:col-span-8 xl:col-span-9 min-w-0">
              {activeTab === "app" && (
                <div className="space-y-4">
                  {renderSectionHeader(<Settings className="size-4 text-muted-foreground" />, "Konfigurasi Identitas Aplikasi")}
                  <div className="space-y-4 border border-border/70 p-4 bg-card">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="appName" className="text-xs font-semibold text-foreground uppercase">Nama Aplikasi</Label>
                        <Input
                          id="appName"
                          value={appName}
                          onChange={(e) => setAppName(e.target.value)}
                          placeholder="SIMKLINIK"
                          className="h-9 text-xs rounded-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="appSubtitle" className="text-xs font-semibold text-foreground uppercase">Subtitle Aplikasi</Label>
                        <Input
                          id="appSubtitle"
                          value={appSubtitle}
                          onChange={(e) => setAppSubtitle(e.target.value)}
                          placeholder="Sistem Informasi Manajemen Klinik"
                          className="h-9 text-xs rounded-none"
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button
                        size="sm"
                        onClick={handleSaveAppSettings}
                        disabled={loading}
                        className="h-8 px-4 text-xs rounded-none shadow-none"
                      >
                        {loading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Save className="mr-1.5 size-3.5" />}
                        Simpan Identitas Aplikasi
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "branding" && (
                <div className="space-y-4">
                  {renderSectionHeader(<Image className="size-4 text-muted-foreground" />, "Aset Visual & Branding")}
                  <div className="grid gap-4 sm:grid-cols-3">
                    {/* Logo Utama */}
                    <div className="border border-border/70 p-4 bg-card space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-foreground uppercase">Logo Utama</p>
                        <div className="h-28 border border-border/70 bg-muted/10 flex items-center justify-center p-2">
                          {appLogo ? (
                            <img src={`${BASE_URL}${appLogo}`} alt="App Logo" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <Image className="size-8 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={handleUploadLogo}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingLogo}
                          onClick={() => logoInputRef.current?.click()}
                          className="w-full h-8 text-xs rounded-none shadow-none"
                        >
                          {uploadingLogo ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Upload className="mr-1.5 size-3.5" />}
                          Unggah Logo
                        </Button>
                      </div>
                    </div>

                    {/* Favicon */}
                    <div className="border border-border/70 p-4 bg-card space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-foreground uppercase">Favicon Browser</p>
                        <div className="h-28 border border-border/70 bg-muted/10 flex items-center justify-center p-2">
                          {appFavicon ? (
                            <img src={`${BASE_URL}${appFavicon}`} alt="Favicon" className="size-8 object-contain" />
                          ) : (
                            <FileImage className="size-8 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div>
                        <input
                          ref={faviconInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/x-icon,image/svg+xml"
                          onChange={handleUploadFavicon}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingFavicon}
                          onClick={() => faviconInputRef.current?.click()}
                          className="w-full h-8 text-xs rounded-none shadow-none"
                        >
                          {uploadingFavicon ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Upload className="mr-1.5 size-3.5" />}
                          Unggah Favicon
                        </Button>
                      </div>
                    </div>

                    {/* Logo Cetak KOP */}
                    <div className="border border-border/70 p-4 bg-card space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-foreground uppercase">Logo KOP Dokumen</p>
                        <div className="h-28 border border-border/70 bg-muted/10 flex items-center justify-center p-2">
                          {printLogo ? (
                            <img src={`${BASE_URL}${printLogo}`} alt="Print Logo" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <FileText className="size-8 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div>
                        <input
                          ref={printLogoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={handleUploadPrintLogo}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingPrintLogo}
                          onClick={() => printLogoInputRef.current?.click()}
                          className="w-full h-8 text-xs rounded-none shadow-none"
                        >
                          {uploadingPrintLogo ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Upload className="mr-1.5 size-3.5" />}
                          Unggah Logo Cetak
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "kop" && (
                <div className="space-y-5">
                  <div>
                    {renderSectionHeader(<FileText className="size-4 text-muted-foreground" />, "Identitas KOP Surat PDF")}
                    <div className="space-y-4 border border-border/70 p-4 bg-card">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground uppercase">Nama Fasilitas / Klinik</Label>
                          <Input
                            value={hospitalName}
                            onChange={(e) => setHospitalName(e.target.value)}
                            placeholder="Klinik Pratama Sehat"
                            className="h-8 text-xs rounded-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground uppercase">Kota</Label>
                          <Input
                            value={hospitalCity}
                            onChange={(e) => setHospitalCity(e.target.value)}
                            placeholder="Jakarta Selatan"
                            className="h-8 text-xs rounded-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground uppercase">Alamat Lengkap</Label>
                        <Input
                          value={hospitalAddress}
                          onChange={(e) => setHospitalAddress(e.target.value)}
                          placeholder="Jl. Raya Utama No. 123"
                          className="h-8 text-xs rounded-none"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground uppercase">Telepon</Label>
                          <Input
                            value={hospitalPhone}
                            onChange={(e) => setHospitalPhone(e.target.value)}
                            placeholder="021-1234567"
                            className="h-8 text-xs rounded-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground uppercase">Fax</Label>
                          <Input
                            value={hospitalFax}
                            onChange={(e) => setHospitalFax(e.target.value)}
                            placeholder="021-1234568"
                            className="h-8 text-xs rounded-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground uppercase">Email</Label>
                          <Input
                            value={hospitalEmail}
                            onChange={(e) => setHospitalEmail(e.target.value)}
                            placeholder="info@klinik.co.id"
                            className="h-8 text-xs rounded-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground uppercase">Website</Label>
                          <Input
                            value={hospitalWebsite}
                            onChange={(e) => setHospitalWebsite(e.target.value)}
                            placeholder="www.klinik.co.id"
                            className="h-8 text-xs rounded-none"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={handleSaveHospitalSettings}
                          disabled={savingHospitalSettings}
                          className="h-8 px-4 text-xs rounded-none shadow-none"
                        >
                          {savingHospitalSettings ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Save className="mr-1.5 size-3.5" />}
                          Simpan Identitas KOP
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={previewingHospitalPdf}
                          onClick={openPrintHeaderPreview}
                          className="h-8 text-xs rounded-none shadow-none"
                        >
                          {previewingHospitalPdf ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Eye className="mr-1.5 size-3.5" />}
                          Preview PDF KOP
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Visual Preview KOP */}
                  <div>
                    {renderSectionHeader(<Eye className="size-4 text-muted-foreground" />, "Simulasi Tampilan KOP Surat")}
                    <div className="border border-border/70 p-4 bg-white text-slate-900 shadow-sm">
                      <div className="flex items-center gap-4 pb-3 border-b-2 border-slate-900">
                        {previewLogoUrl ? (
                          <img src={previewLogoUrl} alt="Logo" className="h-14 w-14 object-contain shrink-0" />
                        ) : (
                          <div className="h-14 w-14 border border-dashed border-slate-300 flex items-center justify-center shrink-0">
                            <span className="text-[10px] text-slate-400">LOGO</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-slate-950 uppercase tracking-tight">{previewHeaderTitle}</h3>
                          <p className="text-xs text-slate-700 mt-0.5">{previewAddressLine}</p>
                          <p className="text-[11px] text-slate-600">{previewContactLine}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{previewWebsiteLine}</p>
                        </div>
                      </div>
                      <div className="pt-4 space-y-2 opacity-30">
                        <div className="h-2 bg-slate-300 rounded w-1/3" />
                        <div className="h-2 bg-slate-200 rounded w-full" />
                        <div className="h-2 bg-slate-200 rounded w-5/6" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
