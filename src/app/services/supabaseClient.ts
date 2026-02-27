import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "/utils/supabase/info";

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
 */
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

    // Token expired or about to expire — refresh
    var refreshResult = await supabase.auth.refreshSession();
    var fresh = refreshResult.data?.session;
    if (fresh?.access_token) return fresh.access_token;

    // Refresh failed — return null instead of expired token
    return null;
  } catch {
    return null;
  }
}