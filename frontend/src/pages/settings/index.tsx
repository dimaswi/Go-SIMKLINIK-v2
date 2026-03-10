import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, Save, Loader2, Upload, Image, FileImage } from "lucide-react";
import { settingsApi } from "@/lib/api";

// Get base URL without /api suffix
const getBaseUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
  return apiUrl.replace(/\/api$/, '');
};
const BASE_URL = getBaseUrl();

export default function SettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [appName, setAppName] = useState("StarterKits");
  const [appSubtitle, setAppSubtitle] = useState("Hospital System");
  const [appLogo, setAppLogo] = useState("");
  const [appFavicon, setAppFavicon] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [fetching, setFetching] = useState(true);
  
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Set page title
  useEffect(() => {
    const savedAppName = localStorage.getItem("appName") || "StarterKits";
    document.title = `Settings - ${savedAppName}`;
  }, []);

  // Load settings from API and localStorage on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load from API
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
        // Update favicon in document
        updateFavicon(settings.app_favicon);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setFetching(false);
    }
  };

  const updateFavicon = (faviconUrl: string) => {
    const fullUrl = faviconUrl.startsWith('http') ? faviconUrl : `${BASE_URL}${faviconUrl}`;
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = fullUrl;
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const response = await settingsApi.uploadLogo(file, 'logo');
      const url = response.data.url;
      setAppLogo(url);
      localStorage.setItem("appLogo", url);
      window.dispatchEvent(new Event("storage"));
      
      toast({
        variant: "success",
        title: "Success!",
        description: "Logo uploaded successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Failed to upload logo.",
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleUploadFavicon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFavicon(true);
    try {
      const response = await settingsApi.uploadLogo(file, 'favicon');
      const url = response.data.url;
      setAppFavicon(url);
      localStorage.setItem("appFavicon", url);
      updateFavicon(url);
      
      toast({
        variant: "success",
        title: "Success!",
        description: "Favicon uploaded successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Failed to upload favicon.",
      });
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleSaveAppSettings = async () => {
    setLoading(true);
    try {
      // Save to API
      await settingsApi.update({
        app_name: appName,
        app_subtitle: appSubtitle,
      });

      // Save to localStorage
      localStorage.setItem("appName", appName);
      localStorage.setItem("appSubtitle", appSubtitle);

      // Trigger storage event to update sidebar immediately
      window.dispatchEvent(new Event("storage"));

      toast({
        variant: "success",
        title: "Success!",
        description: "Application settings saved successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Failed to save settings. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 max-w-full">
      <div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-9 w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4 max-w-full">
        {fetching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Application Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Application
                </CardTitle>
                <CardDescription>
                  Customize application name and branding
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="appName"
                      className="text-xs font-medium flex items-center gap-2"
                    >
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      Application Name
                    </Label>
                    <Input
                      id="appName"
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      placeholder="StarterKits"
                      className="max-w-md"
                    />
                    <p className="text-xs text-muted-foreground">
                      This name will appear in the sidebar and page titles
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="appSubtitle"
                      className="text-xs font-medium flex items-center gap-2"
                    >
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      Application Subtitle
                    </Label>
                    <Input
                      id="appSubtitle"
                      value={appSubtitle}
                      onChange={(e) => setAppSubtitle(e.target.value)}
                      placeholder="Hospital System"
                      className="max-w-md"
                    />
                    <p className="text-xs text-muted-foreground">
                      Subtitle text shown below the application name
                    </p>
                  </div>

                  <Button
                    onClick={handleSaveAppSettings}
                    className="mt-2"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Branding Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Branding
                </CardTitle>
                <CardDescription>
                  Upload application logo and favicon
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Logo Upload */}
                  <div className="space-y-3">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <Image className="h-3.5 w-3.5 text-muted-foreground" />
                      Application Logo
                    </Label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 border rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
                        {appLogo ? (
                          <img 
                            src={`${BASE_URL}${appLogo}`} 
                            alt="Logo" 
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Image className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={handleUploadLogo}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={uploadingLogo}
                        >
                          {uploadingLogo ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Logo
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          PNG, JPG, or SVG. Max 2MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Favicon Upload */}
                  <div className="space-y-3">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <FileImage className="h-3.5 w-3.5 text-muted-foreground" />
                      Favicon
                    </Label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 border rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
                        {appFavicon ? (
                          <img 
                            src={`${BASE_URL}${appFavicon}`} 
                            alt="Favicon" 
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <FileImage className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input
                          ref={faviconInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/x-icon,image/ico"
                          onChange={handleUploadFavicon}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => faviconInputRef.current?.click()}
                          disabled={uploadingFavicon}
                        >
                          {uploadingFavicon ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Favicon
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          ICO, PNG, or JPG. 32x32 or 64x64 recommended.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
