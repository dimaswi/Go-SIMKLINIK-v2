import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  Eye,
  FileImage,
  Globe,
  Image,
  Loader2,
  Mail,
  MapPin,
  Phone,
  PlugZap,
  Save,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export default function SettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
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
    } catch {
      toast({ variant: "destructive", title: "Upload gagal", description: "Logo aplikasi belum berhasil diunggah." });
    } finally {
      setUploadingLogo(false);
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
    } catch {
      toast({ variant: "destructive", title: "Upload gagal", description: "Favicon belum berhasil diunggah." });
    } finally {
      setUploadingFavicon(false);
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
    } catch {
      toast({ variant: "destructive", title: "Upload gagal", description: "Logo cetak belum berhasil diunggah." });
    } finally {
      setUploadingPrintLogo(false);
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MasterDataPageShell
        title="Settings"
        subtitle="Pusat konfigurasi aplikasi, branding, dokumen cetak, dan pengaturan integrasi eksternal."
        meta={<><span>{appSummary.title}</span><span>{previewHeaderTitle}</span></>}
        onBack={() => navigate(-1)}
        actions={
          <Button asChild variant="outline" className="rounded-none shadow-none">
            <Link to="/settings/integrations">
              Buka Integrasi
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
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
              <MasterDataAsideSection title="Akses Cepat" helper="Lanjutkan ke halaman integrasi saat perlu menghubungkan SIMKLINIK dengan sistem eksternal.">
                <Button asChild variant="outline" className="w-full rounded-none shadow-none">
                  <Link to="/settings/integrations">Kelola Integrasi</Link>
                </Button>
              </MasterDataAsideSection>
            </div>
          </MasterDataAsideStack>
        }
      >
        <MasterDataLegacySections>
          <div className="space-y-6">
            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight">Application</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Atur identitas utama aplikasi yang dipakai di sidebar, judul halaman, dan area login.</p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="appName" className="flex items-center gap-2 text-xs font-medium">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Application Name
                  </Label>
                  <Input id="appName" value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="SIMKLINIK" className="h-10 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appSubtitle" className="flex items-center gap-2 text-xs font-medium">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Application Subtitle
                  </Label>
                  <Input id="appSubtitle" value={appSubtitle} onChange={(event) => setAppSubtitle(event.target.value)} placeholder="Sistem Informasi Manajemen Klinik" className="h-10 text-sm" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveAppSettings} disabled={loading} className="rounded-none shadow-none">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Simpan Application
                </Button>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight">Branding Assets</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Upload logo, favicon, dan logo khusus dokumen cetak. Seluruh aset disimpan di server dan dipakai lintas halaman.</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
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
                  <p className="text-xs text-muted-foreground">PNG, JPG, atau SVG. Disarankan latar transparan.</p>
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
                  <p className="text-xs text-muted-foreground">ICO, PNG, atau JPG. 32x32 atau 64x64 direkomendasikan.</p>
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
                  <p className="text-xs text-muted-foreground">Gunakan PNG atau JPG agar render PDF backend tetap stabil.</p>
                </AssetUploadCard>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight">Integrations</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Ruang konfigurasi integrasi sistem eksternal. SATUSEHAT sudah tersedia, dan provider berikutnya bisa ditambahkan tanpa mengubah struktur halaman.</p>
              </div>

              <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <PlugZap className="h-4 w-4 text-muted-foreground" />
                    SATUSEHAT dan katalog integrasi
                  </div>
                  <p className="text-sm text-muted-foreground">Endpoint autentikasi, base URL FHIR, organization ID, client ID, dan client secret dikelola terpisah di halaman integrasi.</p>
                </div>
                <Button asChild variant="outline" className="rounded-none shadow-none">
                  <Link to="/settings/integrations">
                    Buka Halaman Integrasi
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border/80 p-5">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight">Print Header / KOP</h2>
                <p className="text-[11px] leading-5 text-muted-foreground">Konfigurasi identitas fasilitas yang dipakai oleh dokumen PDF backend. Preview di bawah meniru struktur kertas cetak agar hasil lebih mudah divalidasi.</p>
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="hospitalName" className="flex items-center gap-2 text-xs font-medium"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />Nama Klinik / RS</Label>
                    <Input id="hospitalName" value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} placeholder="Klinik Utama Sehat" className="h-10 text-sm" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hospitalAddress" className="flex items-center gap-2 text-xs font-medium"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />Alamat</Label>
                    <Textarea id="hospitalAddress" value={hospitalAddress} onChange={(event) => setHospitalAddress(event.target.value)} placeholder="Jl. Contoh No. 1, Kelurahan, Kecamatan" rows={3} />
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="hospitalCity" className="flex items-center gap-2 text-xs font-medium"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />Kota / Kabupaten</Label>
                      <Input id="hospitalCity" value={hospitalCity} onChange={(event) => setHospitalCity(event.target.value)} placeholder="Bojonegoro" className="h-10 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hospitalPhone" className="flex items-center gap-2 text-xs font-medium"><Phone className="h-3.5 w-3.5 text-muted-foreground" />Telepon</Label>
                      <Input id="hospitalPhone" value={hospitalPhone} onChange={(event) => setHospitalPhone(event.target.value)} placeholder="(0353) 123456" className="h-10 text-sm" />
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="hospitalFax" className="flex items-center gap-2 text-xs font-medium"><Phone className="h-3.5 w-3.5 text-muted-foreground" />Fax</Label>
                      <Input id="hospitalFax" value={hospitalFax} onChange={(event) => setHospitalFax(event.target.value)} placeholder="(0353) 123457" className="h-10 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hospitalEmail" className="flex items-center gap-2 text-xs font-medium"><Mail className="h-3.5 w-3.5 text-muted-foreground" />Email</Label>
                      <Input id="hospitalEmail" value={hospitalEmail} onChange={(event) => setHospitalEmail(event.target.value)} placeholder="info@klinik.co.id" className="h-10 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hospitalWebsite" className="flex items-center gap-2 text-xs font-medium"><Globe className="h-3.5 w-3.5 text-muted-foreground" />Website</Label>
                      <Input id="hospitalWebsite" value={hospitalWebsite} onChange={(event) => setHospitalWebsite(event.target.value)} placeholder="www.klinik.co.id" className="h-10 text-sm" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSaveHospitalSettings} disabled={savingHospitalSettings} className="rounded-none shadow-none">
                      {savingHospitalSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Simpan KOP
                    </Button>
                    <Button variant="outline" onClick={openPrintHeaderPreview} disabled={previewingHospitalPdf} className="rounded-none shadow-none">
                      {previewingHospitalPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
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
