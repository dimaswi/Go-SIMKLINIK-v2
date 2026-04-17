import { DEFAULT_APP_NAME, DEFAULT_APP_SUBTITLE, getStoredAppName, getStoredAppSubtitle, updateDocumentTitle } from '@/lib/branding';

export const setPageTitle = (pageTitle: string) => {
  updateDocumentTitle(pageTitle, getStoredAppName());
};

export const getAppName = () => {
  return getStoredAppName() || DEFAULT_APP_NAME;
};

export const getAppSubtitle = () => {
  return getStoredAppSubtitle() || DEFAULT_APP_SUBTITLE;
};
