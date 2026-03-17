/**
 * SUPABASE CLIENT — Singleton do cliente Supabase para o frontend.
 * Configurado com PKCE flow, auto-refresh, e persistSession.
 * Usado para: login/logout de clientes, sessao, e listener de auth.
 * NAO e usado para chamadas API normais (essas passam pela api.ts → Edge Function).
 * getValidAccessToken(): retorna token valido, renovando se expirado (com dedup).
 */
import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

const supabaseUrl = "https://" + projectId + ".supabase.co";

export const supabase = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    detectSessionInUrl: true,
    flowType: "pkce",
    autoRefreshToken: true,
    persistSession: true,
  },
});

/**
 * Returns a valid access token, refreshing the session if the cached token is
 * expired or about to expire (within 60 s).  Returns `null` when no session
 * exists at all (user not logged in / refresh token also expired).
 *
 * DEDUP: If a refresh is already in progress, concurrent callers piggyback on
 * the same promise instead of firing duplicate refreshSession() calls (which
 * would fail because Supabase refresh tokens are single-use).
 */
var _refreshInflight: Promise<string | null> | null = null;

export async function getValidAccessToken(): Promise<string | null> {
  try {
    var result = await supabase.auth.getSession();
    var session = result.data?.session;
    if (!session) return null;

    // Check expiry — session.expires_at is Unix epoch in seconds
    var expiresAt = session.expires_at || 0;
    var nowSec = Math.floor(Date.now() / 1000);
    if (expiresAt - nowSec > 60) {
      // Token still valid for > 60 s — use it
      return session.access_token;
    }

    // Token expired or about to expire — refresh (with dedup)
    if (_refreshInflight) return _refreshInflight;

    _refreshInflight = supabase.auth.refreshSession().then(function (refreshResult) {
      _refreshInflight = null;
      var fresh = refreshResult.data?.session;
      if (fresh?.access_token) return fresh.access_token;
      return null;
    }).catch(function () {
      _refreshInflight = null;
      return null;
    });

    return _refreshInflight;
  } catch {
    return null;
  }
}