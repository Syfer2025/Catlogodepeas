/**
 * Centralised admin-token helpers.
 *
 * The admin session is stored **exclusively** in admin-specific localStorage
 * keys so it NEVER leaks into the Supabase client session used by the
 * customer-facing side of the site.
 */

import { supabase } from "../../services/supabaseClient";
import { projectId } from "/utils/supabase/info";

var ADMIN_AT_KEY  = "carretao_admin_at";
var ADMIN_RT_KEY  = "carretao_admin_rt";
var ADMIN_EXP_KEY = "carretao_admin_exp";
export var ADMIN_EMAIL_KEY = "carretao_admin_email";
export var ADMIN_NAME_KEY  = "carretao_admin_name";

/* ------------------------------------------------------------------ */
/*  Safely clear Supabase client session WITHOUT revoking the JWT     */
/* ------------------------------------------------------------------ */

/**
 * Removes the Supabase session from the client's localStorage so the
 * admin JWT doesn't leak to the customer-facing side. Crucially, this
 * does NOT call `supabase.auth.signOut()` — some Supabase JS versions
 * revoke the JWT server-side even with `{ scope: "local" }`, which
 * would immediately invalidate the token we just saved.
 */
function _clearSupabaseLocalSession(): void {
  try {
    // Supabase JS v2 stores the session under this key
    var storageKey = "sb-" + projectId + "-auth-token";
    localStorage.removeItem(storageKey);
  } catch {}
}

/** Exported version for use in AdminLoginPage */
export var clearSupabaseLocalSession = _clearSupabaseLocalSession;

/* ------------------------------------------------------------------ */
/*  Read / write helpers                                               */
/* ------------------------------------------------------------------ */

/** Return the current admin access-token, or `null` if not stored. */
export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_AT_KEY) || null;
  } catch {
    return null;
  }
}

/** Persist the full admin credential set coming from a Supabase session. */
export function saveAdminSession(
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  email: string,
  name: string
): void {
  try {
    localStorage.setItem(ADMIN_AT_KEY, accessToken);
    localStorage.setItem(ADMIN_RT_KEY, refreshToken);
    localStorage.setItem(ADMIN_EXP_KEY, String(expiresAt));
    localStorage.setItem(ADMIN_EMAIL_KEY, email);
    localStorage.setItem(ADMIN_NAME_KEY, name);
  } catch {}
}

/** Remove every admin-specific localStorage key. */
export function clearAdminStorage(): void {
  try {
    localStorage.removeItem(ADMIN_AT_KEY);
    localStorage.removeItem(ADMIN_RT_KEY);
    localStorage.removeItem(ADMIN_EXP_KEY);
    localStorage.removeItem(ADMIN_EMAIL_KEY);
    localStorage.removeItem(ADMIN_NAME_KEY);
    _clearSupabaseLocalSession();
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Token refresh                                                      */
/* ------------------------------------------------------------------ */

/**
 * Refresh the admin token using the stored refresh_token.
 * We temporarily `setSession` on the Supabase client, grab a fresh
 * token pair, persist them, then **locally** sign out so the
 * customer side never sees the session.
 */
export async function refreshAdminToken(): Promise<string | null> {
  try {
    var rt = localStorage.getItem(ADMIN_RT_KEY);
    if (!rt) return null;
    var at = localStorage.getItem(ADMIN_AT_KEY);
    if (!at) return null;

    var setResult = await supabase.auth.setSession({
      access_token: at,
      refresh_token: rt,
    });
    if (setResult.error) {
      console.warn("[AdminTokenRefresh] setSession failed:", setResult.error.message);
      return null;
    }

    var refreshResult = await supabase.auth.refreshSession();
    var fresh = refreshResult.data?.session;
    if (fresh?.access_token) {
      localStorage.setItem(ADMIN_AT_KEY, fresh.access_token);
      localStorage.setItem(ADMIN_RT_KEY, fresh.refresh_token || rt);
      localStorage.setItem(ADMIN_EXP_KEY, String(fresh.expires_at || 0));
      // Clear the Supabase client session from localStorage so it doesn't
      // leak to the customer side — WITHOUT calling signOut (which may revoke the JWT)
      _clearSupabaseLocalSession();
      console.log("[AdminTokenRefresh] Token refreshed successfully.");
      return fresh.access_token;
    }

    _clearSupabaseLocalSession();
    return null;
  } catch (e) {
    console.warn("[AdminTokenRefresh] Error:", e);
    _clearSupabaseLocalSession();
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  High-level "get a valid token" (with auto-refresh)                 */
/* ------------------------------------------------------------------ */

/**
 * Returns a valid admin access-token, refreshing transparently if the
 * stored one is expired or about to expire (< 60 s remaining).
 * Returns `null` when no admin session exists.
 */
export async function getValidAdminToken(): Promise<string | null> {
  var token = getAdminToken();
  if (!token) return null;

  var expStr = "";
  try {
    expStr = localStorage.getItem(ADMIN_EXP_KEY) || "";
  } catch {}
  var expiresAt = parseInt(expStr, 10) || 0;
  var nowSec = Math.floor(Date.now() / 1000);

  if (expiresAt > 0 && expiresAt - nowSec < 60) {
    console.log("[adminAuth] Token expired/expiring, refreshing…");
    var refreshed = await refreshAdminToken();
    return refreshed;
  }

  return token;
}