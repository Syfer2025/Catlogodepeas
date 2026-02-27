import { projectId, publicAnonKey } from "/utils/supabase/info";
import type { Product, Category } from "../data/products";

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-b7b07654`;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${publicAnonKey}`,
};

// Helper: build URL with user token as query param _ut.
// Keeps anon key in Authorization for Gateway auth; passes user JWT via _ut.
function _authUrl(path: string, accessToken: string): string {
  var sep = path.includes("?") ? "&" : "?";
  return BASE_URL + path + sep + "_ut=" + encodeURIComponent(accessToken);
}

const MAX_RETRIES = 3; // 4 total attempts — handles edge function cold starts (up to ~10s)
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 45000; // 45s timeout — edge function cold start + SIGE API latency

// ═══════════════════════════════════════════════════════════
// Global concurrency limiter — prevents overwhelming the
// edge function / browser connection pool with too many
// simultaneous requests. Browsers allow ~6 connections per
// origin with HTTP/1.1; Supabase uses HTTP/2 which supports
// multiplexing, so we can safely use 8 concurrent requests.
// ═══════════════════════════════════════════════════════════
const MAX_GLOBAL_CONCURRENT = 8;
let _globalActive = 0;
const _globalQueue: Array<() => void> = [];

function _acquireSlot(): Promise<void> {
  if (_globalActive < MAX_GLOBAL_CONCURRENT) {
    _globalActive++;
    return Promise.resolve();
  }
  return new Promise<void>(function (resolve) {
    _globalQueue.push(resolve);
  });
}

/** Acquire a semaphore slot — supports an external AbortSignal so callers
 *  waiting in the queue can be ejected immediately on component unmount. */
function _acquireSlotWithSignal(signal?: AbortSignal | null): Promise<void> {
  if (!signal) return _acquireSlot();
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  if (_globalActive < MAX_GLOBAL_CONCURRENT) {
    _globalActive++;
    return Promise.resolve();
  }
  return new Promise<void>(function (resolve, reject) {
    var settled = false;
    var entry = function () { if (!settled) { settled = true; resolve(); } };
    _globalQueue.push(entry);
    var onAbort = function () {
      if (settled) return;
      settled = true;
      var idx = _globalQueue.indexOf(entry);
      if (idx !== -1) _globalQueue.splice(idx, 1);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function _releaseSlot(): void {
  if (_globalQueue.length > 0) {
    var next = _globalQueue.shift();
    if (next) next(); // hand slot to next waiting request
  } else {
    _globalActive--;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  var callerSignal = options ? (options.signal as AbortSignal | undefined) : undefined;
  await _acquireSlotWithSignal(callerSignal);
  try {
    return await _requestInner<T>(path, options);
  } finally {
    _releaseSlot();
  }
}

/** Priority request that bypasses the global concurrency semaphore.
 *  Use for critical auth calls that must never be blocked by bulk product fetches. */
async function requestPriority<T>(path: string, options?: RequestInit): Promise<T> {
  return _requestInner<T>(path, options);
}

async function _requestInner<T>(path: string, options?: RequestInit): Promise<T> {
  var callerSignal = options ? (options.signal as AbortSignal | undefined) : undefined;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // If the caller already aborted (e.g. component unmounted), bail immediately
    if (callerSignal && callerSignal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // Bridge: if caller's signal fires, abort our internal controller too
    var _onCallerAbort: (() => void) | null = null;
    if (callerSignal) {
      _onCallerAbort = function () { controller.abort(); };
      callerSignal.addEventListener("abort", _onCallerAbort, { once: true });
    }
    try {
      // Merge default + custom headers.
      // X-User-Token must NOT go as a header (causes CORS preflight the Gateway rejects)
      // and must NOT replace Authorization (Gateway needs the anon key there, rejects user JWTs with 401).
      // Solution: pass user token via query parameter _ut, which avoids both problems.
      const _merged: Record<string, string> = { ...headers, ...((options?.headers || {}) as Record<string, string>) };
      let _finalPath = path;
      if (_merged["X-User-Token"]) {
        var _ut = _merged["X-User-Token"];
        delete _merged["X-User-Token"];
        _finalPath = _finalPath + (_finalPath.includes("?") ? "&" : "?") + "_ut=" + encodeURIComponent(_ut);
      }
      const res = await fetch(BASE_URL + _finalPath, {
        ...options,
        headers: _merged,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (_onCallerAbort && callerSignal) callerSignal.removeEventListener("abort", _onCallerAbort);
      if (!res.ok) {
        // Retry on transient server errors
        if (RETRY_STATUS.has(res.status) && attempt < MAX_RETRIES) {
          const delay = 800 * Math.pow(2, attempt) + Math.random() * 400;
          console.warn("[API] " + res.status + " on " + path + ", retry " + (attempt + 1) + "/" + MAX_RETRIES);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        const errorBody = await res.json().catch(() => ({}));
        const msg = errorBody?.error || "HTTP " + res.status + " on " + path;
        console.error("API Error [" + path + "]:", msg);
        throw new Error(msg);
      }
      return res.json();
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (_onCallerAbort && callerSignal) callerSignal.removeEventListener("abort", _onCallerAbort);
      // If aborted by caller (component unmount), throw silently — never retry
      if (callerSignal && callerSignal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      lastError = e;
      // Retry on network errors (fetch failures) and abort (timeout)
      const isTimeout = e.name === "AbortError";
      const isNetwork = isTimeout
        || (e instanceof TypeError && /failed to fetch|network/i.test(e.message));
      if (isNetwork && attempt < MAX_RETRIES) {
        // Progressive backoff: start fast (cold start may resolve quickly), ramp up
        // attempt 0 → ~1s, attempt 1 → ~2s, attempt 2 → ~4s  (total ~7s coverage)
        const baseDelay = isTimeout ? 800 : 1000;
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 400;
        var reason = isTimeout ? "Timeout (" + (REQUEST_TIMEOUT_MS / 1000) + "s)" : "Network error";
        console.warn("[API] " + reason + " on " + path + ", retry " + (attempt + 1) + "/" + MAX_RETRIES + " (backoff " + Math.round(delay) + "ms)");
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastError || new Error("Request failed after retries on " + path);
}

// ─── Seed ───
export const seedData = () => request<{ seeded: boolean }>("/seed", { method: "POST" });

// ─── Auth (Brute-Force Protection) ───

/** Pre-login check — validates rate limit + honeypot + email lockout before signIn */
export const preLoginCheck = (email: string, honeypot?: string) =>
  requestPriority<{ ok?: boolean; error?: string; locked?: boolean; retryAfterMs?: number }>("/auth/pre-login-check", {
    method: "POST",
    body: JSON.stringify({ email, website: honeypot || "" }),
  });

/** Report login result — tracks failures for brute-force protection.
 *  On success, accessToken MUST be provided so the backend can verify
 *  the caller actually authenticated (prevents lockout-clear abuse). */
export const reportLoginResult = (email: string, success: boolean, accessToken?: string) =>
  request<{ ok: boolean }>("/auth/login-result", {
    method: "POST",
    body: JSON.stringify({ email, success, accessToken: accessToken || "" }),
  });

// ─── Auth ───

/** Check if the current authenticated user has admin role.
 * Requires the user's access_token (not the anon key) to identify the user. */
export const checkAdmin = (accessToken: string) =>
  requestPriority<{ isAdmin: boolean; email?: string | null; noAdminsExist?: boolean; isMaster?: boolean; permissions?: string[] }>("/auth/check-admin", {
    headers: { "X-User-Token": accessToken },
  });

/** Bootstrap the first admin account. Only works when zero admins exist. */
export const bootstrapAdmin = (email: string, password: string) =>
  request<{ ok?: boolean; email?: string; error?: string }>("/auth/bootstrap-admin", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

/** Claim admin via existing session token. Only works when zero admins exist. */
export const claimAdmin = (accessToken: string) =>
  request<{ ok?: boolean; email?: string; error?: string }>("/auth/claim-admin", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

/** Get full admin list with permissions (master only) */
export const getAdminList = (accessToken: string) =>
  request<{ admins: Array<{ email: string; isMaster: boolean; permissions: string[] }>; allTabs: string[] }>("/auth/admin-list", {
    headers: { "X-User-Token": accessToken },
  });

/** Add or remove admin from whitelist (master only) */
export const manageAdmin = (accessToken: string, action: "add" | "remove", email: string, permissions?: string[]) =>
  request<{ ok?: boolean; list?: string[]; permissions?: string[]; error?: string }>("/auth/admin-whitelist", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify({ action, email, permissions }),
  });

/** Update admin tab permissions (master only) */
export const updateAdminPermissions = (accessToken: string, email: string, permissions: string[]) =>
  request<{ ok?: boolean; error?: string }>("/auth/admin-permissions", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify({ email, permissions }),
  });

export const forgotPassword = (email: string, captchaToken?: string) =>
  request<{ sent: boolean; recoveryId?: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email, captchaToken }),
  });

export const recoveryStatus = (rid: string) =>
  request<{ status: string }>(
    "/auth/recovery-status",
    {
      method: "POST",
      body: JSON.stringify({ rid }),
    }
  );

export const resetPassword = (rid: string, newPassword: string) =>
  request<{ ok?: boolean; error?: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ rid, newPassword }),
  });

// ─── reCAPTCHA ───

export const getCaptchaSiteKey = () =>
  request<{ siteKey: string }>("/captcha/site-key");

export const verifyCaptcha = (token: string, action: string) =>
  request<{ ok: boolean; score: number }>("/captcha/verify", {
    method: "POST",
    body: JSON.stringify({ token, action }),
  });

// ─── User Auth ───

export const userSignup = (data: { email: string; password: string; name: string; phone?: string; cpf?: string; captchaToken?: string }) =>
  request<{ user: { id: string; email: string; name: string }; emailConfirmationRequired?: boolean }>("/auth/user/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });

// ─── userMe with dedup + sessionStorage cache ───
// Prevents duplicate concurrent calls from Header + MobileBottomNav
type UserMeResult = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  cpf: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  avatarId: string | null;
  customAvatarUrl: string | null;
  created_at: string;
};

var _userMeInflight: Promise<UserMeResult> | null = null;
var _userMeCacheKey = "carretao_userme_cache";
var _userMeCacheTTL = 60000; // 60s

function _getUserMeFromCache(): UserMeResult | null {
  try {
    var raw = sessionStorage.getItem(_userMeCacheKey);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (parsed && parsed._ts && Date.now() - parsed._ts < _userMeCacheTTL) {
      return parsed.data as UserMeResult;
    }
    sessionStorage.removeItem(_userMeCacheKey);
  } catch {}
  return null;
}

function _setUserMeCache(data: UserMeResult): void {
  try {
    sessionStorage.setItem(_userMeCacheKey, JSON.stringify({ data: data, _ts: Date.now() }));
  } catch {}
}

/** Invalidate userMe cache (call after profile/avatar updates) */
export function invalidateUserMeCache(): void {
  try { sessionStorage.removeItem(_userMeCacheKey); } catch {}
  _userMeInflight = null;
}

export const userMe = (accessToken: string): Promise<UserMeResult> => {
  // 1. Check sessionStorage cache first
  var cached = _getUserMeFromCache();
  if (cached) return Promise.resolve(cached);

  // 2. Deduplicate — if a call is already in flight, piggyback on it
  if (_userMeInflight) return _userMeInflight;

  // 3. Make the actual request (priority — bypasses semaphore so auth is never blocked by bulk fetches)
  _userMeInflight = requestPriority<UserMeResult>("/auth/user/me", {
    headers: { "X-User-Token": accessToken },
  }).then(function (result) {
    _setUserMeCache(result);
    _userMeInflight = null;
    return result;
  }).catch(function (err) {
    _userMeInflight = null;
    throw err;
  });

  return _userMeInflight;
};

export const userUpdateProfile = (
  accessToken: string,
  data: {
    name: string;
    phone: string;
    cpf: string;
    address: string;
    city: string;
    state: string;
    cep: string;
  }
) =>
  request<{ ok: boolean; profile: any }>("/auth/user/profile", {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const userChangePassword = (accessToken: string, currentPassword: string, newPassword: string) =>
  request<{ ok?: boolean; error?: string }>("/auth/user/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
    headers: { "X-User-Token": accessToken },
  });

export const userForgotPassword = (email: string, captchaToken?: string) =>
  request<{ sent: boolean; recoveryId?: string }>("/auth/user/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email, captchaToken }),
  });

// ─── User Avatar ───

export const userSetAvatar = (accessToken: string, avatarId: string) =>
  request<{ ok: boolean; avatarId: string; customAvatarUrl: null }>("/auth/user/avatar", {
    method: "PUT",
    body: JSON.stringify({ avatarId: avatarId }),
    headers: { "X-User-Token": accessToken },
  });

export const userUploadAvatar = async (file: File, accessToken: string): Promise<{ ok: boolean; customAvatarUrl: string; filename: string }> => {
  var formData = new FormData();
  formData.append("file", file);
  var res = await fetch(_authUrl("/auth/user/avatar/upload", accessToken), {
    method: "POST",
    headers: { Authorization: "Bearer " + publicAnonKey },
    body: formData,
  });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data?.error || "HTTP " + res.status);
  return data;
};

export const userDeleteCustomAvatar = (accessToken: string) =>
  request<{ ok: boolean; avatarId: string }>("/auth/user/avatar/custom", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── User Addresses ───

export interface UserAddress {
  id: string;
  label: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  isDefault: boolean;
}

export const getUserAddresses = (accessToken: string) =>
  request<{ addresses: UserAddress[] }>("/auth/user/addresses", {
    headers: { "X-User-Token": accessToken },
  });

export const addUserAddress = (
  accessToken: string,
  data: Omit<UserAddress, "id">
) =>
  request<{ ok: boolean; address: UserAddress; addresses: UserAddress[] }>("/auth/user/addresses", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const updateUserAddress = (
  accessToken: string,
  id: string,
  data: Partial<Omit<UserAddress, "id">>
) =>
  request<{ ok: boolean; address: UserAddress; addresses: UserAddress[] }>("/auth/user/addresses/" + encodeURIComponent(id), {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const deleteUserAddress = (accessToken: string, id: string) =>
  request<{ ok: boolean; addresses: UserAddress[] }>("/auth/user/addresses/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── User Favorites (Wishlist) ───

export interface UserFavorite {
  sku: string;
  titulo: string;
  addedAt: string;
}

export const getUserFavorites = (accessToken: string) =>
  request<{ favorites: UserFavorite[] }>("/auth/user/favorites", {
    headers: { "X-User-Token": accessToken },
  });

export const addUserFavorite = (accessToken: string, sku: string, titulo: string) =>
  request<{ ok: boolean; favorites: UserFavorite[] }>("/auth/user/favorites", {
    method: "POST",
    body: JSON.stringify({ sku: sku, titulo: titulo }),
    headers: { "X-User-Token": accessToken },
  });

export const removeUserFavorite = (accessToken: string, sku: string) =>
  request<{ ok: boolean; favorites: UserFavorite[] }>("/auth/user/favorites/" + encodeURIComponent(sku), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── Admin: Clients ───

export interface ClientProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  cpf: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  created_at: string;
  email_confirmed: boolean;
  last_sign_in: string | null;
}

export const getAdminClients = (accessToken: string) =>
  request<{ clients: ClientProfile[]; total: number }>("/auth/admin/clients", {
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE API ───
export const sigeSaveConfig = (accessToken: string, config: { baseUrl: string; email: string; password: string }) =>
  request<{ success: boolean }>("/sige/save-config", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(config),
  });

export const sigeGetConfig = (accessToken: string) =>
  request<{ baseUrl?: string; email?: string; hasPassword?: boolean; updatedAt?: string }>("/sige/config", {
    headers: { "X-User-Token": accessToken },
  });

export const sigeConnect = (accessToken: string) =>
  request<{ connected: boolean; hasToken: boolean; hasRefreshToken: boolean; expiresAt: string; responseKeys: string[] }>("/sige/connect", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

export const sigeRefreshToken = (accessToken: string) =>
  request<{ refreshed: boolean; hasToken: boolean; expiresAt: string }>("/sige/refresh-token", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

export const sigeGetStatus = (accessToken: string) =>
  request<{
    configured: boolean; baseUrl?: string; email?: string; hasPassword?: boolean;
    hasToken: boolean; hasRefreshToken?: boolean; expired: boolean;
    createdAt?: string; expiresAt?: string; expiresInMs?: number;
  }>("/sige/status", {
    headers: { "X-User-Token": accessToken },
  });

export const sigeDisconnect = (accessToken: string) =>
  request<{ disconnected: boolean }>("/sige/disconnect", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE: Usuarios ───
export const sigeUserRegister = (accessToken: string, data: { name: string; email: string; password: string; baseUrl?: string }) =>
  request<any>("/sige/user/register", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeUserCreate = (accessToken: string, data: { name: string; email: string; password: string }) =>
  request<any>("/sige/user/create", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeUserMe = (accessToken: string) =>
  request<any>("/sige/user/me", {
    headers: { "X-User-Token": accessToken },
  });

export const sigeUserResetPassword = (accessToken: string, id: string, data: { password: string; newPassword: string }) =>
  request<any>(`/sige/user/reset/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Dependencias (generic GET proxy) ───
export const sigeDep = (accessToken: string, endpoint: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<{ endpoint: string; sigeStatus: number; ok: boolean; data: any }>(`/sige/dep/${endpoint}${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── SIGE: Categorias ───
export const sigeCategoryGet = (accessToken: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/category${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCategoryCreate = (accessToken: string, data: { codCategoria: string; nomeCategoria: string; classe: string }) =>
  request<any>("/sige/category", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCategoryUpdate = (accessToken: string, id: string, data: { nomeCategoria: string; classe: string }) =>
  request<any>(`/sige/category/${id}`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCategoryDelete = (accessToken: string, id: string) =>
  request<any>(`/sige/category/${id}`, {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE: Clientes ───
export const sigeCustomerSearch = (accessToken: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/customer${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCustomerGetById = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/customer/${id}${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCustomerCreate = (accessToken: string, data: any) =>
  request<any>("/sige/customer", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCustomerUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Cliente Endereco ───
export const sigeCustomerAddressGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/customer/${id}/address${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCustomerAddressCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/address`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCustomerAddressUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/address`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Cliente Complemento ───
export const sigeCustomerComplementGet = (accessToken: string, id: string) =>
  request<any>(`/sige/customer/${id}/complement`, {
    headers: { "X-User-Token": accessToken },
  });

export const sigeCustomerComplementCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/complement`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCustomerComplementUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/complement`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Cliente Contato ───
export const sigeCustomerContactGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/customer/${id}/contact${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCustomerContactCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/contact`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCustomerContactUpdate = (accessToken: string, id: string, nome: string, data: any) =>
  request<any>(`/sige/customer/${id}/contact?nome=${encodeURIComponent(nome)}`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Produto ───
export const sigeProductGet = (accessToken: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeProductCreate = (accessToken: string, data: any) =>
  request<any>("/sige/product", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeProductUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Produto Saldo ───
export const sigeProductBalanceGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/balance${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── SIGE: Produto PCP ───
export const sigeProductPcpGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/product-control-plan${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── SIGE: Produto Promocao ───
export const sigeProductPromotionGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/promotion${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── SIGE: Produto Referencia ───
export const sigeProductReferenceGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/reference${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeProductReferenceCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}/reference`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeProductReferenceUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}/reference`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Produto Ficha Tecnica ───
export const sigeProductTechnicalSheetGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/technical-sheet${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeProductTechnicalSheetCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}/technical-sheet`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeProductTechnicalSheetUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}/technical-sheet`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Pedidos (Orders) ───
export const sigeOrderSearch = (accessToken: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/order${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeOrderGetById = (accessToken: string, id: string) =>
  request<any>(`/sige/order/${id}`, {
    headers: { "X-User-Token": accessToken },
  });

export const sigeOrderCreate = (accessToken: string, data: any) =>
  request<any>(`/sige/order`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Pedidos Observacao ───
export const sigeOrderObservationGet = (accessToken: string, id: string) =>
  request<any>(`/sige/order/${id}/observation`, {
    headers: { "X-User-Token": accessToken },
  });

export const sigeOrderObservationCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order/${id}/observation`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeOrderObservationUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order/${id}/observation`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Pedidos Parcelamento ───
export const sigeOrderInstallmentGet = (accessToken: string, id: string) =>
  request<any>(`/sige/order/${id}/installment`, {
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE: Pedidos Items ───
export const sigeOrderItemsGet = (accessToken: string, id: string) =>
  request<any>(`/sige/order-items/${id}`, {
    headers: { "X-User-Token": accessToken },
  });

export const sigeOrderItemsCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order-items/${id}`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Pedidos Items Text ───
export const sigeOrderItemsTextGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/order-items/${id}/text${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeOrderItemsTextCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order-items/${id}/text`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeOrderItemsTextUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order-items/${id}/text`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Integration (Sync + Sales) ───
export const sigeSyncCustomer = (accessToken: string, siteUserId: string) =>
  request<any>("/sige/sync-customer", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify({ siteUserId }),
  });

export const sigeSyncCustomerStatus = (accessToken: string) =>
  request<any>("/sige/sync-customer/status", {
    headers: { "X-User-Token": accessToken },
  });

// Check current user's own SIGE mapping (for checkout flow)
export const sigeMyMapping = (accessToken: string) =>
  request<any>("/sige/my-mapping", {
    headers: { "X-User-Token": accessToken },
  });

export const sigeSyncCustomerRemove = (accessToken: string, siteUserId: string) =>
  request<any>(`/sige/sync-customer/${siteUserId}`, {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

export interface SaleItem {
  codProduto: string;
  quantidade: number;
  valorUnitario: number;  // REQUIRED by SIGE API — always send a value (0 if unknown)
  titulo?: string;        // Product name (stored locally for order history)
  imageUrl?: string;      // Product image URL (stored locally for order history)
  desconto?: number;
  codRef?: string;
  valorFrete?: number;
  valorEncargos?: number;
  valorSeguro?: number;
  valorIpi?: number;
  numLote?: string;
  ncm?: string;
}

export interface CreateSalePayload {
  codCliente: string;
  items: SaleItem[];
  tipoPedido?: string;
  codVendedor?: string;
  codFilial?: string;
  codDeposito?: string;
  codCondPgto?: string;
  codTransportador?: string;
  tipoFrete?: string;
  nomeAux?: string;
  numDoctoAux?: string;
  codCarteira?: string;
  codLista?: string;
  codCategoria?: string;
  codMoeda?: string;
  codAtividade?: string;
  observacaoInterna?: string;
  observacao?: string | {
    descMensagem1?: string;
    descMensagem2?: string;
    descMensagem3?: string;
    descMensagem4?: string;
    observacao?: string;
  };
}

export const sigeCreateSale = async (accessToken: string, data: CreateSalePayload): Promise<any> => {
  const res = await fetch(_authUrl("/sige/create-sale", accessToken), {
    method: "POST",
    headers: headers,
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("API Error [/sige/create-sale]:", body);
    // Attach full error body (including steps, sentPayload) to the thrown error
    const err: any = new Error(body?.error || `HTTP ${res.status}`);
    err.data = body;
    throw err;
  }
  return body;
};

export const sigeListSales = (accessToken: string) =>
  request<any>("/sige/sales", {
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE: Confirm Order (stock deduction) ───
export const sigeConfirmOrder = (accessToken: string, sigeOrderId: string) =>
  request<{ ok: boolean; message: string; details?: any }>("/sige/confirm-order", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify({ sigeOrderId }),
  });

export const sigeListSituations = (accessToken: string) =>
  request<{ total: number; situations: any[]; raw: any; hint: string }>("/sige/situations", {
    headers: { "X-User-Token": accessToken },
  });

// ─── User: My Orders ───
export interface UserOrder {
  orderId: string | null;
  localOrderId: string;
  createdAt: string;
  status: string;
  paymentMethod: string | null;
  transactionId: string | null;
  total: number;
  itemCount: number;
  items: Array<{
    sku: string;
    titulo: string;
    imageUrl: string | null;
    quantidade: number;
    valorUnitario: number;
    warranty?: {
      planId: string;
      name: string;
      price: number;
      durationMonths: number;
    } | null;
  }>;
  shippingAddress?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    cep?: string;
    phone?: string;
  } | null;
  shippingOption?: {
    carrierId?: string;
    carrierName: string;
    carrierType?: string;
    price: number;
    deliveryDays: number;
    free: boolean;
    sisfreteQuoteId?: string;
  } | null;
}

export const userMyOrders = (accessToken: string) =>
  request<{ orders: UserOrder[]; total: number }>("/user/my-orders", {
    headers: { "X-User-Token": accessToken },
  });

// ─── User: Order Tracking (SisFrete) ───
export interface OrderTrackingEvent {
  objeto: string;
  pedido: string;
  danfe: string;
  id: number;
  link: string;
  descricao: string;
  data_hora: string;
}

export interface OrderTrackingResult {
  success: boolean;
  found: boolean;
  message?: string;
  events: OrderTrackingEvent[];
  total?: number;
  trackingCode: string | null;
  trackingLink: string | null;
  carrierName?: string | null;
  servicoEntrega?: string | null;
  sentAt?: string | null;
  numeroDoPedido?: string;
}

export const getOrderTracking = (accessToken: string, localOrderId: string) =>
  request<OrderTrackingResult>("/user/order-tracking/" + encodeURIComponent(localOrderId), {
    headers: { "X-User-Token": accessToken },
  });

// ─── Admin: All Orders ───
export interface AdminOrder extends UserOrder {
  sigeOrderId?: string | null;
  createdBy?: string | null;
  updatedAt?: string | null;
  observacao?: string | null;
  userEmail?: string | null;
  userName?: string | null;
}

export const adminGetOrders = (accessToken: string) =>
  request<{ orders: AdminOrder[]; total: number }>("/admin/orders", {
    headers: { "X-User-Token": accessToken },
  });

export const adminUpdateOrderStatus = (
  accessToken: string,
  data: { userId: string; localOrderId: string; status: string }
) =>
  request<{ success: boolean }>("/admin/update-order-status", {
    method: "POST",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const adminRetrySigeRegistration = (
  accessToken: string,
  data: { userId: string; localOrderId: string }
) =>
  request<{ success: boolean; sigeOrderId?: string; message?: string; error?: string; refDebug?: any[] }>(
    "/admin/retry-sige-registration",
    {
      method: "POST",
      headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );

export interface SaveUserOrderPayload {
  localOrderId: string;
  sigeOrderId?: string | null;
  items: Array<{
    sku: string;
    titulo: string;
    imageUrl?: string | null;
    quantidade: number;
    valorUnitario?: number;
    precoUnitario?: number | null;
    warranty?: {
      planId: string;
      name: string;
      price: number;
      durationMonths: number;
    } | null;
  }>;
  total: number;
  paymentMethod: string;
  transactionId?: string | null;
  observacao?: string;
  shippingAddress?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    cep?: string;
    phone?: string;
  } | null;
  shippingOption?: {
    carrierId?: string;
    carrierName: string;
    carrierType?: string;
    price: number;
    deliveryDays: number;
    free: boolean;
    sisfreteQuoteId?: string;
  };
}

export const saveUserOrder = (accessToken: string, data: SaveUserOrderPayload) =>
  request<{ success: boolean; orderId: string }>("/user/save-order", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const updateOrderStatus = (accessToken: string, localOrderId: string, status: string, transactionId?: string) =>
  request<{ success: boolean }>("/user/update-order-status", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify({ localOrderId, status, transactionId }),
  });

// ─── SafraPay: Credit Card ───
export interface SafrapayPublicConfig {
  enabled: boolean;
  maxInstallments: number;
  minInstallmentValue: number;
  sandbox: boolean;
}

export const safrapayPublicConfig = () =>
  request<SafrapayPublicConfig>("/safrapay/public-config");

export interface SafrapayChargePayload {
  cardNumber: string;
  cvv: string;
  cardholderName: string;
  cardholderDocument: string;
  expirationMonth: number;
  expirationYear: number;
  amount: number; // centavos
  installmentNumber: number;
  installmentType: number; // 0=None, 1=Merchant(sem juros), 2=Issuer(com juros)
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  merchantChargeId: string;
}

export interface SafrapayChargeResult {
  success: boolean;
  chargeId?: string;
  nsu?: string;
  chargeStatus?: string;
  merchantChargeId?: string;
  customerId?: string;
  error?: string;
  errors?: Array<{ errorCode: number; message: string }>;
  traceKey?: string;
  transaction?: {
    isApproved: boolean;
    transactionId: string | null;
    transactionStatus: string | null;
    amount: number;
    installmentNumber: number;
    installmentType: string | null;
    isCapture: boolean;
    cardNumber: string | null;
    brandName: string | null;
    authorizationCode: string | null;
    acquirer: string | null;
    softDescriptor: string | null;
  };
}

export const safrapayCharge = (accessToken: string, data: SafrapayChargePayload) =>
  request<SafrapayChargeResult>("/safrapay/charge", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// Debug: diagnostic endpoint for POST /order
export const sigeDebugCreateOrder = async (accessToken: string, data: { codCliFor: number; codTipoMv?: string; items?: any[] }): Promise<any> => {
  const res = await fetch(_authUrl("/sige/debug-create-order", accessToken), {
    method: "POST",
    headers: headers,
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("API Error [/sige/debug-create-order]:", body);
    const err: any = new Error(body?.error || `HTTP ${res.status}`);
    err.data = body;
    throw err;
  }
  return body;
};

// Debug: list SIGE order types (discover codTipoMv values)
export const sigeListOrderTypes = async (accessToken: string): Promise<any> => {
  const res = await fetch(_authUrl("/sige/order-types", accessToken), {
    method: "GET",
    headers: headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("API Error [/sige/order-types]:", body);
    const err: any = new Error(body?.error || `HTTP ${res.status}`);
    err.data = body;
    throw err;
  }
  return body;
};

// Diagnostic: comprehensive order creation dry-run
export const sigeDiagnoseOrder = async (accessToken: string, params?: { sku?: string; codCliente?: string; verbose?: boolean }): Promise<any> => {
  const qs = new URLSearchParams();
  if (params?.sku) qs.set("sku", params.sku);
  if (params?.codCliente) qs.set("codCliente", params.codCliente);
  if (params?.verbose) qs.set("verbose", "1");
  const qsStr = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(_authUrl("/sige/diagnose-order" + qsStr, accessToken), {
    method: "GET",
    headers: headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("API Error [/sige/diagnose-order]:", body);
    const err: any = new Error(body?.error || `HTTP ${res.status}`);
    err.data = body;
    throw err;
  }
  return body;
};

// Debug: test multiple codTipoMv values to find the working one
export const sigeTestOrderTipoMv = async (accessToken: string, data: { codCliFor: number; codTipoMv_values?: string[]; items?: any[] }): Promise<any> => {
  const res = await fetch(_authUrl("/sige/test-order-tipomv", accessToken), {
    method: "POST",
    headers: headers,
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("API Error [/sige/test-order-tipomv]:", body);
    const err: any = new Error(body?.error || `HTTP ${res.status}`);
    err.data = body;
    throw err;
  }
  return body;
};

// ─── Products ───
export const getProducts = () => request<Product[]>("/products");
export const getProduct = (id: string) => request<Product>(`/products/${id}`);
export const createProduct = (product: Partial<Product>) =>
  request<Product>("/products", { method: "POST", body: JSON.stringify(product) });
export const updateProduct = (id: string, product: Partial<Product>) =>
  request<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(product) });
export const deleteProduct = (id: string) =>
  request<{ deleted: boolean }>(`/products/${id}`, { method: "DELETE" });

// ─── Categories ───
export const getCategories = () => request<Category[]>("/categories");
export const createCategory = (category: Partial<Category>) =>
  request<Category>("/categories", { method: "POST", body: JSON.stringify(category) });
export const updateCategory = (id: string, category: Partial<Category>) =>
  request<Category>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(category) });
export const deleteCategory = (id: string) =>
  request<{ deleted: boolean }>(`/categories/${id}`, { method: "DELETE" });

// ─── Category Tree (hierarchical) ───
export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children?: CategoryNode[];
}

export const getCategoryTree = () => request<CategoryNode[]>("/category-tree");
export const saveCategoryTree = (tree: CategoryNode[]) =>
  request<CategoryNode[]>("/category-tree", { method: "PUT", body: JSON.stringify(tree) });

// ─── Messages ───
export interface Message {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  subjectLabel: string;
  message: string;
  date: string;
  read: boolean;
}

export const getMessages = () => request<Message[]>("/messages");
export const createMessage = (msg: Partial<Message> & { captchaToken?: string }) =>
  request<Message>("/messages", { method: "POST", body: JSON.stringify(msg) });
export const updateMessage = (id: string, msg: Partial<Message>) =>
  request<Message>(`/messages/${id}`, { method: "PUT", body: JSON.stringify(msg) });
export const deleteMessage = (id: string) =>
  request<{ deleted: boolean }>(`/messages/${id}`, { method: "DELETE" });

// ─── Admin Audit Log ───
export interface AuditLogEntry {
  id: string;
  action: string;
  email: string;
  userName: string;
  details: string;
  userAgent: string;
  timestamp: number;
  createdAt: string;
}

export const saveAuditLog = (accessToken: string, data: { action: string; email: string; userName: string; details?: string; userAgent?: string }) =>
  request<{ ok: boolean; entry: AuditLogEntry }>("/admin/audit-log", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const getAuditLogs = (accessToken: string) =>
  request<{ logs: AuditLogEntry[]; total: number }>("/admin/audit-logs", {
    headers: { "X-User-Token": accessToken },
  });

export const deleteAuditLog = (accessToken: string, id: string) =>
  request<{ deleted: boolean }>("/admin/audit-log/" + id, {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

export const clearAuditLogs = (accessToken: string) =>
  request<{ cleared: boolean; count: number }>("/admin/audit-logs/clear", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

// ─── Settings ──
export interface SiteSettings {
  storeName: string;
  storeSubtitle: string;
  email: string;
  phone: string;
  address: string;
  cep: string;
  cnpj: string;
  freeShippingMin: string;
  maxInstallments: string;
  workdaysHours: string;
  saturdayHours: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  youtube: string;
  primaryColor: string;
  emailNotifications: boolean;
  stockAlerts: boolean;
  newMessageAlerts: boolean;
  weeklyReport: boolean;
  maintenanceMode: boolean;
  catalogMode: boolean;
}

// ── Cached settings singleton — deduplicates concurrent getSettings() calls ──
var _settingsPromise: Promise<SiteSettings> | null = null;
var _settingsCache: SiteSettings | null = null;
var _settingsCacheTime = 0;
var SETTINGS_CACHE_TTL = 60000; // 60s

export function getSettings(): Promise<SiteSettings> {
  var now = Date.now();
  // Return cached value if fresh
  if (_settingsCache && now - _settingsCacheTime < SETTINGS_CACHE_TTL) {
    return Promise.resolve(_settingsCache);
  }
  // Deduplicate: if a request is already in-flight, reuse it
  if (_settingsPromise) return _settingsPromise;
  _settingsPromise = request<SiteSettings>("/settings").then(function (data) {
    _settingsCache = data;
    _settingsCacheTime = Date.now();
    _settingsPromise = null;
    return data;
  }).catch(function (err) {
    _settingsPromise = null;
    throw err;
  });
  return _settingsPromise;
}

/** Force-refresh settings (used after admin updates settings) */
export function getSettingsFresh(): Promise<SiteSettings> {
  _settingsCache = null;
  _settingsCacheTime = 0;
  _settingsPromise = null;
  return getSettings();
}

export const updateSettings = (settings: SiteSettings) =>
  request<SiteSettings>("/settings", { method: "PUT", body: JSON.stringify(settings) });

// ─── Google Analytics 4 ───
export interface GA4Config {
  measurementId: string;
  enabled: boolean;
  trackPageViews: boolean;
  trackAddToCart: boolean;
  trackCheckout: boolean;
  trackPurchase: boolean;
  trackSearch: boolean;
  trackViewItem: boolean;
}

export const getGA4Config = () => request<GA4Config>("/ga4/config");
export const updateGA4Config = (config: GA4Config) =>
  request<GA4Config>("/ga4/config", { method: "PUT", body: JSON.stringify(config) });

// ─── Produtos (Supabase DB Table) ───
export interface ProdutoDB {
  sku: string;
  titulo: string;
}

export interface ProdutosResponse {
  data: ProdutoDB[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const getProdutosDB = (page = 1, limit = 24, search = "") => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) params.set("search", search.trim());
  return request<ProdutosResponse>(`/produtos?${params.toString()}`);
};

// ─── Catalog (public, with category + visibility filtering) ───

export interface CatalogResponse {
  data: ProdutoDB[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  categoria: string | null;
  categoryName: string | null;
  categoryBreadcrumb: string[] | null;
}

export const getCatalog = (page = 1, limit = 24, search = "", categoria = "", sort = "") => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), public: "1" });
  if (search.trim()) params.set("search", search.trim());
  if (categoria.trim()) params.set("categoria", categoria.trim());
  if (sort.trim()) params.set("sort", sort.trim());
  return request<CatalogResponse>(`/produtos?${params.toString()}`);
};

/** Random visible products for the homepage — different on each page load */
export const getDestaques = (limit = 8) => {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<{ data: ProdutoDB[] }>(`/produtos/destaques?${params.toString()}`);
};

export const getProdutoBySku = (sku: string) => {
  const params = new URLSearchParams({ sku, limit: "1" });
  return request<ProdutosResponse>(`/produtos?${params.toString()}`);
};

// ─── Product Detail Init (combined endpoint — 6 calls in 1) ───
export interface ProductDetailInitResponse {
  product: ProdutosResponse;
  meta: { visible?: boolean; category?: string; [key: string]: any };
  images: { sku: string; images: ProductImage[]; total: number };
  attributes: { sku: string; attributes: Record<string, string | string[]> | null; found: boolean };
  price: ProductPrice | null;
  balance: ProductBalance | null;
  reviewSummary?: { averageRating: number; totalReviews: number } | null;
  _elapsed?: number;
}

export const getProductDetailInit = (sku: string, options?: { signal?: AbortSignal }) =>
  request<ProductDetailInitResponse>("/produto-detail-init/" + encodeURIComponent(sku), options);

/**
 * Returns the OG proxy URL for a product — use this for social sharing.
 * Crawlers (Facebook, WhatsApp, Twitter) will read correct meta tags
 * from the server-rendered HTML, then human visitors get redirected to the SPA.
 */
export function getProductOgUrl(sku: string): string {
  return BASE_URL + "/og/produto/" + encodeURIComponent(sku);
}

// ─── Match SKUs (bulk matching with normalized comparison) ───
export interface MatchSkusResponse {
  totalDb: number;
  totalDbUnique: number;
  matched: string[];
  unmatched: string[];
  totalMatched: number;
  totalUnmatched: number;
  matchDetails: {
    exact: number;
    normalized: number;
    aggressive: number;
  };
}

export const matchSkus = (skus: string[]) =>
  request<MatchSkusResponse>("/produtos/match-skus", {
    method: "POST",
    body: JSON.stringify({ skus }),
  });

// ─── Autocomplete (fuzzy search) ───
export interface AutocompleteResult {
  sku: string;
  titulo: string;
  matchType: "exact" | "sku" | "similar" | "fuzzy";
  score: number;
}

export interface AutocompleteResponse {
  results: AutocompleteResult[];
  query: string;
  totalMatches: number;
}

export const autocomplete = (q: string, limit = 8) => {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return request<AutocompleteResponse>(`/produtos/autocomplete?${params.toString()}`);
};

// ─── Product Images (Supabase Storage) ───

const STORAGE_BASE = "https://aztdgagxvrlylszieujs.supabase.co/storage/v1/object/public/produtos";

export interface ProductImage {
  name: string;
  url: string;
  number: number;
  isPrimary: boolean;
}

export interface ProductImagesResponse {
  sku: string;
  images: ProductImage[];
  total: number;
  error?: string;
}

/** Get all images for a product from the backend (lists Storage bucket) */
export const getProductImages = (sku: string) => {
  return request<ProductImagesResponse>(`/produtos/imagens/${encodeURIComponent(sku)}`);
};

/**
 * Build the public URL for a product's primary image (image #1).
 * This is a direct URL — no API call needed.
 * Use with <img onError> fallback for products without images.
 */
export function getProductMainImageUrl(sku: string): string {
  return `${STORAGE_BASE}/${encodeURIComponent(sku)}/${encodeURIComponent(sku)}.1.webp`;
}

// ─── Product Attributes (CSV-based) ───

export interface ProductAttributesResponse {
  sku: string;
  attributes: Record<string, string | string[]> | null;
  found: boolean;
  error?: string;
}

/** Get dynamic attributes for a product (parsed from CSV in Storage) */
export const getProductAttributes = (sku: string) => {
  const params = new URLSearchParams({ sku });
  return request<ProductAttributesResponse>(`/produtos/atributos?${params.toString()}`);
};

// ─── Product Stock Balance (SIGE) ───

export interface ProductBalance {
  sku: string;
  found: boolean;
  sige: boolean;
  sigeId?: string;
  descricao?: string;
  quantidade: number | null;
  reservado?: number;
  disponivel?: number;
  locais?: Array<{
    local: string;
    filial: string;
    quantidade: number;
    reservado: number;
    disponivel: number;
  }>;
  balanceRaw?: any;
  balanceError?: string;
  cached?: boolean;
  error?: string;
  _priceKeys?: string[];
  _allKeys?: string[];
  _fetchedDetail?: boolean;
  _detailKeys?: number;
}

// ═══════════════════════════════════════════════════════════
// Stock balance auto-batching — collects individual SKU
// requests over a 80ms window and sends them as a single
// bulk POST to /produtos/saldos, dramatically reducing the
// number of concurrent connections to the edge function.
// ═══════════════════════════════════════════════════════════
var _balanceBatchQueue: Array<{
  sku: string;
  resolve: (v: ProductBalance) => void;
  reject: (e: any) => void;
}> = [];
var _balanceBatchTimer: ReturnType<typeof setTimeout> | null = null;
var _BALANCE_BATCH_DELAY = 80;
var _BALANCE_BATCH_MAX = 30;

function _flushBalanceBatch() {
  _balanceBatchTimer = null;
  if (_balanceBatchQueue.length === 0) return;
  var batch = _balanceBatchQueue.splice(0);
  var skuSet = new Set<string>();
  for (var bi = 0; bi < batch.length; bi++) skuSet.add(batch[bi].sku);
  var skus = Array.from(skuSet);
  console.log("[API] Balance batch flush: " + skus.length + " unique SKUs from " + batch.length + " callers");
  request<{ results: ProductBalance[]; total: number }>("/produtos/saldos", {
    method: "POST",
    body: JSON.stringify({ skus: skus, force: false }),
  }).then(function (resp) {
    var resultMap: Record<string, ProductBalance> = {};
    if (resp && Array.isArray(resp.results)) {
      for (var ri = 0; ri < resp.results.length; ri++) {
        var r = resp.results[ri];
        if (r && r.sku) resultMap[r.sku] = r;
      }
    }
    for (var ci = 0; ci < batch.length; ci++) {
      var entry = batch[ci];
      var result = resultMap[entry.sku];
      if (result) {
        entry.resolve(result);
      } else {
        entry.resolve({ sku: entry.sku, found: false, sige: true, quantidade: 0 } as any);
      }
    }
  }).catch(function (err) {
    for (var ci = 0; ci < batch.length; ci++) batch[ci].reject(err);
  });
}

/** Get stock balance for a single product from SIGE (public, cached 5 min).
 *  Normal calls are auto-batched; force/debug bypass batching. */
export const getProductBalance = (sku: string, opts?: { force?: boolean; debug?: boolean }): Promise<ProductBalance & { _debug?: string[]; _sigeResponses?: any[] }> => {
  if (opts && (opts.force || opts.debug)) {
    const params = new URLSearchParams();
    if (opts.force) params.set("force", "1");
    if (opts.debug) params.set("debug", "1");
    const qs = params.toString();
    return request<ProductBalance & { _debug?: string[]; _sigeResponses?: any[] }>(
      "/produtos/saldo/" + encodeURIComponent(sku) + (qs ? "?" + qs : "")
    );
  }
  return new Promise<ProductBalance>(function (resolve, reject) {
    _balanceBatchQueue.push({ sku: sku, resolve: resolve, reject: reject });
    if (_balanceBatchQueue.length >= _BALANCE_BATCH_MAX) {
      if (_balanceBatchTimer) { clearTimeout(_balanceBatchTimer); _balanceBatchTimer = null; }
      _flushBalanceBatch();
    } else if (!_balanceBatchTimer) {
      _balanceBatchTimer = setTimeout(_flushBalanceBatch, _BALANCE_BATCH_DELAY);
    }
  }) as any;
};

/** Get stock balances for multiple SKUs in bulk */
export const getProductBalances = (skus: string[], opts?: { force?: boolean; signal?: AbortSignal }) =>
  request<{ results: ProductBalance[]; total: number }>("/produtos/saldos", {
    method: "POST",
    body: JSON.stringify({ skus: skus, force: opts?.force || false }),
    signal: opts?.signal,
  });

/** Clear balance cache for all SKUs (admin, requires auth) */
export const clearBalanceCache = (accessToken: string) =>
  request<{ cleared: number; message: string }>("/produtos/saldo/cache", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

/** Clear balance cache for a single SKU (admin, requires auth) */
export const clearBalanceCacheSku = (accessToken: string, sku: string) =>
  request<{ cleared: boolean; sku: string; message: string }>(
    `/produtos/saldo/cache/${encodeURIComponent(sku)}`,
    { method: "DELETE", headers: { "X-User-Token": accessToken } }
  );

/** Global stock summary across ALL products */
export interface StockSummary {
  totalProducts: number;
  inStock: number;
  outOfStock: number;
  notFound: number;
  pending: number;
  totalCached: number;
  cached: boolean;
  _cachedAt: number;
  error?: string;
}

export const getStockSummary = () =>
  request<StockSummary>("/produtos/stock-summary");

/** Trigger balance scan for uncached/expired SKUs */
export interface StockScanResult {
  scanned: number;
  found: number;
  remaining: number;
  totalPending: number;
  message?: string;
  error?: string;
}

export const triggerStockScan = (batchSize = 50) =>
  request<StockScanResult>("/produtos/stock-scan", {
    method: "POST",
    body: JSON.stringify({ batchSize }),
  });

// ─── SIGE Product Mapping (match local SKUs ↔ SIGE IDs) ─���─

export interface SigeMapping {
  sku: string;
  sigeId: string;
  codProduto: string;
  descricao: string;
  matchType: string;
  matchedAt: number;
  matchedBy?: string;
}

export interface SigeSyncResult {
  ok: boolean;
  localProducts: number;
  sigeProducts: number;
  matched: number;
  unmatched: number;
  skipped: number;
  balanceFetched: number;
  matchResults: Array<{
    sku: string;
    matched: boolean;
    matchType?: string;
    sigeId?: string;
    codProduto?: string;
    descricao?: string;
    titulo?: string;
  }>;
  totalResults: number;
  error?: string;
}

/** Get all SIGE mappings */
export const getSigeMappings = () =>
  request<{ mappings: SigeMapping[]; total: number }>("/produtos/sige-map");

/** Manually map a local SKU to a SIGE product ID */
export const setSigeMapping = (
  accessToken: string,
  sku: string,
  data: { sigeId: string; codProduto?: string; descricao?: string }
) =>
  request<{ ok: boolean; sku: string; mapping: SigeMapping }>(
    `/produtos/sige-map/${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { "X-User-Token": accessToken },
    }
  );

/** Remove mapping for a SKU */
export const deleteSigeMapping = (accessToken: string, sku: string) =>
  request<{ ok: boolean; sku: string; message: string }>(
    `/produtos/sige-map/${encodeURIComponent(sku)}`,
    {
      method: "DELETE",
      headers: { "X-User-Token": accessToken },
    }
  );

/** Auto-match local products with SIGE products */
export const triggerSigeSync = (
  accessToken: string,
  opts?: { fetchBalances?: boolean; clearExisting?: boolean; batchSize?: number }
) =>
  request<SigeSyncResult>("/produtos/sige-sync", {
    method: "POST",
    body: JSON.stringify(opts || {}),
    headers: { "X-User-Token": accessToken },
  });

// ─── Product CRUD (Admin) ───

export interface ProductMeta {
  sku?: string;
  visible?: boolean;
  description?: string;
  category?: string;
  brand?: string;
  price?: number;
  compatibility?: string[];
  customAttributes?: Record<string, string>;
}

export const getProductMeta = (sku: string) =>
  request<ProductMeta>(`/produtos/meta/${encodeURIComponent(sku)}`);

export const saveProductMeta = (sku: string, meta: Partial<ProductMeta>, accessToken?: string) =>
  request<ProductMeta>(`/produtos/meta/${encodeURIComponent(sku)}`, {
    method: "PUT",
    body: JSON.stringify(meta),
    headers: accessToken ? { "X-User-Token": accessToken } : undefined,
  });

export const updateProdutoTitulo = (sku: string, titulo: string, accessToken: string) =>
  request<{ sku: string; titulo: string; updated: boolean }>(
    `/produtos/${encodeURIComponent(sku)}/titulo`,
    {
      method: "PUT",
      body: JSON.stringify({ titulo }),
      headers: { "X-User-Token": accessToken },
    }
  );

export const renameProdutoSku = (oldSku: string, newSku: string, accessToken: string) =>
  request<{ oldSku: string; newSku: string; renamed: boolean }>(
    `/produtos/${encodeURIComponent(oldSku)}/rename`,
    {
      method: "PUT",
      body: JSON.stringify({ newSku }),
      headers: { "X-User-Token": accessToken },
    }
  );

export const createProduto = (
  sku: string,
  titulo: string,
  meta: Partial<ProductMeta>,
  accessToken: string
) =>
  request<{ sku: string; titulo: string; created: boolean }>("/produtos/create", {
    method: "POST",
    body: JSON.stringify({ sku, titulo, meta }),
    headers: { "X-User-Token": accessToken },
  });

export interface SigeMatchResult {
  found: boolean;
  sigeId?: string;
  codProduto?: string;
  titulo?: string;
  marca?: string;
  preco?: number;
  peso?: number;
  comprimento?: number;
  largura?: number;
  altura?: number;
  ncm?: string;
  unidade?: string;
  codBarras?: string;
  observacao?: string;
  estoque?: number;
  reservado?: number;
  disponivel?: number;
  estoqueOk?: boolean;
  alternativas?: { sigeId: string; codProduto: string; titulo: string; marca: string }[];
  totalEncontrados?: number;
  reason?: string;
  error?: string;
}

export const sigeMatchProduct = (sku: string, accessToken: string) =>
  request<SigeMatchResult>(
    `/produtos/sige-match/${encodeURIComponent(sku)}`,
    { headers: { "X-User-Token": accessToken } }
  );

export const deleteProduto = (sku: string, accessToken: string) =>
  request<{ sku: string; deleted: boolean }>(
    `/produtos/${encodeURIComponent(sku)}/delete`,
    {
      method: "DELETE",
      headers: { "X-User-Token": accessToken },
    }
  );

export const uploadProductImage = async (
  sku: string,
  file: File,
  filename: string,
  accessToken: string
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("filename", filename);

  const res = await fetch(
    _authUrl("/produtos/imagens/" + encodeURIComponent(sku) + "/upload", accessToken),
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + publicAnonKey,
      },
      body: formData,
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as { uploaded: boolean; path: string; url: string; filename: string };
};

export const deleteProductImage = (sku: string, filename: string, accessToken: string) =>
  request<{ deleted: boolean; path: string }>(
    `/produtos/imagens/${encodeURIComponent(sku)}/file`,
    {
      method: "DELETE",
      body: JSON.stringify({ filename }),
      headers: { "X-User-Token": accessToken },
    }
  );

export const getProductMetaBulk = (skus: string[]) =>
  request<Record<string, ProductMeta>>("/produtos/meta/bulk", {
    method: "POST",
    body: JSON.stringify({ skus }),
  });

// ─── Attributes Upload (Admin) ───

export interface UploadAttributesResult {
  success: boolean;
  totalCsv: number;
  totalDb: number;
  matched: number;
  unmatched: number;
  unmatchedSkus: string[];
  columns: string[];
  preview: { sku: string; attributes: Record<string, string | string[]> }[];
  message: string;
  error?: string;
}

/** Parse an Excel file (XLSX/XLS) server-side and return CSV (avoids vulnerable client-side SheetJS) */
export async function parseExcelFile(base64Data: string, filename: string): Promise<{ csv: string; sheetName: string; error?: string }> {
  try {
    var res = await request<{ csv: string; sheetName: string }>("/parse-excel", {
      method: "POST",
      body: JSON.stringify({ data: base64Data, filename: filename }),
    });
    return res;
  } catch (e: any) {
    return { csv: "", sheetName: "Sheet1", error: e.message || "Erro ao processar planilha." };
  }
}

/** Upload a CSV file with product attributes (requires auth) */
export const uploadAttributesCsv = async (
  file: File,
  accessToken: string
): Promise<UploadAttributesResult> => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(_authUrl("/produtos/atributos/upload", accessToken), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};

/** Get all attributes (for admin overview) */
export const getAllAttributes = () => {
  return request<{
    total: number;
    data: { sku: string; attributes: Record<string, string | string[]> }[];
  }>("/produtos/atributos");
};

/** Delete the attributes CSV from storage (requires auth) */
export const deleteAttributesCsv = async (accessToken: string) => {
  const res = await fetch(_authUrl("/produtos/atributos", accessToken), {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};

// ─── Logo (Site Assets) ───

export interface LogoMeta {
  hasLogo: boolean;
  url: string | null;
  filename?: string;
  contentType?: string;
  size?: number;
  uploadedAt?: string;
}

export const getLogo = () => request<LogoMeta>("/logo");

export const uploadLogo = async (file: File, accessToken: string): Promise<LogoMeta & { uploaded: boolean }> => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(_authUrl("/logo/upload", accessToken), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
};

export const deleteLogo = async (accessToken: string) => {
  const res = await fetch(_authUrl("/logo", accessToken), {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as { deleted: boolean };
};

// ─── Footer Logo (Site Assets) ───

export const getFooterLogo = () => request<LogoMeta>("/footer-logo");

export const uploadFooterLogo = async (file: File, accessToken: string): Promise<LogoMeta & { uploaded: boolean }> => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(_authUrl("/footer-logo/upload", accessToken), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
};

export const deleteFooterLogo = async (accessToken: string) => {
  const res = await fetch(_authUrl("/footer-logo", accessToken), {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as { deleted: boolean };
};

// ─── Favicon (Site Assets) ───

export interface FaviconMeta {
  hasFavicon: boolean;
  url: string | null;
  filename?: string;
  contentType?: string;
  size?: number;
  uploadedAt?: string;
}

export const getFavicon = () => request<FaviconMeta>("/favicon");

export const uploadFavicon = async (file: File, accessToken: string): Promise<FaviconMeta & { uploaded: boolean }> => {
  var formData = new FormData();
  formData.append("file", file);
  var res = await fetch(_authUrl("/favicon/upload", accessToken), {
    method: "POST",
    headers: { Authorization: "Bearer " + publicAnonKey },
    body: formData,
  });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data?.error || "HTTP " + res.status);
  return data;
};

export const deleteFavicon = async (accessToken: string) => {
  var res = await fetch(_authUrl("/favicon", accessToken), {
    method: "DELETE",
    headers: { Authorization: "Bearer " + publicAnonKey },
  });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data?.error || "HTTP " + res.status);
  return data as { deleted: boolean };
};

// ─── Banners (Home Page) ───

export interface BannerItem {
  id: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  imageUrl: string;
  filename: string;
  order: number;
  active: boolean;
  contentType?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
}

// Public — only active banners
export const getBanners = () =>
  request<{ banners: BannerItem[] }>("/banners");

// Admin — all banners
export const getAdminBanners = (accessToken: string) =>
  request<{ banners: BannerItem[] }>("/admin/banners", {
    headers: { "X-User-Token": accessToken },
  });

// Create banner (FormData with image)
export const createBanner = async (
  file: File,
  meta: { title: string; subtitle: string; buttonText: string; buttonLink: string; order: number; active: boolean },
  accessToken: string
): Promise<{ created: boolean; banner: BannerItem }> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", meta.title);
  formData.append("subtitle", meta.subtitle);
  formData.append("buttonText", meta.buttonText);
  formData.append("buttonLink", meta.buttonLink);
  formData.append("order", String(meta.order));
  formData.append("active", String(meta.active));

  const res = await fetch(_authUrl("/admin/banners", accessToken), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
};

// Update banner metadata (JSON)
export const updateBanner = (
  bannerId: string,
  updates: Partial<BannerItem>,
  accessToken: string
) =>
  request<{ updated: boolean; banner: BannerItem }>("/admin/banners/" + bannerId, {
    method: "PUT",
    body: JSON.stringify(updates),
    headers: { "X-User-Token": accessToken },
  });

// Update banner with new image (FormData)
export const updateBannerWithImage = async (
  bannerId: string,
  file: File,
  meta: { title: string; subtitle: string; buttonText: string; buttonLink: string; order: number; active: boolean },
  accessToken: string
): Promise<{ updated: boolean; banner: BannerItem }> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", meta.title);
  formData.append("subtitle", meta.subtitle);
  formData.append("buttonText", meta.buttonText);
  formData.append("buttonLink", meta.buttonLink);
  formData.append("order", String(meta.order));
  formData.append("active", String(meta.active));

  const res = await fetch(_authUrl("/admin/banners/" + bannerId, accessToken), {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
};

// Delete banner
export const deleteBanner = async (bannerId: string, accessToken: string) => {
  const res = await fetch(_authUrl("/admin/banners/" + bannerId, accessToken), {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as { deleted: boolean };
};

// Reorder banners
export const reorderBanners = (orderedIds: string[], accessToken: string) =>
  request<{ reordered: boolean; count: number }>("/admin/banners-reorder", {
    method: "PUT",
    body: JSON.stringify({ orderedIds }),
    headers: { "X-User-Token": accessToken },
  });

// ─── Price Config ───

export interface PriceConfig {
  tier: "v1" | "v2" | "v3";
  showPrice: boolean;
  pixDiscountEnabled?: boolean;
  pixDiscountPercent?: number;
  installmentsCount?: number;
  installmentsMinValue?: number;
  updatedAt?: number;
  listPriceMapping?: Record<string, string>;
}

export const getPriceConfig = () =>
  request<PriceConfig>("/price-config");

export const savePriceConfig = (config: Partial<PriceConfig>, accessToken: string) =>
  request<PriceConfig>("/price-config", {
    method: "PUT",
    body: JSON.stringify(config),
    headers: { "X-User-Token": accessToken },
  });

/** Admin — clear all SIGE price caches (forces re-fetch from SIGE) */
export const clearPriceCache = (accessToken: string) =>
  request<{ ok: boolean; cleared: number }>("/produtos/precos-cache", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── Product Price ───

export interface ProductPrice {
  sku: string;
  found: boolean;
  source: "sige" | "custom" | "none";
  price: number | null;
  v1: number | null;
  v2: number | null;
  v3: number | null;
  base?: number | null;
  tier: string;
  showPrice?: boolean;
  sigeId?: string;
  descricao?: string;
  cached?: boolean;
  error?: string;
  _priceListItems?: number;
  _detectedListCodes?: string[];
  _priceListDebug?: Array<{ codLista: string; price: number | null; descLista?: string | null }>;
  _itemSampleKeys?: string[];
  _listMapping?: Record<string, string>;
}

export const getProductPrice = (sku: string, options?: { signal?: AbortSignal }) =>
  request<ProductPrice>("/produtos/preco/" + encodeURIComponent(sku), options);

/** Bulk fetch prices for multiple SKUs in one call (public, no auth) */
export const getProductPricesBulk = (skus: string[], opts?: { signal?: AbortSignal }) =>
  request<{ results: ProductPrice[]; config: PriceConfig | null }>("/produtos/precos-bulk", {
    method: "POST",
    body: JSON.stringify({ skus }),
    signal: opts?.signal,
  });

export const setProductCustomPrice = (sku: string, price: number, accessToken: string) =>
  request<{ ok: boolean; sku: string; price: number }>(
    `/produtos/preco/${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      body: JSON.stringify({ price }),
      headers: { "X-User-Token": accessToken },
    }
  );

export const deleteProductCustomPrice = (sku: string, accessToken: string) =>
  request<{ ok: boolean; sku: string; message: string }>(
    `/produtos/preco/${encodeURIComponent(sku)}`,
    {
      method: "DELETE",
      headers: { "X-User-Token": accessToken },
    }
  );

// ─── Custom Prices List ───

export interface CustomPriceEntry {
  sku: string;
  price: number;
  source: "custom";
  updatedAt: number | null;
}

export const getCustomPrices = (accessToken: string) =>
  request<{ customs: CustomPriceEntry[]; total: number }>("/produtos/custom-prices", {
    headers: { "X-User-Token": accessToken },
  });

// clearPriceCache is defined above (line ~1794) — points to /produtos/precos-cache

// ─── SIGE List Price ───

export const getSigeListPrices = (accessToken: string) =>
  request<any>("/sige/list-price", {
    headers: { "X-User-Token": accessToken },
  });

export const getSigeListPriceItems = (accessToken: string, params?: { codProduto?: string; codLista?: string; limit?: number; offset?: number }) => {
  const cleaned: Record<string, string> = {};
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) cleaned[k] = String(v);
    }
  }
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/list-price-items${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── PagHiper ───

export interface PagHiperConfig {
  configured: boolean;
  hasApiKey?: boolean;
  hasToken?: boolean;
  apiKeyPreview?: string | null;
  updatedAt?: number | null;
}

export const getPagHiperConfig = (accessToken: string) =>
  request<PagHiperConfig>("/paghiper/config", {
    headers: { "X-User-Token": accessToken },
  });

export const savePagHiperConfig = (accessToken: string, config: { apiKey: string; token: string }) =>
  request<{ success: boolean; configured: boolean }>("/paghiper/config", {
    method: "PUT",
    body: JSON.stringify(config),
    headers: { "X-User-Token": accessToken },
  });

export const deletePagHiperConfig = (accessToken: string) =>
  request<{ success: boolean; configured: boolean }>("/paghiper/config", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// PIX

export interface PixCreatePayload {
  order_id: string;
  payer_email: string;
  payer_name: string;
  payer_cpf_cnpj: string;
  payer_phone?: string;
  days_due_date?: string;
  notification_url?: string;
  discount_cents?: number;
  items: Array<{
    description: string;
    quantity: number;
    item_id: string;
    price_cents: number;
  }>;
}

export interface PixCreateResponse {
  success: boolean;
  transaction_id: string;
  status: string;
  qr_code_base64: string | null;
  pix_url: string | null;
  emv: string | null;
  bacen_url: string | null;
  due_date: string | null;
  value_cents: number | null;
  raw: any;
  error?: string;
}

export const createPixCharge = (payload: PixCreatePayload) =>
  request<PixCreateResponse>("/paghiper/pix/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getPixStatus = (transaction_id: string) =>
  request<{
    transaction_id: string;
    status: string;
    status_label: string;
    value_cents: number | null;
    value_cents_paid: number | null;
    paid_date: string | null;
    due_date: string | null;
    raw: any;
  }>("/paghiper/pix/status", {
    method: "POST",
    body: JSON.stringify({ transaction_id }),
  });

export const cancelPixCharge = (accessToken: string, transaction_id: string) =>
  request<{ success: boolean; transaction_id: string }>("/paghiper/pix/cancel", {
    method: "POST",
    body: JSON.stringify({ transaction_id }),
    headers: { "X-User-Token": accessToken },
  });

// Boleto

export interface BoletoCreatePayload {
  order_id: string;
  payer_email: string;
  payer_name: string;
  payer_cpf_cnpj: string;
  payer_phone?: string;
  payer_street?: string;
  payer_number?: string;
  payer_complement?: string;
  payer_district?: string;
  payer_city?: string;
  payer_state?: string;
  payer_zip_code?: string;
  days_due_date?: string;
  notification_url?: string;
  discount_cents?: number;
  items: Array<{
    description: string;
    quantity: number;
    item_id: string;
    price_cents: number;
  }>;
}

export interface BoletoCreateResponse {
  success: boolean;
  transaction_id: string;
  status: string;
  due_date: string | null;
  value_cents: number | null;
  bank_slip: {
    digitable_line: string | null;
    url_slip: string | null;
    url_slip_pdf: string | null;
  };
  raw: any;
  error?: string;
}

export const createBoletoCharge = (payload: BoletoCreatePayload) =>
  request<BoletoCreateResponse>("/paghiper/boleto/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getBoletoStatus = (transaction_id: string) =>
  request<{
    transaction_id: string;
    status: string;
    status_label: string;
    value_cents: number | null;
    value_cents_paid: number | null;
    paid_date: string | null;
    due_date: string | null;
    raw: any;
  }>("/paghiper/boleto/status", {
    method: "POST",
    body: JSON.stringify({ transaction_id }),
  });

export const cancelBoletoCharge = (accessToken: string, transaction_id: string) =>
  request<{ success: boolean; transaction_id: string }>("/paghiper/boleto/cancel", {
    method: "POST",
    body: JSON.stringify({ transaction_id }),
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE API Docs Storage ───

export interface ApiDocsData {
  found: boolean;
  content: string;
  sections: string[];
  updatedAt: string | null;
  size: number;
}

export const getApiDocs = (accessToken: string) =>
  request<ApiDocsData>("/sige/api-docs", {
    headers: { "X-User-Token": accessToken },
  });

export const saveApiDocs = (accessToken: string, content: string) =>
  request<{ success: boolean; size: number; sections: number; updatedAt: string }>("/sige/api-docs", {
    method: "PUT",
    body: JSON.stringify({ content }),
    headers: { "X-User-Token": accessToken },
  });

export const deleteApiDocs = (accessToken: string) =>
  request<{ success: boolean; message: string }>("/sige/api-docs", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

export const searchApiDocs = (accessToken: string, query: string) =>
  request<{ results: Array<{ lineNumber: number; context: string }>; total: number; query: string }>("/sige/api-docs/search", {
    method: "POST",
    body: JSON.stringify({ query }),
    headers: { "X-User-Token": accessToken },
  });

// Transactions

export interface PagHiperTransaction {
  type: "pix" | "boleto";
  order_id: string;
  transaction_id: string;
  status: string;
  created_at: number;
  payer_email: string;
  payer_name: string;
  payer_cpf_cnpj: string;
  value_cents: number;
  paid_date?: string;
  canceled_at?: number;
  qr_code?: string | null;
  pix_url?: string | null;
  emv?: string | null;
  bank_slip?: {
    digitable_line: string | null;
    url_slip: string | null;
    url_slip_pdf: string | null;
  };
}

export const getPagHiperTransactions = (accessToken: string) =>
  request<{ transactions: PagHiperTransaction[]; total: number }>("/paghiper/transactions", {
    headers: { "X-User-Token": accessToken },
  });

export const getPagHiperTransaction = (transaction_id: string) =>
  request<PagHiperTransaction>(`/paghiper/transaction/${encodeURIComponent(transaction_id)}`);

// ─── Shipping / Frete ───

export interface ShippingStateRule {
  basePrice: number;
  pricePerKg: number;
  pricePerItem: number;
  deliveryDays: number;
}

export interface ShippingCarrier {
  id: string;
  name: string;
  type: "correios_pac" | "correios_sedex" | "transportadora" | "motoboy" | "custom";
  enabled: boolean;
  additionalDays: number;
  freeAbove: number | null;
  stateRules: Record<string, ShippingStateRule>;
  regionRules: Record<string, ShippingStateRule>;
  defaultRule: ShippingStateRule | null;
}

export type ShippingCalcMode = "manual" | "table" | "hybrid" | "api";

export interface ShippingFieldMapping {
  /** Path to the array of options in the JSON (e.g. "data.cotacoes", "" for root array) */
  optionsPath: string;
  /** Field name for carrier/service name */
  carrierName: string;
  /** Field name for price */
  price: string;
  /** Field name for delivery days */
  deliveryDays: string;
  /** Field name for carrier ID (optional) */
  carrierId?: string;
  /** Field name for error flag (to skip errored entries) */
  errorField?: string;
}

export interface ShippingApiConfig {
  provider: "melhor_envio" | "frenet" | "sisfrete" | "custom";
  apiUrl: string;
  apiToken: string;
  enabled: boolean;
  /** HTTP method for custom APIs (default POST) */
  httpMethod?: "GET" | "POST";
  /** Custom request body template as JSON string with {{originCep}}, {{destCep}}, {{weight}} placeholders */
  requestBodyTemplate?: string;
  /** Custom field mapping for parsing API responses */
  fieldMapping?: ShippingFieldMapping | null;
  /** Sample JSON pasted by user for reference */
  sampleJson?: string;
  /** SisFrete cotacao mode: 'json' (REST POST, default) or 'xml_ws' (Web Service GET/XML) */
  sisfreteMode?: "json" | "xml_ws";
}

export interface ShippingConfig {
  originCep: string;
  originCity: string;
  originState: string;
  freeShippingMinValue: number | null;
  defaultWeight: number;
  carriers: ShippingCarrier[];
  calcMode?: ShippingCalcMode;
  apiConfig?: ShippingApiConfig | null;
  updatedAt?: number;
}

export interface ShippingOption {
  carrierId: string;
  carrierName: string;
  carrierType: string;
  price: number;
  deliveryDays: number;
  deliveryText: string;
  free: boolean;
  freeReason?: string;
  source?: "manual" | "table" | "api";
  /** SisFrete quotation ID — flows from cotacao to pedido to romaneio to NF */
  sisfreteQuoteId?: string;
}

export interface ShippingCalcResponse {
  options: ShippingOption[];
  destination: { uf: string; localidade: string; logradouro?: string; bairro?: string };
  destUf: string;
  destRegion: string;
  totalWeight: number;
  calcMode?: ShippingCalcMode;
  message?: string;
  error?: string;
  _enrichment?: Array<{
    sku: string;
    qty: number;
    source: string;
    weight: number;
    length: number;
    width: number;
    height: number;
    rawFields: Record<string, any> | null;
  }>;
}

export interface CepInfo {
  uf: string;
  localidade: string;
  logradouro?: string;
  bairro?: string;
  error?: string;
}

// ── Freight Tables ──

export interface ShippingTableRow {
  cepInicio: string;
  cepFim: string;
  pesoMin: number;
  pesoMax: number;
  valor: number;
  prazo: number;
}

export interface ShippingTableMeta {
  id: string;
  name: string;
  carrierName: string;
  carrierType: string;
  rowCount: number;
  createdAt: number;
}

export interface ShippingTableFull extends ShippingTableMeta {
  rows: ShippingTableRow[];
}

export const getShippingConfig = (accessToken: string) =>
  request<ShippingConfig>("/shipping/config", {
    headers: { "X-User-Token": accessToken },
  });

export const saveShippingConfig = (accessToken: string, config: ShippingConfig) =>
  request<ShippingConfig>("/shipping/config", {
    method: "PUT",
    body: JSON.stringify(config),
    headers: { "X-User-Token": accessToken },
  });

export const calculateShipping = (
  cep: string,
  items: Array<{ sku: string; quantity: number }>,
  totalValue: number
) =>
  request<ShippingCalcResponse>("/shipping/calculate", {
    method: "POST",
    body: JSON.stringify({ cep, items, totalValue }),
  });

export const lookupCep = (cep: string) =>
  request<CepInfo>(`/shipping/cep/${cep.replace(/\D/g, "")}`);

// Test external shipping API (admin debug)
export interface ShippingTestStep {
  step: string;
  status: "ok" | "warn" | "error";
  detail: string;
  ms?: number;
}

export interface ShippingTestResult {
  ok: boolean;
  steps: ShippingTestStep[];
  parsedOptions: Array<{
    carrierId: string;
    carrierName: string;
    price: number;
    deliveryDays: number;
    deliveryText: string;
    source: string;
  }>;
  rawOptionsCount?: number;
  parseErrors?: string[];
  rawResponse?: any;
  rawText?: string;
  requestMethod?: string;
  requestUrl?: string;
  requestPayload?: any;
  timing?: { totalMs: number; fetchMs?: number };
  fieldMapping?: any;
}

export const testShippingApi = (
  accessToken: string,
  destCep: string,
  weight?: number
) =>
  request<ShippingTestResult>("/shipping/test-api", {
    method: "POST",
    body: JSON.stringify({ destCep, weight }),
    headers: { "X-User-Token": accessToken },
  });

// Debug product physical data from SIGE (admin)
export const debugProductPhysical = (accessToken: string, sku: string) =>
  request<any>("/shipping/debug-product/" + encodeURIComponent(sku), {
    headers: { "X-User-Token": accessToken },
  });

// Product physical data (weight/dimensions) - used for shipping enrichment
export interface ProductPhysicalData {
  weight: number;
  length: number;
  width: number;
  height: number;
  updatedAt?: number;
  updatedBy?: string;
}

export interface ProductPhysicalResponse {
  sku: string;
  saved: ProductPhysicalData | null;
  sige: {
    found: boolean;
    weight: number;
    length: number;
    width: number;
    height: number;
    matchedFields: Record<string, any>;
    weightCandidates: Record<string, any>;
    dimCandidates: Record<string, any>;
    allFields: Record<string, any>;
  };
  attrs: { length: number; width: number; height: number };
  rawAttrs: Record<string, any> | null;
}

export const getProductPhysical = (accessToken: string, sku: string) =>
  request<ProductPhysicalResponse>("/produtos/physical/" + encodeURIComponent(sku), {
    headers: { "X-User-Token": accessToken },
  });

export const saveProductPhysical = (accessToken: string, sku: string, data: { weight: number; length: number; width: number; height: number }) =>
  request<{ ok: boolean; data: ProductPhysicalData }>("/produtos/physical/" + encodeURIComponent(sku), {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const deleteProductPhysical = (accessToken: string, sku: string) =>
  request<{ ok: boolean }>("/produtos/physical/" + encodeURIComponent(sku), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// Freight table CRUD
export const uploadShippingTable = (
  accessToken: string,
  data: { name: string; carrierName: string; carrierType: string; rows: ShippingTableRow[] }
) =>
  request<ShippingTableMeta>("/shipping/tables", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const getShippingTables = (accessToken: string) =>
  request<{ tables: ShippingTableMeta[] }>("/shipping/tables", {
    headers: { "X-User-Token": accessToken },
  });

export const getShippingTable = (accessToken: string, tableId: string) =>
  request<ShippingTableFull>(`/shipping/tables/${tableId}`, {
    headers: { "X-User-Token": accessToken },
  });

export const deleteShippingTable = (accessToken: string, tableId: string) =>
  request<{ ok: boolean }>(`/shipping/tables/${tableId}`, {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── Mercado Pago ───

// Public: check if Mercado Pago is enabled for checkout (no auth required)
export const checkMPEnabled = () =>
  request<{ enabled: boolean; sandbox: boolean }>("/mercadopago/enabled");

export interface MercadoPagoConfig {
  configured: boolean;
  hasAccessToken?: boolean;
  hasPublicKey?: boolean;
  accessTokenPreview?: string | null;
  publicKeyPreview?: string | null;
  sandbox?: boolean;
  updatedAt?: number | null;
}

export const getMercadoPagoConfig = (accessToken: string) =>
  request<MercadoPagoConfig>("/mercadopago/config", {
    headers: { "X-User-Token": accessToken },
  });

export const saveMercadoPagoConfig = (
  accessToken: string,
  config: { accessToken: string; publicKey: string; sandbox: boolean }
) =>
  request<{ success: boolean; configured: boolean }>("/mercadopago/config", {
    method: "PUT",
    body: JSON.stringify(config),
    headers: { "X-User-Token": accessToken },
  });

export const deleteMercadoPagoConfig = (accessToken: string) =>
  request<{ success: boolean; configured: boolean }>("/mercadopago/config", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

export const testMercadoPagoConnection = (accessToken: string) =>
  request<{
    success: boolean;
    error?: string;
    detail?: string;
    user?: {
      id: number;
      nickname: string;
      email: string;
      siteId: string;
      countryId: string;
    };
  }>("/mercadopago/test", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

export interface MPPayment {
  id: number;
  status: string;
  status_detail: string;
  payment_type: string;
  payment_method: string;
  external_reference: string;
  transaction_amount: number;
  currency_id: string;
  date_created: string;
  date_approved: string | null;
  description: string;
  payer_email: string;
  payer_name: string;
}

export const searchMPPayments = (
  accessToken: string,
  filters?: { status?: string; external_reference?: string; limit?: number; offset?: number }
) =>
  request<{ payments: MPPayment[]; total: number; limit: number; offset: number }>(
    "/mercadopago/search-payments",
    {
      method: "POST",
      body: JSON.stringify(filters || {}),
      headers: { "X-User-Token": accessToken },
    }
  );

export const getMPPaymentStatus = (payment_id: string | number) =>
  request<{
    payment_id: number;
    status: string;
    status_detail: string;
    payment_type: string;
    payment_method: string;
    external_reference: string;
    transaction_amount: number;
    currency_id: string;
    date_created: string;
    date_approved: string | null;
    payer: any;
  }>("/mercadopago/payment-status", {
    method: "POST",
    body: JSON.stringify({ payment_id }),
  });

export interface MPCreatePreferencePayload {
  order_id: string;
  payer_email: string;
  payer_name: string;
  items: Array<{
    item_id: string;
    description: string;
    quantity: number;
    unit_price: number;
  }>;
  shipping_cost?: number;
  back_urls?: {
    success: string;
    failure: string;
    pending: string;
  };
}

export const createMPPreference = (payload: MPCreatePreferencePayload) =>
  request<{
    success: boolean;
    preferenceId: string;
    initPoint: string;
    sandboxInitPoint: string;
    externalReference: string;
    error?: string;
    detail?: string;
  }>("/mercadopago/create-preference", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getMPTransactions = (accessToken: string) =>
  request<{ transactions: any[] }>("/mercadopago/transactions", {
    headers: { "X-User-Token": accessToken },
  });

// ─── Super Promo ───

export interface SuperPromoProduct {
  sku: string;
  titulo: string;
  promoPrice: number | null;
  originalPrice?: number | null;
  /** Per-product discount override — if set, overrides the global promo discount */
  customDiscountType?: "percentage" | "fixed" | null;
  customDiscountValue?: number | null;
}

export interface SuperPromo {
  id: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  startDate: number;
  endDate: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  bgColor: string;
  products: SuperPromoProduct[];
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Compute effective promo price for a product.
 * Priority: 1) direct promoPrice override, 2) custom per-product discount, 3) global promo discount.
 */
export function computePromoPrice(
  originalPrice: number,
  promo: { discountType: "percentage" | "fixed"; discountValue: number },
  product: SuperPromoProduct
): { promoPrice: number; discountLabel: string } {
  // Priority 1: Direct promoPrice override
  if (product.promoPrice != null && product.promoPrice > 0) {
    var pct = originalPrice > 0 ? Math.round((1 - product.promoPrice / originalPrice) * 100) : 0;
    return {
      promoPrice: product.promoPrice,
      discountLabel: pct > 0 ? pct + "% OFF" : "Preco fixo",
    };
  }

  // Determine effective discount (custom per-product or global)
  var dType = (product.customDiscountType) ? product.customDiscountType : promo.discountType;
  var dValue = (product.customDiscountValue != null && product.customDiscountValue > 0) ? product.customDiscountValue : promo.discountValue;

  var promoResult: number;
  if (dType === "percentage") {
    promoResult = originalPrice * (1 - dValue / 100);
  } else {
    promoResult = Math.max(0, originalPrice - dValue);
  }

  var discountLabel = dType === "percentage"
    ? dValue + "% OFF"
    : "-R$ " + dValue.toFixed(2).replace(".", ",");

  return { promoPrice: promoResult, discountLabel: discountLabel };
}

/** Public — get the currently active promo (if any) */
export const getActivePromo = () =>
  request<{ promo: SuperPromo | null }>("/promo/active");

/** Admin — get full promo config */
export const getAdminPromo = (accessToken: string) =>
  request<{ promo: SuperPromo | null }>("/admin/promo", {
    headers: { "X-User-Token": accessToken },
  });

/** Admin — save promo config */
export const saveAdminPromo = (accessToken: string, promo: Partial<SuperPromo>) =>
  request<{ promo: SuperPromo }>("/admin/promo", {
    method: "POST",
    body: JSON.stringify(promo),
    headers: { "X-User-Token": accessToken },
  });

/** Admin — delete promo */
export const deleteAdminPromo = (accessToken: string) =>
  request<{ deleted: boolean }>("/admin/promo", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── Homepage Category Showcase ───

export interface HomepageCategoryCard {
  id: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  imageUrl: string;
  filename?: string;
  order: number;
  active: boolean;
  contentType?: string;
  fileSize?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Public: get active homepage category cards */
export const getHomepageCategories = () =>
  request<{ categories: HomepageCategoryCard[] }>("/homepage-categories");

/** Admin: create a homepage category card with image upload */
export const createHomepageCategory = async (
  file: File,
  data: { name: string; categorySlug: string; categoryName: string; order: number; active: boolean },
  accessToken: string
): Promise<{ created: boolean; card: HomepageCategoryCard }> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", data.name);
  formData.append("categorySlug", data.categorySlug);
  formData.append("categoryName", data.categoryName);
  formData.append("order", String(data.order));
  formData.append("active", String(data.active));

  const res = await fetch(_authUrl("/admin/homepage-categories", accessToken), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
    body: formData,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "HTTP " + res.status);
  return body;
};

/** Admin: update a homepage category card (optionally replace image) */
export const updateHomepageCategory = async (
  id: string,
  data: { name?: string; categorySlug?: string; categoryName?: string; order?: number; active?: boolean },
  accessToken: string,
  file?: File | null
): Promise<{ updated: boolean; card: HomepageCategoryCard }> => {
  if (file) {
    const formData = new FormData();
    formData.append("file", file);
    if (data.name !== undefined) formData.append("name", data.name);
    if (data.categorySlug !== undefined) formData.append("categorySlug", data.categorySlug);
    if (data.categoryName !== undefined) formData.append("categoryName", data.categoryName);
    if (data.order !== undefined) formData.append("order", String(data.order));
    if (data.active !== undefined) formData.append("active", String(data.active));

    const res = await fetch(_authUrl("/admin/homepage-categories/" + id, accessToken), {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + publicAnonKey,
      },
      body: formData,
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || "HTTP " + res.status);
    return body;
  } else {
    return request<{ updated: boolean; card: HomepageCategoryCard }>(
      "/admin/homepage-categories/" + id,
      {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "X-User-Token": accessToken },
      }
    );
  }
};

/** Admin: delete a homepage category card */
export const deleteHomepageCategory = (id: string, accessToken: string) =>
  request<{ deleted: boolean }>("/admin/homepage-categories/" + id, {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── Mid-Page Banners (4 banner slots: 3&4 after promo, 1&2 after products) ───

export interface MidBanner {
  slot: number;
  imageUrl?: string | null;
  filename?: string | null;
  link?: string;
  active: boolean;
  updatedAt?: number;
}

/** Admin: list all 4 mid-page banner slots */
export const getMidBanners = (accessToken: string) =>
  request<{ banners: MidBanner[] }>("/admin/mid-banners", {
    headers: { "X-User-Token": accessToken },
  });

/** Admin: upload/update a mid-page banner (slot 1-4) */
export const saveMidBanner = async (
  slot: number,
  formData: FormData,
  accessToken: string
): Promise<{ banner: MidBanner }> => {
  const res = await fetch(_authUrl("/admin/mid-banners/" + slot, accessToken), {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "HTTP " + res.status);
  return data;
};

/** Admin: delete a mid-page banner */
export const deleteMidBanner = (slot: number, accessToken: string) =>
  request<{ deleted: boolean }>("/admin/mid-banners/" + slot, {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── Footer Badges (Payment, Shipping, Reclame Aqui logos) ───

export interface FooterBadge {
  key: string;
  category: "payment" | "shipping" | "reclameaqui";
  imageUrl?: string | null;
  filename?: string | null;
  link?: string;
  alt?: string;
  active: boolean;
  updatedAt?: number;
}

/** Admin: list all footer badges */
export const getFooterBadges = (accessToken: string) =>
  request<{ badges: FooterBadge[] }>("/admin/footer-badges", {
    headers: { "X-User-Token": accessToken },
  });

/** Admin: upload/update a footer badge */
export const saveFooterBadge = async (
  key: string,
  formData: FormData,
  accessToken: string
): Promise<{ badge: FooterBadge }> => {
  const res = await fetch(_authUrl("/admin/footer-badges/" + key, accessToken), {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "HTTP " + res.status);
  return data;
};

/** Admin: delete a footer badge */
export const deleteFooterBadge = (key: string, accessToken: string) =>
  request<{ deleted: boolean }>("/admin/footer-badges/" + key, {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── Homepage Init (Combined endpoint — 1 call instead of 7+) ───

// ─── Brands (Marcas) ───

export interface BrandItem {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  filename?: string;
  bgColor: string;
  logoZoom?: number;
  products: Array<{ sku: string; titulo: string }>;
  order: number;
  active: boolean;
  contentType?: string;
  fileSize?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Public: get active brands */
export const getBrands = () =>
  request<{ brands: BrandItem[] }>("/brands");

/** Public: get brand by slug */
export const getBrandBySlug = (slug: string) =>
  request<{ brand: BrandItem }>("/brands/" + encodeURIComponent(slug));

/** Admin: create a brand with logo upload */
export const createBrand = async (
  file: File,
  data: { name: string; slug: string; bgColor: string; order: number; active: boolean; products: Array<{ sku: string; titulo: string }>; logoZoom?: number },
  accessToken: string
): Promise<{ created: boolean; brand: BrandItem }> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", data.name);
  formData.append("slug", data.slug);
  formData.append("bgColor", data.bgColor);
  formData.append("order", String(data.order));
  formData.append("active", String(data.active));
  formData.append("products", JSON.stringify(data.products));
  if (data.logoZoom !== undefined) formData.append("logoZoom", String(data.logoZoom));

  const res = await fetch(_authUrl("/admin/brands", accessToken), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + publicAnonKey,
    },
    body: formData,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "HTTP " + res.status);
  return body;
};

/** Admin: update a brand (optionally replace logo) */
export const updateBrand = async (
  id: string,
  data: { name?: string; slug?: string; bgColor?: string; order?: number; active?: boolean; products?: Array<{ sku: string; titulo: string }>; logoZoom?: number },
  accessToken: string,
  file?: File | null
): Promise<{ updated: boolean; brand: BrandItem }> => {
  if (file) {
    const formData = new FormData();
    formData.append("file", file);
    if (data.name !== undefined) formData.append("name", data.name);
    if (data.slug !== undefined) formData.append("slug", data.slug);
    if (data.bgColor !== undefined) formData.append("bgColor", data.bgColor);
    if (data.order !== undefined) formData.append("order", String(data.order));
    if (data.active !== undefined) formData.append("active", String(data.active));
    if (data.products !== undefined) formData.append("products", JSON.stringify(data.products));
    if (data.logoZoom !== undefined) formData.append("logoZoom", String(data.logoZoom));

    const res = await fetch(_authUrl("/admin/brands/" + id, accessToken), {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + publicAnonKey,
      },
      body: formData,
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || "HTTP " + res.status);
    return body;
  } else {
    return request<{ updated: boolean; brand: BrandItem }>(
      "/admin/brands/" + id,
      {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "X-User-Token": accessToken },
      }
    );
  }
};

/** Admin: delete a brand */
export const deleteBrand = (id: string, accessToken: string) =>
  request<{ deleted: boolean }>("/admin/brands/" + id, {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

export interface HomepageInitData {
  banners: BannerItem[];
  logo: { hasLogo: boolean; url: string | null };
  footerLogo: { hasLogo: boolean; url: string | null };
  ga4Config: GA4Config;
  categoryTree: CategoryNode[];
  categoryCounts?: Record<string, number>;
  promo: SuperPromo | null;
  priceConfig: PriceConfig;
  homepageCategories?: HomepageCategoryCard[];
  midBanners?: MidBanner[];
  footerBadges?: FooterBadge[];
  brands?: BrandItem[];
}

/** Fetches all homepage data in a single API call */
export const getHomepageInit = () =>
  request<HomepageInitData>("/homepage-init");

// ─── Email Marketing ───

export interface EmktSubscriber {
  id: string;
  email: string;
  name: string;
  tags: string[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EmktTemplate {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  createdAt: number;
  updatedAt: number;
}

export interface EmktCampaign {
  id: string;
  name: string;
  subject: string;
  templateId: string | null;
  htmlBody: string;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  targetTags: string[];
  status: "draft" | "sending" | "sent";
  totalSent: number;
  totalFailed: number;
  sentAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface EmktSendLog {
  id: string;
  campaignId: string;
  campaignName: string;
  subject: string;
  totalRecipients: number;
  totalSent: number;
  totalFailed: number;
  errors: string[];
  sentAt: number;
}

export interface EmktConfig {
  smtpConfigured: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpHasPassword: boolean;
  smtpSecure: boolean;
  defaultSenderName: string;
  defaultSenderEmail: string;
  defaultReplyTo: string;
}

// Subscribers
export const getEmktSubscribers = (accessToken: string) =>
  request<{ subscribers: EmktSubscriber[]; total: number }>("/admin/email-marketing/subscribers", {
    headers: { "X-User-Token": accessToken },
  });

export const addEmktSubscriber = (accessToken: string, data: { email: string; name: string; tags?: string[] }) =>
  request<{ ok: boolean; subscriber: EmktSubscriber }>("/admin/email-marketing/subscribers", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const importEmktSubscribers = (accessToken: string, subscribers: Array<{ email: string; name?: string; tags?: string[] }>) =>
  request<{ ok: boolean; imported: number; skipped: number; total: number }>("/admin/email-marketing/subscribers/import", {
    method: "POST",
    body: JSON.stringify({ subscribers }),
    headers: { "X-User-Token": accessToken },
  });

export const updateEmktSubscriber = (accessToken: string, id: string, data: Partial<EmktSubscriber>) =>
  request<{ ok: boolean; subscriber: EmktSubscriber }>("/admin/email-marketing/subscribers/" + encodeURIComponent(id), {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const deleteEmktSubscriber = (accessToken: string, id: string) =>
  request<{ ok: boolean; deleted: string }>("/admin/email-marketing/subscribers/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// Templates
export const getEmktTemplates = (accessToken: string) =>
  request<{ templates: EmktTemplate[] }>("/admin/email-marketing/templates", {
    headers: { "X-User-Token": accessToken },
  });

export const createEmktTemplate = (accessToken: string, data: { name: string; subject: string; htmlBody: string }) =>
  request<{ ok: boolean; template: EmktTemplate }>("/admin/email-marketing/templates", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const updateEmktTemplate = (accessToken: string, id: string, data: Partial<EmktTemplate>) =>
  request<{ ok: boolean; template: EmktTemplate }>("/admin/email-marketing/templates/" + encodeURIComponent(id), {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const deleteEmktTemplate = (accessToken: string, id: string) =>
  request<{ ok: boolean; deleted: string }>("/admin/email-marketing/templates/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// Campaigns
export const getEmktCampaigns = (accessToken: string) =>
  request<{ campaigns: EmktCampaign[] }>("/admin/email-marketing/campaigns", {
    headers: { "X-User-Token": accessToken },
  });

export const createEmktCampaign = (accessToken: string, data: Partial<EmktCampaign>) =>
  request<{ ok: boolean; campaign: EmktCampaign }>("/admin/email-marketing/campaigns", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const updateEmktCampaign = (accessToken: string, id: string, data: Partial<EmktCampaign>) =>
  request<{ ok: boolean; campaign: EmktCampaign }>("/admin/email-marketing/campaigns/" + encodeURIComponent(id), {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const deleteEmktCampaign = (accessToken: string, id: string) =>
  request<{ ok: boolean; deleted: string }>("/admin/email-marketing/campaigns/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

export const sendEmktTestEmail = (accessToken: string, campaignId: string, testEmail: string) =>
  request<{ ok: boolean; testEmail: string; messageId: string | null }>("/admin/email-marketing/campaigns/" + encodeURIComponent(campaignId) + "/test", {
    method: "POST",
    body: JSON.stringify({ testEmail }),
    headers: { "X-User-Token": accessToken },
  });

export const sendEmktCampaign = (accessToken: string, campaignId: string) =>
  request<{ ok: boolean; totalSent: number; totalFailed: number; totalRecipients: number; errors: string[] }>("/admin/email-marketing/campaigns/" + encodeURIComponent(campaignId) + "/send", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

export const duplicateEmktCampaign = (accessToken: string, campaignId: string) =>
  request<{ ok: boolean; campaign: EmktCampaign }>("/admin/email-marketing/campaigns/" + encodeURIComponent(campaignId) + "/duplicate", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

// Send logs
export const getEmktSendLogs = (accessToken: string) =>
  request<{ logs: EmktSendLog[] }>("/admin/email-marketing/send-logs", {
    headers: { "X-User-Token": accessToken },
  });

export const deleteEmktSendLog = (accessToken: string, id: string) =>
  request<{ ok: boolean; deleted: string }>("/admin/email-marketing/send-logs/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// Config
export const getEmktConfig = (accessToken: string) =>
  request<EmktConfig>("/admin/email-marketing/config", {
    headers: { "X-User-Token": accessToken },
  });

export const updateEmktConfig = (accessToken: string, data: {
  smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; smtpSecure?: boolean;
  defaultSenderName?: string; defaultSenderEmail?: string; defaultReplyTo?: string;
}) =>
  request<{ ok: boolean; config: any }>("/admin/email-marketing/config", {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const testSmtpConnection = (accessToken: string, data: {
  smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; smtpSecure: boolean;
}) =>
  request<{ ok: boolean; message: string }>("/admin/email-marketing/smtp-test", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

// ─── Admin Dashboard ───

export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  totalProducts: number;
  activeProducts: number;
  totalClients: number;
  totalCoupons: number;
  statusCounts: Record<string, number>;
  recentOrders: Array<{
    localOrderId: string;
    total: number;
    status: string;
    paymentMethod: string;
    createdAt: string;
    itemCount: number;
    userName: string;
  }>;
  chartData: Array<{
    month: string;
    orders: number;
    revenue: number;
  }>;
}

export const getDashboardStats = (accessToken: string) =>
  request<DashboardStats>("/admin/dashboard-stats", {
    headers: { "X-User-Token": accessToken },
  });

// ─── Admin Pending Counts (sidebar badges) ───

export interface AdminPendingCounts {
  orders: { paid: number; awaiting: number; total: number };
  reviews: number;
  lgpd: number;
}

export const getAdminPendingCounts = (accessToken: string) =>
  request<AdminPendingCounts>("/admin/pending-counts", {
    headers: { "X-User-Token": accessToken },
  });

// ─── Cupons de Desconto ───

export interface Coupon {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderValue: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: number;
  updatedAt: number;
}

export const getAdminCoupons = (accessToken: string) =>
  request<{ coupons: Coupon[] }>("/admin/coupons", {
    headers: { "X-User-Token": accessToken },
  });

export const createCoupon = (accessToken: string, data: Partial<Coupon>) =>
  request<{ ok: boolean; coupon: Coupon }>("/admin/coupons", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const updateCoupon = (accessToken: string, code: string, data: Partial<Coupon>) =>
  request<{ ok: boolean; coupon: Coupon }>("/admin/coupons/" + encodeURIComponent(code), {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const deleteCoupon = (accessToken: string, code: string) =>
  request<{ ok: boolean; deleted: string }>("/admin/coupons/" + encodeURIComponent(code), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

export const validateCoupon = (code: string, orderTotal: number) =>
  request<{
    valid: boolean;
    code?: string;
    discountType?: "percentage" | "fixed";
    discountValue?: number;
    discountAmount?: number;
    description?: string;
    error?: string;
  }>("/coupons/validate", {
    method: "POST",
    body: JSON.stringify({ code, orderTotal }),
  });

export const useCoupon = (code: string) =>
  request<{ ok: boolean; usedCount?: number }>("/coupons/use", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

// ─── LGPD — Exercicio de Direitos ───

export interface LgpdRequest {
  id: string;
  fullName: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  requestType: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "rejected";
  adminNotes: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export const submitLgpdRequest = (data: {
  fullName: string;
  email: string;
  cpf?: string;
  phone?: string;
  requestType: string;
  description: string;
}) =>
  request<{ ok: boolean; requestId: string; message: string }>("/lgpd/request", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const checkLgpdRequestStatus = (id: string, email: string) =>
  request<{
    ok: boolean;
    request: {
      id: string;
      requestType: string;
      status: string;
      createdAt: number;
      resolvedAt: number | null;
    };
  }>("/lgpd/request/status?id=" + encodeURIComponent(id) + "&email=" + encodeURIComponent(email));

export const getAdminLgpdRequests = (accessToken: string) =>
  request<{ requests: LgpdRequest[]; total: number }>("/admin/lgpd-requests", {
    headers: { "X-User-Token": accessToken },
  });

export const updateLgpdRequest = (accessToken: string, id: string, data: { status?: string; adminNotes?: string }) =>
  request<{ ok: boolean; request: LgpdRequest }>("/admin/lgpd-requests/" + encodeURIComponent(id), {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const deleteLgpdRequest = (accessToken: string, id: string) =>
  request<{ ok: boolean; deleted: string }>("/admin/lgpd-requests/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── Auto-Categorização (Admin) ───

export interface AutoCategData {
  products: Array<{ sku: string; titulo: string }>;
  metas: Record<string, { category?: string; visible?: boolean }>;
  categoryTree: CategoryNode[];
  attributes: Record<string, Record<string, string | string[]>>;
}

export const getAutoCategData = (accessToken: string) =>
  request<AutoCategData>("/admin/auto-categorize-data", {
    headers: { "X-User-Token": accessToken },
  });

export const applyAutoCateg = (
  accessToken: string,
  assignments: Array<{ sku: string; category: string }>
) =>
  request<{ applied: number; total: number; errors: string[] }>(
    "/admin/auto-categorize-apply",
    {
      method: "POST",
      body: JSON.stringify({ assignments }),
      headers: { "X-User-Token": accessToken },
    }
  );

// ─── Product Reviews ───

export interface ReviewImage {
  path: string;
  signedUrl: string;
  status: "pending" | "approved" | "rejected";
}

export interface Review {
  id: string;
  sku: string;
  userId?: string;
  userName: string;
  userEmail?: string;
  rating: number;
  title: string;
  comment: string;
  images: ReviewImage[];
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  updatedAt?: number;
  moderatedAt?: number | null;
  moderatedBy?: string | null;
  moderationNote?: string | null;
  helpful: number;
  verified: boolean;
}

export interface ReviewSummary {
  sku: string;
  averageRating: number;
  totalReviews: number;
  distribution: Record<number, number>;
}

export const getProductReviews = (sku: string) =>
  request<{ reviews: Review[]; total: number; sku: string }>(
    "/reviews/" + encodeURIComponent(sku)
  );

export const getReviewSummary = (sku: string) =>
  request<ReviewSummary>(
    "/reviews/" + encodeURIComponent(sku) + "/summary"
  );

export const getReviewSummariesBatch = (skus: string[], opts?: { signal?: AbortSignal }) =>
  request<{ summaries: Record<string, { averageRating: number; totalReviews: number }> }>(
    "/reviews/summaries-batch",
    { method: "POST", body: JSON.stringify({ skus }), signal: opts?.signal }
  );

export const checkMyReview = (sku: string, accessToken: string) =>
  request<{ hasReview: boolean; review: { id: string; rating: number; title: string; comment: string; status: string; createdAt: number } | null; hasPurchased: boolean }>(
    "/reviews/" + encodeURIComponent(sku) + "/mine",
    { headers: { "X-User-Token": accessToken } }
  );

export const submitReview = (
  accessToken: string,
  data: { sku: string; rating: number; title: string; comment: string }
) =>
  request<{ ok: boolean; reviewId: string; status: string }>("/reviews", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const uploadReviewImage = async (
  reviewId: string,
  file: File,
  accessToken: string
) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(
    _authUrl("/reviews/" + encodeURIComponent(reviewId) + "/images", accessToken),
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + publicAnonKey,
      },
      body: formData,
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "HTTP " + res.status);
  return data as { ok: boolean; path: string; imageIndex: number };
};

export const markReviewHelpful = (reviewId: string) =>
  request<{ ok: boolean; helpful: number }>(
    "/reviews/" + encodeURIComponent(reviewId) + "/helpful",
    { method: "POST" }
  );

export const getUserReviews = (accessToken: string) =>
  request<{ reviews: Review[]; total: number }>("/reviews/user/mine", {
    headers: { "X-User-Token": accessToken },
  });

// ─── Admin Reviews (Moderation) ───

export const getAdminReviews = (accessToken: string, status?: string) => {
  var qs = status && status !== "all" ? "?status=" + status : "";
  return request<{ reviews: Review[]; total: number }>("/admin/reviews" + qs, {
    headers: { "X-User-Token": accessToken },
  });
};

export const getAdminReviewStats = (accessToken: string) =>
  request<{ pending: number; approved: number; rejected: number; total: number; totalImages: number; pendingImages: number }>(
    "/admin/reviews/stats",
    { headers: { "X-User-Token": accessToken } }
  );

export const moderateReview = (
  accessToken: string,
  reviewId: string,
  data: { action: "approve" | "reject"; note?: string; imageActions?: Record<string, string> }
) =>
  request<{ ok: boolean; reviewId: string; status: string }>(
    "/admin/reviews/" + encodeURIComponent(reviewId) + "/moderate",
    {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { "X-User-Token": accessToken },
    }
  );

export const deleteReview = (accessToken: string, reviewId: string) =>
  request<{ ok: boolean; deleted: string }>(
    "/admin/reviews/" + encodeURIComponent(reviewId),
    {
      method: "DELETE",
      headers: { "X-User-Token": accessToken },
    }
  );

// ─── Garantia Estendida (Extended Warranty) ───

export interface WarrantyPlan {
  id: string;
  name: string;
  description: string;
  durationMonths: number;
  priceType: "percentage" | "fixed";
  priceValue: number;
  active: boolean;
  skus: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WarrantyPlanPublic {
  id: string;
  name: string;
  description: string;
  durationMonths: number;
  priceType: "percentage" | "fixed";
  priceValue: number;
}

export const getAdminWarrantyPlans = (accessToken: string) =>
  request<{ plans: WarrantyPlan[] }>("/admin/warranty/plans", {
    headers: { "X-User-Token": accessToken },
  });

export const createWarrantyPlan = (accessToken: string, data: Partial<WarrantyPlan>) =>
  request<{ ok: boolean; plan: WarrantyPlan }>("/admin/warranty/plans", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const updateWarrantyPlan = (accessToken: string, id: string, data: Partial<WarrantyPlan>) =>
  request<{ ok: boolean; plan: WarrantyPlan }>("/admin/warranty/plans/" + encodeURIComponent(id), {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const deleteWarrantyPlan = (accessToken: string, id: string) =>
  request<{ ok: boolean; deleted: string }>("/admin/warranty/plans/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

export const updateWarrantyPlanSkus = (accessToken: string, id: string, skus: string[]) =>
  request<{ ok: boolean; plan: WarrantyPlan }>("/admin/warranty/plans/" + encodeURIComponent(id) + "/skus", {
    method: "PUT",
    body: JSON.stringify({ skus }),
    headers: { "X-User-Token": accessToken },
  });

export const getProductWarrantyPlans = (sku: string) =>
  request<{ plans: WarrantyPlanPublic[] }>("/warranty/product/" + encodeURIComponent(sku));

// ─── Sistema de Afiliados ───

export interface Affiliate {
  userId: string;
  email: string;
  name: string;
  phone: string;
  socialMedia: string;
  pixKey: string;
  motivation: string;
  code: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  rejectionReason?: string;
  totalClicks: number;
  totalConversions: number;
  totalCommission: number;
  totalPaid: number;
  createdAt: number;
  updatedAt: number;
}

export interface AffiliateCommission {
  affiliateId: string;
  affiliateCode: string;
  affiliateName: string;
  orderId: string;
  orderTotal: number;
  commissionPercent: number;
  commissionValue: number;
  buyerUserId: string;
  buyerEmail: string;
  status: "pending" | "approved" | "paid" | "rejected";
  createdAt: number;
  updatedAt?: number;
  updatedBy?: string;
}

export interface AffiliateConfig {
  commissionPercent: number;
  minPayout: number;
  cookieDays: number;
  enabled: boolean;
}

// Public / Authenticated
export const affiliateRegister = (accessToken: string, data: { name: string; phone: string; socialMedia: string; pixKey: string; motivation: string }) =>
  request<{ ok: boolean; affiliate: Affiliate }>("/affiliate/register", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const affiliateGetProfile = (accessToken: string) =>
  request<{ affiliate: Affiliate | null }>("/affiliate/profile", {
    headers: { "X-User-Token": accessToken },
  });

export const affiliateUpdateProfile = (accessToken: string, data: { phone?: string; socialMedia?: string; pixKey?: string }) =>
  request<{ ok: boolean; affiliate: Affiliate }>("/affiliate/profile", {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const affiliateGetDashboard = (accessToken: string) =>
  request<{
    affiliate: Affiliate;
    stats: {
      totalClicks: number;
      totalConversions: number;
      totalCommission: number;
      totalPaid: number;
      pendingCommission: number;
      approvedCommission: number;
      conversionRate: number;
    };
    commissions: AffiliateCommission[];
    config: { commissionPercent: number; minPayout: number; cookieDays: number };
  }>("/affiliate/dashboard", {
    headers: { "X-User-Token": accessToken },
  });

export const affiliateTrackClick = (code: string) =>
  request<{ ok: boolean }>("/affiliate/track-click", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const affiliateTrackSale = (accessToken: string, data: { affiliateCode: string; orderId: string; orderTotal: number; buyerEmail: string }) =>
  request<{ ok: boolean; commission?: AffiliateCommission; reason?: string }>("/affiliate/track-sale", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// Admin
export const adminGetAffiliates = (accessToken: string) =>
  request<{ affiliates: Affiliate[]; total: number; config: AffiliateConfig }>("/admin/affiliates", {
    headers: { "X-User-Token": accessToken },
  });

export const adminUpdateAffiliateStatus = (accessToken: string, id: string, data: { status: string; rejectionReason?: string }) =>
  request<{ ok: boolean; affiliate: Affiliate }>("/admin/affiliate/" + encodeURIComponent(id) + "/status", {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const adminGetAffiliateConfig = (accessToken: string) =>
  request<{ config: AffiliateConfig }>("/admin/affiliate-config", {
    headers: { "X-User-Token": accessToken },
  });

export const adminUpdateAffiliateConfig = (accessToken: string, data: Partial<AffiliateConfig>) =>
  request<{ ok: boolean; config: AffiliateConfig }>("/admin/affiliate-config", {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const adminUpdateAffiliateCommission = (accessToken: string, affId: string, orderId: string, data: { status: string }) =>
  request<{ ok: boolean; commission: AffiliateCommission }>("/admin/affiliate-commission/" + encodeURIComponent(affId) + "/" + encodeURIComponent(orderId), {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const adminGetAffiliateCommissions = (accessToken: string, affId: string) =>
  request<{ commissions: AffiliateCommission[]; total: number }>("/admin/affiliate/" + encodeURIComponent(affId) + "/commissions", {
    headers: { "X-User-Token": accessToken },
  });

// ─── SisFrete Webtracking API ───

export interface SisfreteWTConfig {
  apiToken: string;
  canalVenda: string;
  subCanal: string;
  cnpjCd: string;
  enabled: boolean;
  updatedAt?: number;
}

export interface SisfreteWTPedido {
  canalVenda: string;
  subCanal: string;
  chaveNfe: string;
  numeroDoPedido: string;
  codigoServico: string;
  codigoTransportadora: string;
  /** ID da cotacao SisFrete — vincula pedido ao romaneio e NF */
  idCotacao?: string;
  dataEmissaoNota: string;
  dataVenda: string;
  cnpjCd?: string;
  destinatarioBairro: string;
  destinatarioCelular: string;
  destinatarioCep: string;
  destinatarioCidade: string;
  destinatarioCpfCnpj: string;
  destinatarioEmail: string;
  destinatarioEstado: string;
  destinatarioNome?: string;
  destinatarioNumero?: string;
  destinatarioPais?: string;
  destinatarioRua?: string;
  destinatarioTipo?: string;
  pedidoCanalVenda: string;
  numeroNota: number;
  numeroObjeto: string;
  serieNota: string;
  servicoEntrega: string;
  statusPedido: string;
  transportadoraNome: string;
  prazoExpedicao?: number;
  valorFrete: number;
  valorPedido: number;
  produtos?: Array<{
    codigo: string;
    altura: number;
    largura: number;
    comprimento: number;
    peso: number;
    quantidade: number;
    valor: number;
    cubicoComFator: number;
    cubicoIndividual: number;
  }>;
  caixas?: Array<{
    codigo: string;
    altura: number;
    largura: number;
    comprimento: number;
    peso: number;
    quantidade: number;
    valor: number;
    cubicoComFator: number;
    cubicoIndividual: number;
  }>;
}

export interface SisfreteWTRastreio {
  objeto: string;
  pedido: string;
  danfe: string;
  id: number;
  link: string;
  descricao: string;
  data_hora: string;
}

export interface SisfreteWTSentOrder {
  sentAt: string;
  sentBy: string;
  pedido: SisfreteWTPedido;
  response: any;
  status: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelResponse?: any;
}

export const sisfreteWTGetConfig = (accessToken: string) =>
  request<SisfreteWTConfig>("/admin/sisfrete-wt/config", {
    headers: { "X-User-Token": accessToken },
  });

export const sisfreteWTSaveConfig = (accessToken: string, config: SisfreteWTConfig) =>
  request<SisfreteWTConfig>("/admin/sisfrete-wt/config", {
    method: "PUT",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

export const sisfreteWTSendOrder = (accessToken: string, pedidos: SisfreteWTPedido[]) =>
  request<{ success: boolean; data: any }>("/admin/sisfrete-wt/send-order", {
    method: "POST",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ pedidos }),
  });

export const sisfreteWTCancelOrder = (accessToken: string, data: { chaveNfe: string; numeroDoPedido: string; pedidoCanalVenda: string; cnpjCd?: string; notificarCanal?: string }) =>
  request<{ success: boolean; data: any }>("/admin/sisfrete-wt/cancel-order", {
    method: "POST",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const sisfreteWTGetRastreio = (accessToken: string) =>
  request<{ success: boolean; events: SisfreteWTRastreio[]; total: number }>("/admin/sisfrete-wt/rastreio", {
    headers: { "X-User-Token": accessToken },
  });

export const sisfreteWTGetSentOrders = (accessToken: string) =>
  request<{ orders: SisfreteWTSentOrder[]; total: number }>("/admin/sisfrete-wt/sent-orders", {
    headers: { "X-User-Token": accessToken },
  });

export const sisfreteWTSendProducts = (accessToken: string, produtos: any[]) =>
  request<{ success: boolean; data: any }>("/admin/sisfrete-wt/send-products", {
    method: "POST",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ produtos }),
  });

export const sisfreteWTSendEmbalamento = (accessToken: string, caixas: any[]) =>
  request<{ success: boolean; data: any }>("/admin/sisfrete-wt/send-embalamento", {
    method: "POST",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ caixas }),
  });

// ====================== SISFRETE DELIVERY API ======================

export interface SisfreteDeliveryConfig {
  apiToken: string;
  enabled: boolean;
  updatedAt?: string;
}

export interface SisfreteDeliveryman {
  document: string;
  erpCodeDeliveryman: string;
  erpCodeStore: string[];
  name: string;
  phone: string;
  email: string;
  active: string;
  createdAt?: string;
  apiResponse?: any;
}

export const sisfreteDeliveryGetConfig = (accessToken: string) =>
  request<SisfreteDeliveryConfig>("/admin/sisfrete-delivery/config", {
    headers: { "X-User-Token": accessToken },
  });

export const sisfreteDeliverySaveConfig = (accessToken: string, config: SisfreteDeliveryConfig) =>
  request<SisfreteDeliveryConfig>("/admin/sisfrete-delivery/config", {
    method: "PUT",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

export const sisfreteDeliveryCreateDeliveryman = (accessToken: string, data: any) =>
  request<{ success: boolean; data: any }>("/admin/sisfrete-delivery/create-deliveryman", {
    method: "POST",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const sisfreteDeliveryListDeliverymen = (accessToken: string) =>
  request<{ deliverymen: SisfreteDeliveryman[]; total: number }>("/admin/sisfrete-delivery/deliverymen", {
    headers: { "X-User-Token": accessToken },
  });

export const sisfreteDeliveryGetDetails = (accessToken: string) =>
  request<{ success: boolean; data: any }>("/admin/sisfrete-delivery/deliveryman-details", {
    headers: { "X-User-Token": accessToken },
  });

export const sisfreteDeliveryChangePassword = (accessToken: string, password: string, passwordNew: string) =>
  request<{ success: boolean; data: any }>("/admin/sisfrete-delivery/change-password", {
    method: "PUT",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ password, passwordNew }),
  });

export const sisfreteDeliveryRemoveDeliveryman = (accessToken: string, document: string) =>
  request<{ success: boolean; removed: number }>("/admin/sisfrete-delivery/deliveryman", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  });

// ─── Branches (Filiais) ───

export interface Branch {
  id: string;
  nome: string;
  estado: string;
  endereco: string;
  telefone: string;
  whatsapp: string;
  horario: string;
  isMatriz: boolean;
  active: boolean;
  order: number;
  mapQuery: string;
  imageUrl?: string;
  filename?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Public: list active branches */
export const getBranches = () =>
  request<{ branches: Branch[] }>("/branches");

/** Admin: list all branches */
export const getAdminBranches = (accessToken: string) =>
  request<{ branches: Branch[] }>("/admin/branches", {
    headers: { "X-User-Token": accessToken },
  });

/** Admin: create or update a branch */
export const saveBranch = async (
  id: string,
  formData: FormData,
  accessToken: string
): Promise<{ branch: Branch }> => {
  const res = await fetch(_authUrl("/admin/branches/" + encodeURIComponent(id), accessToken), {
    method: "PUT",
    headers: { Authorization: "Bearer " + publicAnonKey },
    body: formData,
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data?.error || "HTTP " + res.status);
  return data;
};

/** Admin: delete a branch */
export const deleteBranch = (id: string, accessToken: string) =>
  request<{ deleted: boolean }>("/admin/branches/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });