/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ADMIN AUTH — Helpers de autenticacao do painel administrativo
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ISOLAMENTO DE SESSAO:
 * A sessao admin e armazenada em chaves localStorage SEPARADAS
 * (carretao_admin_at, carretao_admin_rt, etc.) para NUNCA contaminar
 * a sessao do cliente. Um Supabase client DEDICADO (non-persisting)
 * e usado para refresh de token — nao dispara onAuthStateChange nem
 * escreve em localStorage do client padrao.
 *
 * FUNCOES EXPORTADAS:
 * - getAdminToken(): retorna access token ou null
 * - saveAdminSession(): salva AT, RT, expiry, email, nome
 * - clearAdminStorage(): limpa tudo (logout)
 * - refreshAdminToken(): renova token via RT (com dedup)
 * - getValidAdminToken(): retorna token valido, renovando se necessario
 * - clearSupabaseLocalSession(): limpa sessao Supabase do localStorage
 *
 * DEDUP DE REFRESH:
 * Se multiplas chamadas pedem refresh simultaneamente, apenas 1 executa
 * (refresh tokens sao single-use). As demais piggyback na mesma Promise.
 *
 * AUTO-REFRESH:
 * getValidAdminToken() verifica expiracao e renova automaticamente
 * se faltam menos de 60 segundos para expirar.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";

var ADMIN_AT_KEY  = "carretao_admin_at";
var ADMIN_RT_KEY  = "carretao_admin_rt";
var ADMIN_EXP_KEY = "carretao_admin_exp";
export var ADMIN_EMAIL_KEY = "carretao_admin_email";
export var ADMIN_NAME_KEY  = "carretao_admin_name";

// ─── Dedicated Supabase client for admin auth operations ───
// This client does NOT persist sessions and does NOT auto-refresh,
// so it never writes to localStorage or fires onAuthStateChange on
// the customer-facing shared Supabase client.
var _adminSupabaseUrl = "https://" + projectId + ".supabase.co";
var _adminSupabase = createClient(_adminSupabaseUrl, publicAnonKey, {
  auth: {
    detectSessionInUrl: false,
    autoRefreshToken: false,
    persistSession: false,  // ← key: never touches localStorage
    storageKey: "sb-" + projectId + "-admin-token", // ← unique key: avoids "Multiple GoTrueClient instances" warning
  },
});

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
 * Uses the DEDICATED admin Supabase client (non-persisting) so it
 * NEVER writes to localStorage or fires onAuthStateChange events
 * that would corrupt customer-side sessions in other tabs.
 *
 * DEDUP: If a refresh is already in flight, concurrent callers
 * piggyback on the same promise (refresh tokens are single-use).
 */
var _adminRefreshInflight: Promise<string | null> | null = null;

export async function refreshAdminToken(): Promise<string | null> {
  // Dedup — if already refreshing, piggyback
  if (_adminRefreshInflight) return _adminRefreshInflight;

  _adminRefreshInflight = _doRefreshAdminToken();
  return _adminRefreshInflight;
}

async function _doRefreshAdminToken(): Promise<string | null> {
  try {
    var rt = localStorage.getItem(ADMIN_RT_KEY);
    if (!rt) { _adminRefreshInflight = null; return null; }
    var at = localStorage.getItem(ADMIN_AT_KEY);
    if (!at) { _adminRefreshInflight = null; return null; }

    // Use dedicated client — never touches the shared client's session
    var setResult = await _adminSupabase.auth.setSession({
      access_token: at,
      refresh_token: rt,
    });
    if (setResult.error) {
      console.warn("[AdminTokenRefresh] setSession failed:", setResult.error.message);
      _adminRefreshInflight = null;
      return null;
    }

    var refreshResult = await _adminSupabase.auth.refreshSession();
    var fresh = refreshResult.data?.session;
    if (fresh?.access_token) {
      localStorage.setItem(ADMIN_AT_KEY, fresh.access_token);
      localStorage.setItem(ADMIN_RT_KEY, fresh.refresh_token || rt);
      localStorage.setItem(ADMIN_EXP_KEY, String(fresh.expires_at || 0));
      // No need to call _clearSupabaseLocalSession — the dedicated client
      // never wrote anything to localStorage in the first place.
      // Token refreshed successfully
      _adminRefreshInflight = null;
      return fresh.access_token;
    }

    _adminRefreshInflight = null;
    return null;
  } catch (e) {
    console.warn("[AdminTokenRefresh] Error:", e);
    _adminRefreshInflight = null;
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
    // Token expired/expiring — refreshing
    var refreshed = await refreshAdminToken();
    return refreshed;
  }

  return token;
}