export const TTE_BADGE_REFRESH_EVENT = 'simklinik:tte-badge-refresh';

export function notifyTTEBadgeRefresh() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(TTE_BADGE_REFRESH_EVENT));
}