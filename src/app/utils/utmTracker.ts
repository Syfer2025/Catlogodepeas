// ═══════════════════════════════════════════════════════════════════════════
// UTM Parameter Tracker — captures marketing attribution data from URLs
// and persists it in localStorage for the session lifetime.
//
// Captures: utm_source, utm_medium, utm_campaign, utm_content, utm_term,
//           gclid (Google Ads click ID), fbclid (Facebook click ID)
//
// Usage:
//   import { captureUtmParams, getUtmData } from "../utils/utmTracker";
//   captureUtmParams(); // Call once on app load
//   const utm = getUtmData(); // Get stored UTM data anywhere
// ═══════════════════════════════════════════════════════════════════════════

var UTM_STORAGE_KEY = "carretao_utm_data";
var UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];

export interface UtmData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  landing_page?: string;
  captured_at?: number;
}

/**
 * Captures UTM parameters from the current URL and stores them.
 * Only overwrites if new UTM params are present (preserves first-touch attribution).
 */
export function captureUtmParams(): void {
  if (typeof window === "undefined") return;

  try {
    var params = new URLSearchParams(window.location.search);
    var hasUtm = false;
    var data: UtmData = {};

    for (var i = 0; i < UTM_PARAMS.length; i++) {
      var key = UTM_PARAMS[i];
      var val = params.get(key);
      if (val) {
        (data as any)[key] = val.substring(0, 500); // Limit length
        hasUtm = true;
      }
    }

    if (hasUtm) {
      data.landing_page = window.location.pathname;
      data.captured_at = Date.now();

      // Last-touch attribution: always overwrite with latest UTM data
      localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(data));
    }
  } catch (_e) {
    // Silent — UTM tracking is non-critical
  }
}

/**
 * Returns stored UTM data, or null if none captured.
 */
export function getUtmData(): UtmData | null {
  if (typeof window === "undefined") return null;

  try {
    var raw = localStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UtmData;
  } catch (_e) {
    return null;
  }
}

/**
 * Returns UTM data as a flat object suitable for GA4/Pixel event params.
 */
export function getUtmEventParams(): Record<string, string> {
  var data = getUtmData();
  if (!data) return {};

  var result: Record<string, string> = {};
  if (data.utm_source) result.traffic_source = data.utm_source;
  if (data.utm_medium) result.traffic_medium = data.utm_medium;
  if (data.utm_campaign) result.traffic_campaign = data.utm_campaign;
  if (data.utm_content) result.traffic_content = data.utm_content;
  if (data.utm_term) result.traffic_term = data.utm_term;
  if (data.gclid) result.gclid = data.gclid;
  if (data.fbclid) result.fbclid = data.fbclid;
  return result;
}

/**
 * Clears stored UTM data (e.g., after order completion).
 */
export function clearUtmData(): void {
  try {
    localStorage.removeItem(UTM_STORAGE_KEY);
  } catch (_e) { /* silent */ }
}

// Auto-capture on module load (runs once when imported)
captureUtmParams();
