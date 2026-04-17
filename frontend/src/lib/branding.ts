const BRANDING_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
const BRANDING_API_ORIGIN = BRANDING_API_URL.replace(/\/api$/, '');

export const DEFAULT_APP_NAME = 'SIMKLINIK';
export const DEFAULT_APP_SUBTITLE = 'Sistem Informasi Klinik';
export const DEFAULT_FAVICON_PATH = '/simklinik-favicon.svg';

type PublicSettingsResponse = {
  data?: Record<string, string>;
};

export function getStoredAppName() {
  return localStorage.getItem('appName') || DEFAULT_APP_NAME;
}

export function getStoredAppSubtitle() {
  return localStorage.getItem('appSubtitle') || DEFAULT_APP_SUBTITLE;
}

export function getStoredAppLogo() {
  return localStorage.getItem('appLogo') || '';
}

export function getStoredAppFavicon() {
  return localStorage.getItem('appFavicon') || '';
}

export function resolveBrandingAssetUrl(path?: string | null) {
  if (!path) {
    return '';
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${BRANDING_API_ORIGIN}${path}`;
}

export function updateDocumentTitle(pageTitle?: string, explicitAppName?: string) {
  const appName = explicitAppName || getStoredAppName();
  document.title = pageTitle ? `${pageTitle} - ${appName}` : appName;
}

export function updateDocumentFavicon(faviconPath?: string | null) {
  const faviconHref = resolveBrandingAssetUrl(faviconPath || getStoredAppFavicon()) || DEFAULT_FAVICON_PATH;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  link.href = faviconHref;
}

export function applyStoredBranding() {
  updateDocumentTitle(undefined, getStoredAppName());
  updateDocumentFavicon(getStoredAppFavicon());
}

export async function hydratePublicBranding() {
  applyStoredBranding();

  try {
    const response = await fetch(`${BRANDING_API_URL}/settings`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as PublicSettingsResponse;
    const settings = payload.data || {};
    const nextAppName = settings.app_name || DEFAULT_APP_NAME;
    const nextAppSubtitle = settings.app_subtitle || DEFAULT_APP_SUBTITLE;
    const nextAppLogo = settings.app_logo || settings.app_print_logo || '';
    const nextAppFavicon = settings.app_favicon || '';

    localStorage.setItem('appName', nextAppName);
    localStorage.setItem('appSubtitle', nextAppSubtitle);
    if (nextAppLogo) {
      localStorage.setItem('appLogo', nextAppLogo);
    }
    if (nextAppFavicon) {
      localStorage.setItem('appFavicon', nextAppFavicon);
    }

    updateDocumentTitle(undefined, nextAppName);
    updateDocumentFavicon(nextAppFavicon);
  } catch {
    // Keep previously stored branding when public settings are temporarily unavailable.
  }
}