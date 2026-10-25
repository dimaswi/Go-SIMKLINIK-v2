import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { isAxiosError } from "axios";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeCheck,
  FileText,
  HardDrive,
  Eye,
  FileImage,
  Image,
  Loader2,
  Save,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import { settingsApi } from "@/lib/api";
import { setPageTitle } from "@/lib/page-title";
import {
  MasterDataAsideSection,
  MasterDataAsideStack,
  MasterDataLegacySections,
  MasterDataPageShell,
} from "@/pages/master-data/shared";

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

      toast({ variant: "success", title: "Application tersimpan", description: "Nama dan subtitle aplikasi berhasil diperbarui." });
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
  const previewDocumentLines = Array.from({ length: 12 }, (_, index) => index);

  const appSummary = useMemo(() => ({
    title: appName.trim() || "SIMKLINIK",
    subtitle: appSubtitle.trim() || "Subtitle belum diisi",
  }), [appName, appSubtitle]);

  if (fetching) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <MasterDataPageShell
        title="Settings"
        subtitle="Pusat konfigurasi aplikasi, branding, dokumen cetak, dan pengaturan integrasi eksternal."
        meta={<><span>{appSummary.title}</span><span>{previewHeaderTitle}</span></>}
        onBack={() => navigate(-1)}
        actions={
          <>
            <Button asChild variant="outline" className="rounded-none shadow-none">
              <Link to="/settings/versioning">
                Versioning
                <BadgeCheck className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-none shadow-none">
              <Link to="/settings/terms-and-conditions">
                Terms & Conditions
                <FileText className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-none shadow-none">
              <Link to="/settings/operations">
                Monitoring Backup
                <HardDrive className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            {canAccessIntegrations ? (
              <Button asChild variant="outline" className="rounded-none shadow-none">
                <Link to="/settings/integrations">
                  Buka Integrasi
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </>
        }
        aside={
          <MasterDataAsideStack>
            <div>
              <MasterDataAsideSection title="Ringkasan Aplikasi" helper="Identitas utama yang tampil di sidebar, halaman login, dan elemen branding lain.">
                <div className="space-y-2 text-sm">
                  <p className="font-medium">{appSummary.title}</p>
                  <p className="text-muted-foreground">{appSummary.subtitle}</p>
                  <p className="text-muted-foreground">Logo: {appLogo ? "Tersedia" : "Belum diunggah"}</p>
                  <p className="text-muted-foreground">Favicon: {appFavicon ? "Tersedia" : "Belum diunggah"}</p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Identitas Dokumen" helper="Dipakai untuk KOP PDF dan dokumen klinis lain yang dicetak dari backend.">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{previewHeaderTitle}</p>
                  <p>{previewAddressLine}</p>
                  <p>{previewContactLine}</p>
                  <p>{previewWebsiteLine}</p>
                </div>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Versioning" helper="Lihat cakupan versi aktif SIMKLINIK berdasarkan modul yang sudah tersedia saat ini.">
                <Button asChild variant="outline" className="w-full rounded-none shadow-none">
                  <Link to="/settings/versioning">Buka Versioning</Link>
                </Button>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Terms & Conditions" helper="Dokumen ketentuan penggunaan SIMKLINIK untuk akses, data pasien, keamanan, dan integrasi operasional.">
                <Button asChild variant="outline" className="w-full rounded-none shadow-none">
                  <Link to="/settings/terms-and-conditions">Buka Terms & Conditions</Link>
                </Button>
              </MasterDataAsideSection>
            </div>
            <div>
              <MasterDataAsideSection title="Monitoring Backup" helper="Pantau storage VPS, atur auto-backup, jalankan backup manual, dan unduh file backup yang dihasilkan sistem.">
                <Button asChild variant="outline" className="w-full rounded-none shadow-none">
                  <Link to="/settings/operations">Buka Monitoring Backup</Link>
                </Button>
              </MasterDataAsideSection>
            </div>
            {canAccessIntegrations ? (
              <div>
                <MasterDataAsideSection title="Akses Cepat" helper="Lanjutkan ke halaman integrasi saat perlu menghubungkan SIMKLINIK dengan sistem eksternal.">
                  <Button asChild variant="outline" className="w-full rounded-none shadow-none">
                    <Link to="/settings/integrations">Kelola Integrasi</Link>
                  </Button>
                </MasterDataAsideSection>
              </div>
            ) : null}
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-3 border border-border/70 p-4">
              <div className="space-y-0.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Application</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Atur identitas utama aplikasi yang dipakai di sidebar, judul halaman, dan area login.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="appName" className="text-xs font-medium">Application Name</Label>
                  <Input id="appName" value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="SIMKLINIK" className="h-9 text-xs rounded-none" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="appSubtitle" className="text-xs font-medium">Application Subtitle</Label>
                  <Input id="appSubtitle" value={appSubtitle} onChange={(event) => setAppSubtitle(event.target.value)} placeholder="Sistem Informasi Manajemen Klinik" className="h-9 text-xs rounded-none" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={handleSaveAppSettings} disabled={loading} className="h-8 px-4 text-xs rounded-none shadow-none">
                  {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Simpan Application
                </Button>
              </div>
            </section>

            <section className="space-y-3 border border-border/70 p-4">
              <div className="space-y-0.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Branding Assets</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Upload logo, favicon, dan logo khusus dokumen cetak. Seluruh aset disimpan di server dan dipakai lintas halaman.</p>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <AssetUploadCard
                  title="Application Logo"
                  description="Digunakan di sidebar dan halaman login."
                  icon={<Image className="h-4 w-4 text-muted-foreground" />}
                  imageUrl={appLogo ? `${BASE_URL}${appLogo}` : ""}
                  emptyIcon={<Image className="h-8 w-8 text-muted-foreground" />}
                  buttonLabel="Upload Logo"
                  loading={uploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                >
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml" onChange={handleUploadLogo} className="hidden" />
                  <p className="text-[11px] text-muted-foreground">PNG, JPG, atau SVG. Disarankan latar transparan.</p>
                </AssetUploadCard>

                <AssetUploadCard
                  title="Favicon"
                  description="Dipakai di tab browser dan shortcut bookmark."
                  icon={<FileImage className="h-4 w-4 text-muted-foreground" />}
                  imageUrl={appFavicon ? `${BASE_URL}${appFavicon}` : ""}
                  emptyIcon={<FileImage className="h-8 w-8 text-muted-foreground" />}
                  buttonLabel="Upload Favicon"
                  loading={uploadingFavicon}
                  onClick={() => faviconInputRef.current?.click()}
                >
                  <input ref={faviconInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/x-icon,image/ico" onChange={handleUploadFavicon} className="hidden" />
                  <p className="text-[11px] text-muted-foreground">ICO, PNG, atau JPG. 32x32 atau 64x64 direkomendasikan.</p>
                </AssetUploadCard>

                <AssetUploadCard
                  title="Print Logo"
                  description="Diprioritaskan untuk KOP PDF dan dokumen cetak lain."
                  icon={<Image className="h-4 w-4 text-muted-foreground" />}
                  imageUrl={printLogo ? `${BASE_URL}${printLogo}` : ""}
                  emptyIcon={<Image className="h-8 w-8 text-muted-foreground" />}
                  buttonLabel="Upload Print Logo"
                  loading={uploadingPrintLogo}
                  onClick={() => printLogoInputRef.current?.click()}
                >
                  <input ref={printLogoInputRef} type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleUploadPrintLogo} className="hidden" />
                  <p className="text-[11px] text-muted-foreground">Gunakan PNG atau JPG agar render PDF backend tetap stabil.</p>
                </AssetUploadCard>
              </div>
            </section>

            <section className="space-y-3 border border-border/70 p-4">
              <div className="space-y-0.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Versioning</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Halaman versioning v1 merangkum versi aktif berdasarkan fitur SIMKLINIK yang memang sudah berjalan sekarang.</p>
              </div>

              <div className="flex flex-col gap-3 border border-border/70 p-3 md:flex-row md:items-center md:justify-between bg-muted/10">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium">Ringkasan versi aktif dan cakupan fitur</div>
                  <p className="text-[11px] text-muted-foreground">Mengecek modul yang sudah masuk versi berjalan tanpa mencampur roadmap.</p>
                </div>
                <Button asChild size="sm" variant="outline" className="h-8 text-xs rounded-none shadow-none">
                  <Link to="/settings/versioning">
                    Buka Halaman Versioning
                    <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </section>

            <section className="space-y-3 border border-border/70 p-4">
              <div className="space-y-0.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Terms & Conditions</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Ketentuan penggunaan SIMKLINIK untuk user internal, pengelolaan data pasien, dan alur operasional.</p>
              </div>

              <div className="flex flex-col gap-3 border border-border/70 p-3 md:flex-row md:items-center md:justify-between bg-muted/10">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium">Ketentuan penggunaan aplikasi operasional klinik</div>
                  <p className="text-[11px] text-muted-foreground">Dipakai sebagai referensi internal saat onboarding user atau review SOP digital.</p>
                </div>
                <Button asChild size="sm" variant="outline" className="h-8 text-xs rounded-none shadow-none">
                  <Link to="/settings/terms-and-conditions">
                    Buka Terms & Conditions
                    <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </section>

            {canAccessIntegrations ? (
              <section className="space-y-3 border border-border/70 p-4">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Integrations</h2>
                  <p className="text-[11px] leading-5 text-muted-foreground">Ruang konfigurasi integrasi sistem eksternal seperti SATUSEHAT dan BPJS.</p>
                </div>

                <div className="flex flex-col gap-3 border border-border/70 p-3 md:flex-row md:items-center md:justify-between bg-muted/10">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium">SATUSEHAT dan katalog integrasi</div>
                    <p className="text-[11px] text-muted-foreground">Endpoint autentikasi, base URL FHIR, organization ID, client ID, dan client secret.</p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="h-8 text-xs rounded-none shadow-none">
                    <Link to="/settings/integrations">
                      Buka Halaman Integrasi
                      <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </section>
            ) : null}

            <section className="space-y-3 border border-border/70 p-4">
              <div className="space-y-0.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Print Header / KOP</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Konfigurasi identitas fasilitas yang dipakai oleh dokumen PDF backend.</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="hospitalName" className="text-xs font-medium">Nama Klinik / RS</Label>
                    <Input id="hospitalName" value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} placeholder="Klinik Utama Sehat" className="h-9 text-xs rounded-none" />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="hospitalAddress" className="text-xs font-medium">Alamat</Label>
                    <Textarea id="hospitalAddress" value={hospitalAddress} onChange={(event) => setHospitalAddress(event.target.value)} placeholder="Jl. Contoh No. 1, Kelurahan, Kecamatan" rows={2} className="text-xs rounded-none" />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="hospitalCity" className="text-xs font-medium">Kota / Kabupaten</Label>
                      <Input id="hospitalCity" value={hospitalCity} onChange={(event) => setHospitalCity(event.target.value)} placeholder="Bojonegoro" className="h-9 text-xs rounded-none" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="hospitalPhone" className="text-xs font-medium">Telepon</Label>
                      <Input id="hospitalPhone" value={hospitalPhone} onChange={(event) => setHospitalPhone(event.target.value)} placeholder="(0353) 123456" className="h-9 text-xs rounded-none" />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="hospitalFax" className="text-xs font-medium">Fax</Label>
                      <Input id="hospitalFax" value={hospitalFax} onChange={(event) => setHospitalFax(event.target.value)} placeholder="(0353) 123457" className="h-9 text-xs rounded-none" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="hospitalEmail" className="text-xs font-medium">Email</Label>
                      <Input id="hospitalEmail" value={hospitalEmail} onChange={(event) => setHospitalEmail(event.target.value)} placeholder="info@klinik.co.id" className="h-9 text-xs rounded-none" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="hospitalWebsite" className="text-xs font-medium">Website</Label>
                      <Input id="hospitalWebsite" value={hospitalWebsite} onChange={(event) => setHospitalWebsite(event.target.value)} placeholder="www.klinik.co.id" className="h-9 text-xs rounded-none" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" onClick={handleSaveHospitalSettings} disabled={savingHospitalSettings} className="h-8 px-4 text-xs rounded-none shadow-none">
                      {savingHospitalSettings ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                      Simpan KOP
                    </Button>
                    <Button size="sm" variant="outline" onClick={openPrintHeaderPreview} disabled={previewingHospitalPdf} className="h-8 px-3 text-xs rounded-none shadow-none">
                      {previewingHospitalPdf ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
                      Lihat Contoh PDF
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Preview KOP</p>
                    <p className="mt-1 text-xs text-muted-foreground">Kanvas ini meniru susunan header, area isi, dan penempatan tanda tangan pada dokumen PDF.</p>
                  </div>

                  <div className="rounded-xl border bg-[#f7f7f5] px-4 py-6 md:px-6">
                    <div className="mx-auto aspect-[210/297] w-full max-w-[480px] border border-slate-300 bg-white p-5 text-slate-900 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                      <div className="flex items-start gap-3 border-b border-slate-500 pb-2">
                        <div className="flex h-14 shrink-0 items-start justify-center overflow-hidden bg-transparent">
                          {previewLogoUrl ? (
                            <img src={previewLogoUrl} alt="Preview Print Logo" className="max-h-full w-auto object-contain" />
                          ) : (
                            <Image className="h-7 w-7 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 text-center leading-tight">
                          <p className="text-[12px] font-bold uppercase tracking-[0.02em]">{previewHeaderTitle}</p>
                          <p className="mt-1 text-[7px] text-slate-600">{previewAddressLine}</p>
                          <p className="mt-0.5 text-[7px] text-slate-600">{previewContactLine}</p>
                          <p className="mt-0.5 text-[7px] text-slate-600">{previewWebsiteLine}</p>
                        </div>
                      </div>

                      <div className="mt-1 h-[2px] bg-slate-700" />
                      <div className="mt-[2px] h-px bg-slate-500" />

                      <div className="pt-2 text-center">
                        <p className="text-[11px] font-bold uppercase">Judul Dokumen</p>
                        <p className="mt-0.5 text-[7px] text-slate-600">No. Dokumen: XXXXX/2026</p>
                      </div>

                      <div className="mt-3 space-y-1">
                        {previewDocumentLines.map((line) => (
                          <div key={line} className="h-[6px] border-b border-slate-200" />
                        ))}
                      </div>

                      <div className="mt-10 grid grid-cols-2 gap-8 text-[7px] text-slate-500">
                        <div className="text-center">
                          <p>Mengetahui,</p>
                          <div className="mx-auto mt-10 w-20 border-b border-slate-300" />
                          <p className="mt-1">NIP. ____________</p>
                        </div>
                        <div className="text-center">
                          <p>Penanggung Jawab,</p>
                          <div className="mx-auto mt-10 w-20 border-b border-slate-300" />
                          <p className="mt-1">NIP. ____________</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </MasterDataLegacySections>
      </MasterDataPageShell>
    </div>
  );
}

function AssetUploadCard({
  title,
  description,
  icon,
  imageUrl,
  emptyIcon,
  buttonLabel,
  loading,
  onClick,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  imageUrl: string;
  emptyIcon: ReactNode;
  buttonLabel: string;
  loading: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-border/80 p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="flex h-40 items-center justify-center overflow-hidden rounded-md border bg-muted/20">
        {imageUrl ? <img src={imageUrl} alt={title} className="max-h-full max-w-full object-contain" /> : emptyIcon}
      </div>

      <div className="space-y-2">
        <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={loading} className="rounded-none shadow-none">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {loading ? "Uploading..." : buttonLabel}
        </Button>
        {children}
      </div>
    </div>
  );
}
