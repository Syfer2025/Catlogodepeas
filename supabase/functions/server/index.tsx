import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";
import { seedData } from "./seed.tsx";
import { handleTestShippingApi } from "./test-shipping-handler.ts";
import { validate, validateOrError, validators, schemas, checkBodySize } from "./validation.ts";
import nodemailer from "npm:nodemailer@6.9.16";

const app = new Hono();

// Supabase admin client (service role)
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Supabase anon client (for operations that trigger built-in emails, e.g. signUp confirmation)
const supabaseAnon = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
);

// Helper: verify auth token and return user id
async function getAuthUserId(request: Request): Promise<string | null> {
  // Priority order for user token:
  // 1. Query param _ut (avoids CORS preflight AND Gateway 401 on user JWTs in Authorization)
  // 2. Legacy header X-User-Token (backward compat)
  // 3. Authorization Bearer (fallback — note: may be the anon key, not a user JWT)
  var url = new URL(request.url);
  var queryToken = url.searchParams.get("_ut");
  var legacyToken = request.headers.get("X-User-Token");
  var authHeader = request.headers.get("Authorization");
  var userToken = queryToken
    || legacyToken
    || (authHeader ? authHeader.split(" ")[1] : null);
  console.log("[getAuthUserId] queryToken: " + String(!!queryToken) + " | legacyToken: " + String(!!legacyToken) + " | authHeader: " + String(!!authHeader) + " | tokenLen: " + String(userToken ? userToken.length : 0));
  if (!userToken) return null;
  try {
    var authResult = await supabaseAdmin.auth.getUser(userToken);
    var user = authResult.data ? authResult.data.user : null;
    var authErr = authResult.error;
    if (authErr) {
      console.log("[getAuthUserId] getUser error: " + String(authErr.message));
      return null;
    }
    if (!user || !user.id) {
      console.log("[getAuthUserId] getUser returned no user id");
      return null;
    }
    console.log("[getAuthUserId] Success: userId=" + user.id + " email=" + String(user.email));
    return user.id;
  } catch (ex) {
    console.log("[getAuthUserId] Exception: " + String(ex));
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════��═
// ADMIN ROLE VERIFICATION — prevents customers from accessing admin panel
// Master admin is hardcoded. Other admins via KV whitelist + user_metadata.role
// ═══════════════════════════════════════════════════════════════════════

var MASTER_ADMIN_EMAIL = "alexmeira@protonmail.com";

var ALL_ADMIN_TABS = [
  "dashboard", "orders", "products", "categories", "attributes", "clients",
  "coupons", "banners", "mid-banners", "hp-categories", "super-promo",
  "footer-badges", "api-sige", "paghiper", "mercadopago", "safrapay",
  "shipping", "sisfrete-wt", "ga4", "audit-log", "settings", "admins",
  "email-marketing", "brands", "auto-categ", "reviews", "warranty",
  "affiliates", "lgpd-requests", "branches"
];

function _isMasterEmail(email: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === MASTER_ADMIN_EMAIL;
}

async function _getAdminWhitelist(): Promise<string[]> {
  var list: string[] = [MASTER_ADMIN_EMAIL];
  try {
    var raw = await kv.get("admin_emails");
    if (raw) {
      var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        for (var i = 0; i < parsed.length; i++) {
          var e = String(parsed[i]).toLowerCase().trim();
          if (e && list.indexOf(e) === -1) {
            list.push(e);
          }
        }
      }
    }
  } catch (parseErr) {
    console.log("[AdminWhitelist] Parse error: " + parseErr);
  }
  return list;
}

async function _saveAdminWhitelist(list: string[]): Promise<void> {
  var filtered = list.filter(function(e) { return e.toLowerCase().trim() !== MASTER_ADMIN_EMAIL; });
  await kv.set("admin_emails", JSON.stringify(filtered));
}

async function _getAdminPermissions(email: string): Promise<string[]> {
  if (_isMasterEmail(email)) return ALL_ADMIN_TABS.slice();
  try {
    var raw = await kv.get("admin_perms:" + email.toLowerCase().trim());
    if (raw) {
      var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.log("[AdminPerms] Parse error for " + email + ": " + e);
  }
  return ALL_ADMIN_TABS.filter(function(t) { return t !== "admins"; });
}

async function _setAdminPermissions(email: string, tabs: string[]): Promise<void> {
  if (_isMasterEmail(email)) return;
  await kv.set("admin_perms:" + email.toLowerCase().trim(), JSON.stringify(tabs));
}

async function isAdminUser(request: Request): Promise<{ isAdmin: boolean; userId: string | null; email: string | null; isMaster: boolean }> {
  var userId = await getAuthUserId(request);
  if (!userId) return { isAdmin: false, userId: null, email: null, isMaster: false };

  try {
    var userResult = await supabaseAdmin.auth.admin.getUserById(userId);
    var user = userResult.data?.user;
    if (!user) return { isAdmin: false, userId: userId, email: null, isMaster: false };

    var email = user.email || null;
    var isMaster = _isMasterEmail(email);

    // Master admin: ALWAYS granted, fix metadata if needed
    if (isMaster) {
      if (user.user_metadata?.role !== "admin") {
        try {
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: Object.assign({}, user.user_metadata, { role: "admin" }),
          });
          console.log("[isAdminUser] Auto-fixed master admin metadata for: " + email);
        } catch (fixErr) {
          console.log("[isAdminUser] Master metadata fix error: " + fixErr);
        }
      }
      return { isAdmin: true, userId: userId, email: email, isMaster: true };
    }

    // SECURITY: Do NOT trust user_metadata.role alone — users can self-set it
    // via supabase.auth.updateUser(). Only trust the server-side KV whitelist.
    // Check KV whitelist (authoritative source of admin status)
    if (email) {
      var adminEmails = await _getAdminWhitelist();
      var emailLower = email.toLowerCase();
      for (var j = 0; j < adminEmails.length; j++) {
        if (adminEmails[j].toLowerCase() === emailLower) {
          var role = user.user_metadata?.role;
          if (role !== "admin") {
            try {
              await supabaseAdmin.auth.admin.updateUserById(userId, {
                user_metadata: Object.assign({}, user.user_metadata, { role: "admin" }),
              });
              console.log("[isAdminUser] Auto-fixed role to admin for: " + email);
            } catch (fixErr) {
              console.log("[isAdminUser] Auto-fix error: " + fixErr);
            }
          }
          return { isAdmin: true, userId: userId, email: email, isMaster: false };
        }
      }
    }

    return { isAdmin: false, userId: userId, email: email, isMaster: false };
  } catch (e) {
    console.log("[isAdminUser] Error: " + e);
    return { isAdmin: false, userId: userId, email: null, isMaster: false };
  }
}

// Helper: check if a userId is admin (used by delivery routes)
async function checkAdmin(userId: string): Promise<boolean> {
  try {
    var userResult = await supabaseAdmin.auth.admin.getUserById(userId);
    var user = userResult.data?.user;
    if (!user) return false;
    var email = user.email || null;
    if (email && _isMasterEmail(email)) return true;
    // SECURITY: Do NOT trust user_metadata.role alone — users can self-set it.
    // Only trust master email or KV whitelist.
    if (email) {
      var adminEmails = await _getAdminWhitelist();
      var emailLower = email.toLowerCase();
      for (var j = 0; j < adminEmails.length; j++) {
        if (adminEmails[j].toLowerCase() === emailLower) return true;
      }
    }
    return false;
  } catch (e) {
    console.log("[checkAdmin] Error: " + e);
    return false;
  }
}

// Enable logger
app.use("*", logger(console.log));

// ═══════════════════════════════════════════════════════════════════════
// Security Headers middleware — prevents clickjacking, MIME sniffing, etc.
// ═══════════════════════════════════════════════════════════════════════
app.use("*", async function (c: any, next: any) {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  // X-XSS-Protection set to 0: the legacy "1; mode=block" is deprecated and can
  // introduce side-channel attacks. With a strong CSP in place, the browser's
  // built-in XSS auditor should be disabled entirely.
  c.header("X-XSS-Protection", "0");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions-Policy — block all sensitive device/browser features
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(), autoplay=(), fullscreen=(self), display-capture=()");
  // Cross-Origin isolation headers — prevent cross-origin window/resource leaks
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  // HSTS — force HTTPS for 1 year, include subdomains
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  // CSP — restrict resource loading to same-origin + known domains
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://apis.google.com https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co https://api.mercadopago.com https://api.paghiper.com https://viacep.com.br https://*.sisfrete.com.br https://autopecascarretao.com https://autopecascarretao.com.br; frame-src https://www.google.com https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests");
  // Prevent caching of API responses with sensitive data
  if (!c.req.path.includes("/banners") && !c.req.path.includes("/homepage")) {
    c.header("Cache-Control", "no-store, no-cache, must-revalidate");
    c.header("Pragma", "no-cache");
  }
});

// Global error handler — catches unhandled exceptions without leaking details
app.onError(function (err: any, c: any) {
  console.log("[GlobalError] " + c.req.method + " " + c.req.path + ": " + String(err));
  return c.json({ error: "Erro interno do servidor." }, 500);
});

// Enable CORS — restricted to known origins
var ALLOWED_ORIGINS = [
  "https://cafe-puce-47800704.figma.site",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://autopecascarretao.com",
  "https://www.autopecascarretao.com",
  "https://autopecascarretao.com.br",
  "https://www.autopecascarretao.com.br",
];
app.use(
  "/*",
  cors({
    origin: function (origin: string) {
      // Allow webhook callbacks (PagHiper/MercadoPago send with no Origin)
      if (!origin) return "*";
      for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
        if (origin === ALLOWED_ORIGINS[i]) return origin;
      }
      // Allow *.supabase.co for Supabase Studio/Dashboard
      // SECURITY: endsWith prevents bypass via domains like evil.supabase.co.hacker.com
      if (origin.endsWith(".supabase.co")) return origin;
      // Allow any *.figma.site subdomain (production + preview builds)
      if (origin.endsWith(".figma.site")) return origin;
      console.log("[CORS] Blocked unknown origin: " + origin);
      return ALLOWED_ORIGINS[0];
    },
    allowHeaders: ["Content-Type", "Authorization", "X-User-Token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  })
);

// ══════════════════════════════��════════════════════════════════════════
// Rate Limiter — in-memory sliding window per IP
// ═══════════════════════════════════════════════════════════════════════
var _rateLimitMap: Map<string, number[]> = new Map();
var RATE_LIMIT_WINDOW_MS = 60000;
var RATE_LIMIT_MAX_PUBLIC = 120;
var RATE_LIMIT_CLEANUP_INTERVAL = 300000;

setInterval(function () {
  var now = Date.now();
  var cutoff = now - RATE_LIMIT_WINDOW_MS;
  _rateLimitMap.forEach(function (timestamps, key) {
    var filtered = timestamps.filter(function (t) { return t > cutoff; });
    if (filtered.length === 0) {
      _rateLimitMap.delete(key);
    } else {
      _rateLimitMap.set(key, filtered);
    }
  });
}, RATE_LIMIT_CLEANUP_INTERVAL);

function _getRateLimitKey(c: any, prefix: string): string {
  var ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  if (ip.indexOf(",") >= 0) ip = ip.split(",")[0].trim();
  return prefix + ":" + ip;
}

function _checkRateLimit(key: string, maxReqs: number): { allowed: boolean; remaining: number; retryAfterMs: number } {
  var now = Date.now();
  var cutoff = now - RATE_LIMIT_WINDOW_MS;
  var timestamps = _rateLimitMap.get(key) || [];
  timestamps = timestamps.filter(function (t) { return t > cutoff; });
  if (timestamps.length >= maxReqs) {
    var oldestInWindow = timestamps[0];
    var retryAfterMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now;
    _rateLimitMap.set(key, timestamps);
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }
  timestamps.push(now);
  _rateLimitMap.set(key, timestamps);
  return { allowed: true, remaining: maxReqs - timestamps.length, retryAfterMs: 0 };
}

// Helper: return 429 with standard rate limit headers
function _rl429(c: any, msg: string, rlResult: { remaining: number; retryAfterMs: number }): Response {
  var retrySeconds = Math.ceil(rlResult.retryAfterMs / 1000);
  return c.json({ error: msg, retryAfterMs: rlResult.retryAfterMs }, 429, {
    "Retry-After": String(retrySeconds),
    "X-RateLimit-Remaining": "0"
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Auth Brute-Force Protection — per-email lockout + auth rate limits
// ═══════════════════════════════════════════════════════════════════════
var AUTH_RATE_LIMIT_LOGIN = 6;
var AUTH_RATE_LIMIT_SIGNUP = 5;
var AUTH_RATE_LIMIT_FORGOT = 3;
var AUTH_RATE_LIMIT_BOOTSTRAP = 3;

var _failedLoginMap: Map<string, { count: number; firstFailAt: number; lockedUntil: number }> = new Map();
var LOCKOUT_THRESHOLD_1 = 5;
var LOCKOUT_THRESHOLD_2 = 10;
var LOCKOUT_THRESHOLD_3 = 15;
var LOCKOUT_DURATION_1 = 15 * 60 * 1000;
var LOCKOUT_DURATION_2 = 30 * 60 * 1000;
var LOCKOUT_DURATION_3 = 60 * 60 * 1000;

setInterval(function () {
  var now = Date.now();
  _failedLoginMap.forEach(function (entry, key) {
    if (entry.lockedUntil < now && (now - entry.firstFailAt) > 7200000) {
      _failedLoginMap.delete(key);
    }
  });
}, 600000);

function _checkEmailLockout(email: string): { locked: boolean; retryAfterMs: number; attempts: number } {
  if (!email) return { locked: false, retryAfterMs: 0, attempts: 0 };
  var key = email.toLowerCase().trim();
  var entry = _failedLoginMap.get(key);
  if (!entry) return { locked: false, retryAfterMs: 0, attempts: 0 };
  var now = Date.now();
  if (entry.lockedUntil > now) {
    return { locked: true, retryAfterMs: entry.lockedUntil - now, attempts: entry.count };
  }
  return { locked: false, retryAfterMs: 0, attempts: entry.count };
}

function _recordFailedLogin(email: string): void {
  if (!email) return;
  var key = email.toLowerCase().trim();
  var now = Date.now();
  var entry = _failedLoginMap.get(key);
  if (!entry) {
    _failedLoginMap.set(key, { count: 1, firstFailAt: now, lockedUntil: 0 });
    return;
  }
  if (entry.lockedUntil < now && (now - entry.firstFailAt) > 3600000) {
    _failedLoginMap.set(key, { count: 1, firstFailAt: now, lockedUntil: 0 });
    return;
  }
  entry.count = entry.count + 1;
  if (entry.count >= LOCKOUT_THRESHOLD_3) {
    entry.lockedUntil = now + LOCKOUT_DURATION_3;
    console.log("[BruteForce] Email " + key + " locked 60min after " + entry.count + " failures");
  } else if (entry.count >= LOCKOUT_THRESHOLD_2) {
    entry.lockedUntil = now + LOCKOUT_DURATION_2;
    console.log("[BruteForce] Email " + key + " locked 30min after " + entry.count + " failures");
  } else if (entry.count >= LOCKOUT_THRESHOLD_1) {
    entry.lockedUntil = now + LOCKOUT_DURATION_1;
    console.log("[BruteForce] Email " + key + " locked 15min after " + entry.count + " failures");
  }
  _failedLoginMap.set(key, entry);
}

function _clearFailedLogin(email: string): void {
  if (!email) return;
  _failedLoginMap.delete(email.toLowerCase().trim());
}

function _checkHoneypot(body: any): boolean {
  if (body.website && String(body.website).length > 0) return true;
  if (body.company_url && String(body.company_url).length > 0) return true;
  if (body.fax_number && String(body.fax_number).length > 0) return true;
  return false;
}

function _checkAuthRateLimit(c: any, action: string): Response | null {
  var maxReqs = AUTH_RATE_LIMIT_LOGIN;
  if (action === "signup") maxReqs = AUTH_RATE_LIMIT_SIGNUP;
  if (action === "forgot") maxReqs = AUTH_RATE_LIMIT_FORGOT;
  if (action === "bootstrap") maxReqs = AUTH_RATE_LIMIT_BOOTSTRAP;
  var rlKey = _getRateLimitKey(c, "auth_" + action);
  var rl = _checkRateLimit(rlKey, maxReqs);
  if (!rl.allowed) {
    var retrySeconds = Math.ceil(rl.retryAfterMs / 1000);
    console.log("[AuthRateLimit] Blocked " + action + " from IP, retry in " + retrySeconds + "s");
    return _rl429(c, "Muitas tentativas. Aguarde " + retrySeconds + " segundos antes de tentar novamente.", rl);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// HTML Sanitization helper
// ═══════════════════════════════════════════════════════���═══════════════
function sanitizeInput(input: string): string {
  if (!input) return "";
  var clean = input.replace(/<[^>]*>/g, "");
  clean = clean.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
  clean = clean.replace(/&#(\d+);/g, function(_m: string, code: string) { return String.fromCharCode(Number(code)); });
  clean = clean.replace(/&#x([0-9a-fA-F]+);/g, function(_m: string, hex: string) { return String.fromCharCode(parseInt(hex, 16)); });
  clean = clean.replace(/<[^>]*>/g, "");
  clean = clean.replace(/javascript\s*:/gi, "");
  clean = clean.replace(/on\w+\s*=/gi, "");
  clean = clean.replace(/\s{10,}/g, "  ").trim();
  return clean;
}

function sanitizeObject(obj: Record<string, any>, fields: string[]): Record<string, any> {
  var result = Object.assign({}, obj);
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (typeof result[f] === "string") {
      result[f] = sanitizeInput(result[f]);
    }
  }
  return result;
}

// ══════════════════════════════════════════════════════��════════════════
// Efficient user lookup by email — avoids loading ALL users into memory
// ═���═════════════════════════════════════════════════════════════════════
async function _findUserByEmail(emailToFind: string): Promise<any | null> {
  if (!emailToFind) return null;
  var emailLower = emailToFind.toLowerCase().trim();
  try {
    // Use the GoTrue REST API directly with email filter
    var supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    var serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    var filterUrl = supabaseUrl + "/auth/v1/admin/users?page=1&per_page=1&email=" + encodeURIComponent(emailLower);
    var resp = await fetch(filterUrl, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + serviceKey,
        "apikey": serviceKey,
      },
    });
    if (resp.ok) {
      var body = await resp.json();
      var users = body.users || [];
      if (Array.isArray(users) && users.length > 0) {
        // Verify exact match (case-insensitive)
        for (var i = 0; i < users.length; i++) {
          if (users[i].email && users[i].email.toLowerCase() === emailLower) {
            return users[i];
          }
        }
      }
      // If the API returned 0 results with valid response, user doesn't exist
      if (Array.isArray(users)) return null;
    }
    // Fallback: paginated search (avoids loading all users at once)
    console.log("[_findUserByEmail] REST email filter unavailable, using paginated fallback");
    var page = 1;
    var perPage = 100;
    var maxPages = 20;
    while (page <= maxPages) {
      var pageResult = await supabaseAdmin.auth.admin.listUsers({ page: page, perPage: perPage });
      var pageUsers = pageResult.data?.users || [];
      for (var j = 0; j < pageUsers.length; j++) {
        if (pageUsers[j].email && pageUsers[j].email.toLowerCase() === emailLower) {
          return pageUsers[j];
        }
      }
      if (pageUsers.length < perPage) break;
      page++;
    }
    return null;
  } catch (err) {
    console.log("[_findUserByEmail] Error: " + err);
    return null;
  }
}

// Paginated listUsers — avoids loading all users in a single unbounded call
async function _listAllAuthUsersPaginated(): Promise<any[]> {
  var allUsers: any[] = [];
  var page = 1;
  var perPage = 200;
  var maxPages = 50; // safety cap: 10,000 users max
  try {
    while (page <= maxPages) {
      var result = await supabaseAdmin.auth.admin.listUsers({ page: page, perPage: perPage });
      var pageUsers = result.data?.users || [];
      for (var i = 0; i < pageUsers.length; i++) {
        allUsers.push(pageUsers[i]);
      }
      if (pageUsers.length < perPage) break;
      page++;
    }
  } catch (err) {
    console.log("[_listAllAuthUsersPaginated] Error at page " + page + ": " + err);
  }
  return allUsers;
}

// ═══════════════════════════════════════════════════════════════════════
// Safe error helper — logs full error server-side, returns generic msg
// ═══════════════════════════════════════════════════════════════════════
function _safeError(prefix: string, e: any): string {
  console.log("[SafeError] " + prefix + ": " + String(e));
  return prefix;
}

// ═══════════════════════════════════════════════════════════════════════
// reCAPTCHA v3 verification helper
// ═══════════════════════════════════════════════════════════════════════
// DISABLED: reCAPTCHA is completely bypassed. Always returns ok.
async function _verifyCaptcha(_token: string, _expectedAction: string, _minScore?: number): Promise<{ ok: boolean; score: number; error?: string }> {
  return { ok: true, score: 1.0 };
}

// ═══════════════════════════════════════════════════════════════════════
// Max length helper — truncate input strings for safety
// ═════════════════════════════════════════════════════���═════════════════
function _maxLen(input: string, max: number): string {
  if (!input) return "";
  if (input.length > max) return input.substring(0, max);
  return input;
}

// ═══════════════════════════════════════════════════════════════════════
// Password complexity validator
// ═══════════════════════════════════════════════════════════════════════
function _validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return "A senha deve ter pelo menos 8 caracteres.";
  }
  if (!/[A-Z]/.test(password)) {
    return "A senha deve conter pelo menos uma letra maiúscula.";
  }
  if (!/[a-z]/.test(password)) {
    return "A senha deve conter pelo menos uma letra minúscula.";
  }
  if (!/[0-9]/.test(password)) {
    return "A senha deve conter pelo menos um número.";
  }
  return null;
}

const BASE = "/make-server-b7b07654";

// ═══════════════════════════════════════════════════════════════════════
// Global Rate Limiting — applies to ALL routes (200 req/min per IP)
// Route-specific limits below override with stricter values
// ═══════════════════════════════════════════════════════════════════════
var RATE_LIMIT_GLOBAL = 200;
app.use("*", async function (c: any, next: any) {
  if (c.req.method === "OPTIONS") return next();
  var rlKey = _getRateLimitKey(c, "global");
  var rlResult = _checkRateLimit(rlKey, RATE_LIMIT_GLOBAL);
  if (!rlResult.allowed) {
    var retrySeconds = Math.ceil(rlResult.retryAfterMs / 1000);
    console.log("[GlobalRateLimit] BLOCKED IP " + rlKey + " — retry in " + retrySeconds + "s");
    return _rl429(c, "Too many requests. Retry after " + retrySeconds + " seconds.", rlResult);
  }
  await next();
  c.header("X-RateLimit-Remaining", String(rlResult.remaining));
});

// ═══════════════════════════════════════════════════════════════════════
// Global Request Body Size Limiter — prevents oversized payloads (1MB max)
// ═══════════════════════════════════════════════════════════════════════
var MAX_BODY_BYTES = 1048576; // 1 MB
app.use("*", async function (c: any, next: any) {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  var contentLength = c.req.header("content-length");
  if (contentLength) {
    var len = parseInt(contentLength, 10);
    if (!isNaN(len) && len > MAX_BODY_BYTES) {
      console.log("[BodySize] BLOCKED: content-length " + len + " exceeds " + MAX_BODY_BYTES);
      return c.json({ error: "Payload too large." }, 413);
    }
  }
  return next();
});

// ── Rate limit auth routes (stricter) ──
app.use(BASE + "/auth/user/signup", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  var rlKey = _getRateLimitKey(c, "auth_signup");
  var rlResult = _checkRateLimit(rlKey, 10);
  if (!rlResult.allowed) {
    console.log("[RateLimit] BLOCKED signup from " + rlKey);
    return _rl429(c, "Too many requests. Try again in " + Math.ceil(rlResult.retryAfterMs / 1000) + " seconds.", rlResult);
  }
  return next();
});

app.use(BASE + "/auth/user/forgot-password", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  var rlKey = _getRateLimitKey(c, "auth_forgot");
  var rlResult = _checkRateLimit(rlKey, 5);
  if (!rlResult.allowed) {
    console.log("[RateLimit] BLOCKED forgot-password from " + rlKey);
    return _rl429(c, "Too many requests. Try again in " + Math.ceil(rlResult.retryAfterMs / 1000) + " seconds.", rlResult);
  }
  return next();
});

// ── Rate limit authenticated user routes (30 req/min per IP) ──
var RATE_LIMIT_AUTH_USER = 30;
app.use(BASE + "/auth/user/*", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  // Skip signup/forgot which have their own stricter limits
  var p = c.req.path;
  if (p.indexOf("/signup") >= 0 || p.indexOf("/forgot-password") >= 0) return next();
  var rlKey = _getRateLimitKey(c, "auth_user");
  var rlResult = _checkRateLimit(rlKey, RATE_LIMIT_AUTH_USER);
  if (!rlResult.allowed) {
    console.log("[RateLimit] BLOCKED auth/user from " + rlKey);
    return _rl429(c, "Muitas requisições. Tente novamente em " + Math.ceil(rlResult.retryAfterMs / 1000) + " segundos.", rlResult);
  }
  return next();
});

// ── Rate limit webhook endpoints (60 req/min per IP — prevent abuse) ──
app.use(BASE + "/paghiper/notification", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  var rlKey = _getRateLimitKey(c, "webhook_paghiper");
  var rlResult = _checkRateLimit(rlKey, 60);
  if (!rlResult.allowed) {
    console.log("[RateLimit] BLOCKED PagHiper webhook from " + rlKey);
    return _rl429(c, "Too many requests", rlResult);
  }
  return next();
});
app.use(BASE + "/mercadopago/webhook", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  var rlKey = _getRateLimitKey(c, "webhook_mp");
  var rlResult = _checkRateLimit(rlKey, 60);
  if (!rlResult.allowed) {
    console.log("[RateLimit] BLOCKED MP webhook from " + rlKey);
    return _rl429(c, "Too many requests", rlResult);
  }
  return next();
});
app.use(BASE + "/safrapay/webhook", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  var rlKey = _getRateLimitKey(c, "webhook_safrapay");
  var rlResult = _checkRateLimit(rlKey, 60);
  if (!rlResult.allowed) {
    console.log("[RateLimit] BLOCKED SafraPay webhook from " + rlKey);
    return _rl429(c, "Too many requests", rlResult);
  }
  return next();
});

// ── Rate limit login via /auth/user/login (10 req/min per IP) ──
app.use(BASE + "/auth/user/login", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  var rlKey = _getRateLimitKey(c, "auth_login");
  var rlResult = _checkRateLimit(rlKey, 10);
  if (!rlResult.allowed) {
    console.log("[RateLimit] BLOCKED login from " + rlKey);
    return _rl429(c, "Muitas tentativas de login. Tente novamente em " + Math.ceil(rlResult.retryAfterMs / 1000) + " segundos.", rlResult);
  }
  return next();
});

// ═══════════════════════════════════════════════════════════════════════
// Admin guard middleware — blocks non-admin access with 403
// ══════════════════════════════════════════════════════════════════��════
async function adminGuard(c: any, next: any) {
  var result = await isAdminUser(c.req.raw);
  if (!result.isAdmin) {
    console.log("[adminGuard] BLOCKED: " + c.req.method + " " + c.req.path + " (userId=" + String(result.userId) + " email=" + String(result.email) + ")");
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }
  await next();
}

// ── Protect /sige/* (exempt checkout-facing user routes) ──
app.use(BASE + "/sige/*", async (c: any, next: any) => {
  var subpath = c.req.path.substring(c.req.path.indexOf("/sige/") + 6);
  // User-facing checkout routes (require user auth, not admin):
  // NOTE: user/register and user/create are SIGE admin setup, NOT checkout — kept admin-guarded
  if (subpath === "my-mapping" || subpath === "create-sale"
    || subpath === "sync-customer") {
    return next();
  }
  return adminGuard(c, next);
});

// ── Protect admin management routes ──
app.use(BASE + "/auth/admin-whitelist", adminGuard);
app.use(BASE + "/auth/admin-list", adminGuard);
app.use(BASE + "/auth/admin-permissions", adminGuard);
app.use(BASE + "/auth/admin/*", adminGuard);

// ── Protect /admin/* (banners admin, etc) ──
app.use(BASE + "/admin/*", adminGuard);

// NOTE: /seed is NOT admin-guarded because it is idempotent (checks `data_seeded`
// KV flag and no-ops if already seeded) and only writes harmless default config.
// Guarding it would block initial setup before any admin user exists.

// ── Protect logo/footer-logo write ops (GET is public) ──
// NOTE: Hono's wildcard "/logo/*" also matches "/logo" in some versions,
// so both exact and wildcard middleware must exempt GET/HEAD/OPTIONS.
app.use(BASE + "/logo", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
app.use(BASE + "/logo/*", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
app.use(BASE + "/footer-logo", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
app.use(BASE + "/footer-logo/*", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});

// ── Protect /produtos/* write ops (GET is public catalog) ──
app.use(BASE + "/produtos/*", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  var subpath = c.req.path.substring(c.req.path.indexOf("/produtos/") + 10);
  // Public POST endpoints (used by catalog/checkout):
  // - saldos: balance check
  // - precos-bulk: bulk price fetch for catalog display
  // - meta/bulk: bulk metadata fetch for catalog display
  if (subpath === "saldos" || subpath === "precos-bulk" || subpath === "meta/bulk") return next();
  return adminGuard(c, next);
});

// ── Protect payment gateway config routes (admin only) ──
// PagHiper config: all methods require admin (contains API keys)
app.use(BASE + "/paghiper/config", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// MercadoPago config: all methods require admin
app.use(BASE + "/mercadopago/config", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// SafraPay config: all methods require admin
app.use(BASE + "/safrapay/config", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Shipping config: PUT requires admin (GET used by checkout is OK for any auth user)
app.use(BASE + "/shipping/config", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Shipping tables: write ops require admin
app.use(BASE + "/shipping/tables/*", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Settings: GET is public (frontend needs store name, etc.), PUT/DELETE require admin
app.use(BASE + "/settings", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// GA4 config: GET is needed by frontend GA4Provider, PUT requires admin
app.use(BASE + "/ga4/config", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Price config: all write ops require admin
app.use(BASE + "/price-config", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Price cache: DELETE requires admin
app.use(BASE + "/price-cache", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Messages: POST is public (contact form), GET/PUT/DELETE require admin (contains PII)
app.use(BASE + "/messages", async (c: any, next: any) => {
  if (c.req.method === "POST" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
app.use(BASE + "/messages/*", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Category tree: GET is public, PUT requires admin
app.use(BASE + "/category-tree", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Legacy /products CRUD: GET is public, POST/PUT/DELETE require admin
app.use(BASE + "/products", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
app.use(BASE + "/products/*", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Legacy /categories CRUD: GET is public, POST/PUT/DELETE require admin
app.use(BASE + "/categories", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
app.use(BASE + "/categories/*", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Favicon: GET is public, POST/DELETE require admin
app.use(BASE + "/favicon", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
app.use(BASE + "/favicon/*", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Shipping tables: POST requires admin (exact path not covered by wildcard)
app.use(BASE + "/shipping/tables", async (c: any, next: any) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// Shipping test-api: admin only
app.use(BASE + "/shipping/test-api", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// MercadoPago test: admin only
app.use(BASE + "/mercadopago/test", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// MercadoPago search-payments: admin only
app.use(BASE + "/mercadopago/search-payments", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// SafraPay activate: admin only
app.use(BASE + "/safrapay/activate", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  return adminGuard(c, next);
});
// NOTE: /safrapay/config already guarded above (line ~715)

// ─── Health ───
// ═══════════════════════════════════════════════════════════════════════
// reCAPTCHA endpoints
// ═══════════════════════════════════════════════════════════════════════

// Public: return the reCAPTCHA site key so the frontend can load the script
app.get(BASE + "/captcha/site-key", (c) => {
  var siteKey = Deno.env.get("RECAPTCHA_SITE_KEY") || "";
  return c.json({ siteKey: siteKey });
});

// Public: verify captcha token (used by login flow which authenticates directly via Supabase)
app.post(BASE + "/captcha/verify", async (c) => {
  try {
    var body = await c.req.json();
    // Input validation for captcha verify
    var captchaValid = validate(body, {
      token: { type: "string", maxLen: 2000 },
      action: { type: "string", maxLen: 50 },
    });
    if (!captchaValid.ok) return c.json({ error: captchaValid.errors[0] || "Dados invalidos." }, 400);
    var token = body.token || "";
    var action = body.action || "login";
    var minScore = 0.5;
    if (action === "signup" || action === "forgot_password" || action === "admin_forgot_password" || action === "contact") {
      minScore = 0.3;
    }
    var captchaResult = await _verifyCaptcha(token, action, minScore);
    if (!captchaResult.ok) {
      return c.json({ error: captchaResult.error || "Verificação falhou." }, 403);
    }
    return c.json({ ok: true, score: captchaResult.score });
  } catch (e) {
    console.log("[Captcha] verify endpoint error: " + String(e));
    return c.json({ error: "Erro na verificação de segurança." }, 500);
  }
});

app.get(BASE + "/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Seed (rate-limited + idempotent — safe to be public) ───
app.post(BASE + "/seed", async (c) => {
  try {
    var seedRlKey = _getRateLimitKey(c, "seed");
    var seedRl = _checkRateLimit(seedRlKey, 3);
    if (!seedRl.allowed) {
      return _rl429(c, "Too many seed requests.", seedRl);
    }
    const wasSeeded = await seedData();
    return c.json({ seeded: wasSeeded });
  } catch (e) {
    console.log("Error seeding data:", e);
    return c.json({ error: "Erro ao inicializar dados." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── AUTH ─────────────────────────────
// ═══════════════════════════════════════

// Pre-login validation — rate limit + honeypot + email lockout check
// Frontend calls this BEFORE attempting signInWithPassword
app.post(BASE + "/auth/pre-login-check", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "login");
    if (rlBlock) return rlBlock;
    var body = await c.req.json();
    if (_checkHoneypot(body)) {
      console.log("[Honeypot] Bot detected on pre-login-check");
      return c.json({ ok: true });
    }
    // Input validation
    var plcValid = validate(body, {
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
    });
    if (!plcValid.ok) {
      return c.json({ error: plcValid.errors[0] || "Dados invalidos." }, 400);
    }
    var email = (plcValid.sanitized.email || "").toLowerCase().trim();
    if (!email) {
      return c.json({ error: "Email é obrigatório." }, 400);
    }
    var lockout = _checkEmailLockout(email);
    if (lockout.locked) {
      var lockMinutes = Math.ceil(lockout.retryAfterMs / 60000);
      console.log("[BruteForce] Login blocked for locked email: " + email + " (" + lockMinutes + "min remaining)");
      var lockRetrySeconds = Math.ceil(lockout.retryAfterMs / 1000);
      return c.json({
        error: "Conta temporariamente bloqueada por muitas tentativas. Tente novamente em " + lockMinutes + " minutos.",
        locked: true,
        retryAfterMs: lockout.retryAfterMs
      }, 429, {
        "Retry-After": String(lockRetrySeconds),
        "X-RateLimit-Remaining": "0"
      });
    }
    return c.json({ ok: true });
  } catch (e) {
    console.log("[PreLoginCheck] Error: " + String(e));
    return c.json({ ok: true });
  }
});

// Report login result — tracks failures for brute-force protection
app.post(BASE + "/auth/login-result", async (c) => {
  try {
    // Rate limit this endpoint to prevent abuse
    var rlBlock = _checkAuthRateLimit(c, "login");
    if (rlBlock) return rlBlock;
    var body = await c.req.json();
    // Input validation
    var lrValid = validate(body, {
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      success: { type: "boolean" },
    });
    if (!lrValid.ok) {
      return c.json({ ok: true }); // silently accept bad input
    }
    var email = (lrValid.sanitized.email || "").toLowerCase().trim();
    var success = body.success === true;
    if (!email) return c.json({ ok: true });
    if (success) {
      // SECURITY: To clear lockouts, the caller MUST prove they actually
      // authenticated by providing a valid Supabase access token whose
      // email matches the claimed email. Without this, an attacker could
      // call this endpoint to reset lockouts for any victim email.
      var authHeader = c.req.header("Authorization") || "";
      var accessToken = body.accessToken || "";
      // Try X-User-Token header/query too (frontend interceptor pattern)
      if (!accessToken) {
        accessToken = c.req.query("_ut") || "";
      }
      if (accessToken) {
        try {
          var supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
          var serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
          var verifyResp = await fetch(supabaseUrl + "/auth/v1/user", {
            headers: {
              "Authorization": "Bearer " + accessToken,
              "apikey": serviceKey,
            },
          });
          if (verifyResp.ok) {
            var userData = await verifyResp.json();
            var tokenEmail = (userData.email || "").toLowerCase().trim();
            if (tokenEmail === email) {
              _clearFailedLogin(email);
              console.log("[LoginResult] Verified success for: " + email + " — cleared failed attempts");
            } else {
              console.log("[LoginResult] Token email mismatch: " + tokenEmail + " != " + email + " — ignoring clear");
            }
          } else {
            console.log("[LoginResult] Token verification failed (status " + verifyResp.status + ") — ignoring clear for: " + email);
          }
        } catch (verifyErr) {
          console.log("[LoginResult] Token verification error: " + String(verifyErr) + " — ignoring clear for: " + email);
        }
      } else {
        // No token provided — silently ignore the success claim
        console.log("[LoginResult] Success claimed without token for: " + email + " — ignoring (no lockout cleared)");
      }
    } else {
      _recordFailedLogin(email);
      var lockout = _checkEmailLockout(email);
      console.log("[LoginResult] Failure for: " + email + " — total attempts: " + lockout.attempts);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.log("[LoginResult] Error: " + String(e));
    return c.json({ ok: true });
  }
});

// Signup (creates user with admin service role)
// SECURITY: Only existing admins can create new admin accounts
app.post(BASE + "/signup", async (c) => {
  try {
    // SECURITY: Always require admin auth for /signup. Bootstrap uses /auth/claim-admin instead.
    var existingAdmins = await _getAdminWhitelist();
    var callerCheck = await isAdminUser(c.req.raw);
    if (!callerCheck.isAdmin) {
      return c.json({ error: "Apenas administradores podem criar novas contas admin." }, 403);
    }

    var signupBody = await c.req.json();
    // Input validation
    var suValid = validateOrError(signupBody, schemas.signup);
    if (!suValid.valid) {
      return c.json({ error: suValid.errors[0] || "Dados invalidos." }, 400);
    }
    var email = suValid.data.email;
    var password = signupBody.password;
    var name = suValid.data.name || "";
    if (!email || !password) {
      return c.json({ error: "Email e senha são obrigatórios." }, 400);
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || "Admin", role: "admin" },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true,
    });
    if (error) {
      console.log("Signup error:", error.message);
      return c.json({ error: "Erro ao criar usuario." }, 400);
    }
    // Add to admin whitelist
    var emailLower = email.toLowerCase().trim();
    if (!existingAdmins.some(function(e: string) { return e.toLowerCase() === emailLower; })) {
      existingAdmins.push(emailLower);
      await _saveAdminWhitelist(existingAdmins);
      console.log("[Signup] Added " + email + " to admin whitelist");
    }
    return c.json({ user: { id: data.user.id, email: data.user.email } }, 201);
  } catch (e) {
    console.log("Signup exception:", e);
    return c.json({ error: "Erro interno no signup." }, 500);
  }
});

// Verify session (check if token is valid)
app.get(BASE + "/auth/me", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !user) {
      return c.json({ error: "Usuário não encontrado." }, 401);
    }
    return c.json({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || "Admin",
    });
  } catch (e) {
    console.log("Auth/me exception:", e);
    return c.json({ error: _safeError("Erro na verificação de auth", e) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CHECK ADMIN — verifies if the current authenticated user is an admin
// Called by frontend AdminPage/AdminLoginPage before granting access
// ═══════════════════════════════════════════════════════════════════════
app.get(BASE + "/auth/check-admin", async (c) => {
  try {
    var reqUrl = new URL(c.req.raw.url);
    var hasUtParam = !!reqUrl.searchParams.get("_ut");
    console.log("[check-admin] _ut param present: " + String(hasUtParam));
    var result = await isAdminUser(c.req.raw);
    console.log("[check-admin] result: isAdmin=" + String(result.isAdmin) + " isMaster=" + String(result.isMaster) + " email=" + String(result.email));
    var permissions: string[] = [];
    if (result.isAdmin && result.email) {
      permissions = await _getAdminPermissions(result.email);
    }
    return c.json({
      isAdmin: result.isAdmin,
      email: result.email,
      isMaster: result.isMaster,
      permissions: permissions,
      noAdminsExist: false
    });
  } catch (e) {
    console.log("Check-admin error:", e);
    return c.json({ isAdmin: false, error: "Erro ao verificar admin.", noAdminsExist: false, isMaster: false, permissions: [] });
  }
});

// Bootstrap first admin — ONLY works when zero admins exist.
// Authenticates user by email+password, then promotes them to admin.
// This is a one-time endpoint; once an admin exists, it is permanently locked.
app.post(BASE + "/auth/bootstrap-admin", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "bootstrap");
    if (rlBlock) return rlBlock;
    var adminList = await _getAdminWhitelist();
    if (adminList.length > 1) {
      return c.json({ error: "Bootstrap não permitido: já existem administradores configurados." }, 403);
    }

    var body = await c.req.json();
    // Input validation
    var bsValid = validate(body, {
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      password: { required: true, type: "string", minLen: 1, maxLen: 128, sanitize: false },
    });
    if (!bsValid.ok) {
      return c.json({ error: bsValid.errors[0] || "Dados invalidos." }, 400);
    }
    var email = bsValid.sanitized.email;
    var password = body.password;

    if (!email || !password) {
      return c.json({ error: "Email e senha são obrigatórios." }, 400);
    }

    // Verify credentials
    var signInResult = await supabaseAnon.auth.signInWithPassword({ email: email, password: password });
    if (signInResult.error) {
      console.log("[Bootstrap] Auth failed for " + email + ": " + signInResult.error.message);
      return c.json({ error: "Credenciais inválidas." }, 401);
    }

    var user = signInResult.data?.user;
    if (!user?.id) {
      return c.json({ error: "Erro ao autenticar usuário." }, 500);
    }

    // Promote to admin: update metadata + whitelist
    var emailLower = email.toLowerCase().trim();
    try {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: Object.assign({}, user.user_metadata, { role: "admin" }),
      });
    } catch (updateErr) {
      console.log("[Bootstrap] Metadata update error:", updateErr);
    }
    await kv.set("admin_emails", JSON.stringify([emailLower]));
    console.log("[Bootstrap] First admin configured: " + emailLower);

    // Sign out the server-side anon session (frontend handles its own session)
    try { await supabaseAnon.auth.signOut(); } catch (signOutErr) {
      console.log("[Bootstrap] Signout cleanup error:", signOutErr);
    }

    return c.json({ ok: true, email: emailLower });
  } catch (e) {
    console.log("Bootstrap-admin error:", e);
    return c.json({ error: "Erro interno no bootstrap." }, 500);
  }
});

// Claim admin via session token — ONLY works when zero admins exist.
// Used when user already has a valid session (no password re-entry needed).
app.post(BASE + "/auth/claim-admin", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "claim_admin");
    if (rlBlock) return rlBlock;
    var adminList = await _getAdminWhitelist();
    // SECURITY: Block once ANY admin exists in whitelist (> 0, not > 1).
    // _getAdminWhitelist() excludes master, so length > 0 means sub-admins already exist.
    if (adminList.length > 0) {
      return c.json({ error: "Não permitido: já existem administradores configurados." }, 403);
    }

    // Get the authenticated user from the token
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }

    var userResult = await supabaseAdmin.auth.admin.getUserById(userId);
    var user = userResult.data?.user;
    if (!user || !user.email) {
      return c.json({ error: "Usuário não encontrado." }, 404);
    }

    var emailLower = user.email.toLowerCase().trim();

    // Promote: update metadata + save whitelist
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: Object.assign({}, user.user_metadata, { role: "admin" }),
    });
    await kv.set("admin_emails", JSON.stringify([emailLower]));
    console.log("[ClaimAdmin] First admin claimed by: " + emailLower);

    return c.json({ ok: true, email: emailLower });
  } catch (e) {
    console.log("Claim-admin error:", e);
    return c.json({ error: "Erro ao ativar admin." }, 500);
  }
});

// Admin whitelist management (only master can add/remove admins)
app.post(BASE + "/auth/admin-whitelist", async (c) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isMaster) {
      return c.json({ error: "Apenas o admin master pode gerenciar outros admins." }, 403);
    }

    var body = await c.req.json();
    // Input validation
    var awValid = validate(body, {
      action: { required: true, type: "string", maxLen: 20, oneOf: ["add", "remove"] },
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      permissions: { type: "array", maxItems: 50 },
    });
    if (!awValid.ok) {
      return c.json({ error: awValid.errors[0] || "Dados invalidos." }, 400);
    }
    var action = awValid.sanitized.action;
    var email = awValid.sanitized.email;
    var permissions = body.permissions;

    var emailLower = email.toLowerCase().trim();

    // Cannot modify master admin
    if (_isMasterEmail(emailLower)) {
      return c.json({ error: "Não é possível modificar o admin master." }, 400);
    }

    var currentList = await _getAdminWhitelist();

    if (action === "add") {
      if (currentList.indexOf(emailLower) === -1) {
        currentList.push(emailLower);
        await _saveAdminWhitelist(currentList);
        // Update metadata if user exists
        try {
          var found = await _findUserByEmail(emailLower);
          if (found) {
            await supabaseAdmin.auth.admin.updateUserById(found.id, {
              user_metadata: Object.assign({}, found.user_metadata, { role: "admin" }),
            });
          }
        } catch (updateErr) {
          console.log("[AdminWhitelist] Update user metadata error:", updateErr);
        }
      }
      // Save permissions if provided
      if (Array.isArray(permissions)) {
        await _setAdminPermissions(emailLower, permissions);
      }
      var perms = await _getAdminPermissions(emailLower);
      return c.json({ ok: true, list: currentList, permissions: perms });
    } else if (action === "remove") {
      var filtered = currentList.filter(function(e: string) { return e !== emailLower; });
      await _saveAdminWhitelist(filtered);
      // Clean up permissions
      try { await kv.del("admin_perms:" + emailLower); } catch (delErr) {
        console.log("[AdminWhitelist] Del perms error:", delErr);
      }
      // Downgrade user role
      try {
        var found2 = await _findUserByEmail(emailLower);
        if (found2) {
          await supabaseAdmin.auth.admin.updateUserById(found2.id, {
            user_metadata: Object.assign({}, found2.user_metadata, { role: "user" }),
          });
        }
      } catch (updateErr2) {
        console.log("[AdminWhitelist] Downgrade user metadata error:", updateErr2);
      }
      return c.json({ ok: true, list: filtered });
    } else {
      return c.json({ error: "Action inválida. Use 'add' ou 'remove'." }, 400);
    }
  } catch (e) {
    console.log("Admin-whitelist error:", e);
    return c.json({ error: "Erro ao gerenciar whitelist." }, 500);
  }
});

// Get full admin list with permissions (master only)
app.get(BASE + "/auth/admin-list", async (c) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isMaster) {
      return c.json({ error: "Apenas o admin master pode ver a lista completa." }, 403);
    }
    var list = await _getAdminWhitelist();
    var admins: any[] = [];
    for (var i = 0; i < list.length; i++) {
      var em = list[i];
      var perms = await _getAdminPermissions(em);
      admins.push({
        email: em,
        isMaster: _isMasterEmail(em),
        permissions: perms
      });
    }
    return c.json({ admins: admins, allTabs: ALL_ADMIN_TABS });
  } catch (e) {
    console.log("Admin-list error:", e);
    return c.json({ error: "Erro ao buscar lista de admins." }, 500);
  }
});

// Update admin permissions (master only)
app.post(BASE + "/auth/admin-permissions", async (c) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isMaster) {
      return c.json({ error: "Apenas o admin master pode alterar permissões." }, 403);
    }
    var body = await c.req.json();
    // Input validation
    var apValid = validate(body, {
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      permissions: { required: true, type: "array", maxItems: 50 },
    });
    if (!apValid.ok) {
      return c.json({ error: apValid.errors[0] || "Dados invalidos." }, 400);
    }
    var email = apValid.sanitized.email;
    var permissions = body.permissions;

    // Validate each permission string
    if (Array.isArray(permissions)) {
      for (var pi = 0; pi < permissions.length; pi++) {
        if (typeof permissions[pi] !== "string" || permissions[pi].length > 50) {
          return c.json({ error: "Permissao invalida." }, 400);
        }
      }
    }

    var emailLower = email.toLowerCase().trim();
    if (_isMasterEmail(emailLower)) {
      return c.json({ error: "Não é possível alterar permissões do admin master." }, 400);
    }

    // Verify this email is actually an admin
    var adminList = await _getAdminWhitelist();
    if (adminList.indexOf(emailLower) === -1) {
      return c.json({ error: "Este email não é um administrador." }, 400);
    }

    await _setAdminPermissions(emailLower, permissions);
    console.log("[AdminPerms] Updated permissions for " + emailLower + ": " + permissions.join(", "));
    return c.json({ ok: true, email: emailLower, permissions: permissions });
  } catch (e) {
    console.log("Admin-permissions error:", e);
    return c.json({ error: "Erro ao atualizar permissoes." }, 500);
  }
});

app.get(BASE + "/auth/admin-whitelist", async (c) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) {
      return c.json({ error: "Acesso restrito a administradores." }, 403);
    }
    var list = await _getAdminWhitelist();
    return c.json({ list: list });
  } catch (e) {
    console.log("Admin-whitelist get error:", e);
    return c.json({ error: "Erro ao buscar whitelist." }, 500);
  }
});

// ─── Password Recovery (polling last_sign_in_at) ───
// GoTrue's OTP verification is broken in this project, and the Edge Functions
// Gateway blocks unauthenticated GET requests (401), so we can't use a server
// callback to capture redirect tokens either.
//
// New approach:
// 1. Record the user's current last_sign_in_at before sending the email
// 2. Send recovery email — GoTrue's {{ .ConfirmationURL }} link works fine
// 3. When the user clicks the link GoTrue verifies it and creates a session,
//    which updates last_sign_in_at
// 4. The frontend polls /auth/recovery-status — server detects the change
// 5. Password is changed via admin API (admin.updateUserById)

// Step 1: Send recovery email
app.post(BASE + "/auth/forgot-password", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "forgot");
    if (rlBlock) return rlBlock;
    var fpBody = await c.req.json();
    // Honeypot check
    if (_checkHoneypot(fpBody)) {
      console.log("[Honeypot] Bot detected on forgot-password");
      return c.json({ ok: true, message: "Se este e-mail estiver cadastrado, enviaremos um link de recuperacao." });
    }
    // Input validation via schema
    var fpValid = validateOrError(fpBody, schemas.forgotPassword);
    if (!fpValid.valid) {
      return c.json({ error: fpValid.errors[0] || "Dados invalidos." }, 400);
    }
    var email = fpValid.data.email || "";

    if (!email) {
      return c.json({ error: "Email é obrigatório." }, 400);
    }

    const recoveryId = crypto.randomUUID();
    console.log("Forgot-password: sending for:", email, "rid:", recoveryId);

    // Look up user to get their current last_sign_in_at (efficient single-user lookup)
    let userId: string | null = null;
    let lastSignInBefore: string | null = null;
    try {
      const user = await _findUserByEmail(email);
      userId = user?.id || null;
      lastSignInBefore = user?.last_sign_in_at || null;
      console.log("Forgot-password: userId:", userId, "lastSignInBefore:", lastSignInBefore);
    } catch (lookupErr) {
      console.log("Forgot-password: user lookup error:", lookupErr);
    }

    await kv.set(`recovery:${recoveryId}`, JSON.stringify({
      email,
      userId,
      lastSignInBefore,
      status: "pending",
      created_at: Date.now(),
    }));

    // Send recovery email — redirect goes to the Figma site (we don't need
    // to capture the tokens; we detect the click via last_sign_in_at)
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: "https://cafe-puce-47800704.figma.site/admin/reset-password",
    });

    if (error) {
      console.log("Forgot-password error:", error.message);
    } else {
      console.log("Forgot-password: email sent, rid:", recoveryId);
    }

    // Always respond with sent: true (don't reveal if email exists)
    return c.json({ sent: true, recoveryId });
  } catch (e) {
    console.log("Forgot-password exception:", e);
    return c.json({ error: "Erro interno ao processar recuperação." }, 500);
  }
});

// Step 2: Frontend polls this to check if the link was clicked.
// We detect the click by comparing last_sign_in_at before and after.
app.post(BASE + "/auth/recovery-status", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "recovery_status");
    if (rlBlock) return rlBlock;
    var rsBody = await c.req.json();
    // Input validation
    var rsValid = validate(rsBody, {
      rid: { required: true, type: "string", maxLen: 100 },
    });
    if (!rsValid.ok) return c.json({ status: "not_found" });
    var rid = rsValid.sanitized.rid || "";
    if (!rid) return c.json({ status: "not_found" });

    const raw = await kv.get("recovery:" + rid);
    if (!raw) return c.json({ status: "not_found" });

    const data = JSON.parse(raw as string);

    // Expire after 1 hour
    if (Date.now() - data.created_at > 3600000) {
      await kv.del("recovery:" + rid);
      return c.json({ status: "expired" });
    }

    // Already verified? Return immediately
    if (data.status === "verified") {
      return c.json({ status: "verified" });
    }

    // No userId means the email didn't match a user — keep showing pending
    // (don't reveal if the email exists)
    if (!data.userId) {
      return c.json({ status: "pending" });
    }

    // Check if last_sign_in_at changed
    try {
      const { data: { user }, error: getErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      if (getErr || !user) {
        console.log("Recovery-status: getUserById error:", getErr?.message);
        return c.json({ status: "pending" });
      }

      const currentSignIn = user.last_sign_in_at;
      console.log("Recovery-status poll: before=", data.lastSignInBefore, " current=", currentSignIn);

      // Detect change: either there was no previous sign-in and now there is,
      // or the timestamp has changed
      const changed =
        (!data.lastSignInBefore && currentSignIn) ||
        (data.lastSignInBefore && currentSignIn && currentSignIn !== data.lastSignInBefore);

      if (changed) {
        console.log("Recovery-status: link clicked detected! Marking as verified.");
        await kv.set("recovery:" + rid, JSON.stringify({
          ...data,
          status: "verified",
          verified_at: Date.now(),
        }));
        return c.json({ status: "verified" });
      }
    } catch (pollErr) {
      console.log("Recovery-status: poll error:", pollErr);
    }

    return c.json({ status: "pending" });
  } catch (e) {
    console.log("Recovery-status exception:", e);
    return c.json({ status: "error" });
  }
});

// Step 3: Set new password via admin API (after verification)
app.post(BASE + "/auth/reset-password", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "reset_pw");
    if (rlBlock) return rlBlock;
    var rpBody = await c.req.json();
    // Input validation
    var rpValid = validate(rpBody, {
      rid: { required: true, type: "string", maxLen: 100 },
      newPassword: { required: true, type: "string", minLen: 8, maxLen: 128, sanitize: false },
    });
    if (!rpValid.ok) {
      return c.json({ error: rpValid.errors[0] || "Dados incompletos." }, 400);
    }
    var rid = rpValid.sanitized.rid || "";
    var newPassword = rpValid.sanitized.newPassword || "";
    if (!rid || !newPassword) {
      return c.json({ error: "Dados incompletos." }, 400);
    }
    var pwStrErr = _validatePasswordStrength(newPassword);
    if (pwStrErr) {
      return c.json({ error: pwStrErr }, 400);
    }

    const raw = await kv.get("recovery:" + rid);
    if (!raw) {
      return c.json({ error: "Recuperação não encontrada ou expirada." }, 404);
    }

    const data = JSON.parse(raw as string);

    if (data.status !== "verified") {
      return c.json({ error: "Recuperação ainda não verificada." }, 403);
    }

    if (!data.userId) {
      return c.json({ error: "Usuário não identificado." }, 400);
    }

    // Expire after 1 hour
    if (Date.now() - data.created_at > 3600000) {
      await kv.del("recovery:" + rid);
      return c.json({ error: "Recuperação expirada." }, 410);
    }

    // Update password via admin API
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: newPassword,
    });

    if (updateErr) {
      console.log("Reset-password: updateUserById error:", updateErr.message);
      return c.json({ error: "Erro ao redefinir senha." }, 500);
    }

    // Clean up
    await kv.del("recovery:" + rid);
    console.log("Reset-password: password updated for userId:", data.userId);

    return c.json({ ok: true });
  } catch (e) {
    console.log("Reset-password exception:", e);
    return c.json({ error: "Erro interno ao redefinir senha." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── USER AUTH (public user accounts) ─
// ═══════════════════════════════��═══════

// Signup for regular site users
app.post(BASE + "/auth/user/signup", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "signup");
    if (rlBlock) return rlBlock;
    const body = await c.req.json();
    if (_checkHoneypot(body)) {
      console.log("[Honeypot] Bot detected on user signup");
      return c.json({ ok: true, message: "Se este e-mail estiver disponível, um link de confirmação será enviado." });
    }
    // Input validation via schema
    var vResult = validateOrError(body, schemas.signup);
    if (!vResult.valid) {
      return c.json({ error: vResult.errors[0] || "Dados invalidos." }, 400);
    }
    var email = vResult.data.email || "";
    var password = body.password || ""; // keep raw for auth
    var name = vResult.data.name || "";
    var phone = vResult.data.phone || "";
    var cpf = vResult.data.cpf || "";

    if (!email || !password) {
      return c.json({ error: "Email e senha são obrigatórios." }, 400);
    }
    // Password strength validation
    var pwErr = _validatePasswordStrength(password);
    if (pwErr) {
      return c.json({ error: pwErr }, 400);
    }

    // Check if user already exists (efficient lookup, generic message to prevent email enumeration)
    try {
      const existing = await _findUserByEmail(email);
      if (existing) {
        // Log the real reason server-side, but return generic message
        console.log("User signup: email already exists: " + email);
        return c.json({ ok: true, message: "Se este e-mail estiver disponível, um link de confirmação será enviado." });
      }
    } catch (lookupErr) {
      console.log("User signup: lookup error:", lookupErr);
    }

    // Check for duplicate CPF across existing user profiles
    if (cpf) {
      try {
        const cpfClean = cpf.replace(/\D/g, "");
        if (cpfClean.length === 11) {
          const profiles = await kv.getByPrefix("user_profile:");
          const cpfTaken = profiles?.some((raw: any) => {
            try {
              const p = typeof raw === "string" ? JSON.parse(raw) : raw;
              const existingCpf = (p.cpf || "").replace(/\D/g, "");
              return existingCpf === cpfClean;
            } catch { return false; }
          });
          if (cpfTaken) {
            console.log("User signup: CPF already taken: " + cpfClean);
            return c.json({ ok: true, message: "Se este e-mail estiver disponível, um link de confirmação será enviado." });
          }
        }
      } catch (cpfLookupErr) {
        console.log("User signup: CPF lookup error:", cpfLookupErr);
      }
    }

    // Use signUp via anon client so Supabase sends the confirmation email automatically
    const { data, error } = await supabaseAnon.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || "",
          phone: phone || "",
          role: "user",
        },
        emailRedirectTo: "https://cafe-puce-47800704.figma.site/conta",
      },
    });

    if (error) {
      console.log("User signup error:", error.message);
      // Don't leak specific Supabase error messages to frontend
      return c.json({ error: "Erro ao criar conta. Tente novamente." }, 400);
    }

    if (!data.user?.id) {
      console.log("User signup: no user returned");
      return c.json({ error: "Erro ao criar conta. Tente novamente." }, 500);
    }

    // Assign random robot avatar
    var avatarIds = ["robot1","robot2","robot3","robot4","robot5","robot6","robot7","robot8","robot9","robot10","robot11","robot12","robot13","robot14","robot15","robot16"];
    var randomAvatar = avatarIds[Math.floor(Math.random() * avatarIds.length)];

    // Store user profile in KV for additional data
    const userProfile = {
      id: data.user.id,
      email: data.user.email,
      name: name || "",
      phone: phone || "",
      cpf: cpf || "",
      avatarId: randomAvatar,
      customAvatarUrl: null,
      created_at: new Date().toISOString(),
    };
    await kv.set(`user_profile:${data.user.id}`, JSON.stringify(userProfile));

    // Auto-sync to SIGE (non-blocking, best-effort)
    let sigeSynced = false;
    let sigeCustomerId: string | null = null;
    try {
      const rawConfig = await kv.get("sige_api_config");
      const rawToken = await kv.get("sige_api_token");
      if (rawConfig && rawToken) {
        const cpfClean = (cpf || "").replace(/\D/g, "");

        // First, check if customer already exists in SIGE by CPF
        let existingFound = false;
        if (cpfClean) {
          const existing = await findSigeCustomerByCpf(cpfClean);
          if (existing.found && existing.sigeCustomerId) {
            console.log(`User signup: SIGE customer already exists for CPF ${cpfClean}: ${existing.sigeCustomerId}, linking`);
            await saveSigeCustomerMapping(data.user.id, existing.sigeCustomerId, existing.customerData, userProfile);
            sigeCustomerId = existing.sigeCustomerId;
            sigeSynced = true;
            existingFound = true;
          }
        }

        if (!existingFound) {
          // Create new customer using the proper payload builder
          const sigePayload = buildSigeCustomerPayload(userProfile);
          console.log("User signup: auto-syncing to SIGE...", JSON.stringify(sigePayload));
          const sigeResult = await sigeAuthFetch("POST", "/customer", sigePayload);
          if (sigeResult.ok) {
            const sigeDados = sigeResult.data?.dados || sigeResult.data?.data || sigeResult.data;
            sigeCustomerId = sigeDados?.codCadastro || sigeDados?.id || sigeDados?.codigo ||
              (Array.isArray(sigeDados) && sigeDados[0]?.codCadastro) || null;
            if (sigeCustomerId) sigeCustomerId = String(sigeCustomerId);
            await saveSigeCustomerMapping(data.user.id, sigeCustomerId, sigeDados, userProfile);
            sigeSynced = true;
            console.log(`User signup: SIGE auto-sync SUCCESS -> customer ${sigeCustomerId}`);
          } else {
            const errMsg = sigeResult.data?.message || sigeResult.data?.error || "";
            console.log("User signup: SIGE auto-sync create failed:", sigeResult.status, errMsg);
            // If duplicate CPF error, try linking existing
            if (cpfClean && (errMsg.toLowerCase().includes("cpf") || errMsg.toLowerCase().includes("cadastro"))) {
              const fallback = await findSigeCustomerByCpf(cpfClean);
              if (fallback.found && fallback.sigeCustomerId) {
                console.log(`User signup: SIGE fallback link to ${fallback.sigeCustomerId}`);
                await saveSigeCustomerMapping(data.user.id, fallback.sigeCustomerId, fallback.customerData, userProfile);
                sigeCustomerId = fallback.sigeCustomerId;
                sigeSynced = true;
              }
            }
          }
        }
      } else {
        console.log("User signup: SIGE not configured, skipping auto-sync");
      }
    } catch (sigeErr) {
      console.log("User signup: SIGE auto-sync exception (non-fatal):", sigeErr);
    }

    console.log("User signup: created user:", data.user.id, email, "- confirmation email sent");
    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: name || "",
      },
      emailConfirmationRequired: true,
      sigeSynced,
      sigeCustomerId,
    }, 201);
  } catch (e) {
    console.log("User signup exception:", e);
    return c.json({ error: "Erro interno ao criar conta." }, 500);
  }
});

// Get user profile (requires auth)
app.get(BASE + "/auth/user/me", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !user) {
      return c.json({ error: "Usuário não encontrado." }, 401);
    }

    // Get extended profile from KV
    let profile: any = {};
    try {
      const raw = await kv.get(`user_profile:${userId}`);
      if (raw) {
        profile = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}

    // Auto-assign random avatar for users who don't have one (e.g. Google OAuth)
    if (!profile.avatarId) {
      try {
        var _avIds = ["robot1","robot2","robot3","robot4","robot5","robot6","robot7","robot8","robot9","robot10","robot11","robot12","robot13","robot14","robot15","robot16"];
        profile.avatarId = _avIds[Math.floor(Math.random() * _avIds.length)];
        profile.id = profile.id || userId;
        profile.email = profile.email || user.email;
        profile.updated_at = new Date().toISOString();
        await kv.set("user_profile:" + userId, JSON.stringify(profile));
        console.log("Auto-assigned avatar " + profile.avatarId + " to user " + userId);
      } catch (_avErr) {
        console.log("Auto-assign avatar error (non-fatal):", _avErr);
      }
    }

    return c.json({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || profile.name || "",
      phone: user.user_metadata?.phone || profile.phone || "",
      role: user.user_metadata?.role || "user",
      cpf: profile.cpf || "",
      address: profile.address || "",
      city: profile.city || "",
      state: profile.state || "",
      cep: profile.cep || "",
      avatarId: profile.avatarId || null,
      customAvatarUrl: profile.customAvatarUrl || null,
      created_at: user.created_at,
    });
  } catch (e) {
    console.log("User me exception:", e);
    return c.json({ error: _safeError("Erro ao buscar perfil", e) }, 500);
  }
});

// Update user profile (requires auth)
app.put(BASE + "/auth/user/profile", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }

    const body = await c.req.json();
    // Input validation via schema
    var profValid = validateOrError(body, schemas.profileUpdate);
    if (!profValid.valid) {
      return c.json({ error: profValid.errors[0] || "Dados invalidos." }, 400);
    }
    var name = profValid.data.name || _maxLen((body.name || "").trim(), 150);
    var phone = profValid.data.phone || _maxLen((body.phone || "").trim(), 30);
    var cpf = profValid.data.cpf || _maxLen((body.cpf || "").trim(), 20);
    var address = _maxLen(sanitizeInput(body.address || "").trim(), 300);
    var city = _maxLen(sanitizeInput(body.city || "").trim(), 100);
    var state = _maxLen(sanitizeInput(body.state || "").trim(), 2);
    var cep = _maxLen(sanitizeInput(body.cep || "").trim(), 10);

    // Update user_metadata in Supabase Auth
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        name: name,
        phone: phone,
        role: "user",
      },
    });

    if (updateErr) {
      console.log("User profile update auth error:", updateErr.message);
      return c.json({ error: "Erro ao atualizar perfil." }, 500);
    }

    // Update KV profile
    let existing: any = {};
    try {
      const raw = await kv.get(`user_profile:${userId}`);
      if (raw) {
        existing = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}

    const updatedProfile = {
      ...existing,
      id: userId,
      name: name || "",
      phone: phone || "",
      cpf: cpf || "",
      address: address || "",
      city: city || "",
      state: state || "",
      cep: cep || "",
      updated_at: new Date().toISOString(),
    };

    await kv.set(`user_profile:${userId}`, JSON.stringify(updatedProfile));
    console.log("User profile updated:", userId);

    return c.json({ ok: true, profile: updatedProfile });
  } catch (e) {
    console.log("User profile update exception:", e);
    return c.json({ error: _safeError("Erro ao atualizar perfil", e) }, 500);
  }
});

// ─── User Avatar (select themed or upload custom) ───

// PUT /auth/user/avatar — select a themed avatar by ID
app.put(BASE + "/auth/user/avatar", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Token invalido ou expirado." }, 401);
    var body = await c.req.json();
    // Input validation for avatar
    var avatarValid = validate(body, {
      avatarId: { required: true, type: "string", maxLen: 20 },
    });
    if (!avatarValid.ok) {
      return c.json({ error: "Dados invalidos." }, 400);
    }
    var avatarId = avatarValid.sanitized.avatarId || "";
    var validIds = ["robot1","robot2","robot3","robot4","robot5","robot6","robot7","robot8","robot9","robot10","robot11","robot12","robot13","robot14","robot15","robot16"];
    if (!validIds.includes(avatarId)) {
      return c.json({ error: "Avatar invalido." }, 400);
    }
    var existing: any = {};
    try {
      var raw = await kv.get("user_profile:" + userId);
      if (raw) existing = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_e) {}
    // Remove old custom avatar if exists
    if (existing.customAvatarUrl && existing.customAvatarFilename) {
      try {
        await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([existing.customAvatarFilename]);
      } catch (_e) {}
    }
    existing.avatarId = avatarId;
    existing.customAvatarUrl = null;
    existing.customAvatarFilename = null;
    existing.updated_at = new Date().toISOString();
    await kv.set("user_profile:" + userId, JSON.stringify(existing));
    return c.json({ ok: true, avatarId: avatarId, customAvatarUrl: null });
  } catch (e) {
    console.log("User avatar update exception:", e);
    return c.json({ error: "Erro ao atualizar avatar." }, 500);
  }
});

// POST /auth/user/avatar/upload — upload custom photo
app.post(BASE + "/auth/user/avatar/upload", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Token invalido ou expirado." }, 401);
    var formData = await c.req.formData();
    var file = formData.get("file") as File | null;
    if (!file) return c.json({ error: "Nenhum arquivo enviado." }, 400);
    var validTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      return c.json({ error: "Tipo nao permitido: " + file.type + ". Use PNG, JPEG, WebP ou GIF." }, 400);
    }
    if (file.size > 2 * 1024 * 1024) {
      return c.json({ error: "Arquivo muito grande. Maximo: 2MB." }, 400);
    }
    var extMap: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
    var ext = extMap[file.type] || "png";
    var filename = "user-avatar-" + userId + "." + ext;
    var arrayBuffer = await file.arrayBuffer();
    // Remove old avatar files for this user
    try {
      var oldExts = ["png", "jpg", "webp", "gif"];
      var toRemove = oldExts.map(function (e) { return "user-avatar-" + userId + "." + e; });
      await supabaseAdmin.storage.from(ASSETS_BUCKET).remove(toRemove);
    } catch (_e) {}
    var uploadResult = await supabaseAdmin.storage.from(ASSETS_BUCKET).upload(filename, arrayBuffer, { contentType: file.type, upsert: true });
    if (uploadResult.error) {
      console.log("User avatar upload error:", uploadResult.error.message);
      return c.json({ error: "Erro no upload da imagem." }, 500);
    }
    // Generate signed URL
    var signedResult = await supabaseAdmin.storage.from(ASSETS_BUCKET).createSignedUrl(filename, 86400 * 365);
    var url = signedResult.data?.signedUrl || (Deno.env.get("SUPABASE_URL") + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + filename);
    // Update profile
    var existing: any = {};
    try {
      var raw = await kv.get("user_profile:" + userId);
      if (raw) existing = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_e) {}
    existing.customAvatarUrl = url;
    existing.customAvatarFilename = filename;
    existing.updated_at = new Date().toISOString();
    await kv.set("user_profile:" + userId, JSON.stringify(existing));
    return c.json({ ok: true, customAvatarUrl: url, filename: filename });
  } catch (e) {
    console.log("User avatar upload exception:", e);
    return c.json({ error: "Erro no upload do avatar." }, 500);
  }
});

// DELETE /auth/user/avatar/custom — remove custom photo, revert to themed
app.delete(BASE + "/auth/user/avatar/custom", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Token invalido ou expirado." }, 401);
    var existing: any = {};
    try {
      var raw = await kv.get("user_profile:" + userId);
      if (raw) existing = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_e) {}
    if (existing.customAvatarFilename) {
      try {
        await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([existing.customAvatarFilename]);
      } catch (_e) {}
    }
    existing.customAvatarUrl = null;
    existing.customAvatarFilename = null;
    existing.updated_at = new Date().toISOString();
    await kv.set("user_profile:" + userId, JSON.stringify(existing));
    return c.json({ ok: true, avatarId: existing.avatarId || "robot1" });
  } catch (e) {
    console.log("User avatar delete exception:", e);
    return c.json({ error: "Erro ao remover avatar." }, 500);
  }
});

// ─── User Addresses CRUD ───
// Get all addresses for the user
app.get(BASE + "/auth/user/addresses", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }
    let addresses: any[] = [];
    try {
      const raw = await kv.get("user_addresses:" + userId);
      if (raw) {
        addresses = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}

    // Auto-migrate: if no addresses but user has old-style profile address, create one
    if (addresses.length === 0) {
      try {
        const profRaw = await kv.get("user_profile:" + userId);
        if (profRaw) {
          const prof = typeof profRaw === "string" ? JSON.parse(profRaw) : profRaw;
          if (prof.address && prof.city && prof.state && prof.cep) {
            var migratedAddr = {
              id: crypto.randomUUID(),
              label: "Principal",
              street: prof.address || "",
              number: "",
              complement: "",
              neighborhood: "",
              city: prof.city || "",
              state: prof.state || "",
              cep: (prof.cep || "").replace(/\D/g, ""),
              isDefault: true,
            };
            addresses = [migratedAddr];
            await kv.set("user_addresses:" + userId, JSON.stringify(addresses));
            console.log("Auto-migrated profile address for user:", userId);
          }
        }
      } catch (migErr) {
        console.log("Address migration error (non-fatal):", migErr);
      }
    }

    return c.json({ addresses: addresses });
  } catch (e) {
    console.log("Get addresses exception:", e);
    return c.json({ error: _safeError("Erro ao buscar endereços", e) }, 500);
  }
});

// Add a new address
app.post(BASE + "/auth/user/addresses", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }
    const body = await c.req.json();
    // Input validation via schema
    var addrValid = validateOrError(body, schemas.address);
    if (!addrValid.valid) {
      return c.json({ error: addrValid.errors[0] || "Endereco invalido." }, 400);
    }
    var newAddr = {
      id: crypto.randomUUID(),
      label: (addrValid.data.label || "Endereço"),
      street: addrValid.data.street || "",
      number: addrValid.data.number || "",
      complement: addrValid.data.complement || "",
      neighborhood: addrValid.data.neighborhood || "",
      city: addrValid.data.city || "",
      state: addrValid.data.state || "",
      cep: (addrValid.data.cep || "").replace(/\D/g, ""),
      isDefault: !!body.isDefault,
    };

    if (!newAddr.street || !newAddr.city || !newAddr.state || newAddr.cep.length < 8) {
      return c.json({ error: "Endereço incompleto. Preencha rua, cidade, estado e CEP." }, 400);
    }

    let addresses: any[] = [];
    try {
      const raw = await kv.get("user_addresses:" + userId);
      if (raw) {
        addresses = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}

    if (addresses.length >= 10) {
      return c.json({ error: "Limite de 10 endereços atingido." }, 400);
    }

    // If this is default, clear other defaults
    if (newAddr.isDefault) {
      for (var i = 0; i < addresses.length; i++) {
        addresses[i].isDefault = false;
      }
    }
    // If first address, make it default
    if (addresses.length === 0) {
      newAddr.isDefault = true;
    }

    addresses.push(newAddr);
    await kv.set("user_addresses:" + userId, JSON.stringify(addresses));

    // Also update the main profile with this address for backward compat
    try {
      var profRaw2 = await kv.get("user_profile:" + userId);
      var prof2 = profRaw2 ? (typeof profRaw2 === "string" ? JSON.parse(profRaw2) : profRaw2) : {};
      var fullAddr = newAddr.street;
      if (newAddr.number) fullAddr = fullAddr + ", " + newAddr.number;
      if (newAddr.complement) fullAddr = fullAddr + " - " + newAddr.complement;
      if (newAddr.neighborhood) fullAddr = fullAddr + ", " + newAddr.neighborhood;
      prof2.address = fullAddr;
      prof2.city = newAddr.city;
      prof2.state = newAddr.state;
      prof2.cep = newAddr.cep;
      await kv.set("user_profile:" + userId, JSON.stringify(prof2));
    } catch {}

    console.log("Address added for user:", userId, newAddr.id);
    return c.json({ ok: true, address: newAddr, addresses: addresses });
  } catch (e) {
    console.log("Add address exception:", e);
    return c.json({ error: _safeError("Erro ao adicionar endereço", e) }, 500);
  }
});

// Update an address
app.put(BASE + "/auth/user/addresses/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }
    var addrId = c.req.param("id");
    if (!addrId || addrId.length > 100) return c.json({ error: "ID de endereço invalido." }, 400);
    const body = await c.req.json();
    // Input validation for address update (all fields optional since it's a partial update)
    var addrUpValid = validate(body, {
      label: { maxLen: 50 },
      cep: { maxLen: 10, custom: function (v: any) { if (v && !(/^\d{5}-?\d{3}$/).test(String(v))) return "CEP invalido."; return null; } },
      street: { maxLen: 200 },
      number: { maxLen: 20 },
      complement: { maxLen: 100 },
      neighborhood: { maxLen: 100 },
      city: { maxLen: 100 },
      state: { maxLen: 2 },
      isDefault: { type: "boolean" },
    });
    if (!addrUpValid.ok) {
      return c.json({ error: addrUpValid.errors[0] || "Dados de endereço invalidos." }, 400);
    }
    var sAddr = addrUpValid.sanitized;

    let addresses: any[] = [];
    try {
      const raw = await kv.get("user_addresses:" + userId);
      if (raw) {
        addresses = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}

    var idx = -1;
    for (var i = 0; i < addresses.length; i++) {
      if (addresses[i].id === addrId) { idx = i; break; }
    }
    if (idx === -1) {
      return c.json({ error: "Endereço não encontrado." }, 404);
    }

    var updated = {
      ...addresses[idx],
      label: sAddr.label || addresses[idx].label,
      street: sAddr.street || addresses[idx].street,
      number: sAddr.number !== undefined ? sAddr.number : addresses[idx].number,
      complement: sAddr.complement !== undefined ? sAddr.complement : addresses[idx].complement,
      neighborhood: sAddr.neighborhood !== undefined ? sAddr.neighborhood : addresses[idx].neighborhood,
      city: sAddr.city || addresses[idx].city,
      state: sAddr.state || addresses[idx].state,
      cep: sAddr.cep ? String(sAddr.cep).replace(/\D/g, "") : addresses[idx].cep,
      isDefault: sAddr.isDefault !== undefined ? !!sAddr.isDefault : addresses[idx].isDefault,
    };

    if (updated.isDefault) {
      for (var j = 0; j < addresses.length; j++) {
        if (j !== idx) addresses[j].isDefault = false;
      }
    }

    addresses[idx] = updated;
    await kv.set("user_addresses:" + userId, JSON.stringify(addresses));
    console.log("Address updated for user:", userId, addrId);
    return c.json({ ok: true, address: updated, addresses: addresses });
  } catch (e) {
    console.log("Update address exception:", e);
    return c.json({ error: _safeError("Erro ao atualizar endereço", e) }, 500);
  }
});

// Delete an address
app.delete(BASE + "/auth/user/addresses/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }
    var addrId = (c.req.param("id") || "").substring(0, 100);
    if (!addrId) return c.json({ error: "ID invalido." }, 400);

    let addresses: any[] = [];
    try {
      const raw = await kv.get("user_addresses:" + userId);
      if (raw) {
        addresses = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}

    var filtered = [];
    for (var i = 0; i < addresses.length; i++) {
      if (addresses[i].id !== addrId) filtered.push(addresses[i]);
    }

    // If we removed the default, make the first one default
    var hasDefault = false;
    for (var j = 0; j < filtered.length; j++) {
      if (filtered[j].isDefault) { hasDefault = true; break; }
    }
    if (!hasDefault && filtered.length > 0) {
      filtered[0].isDefault = true;
    }

    await kv.set("user_addresses:" + userId, JSON.stringify(filtered));
    console.log("Address deleted for user:", userId, addrId);
    return c.json({ ok: true, addresses: filtered });
  } catch (e) {
    console.log("Delete address exception:", e);
    return c.json({ error: _safeError("Erro ao remover endereço", e) }, 500);
  }
});

// ─── User Favorites (Wishlist) ───

// Get all favorites for the user
app.get(BASE + "/auth/user/favorites", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }
    let favorites: any[] = [];
    try {
      const raw = await kv.get("user_favorites:" + userId);
      if (raw) {
        favorites = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}
    return c.json({ favorites: favorites });
  } catch (e) {
    console.log("Get favorites exception:", e);
    return c.json({ error: _safeError("Erro ao buscar favoritos", e) }, 500);
  }
});

// Add a product to favorites
app.post(BASE + "/auth/user/favorites", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }
    const body = await c.req.json();
    // Input validation for favorites
    var favValid = validate(body, {
      sku: { required: true, type: "string", maxLen: 100 },
      titulo: { type: "string", maxLen: 300 },
    });
    if (!favValid.ok) {
      return c.json({ error: favValid.errors[0] || "Dados invalidos." }, 400);
    }
    var sku = favValid.sanitized.sku || "";
    var titulo = favValid.sanitized.titulo || "";
    if (!sku) {
      return c.json({ error: "SKU obrigatorio." }, 400);
    }

    let favorites: any[] = [];
    try {
      const raw = await kv.get("user_favorites:" + userId);
      if (raw) {
        favorites = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}

    // Check if already exists
    var exists = false;
    for (var i = 0; i < favorites.length; i++) {
      if (favorites[i].sku === sku) { exists = true; break; }
    }
    if (exists) {
      return c.json({ ok: true, favorites: favorites, message: "Já está nos favoritos." });
    }

    // Limit to 50 favorites
    if (favorites.length >= 50) {
      return c.json({ error: "Limite de 50 favoritos atingido." }, 400);
    }

    favorites.push({
      sku: sku,
      titulo: titulo,
      addedAt: new Date().toISOString(),
    });

    await kv.set("user_favorites:" + userId, JSON.stringify(favorites));
    console.log("Favorite added for user:", userId, sku);
    return c.json({ ok: true, favorites: favorites });
  } catch (e) {
    console.log("Add favorite exception:", e);
    return c.json({ error: _safeError("Erro ao adicionar favorito", e) }, 500);
  }
});

// Remove a product from favorites
app.delete(BASE + "/auth/user/favorites/:sku", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }
    var sku = decodeURIComponent(c.req.param("sku")).substring(0, 100);
    if (!sku) return c.json({ error: "SKU invalido." }, 400);

    let favorites: any[] = [];
    try {
      const raw = await kv.get("user_favorites:" + userId);
      if (raw) {
        favorites = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}

    var filtered = [];
    for (var i = 0; i < favorites.length; i++) {
      if (favorites[i].sku !== sku) filtered.push(favorites[i]);
    }

    await kv.set("user_favorites:" + userId, JSON.stringify(filtered));
    console.log("Favorite removed for user:", userId, sku);
    return c.json({ ok: true, favorites: filtered });
  } catch (e) {
    console.log("Remove favorite exception:", e);
    return c.json({ error: _safeError("Erro ao remover favorito", e) }, 500);
  }
});

// User password change (requires auth)
app.post(BASE + "/auth/user/change-password", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "change_pw");
    if (rlBlock) return rlBlock;
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }

    var cpBody = await c.req.json();
    // Input validation
    var cpValid = validateOrError(cpBody, schemas.changePassword);
    if (!cpValid.valid) {
      return c.json({ error: cpValid.errors[0] || "Dados invalidos." }, 400);
    }
    var currentPassword = cpBody.currentPassword;
    var newPassword = cpBody.newPassword;

    // SECURITY: Require current password to prevent account takeover from stolen JWT
    if (!currentPassword) {
      return c.json({ error: "Senha atual é obrigatória." }, 400);
    }
    var cpwUserResult = await supabaseAdmin.auth.admin.getUserById(userId);
    var cpwUserEmail = cpwUserResult.data?.user?.email;
    if (!cpwUserEmail) {
      return c.json({ error: "Usuário não encontrado." }, 404);
    }
    // Create a temporary anon client to verify current password
    var cpwAnonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    var { error: cpwSignInErr } = await cpwAnonClient.auth.signInWithPassword({
      email: cpwUserEmail,
      password: currentPassword,
    });
    if (cpwSignInErr) {
      console.log("User change-password: current password mismatch for " + userId);
      return c.json({ error: "Senha atual incorreta." }, 403);
    }

    var cpwErr = _validatePasswordStrength(newPassword);
    if (cpwErr) {
      return c.json({ error: cpwErr }, 400);
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateErr) {
      console.log("User change-password error:", updateErr.message);
      return c.json({ error: "Erro ao alterar senha." }, 500);
    }

    console.log("User password changed:", userId);
    return c.json({ ok: true });
  } catch (e) {
    console.log("User change-password exception:", e);
    return c.json({ error: _safeError("Erro ao alterar senha", e) }, 500);
  }
});

// User forgot password (recovery email)
app.post(BASE + "/auth/user/forgot-password", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "forgot");
    if (rlBlock) return rlBlock;
    const body = await c.req.json();
    if (_checkHoneypot(body)) {
      console.log("[Honeypot] Bot detected on user forgot-password");
      return c.json({ sent: true, recoveryId: "ok" });
    }
    // Input validation
    var vResult = validateOrError(body, schemas.forgotPassword);
    if (!vResult.valid) {
      return c.json({ error: vResult.errors[0] || "Dados invalidos." }, 400);
    }
    var email = vResult.data.email || "";

    if (!email) {
      return c.json({ error: "Email é obrigatório." }, 400);
    }

    const recoveryId = crypto.randomUUID();
    console.log("User forgot-password: sending for:", email, "rid:", recoveryId);

    let userId: string | null = null;
    let lastSignInBefore: string | null = null;
    try {
      const user = await _findUserByEmail(email);
      userId = user?.id || null;
      lastSignInBefore = user?.last_sign_in_at || null;
    } catch (lookupErr) {
      console.log("User forgot-password: user lookup error:", lookupErr);
    }

    await kv.set(`recovery:${recoveryId}`, JSON.stringify({
      email,
      userId,
      lastSignInBefore,
      status: "pending",
      created_at: Date.now(),
      type: "user",
    }));

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: "https://cafe-puce-47800704.figma.site/conta/redefinir-senha",
    });

    if (error) {
      console.log("User forgot-password error:", error.message);
    } else {
      console.log("User forgot-password: email sent, rid:", recoveryId);
    }

    return c.json({ sent: true, recoveryId });
  } catch (e) {
    console.log("User forgot-password exception:", e);
    return c.json({ error: "Erro interno ao processar recuperação." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── ADMIN: CLIENTS ───────────────────
// ═══════════════════════════════════════

// List all registered clients (requires admin auth)
app.get(BASE + "/auth/admin/clients", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Não autorizado." }, 401);
    }

    // Fetch all user profiles from KV
    const profilesRaw = await kv.getByPrefix("user_profile:");
    const profiles: any[] = [];

    if (Array.isArray(profilesRaw)) {
      for (const raw of profilesRaw) {
        try {
          const p = typeof raw === "string" ? JSON.parse(raw) : raw;
          profiles.push(p);
        } catch {
          // skip invalid entries
        }
      }
    }

    // Enrich with Supabase Auth data (paginated to avoid memory issues)
    let authUsers: any[] = [];
    try {
      authUsers = await _listAllAuthUsersPaginated();
    } catch (e) {
      console.log("Admin clients: listUsers error:", e);
    }

    // Build auth lookup map by id
    const authMap = new Map<string, any>();
    for (const u of authUsers) {
      authMap.set(u.id, u);
    }

    // Merge profile data with auth data
    const clients = profiles.map((p: any) => {
      const authUser = authMap.get(p.id);
      return {
        id: p.id,
        email: authUser?.email || p.email || "",
        name: p.name || authUser?.user_metadata?.name || "",
        phone: p.phone || "",
        cpf: p.cpf || "",
        address: p.address || "",
        city: p.city || "",
        state: p.state || "",
        cep: p.cep || "",
        created_at: p.created_at || authUser?.created_at || "",
        email_confirmed: !!authUser?.email_confirmed_at,
        last_sign_in: authUser?.last_sign_in_at || null,
      };
    });

    // Sort by created_at descending (newest first)
    clients.sort((a: any, b: any) => {
      const da = new Date(a.created_at).getTime() || 0;
      const db = new Date(b.created_at).getTime() || 0;
      return db - da;
    });

    console.log("Admin clients: returning", clients.length, "clients");
    return c.json({ clients, total: clients.length });
  } catch (e) {
    console.log("Admin clients exception:", e);
    return c.json({ error: "Erro ao buscar clientes." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── PRODUCTS ─────────────────────────
// ═══════════════════════════════════════

app.get(BASE + "/products", async (c) => {
  try {
    const products = await kv.getByPrefix("product:");
    return c.json(products);
  } catch (e) {
    console.log("Error fetching products:", e);
    return c.json({ error: "Erro ao buscar produtos." }, 500);
  }
});

app.get(BASE + "/products/:id", async (c) => {
  try {
    const id = (c.req.param("id") || "").substring(0, 200);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    const product = await kv.get(`product:${id}`);
    if (!product) {
      return c.json({ error: "Produto nao encontrado." }, 404);
    }
    return c.json(product);
  } catch (e) {
    console.log("Error fetching product:", e);
    return c.json({ error: "Erro ao buscar produto." }, 500);
  }
});

app.post(BASE + "/products", async (c) => {
  try {
    const body = await c.req.json();
    // Input validation for product
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    var prodCreateValid = validate(body, {
      name: { type: "string", maxLen: 500 },
      sku: { type: "string", maxLen: 100 },
      description: { type: "string", maxLen: 10000 },
      imageUrl: { type: "string", maxLen: 2000 },
      category: { type: "string", maxLen: 200 },
      brand: { type: "string", maxLen: 200 },
    });
    if (!prodCreateValid.ok) {
      return c.json({ error: prodCreateValid.errors[0] || "Dados invalidos." }, 400);
    }
    const id = body.id || "prod_" + Date.now();
    var prodFields = ["name","sku","price","description","imageUrl","category","active","featured","order","tags","brand","weight","width","height","length"];
    var product: Record<string, any> = { id: id };
    for (var pk of prodFields) { if (body[pk] !== undefined) product[pk] = body[pk]; }
    await kv.set("product:" + id, product);
    return c.json(product, 201);
  } catch (e) {
    console.log("Error creating product:", e);
    return c.json({ error: "Erro ao criar produto." }, 500);
  }
});

app.put(BASE + "/products/:id", async (c) => {
  try {
    const id = c.req.param("id");
    if (!id || id.length > 200) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    // Input validation for product update
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    var prodUpdateValid = validate(body, {
      name: { type: "string", maxLen: 500 },
      sku: { type: "string", maxLen: 100 },
      description: { type: "string", maxLen: 10000 },
      imageUrl: { type: "string", maxLen: 2000 },
      category: { type: "string", maxLen: 200 },
      brand: { type: "string", maxLen: 200 },
    });
    if (!prodUpdateValid.ok) {
      return c.json({ error: prodUpdateValid.errors[0] || "Dados invalidos." }, 400);
    }
    const existing = await kv.get("product:" + id);
    if (!existing) {
      return c.json({ error: "Produto nao encontrado para atualizacao." }, 404);
    }
    var prodFields2 = ["name","sku","price","description","imageUrl","category","active","featured","order","tags","brand","weight","width","height","length"];
    var updated: Record<string, any> = { ...(typeof existing === "object" && existing ? existing : {}), id: id };
    for (var pk2 of prodFields2) { if (body[pk2] !== undefined) updated[pk2] = body[pk2]; }
    await kv.set("product:" + id, updated);
    return c.json(updated);
  } catch (e) {
    console.log("Error updating product:", e);
    return c.json({ error: "Erro ao atualizar produto." }, 500);
  }
});

app.delete(BASE + "/products/:id", async (c) => {
  try {
    const id = (c.req.param("id") || "").substring(0, 200);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    await kv.del(`product:${id}`);
    return c.json({ deleted: true });
  } catch (e) {
    console.log("Error deleting product:", e);
    return c.json({ error: "Erro ao excluir produto." }, 500);
  }
});

// ═══════════════════════════════════���═══
// ─── CATEGORIES ───────────────────────
// ═══════════════════════════════════════

app.get(BASE + "/categories", async (c) => {
  try {
    const categories = await kv.getByPrefix("category:");
    return c.json(categories);
  } catch (e) {
    console.log("Error fetching categories:", e);
    return c.json({ error: "Erro ao buscar categorias." }, 500);
  }
});

app.post(BASE + "/categories", async (c) => {
  try {
    const body = await c.req.json();
    // Input validation for category
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    var catCreateValid = validate(body, {
      name: { type: "string", maxLen: 200 },
      slug: { type: "string", maxLen: 200 },
      parentId: { type: "string", maxLen: 200 },
      description: { type: "string", maxLen: 5000 },
      imageUrl: { type: "string", maxLen: 2000 },
      icon: { type: "string", maxLen: 200 },
    });
    if (!catCreateValid.ok) {
      return c.json({ error: catCreateValid.errors[0] || "Dados invalidos." }, 400);
    }
    const id = body.id || "cat_" + Date.now();
    var catFields = ["name","slug","parentId","order","active","imageUrl","description","icon","featured"];
    var category: Record<string, any> = { id: id };
    for (var ck of catFields) { if (body[ck] !== undefined) category[ck] = body[ck]; }
    await kv.set("category:" + id, category);
    return c.json(category, 201);
  } catch (e) {
    console.log("Error creating category:", e);
    return c.json({ error: "Erro ao criar categoria." }, 500);
  }
});

app.put(BASE + "/categories/:id", async (c) => {
  try {
    const id = c.req.param("id");
    if (!id || id.length > 200) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    // Input validation for category update
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    var catUpdateValid = validate(body, {
      name: { type: "string", maxLen: 200 },
      slug: { type: "string", maxLen: 200 },
      parentId: { type: "string", maxLen: 200 },
      description: { type: "string", maxLen: 5000 },
      imageUrl: { type: "string", maxLen: 2000 },
      icon: { type: "string", maxLen: 200 },
    });
    if (!catUpdateValid.ok) {
      return c.json({ error: catUpdateValid.errors[0] || "Dados invalidos." }, 400);
    }
    const existing = await kv.get("category:" + id);
    if (!existing) {
      return c.json({ error: "Categoria nao encontrada para atualizacao." }, 404);
    }
    var catFields2 = ["name","slug","parentId","order","active","imageUrl","description","icon","featured"];
    var updated: Record<string, any> = { ...(typeof existing === "object" && existing ? existing : {}), id: id };
    for (var ck2 of catFields2) { if (body[ck2] !== undefined) updated[ck2] = body[ck2]; }
    await kv.set("category:" + id, updated);
    return c.json(updated);
  } catch (e) {
    console.log("Error updating category:", e);
    return c.json({ error: "Erro ao atualizar categoria." }, 500);
  }
});

app.delete(BASE + "/categories/:id", async (c) => {
  try {
    const id = (c.req.param("id") || "").substring(0, 200);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    await kv.del(`category:${id}`);
    return c.json({ deleted: true });
  } catch (e) {
    console.log("Error deleting category:", e);
    return c.json({ error: "Erro ao excluir categoria." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── CATEGORY TREE (hierarchical) ─────
// ═══════════════════════════════════════

app.get(BASE + "/category-tree", async (c) => {
  try {
    const tree = await kv.get("category_tree");
    if (!tree) {
      return c.json([]);
    }
    return c.json(tree);
  } catch (e) {
    console.log("Error fetching category tree:", e);
    return c.json({ error: "Erro ao buscar arvore de categorias." }, 500);
  }
});

app.put(BASE + "/category-tree", async (c) => {
  try {
    const body = await c.req.json();
    // Input validation: category tree must be an array
    if (!Array.isArray(body)) {
      return c.json({ error: "Arvore de categorias deve ser um array." }, 400);
    }
    if (JSON.stringify(body).length > 500000) {
      return c.json({ error: "Arvore de categorias excede o tamanho maximo." }, 400);
    }
    await kv.set("category_tree", body);
    invalidateHomepageCache();
    invalidateMetaCache();
    return c.json(body);
  } catch (e) {
    console.log("Error saving category tree:", e);
    return c.json({ error: "Erro ao salvar arvore de categorias." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── MESSAGES ─────────────────────────
// ══════════════════════════════════════

app.get(BASE + "/messages", async (c) => {
  try {
    const messages = await kv.getByPrefix("message:");
    return c.json(messages);
  } catch (e) {
    console.log("Error fetching messages:", e);
    return c.json({ error: "Erro ao buscar mensagens." }, 500);
  }
});

app.post(BASE + "/messages", async (c) => {
  try {
    var rlBlock = _checkAuthRateLimit(c, "forgot");
    if (rlBlock) return rlBlock;
    const body = await c.req.json();
    if (_checkHoneypot(body)) {
      console.log("[Honeypot] Bot detected on contact form");
      return c.json({ id: "ok", read: false, date: new Date().toLocaleString("pt-BR") }, 201);
    }

    // Input validation for contact form
    var msgValid = validate(body, {
      name: { required: true, type: "string", minLen: 2, maxLen: 150 },
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      phone: { type: "string", maxLen: 30 },
      subject: { type: "string", maxLen: 300 },
      message: { required: true, type: "string", minLen: 5, maxLen: 5000 },
    });
    if (!msgValid.ok) {
      return c.json({ error: msgValid.errors[0] || "Dados invalidos." }, 400);
    }

    var id = "msg_" + String(Date.now()) + "_" + Math.random().toString(36).substring(2, 8);
    var message: Record<string, any> = {
      id: id,
      name: msgValid.sanitized.name || "",
      email: msgValid.sanitized.email || "",
      phone: msgValid.sanitized.phone || "",
      subject: msgValid.sanitized.subject || "",
      message: msgValid.sanitized.message || "",
      read: false,
      date: new Date().toLocaleString("pt-BR"),
    };
    await kv.set("message:" + id, message);
    return c.json(message, 201);
  } catch (e) {
    console.log("Error creating message:", e);
    return c.json({ error: "Erro ao enviar mensagem." }, 500);
  }
});

app.put(BASE + "/messages/:id", async (c) => {
  try {
    const id = c.req.param("id");
    if (!id || id.length > 200) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    // Input validation for message update
    var msgUpValid = validate(body, {
      read: { type: "boolean" },
      adminReply: { type: "string", maxLen: 5000 },
      status: { type: "string", maxLen: 30 },
    });
    if (!msgUpValid.ok) {
      return c.json({ error: msgUpValid.errors[0] || "Dados invalidos." }, 400);
    }
    const existing = await kv.get("message:" + id);
    if (!existing) {
      return c.json({ error: "Mensagem nao encontrada." }, 404);
    }
    var msgObj = typeof existing === "string" ? JSON.parse(existing) : existing;
    // Only allow updating safe fields (read status, admin reply)
    if (msgUpValid.sanitized.read !== undefined) msgObj.read = !!msgUpValid.sanitized.read;
    if (msgUpValid.sanitized.adminReply !== undefined) msgObj.adminReply = msgUpValid.sanitized.adminReply;
    if (msgUpValid.sanitized.status !== undefined) msgObj.status = msgUpValid.sanitized.status;
    msgObj.updatedAt = new Date().toISOString();
    await kv.set("message:" + id, JSON.stringify(msgObj));
    return c.json(msgObj);
  } catch (e) {
    console.log("Error updating message:", e);
    return c.json({ error: "Erro ao atualizar mensagem." }, 500);
  }
});

app.delete(BASE + "/messages/:id", async (c) => {
  try {
    const id = (c.req.param("id") || "").substring(0, 200);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    await kv.del(`message:${id}`);
    return c.json({ deleted: true });
  } catch (e) {
    console.log("Error deleting message:", e);
    return c.json({ error: "Erro ao excluir mensagem." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SETTINGS ─────────────────────────
// ═══════════════════════════════════════

app.get(BASE + "/settings", async (c) => {
  try {
    const settings = await kv.get("settings");
    return c.json(settings || {});
  } catch (e) {
    console.log("Error fetching settings:", e);
    return c.json({ error: "Erro ao buscar configuracoes." }, 500);
  }
});

app.put(BASE + "/settings", async (c) => {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    // Limit settings payload size (stringified)
    var settingsStr = JSON.stringify(body);
    if (settingsStr.length > 50000) {
      return c.json({ error: "Configuracoes excedem o tamanho maximo." }, 400);
    }
    await kv.set("settings", body);
    return c.json(body);
  } catch (e) {
    console.log("Error updating settings:", e);
    return c.json({ error: "Erro ao atualizar configuracoes." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── GOOGLE ANALYTICS 4 ──────────────
// ═══════════════════════════════════════

app.get(BASE + "/ga4/config", async (c) => {
  try {
    const config = await kv.get("ga4_config");
    return c.json(config || {
      measurementId: "",
      enabled: false,
      trackPageViews: true,
      trackAddToCart: true,
      trackCheckout: true,
      trackPurchase: true,
      trackSearch: true,
      trackViewItem: true,
    });
  } catch (e) {
    console.log("Error fetching GA4 config:", e);
    return c.json({ error: "Erro ao buscar configuracao GA4." }, 500);
  }
});

app.put(BASE + "/ga4/config", async (c) => {
  try {
    const body = await c.req.json();
    // Input validation for GA4 config
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    var ga4Valid = validate(body, {
      measurementId: { type: "string", maxLen: 30 },
      enabled: { type: "boolean" },
      trackPageViews: { type: "boolean" },
      trackAddToCart: { type: "boolean" },
      trackCheckout: { type: "boolean" },
      trackPurchase: { type: "boolean" },
      trackSearch: { type: "boolean" },
      trackViewItem: { type: "boolean" },
    });
    if (!ga4Valid.ok) {
      return c.json({ error: ga4Valid.errors[0] || "Dados invalidos." }, 400);
    }
    var ga4Allowed = ["measurementId","enabled","trackPageViews","trackAddToCart","trackCheckout","trackPurchase","trackSearch","trackViewItem"];
    var ga4Safe: Record<string, any> = {};
    for (var gk of ga4Allowed) {
      if (body[gk] !== undefined) ga4Safe[gk] = gk === "measurementId" ? String(body[gk] || "").trim().substring(0, 30) : !!body[gk];
    }
    await kv.set("ga4_config", ga4Safe);
    invalidateHomepageCache();
    return c.json(ga4Safe);
  } catch (e) {
    console.log("Error updating GA4 config:", e);
    return c.json({ error: "Erro ao atualizar configuracao GA4." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SHIPPING / FRETE ────────────────
// ═══════════════════════════════════════

// Default shipping config
const DEFAULT_SHIPPING_CONFIG = {
  originCep: "",
  originCity: "",
  originState: "",
  freeShippingMinValue: null as number | null,
  defaultWeight: 1,
  carriers: [] as any[],
  calcMode: "manual" as "manual" | "table" | "hybrid" | "api",
  apiConfig: null as {
    provider: string;
    apiUrl: string;
    apiToken: string;
    enabled: boolean;
  } | null,
};

// UF → Region mapping
const UF_REGION: Record<string, string> = {
  AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

// CEP lookup via ViaCEP with BrasilAPI fallback
async function lookupCep(cep: string): Promise<{ uf: string; localidade: string; logradouro?: string; bairro?: string } | null> {
  const cleaned = cep.replace(/\D/g, "");
  if (cleaned.length !== 8) return null;
  // Try ViaCEP first
  try {
    const res = await fetch("https://viacep.com.br/ws/" + cleaned + "/json/", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (!data.erro) {
        return { uf: data.uf, localidade: data.localidade, logradouro: data.logradouro, bairro: data.bairro };
      }
    }
  } catch (e) {
    console.log("ViaCEP lookup error:", e);
  }
  // Fallback: BrasilAPI
  try {
    const res2 = await fetch("https://brasilapi.com.br/api/cep/v2/" + cleaned, { signal: AbortSignal.timeout(5000) });
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2.state) {
        return { uf: data2.state, localidade: data2.city || "", logradouro: data2.street || "", bairro: data2.neighborhood || "" };
      }
    }
  } catch (e2) {
    console.log("BrasilAPI lookup error:", e2);
  }
  return null;
}

// Derive UF from CEP prefix range (last-resort fallback)
function ufFromCepRange(cep: string): string {
  var n = parseInt(cep.slice(0, 5));
  if (n >= 1000 && n <= 19999) return "SP";
  if (n >= 20000 && n <= 28999) return "RJ";
  if (n >= 29000 && n <= 29999) return "ES";
  if (n >= 30000 && n <= 39999) return "MG";
  if (n >= 40000 && n <= 48999) return "BA";
  if (n >= 49000 && n <= 49999) return "SE";
  if (n >= 50000 && n <= 56999) return "PE";
  if (n >= 57000 && n <= 57999) return "AL";
  if (n >= 58000 && n <= 58999) return "PB";
  if (n >= 59000 && n <= 59999) return "RN";
  if (n >= 60000 && n <= 63999) return "CE";
  if (n >= 64000 && n <= 64999) return "PI";
  if (n >= 65000 && n <= 65999) return "MA";
  if (n >= 66000 && n <= 68899) return "PA";
  if (n >= 68900 && n <= 68999) return "AP";
  if (n >= 69000 && n <= 69299) return "AM";
  if (n >= 69300 && n <= 69399) return "RR";
  if (n >= 69400 && n <= 69899) return "AM";
  if (n >= 69900 && n <= 69999) return "AC";
  if (n >= 70000 && n <= 72799) return "DF";
  if (n >= 72800 && n <= 72999) return "GO";
  if (n >= 73000 && n <= 76799) return "GO";
  if (n >= 76800 && n <= 77999) return "TO";
  if (n >= 78000 && n <= 78899) return "MT";
  if (n >= 78900 && n <= 78999) return "MS";
  if (n >= 79000 && n <= 79999) return "MS";
  if (n >= 80000 && n <= 87999) return "PR";
  if (n >= 88000 && n <= 89999) return "SC";
  if (n >= 90000 && n <= 99999) return "RS";
  return "";
}

// GET shipping config (admin)
app.get(BASE + "/shipping/config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const config = await kv.get("shipping_config");
    return c.json(config || DEFAULT_SHIPPING_CONFIG);
  } catch (e) {
    console.log("Error fetching shipping config:", e);
    return c.json({ error: "Erro ao buscar configuracao de frete." }, 500);
  }
});

// PUT shipping config (admin)
app.put(BASE + "/shipping/config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    // Allowlist: only persist known shipping config fields
    var allowedShipFields = [
      "provider", "apiToken", "apiUrl", "originCep", "enabled",
      "freeShippingThreshold", "freeShippingEnabled", "handlingDays",
      "handlingFee", "defaultWeight", "defaultDimensions", "method",
      "flatRate", "flatRateValue", "insuranceEnabled", "receiptEnabled",
      "ownHandEnabled", "customApiUrl", "customApiToken", "customApiFormat",
      "sisfreteContractId", "sisfreteApiVersion", "originCity", "originState",
      "tables", "useXmlWs"
    ];
    var cleanConfig: Record<string, any> = {};
    for (var sf = 0; sf < allowedShipFields.length; sf++) {
      var sfKey = allowedShipFields[sf];
      if (body[sfKey] !== undefined) cleanConfig[sfKey] = body[sfKey];
    }
    // Validate URLs if present
    if (cleanConfig.apiUrl && typeof cleanConfig.apiUrl === "string") {
      if (!/^https:\/\//i.test(cleanConfig.apiUrl)) {
        return c.json({ error: "apiUrl deve usar HTTPS." }, 400);
      }
    }
    if (cleanConfig.customApiUrl && typeof cleanConfig.customApiUrl === "string") {
      if (!/^https:\/\//i.test(cleanConfig.customApiUrl)) {
        return c.json({ error: "customApiUrl deve usar HTTPS." }, 400);
      }
    }
    cleanConfig.updatedAt = Date.now();
    await kv.set("shipping_config", cleanConfig);
    return c.json(cleanConfig);
  } catch (e) {
    console.log("Error saving shipping config:", e);
    return c.json({ error: "Erro ao salvar configuracao de frete." }, 500);
  }
});

// POST test external shipping API (admin) - delegated to separate file
app.post(BASE + "/shipping/test-api", async (c) => {
  var reqJson = await c.req.json();
  // Input validation for shipping test-api
  if (!reqJson || typeof reqJson !== "object" || Array.isArray(reqJson)) return c.json({ body: { error: "Body deve ser um objeto JSON." }, status: 400 });
  if (JSON.stringify(reqJson).length > 10000) return c.json({ body: { error: "Payload excede o tamanho maximo." }, status: 400 });
  var result = await handleTestShippingApi(reqJson, getAuthUserId, c.req.raw);
  return c.json(result.body, result.status as any);
});

// (Orphaned test-api handler removed — logic lives in test-shipping-handler.ts)

// POST calculate shipping (public)
app.post(BASE + "/shipping/calculate", async (c) => {
  try {
    // Rate limit: 30 shipping calculations per minute per IP (calls external API)
    var shipCalcRl = _getRateLimitKey(c, "ship_calc");
    var shipCalcRlResult = _checkRateLimit(shipCalcRl, 30);
    if (!shipCalcRlResult.allowed) return _rl429(c, "Muitas consultas de frete. Aguarde um momento.", shipCalcRlResult);
    var shippingBody = await c.req.json();
    // Input validation for shipping calculation
    var shpValid = validate(shippingBody, {
      cep: { required: true, type: "string", maxLen: 15, custom: validators.cep },
      items: { type: "array", maxItems: 200 },
      totalValue: { type: "number", min: 0, max: 99999999 },
    });
    if (!shpValid.ok) {
      return c.json({ error: shpValid.errors[0] || "Dados invalidos." }, 400);
    }
    const { cep, items, totalValue } = shippingBody;
    const destCep = (cep || "").replace(/\D/g, "");
    if (destCep.length !== 8) {
      return c.json({ error: "CEP inválido. Informe 8 dígitos." }, 400);
    }

    let destInfo = await lookupCep(destCep);
    let cepLookupFailed = false;
    if (!destInfo) {
      // Last-resort: derive UF from CEP range so API-based providers can still work
      const fallbackUf = ufFromCepRange(destCep);
      if (fallbackUf) {
        destInfo = { uf: fallbackUf, localidade: "" };
        cepLookupFailed = true;
        console.log("CEP lookup failed for " + destCep + ", using range fallback UF=" + fallbackUf);
      } else {
        return c.json({ error: "CEP não encontrado. Verifique e tente novamente." }, 400);
      }
    }

    const config: any = (await kv.get("shipping_config")) || DEFAULT_SHIPPING_CONFIG;
    const calcMode = config.calcMode || "manual";

    const destUf = destInfo.uf;
    const destRegion = UF_REGION[destUf] || "Outros";

    const totalItems = Array.isArray(items) ? items.reduce((s: number, i: any) => s + (i.quantity || 1), 0) : 1;
    const defaultWeight = config.defaultWeight || 1;
    const orderValue = totalValue || 0;

    // ── Enrich items with weight/dimensions from SIGE ──
    var enrichmentLog: any[] = [];
    var enrichedItems = items;
    var totalWeight = totalItems * defaultWeight; // fallback
    try {
      var enrichResult = await enrichItemsFromSige(items, defaultWeight);
      enrichedItems = enrichResult.enrichedItems;
      totalWeight = enrichResult.totalWeight || (totalItems * defaultWeight);
      enrichmentLog = enrichResult.enrichmentLog;
      console.log("Shipping enrichment: totalWeight=" + totalWeight + " items=" + JSON.stringify(enrichmentLog.map(function(e: any) { return e.sku + ":" + e.weight + "kg/" + e.source; })));
    } catch (e) {
      console.log("Shipping enrichment error (using defaults):", e);
    }

    const options: any[] = [];

    // ── Table-based lookup ──
    if (calcMode === "table" || calcMode === "hybrid") {
      try {
        const tableOptions = await lookupFreightTables(destCep, totalWeight, orderValue, config.freeShippingMinValue);
        options.push(...tableOptions);
      } catch (e) {
        console.log("Table freight lookup error:", e);
      }
    }

    // ── External API lookup ──
    if (calcMode === "api" || (calcMode === "hybrid" && options.length === 0)) {
      try {
        const apiOptions = await lookupFreightApi(config, destCep, totalWeight, enrichedItems);
        options.push(...apiOptions);
      } catch (e) {
        console.log("API freight lookup error:", e);
      }
    }

    // ── Manual carrier rules ──
    if (calcMode === "manual" || calcMode === "hybrid") {
      const carriers = config.carriers || [];
      for (const carrier of carriers) {
        if (!carrier.enabled) continue;

        const freeAbove = carrier.freeAbove ?? config.freeShippingMinValue;
        if (freeAbove && orderValue >= freeAbove) {
          options.push({
            carrierId: carrier.id,
            carrierName: carrier.name,
            carrierType: carrier.type,
            price: 0,
            deliveryDays: carrier.additionalDays || 0,
            deliveryText: carrier.additionalDays ? `ate ${carrier.additionalDays} dias uteis` : "A consultar",
            free: true,
            freeReason: `Frete gratis acima de R$ ${freeAbove.toFixed(2).replace(".", ",")}`,
            source: "manual",
          });
          continue;
        }

        const stateRules = carrier.stateRules || {};
        let rule = stateRules[destUf] || null;

        if (!rule && carrier.regionRules) {
          rule = carrier.regionRules[destRegion] || null;
        }

        if (!rule && carrier.defaultRule) {
          rule = carrier.defaultRule;
        }

        if (!rule) continue;

        let price = rule.basePrice || 0;
        if (rule.pricePerKg && totalWeight > 0) {
          price += rule.pricePerKg * totalWeight;
        }
        if (rule.pricePerItem && totalItems > 1) {
          price += rule.pricePerItem * (totalItems - 1);
        }

        const days = (rule.deliveryDays || 0) + (carrier.additionalDays || 0);

        options.push({
          carrierId: carrier.id,
          carrierName: carrier.name,
          carrierType: carrier.type,
          price: Math.round(price * 100) / 100,
          deliveryDays: days,
          deliveryText: days > 0 ? `ate ${days} dias uteis` : "A consultar",
          free: false,
          source: "manual",
        });
      }
    }

    if (options.length === 0) {
      return c.json({
        options: [],
        destination: destInfo,
        destUf,
        destRegion,
        totalWeight,
        calcMode,
        message: calcMode === "table"
          ? "Nenhuma tabela de frete cobre esse CEP/peso. Entre em contato para consultar o frete."
          : calcMode === "api"
          ? "Nenhuma cotação de frete disponível no momento. Tente novamente mais tarde."
          : "Nenhuma transportadora configurada. Entre em contato para consultar o frete.",
        _enrichment: enrichmentLog,
      });
    }

    // Deduplicate by carrierId and sort by price
    const seen = new Set<string>();
    const deduped = options.filter((o: any) => {
      if (seen.has(o.carrierId)) return false;
      seen.add(o.carrierId);
      return true;
    });
    deduped.sort((a: any, b: any) => a.price - b.price);

    return c.json({
      options: deduped,
      destination: destInfo,
      destUf,
      destRegion,
      totalWeight,
      calcMode,
      ...(cepLookupFailed ? { cepLookupFallback: true } : {}),
      _enrichment: enrichmentLog,
    });
  } catch (e) {
    console.log("Error calculating shipping:", e);
    return c.json({ error: _safeError("Erro ao calcular frete", e) }, 500);
  }
});

// CEP lookup helper (public)
app.get(BASE + "/shipping/cep/:cep", async (c) => {
  try {
    const cep = (c.req.param("cep") || "").substring(0, 10);
    if (!cep || !/^\d{5}-?\d{3}$/.test(cep)) return c.json({ error: "CEP invalido." }, 400);
    const info = await lookupCep(cep);
    if (!info) {
      return c.json({ error: "CEP não encontrado" }, 404);
    }
    return c.json(info);
  } catch (e) {
    console.log("CEP lookup error:", e);
    return c.json({ error: _safeError("Erro ao consultar CEP", e) }, 500);
  }
});

// ── Product physical data CRUD (weight/dimensions overrides, stored in KV) ──

// GET /produtos/physical/:sku — read saved physical data + auto-detect from SIGE & attrs
app.get(BASE + "/produtos/physical/:sku", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var sku = decodeURIComponent(c.req.param("sku")).substring(0, 100);
    if (!sku) return c.json({ error: "SKU invalido." }, 400);

    // 1. Read saved override from KV
    var saved: any = null;
    try {
      var raw = await kv.get("prod_physical:" + sku);
      if (raw) saved = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_e) { /* ignore */ }

    // 2. Fetch SIGE data — return ALL fields so admin can identify the right ones
    var sigeWeight = 0;
    var sigeLength2 = 0;
    var sigeWidth3 = 0;
    var sigeHeight3 = 0;
    var matchedFields: any = {};
    var allSigeFields: any = {};
    var sigeProductFound = false;
    var weightCandidates: any = {};
    var dimCandidates: any = {};
    try {
      var sigeRes = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(sku) + "&limit=1&offset=1");
      var sigeProds = extractProdsGeneric(sigeRes.data);
      if (sigeProds.length === 0 && sku.includes("-")) {
        var baseSku = sku.substring(0, sku.lastIndexOf("-"));
        sigeRes = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(baseSku) + "&limit=1&offset=1");
        sigeProds = extractProdsGeneric(sigeRes.data);
      }
      if (sigeProds.length > 0) {
        sigeProductFound = true;
        var sp = sigeProds[0];
        // Collect ALL fields from the raw SIGE product (top-level, truncate long values)
        var spKeys = Object.keys(sp);
        for (var ski = 0; ski < spKeys.length; ski++) {
          var val = sp[spKeys[ski]];
          if (val === null || val === undefined) { allSigeFields[spKeys[ski]] = null; continue; }
          if (typeof val === "object") { allSigeFields[spKeys[ski]] = JSON.stringify(val).substring(0, 200); continue; }
          allSigeFields[spKeys[ski]] = val;
        }
        // Try known weight fields
        sigeWeight = extractNumericField(sp, SIGE_WEIGHT_FIELDS);
        for (var wf = 0; wf < SIGE_WEIGHT_FIELDS.length; wf++) {
          if (sp[SIGE_WEIGHT_FIELDS[wf]] !== undefined) matchedFields[SIGE_WEIGHT_FIELDS[wf]] = sp[SIGE_WEIGHT_FIELDS[wf]];
        }
        // Try known dimension fields
        sigeLength2 = extractNumericField(sp, SIGE_DIM_LENGTH_FIELDS);
        sigeWidth3 = extractNumericField(sp, SIGE_DIM_WIDTH_FIELDS);
        sigeHeight3 = extractNumericField(sp, SIGE_DIM_HEIGHT_FIELDS);
        var allDimF = SIGE_DIM_LENGTH_FIELDS.concat(SIGE_DIM_WIDTH_FIELDS, SIGE_DIM_HEIGHT_FIELDS);
        for (var df = 0; df < allDimF.length; df++) {
          if (sp[allDimF[df]] !== undefined) matchedFields[allDimF[df]] = sp[allDimF[df]];
        }
        // Fuzzy search: find ALL fields that COULD be weight/dimension candidates
        var weightWords = ["peso", "weight", "kg", "gramo", "gram", "massa"];
        var dimWords = ["compriment", "largur", "altur", "profund", "length", "width", "height", "dimenso", "medida", "volume", "cubag", "tamanho"];
        for (var fi = 0; fi < spKeys.length; fi++) {
          var fk = spKeys[fi];
          var fkLower = fk.toLowerCase();
          var fv = sp[fk];
          var fvNum = (fv !== null && fv !== undefined) ? parseFloat(String(fv)) : NaN;
          for (var wi = 0; wi < weightWords.length; wi++) {
            if (fkLower.includes(weightWords[wi])) { weightCandidates[fk] = fv; break; }
          }
          for (var di = 0; di < dimWords.length; di++) {
            if (fkLower.includes(dimWords[di])) { dimCandidates[fk] = fv; break; }
          }
          if (fkLower.includes("embalag") || fkLower.includes("frete") || fkLower.includes("envio") || fkLower.includes("transport") || fkLower.includes("pacote")) {
            if (!isNaN(fvNum) && fvNum > 0) { dimCandidates[fk] = fv; }
          }
        }

        // ── 2b: Fetch weight from /product/{id}/reference (pesoBruto/pesoLiquido) ──
        if (sigeWeight === 0 || true) {
          var refIdPhys = sp.id || sp.codProduto || sku;
          try {
            var refResPhys = await sigeAuthFetch("GET", "/product/" + encodeURIComponent(String(refIdPhys)) + "/reference?status=A");
            if (refResPhys.ok && refResPhys.data) {
              var refsPhys = Array.isArray(refResPhys.data) ? refResPhys.data : [];
              for (var rpi = 0; rpi < refsPhys.length; rpi++) {
                var refBruto = parseFloat(String(refsPhys[rpi].pesoBruto || 0)) || 0;
                var refLiquido = parseFloat(String(refsPhys[rpi].pesoLiquido || 0)) || 0;
                weightCandidates["ref_pesoBruto"] = refsPhys[rpi].pesoBruto;
                weightCandidates["ref_pesoLiquido"] = refsPhys[rpi].pesoLiquido;
                matchedFields["ref_pesoBruto"] = refsPhys[rpi].pesoBruto;
                matchedFields["ref_pesoLiquido"] = refsPhys[rpi].pesoLiquido;
                matchedFields["ref_codRef"] = refsPhys[rpi].codRef;
                matchedFields["ref_ncm"] = refsPhys[rpi].ncm;
                matchedFields["ref_unit"] = "kg";
                if (sigeWeight === 0 && (refBruto > 0 || refLiquido > 0)) {
                  // SIGE reference pesoBruto/pesoLiquido is already in KG
                  sigeWeight = refBruto || refLiquido;
                  console.log("Physical data: peso via /reference para " + sku + ": pesoBruto=" + refsPhys[rpi].pesoBruto + "kg pesoLiquido=" + refsPhys[rpi].pesoLiquido + "kg");
                }
                break;
              }
            }
          } catch (refErrPhys) {
            console.log("Physical data: reference fetch error for " + sku + ": " + String(refErrPhys));
          }
        }
      }
    } catch (e: any) {
      console.log("Physical fetch SIGE error for " + sku + ": " + e.message);
    }

    // 3. Try to extract dimensions from product attributes (CSV ficha tecnica)
    var attrDims = { length: 0, width: 0, height: 0 };
    var rawAttrs: any = null;
    try {
      var attrMap = await getAtributosMap();
      var attrs = attrMap.get(sku) || null;
      if (attrs && typeof attrs === "object") {
        attrDims = extractDimensionsFromAttrs(attrs as Record<string, string | string[]>);
        rawAttrs = attrs;
      }
    } catch (_e) { /* ignore */ }

    return c.json({
      sku: sku,
      saved: saved,
      sige: {
        found: sigeProductFound,
        weight: sigeWeight,
        length: sigeLength2,
        width: sigeWidth3,
        height: sigeHeight3,
        matchedFields: matchedFields,
        weightCandidates: weightCandidates,
        dimCandidates: dimCandidates,
        allFields: allSigeFields,
      },
      attrs: attrDims,
      rawAttrs: rawAttrs,
    });
  } catch (e: any) {
    console.log("GET produto physical error:", e);
    return c.json({ error: "Erro ao buscar dados fisicos do produto." }, 500);
  }
});

// PUT /produtos/physical/:sku — save physical data override
app.put(BASE + "/produtos/physical/:sku", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Acesso restrito." }, 403);

    var sku = decodeURIComponent(c.req.param("sku"));
    if (sku.length > 100) return c.json({ error: "SKU invalido." }, 400);
    var body = await c.req.json();
    // Input validation for physical data override
    var physValid = validate(body, {
      weight: { type: "number", min: 0, max: 99999 },
      length: { type: "number", min: 0, max: 99999 },
      width: { type: "number", min: 0, max: 99999 },
      height: { type: "number", min: 0, max: 99999 },
    });
    if (!physValid.ok) {
      return c.json({ error: physValid.errors[0] || "Dados invalidos." }, 400);
    }
    var data = {
      weight: parseFloat(body.weight) || 0,
      length: parseFloat(body.length) || 0,
      width: parseFloat(body.width) || 0,
      height: parseFloat(body.height) || 0,
      updatedAt: Date.now(),
      updatedBy: adminCheck.email || userId,
    };
    await kv.set("prod_physical:" + sku, JSON.stringify(data));

    // Invalidate in-memory cache so shipping picks up new values
    memClear("_prod_phys_" + sku);

    console.log("Saved physical data for " + sku + ": " + JSON.stringify(data));
    return c.json({ ok: true, data: data });
  } catch (e: any) {
    console.log("PUT produto physical error:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// DELETE /produtos/physical/:sku — remove override (revert to auto-detect)
app.delete(BASE + "/produtos/physical/:sku", async (c) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Acesso restrito." }, 403);

    var sku = decodeURIComponent(c.req.param("sku")).substring(0, 100);
    if (!sku) return c.json({ error: "SKU invalido." }, 400);
    await kv.del("prod_physical:" + sku);
    memClear("_prod_phys_" + sku);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// GET debug product physical data from SIGE (admin only - for testing weight/dimensions)
app.get(BASE + "/shipping/debug-product/:sku", async (c) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Acesso restrito a administradores." }, 403);
    var sku = decodeURIComponent(c.req.param("sku")).substring(0, 100);
    if (!sku) return c.json({ error: "SKU invalido." }, 400);

    // Fetch raw product from SIGE
    var res = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(sku) + "&limit=1&offset=1");
    var prods = extractProdsGeneric(res.data);
    var rawProduct = prods.length > 0 ? prods[0] : null;

    // Also try base SKU if hyphenated
    var rawProductBase = null;
    if (sku.includes("-")) {
      var baseSku = sku.substring(0, sku.lastIndexOf("-"));
      var resBase = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(baseSku) + "&limit=1&offset=1");
      var prodsBase = extractProdsGeneric(resBase.data);
      rawProductBase = prodsBase.length > 0 ? prodsBase[0] : null;
    }

    // Extract physical data
    var config = (await kv.get("shipping_config")) || { defaultWeight: 1 };
    var physData = await fetchProductPhysicalData(sku, (config as any).defaultWeight || 1);

    // List ALL fields of the raw product for diagnostics
    var allFields: any = {};
    if (rawProduct && typeof rawProduct === "object") {
      var keys = Object.keys(rawProduct);
      for (var k = 0; k < keys.length; k++) {
        allFields[keys[k]] = rawProduct[keys[k]];
      }
    }

    return c.json({
      sku: sku,
      sigeResponse: { status: res.status, ok: res.ok },
      rawProduct: rawProduct,
      allFieldNames: rawProduct ? Object.keys(rawProduct) : [],
      physicalDataExtracted: physData,
      rawProductFromBaseSku: rawProductBase,
      baseSkuFieldNames: rawProductBase ? Object.keys(rawProductBase) : [],
    });
  } catch (e: any) {
    console.log("Debug product physical error:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ─── Shipping Freight Tables ───

// POST upload/create freight table
app.post(BASE + "/shipping/tables", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json();
    // Input validation for shipping table
    var shipTableValid = validate(body, {
      name: { required: true, type: "string", minLen: 1, maxLen: 200 },
      carrierName: { type: "string", maxLen: 200 },
      carrierType: { type: "string", maxLen: 50 },
      rows: { required: true, type: "array", maxItems: 10000 },
    });
    if (!shipTableValid.ok) {
      return c.json({ error: shipTableValid.errors[0] || "Dados invalidos." }, 400);
    }
    var name = shipTableValid.sanitized.name;
    var carrierName = shipTableValid.sanitized.carrierName;
    var carrierType = shipTableValid.sanitized.carrierType;
    var rows = shipTableValid.sanitized.rows;
    if (!name || !rows || !Array.isArray(rows) || rows.length === 0) {
      return c.json({ error: "Nome e linhas da tabela são obrigatórios." }, 400);
    }

    // Validate rows
    const validRows: any[] = [];
    for (const row of rows) {
      const cepInicio = String(row.cepInicio || "").replace(/\D/g, "").padStart(8, "0");
      const cepFim = String(row.cepFim || "").replace(/\D/g, "").padStart(8, "0");
      const valor = parseFloat(row.valor) || 0;
      const prazo = parseInt(row.prazo) || 0;
      const pesoMin = parseFloat(row.pesoMin) || 0;
      const pesoMax = parseFloat(row.pesoMax) || 9999;

      if (cepInicio.length !== 8 || cepFim.length !== 8) continue;
      if (valor <= 0 && prazo <= 0) continue;

      validRows.push({ cepInicio, cepFim, pesoMin, pesoMax, valor, prazo });
    }

    if (validRows.length === 0) {
      return c.json({ error: "Nenhuma linha válida encontrada na tabela." }, 400);
    }

    const tableId = `freight_table_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const table = {
      id: tableId,
      name,
      carrierName: carrierName || name,
      carrierType: carrierType || "transportadora",
      rowCount: validRows.length,
      rows: validRows,
      createdAt: Date.now(),
    };

    await kv.set(`shipping_table:${tableId}`, table);
    console.log(`Freight table "${name}" saved with ${validRows.length} rows, id=${tableId}`);

    // Return without rows (lighter response)
    const { rows: _, ...meta } = table;
    return c.json(meta);
  } catch (e) {
    console.log("Error uploading freight table:", e);
    return c.json({ error: "Erro ao salvar tabela de frete." }, 500);
  }
});

// GET list freight tables
app.get(BASE + "/shipping/tables", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);

    const entries = await kv.getByPrefix("shipping_table:");
    const tables = (entries || []).map((entry: any) => {
      const { rows, ...meta } = (entry?.value || entry || {});
      return {
        ...meta,
        rowCount: Array.isArray(rows) ? rows.length : (meta.rowCount || 0),
      };
    }).sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

    return c.json({ tables });
  } catch (e) {
    console.log("Error listing freight tables:", e);
    return c.json({ error: "Erro ao listar tabelas de frete." }, 500);
  }
});

// GET single freight table (with rows, for preview/editing)
app.get(BASE + "/shipping/tables/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);

    const tableId = (c.req.param("id") || "").substring(0, 100);
    if (!tableId) return c.json({ error: "ID invalido." }, 400);
    const table = await kv.get(`shipping_table:${tableId}`);
    if (!table) return c.json({ error: "Tabela não encontrada" }, 404);
    return c.json(table);
  } catch (e) {
    console.log("Error fetching freight table:", e);
    return c.json({ error: "Erro ao buscar tabela de frete." }, 500);
  }
});

// DELETE freight table
app.delete(BASE + "/shipping/tables/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);

    const tableId = (c.req.param("id") || "").substring(0, 100);
    if (!tableId) return c.json({ error: "ID invalido." }, 400);
    await kv.del(`shipping_table:${tableId}`);
    console.log(`Freight table deleted: ${tableId}`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Error deleting freight table:", e);
    return c.json({ error: "Erro ao excluir tabela." }, 500);
  }
});

// ── Helper: fetch product weight/dimensions from SIGE (with 30-min in-memory cache) ──
// SIGE field names vary — we try every known variant and log what we find for diagnostics.
var SIGE_WEIGHT_FIELDS = [
  "peso", "pesoLiquido", "pesoBruto", "pesoLiq", "peso_liquido", "peso_bruto",
  "weight", "pesoKg", "pesoGr", "pesoUnitario",
  "pesoEmbalagem", "peso_embalagem", "pesoDespacho", "pesoReal",
  "vlrPeso", "vlr_peso", "pesoTotal", "pesoNovo",
  "netWeight", "grossWeight", "shippingWeight",
];
var SIGE_DIM_LENGTH_FIELDS = [
  "comprimento", "profundidade", "length", "comp", "compriment",
  "comprimentoEmbalagem", "comprimento_embalagem",
  "vlrComprimento", "vlr_comprimento", "depth",
];
var SIGE_DIM_WIDTH_FIELDS = [
  "largura", "width", "larg",
  "larguraEmbalagem", "largura_embalagem",
  "vlrLargura", "vlr_largura",
];
var SIGE_DIM_HEIGHT_FIELDS = [
  "altura", "height", "alt",
  "alturaEmbalagem", "altura_embalagem",
  "vlrAltura", "vlr_altura",
];

function extractNumericField(obj: any, fields: string[]): number {
  if (!obj || typeof obj !== "object") return 0;
  for (var i = 0; i < fields.length; i++) {
    var v = obj[fields[i]];
    if (v !== undefined && v !== null && v !== "" && v !== "0" && v !== 0) {
      var n = parseFloat(String(v));
      if (n > 0) return n;
    }
  }
  return 0;
}

function normalizeAttrKey(key: string): string {
  return key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseDimensionsFromAttr(val: string): { length: number; width: number; height: number } | null {
  var cleaned = val.replace(/\s/g, "").replace(/cm/gi, "").replace(/mm/gi, "");
  var match = cleaned.match(/(\d+[.,]?\d*)[xX\u00d7*](\d+[.,]?\d*)[xX\u00d7*](\d+[.,]?\d*)/);
  if (match) {
    return {
      length: parseFloat(match[1].replace(",", ".")) || 0,
      width: parseFloat(match[2].replace(",", ".")) || 0,
      height: parseFloat(match[3].replace(",", ".")) || 0,
    };
  }
  return null;
}

function extractDimensionsFromAttrs(attrs: Record<string, string | string[]>): { length: number; width: number; height: number } {
  var dims = { length: 0, width: 0, height: 0 };
  var dimKeys = Object.keys(attrs);
  for (var dk = 0; dk < dimKeys.length; dk++) {
    var keyNorm = normalizeAttrKey(dimKeys[dk]);
    var attrVal = attrs[dimKeys[dk]];
    var rawValStr = String(Array.isArray(attrVal) ? attrVal[0] : attrVal || "");
    var numVal = parseFloat(rawValStr.replace(",", ".").replace(/[^0-9.]/g, "")) || 0;

    if (keyNorm.includes("dimenso") || keyNorm.includes("dimensao") || keyNorm.includes("medida")) {
      var parsed = parseDimensionsFromAttr(rawValStr);
      if (parsed && (parsed.length > 0 || parsed.width > 0 || parsed.height > 0)) {
        if (parsed.length > 0) dims.length = parsed.length;
        if (parsed.width > 0) dims.width = parsed.width;
        if (parsed.height > 0) dims.height = parsed.height;
        continue;
      }
    }

    if (numVal > 0) {
      if (keyNorm.includes("compriment") || keyNorm.includes("profund") || keyNorm === "comp" || keyNorm === "length") dims.length = numVal;
      else if (keyNorm.includes("largur") || keyNorm === "larg" || keyNorm === "width") dims.width = numVal;
      else if (keyNorm.includes("altur") || keyNorm === "alt" || keyNorm === "height") dims.height = numVal;
    }
  }
  return dims;
}

function extractProdsGeneric(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.dados && Array.isArray(data.dados)) return data.dados;
  if (data.data && Array.isArray(data.data)) return data.data;
  if (data.items && Array.isArray(data.items)) return data.items;
  if (data.content && Array.isArray(data.content)) return data.content;
  if (data.codProduto || data.id) return [data];
  return [];
}

async function fetchProductPhysicalData(sku: string, defaultWeight: number): Promise<{ weight: number; length: number; width: number; height: number; price: number; _source: string; _rawFields?: any }> {
  var cacheKey = "_prod_phys_" + sku;
  var cached = memGet(cacheKey);
  if (cached) return cached;

  var defaults = { weight: defaultWeight, length: 0, width: 0, height: 0, price: 0, _source: "default" };

  try {
    // ── Priority 1: KV override (admin-set values) ──
    try {
      var kvRaw = await kv.get("prod_physical:" + sku);
      if (kvRaw) {
        var kvData = typeof kvRaw === "string" ? JSON.parse(kvRaw) : kvRaw;
        if (kvData && (kvData.weight > 0 || kvData.length > 0 || kvData.width > 0 || kvData.height > 0)) {
          var kvResult = {
            weight: kvData.weight || defaultWeight,
            length: kvData.length || 0,
            width: kvData.width || 0,
            height: kvData.height || 0,
            price: 0,
            _source: "manual",
            _rawFields: {},
          };
          console.log("Physical data for " + sku + " from KV override: w=" + kvResult.weight + " " + kvResult.length + "x" + kvResult.width + "x" + kvResult.height);
          memSet(cacheKey, kvResult, 1800000);
          return kvResult;
        }
      }
    } catch (_e) { /* ignore KV errors */ }

    // ── Priority 2: SIGE (weight) + Atributos CSV (dimensions) ──
    var sigeWeight = 0;
    var sigePrice = 0;
    var rawFields: any = {};

    // Fetch from SIGE
    var res = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(sku) + "&limit=1&offset=1");
    if (!res.ok || !res.data) {
      if (sku.includes("-")) {
        var baseSku = sku.substring(0, sku.lastIndexOf("-"));
        res = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(baseSku) + "&limit=1&offset=1");
      }
    }

    if (res.ok && res.data) {
      var prods = extractProdsGeneric(res.data);
      if (prods.length > 0) {
        var p = prods[0];
        sigeWeight = extractNumericField(p, SIGE_WEIGHT_FIELDS);
        sigePrice = extractNumericField(p, ["vlrTabela", "valorTabela", "vlrVenda", "valorVenda", "precoVenda", "preco", "valor", "valorUnitario"]);
        var allDimFields = SIGE_WEIGHT_FIELDS.concat(SIGE_DIM_LENGTH_FIELDS, SIGE_DIM_WIDTH_FIELDS, SIGE_DIM_HEIGHT_FIELDS);
        for (var f = 0; f < allDimFields.length; f++) {
          if (p[allDimFields[f]] !== undefined) rawFields[allDimFields[f]] = p[allDimFields[f]];
        }
        // Priority 2b: Fetch weight from /product/{id}/reference (pesoBruto/pesoLiquido)
        // SIGE reference returns pesoBruto/pesoLiquido already in KG
        if (sigeWeight === 0) {
          var refId = p.id || p.codProduto || sku;
          try {
            var refRes2 = await sigeAuthFetch("GET", "/product/" + encodeURIComponent(String(refId)) + "/reference?status=A");
            if (refRes2.ok && refRes2.data) {
              var refs2 = Array.isArray(refRes2.data) ? refRes2.data : [];
              for (var ri2 = 0; ri2 < refs2.length; ri2++) {
                var refW2raw = parseFloat(String(refs2[ri2].pesoBruto || 0)) || parseFloat(String(refs2[ri2].pesoLiquido || 0)) || 0;
                if (refW2raw > 0) {
                  // Value is already in kg — use directly
                  sigeWeight = refW2raw;
                  rawFields["pesoBruto_ref"] = refs2[ri2].pesoBruto;
                  rawFields["pesoLiquido_ref"] = refs2[ri2].pesoLiquido;
                  rawFields["ref_unit"] = "kg";
                  console.log("SIGE peso via /reference para " + sku + ": pesoBruto=" + refs2[ri2].pesoBruto + "kg pesoLiquido=" + refs2[ri2].pesoLiquido + "kg");
                  break;
                }
              }
            }
          } catch (refErr2) {
            console.log("SIGE reference fetch error for " + sku + ": " + String(refErr2));
          }
        }
        // Log ALL field names when weight is not found (diagnostic)
        if (sigeWeight === 0) {
          var pKeys = Object.keys(p);
          var numericFields: string[] = [];
          for (var nk = 0; nk < pKeys.length; nk++) {
            var nv = p[pKeys[nk]];
            if (nv !== null && nv !== undefined && !isNaN(parseFloat(String(nv))) && parseFloat(String(nv)) > 0) {
              numericFields.push(pKeys[nk] + "=" + String(nv));
            }
          }
          console.log("SIGE peso NAO encontrado para " + sku + ". Campos numericos>0: " + numericFields.join(", ").substring(0, 500));
          console.log("SIGE todos os campos para " + sku + ": " + pKeys.join(", ").substring(0, 500));
        }
      }
    }

    // ── Priority 3: try dimensions from Atributos CSV ──
    var attrLength = 0, attrWidth = 0, attrHeight = 0;
    try {
      var attrMap = await getAtributosMap();
      var attrs = attrMap.get(sku) || null;
      if (attrs && typeof attrs === "object") {
        var attrDimsResult = extractDimensionsFromAttrs(attrs as Record<string, string | string[]>);
        attrLength = attrDimsResult.length;
        attrWidth = attrDimsResult.width;
        attrHeight = attrDimsResult.height;
      }
    } catch (_e) { /* ignore attrs errors */ }

    // Also try SIGE dimensions as fallback
    var sigeLength = 0, sigeWidth2 = 0, sigeHeight2 = 0;
    if (res.ok && res.data) {
      var prods2 = extractProdsGeneric(res.data);
      if (prods2.length > 0) {
        sigeLength = extractNumericField(prods2[0], SIGE_DIM_LENGTH_FIELDS);
        sigeWidth2 = extractNumericField(prods2[0], SIGE_DIM_WIDTH_FIELDS);
        sigeHeight2 = extractNumericField(prods2[0], SIGE_DIM_HEIGHT_FIELDS);
      }
    }

    var finalLength = attrLength || sigeLength;
    var finalWidth = attrWidth || sigeWidth2;
    var finalHeight = attrHeight || sigeHeight2;
    var srcNote = sigeWeight > 0 ? "sige" : "default";
    if (attrLength > 0 || attrWidth > 0 || attrHeight > 0) srcNote = srcNote + "+attrs";

    var result = {
      weight: sigeWeight || defaultWeight,
      length: finalLength,
      width: finalWidth,
      height: finalHeight,
      price: sigePrice,
      _source: srcNote,
      _rawFields: rawFields,
    };

    console.log("Physical data for " + sku + ": w=" + result.weight + " " + result.length + "x" + result.width + "x" + result.height + " src=" + srcNote);

    memSet(cacheKey, result, 1800000);
    return result;
  } catch (e: any) {
    console.log("Error fetching physical data for " + sku + ": " + e.message);
    memSet(cacheKey, defaults, 300000);
    return defaults;
  }
}

async function enrichItemsFromSige(items: any[], defaultWeight: number): Promise<{ enrichedItems: any[]; totalWeight: number; enrichmentLog: any[] }> {
  if (!Array.isArray(items) || items.length === 0) {
    return { enrichedItems: [], totalWeight: defaultWeight, enrichmentLog: [] };
  }

  var enrichmentLog: any[] = [];
  var enrichedItems: any[] = [];
  var totalWeight = 0;

  // Fetch all products in parallel
  var fetches: Promise<{ weight: number; length: number; width: number; height: number; price: number; _source: string; _rawFields?: any }>[] = [];
  for (var i = 0; i < items.length; i++) {
    fetches.push(fetchProductPhysicalData(items[i].sku || "", defaultWeight));
  }
  var results = await Promise.allSettled(fetches);

  for (var j = 0; j < items.length; j++) {
    var item = items[j];
    var qty = item.quantity || 1;
    var phys = results[j].status === "fulfilled" ? results[j].value : { weight: defaultWeight, length: 0, width: 0, height: 0, price: 0, _source: "error" };

    enrichedItems.push({
      sku: item.sku || "",
      quantity: qty,
      price: phys.price || item.price || 0,
      weight: phys.weight,
      length: phys.length,
      width: phys.width,
      height: phys.height,
    });

    totalWeight += phys.weight * qty;
    enrichmentLog.push({
      sku: item.sku,
      qty: qty,
      source: phys._source,
      weight: phys.weight,
      length: phys.length,
      width: phys.width,
      height: phys.height,
      rawFields: phys._rawFields || null,
    });
  }

  return { enrichedItems, totalWeight, enrichmentLog };
}

// Helper: lookup freight from uploaded tables
async function lookupFreightTables(destCep: string, totalWeight: number, orderValue: number, freeMinValue: number | null): Promise<any[]> {
  const entries = await kv.getByPrefix("shipping_table:");
  if (!entries || entries.length === 0) return [];

  const destNum = parseInt(destCep, 10);
  const options: any[] = [];

  for (const entry of entries) {
    const table: any = entry?.value || entry;
    if (!table || !Array.isArray(table.rows)) continue;

    // Find matching row: CEP range + weight range
    let bestMatch: any = null;
    for (const row of table.rows) {
      const cepStart = parseInt(row.cepInicio, 10);
      const cepEnd = parseInt(row.cepFim, 10);
      if (destNum < cepStart || destNum > cepEnd) continue;

      const wMin = row.pesoMin || 0;
      const wMax = row.pesoMax || 9999;
      if (totalWeight < wMin || totalWeight > wMax) continue;

      // Prefer the most specific CEP range (smallest range)
      if (!bestMatch) {
        bestMatch = row;
      } else {
        const curRange = parseInt(bestMatch.cepFim, 10) - parseInt(bestMatch.cepInicio, 10);
        const newRange = cepEnd - cepStart;
        if (newRange < curRange) bestMatch = row;
      }
    }

    if (!bestMatch) continue;

    // Check free shipping
    const isFree = freeMinValue != null && orderValue >= freeMinValue;

    options.push({
      carrierId: table.id,
      carrierName: table.carrierName || table.name,
      carrierType: table.carrierType || "transportadora",
      price: isFree ? 0 : (bestMatch.valor || 0),
      deliveryDays: bestMatch.prazo || 0,
      deliveryText: bestMatch.prazo > 0 ? `ate ${bestMatch.prazo} dias uteis` : "A consultar",
      free: isFree,
      freeReason: isFree ? `Frete gratis acima de R$ ${freeMinValue!.toFixed(2).replace(".", ",")}` : undefined,
      source: "table",
    });
  }

  return options;
}

// Helper: lookup freight from external API
async function lookupFreightApi(config: any, destCep: string, totalWeight: number, items: any[]): Promise<any[]> {
  const apiConfig = config.apiConfig;
  if (!apiConfig || !apiConfig.enabled || !apiConfig.apiUrl) return [];
  // apiToken is required for melhor_envio/frenet but optional for custom APIs
  const provider = apiConfig.provider || "custom";
  if ((provider === "melhor_envio" || provider === "frenet" || provider === "sisfrete") && !apiConfig.apiToken) return [];

  try {
    let options: any[] = [];

    // Aggregate max dimensions from enriched items (for providers that take a single package)
    var aggLength = 20, aggWidth = 15, aggHeight = 10;
    if (Array.isArray(items) && items.length > 0) {
      var mxL = 0, mxW = 0, sumH = 0;
      for (var ai = 0; ai < items.length; ai++) {
        var aIt = items[ai];
        var aL = aIt.length || 0; var aW = aIt.width || 0; var aH = aIt.height || 0;
        if (aL > mxL) mxL = aL;
        if (aW > mxW) mxW = aW;
        sumH += (aH || 0) * (aIt.quantity || 1); // stack vertically
      }
      if (mxL > 0) aggLength = mxL;
      if (mxW > 0) aggWidth = mxW;
      if (sumH > 0) aggHeight = Math.min(sumH, 100); // cap at 100cm
    }

    if (provider === "melhor_envio") {
      // Melhor Envio API integration
      const payload = {
        from: { postal_code: config.originCep },
        to: { postal_code: destCep },
        package: {
          height: aggHeight, width: aggWidth, length: aggLength,
          weight: totalWeight,
        },
      };
      const res = await fetch("https://melhorenvio.com.br/api/v2/me/shipment/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiConfig.apiToken}`,
          "Accept": "application/json",
          "User-Agent": "Carretão Auto Peças (contato@carretao.com)",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const svc of data) {
            if (svc.error) continue;
            options.push({
              carrierId: `me_${svc.id}`,
              carrierName: `${svc.company?.name || "Transportadora"} - ${svc.name || ""}`.trim(),
              carrierType: "transportadora",
              price: parseFloat(svc.custom_price || svc.price) || 0,
              deliveryDays: parseInt(svc.custom_delivery_time || svc.delivery_time) || 0,
              deliveryText: svc.delivery_time ? `ate ${svc.delivery_time} dias uteis` : "A consultar",
              free: false,
              source: "api",
            });
          }
        }
      } else {
        console.log("Melhor Envio API error:", res.status, await res.text().catch(() => ""));
      }
    } else if (provider === "frenet") {
      // Frenet API integration
      const payload = {
        SellerCEP: config.originCep,
        RecipientCEP: destCep,
        ShipmentInvoiceValue: 0,
        ShippingItemArray: [{
          Height: aggHeight, Length: aggLength, Width: aggWidth,
          Weight: totalWeight, Quantity: 1,
        }],
      };
      const res = await fetch("https://api.frenet.com.br/shipping/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "token": apiConfig.apiToken,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.ShippingSevicesArray)) {
          for (const svc of data.ShippingSevicesArray) {
            if (svc.Error) continue;
            options.push({
              carrierId: `frenet_${svc.ServiceCode}`,
              carrierName: `${svc.Carrier || "Frete"} - ${svc.ServiceDescription || ""}`.trim(),
              carrierType: "transportadora",
              price: parseFloat(svc.ShippingPrice) || 0,
              deliveryDays: parseInt(svc.DeliveryTime) || 0,
              deliveryText: svc.DeliveryTime ? `ate ${svc.DeliveryTime} dias uteis` : "A consultar",
              free: false,
              source: "api",
            });
          }
        }
      } else {
        console.log("Frenet API error:", res.status, await res.text().catch(() => ""));
      }
    } else if (provider === "sisfrete") {
      // SisFrete Cotacao — supports two modes:
      // 1) "json" (default): REST POST with JSON body + token header
      // 2) "xml_ws": Web Service GET with query params, returns XML
      var sisMode = apiConfig.sisfreteMode || "json";
      var sisUrl = apiConfig.apiUrl || "https://cotar.sisfrete.com.br/cotacao/Integracao.php";
      var sisJsonOk = false;

      // ── Helper: extract XML tag content using indexOf ──
      function extractXmlTag(block: string, tag: string): string {
        var openT = "<" + tag + ">";
        var closeT = "</" + tag + ">";
        var sIdx = block.toLowerCase().indexOf(openT.toLowerCase());
        if (sIdx === -1) return "";
        var eIdx = block.toLowerCase().indexOf(closeT.toLowerCase(), sIdx + openT.length);
        if (eIdx === -1) return "";
        return block.substring(sIdx + openT.length, eIdx).trim();
      }

      // ── Helper: parse SisFrete XML response ──
      function parseSisfreteXml(xml: string): any[] {
        var results: any[] = [];
        var startMarker = "<resultado>";
        var endMarker = "</resultado>";
        var searchFrom = 0;
        while (true) {
          var sIdx2 = xml.toLowerCase().indexOf(startMarker, searchFrom);
          if (sIdx2 === -1) break;
          var eIdx2 = xml.toLowerCase().indexOf(endMarker, sIdx2 + startMarker.length);
          if (eIdx2 === -1) break;
          var block = xml.substring(sIdx2 + startMarker.length, eIdx2);
          searchFrom = eIdx2 + endMarker.length;
          // Check for error
          var errContent = extractXmlTag(block, "erro");
          if (errContent) {
            console.log("[SisFrete XML] Error in resultado: " + errContent);
            continue;
          }
          var transportadora = extractXmlTag(block, "transportadora") || extractXmlTag(block, "transp_padrao") || "";
          var servico = extractXmlTag(block, "servico") || extractXmlTag(block, "servico_padrao") || "";
          var valorStr = extractXmlTag(block, "valor").replace(",", ".");
          var valor = parseFloat(valorStr) || 0;
          var prazoMin = parseInt(extractXmlTag(block, "prazo_min")) || 0;
          var prazoMax = parseInt(extractXmlTag(block, "prazo_max")) || 0;
          var prazo = prazoMax > 0 ? prazoMax : prazoMin;
          var transporte = extractXmlTag(block, "transporte") || "";
          var tipoEnvio = extractXmlTag(block, "tipo_envio") || "";
          var xmlIdCot = extractXmlTag(block, "id_cotacao") || extractXmlTag(block, "idcotacao") || extractXmlTag(block, "numero_cotacao") || extractXmlTag(block, "id") || "";
          if (valor <= 0 && prazo <= 0) continue;
          results.push({
            transportadora: transportadora,
            servico: servico,
            valor: valor,
            prazoMin: prazoMin,
            prazoMax: prazoMax,
            prazo: prazo,
            transporte: transporte,
            tipoEnvio: tipoEnvio,
            idCotacao: xmlIdCot,
          });
        }
        return results;
      }

      // ── Helper: build Web Service GET URL ──
      function buildSisfreteWsUrl(baseUrl: string, token: string, originCep: string, _destCep: string, _items: any[], _totalWeight: number, numPed: string): string {
        var url = baseUrl + "?token=" + encodeURIComponent(token);
        url += "&envio=1";
        url += "&cep_destino=" + _destCep.replace(/\D/g, "");
        url += "&num_ped=" + encodeURIComponent(numPed || "cotacao_" + Date.now());
        // Build prods parameter: comprimento(m);largura(m);altura(m);cubagem;volume(un);peso(kg);codigo;valor
        // Note: Web Service uses METERS, not cm! Divide cm by 100.
        var prodsArr: string[] = [];
        if (Array.isArray(_items) && _items.length > 0) {
          for (var pi2 = 0; pi2 < _items.length; pi2++) {
            var it2 = _items[pi2];
            var compM = ((it2.length || 20) / 100).toFixed(2);
            var largM = ((it2.width || 15) / 100).toFixed(2);
            var altM = ((it2.height || 10) / 100).toFixed(2);
            var cubM = (((it2.length || 20) * (it2.width || 15) * (it2.height || 10)) / 1000000).toFixed(6);
            var qty2 = it2.quantity || 1;
            var peso2 = (it2.weight || 1).toFixed(2);
            var cod2 = it2.sku || ("item" + pi2);
            var val2 = (it2.price || 0).toFixed(2);
            prodsArr.push(compM + ";" + largM + ";" + altM + ";" + cubM + ";" + qty2 + ";" + peso2 + ";" + cod2 + ";" + val2);
          }
        } else {
          // Single consolidated
          var cL = "0.20"; var cW = "0.15"; var cH = "0.10";
          var cCub = (0.20 * 0.15 * 0.10).toFixed(6);
          var cPeso = _totalWeight.toFixed(2);
          prodsArr.push(cL + ";" + cW + ";" + cH + ";" + cCub + ";1;" + cPeso + ";consolidated;0.00");
        }
        url += "&prods=" + encodeURIComponent(prodsArr.join("/"));
        return url;
      }

      // ── Mode: JSON (REST POST) ──
      if (sisMode === "json") {
        var sisPayload = {
          destination: destCep,
          items: [] as any[],
        };
        if (Array.isArray(items) && items.length > 0) {
          for (var ii = 0; ii < items.length; ii++) {
            var it = items[ii];
            sisPayload.items.push({
              seller_id: "",
              sku: it.sku || ("item-" + ii),
              quantity: it.quantity || 1,
              origin: config.originCep || "",
              price: it.price || 0,
              dimensions: {
                length: it.length || 20,
                height: it.height || 10,
                width: it.width || 15,
                weight: it.weight || (config.defaultWeight || 1),
              },
            });
          }
        } else {
          sisPayload.items.push({
            seller_id: "",
            sku: "consolidated",
            quantity: 1,
            origin: config.originCep || "",
            price: 0,
            dimensions: { length: 20, height: 10, width: 15, weight: totalWeight },
          });
        }
        console.log("SisFrete JSON payload: " + JSON.stringify(sisPayload.items.map(function(x: any) { return x.sku + " qty=" + x.quantity + " w=" + x.dimensions.weight + " " + x.dimensions.length + "x" + x.dimensions.width + "x" + x.dimensions.height + " p=" + x.price; })));
        var sisRes = await fetch(sisUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": apiConfig.apiToken },
          body: JSON.stringify(sisPayload),
          signal: AbortSignal.timeout(15000),
        });
        if (sisRes.ok) {
          var sisData = await sisRes.json();
          // Capture SisFrete quotation ID — can be at top-level or per-package
          var sisTopKeys = Object.keys(sisData || {}).join(",");
          console.log("[SisFrete JSON] Top-level keys=" + sisTopKeys);
          var sisTopQuoteId = String(sisData.id || sisData.quotation_id || sisData.idCotacao || sisData.id_cotacao || sisData.numero_cotacao || sisData.cotacao_id || sisData.numero || "");
          console.log("[SisFrete JSON] Top-level quoteId=" + sisTopQuoteId);
          var packages = sisData.packages || sisData.Packages || [];
          if (Array.isArray(packages)) {
            for (var pi = 0; pi < packages.length; pi++) {
              var pkg = packages[pi];
              var pkgKeys = Object.keys(pkg || {}).join(",");
              console.log("[SisFrete JSON] Package[" + pi + "] keys=" + pkgKeys);
              var pkgQuoteId = String(pkg.id || pkg.quotation_id || pkg.idCotacao || pkg.id_cotacao || pkg.cotacao_id || pkg.numero || "");
              var resolvedQuoteId = pkgQuoteId || sisTopQuoteId;
              console.log("[SisFrete JSON] Package[" + pi + "] pkgQuoteId=" + pkgQuoteId + " resolved=" + resolvedQuoteId);
              var quots = pkg.quotations || pkg.Quotations || [];
              if (Array.isArray(quots)) {
                for (var qi = 0; qi < quots.length; qi++) {
                  var q = quots[qi];
                  var qPrice = parseFloat(String(q.price ?? q.cost ?? 0)) || 0;
                  var qDays = parseInt(String(q.promise ?? q.shipping_time ?? 0)) || 0;
                  var qCaption = q.caption || q.Caption || "Frete";
                  var qTransp = q.transportadora || q.Transportadora || "";
                  var qServiceId = q.service_id ?? q.serviceId ?? qi;
                  if (qPrice <= 0 && qDays <= 0) continue;
                  var qName = qTransp ? (qTransp + " - " + qCaption) : ("SisFrete - " + qCaption);
                  var qQuoteId = String(q.id || q.quotation_id || q.idCotacao || q.id_cotacao || q.cotacao_id || q.numero || "") || resolvedQuoteId;
                  console.log("[SisFrete JSON] Quot[" + qi + "] carrier=" + qTransp + " caption=" + qCaption + " qQuoteId=" + qQuoteId + " keys=" + Object.keys(q || {}).join(","));
                  var optObj: any = {
                    carrierId: "sisfrete_" + pi + "_" + qServiceId,
                    carrierName: qName,
                    carrierType: "transportadora",
                    price: qPrice,
                    deliveryDays: qDays,
                    deliveryText: qDays > 0 ? ("ate " + qDays + " dias uteis") : "A consultar",
                    free: qPrice === 0,
                    source: "api",
                  };
                  if (qQuoteId) optObj.sisfreteQuoteId = qQuoteId;
                  options.push(optObj);
                }
              }
            }
          }
          if (options.length > 0) sisJsonOk = true;
        }
        // If JSON failed or returned 0 results, fallback to XML Web Service
        if (!sisJsonOk) {
          var sisErrText = "";
          if (sisRes && !sisRes.ok) {
            sisErrText = await sisRes.text().catch(function() { return ""; });
          }
          console.log("SisFrete JSON mode " + (sisRes.ok ? "returned 0 results" : "error HTTP " + sisRes.status) + ", falling back to XML Web Service. " + sisErrText.slice(0, 300));
          // Fallback to XML
          sisMode = "xml_ws";
        }
      }

      // ── Mode: XML Web Service (GET) ──
      if (sisMode === "xml_ws") {
        var wsUrl = buildSisfreteWsUrl(sisUrl, apiConfig.apiToken, config.originCep || "", destCep, items, totalWeight, "ws_" + Date.now());
        console.log("[SisFrete XML WS] GET " + wsUrl.replace(apiConfig.apiToken, "TOKEN***"));
        var wsRes = await fetch(wsUrl, {
          method: "GET",
          signal: AbortSignal.timeout(20000),
        });
        var wsText = await wsRes.text();
        console.log("[SisFrete XML WS] HTTP " + wsRes.status + " length=" + wsText.length + " preview=" + wsText.slice(0, 300));
        if (wsRes.ok && wsText.indexOf("<cotacao>") !== -1) {
          // Extract top-level id_cotacao from <cotacao> block
          var xmlTopQuoteId = extractXmlTag(wsText, "id_cotacao") || extractXmlTag(wsText, "idcotacao") || extractXmlTag(wsText, "numero_cotacao") || "";
          console.log("[SisFrete XML WS] Top-level quoteId=" + xmlTopQuoteId);
          var xmlResults = parseSisfreteXml(wsText);
          console.log("[SisFrete XML WS] Parsed " + xmlResults.length + " resultado(s)");
          for (var xi = 0; xi < xmlResults.length; xi++) {
            var xr = xmlResults[xi];
            var xName = xr.transportadora ? (xr.transportadora + " - " + xr.servico) : ("SisFrete - " + (xr.servico || xr.transporte || "Frete"));
            var xPrazoText = "";
            if (xr.prazoMin > 0 && xr.prazoMax > 0 && xr.prazoMin !== xr.prazoMax) {
              xPrazoText = xr.prazoMin + " a " + xr.prazoMax + " dias uteis";
            } else if (xr.prazo > 0) {
              xPrazoText = "ate " + xr.prazo + " dias uteis";
            } else {
              xPrazoText = "A consultar";
            }
            var xQuoteId = xr.idCotacao || xmlTopQuoteId;
            var xOptObj: any = {
              carrierId: "sisfrete_xml_" + xi,
              carrierName: xName,
              carrierType: "transportadora",
              price: xr.valor,
              deliveryDays: xr.prazo,
              deliveryText: xPrazoText,
              free: xr.valor === 0,
              source: "api",
            };
            if (xQuoteId) xOptObj.sisfreteQuoteId = xQuoteId;
            options.push(xOptObj);
          }
        } else {
          console.log("[SisFrete XML WS] Error or no <cotacao> found. Status=" + wsRes.status);
        }
      }
    } else if (provider === "custom") {
      // Custom API with dynamic field mapping, HTTP method, and body template support
      const customHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (apiConfig.apiToken) customHeaders.Authorization = "Bearer " + apiConfig.apiToken;
      const customMethod = apiConfig.httpMethod || "POST";
      let customUrl = apiConfig.apiUrl;
      let customBody: any = null;

      // Build body from template or default
      const tpl = apiConfig.requestBodyTemplate || "";
      if (tpl) {
        try {
          const rendered = tpl
            .replace(/\{\{originCep\}\}/g, config.originCep || "")
            .replace(/\{\{destCep\}\}/g, destCep)
            .replace(/\{\{weight\}\}/g, String(totalWeight));
          customBody = JSON.parse(rendered);
        } catch (_e) {
          customBody = { originCep: config.originCep, destCep, weight: totalWeight, items };
        }
      } else {
        customBody = { originCep: config.originCep, destCep, weight: totalWeight, items };
      }

      // For GET requests, convert body to query string
      const fetchOpts: any = { method: customMethod, headers: customHeaders, signal: AbortSignal.timeout(15000) };
      if (customMethod === "GET" && customBody) {
        const qs: string[] = [];
        for (const [k, v] of Object.entries(customBody)) {
          if (v !== null && v !== undefined && typeof v !== "object") {
            qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
          }
        }
        if (qs.length > 0) {
          customUrl = customUrl + (customUrl.includes("?") ? "&" : "?") + qs.join("&");
        }
        delete customHeaders["Content-Type"];
      } else {
        fetchOpts.body = JSON.stringify(customBody);
      }

      const res = await fetch(customUrl, fetchOpts);
      if (res.ok) {
        const data = await res.json();
        const fm = apiConfig.fieldMapping;

        // Resolve the options array using fieldMapping.optionsPath or fallback
        let rawOptions: any[] = [];
        if (fm && fm.optionsPath) {
          let node: any = data;
          for (const seg of fm.optionsPath.split(".")) {
            if (node && typeof node === "object") node = node[seg];
            else { node = undefined; break; }
          }
          if (Array.isArray(node)) rawOptions = node;
        } else if (Array.isArray(data.options)) {
          rawOptions = data.options;
        } else if (Array.isArray(data)) {
          rawOptions = data;
        }

        // Helper: resolve a (possibly nested) field from an object
        const getField = (obj: any, path: string): any => {
          if (!path) return undefined;
          let cur: any = obj;
          for (const seg of path.split(".")) {
            if (cur && typeof cur === "object") cur = cur[seg];
            else return undefined;
          }
          return cur;
        };

        options = rawOptions
          .filter((o: any) => {
            if (fm?.errorField && getField(o, fm.errorField)) return false;
            return true;
          })
          .map((o: any, idx: number) => {
            const nameVal = fm?.carrierName ? getField(o, fm.carrierName) : (o.carrierName || o.name);
            const priceVal = fm?.price ? getField(o, fm.price) : o.price;
            const daysVal = fm?.deliveryDays ? getField(o, fm.deliveryDays) : (o.deliveryDays || o.delivery_days);
            const idVal = fm?.carrierId ? getField(o, fm.carrierId) : (o.carrierId || o.id);

            const priceParsed = parseFloat(String(priceVal)) || 0;
            const daysParsed = parseInt(String(daysVal)) || 0;

            return {
              carrierId: String(idVal || `custom_${idx}_${Date.now()}`),
              carrierName: String(nameVal || "Frete"),
              carrierType: "transportadora",
              price: priceParsed,
              deliveryDays: daysParsed,
              deliveryText: daysParsed ? `ate ${daysParsed} dias uteis` : "A consultar",
              free: priceParsed === 0,
              source: "api",
            };
          })
          .filter((o: any) => o.price > 0 || o.deliveryDays > 0);
      } else {
        console.log("Custom shipping API error:", res.status, await res.text().catch(() => ""));
      }
    }

    return options;
  } catch (e) {
    console.log("External shipping API error:", e);
    return [];
  }
}

// ════════════════════════════════════════════════
// ─── FUZZY SEARCH UTILITIES ─────────────────────
// ════════════════════════════════════════════════

// Remove accents and normalize Portuguese text
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9\s]/g, " ")   // keep only alphanum + spaces
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein distance for typo tolerance
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

// Common Portuguese phonetic equivalences
const PHONETIC_REPLACEMENTS: [RegExp, string][] = [
  [/ss/g, "s"],
  [/ç/g, "s"],
  [/ch/g, "x"],
  [/sh/g, "x"],
  [/ph/g, "f"],
  [/th/g, "t"],
  [/lh/g, "li"],
  [/nh/g, "ni"],
  [/rr/g, "r"],
  [/qu/g, "k"],
  [/gu(?=[ei])/g, "g"],
  [/ge/g, "je"],
  [/gi/g, "ji"],
  [/ce/g, "se"],
  [/ci/g, "si"],
  [/ks/g, "x"],
  [/ct/g, "t"],
  [/sc(?=[ei])/g, "s"],
  [/xc(?=[ei])/g, "s"],
  [/z$/g, "s"],
  [/w/g, "v"],
  [/y/g, "i"],
  [/ll/g, "l"],
  [/nn/g, "n"],
  [/mm/g, "m"],
  [/tt/g, "t"],
  [/pp/g, "p"],
  [/bb/g, "b"],
  [/dd/g, "d"],
  [/ff/g, "f"],
  [/gg/g, "g"],
  [/cc/g, "c"],
];

function phoneticKey(text: string): string {
  let result = normalizeText(text);
  for (const [pattern, replacement] of PHONETIC_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// Portuguese stopwords — removed from search to improve precision
const PT_STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "um", "uma", "uns", "umas", "o", "a", "os", "as", "e", "ou",
  "para", "por", "com", "sem", "ate", "que", "se", "mas", "mais",
  "ao", "aos", "pelo", "pela", "pelos", "pelas", "es", "el",
  "so", "ja", "nao", "nem", "tipo", "ser", "ter",
]);

// Score a product against the query (higher = better match)
function scoreProduct(
  queryNorm: string,
  queryPhonetic: string,
  queryTokens: string[],
  tituloRaw: string,
  skuRaw: string,
): number {
  const tituloNorm = normalizeText(tituloRaw);
  const skuNorm = normalizeText(skuRaw);
  const tituloPhonetic = phoneticKey(tituloRaw);
  const tituloTokens = tituloNorm.split(" ").filter(Boolean);
  let score = 0;

  // 1. Exact match (titulo or SKU)
  if (tituloNorm === queryNorm || skuNorm === queryNorm) {
    score += 1000;
  }

  // 2. Starts with query
  if (tituloNorm.startsWith(queryNorm)) score += 200;
  if (skuNorm.startsWith(queryNorm)) score += 300;

  // 3. Contains exact substring
  if (tituloNorm.includes(queryNorm)) score += 150;
  if (skuNorm.includes(queryNorm)) score += 200;

  // 4. Token matching - each query token found in titulo tokens
  let tokenHits = 0;
  for (const qt of queryTokens) {
    if (qt.length < 2) continue;
    for (const tt of tituloTokens) {
      if (tt === qt) { tokenHits += 3; break; }
      if (tt.startsWith(qt)) { tokenHits += 2; break; }
      if (tt.includes(qt)) { tokenHits += 1; break; }
    }
  }
  score += tokenHits * 30;

  // 5. Phonetic match
  if (tituloPhonetic.includes(queryPhonetic)) score += 80;
  // Phonetic token matching
  const queryPhoneticTokens = queryPhonetic.split(" ").filter(Boolean);
  const tituloPhoneticTokens = tituloPhonetic.split(" ").filter(Boolean);
  for (const qpt of queryPhoneticTokens) {
    if (qpt.length < 2) continue;
    for (const tpt of tituloPhoneticTokens) {
      if (tpt.startsWith(qpt) || tpt.includes(qpt)) {
        score += 40;
        break;
      }
    }
  }

  // 6. Levenshtein distance on individual tokens (typo tolerance)
  for (const qt of queryTokens) {
    if (qt.length < 3) continue;
    let bestDist = Infinity;
    for (const tt of tituloTokens) {
      // Only compare tokens of similar length
      if (Math.abs(tt.length - qt.length) > 3) continue;
      const d = levenshtein(qt, tt);
      if (d < bestDist) bestDist = d;
    }
    // Threshold: allow ~30% errors
    const maxDist = Math.max(1, Math.floor(qt.length * 0.35));
    if (bestDist <= maxDist) {
      score += Math.max(0, (maxDist - bestDist + 1) * 25);
    }
  }

  // 7. Levenshtein on phonetic tokens
  for (const qpt of queryPhoneticTokens) {
    if (qpt.length < 3) continue;
    let bestDist = Infinity;
    for (const tpt of tituloPhoneticTokens) {
      if (Math.abs(tpt.length - qpt.length) > 3) continue;
      const d = levenshtein(qpt, tpt);
      if (d < bestDist) bestDist = d;
    }
    const maxDist = Math.max(1, Math.floor(qpt.length * 0.35));
    if (bestDist <= maxDist) {
      score += Math.max(0, (maxDist - bestDist + 1) * 15);
    }
  }

  // 8. SKU partial match bonus
  if (skuNorm.includes(queryNorm.replace(/\s/g, ""))) score += 100;

  // 9. All query tokens found — strong multi-word relevance signal
  if (queryTokens.length > 1) {
    const meaningfulTokens = queryTokens.filter((t) => t.length >= 2 && !PT_STOPWORDS.has(t));
    if (meaningfulTokens.length > 1) {
      let allFound = true;
      for (const qt of meaningfulTokens) {
        const found =
          tituloTokens.some((tt) => tt === qt || tt.startsWith(qt) || tt.includes(qt)) ||
          tituloPhoneticTokens.some((tpt) => {
            const qptSingle = phoneticKey(qt).replace(/\s/g, "");
            return tpt === qptSingle || tpt.startsWith(qptSingle) || tpt.includes(qptSingle);
          });
        if (!found) {
          allFound = false;
          break;
        }
      }
      if (allFound) score += 300;
    }
  }

  return score;
}

// ═════════════════════════���═════════════════════════════
// ─── NEW SEARCH ENGINE: Token-AND with accent variants ─
// ═══════════════════════════════════════════════════════

// Generate targeted accent-insensitive ILIKE patterns for a single token.
// Returns patterns like *filtro*, *fíltro*, *f_ltro* etc.
function generateTokenPatterns(token: string): string[] {
  if (token.length < 2) return [`*${token}*`];

  const patterns: string[] = [`*${token}*`];

  // Accent map: character → possible accented variants in Portuguese
  const accentMap: Record<string, string[]> = {
    a: ["á", "ã", "â"],
    e: ["é", "ê"],
    i: ["í"],
    o: ["ó", "ô", "õ"],
    u: ["ú"],
    c: ["ç"],
  };

  // 1. Direct accent substitutions at each character position
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    const variants = accentMap[ch];
    if (variants) {
      for (const v of variants) {
        patterns.push(`*${token.slice(0, i) + v + token.slice(i + 1)}*`);
      }
    }
  }

  // 2. Common Portuguese multi-char ending patterns
  if (token.endsWith("ao")) patterns.push(`*${token.slice(0, -2)}ão*`);
  if (token.endsWith("oes")) patterns.push(`*${token.slice(0, -3)}ões*`);
  if (token.endsWith("cao")) patterns.push(`*${token.slice(0, -3)}ção*`);
  if (token.includes("ca")) patterns.push(`*${token.replace("ca", "ça")}*`);
  if (token.includes("co") && !token.includes("com")) patterns.push(`*${token.replace("co", "ço")}*`);

  // 3. Wildcard at first vowel position (catches any accent)
  const firstVowelIdx = token.search(/[aeiou]/);
  if (firstVowelIdx >= 0 && token.length >= 3) {
    const wild = token.slice(0, firstVowelIdx) + "_" + token.slice(firstVowelIdx + 1);
    patterns.push(`*${wild}*`);
  }

  // 4. For longer tokens, wildcard at second vowel too
  if (token.length >= 5) {
    let vowelCount = 0;
    for (let i = 0; i < token.length; i++) {
      if ("aeiou".includes(token[i])) {
        vowelCount++;
        if (vowelCount === 2) {
          const wild2 = token.slice(0, i) + "_" + token.slice(i + 1);
          patterns.push(`*${wild2}*`);
          break;
        }
      }
    }
  }

  // 5. Substring fallback (skip first char — useful when first char is accented in DB)
  if (token.length >= 4) {
    patterns.push(`*${token.slice(1)}*`);
  }

  return [...new Set(patterns)].slice(0, 15);
}

/**
 * Build PostgREST-compatible search filter with AND logic for multi-token queries.
 *
 * Single token  → or=(titulo.ilike.*x*,titulo.ilike.*á_variant*,...,sku.ilike.*x*)
 * Multi-token   → or=( and(or(titulo matches token1),or(titulo matches token2)), sku.ilike.*full* )
 *
 * mode "catalog"      – precise AND between tokens (titulo only per group)
 * mode "autocomplete" – same AND structure but also includes sku per token group
 */
function buildSearchConditions(
  searchTerm: string,
  mode: "catalog" | "autocomplete" = "catalog",
): string {
  const norm = normalizeText(searchTerm);
  const original = searchTerm.toLowerCase().trim();
  const allTokens = norm.split(" ").filter((t) => t.length >= 2);
  const tokens = allTokens.filter((t) => !PT_STOPWORDS.has(t));
  const effectiveTokens = tokens.length > 0 ? tokens : allTokens;

  if (effectiveTokens.length === 0) {
    const p = original.replace(/[^a-z0-9]/g, "*").replace(/\*+/g, "*");
    return `titulo.ilike.*${p}*,sku.ilike.*${p}*`;
  }

  // ── SKU-specific patterns (always included) ──
  const skuConditions: string[] = [];
  const normNoSpaces = norm.replace(/\s+/g, "");
  if (normNoSpaces.length >= 2) {
    skuConditions.push(`sku.ilike.*${normNoSpaces}*`);
    // Original with wildcards between words
    skuConditions.push(`sku.ilike.*${original.replace(/\s+/g, "*")}*`);
    // With separators stripped (user typed ABC-12 → match ABC1234)
    const origClean = original.replace(/[-_.\s\/\\]/g, "");
    if (origClean !== normNoSpaces && origClean.length >= 2) {
      skuConditions.push(`sku.ilike.*${origClean}*`);
    }
    // Alpha/numeric segments with * between (abc12 → abc*12 matches abc-1234)
    const segments = normNoSpaces.match(/[a-z]+|[0-9]+/g);
    if (segments && segments.length > 1) {
      skuConditions.push(`sku.ilike.*${segments.join("*")}*`);
    }
  }

  // ── Single-token: flat OR with all variants for titulo + sku ──
  if (effectiveTokens.length === 1) {
    const patterns = generateTokenPatterns(effectiveTokens[0]);
    const conditions = [
      ...patterns.flatMap((p) => [`titulo.ilike.${p}`, `sku.ilike.${p}`]),
      ...skuConditions,
    ];
    return [...new Set(conditions)].join(",");
  }

  // ── Multi-token: AND between token groups ─
  // Each token must appear somewhere in the titulo (with accent tolerance).
  // This is the key change: "filtro oleo" → product must match BOTH "filtro" AND "oleo".
  const tokenGroups = effectiveTokens.slice(0, 4).map((token) => {
    const patterns = generateTokenPatterns(token);
    let conditions: string[];
    if (mode === "autocomplete") {
      // Wider: check titulo + sku per token
      conditions = [
        ...patterns.map((p) => `titulo.ilike.${p}`),
        ...patterns.slice(0, 3).map((p) => `sku.ilike.${p}`),
      ];
    } else {
      // Catalog: check titulo only per token (more precise)
      conditions = patterns.map((p) => `titulo.ilike.${p}`);
    }
    return `or(${conditions.join(",")})`;
  });

  // Combine: AND of token groups, OR with SKU matching
  const andClause = `and(${tokenGroups.join(",")})`;
  const uniqueSku = [...new Set(skuConditions)];
  return [andClause, ...uniqueSku].join(",");
}

// ═══════════════════════════════════════
// ─── PRODUCT IMAGES (Supabase Storage) ─
// ═══════════════════════════════════════

// Extract image number from filename like "SKU.2.webp" → 2
function extractImageNumber(filename: string): number {
  const match = filename.match(/\.(\d+)\.(?:webp|png|jpg|jpeg|gif)$/i);
  return match ? parseInt(match[1], 10) : 999;
}

// List all images for a product SKU from Supabase Storage bucket "produtos"
app.get(BASE + "/produtos/imagens/:sku", async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku")).substring(0, 100);
    if (!sku) return c.json({ sku: "", images: [], total: 0 });
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    if (!supabaseUrl) {
      return c.json({ error: "SUPABASE_URL não configurada." }, 500);
    }

    // List files inside the SKU folder in the "produtos" bucket
    const { data, error } = await supabaseAdmin.storage
      .from("produtos")
      .list(sku, {
        limit: 100,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      console.log(`Storage list error for SKU "${sku}":`, error.message);
      return c.json({ sku, images: [], total: 0, error: "Erro ao listar imagens." });
    }

    if (!data || data.length === 0) {
      return c.json({ sku, images: [], total: 0 });
    }

    // Filter image files and sort by the numeric suffix
    const imageFiles = data
      .filter((f) => /\.(webp|png|jpg|jpeg|gif)$/i.test(f.name))
      .sort((a, b) => extractImageNumber(a.name) - extractImageNumber(b.name));

    const images = imageFiles.map((f) => ({
      name: f.name,
      url: `${supabaseUrl}/storage/v1/object/public/produtos/${encodeURIComponent(sku)}/${encodeURIComponent(f.name)}`,
      number: extractImageNumber(f.name),
      isPrimary: extractImageNumber(f.name) === 1,
    }));

    return c.json({ sku, images, total: images.length });
  } catch (e) {
    console.log("Error listing product images:", e);
    return c.json({ error: "Erro ao listar imagens.", sku: sku, images: [], total: 0 }, 500);
  }
});

// ═══════════════════════════════════════════════════
// ─── PRODUCT ATTRIBUTES (CSV from Supabase Storage)
// ═══════════════════════════════════════════════════

// Normalize a SKU for comparison: trim, uppercase, remove invisible chars
function normalizeSku(sku: string): string {
  return sku
    .trim()
    .toUpperCase()
    .replace(/[\u200B\uFEFF\u00A0\u200C\u200D\u2060]/g, "") // zero-width, BOM, NBSP
    .replace(/\s+/g, " ")
    .trim();
}

// Aggressive normalization: also strip hyphens, dots, underscores, spaces
function normalizeSkuAggressive(sku: string): string {
  return normalizeSku(sku).replace(/[-_.\s\/\\]/g, "");
}

// Fetch ALL product SKUs from the Supabase `produtos` table with proper pagination
async function fetchAllDbSkus(): Promise<{ skus: Set<string>; total: number }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    console.log("fetchAllDbSkus: Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return { skus: new Set(), total: 0 };
  }

  const apiUrl = `${supabaseUrl}/rest/v1/produtos?select=sku&order=sku.asc`;
  const pageSize = 1000; // PostgREST typical max per request

  // First request: get count + first page
  const firstRes = await fetch(apiUrl, {
    method: "GET",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Range: `0-${pageSize - 1}`,
      Prefer: "count=exact",
    },
  });

  if (!firstRes.ok) {
    console.log(`fetchAllDbSkus: first request failed [${firstRes.status}]`);
    return { skus: new Set(), total: 0 };
  }

  const firstData: { sku: string }[] = await firstRes.json();
  const allSkus = new Set(firstData.map((d) => d.sku));

  // Parse total from Content-Range header
  const contentRange = firstRes.headers.get("Content-Range") || firstRes.headers.get("content-range");
  let total = firstData.length;
  if (contentRange) {
    const match = contentRange.match(/\/(\d+|\*)/);
    if (match && match[1] !== "*") total = parseInt(match[1], 10);
  }

  console.log(`fetchAllDbSkus: first page got ${firstData.length} SKUs, total=${total}`);

  // If first page got everything, return early
  if (firstData.length >= total) {
    return { skus: allSkus, total };
  }

  // Fetch remaining pages in parallel
  const promises: Promise<{ sku: string }[]>[] = [];
  for (let offset = pageSize; offset < total; offset += pageSize) {
    promises.push(
      fetch(apiUrl, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Range: `${offset}-${offset + pageSize - 1}`,
        },
      }).then((r) => (r.ok ? r.json() : []))
    );
  }

  const results = await Promise.all(promises);
  let extraCount = 0;
  for (const data of results) {
    for (const d of data) {
      allSkus.add(d.sku);
      extraCount++;
    }
  }

  console.log(`fetchAllDbSkus: fetched ${extraCount} more SKUs in ${promises.length} extra pages. Total unique: ${allSkus.size}`);
  return { skus: allSkus, total };
}

// Match CSV SKUs against DB SKUs with multi-level normalization
function matchSkusAgainstDb(
  csvSkus: string[],
  dbSkus: Set<string>
): {
  matched: string[];
  unmatched: string[];
  matchedExact: number;
  matchedNormalized: number;
  matchedAggressive: number;
} {
  // Build normalized lookup maps from DB SKUs
  // Map: normalized SKU -> original DB SKU
  const dbExact = new Set<string>(dbSkus);
  const dbNormMap = new Map<string, string>();
  const dbAggressiveMap = new Map<string, string>();

  for (const dbSku of dbSkus) {
    const norm = normalizeSku(dbSku);
    if (!dbNormMap.has(norm)) dbNormMap.set(norm, dbSku);
    const agg = normalizeSkuAggressive(dbSku);
    if (!dbAggressiveMap.has(agg)) dbAggressiveMap.set(agg, dbSku);
  }

  const matched: string[] = [];
  const unmatched: string[] = [];
  let matchedExact = 0;
  let matchedNormalized = 0;
  let matchedAggressive = 0;

  for (const csvSku of csvSkus) {
    // Level 1: Exact match
    if (dbExact.has(csvSku)) {
      matched.push(csvSku);
      matchedExact++;
      continue;
    }

    // Level 2: Normalized match (trim + uppercase + invisible chars)
    const norm = normalizeSku(csvSku);
    if (dbNormMap.has(norm)) {
      matched.push(csvSku);
      matchedNormalized++;
      continue;
    }

    // Level 3: Aggressive match (also strip hyphens, dots, underscores, spaces)
    const agg = normalizeSkuAggressive(csvSku);
    if (dbAggressiveMap.has(agg)) {
      matched.push(csvSku);
      matchedAggressive++;
      continue;
    }

    unmatched.push(csvSku);
  }

  return { matched, unmatched, matchedExact, matchedNormalized, matchedAggressive };
}

// In-memory cache for parsed CSV attributes
let atributosCache: { data: Map<string, Record<string, string | string[]>>; fetchedAt: number } | null = null;
const ATRIBUTOS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ";" || ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

// Detect the delimiter used in the CSV (comma or semicolon)
function detectDelimiter(headerLine: string): string {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

// Parse full CSV text into a Map keyed by SKU
function parseAtributosCSV(csvText: string): Map<string, Record<string, string | string[]>> {
  const result = new Map<string, Record<string, string | string[]>>();
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return result;

  // Detect delimiter from header
  const delimiter = detectDelimiter(lines[0]);

  // Parse with detected delimiter
  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = splitLine(lines[0]);
  // Find SKU column index (case-insensitive)
  const skuIndex = headers.findIndex((h) => h.toLowerCase().replace(/[^a-z]/g, "") === "sku");
  if (skuIndex === -1) {
    console.log("CSV: SKU column not found in headers:", headers);
    return result;
  }

  console.log(`CSV parsed: ${lines.length - 1} rows, ${headers.length} columns, delimiter="${delimiter}", SKU col=${skuIndex}`);

  for (let i = 1; i < lines.length; i++) {
    const fields = splitLine(lines[i]);
    const sku = fields[skuIndex]?.trim();
    if (!sku) continue;

    const attributes: Record<string, string | string[]> = {};
    for (let j = 0; j < headers.length; j++) {
      if (j === skuIndex) continue; // skip SKU column itself
      const key = headers[j]?.trim();
      const value = fields[j]?.trim();
      if (!key || !value) continue;

      // If the value contains commas, split into array
      if (value.includes(",")) {
        const parts = value.split(",").map((v) => v.trim()).filter(Boolean);
        if (parts.length > 1) {
          attributes[key] = parts;
        } else if (parts.length === 1) {
          attributes[key] = parts[0];
        }
      } else {
        attributes[key] = value;
      }
    }

    if (Object.keys(attributes).length > 0) {
      result.set(sku, attributes);
    }
  }

  return result;
}

// Fetch and cache the CSV
async function getAtributosMap(): Promise<Map<string, Record<string, string | string[]>>> {
  const now = Date.now();
  if (atributosCache && now - atributosCache.fetchedAt < ATRIBUTOS_CACHE_TTL) {
    return atributosCache.data;
  }

  console.log("Fetching sku_atributos_limpo.csv from Supabase Storage (imports bucket)...");

  // Generate a signed URL for the CSV file (valid 30 min)
  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from("imports")
    .createSignedUrl("sku_atributos_limpo.csv", 1800);

  if (signedError || !signedData?.signedUrl) {
    console.log("Error creating signed URL for CSV:", signedError?.message);
    throw new Error(`Não foi possível gerar signed URL para o CSV: ${signedError?.message || "URL vazia"}`);
  }

  console.log("Signed URL generated, downloading CSV...");

  const response = await fetch(signedData.signedUrl);
  if (!response.ok) {
    const errText = await response.text();
    console.log(`CSV download failed [${response.status}]:`, errText);
    throw new Error(`Falha ao baixar CSV: HTTP ${response.status}`);
  }

  const csvText = await response.text();
  console.log(`CSV downloaded: ${csvText.length} bytes`);

  const parsed = parseAtributosCSV(csvText);
  console.log(`CSV parsed: ${parsed.size} SKUs with attributes`);

  atributosCache = { data: parsed, fetchedAt: now };
  return parsed;
}

// GET /produtos/atributos?sku=XYZ — return attributes for one SKU, or all if no sku param
app.get(BASE + "/produtos/atributos", async (c) => {
  try {
    const skuParam = (c.req.query("sku") || "").trim().substring(0, 100);
    const map = await getAtributosMap();

    if (skuParam) {
      // Single SKU lookup
      const attributes = map.get(skuParam) || null;
      return c.json({ sku: skuParam, attributes, found: !!attributes });
    }

    // Batch: return all
    const all: { sku: string; attributes: Record<string, string | string[]> }[] = [];
    map.forEach((attributes, sku) => {
      all.push({ sku, attributes });
    });
    return c.json({ total: all.length, data: all });
  } catch (e) {
    console.log("Error fetching product attributes:", e);
    return c.json({ error: "Erro ao buscar atributos.", attributes: null, found: false }, 500);
  }
});

// POST /parse-excel — server-side Excel parsing (replaces vulnerable client-side SheetJS)
// Accepts { data: base64string, filename: string } and returns { csv, sheetName }
app.post(BASE + "/parse-excel", async (c) => {
  try {
    var body = await c.req.json();
    // Input validation for parse-excel
    var excelValid = validate(body, {
      data: { required: true, type: "string", maxLen: 14000000, sanitize: false, trim: false },
      filename: { type: "string", maxLen: 255 },
    });
    if (!excelValid.ok) {
      return c.json({ error: excelValid.errors[0] || "Dados invalidos." }, 400);
    }
    var b64 = excelValid.sanitized.data;
    var filename = excelValid.sanitized.filename || "file.xlsx";

    if (!b64 || typeof b64 !== "string") {
      return c.json({ error: "Dados do arquivo não fornecidos." }, 400);
    }

    // Limit file size (10MB base64 ~ 7.5MB file)
    if (b64.length > 14000000) {
      return c.json({ error: "Arquivo muito grande. Máximo 10MB." }, 400);
    }

    // Decode base64 to binary
    var binaryStr = atob(b64);
    var bytes = new Uint8Array(binaryStr.length);
    for (var i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    var isXlsx = /\.xlsx$/i.test(filename);

    if (isXlsx) {
      // ── XLSX is a ZIP of XML files — parse without SheetJS ──
      // Use Deno's built-in JSZip-compatible approach
      // deno-lint-ignore-file
      var JSZip = (await import("npm:jszip@3.10.1")).default;
      var zip = await JSZip.loadAsync(bytes);

      // Find shared strings
      var sharedStrings: string[] = [];
      var ssFile = zip.file("xl/sharedStrings.xml");
      if (ssFile) {
        var ssXml = await ssFile.async("string");
        // Extract <t> tags content
        var tMatches = ssXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
        for (var tm = 0; tm < tMatches.length; tm++) {
          var val = tMatches[tm].replace(/<t[^>]*>/, "").replace(/<\/t>/, "");
          // Decode XML entities
          val = val.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
          sharedStrings.push(val);
        }
      }

      // Find first sheet
      var sheetFile = zip.file("xl/worksheets/sheet1.xml");
      var sheetName = "Sheet1";

      // Try workbook.xml for real sheet name
      var wbFile = zip.file("xl/workbook.xml");
      if (wbFile) {
        var wbXml = await wbFile.async("string");
        var nameMatch = wbXml.match(/<sheet\s+name="([^"]+)"/);
        if (nameMatch) {
          sheetName = nameMatch[1];
        }
      }

      if (!sheetFile) {
        // Try finding any sheet
        var sheetFiles = zip.file(/xl\/worksheets\/sheet\d+\.xml/);
        if (sheetFiles.length > 0) {
          sheetFile = sheetFiles[0];
        }
      }

      if (!sheetFile) {
        return c.json({ error: "Nenhuma planilha encontrada no arquivo XLSX." }, 400);
      }

      var sheetXml = await sheetFile.async("string");

      // Parse rows from sheet XML
      var rows: string[][] = [];
      var rowMatches = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
      for (var ri = 0; ri < rowMatches.length; ri++) {
        var rowXml = rowMatches[ri];
        var cellMatches = rowXml.match(/<c[^>]*>[\s\S]*?<\/c>|<c[^/]*\/>/g) || [];
        var rowData: string[] = [];

        for (var ci = 0; ci < cellMatches.length; ci++) {
          var cellXml = cellMatches[ci];
          // Get column reference to determine position
          var refMatch = cellXml.match(/r="([A-Z]+)\d+"/);
          var colIdx = 0;
          if (refMatch) {
            var colRef = refMatch[1];
            colIdx = 0;
            for (var ch = 0; ch < colRef.length; ch++) {
              colIdx = colIdx * 26 + (colRef.charCodeAt(ch) - 64);
            }
            colIdx = colIdx - 1; // 0-based
          }

          // Ensure array has enough columns
          while (rowData.length <= colIdx) {
            rowData.push("");
          }

          // Get value
          var vMatch = cellXml.match(/<v>([^<]*)<\/v>/);
          var cellValue = "";
          if (vMatch) {
            var typeMatch = cellXml.match(/t="([^"]+)"/);
            if (typeMatch && typeMatch[1] === "s") {
              // Shared string reference
              var ssIdx = parseInt(vMatch[1], 10);
              cellValue = sharedStrings[ssIdx] || "";
            } else {
              cellValue = vMatch[1];
            }
          }

          // Decode XML entities
          cellValue = cellValue.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
          rowData[colIdx] = cellValue;
        }

        rows.push(rowData);
      }

      // Convert to semicolon-delimited CSV
      var csvLines: string[] = [];
      for (var rr = 0; rr < rows.length; rr++) {
        var line = rows[rr].map(function (f) {
          if (f.indexOf(";") >= 0 || f.indexOf('"') >= 0 || f.indexOf("\n") >= 0) {
            return '"' + f.replace(/"/g, '""') + '"';
          }
          return f;
        }).join(";");
        csvLines.push(line);
      }

      return c.json({ csv: csvLines.join("\n"), sheetName: sheetName });

    } else {
      // ── XLS (legacy binary format) — convert via basic text extraction ──
      // XLS is a complex binary format. For safety, we extract readable text.
      // This handles most simple spreadsheets but may miss formatting.
      var textDecoder = new TextDecoder("utf-8", { fatal: false });
      var rawText = textDecoder.decode(bytes);

      // Try to find tab-delimited or structured content
      // XLS files contain the text data interspersed with binary
      // Extract printable strings of reasonable length
      var extracted: string[] = [];
      var current = "";
      for (var xi = 0; xi < rawText.length; xi++) {
        var code = rawText.charCodeAt(xi);
        if (code >= 32 && code < 127 || code >= 160) {
          current += rawText[xi];
        } else {
          if (current.length >= 1) {
            extracted.push(current);
          }
          current = "";
        }
      }
      if (current.length >= 1) extracted.push(current);

      // For legacy XLS, recommend converting to XLSX or CSV first
      return c.json({
        error: "Formato XLS (Excel 97-2003) não é suportado diretamente. Por favor, abra o arquivo no Excel ou Google Planilhas e salve como XLSX ou CSV antes de importar."
      }, 400);
    }

  } catch (e) {
    console.log("Error parsing Excel:", e);
    return c.json({ error: _safeError("Erro ao processar arquivo Excel.", e) }, 500);
  }
});

// POST /produtos/atributos/upload — upload CSV, validate against DB, store in Storage, invalidate cache
app.post(BASE + "/produtos/atributos/upload", async (c) => {
  try {
    // Auth check
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Não autorizado. Faça login para acessar esta funcionalidade." }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return c.json({ error: "Nenhum arquivo CSV enviado." }, 400);
    }

    const csvText = await file.text();
    if (!csvText.trim()) {
      return c.json({ error: "O arquivo CSV está vazio." }, 400);
    }

    console.log(`CSV upload: ${csvText.length} bytes, filename=${file.name}`);

    // Parse the CSV using the existing parser
    const parsed = parseAtributosCSV(csvText);
    const csvSkus = Array.from(parsed.keys());

    if (csvSkus.length === 0) {
      return c.json({ error: "Nenhum SKU válido encontrado no CSV. Verifique se existe uma coluna 'SKU'." }, 400);
    }

    // Get all headers from CSV for reporting
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const delimiter = detectDelimiter(lines[0]);
    const allHeaders = lines[0].split(delimiter === ";" ? /;/ : /,/).map((h) => h.replace(/"/g, "").trim());
    const attrHeaders = allHeaders.filter((h) => h.toLowerCase().replace(/[^a-z]/g, "") !== "sku");

    // Fetch all products from DB to match SKUs
    const { skus: dbSkus, total: dbTotal } = await fetchAllDbSkus();

    // Match CSV SKUs against DB
    const { matched, unmatched, matchedExact, matchedNormalized, matchedAggressive } =
      matchSkusAgainstDb(csvSkus, dbSkus);

    // Upload the CSV to Supabase Storage (replace existing)
    const bucketName = "imports";
    const fileName = "sku_atributos_limpo.csv";

    // Ensure bucket exists
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const bucketExists = buckets?.some((b: { name: string }) => b.name === bucketName);
    if (!bucketExists) {
      await supabaseAdmin.storage.createBucket(bucketName, { public: false });
      console.log(`Created storage bucket: ${bucketName}`);
    }

    // Upload (upsert) the CSV file
    const csvBlob = new Blob([csvText], { type: "text/csv" });
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(fileName, csvBlob, {
        contentType: "text/csv",
        upsert: true,
      });

    if (uploadError) {
      console.log("Storage upload error:", uploadError.message);
      return c.json({
        error: `Erro ao salvar CSV no Storage: ${uploadError.message}`,
      }, 500);
    }

    console.log(`CSV uploaded to Storage: ${bucketName}/${fileName}`);

    // Invalidate the in-memory cache so next reads pick up new data
    atributosCache = null;

    // Build a preview of first 5 matched items
    const preview = matched.slice(0, 5).map((sku) => {
      const attrs = parsed.get(sku);
      return { sku, attributes: attrs || {} };
    });

    return c.json({
      success: true,
      totalCsv: csvSkus.length,
      totalDb: dbTotal,
      matched: matched.length,
      unmatched: unmatched.length,
      unmatchedSkus: unmatched.slice(0, 50),
      columns: attrHeaders,
      preview,
      message: `CSV processado com sucesso. ${matched.length} SKUs vinculados, ${unmatched.length} sem correspondência no banco.`,
      matchDetails: {
        exact: matchedExact,
        normalized: matchedNormalized,
        aggressive: matchedAggressive,
      },
    });
  } catch (e) {
    console.log("Error processing CSV upload:", e);
    return c.json({ error: "Erro ao processar upload." }, 500);
  }
});

// DELETE /produtos/atributos — clear the CSV from Storage and invalidate cache
app.delete(BASE + "/produtos/atributos", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Não autorizado." }, 401);
    }

    const { error } = await supabaseAdmin.storage
      .from("imports")
      .remove(["sku_atributos_limpo.csv"]);

    if (error) {
      console.log("Error removing CSV from Storage:", error.message);
      return c.json({ error: "Erro ao remover CSV." }, 500);
    }

    atributosCache = null;
    return c.json({ success: true, message: "CSV de atributos removido com sucesso." });
  } catch (e) {
    console.log("Error deleting attributes CSV:", e);
    return c.json({ error: "Erro ao remover atributos." }, 500);
  }
});

// POST /produtos/match-skus — bulk match CSV SKUs against DB (used during analysis step)
app.post(BASE + "/produtos/match-skus", async (c) => {
  try {
    const body = await c.req.json();
    // Input validation
    var matchSkusValid = validate(body, {
      skus: { required: true, type: "array", maxItems: 10000 },
    });
    if (!matchSkusValid.ok) {
      return c.json({ error: matchSkusValid.errors[0] || "Dados invalidos." }, 400);
    }
    const skus: string[] = matchSkusValid.sanitized.skus;

    if (!Array.isArray(skus) || skus.length === 0) {
      return c.json({ error: "Campo 'skus' deve ser um array de strings não vazio." }, 400);
    }

    console.log(`match-skus: Received ${skus.length} SKUs to match`);

    const { skus: dbSkus, total: dbTotal } = await fetchAllDbSkus();
    console.log(`match-skus: DB has ${dbSkus.size} unique SKUs (total rows: ${dbTotal})`);

    const {
      matched,
      unmatched,
      matchedExact,
      matchedNormalized,
      matchedAggressive,
    } = matchSkusAgainstDb(skus, dbSkus);

    console.log(
      `match-skus: Results => matched=${matched.length} (exact=${matchedExact}, norm=${matchedNormalized}, agg=${matchedAggressive}), unmatched=${unmatched.length}`
    );

    return c.json({
      totalDb: dbTotal,
      totalDbUnique: dbSkus.size,
      matched,
      unmatched: unmatched.slice(0, 200), // limit unmatched list for response size
      totalMatched: matched.length,
      totalUnmatched: unmatched.length,
      matchDetails: {
        exact: matchedExact,
        normalized: matchedNormalized,
        aggressive: matchedAggressive,
      },
    });
  } catch (e) {
    console.log("Error matching SKUs:", e);
    return c.json({ error: "Erro ao verificar SKUs." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── AUTOCOMPLETE ENDPOINT ────────────
// ═══════════════════════════════════════

app.get(BASE + "/produtos/autocomplete", async (c) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return c.json({ error: "Configuração incompleta do servidor." }, 500);
    }

    const query = (c.req.query("q") || "").trim().substring(0, 200);
    const limitResults = Math.min(parseInt(c.req.query("limit") || "8", 10), 20);

    if (!query || query.length < 2) {
      return c.json({ results: [], query });
    }

    const queryNorm = normalizeText(query);
    const queryPhonetic = phoneticKey(query);
    const queryTokens = queryNorm.split(" ").filter((t) => t.length >= 2);

    // Generate accent-aware search conditions using AND logic between tokens
    const searchConditions = buildSearchConditions(query, "autocomplete");

    const queryStr = `select=sku,titulo&or=(${encodeURIComponent(searchConditions)})&order=titulo.asc`;
    const apiUrl = `${supabaseUrl}/rest/v1/produtos?${queryStr}`;

    console.log(`Autocomplete: q="${query}" | tokens=${queryNorm.split(" ").filter((t: string) => t.length >= 2 && !PT_STOPWORDS.has(t)).join(",")}`);

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Range: "0-199",
        Prefer: "count=exact",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Autocomplete Supabase error [${response.status}]: ${errorText}`);
      return c.json({ error: "Erro na busca.", results: [] }, 502);
    }

    const data: { sku: string; titulo: string }[] = await response.json();

    // Parse total from Content-Range
    const contentRange = response.headers.get("Content-Range") || response.headers.get("content-range");
    let totalMatches = data.length;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+|\*)/);
      if (match && match[1] !== "*") totalMatches = parseInt(match[1], 10);
    }

    // Score and rank results
    const scored = data.map((item) => ({
      ...item,
      score: scoreProduct(queryNorm, queryPhonetic, queryTokens, item.titulo, item.sku),
    }));

    // Filter out zero-score items and sort by score desc
    const ranked = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limitResults);

    // Determine match types for UI hints
    const results = ranked.map((item) => {
      const tituloNorm = normalizeText(item.titulo);
      const skuNorm = normalizeText(item.sku);
      let matchType: "exact" | "sku" | "similar" | "fuzzy" = "fuzzy";

      if (tituloNorm.includes(queryNorm) || skuNorm.includes(queryNorm)) {
        matchType = "exact";
      } else if (skuNorm.includes(queryNorm.replace(/\s/g, ""))) {
        matchType = "sku";
      } else if (item.score >= 80) {
        matchType = "similar";
      }

      return {
        sku: item.sku,
        titulo: item.titulo,
        matchType,
        score: item.score,
      };
    });

    return c.json({
      results,
      query,
      totalMatches,
    });
  } catch (e) {
    console.log("Autocomplete error:", e);
    return c.json({ error: "Erro no autocomplete.", results: [] }, 500);
  }
});

// ════════════════════════════════════════════���══════
// ─── CATEGORY-FILTERED CATALOG (public endpoint) ──
// ═══════════════════════════════════════════════════

// Collect all descendant slugs from a category tree node (recursive)
function collectDescendantSlugs(nodes: any[], targetSlug: string): string[] {
  const slugs: string[] = [];
  function findAndCollect(nodeList: any[], collecting: boolean): void {
    for (const node of nodeList) {
      const isTarget = node.slug === targetSlug;
      if (isTarget || collecting) {
        slugs.push(node.slug);
        if (node.children) findAndCollect(node.children, true);
      } else if (node.children) {
        findAndCollect(node.children, false);
      }
    }
  }
  findAndCollect(nodes, false);
  return [...new Set(slugs)];
}

// In-memory cache for product metas (category index)
let metaIndexCache: { data: Map<string, any>; fetchedAt: number } | null = null;
const META_INDEX_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (reduced KV reads for CPU savings)

async function getAllProductMetas(): Promise<Map<string, any>> {
  const now = Date.now();
  if (metaIndexCache && now - metaIndexCache.fetchedAt < META_INDEX_CACHE_TTL) {
    return metaIndexCache.data;
  }
  const metas = await kv.getByPrefix("produto_meta:");
  const map = new Map<string, any>();
  for (const meta of metas) {
    if (meta && typeof meta === "object" && meta.sku) {
      map.set(meta.sku, meta);
    }
  }
  metaIndexCache = { data: map, fetchedAt: now };
  return map;
}

function invalidateMetaCache(): void {
  metaIndexCache = null;
}

function findCategoryName(nodes: any[], slug: string): string | null {
  for (const node of nodes) {
    if (node.slug === slug) return node.name;
    if (node.children) {
      const found = findCategoryName(node.children, slug);
      if (found) return found;
    }
  }
  return null;
}

function buildCategoryBreadcrumb(nodes: any[], targetSlug: string, path: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.slug === targetSlug) return [...path, node.name];
    if (node.children) {
      const found = buildCategoryBreadcrumb(node.children, targetSlug, [...path, node.name]);
      if (found) return found;
    }
  }
  return null;
}

/* NOTE: catalog endpoint removed — category + visibility filtering is now in GET /produtos via ?categoria=&public=1 params
    if (!supabaseUrl || !supabaseKey) {
      return c.json({ error: "Configuração do servidor incompleta." }, 500);
    }

    const page = Math.max(parseInt(c.req.query("page") || "1", 10), 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "24", 10), 100);
    const search = (c.req.query("search") || "").substring(0, 200);
    const categoriaSlug = (c.req.query("categoria") || "").trim().substring(0, 200);

    if (!categoriaSlug) {
      // No category filter — filter out invisible products
      const allMetas = await getAllProductMetas();
      const invisibleSkus: string[] = [];
      allMetas.forEach((meta, _sku) => {
        if (meta.visible === false) invisibleSkus.push(meta.sku);
      });

      let queryStr = "select=sku,titulo";
      if (search.trim()) {
        const searchConditions = buildSearchConditions(search, "catalog");
        queryStr += `&or=(${encodeURIComponent(searchConditions)})`;
      }
      if (invisibleSkus.length > 0 && invisibleSkus.length <= 500) {
        const negList = invisibleSkus.map((s) => encodeURIComponent(s)).join(",");
        queryStr += `&sku=not.in.(${negList})`;
      }
      queryStr += "&order=titulo.asc";

      const offset = (page - 1) * limit;
      const apiUrl = `${supabaseUrl}/rest/v1/produtos?${queryStr}`;
      console.log(`Catalog (no category): Range: ${offset}-${offset + limit - 1}`);

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Range: `${offset}-${offset + limit - 1}`,
          Prefer: "count=exact",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log("Catalog query error [" + response.status + "]: " + errorText);
        return c.json({ error: "Erro ao consultar produtos." }, 502);
      }

      const data = await response.json();
      const contentRange = response.headers.get("Content-Range") || response.headers.get("content-range");
      let total = data.length;
      if (contentRange) {
        const m = contentRange.match(/\/(\d+|\*)/);
        if (m && m[1] !== "*") total = parseInt(m[1], 10);
      }
      const totalPages = Math.ceil(total / limit);

      return c.json({
        data,
        pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
        categoria: null,
        categoryName: null,
        categoryBreadcrumb: null,
      });
    }

    // ── Category filter active ──
    const categoryTree = (await kv.get("category_tree")) || [];
    const targetSlugs = collectDescendantSlugs(categoryTree, categoriaSlug);
    if (targetSlugs.length === 0) targetSlugs.push(categoriaSlug);

    const categoryName = findCategoryName(categoryTree, categoriaSlug);
    const categoryBreadcrumb = buildCategoryBreadcrumb(categoryTree, categoriaSlug);

    console.log(`Catalog category: slug="${categoriaSlug}", name="${categoryName}", ${targetSlugs.length} slugs`);

    const allMetas = await getAllProductMetas();
    const matchingSkus: string[] = [];
    const targetSlugSet = new Set(targetSlugs);

    allMetas.forEach((meta, sku) => {
      if (meta.visible === false) return;
      if (meta.category && targetSlugSet.has(meta.category)) {
        matchingSkus.push(sku);
      }
    });

    console.log(`Category "${categoriaSlug}": ${matchingSkus.length} visible products`);

    if (matchingSkus.length === 0) {
      return c.json({
        data: [],
        pagination: { page: 1, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        categoria: categoriaSlug,
        categoryName,
        categoryBreadcrumb,
      });
    }

    const skuList = matchingSkus.map((s) => encodeURIComponent(s)).join(",");
    let queryStr = `select=sku,titulo&sku=in.(${skuList})`;
    if (search.trim()) {
      const searchConditions = buildSearchConditions(search, "catalog");
      queryStr += `&or=(${encodeURIComponent(searchConditions)})`;
    }
    queryStr += "&order=titulo.asc";

    const offset = (page - 1) * limit;
    const apiUrl = `${supabaseUrl}/rest/v1/produtos?${queryStr}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Range: `${offset}-${offset + limit - 1}`,
        Prefer: "count=exact",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log("Catalog category query error [" + response.status + "]: " + errorText);
      return c.json({ error: "Erro ao consultar produtos." }, 502);
    }

    const data = await response.json();
    const contentRange = response.headers.get("Content-Range") || response.headers.get("content-range");
    let total = data.length;
    if (contentRange) {
      const m = contentRange.match(/\/(\d+|\*)/);
      if (m && m[1] !== "*") total = parseInt(m[1], 10);
    }
    const totalPages = Math.ceil(total / limit);

    return c.json({
      data,
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
      categoria: categoriaSlug,
      categoryName,
      categoryBreadcrumb,
    });
  } catch (e) {
    console.log("Error in catalog endpoint:", e);
REMOVED - END */

// ═══════════════════════════════════════════════
// ─── PRODUTOS (Supabase REST API Proxy) ───────
// ═══════════════════════════════════════════════

// GET /produtos/destaques — return truly random visible products from across the entire catalog
app.get(BASE + "/produtos/destaques", async (c) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return c.json({ error: "Configuração do servidor incompleta." }, 500);
    }

    const limit = Math.min(parseInt(c.req.query("limit") || "8", 10), 24);

    // 1. Get invisible SKUs to exclude
    const allMetas = await getAllProductMetas();
    const invisibleSkus: string[] = [];
    allMetas.forEach((meta) => {
      if (meta.visible === false && meta.sku) invisibleSkus.push(meta.sku);
    });

    // 2. Build base query filter for visible products
    let baseFilter = "";
    if (invisibleSkus.length > 0 && invisibleSkus.length <= 500) {
      const negList = invisibleSkus.map((s) => encodeURIComponent(s)).join(",");
      baseFilter = `&sku=not.in.(${negList})`;
    }

    // 3. Get total count of visible products
    const countRes = await fetch(
      `${supabaseUrl}/rest/v1/produtos?select=sku${baseFilter}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Range: "0-0",
          Prefer: "count=exact",
        },
      }
    );

    const contentRange = countRes.headers.get("Content-Range") || countRes.headers.get("content-range");
    let total = 0;
    if (contentRange) {
      const m = contentRange.match(/\/(\d+|\*)/);
      if (m && m[1] !== "*") total = parseInt(m[1], 10);
    }

    if (total === 0) {
      return c.json({ data: [] });
    }

    // 4. Generate `limit` unique random offsets spread across the entire catalog
    const indices = new Set<number>();
    const maxAttempts = limit * 10;
    let attempts = 0;
    while (indices.size < Math.min(limit, total) && attempts < maxAttempts) {
      indices.add(Math.floor(Math.random() * total));
      attempts++;
    }
    const sortedIndices = Array.from(indices).sort((a, b) => a - b);

    // 5. Fetch each product individually in parallel (8 tiny parallel requests server→Supabase)
    const baseQuery = `select=sku,titulo&order=titulo.asc${baseFilter}`;
    const fetches = sortedIndices.map((offset) =>
      fetch(`${supabaseUrl}/rest/v1/produtos?${baseQuery}`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Range: `${offset}-${offset}`,
        },
      }).then(async (r) => {
        if (!r.ok) return null;
        const arr = await r.json();
        return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
      }).catch(() => null)
    );

    const results = await Promise.all(fetches);
    const data = results.filter(Boolean);

    // 6. Deduplicate by SKU (edge case)
    const seen = new Set<string>();
    const unique = data.filter((p: any) => {
      if (seen.has(p.sku)) return false;
      seen.add(p.sku);
      return true;
    });

    // 7. Shuffle final results (Fisher-Yates)
    for (let i = unique.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unique[i], unique[j]] = [unique[j], unique[i]];
    }

    return c.json({ data: unique });
  } catch (e) {
    console.log("Error fetching destaques:", e);
    return c.json({ error: _safeError("Erro ao buscar destaques", e) }, 500);
  }
});

app.get(BASE + "/produtos", async (c) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.log("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables for produtos endpoint");
      return c.json(
        { error: "Configuração do servidor incompleta: variáveis de ambiente SUPABASE_URL ou SUPABASE_ANON_KEY não encontradas." },
        500
      );
    }

    const page = Math.max(parseInt(c.req.query("page") || "1", 10), 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "24", 10), 100);
    const search = (c.req.query("search") || "").substring(0, 200);
    const skuExact = (c.req.query("sku") || "").substring(0, 100);
    const categoriaSlug = (c.req.query("categoria") || "").trim().substring(0, 200);
    const publicMode = (c.req.query("public") || "").substring(0, 10);
    const sortParam = (c.req.query("sort") || "").trim().substring(0, 30);

    // Map sort param to Supabase REST order clause
    var orderClause = "titulo.asc";
    if (sortParam === "nome-desc") orderClause = "titulo.desc";
    else if (sortParam === "sku-asc") orderClause = "sku.asc";
    else if (sortParam === "sku-desc") orderClause = "sku.desc";
    else if (sortParam === "nome-asc") orderClause = "titulo.asc";

    const offset = (page - 1) * limit;
    const rangeStart = offset;
    const rangeEnd = offset + limit - 1;

    // ═══════════════════════════════════════════════════════
    // ── SERVER-SIDE PRICE / STOCK SORT (global across pages)
    // ═══════════════════════════════════════════════════════
    var isPriceSort = sortParam === "preco-asc" || sortParam === "preco-desc" || sortParam === "estoque";
    if (isPriceSort && (publicMode === "1" || categoriaSlug)) {
      console.log("[PriceSort] sort=" + sortParam + " page=" + page + " limit=" + limit + " search=" + (search || "(none)") + " cat=" + (categoriaSlug || "(none)"));
      var psT0 = Date.now();

      // 1. Determine visible SKU set (same logic as normal catalog)
      var psCategoryName: string | null = null;
      var psCategoryBreadcrumb: string[] | null = null;
      var psSkuFilter: string[] | null = null;
      var psAllMetas = await getAllProductMetas();

      if (categoriaSlug) {
        var psCatTree = (await kv.get("category_tree")) || [];
        var psTargetSlugs = collectDescendantSlugs(psCatTree, categoriaSlug);
        if (psTargetSlugs.length === 0) psTargetSlugs.push(categoriaSlug);
        psCategoryName = findCategoryName(psCatTree, categoriaSlug);
        psCategoryBreadcrumb = buildCategoryBreadcrumb(psCatTree, categoriaSlug);
        var psTargetSet = new Set(psTargetSlugs);
        var psMatchSkus: string[] = [];
        psAllMetas.forEach(function(meta) {
          if (meta.visible === false) return;
          if (meta.category && psTargetSet.has(meta.category)) psMatchSkus.push(meta.sku);
        });
        if (psMatchSkus.length === 0) {
          return c.json({
            data: [], pagination: { page: 1, limit: limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
            categoria: categoriaSlug, categoryName: psCategoryName, categoryBreadcrumb: psCategoryBreadcrumb,
          });
        }
        psSkuFilter = psMatchSkus;
      }

      // 2. Fetch ALL matching sku+titulo from Supabase (no pagination — we paginate after sort)
      var psQueryStr = "select=sku,titulo";
      if (psSkuFilter) {
        var psSkuList = psSkuFilter.map(function(s) { return encodeURIComponent(s); }).join(",");
        psQueryStr += "&sku=in.(" + psSkuList + ")";
      } else {
        var psInvisible: string[] = [];
        psAllMetas.forEach(function(meta) {
          if (meta.visible === false && meta.sku) psInvisible.push(meta.sku);
        });
        if (psInvisible.length > 0 && psInvisible.length <= 500) {
          var psNegList = psInvisible.map(function(s) { return encodeURIComponent(s); }).join(",");
          psQueryStr += "&sku=not.in.(" + psNegList + ")";
        }
      }
      if (search.trim()) {
        var psSearchCond = buildSearchConditions(search, "catalog");
        psQueryStr += "&or=(" + encodeURIComponent(psSearchCond) + ")";
      }
      psQueryStr += "&order=titulo.asc";

      // Fetch ALL rows — use large Range header
      var psApiUrl = supabaseUrl + "/rest/v1/produtos?" + psQueryStr;
      console.log("[PriceSort] Fetching all matching products...");
      var psResp = await fetch(psApiUrl, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: "Bearer " + supabaseKey,
          "Content-Type": "application/json",
          Range: "0-49999",
          Prefer: "count=exact",
        },
      });
      if (!psResp.ok) {
        var psErrText = await psResp.text();
        console.log("[PriceSort] Query error [" + psResp.status + "]: " + psErrText);
        return c.json({ error: "Erro ao consultar produtos: HTTP " + psResp.status }, psResp.status);
      }
      var psAllProducts: Array<{ sku: string; titulo: string }> = await psResp.json();
      var psTotalAll = psAllProducts.length;
      // Try to get exact count from Content-Range
      var psCR = psResp.headers.get("Content-Range") || psResp.headers.get("content-range");
      if (psCR) {
        var psCRM = psCR.match(/\/(\d+|\*)/);
        if (psCRM && psCRM[1] !== "*") psTotalAll = parseInt(psCRM[1], 10);
      }
      console.log("[PriceSort] Got " + psAllProducts.length + " products (total=" + psTotalAll + ")");

      // 3. Read ALL cached prices or balances from KV in one query
      if (sortParam === "preco-asc" || sortParam === "preco-desc") {
        // Read price config
        var psCfg = await getPriceConfigCached();
        var psTier = psCfg.tier || "v2";

        // Batch read: custom prices + cached sige prices
        var psPriceResult = await supabaseAdmin
          .from("kv_store_b7b07654")
          .select("key, value")
          .or("key.like.sige_price_%,key.like.price_custom_%,key.like.product_price_%")
          .range(0, 49999);
        var psPriceRows = (psPriceResult.data || []) as Array<{ key: string; value: any }>;

        // Build price map: sku -> number
        var psPriceMap: Record<string, number> = {};
        var psCustomMap: Record<string, number> = {};
        for (var pri = 0; pri < psPriceRows.length; pri++) {
          var prRow = psPriceRows[pri];
          if (!prRow || !prRow.key) continue;
          var prVal = prRow.value;
          if (typeof prVal === "object" && prVal !== null && prVal.value !== undefined) prVal = prVal.value;
          if (typeof prVal === "string") { try { prVal = JSON.parse(prVal); } catch(e) { continue; } }
          if (!prVal || typeof prVal !== "object") continue;

          if (prRow.key.indexOf("price_custom_") === 0 || prRow.key.indexOf("product_price_") === 0) {
            var pcSku = prRow.key.indexOf("price_custom_") === 0
              ? prRow.key.substring(13)
              : prRow.key.substring(14);
            if (prVal.price !== undefined && prVal.price !== null) {
              var pcNum = Number(prVal.price);
              if (!isNaN(pcNum) && pcNum > 0) psCustomMap[pcSku] = pcNum;
            }
          } else if (prRow.key.indexOf("sige_price_") === 0) {
            var spSku = prRow.key.substring(11);
            // Check TTL (30 min)
            if (prVal._cachedAt && (Date.now() - prVal._cachedAt) > 30 * 60 * 1000) continue;
            if (!prVal.found) continue;
            // Recompute price for current tier
            var spV1 = prVal.v1 != null ? Number(prVal.v1) : null;
            var spV2 = prVal.v2 != null ? Number(prVal.v2) : null;
            var spV3 = prVal.v3 != null ? Number(prVal.v3) : null;
            var spBase = prVal.base != null ? Number(prVal.base) : null;
            var spPrice: number | null = null;
            if (psTier === "v1" && spV1 !== null) spPrice = spV1;
            else if (psTier === "v2" && spV2 !== null) spPrice = spV2;
            else if (psTier === "v3" && spV3 !== null) spPrice = spV3;
            else if (spBase !== null) spPrice = spBase;
            else if (spV2 !== null) spPrice = spV2;
            else if (spV1 !== null) spPrice = spV1;
            else if (spV3 !== null) spPrice = spV3;
            if (spPrice !== null && !isNaN(spPrice) && spPrice > 0) psPriceMap[spSku] = spPrice;
          }
        }
        // Custom overrides sige
        for (var ck in psCustomMap) {
          psPriceMap[ck] = psCustomMap[ck];
        }

        console.log("[PriceSort] Price map size: " + Object.keys(psPriceMap).length + " | products: " + psAllProducts.length);

        // 4. Sort all products by price
        var psNoPrice = sortParam === "preco-asc" ? 999999999 : -1;
        psAllProducts.sort(function(a, b) {
          var pa = psPriceMap[a.sku] !== undefined ? psPriceMap[a.sku] : psNoPrice;
          var pb = psPriceMap[b.sku] !== undefined ? psPriceMap[b.sku] : psNoPrice;
          if (pa !== pb) return sortParam === "preco-asc" ? pa - pb : pb - pa;
          return (a.titulo || "").localeCompare(b.titulo || "");
        });
      } else {
        // Stock sort — read all cached balances
        var psBalResult = await supabaseAdmin
          .from("kv_store_b7b07654")
          .select("key, value")
          .like("key", "sige_balance_%")
          .range(0, 49999);
        var psBalRows = (psBalResult.data || []) as Array<{ key: string; value: any }>;
        var psBalMap: Record<string, number> = {};
        for (var bi = 0; bi < psBalRows.length; bi++) {
          var bRow = psBalRows[bi];
          if (!bRow || !bRow.key) continue;
          var bSku = bRow.key.substring(13);
          var bVal = bRow.value;
          if (typeof bVal === "object" && bVal !== null && bVal.value !== undefined) bVal = bVal.value;
          if (typeof bVal === "string") { try { bVal = JSON.parse(bVal); } catch(e) { continue; } }
          if (!bVal || typeof bVal !== "object") continue;
          if (bVal._cachedAt && (Date.now() - bVal._cachedAt) > 15 * 60 * 1000) continue;
          if (!bVal.found) continue;
          var bQty = bVal.disponivel !== undefined && bVal.disponivel !== null ? Number(bVal.disponivel) : (bVal.quantidade !== undefined ? Number(bVal.quantidade) : 0);
          if (!isNaN(bQty)) psBalMap[bSku] = bQty;
        }

        console.log("[PriceSort] Balance map size: " + Object.keys(psBalMap).length);

        psAllProducts.sort(function(a, b) {
          var sa = psBalMap[a.sku] !== undefined ? psBalMap[a.sku] : -1;
          var sb = psBalMap[b.sku] !== undefined ? psBalMap[b.sku] : -1;
          if (sa !== sb) return sb - sa;
          return (a.titulo || "").localeCompare(b.titulo || "");
        });
      }

      // 5. Paginate the sorted list
      var psSlice = psAllProducts.slice(rangeStart, rangeStart + limit);
      var psTotalPages = Math.ceil(psTotalAll / limit);

      console.log("[PriceSort] Done in " + (Date.now() - psT0) + "ms | returning page " + page + "/" + psTotalPages + " (" + psSlice.length + " items)");

      return c.json({
        data: psSlice,
        pagination: { page: page, limit: limit, total: psTotalAll, totalPages: psTotalPages, hasNext: page < psTotalPages, hasPrev: page > 1 },
        categoria: categoriaSlug || null,
        categoryName: psCategoryName,
        categoryBreadcrumb: psCategoryBreadcrumb,
      });
    }

    // ── Category + visibility filtering (public catalog) ──
    if (categoriaSlug || publicMode === "1") {
      let categoryName: string | null = null;
      let categoryBreadcrumb: string[] | null = null;
      let skuFilter: string[] | null = null;

      if (categoriaSlug) {
        const categoryTree = (await kv.get("category_tree")) || [];
        const targetSlugs = collectDescendantSlugs(categoryTree, categoriaSlug);
        if (targetSlugs.length === 0) targetSlugs.push(categoriaSlug);

        categoryName = findCategoryName(categoryTree, categoriaSlug);
        categoryBreadcrumb = buildCategoryBreadcrumb(categoryTree, categoriaSlug);

        console.log(`Catalog category: slug="${categoriaSlug}", name="${categoryName}", ${targetSlugs.length} slugs`);

        const allMetas = await getAllProductMetas();
        const matchingSkus: string[] = [];
        const targetSlugSet = new Set(targetSlugs);

        allMetas.forEach((meta, _sku) => {
          if (meta.visible === false) return;
          if (meta.category && targetSlugSet.has(meta.category)) {
            matchingSkus.push(meta.sku);
          }
        });

        console.log(`Category "${categoriaSlug}": ${matchingSkus.length} visible products`);

        if (matchingSkus.length === 0) {
          return c.json({
            data: [],
            pagination: { page: 1, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
            categoria: categoriaSlug,
            categoryName,
            categoryBreadcrumb,
          });
        }
        skuFilter = matchingSkus;
      }

      let catQueryStr = "select=sku,titulo";

      if (skuFilter) {
        const skuList = skuFilter.map((s) => encodeURIComponent(s)).join(",");
        catQueryStr += `&sku=in.(${skuList})`;
      } else {
        // Public mode without category: exclude invisible SKUs
        const allMetas = await getAllProductMetas();
        const invisibleSkus: string[] = [];
        allMetas.forEach((meta) => {
          if (meta.visible === false && meta.sku) invisibleSkus.push(meta.sku);
        });
        if (invisibleSkus.length > 0 && invisibleSkus.length <= 500) {
          const negList = invisibleSkus.map((s) => encodeURIComponent(s)).join(",");
          catQueryStr += `&sku=not.in.(${negList})`;
        }
      }

      if (search.trim()) {
        const searchConditions = buildSearchConditions(search, "catalog");
        catQueryStr += `&or=(${encodeURIComponent(searchConditions)})`;
      }
      catQueryStr += "&order=" + orderClause;

      const catApiUrl = `${supabaseUrl}/rest/v1/produtos?${catQueryStr}`;
      console.log(`Catalog query | Range: ${rangeStart}-${rangeEnd}`);

      const catResponse = await fetch(catApiUrl, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Range: `${rangeStart}-${rangeEnd}`,
          Prefer: "count=exact",
        },
      });

      if (!catResponse.ok) {
        const errorText = await catResponse.text();
        console.log("Catalog query error [" + catResponse.status + "]: " + errorText);
        return c.json({ error: "Erro ao consultar produtos." }, 502);
      }

      const catData = await catResponse.json();
      const catContentRange = catResponse.headers.get("Content-Range") || catResponse.headers.get("content-range");
      let catTotal = catData.length;
      if (catContentRange) {
        const m = catContentRange.match(/\/(\d+|\*)/);
        if (m && m[1] !== "*") catTotal = parseInt(m[1], 10);
      }
      const catTotalPages = Math.ceil(catTotal / limit);

      return c.json({
        data: catData,
        pagination: { page, limit, total: catTotal, totalPages: catTotalPages, hasNext: page < catTotalPages, hasPrev: page > 1 },
        categoria: categoriaSlug || null,
        categoryName,
        categoryBreadcrumb,
      });
    }

    // ── Standard mode (admin, SKU lookup, basic search — no category/visibility filtering) ──
    let queryStr = "select=sku,titulo";
    if (skuExact.trim()) {
      queryStr += `&sku=eq.${encodeURIComponent(skuExact.trim())}`;
    } else if (search.trim()) {
      const searchConditions = buildSearchConditions(search, "catalog");
      queryStr += `&or=(${encodeURIComponent(searchConditions)})`;
    }
    queryStr += "&order=" + orderClause;

    const apiUrl = `${supabaseUrl}/rest/v1/produtos?${queryStr}`;

    console.log(`Fetching produtos from: ${apiUrl} | Range: ${rangeStart}-${rangeEnd}`);

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Range: `${rangeStart}-${rangeEnd}`,
        Prefer: "count=exact",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Supabase REST API error [${response.status}]: ${errorText}`);

      if (response.status === 403 || response.status === 401) {
        return c.json(
          {
            error: `Erro de permissão ao acessar tabela 'produtos' (HTTP ${response.status}). Verifique se a tabela possui RLS desabilitado ou uma policy de leitura pública (SELECT) configurada no Supabase.`,
            hint: "No Supabase Dashboard, acesse Authentication > Policies e adicione uma policy 'Enable read access for all users' na tabela 'produtos'.",
          },
          response.status
        );
      }

      return c.json(
        { error: `Erro ao consultar tabela produtos: HTTP ${response.status} - ${errorText}` },
        response.status
      );
    }

    const data = await response.json();

    const contentRange = response.headers.get("Content-Range") || response.headers.get("content-range");
    let total = data.length;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+|\*)/);
      if (match && match[1] !== "*") {
        total = parseInt(match[1], 10);
      }
    }

    const totalPages = Math.ceil(total / limit);

    return c.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (e) {
    console.log("Error fetching produtos from Supabase REST API:", e);
    return c.json({ error: _safeError("Erro ao buscar produtos", e) }, 500);
  }
});

// ═══════════════════════════════════════════════════
// ─── PRODUTO CRUD (Admin — titulo in DB, meta in KV)
// ════════════════��══════════════════════════════════

// GET /produtos/meta/:sku — product metadata from KV
app.get(BASE + "/produtos/meta/:sku", async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku")).substring(0, 100);
    if (!sku) return c.json({ visible: true });
    const meta = await kv.get(`produto_meta:${sku}`);
    return c.json(meta || { visible: true });
  } catch (e) {
    console.log("Error fetching product meta:", e);
    return c.json({ error: "Erro ao buscar metadados." }, 500);
  }
});

// PUT /produtos/meta/:sku — save product metadata in KV
app.put(BASE + "/produtos/meta/:sku", async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku"));
    if (sku.length > 100) return c.json({ error: "SKU invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto." }, 400);
    // Block dangerous keys in meta payload
    delete body["__proto__"];
    delete body["constructor"];
    delete body["prototype"];
    var metaStr = JSON.stringify(body);
    if (metaStr.length > 30000) return c.json({ error: "Metadados excedem tamanho maximo (30KB)." }, 400);
    const existing = (await kv.get("produto_meta:" + sku)) || {};
    const updated = { ...(typeof existing === "object" && existing ? existing : {}), ...body, sku: sku };
    await kv.set("produto_meta:" + sku, updated);
    invalidateMetaCache();
    return c.json(updated);
  } catch (e) {
    console.log("Error saving product meta:", e);
    return c.json({ error: "Erro ao salvar metadados." }, 500);
  }
});

// PUT /produtos/:sku/titulo — update titulo in DB via service role
app.put(BASE + "/produtos/:sku/titulo", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const sku = decodeURIComponent(c.req.param("sku"));
    if (sku.length > 100) return c.json({ error: "SKU invalido." }, 400);
    var titBody = await c.req.json();
    // Input validation
    var titValid = validate(titBody, {
      titulo: { required: true, type: "string", minLen: 1, maxLen: 500 },
    });
    if (!titValid.ok) {
      return c.json({ error: titValid.errors[0] || "Título obrigatório." }, 400);
    }
    var titulo = titValid.sanitized.titulo || "";
    if (!titulo.trim()) return c.json({ error: "Título obrigatório." }, 400);

    const { error } = await supabaseAdmin
      .from("produtos")
      .update({ titulo: titulo.trim() })
      .eq("sku", sku);

    if (error) {
      console.log("Error updating titulo:", error.message);
      return c.json({ error: "Erro ao atualizar titulo." }, 500);
    }
    return c.json({ sku, titulo: titulo.trim(), updated: true });
  } catch (e) {
    console.log("Error updating titulo:", e);
    return c.json({ error: "Erro ao atualizar titulo." }, 500);
  }
});

// PUT /produtos/:sku/rename — rename SKU in DB + move KV meta
app.put(BASE + "/produtos/:sku/rename", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const oldSku = decodeURIComponent(c.req.param("sku"));
    if (oldSku.length > 100) return c.json({ error: "SKU invalido." }, 400);
    var renameBody = await c.req.json();
    // Input validation
    var renameValid = validate(renameBody, {
      newSku: { required: true, type: "string", minLen: 1, maxLen: 100 },
    });
    if (!renameValid.ok) {
      return c.json({ error: renameValid.errors[0] || "Novo SKU obrigatório." }, 400);
    }
    var newSku = renameValid.sanitized.newSku || "";
    if (!newSku.trim()) return c.json({ error: "Novo SKU obrigatório." }, 400);
    const trimmed = newSku.trim();
    if (trimmed === oldSku) return c.json({ error: "SKU igual ao atual." }, 400);

    const { data: existing } = await supabaseAdmin.from("produtos").select("sku").eq("sku", trimmed).limit(1);
    if (existing && existing.length > 0) {
      return c.json({ error: "SKU ja existe no banco." }, 409);
    }

    const { error: dbErr } = await supabaseAdmin.from("produtos").update({ sku: trimmed }).eq("sku", oldSku);
    if (dbErr) {
      console.log("Error renaming SKU in DB:", dbErr.message);
      console.log("[produtos/rename-sku] DB rename error:", dbErr);
      return c.json({ error: "Erro ao renomear SKU no banco." }, 500);
    }

    try {
      const meta = await kv.get(`produto_meta:${oldSku}`);
      if (meta) {
        await kv.set(`produto_meta:${trimmed}`, { ...meta, sku: trimmed });
        await kv.del(`produto_meta:${oldSku}`);
      }
    } catch (e2) {
      console.log("Note: Could not migrate KV meta during SKU rename:", e2);
    }

    return c.json({ oldSku, newSku: trimmed, renamed: true });
  } catch (e) {
    console.log("Error renaming SKU:", e);
    return c.json({ error: "Erro ao renomear SKU." }, 500);
  }
});

// POST /produtos/create — insert new product in DB + meta in KV
app.post(BASE + "/produtos/create", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var createProdBody = await c.req.json();
    // Input validation
    var createProdValid = validate(createProdBody, {
      sku: { required: true, type: "string", minLen: 1, maxLen: 100 },
      titulo: { required: true, type: "string", minLen: 1, maxLen: 500 },
    });
    if (!createProdValid.ok) {
      return c.json({ error: createProdValid.errors[0] || "SKU e título obrigatórios." }, 400);
    }
    var sku = createProdValid.sanitized.sku || "";
    var titulo = createProdValid.sanitized.titulo || "";
    var meta = createProdBody.meta;
    if (!sku.trim() || !titulo.trim()) return c.json({ error: "SKU e título obrigatórios." }, 400);

    const { error } = await supabaseAdmin
      .from("produtos")
      .insert({ sku: sku.trim(), titulo: titulo.trim() });

    if (error) {
      console.log("Error inserting product:", error.message);
      return c.json({ error: "Erro ao criar produto." }, 500);
    }

    if (meta) {
      await kv.set(`produto_meta:${sku.trim()}`, { ...meta, sku: sku.trim(), visible: meta.visible !== false });
      invalidateMetaCache();
    }

    return c.json({ sku: sku.trim(), titulo: titulo.trim(), created: true }, 201);
  } catch (e) {
    console.log("Error creating product:", e);
    return c.json({ error: "Erro ao criar produto." }, 500);
  }
});

// GET /produtos/sige-match/:sku — search SIGE for a product by SKU and return normalized data
app.get(BASE + "/produtos/sige-match/:sku", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var sku = decodeURIComponent(c.req.param("sku")).trim().substring(0, 100);
    if (!sku) return c.json({ found: false, reason: "SKU vazio" });

    console.log("[sige-match] Searching SIGE for SKU: " + sku);

    // Strategy 1: exact codProduto match
    var smRes = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(sku) + "&limit=5&offset=1");
    var smProds = extractProdsGeneric(smRes.data);

    // Strategy 2: fallback to base SKU (before last hyphen)
    if (smProds.length === 0 && sku.includes("-")) {
      var smBaseSku = sku.substring(0, sku.lastIndexOf("-"));
      console.log("[sige-match] Trying base SKU: " + smBaseSku);
      smRes = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(smBaseSku) + "&limit=5&offset=1");
      smProds = extractProdsGeneric(smRes.data);
    }

    // Strategy 3: search by description
    if (smProds.length === 0) {
      console.log("[sige-match] Trying descProduto search: " + sku);
      smRes = await sigeAuthFetch("GET", "/product?descProduto=" + encodeURIComponent(sku) + "&limit=5&offset=1");
      smProds = extractProdsGeneric(smRes.data);
    }

    if (smProds.length === 0) {
      console.log("[sige-match] No products found for SKU: " + sku);
      return c.json({ found: false });
    }

    // Normalize the first matched product
    var smP = smProds[0];
    var smSigeId = String(smP.id || smP.codProduto || smP.codigo || "");

    // Extract title: try multiple known field names
    var smTitulo = smP.descProdutoEst || smP.descricao || smP.descProduto || smP.nome || smP.name || smP.descricaoProduto || smP.titulo || "";

    // Extract brand: try multiple known field names
    var smMarca = smP.descMarca || smP.marca || smP.brandName || smP.nomeMarca || smP.fabricante || "";

    // Extract price
    var smPriceFields = ["vlrTabela", "valorTabela", "vlrVenda", "valorVenda", "precoVenda", "preco", "valor", "valorUnitario"];
    var smPreco = 0;
    for (var smPi = 0; smPi < smPriceFields.length; smPi++) {
      var smPv = smP[smPriceFields[smPi]];
      if (smPv !== undefined && smPv !== null && smPv !== "" && smPv !== "0") {
        var smPn = parseFloat(String(smPv));
        if (smPn > 0) { smPreco = smPn; break; }
      }
    }

    // Extract weight and dimensions using existing helpers
    var smPeso = extractNumericField(smP, SIGE_WEIGHT_FIELDS);
    var smComprimento = extractNumericField(smP, SIGE_DIM_LENGTH_FIELDS);
    var smLargura = extractNumericField(smP, SIGE_DIM_WIDTH_FIELDS);
    var smAltura = extractNumericField(smP, SIGE_DIM_HEIGHT_FIELDS);

    // Extract other useful fields
    var smNcm = smP.ncm || smP.ncmProduto || smP.NCM || "";
    var smUnidade = smP.unidade || smP.sigla || smP.un || "";
    var smCodBarras = smP.codBarras || smP.ean || smP.gtin || smP.codigoBarras || "";
    var smObservacao = smP.observacao || smP.obs || smP.observacoes || "";

    // Build list of additional matches (if more than 1 found)
    var smAlternativas: any[] = [];
    for (var smAi = 1; smAi < Math.min(smProds.length, 5); smAi++) {
      var smAp = smProds[smAi];
      smAlternativas.push({
        sigeId: String(smAp.id || smAp.codProduto || smAp.codigo || ""),
        codProduto: smAp.codProduto || "",
        titulo: smAp.descProdutoEst || smAp.descricao || smAp.descProduto || smAp.nome || "",
        marca: smAp.descMarca || smAp.marca || "",
      });
    }

    console.log("[sige-match] Found product: " + smSigeId + " - " + smTitulo);

    // ─── Fetch balance (stock) from SIGE ───
    var smEstoque = 0;
    var smReservado = 0;
    var smDisponivel = 0;
    var smBalSuccess = false;
    try {
      var smBalQtdFields = ["quantidade","qtdSaldo","saldo","saldoFisico","saldoAtual","qtdFisica","qtdEstoque","qtd","estoque","qtde","qtdAtual","qtdTotal","saldoTotal"];
      var smBalResFields = ["reservado","qtdReservado","qtdReserva","saldoReservado","qtdReservada"];
      function smTryField(item: any, fields: string[]): number {
        for (var fi = 0; fi < fields.length; fi++) {
          var fv = item[fields[fi]];
          if (fv !== undefined && fv !== null && fv !== "") {
            var fn = parseFloat(String(fv));
            if (!isNaN(fn) && fn !== 0) return fn;
          }
        }
        return 0;
      }
      function smTryFieldZero(item: any, fields: string[]): number {
        for (var fi = 0; fi < fields.length; fi++) {
          var fv = item[fields[fi]];
          if (fv !== undefined && fv !== null && fv !== "") {
            var fn = parseFloat(String(fv));
            if (!isNaN(fn)) return fn;
          }
        }
        return 0;
      }
      var smBalRes = await sigeAuthFetch("GET", "/product/" + smSigeId + "/balance");
      if (smBalRes.ok && smBalRes.data) {
        var smBalItems: any[] = [];
        if (Array.isArray(smBalRes.data)) {
          smBalItems = smBalRes.data;
        } else if (smBalRes.data.dados && Array.isArray(smBalRes.data.dados)) {
          smBalItems = smBalRes.data.dados;
        } else if (smBalRes.data.data && Array.isArray(smBalRes.data.data)) {
          smBalItems = smBalRes.data.data;
        } else if (smBalRes.data.items && Array.isArray(smBalRes.data.items)) {
          smBalItems = smBalRes.data.items;
        }
        if (smBalItems.length > 0) {
          for (var smBi = 0; smBi < smBalItems.length; smBi++) {
            smEstoque += smTryField(smBalItems[smBi], smBalQtdFields);
            smReservado += smTryFieldZero(smBalItems[smBi], smBalResFields);
          }
          smDisponivel = smEstoque - smReservado;
          smBalSuccess = true;
        } else if (typeof smBalRes.data === "object" && !smBalRes.data.error && !smBalRes.data.message) {
          smEstoque = smTryField(smBalRes.data, smBalQtdFields);
          smReservado = smTryFieldZero(smBalRes.data, smBalResFields);
          smDisponivel = smEstoque - smReservado;
          if (smEstoque > 0) smBalSuccess = true;
        }
        console.log("[sige-match] Balance for " + smSigeId + ": estoque=" + smEstoque + ", reservado=" + smReservado + ", disponivel=" + smDisponivel);
      } else {
        console.log("[sige-match] Balance fetch returned non-ok for " + smSigeId);
      }
    } catch (smBalErr) {
      console.log("[sige-match] Balance fetch failed (non-fatal): " + String(smBalErr));
    }

    // ─── Fetch price list price if product price was 0 ───
    if (smPreco === 0) {
      try {
        var smPlRes = await sigeAuthFetch("GET", "/product/" + smSigeId + "/price-list");
        if (smPlRes.ok && smPlRes.data) {
          var smPlItems: any[] = [];
          if (Array.isArray(smPlRes.data)) smPlItems = smPlRes.data;
          else if (smPlRes.data.dados && Array.isArray(smPlRes.data.dados)) smPlItems = smPlRes.data.dados;
          else if (smPlRes.data.data && Array.isArray(smPlRes.data.data)) smPlItems = smPlRes.data.data;
          for (var smPli = 0; smPli < smPlItems.length; smPli++) {
            var smPlItem = smPlItems[smPli];
            var smPlPrice = smPlItem.vlrVenda || smPlItem.vlrTabela || smPlItem.preco || smPlItem.valor || smPlItem.vlrProduto || 0;
            var smPlN = parseFloat(String(smPlPrice));
            if (!isNaN(smPlN) && smPlN > 0) { smPreco = smPlN; break; }
          }
          if (smPreco > 0) console.log("[sige-match] Got price from price-list: " + smPreco);
        }
      } catch (smPlErr) {
        console.log("[sige-match] Price list fetch failed (non-fatal): " + String(smPlErr));
      }
    }

    return c.json({
      found: true,
      sigeId: smSigeId,
      codProduto: smP.codProduto || sku,
      titulo: smTitulo,
      marca: smMarca,
      preco: smPreco,
      peso: smPeso,
      comprimento: smComprimento,
      largura: smLargura,
      altura: smAltura,
      ncm: smNcm,
      unidade: smUnidade,
      codBarras: smCodBarras,
      observacao: smObservacao,
      estoque: smEstoque,
      reservado: smReservado,
      disponivel: smDisponivel,
      estoqueOk: smBalSuccess,
      alternativas: smAlternativas.length > 0 ? smAlternativas : undefined,
      totalEncontrados: smProds.length,
    });
  } catch (e) {
    console.log("[sige-match] Error:", e);
    return c.json({ error: "Erro ao buscar produto." }, 500);
  }
});

// DELETE /produtos/:sku/delete — remove from DB + KV meta + optional images
app.delete(BASE + "/produtos/:sku/delete", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const sku = decodeURIComponent(c.req.param("sku")).substring(0, 100);
    if (!sku) return c.json({ error: "SKU invalido." }, 400);

    const { error: dbErr } = await supabaseAdmin.from("produtos").delete().eq("sku", sku);
    if (dbErr) {
      console.log("Error deleting product from DB:", dbErr.message);
      console.log("[produtos/delete] DB delete error:", dbErr);
      return c.json({ error: "Erro ao excluir do banco." }, 500);
    }

    try { await kv.del(`produto_meta:${sku}`); invalidateMetaCache(); } catch {}

    try {
      const { data: files } = await supabaseAdmin.storage.from("produtos").list(sku, { limit: 100 });
      if (files && files.length > 0) {
        const paths = files.map((f: { name: string }) => `${sku}/${f.name}`);
        await supabaseAdmin.storage.from("produtos").remove(paths);
      }
    } catch (e2) {
      console.log("Note: Could not clean images for deleted product:", e2);
    }

    return c.json({ sku, deleted: true });
  } catch (e) {
    console.log("Error deleting product:", e);
    return c.json({ error: "Erro ao excluir produto." }, 500);
  }
});

// POST /produtos/imagens/:sku/upload — upload image to Storage
// Frontend converts images to WebP before upload; backend enforces .webp naming
app.post(BASE + "/produtos/imagens/:sku/upload", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const sku = decodeURIComponent(c.req.param("sku")).substring(0, 100);
    if (!sku) return c.json({ error: "SKU invalido." }, 400);
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    var rawFilename = (formData.get("filename") as string) || file?.name || (sku + ".1.webp");

    if (!file) return c.json({ error: "Nenhum arquivo enviado." }, 400);

    // Enforce .webp extension — the frontend should have already converted,
    // but this is a safety net for direct API calls
    var filename = rawFilename;
    if (!/\.webp$/i.test(filename)) {
      filename = filename.replace(/\.[^.]+$/, "") + ".webp";
    }

    // Determine content type — prefer webp if the file was converted
    var contentType = "image/webp";
    if (file.type && file.type !== "image/webp") {
      // File wasn't converted client-side — accept as-is but log warning
      contentType = file.type;
      console.log("[upload] WARNING: Non-WebP file uploaded for SKU " + sku + " (" + file.type + "). Frontend should convert to WebP before upload.");
    }

    var filePath = sku + "/" + filename;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("produtos")
      .upload(filePath, arrayBuffer, {
        contentType: contentType,
        upsert: true,
      });

    if (uploadErr) {
      console.log("Image upload error:", uploadErr.message);
      return c.json({ error: "Erro no upload da imagem." }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    var url = supabaseUrl + "/storage/v1/object/public/produtos/" + encodeURIComponent(sku) + "/" + encodeURIComponent(filename);

    return c.json({ uploaded: true, path: filePath, url: url, filename: filename });
  } catch (e) {
    console.log("Error uploading image:", e);
    return c.json({ error: "Erro no upload de imagem." }, 500);
  }
});

// DELETE /produtos/imagens/:sku/file — delete specific image from Storage
app.delete(BASE + "/produtos/imagens/:sku/file", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const sku = decodeURIComponent(c.req.param("sku"));
    if (sku.length > 100) return c.json({ error: "SKU invalido." }, 400);
    var delImgBody = await c.req.json();
    var delImgValid = validate(delImgBody, {
      filename: { required: true, type: "string", maxLen: 500 },
    });
    if (!delImgValid.ok) return c.json({ error: "Filename obrigatório." }, 400);
    var filename = delImgValid.sanitized.filename || "";
    if (!filename) return c.json({ error: "Filename obrigatório." }, 400);

    const filePath = `${sku}/${filename}`;
    const { error } = await supabaseAdmin.storage.from("produtos").remove([filePath]);

    if (error) {
      console.log("Image delete error:", error.message);
      return c.json({ error: "Erro ao excluir imagem." }, 500);
    }

    return c.json({ deleted: true, path: filePath });
  } catch (e) {
    console.log("Error deleting image:", e);
    return c.json({ error: "Erro ao excluir imagem." }, 500);
  }
});

// POST /produtos/meta/bulk — get metadata for multiple SKUs
app.post(BASE + "/produtos/meta/bulk", async (c) => {
  try {
    var metaBulkBody = await c.req.json();
    // Input validation
    var metaBulkValid = validate(metaBulkBody, {
      skus: { required: true, type: "array", maxItems: 200 },
    });
    if (!metaBulkValid.ok) return c.json({ error: metaBulkValid.errors[0] || "skus deve ser um array." }, 400);
    var skus = metaBulkValid.sanitized.skus;
    if (!Array.isArray(skus)) return c.json({ error: "skus deve ser um array." }, 400);

    const result: Record<string, any> = {};
    for (const sku of skus.slice(0, 50)) {
      const meta = await kv.get(`produto_meta:${sku}`);
      result[sku] = meta || { visible: true };
    }
    return c.json(result);
  } catch (e) {
    console.log("Error fetching bulk meta:", e);
    return c.json({ error: "Erro ao buscar metadados em lote." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── LOGO (Site Assets) ──────────────
// ═══════════════════════════════════════

const ASSETS_BUCKET = "make-b7b07654-assets";

// Ensure assets bucket exists AND is public (idempotent)
(async () => {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const exists = buckets?.some((b: any) => b.name === ASSETS_BUCKET);
    if (!exists) {
      await supabaseAdmin.storage.createBucket(ASSETS_BUCKET, { public: true });
      console.log(`Created public bucket: ${ASSETS_BUCKET}`);
    } else {
      // Force bucket to be public even if it was created private before
      await supabaseAdmin.storage.updateBucket(ASSETS_BUCKET, { public: true });
      console.log(`Ensured bucket is public: ${ASSETS_BUCKET}`);
    }
  } catch (e) {
    console.log("Error ensuring assets bucket:", e);
  }
})();

// GET /logo — get current logo URL (public, with signed URL for robustness)
app.get(BASE + "/logo", async (c) => {
  try {
    const meta: any = await kv.get("site_logo");
    if (!meta || !meta.filename) return c.json({ hasLogo: false, url: null });

    // Generate a signed URL (works even if bucket is accidentally private)
    let url = meta.url;
    try {
      const { data: signedData } = await supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .createSignedUrl(meta.filename, 86400); // 24h
      if (signedData?.signedUrl) url = signedData.signedUrl;
    } catch (_e) {
      console.log("Signed URL fallback failed for logo, using stored public URL");
    }

    return c.json({ hasLogo: true, ...meta, url });
  } catch (e) {
    console.log("Error fetching logo:", e);
    return c.json({ error: "Erro ao buscar logo." }, 500);
  }
});

// POST /logo/upload — upload logo AVIF (auth required)
app.post(BASE + "/logo/upload", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return c.json({ error: "Nenhum arquivo enviado." }, 400);

    // Validate file type
    const validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return c.json({ error: "Tipo de arquivo nao permitido. Use AVIF, PNG, JPEG, WebP ou SVG." }, 400);
    }

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return c.json({ error: "Arquivo muito grande. Maximo: 2MB." }, 400);
    }

    // Determine extension from MIME
    const extMap: Record<string, string> = {
      "image/avif": "avif",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    };
    const ext = extMap[file.type] || "avif";
    const filename = `logo.${ext}`;

    const arrayBuffer = await file.arrayBuffer();

    // Remove any old header logo files (all possible extensions)
    // NOTE: Do NOT use .list() with prefix — Supabase Storage doesn't support prefix filtering,
    // so it would return ALL files and delete footer-logo too!
    try {
      const oldExts = ["avif", "png", "jpg", "webp", "svg"];
      const toRemove = oldExts.map((ext) => `logo.${ext}`);
      await supabaseAdmin.storage.from(ASSETS_BUCKET).remove(toRemove);
    } catch {
      // Ignore cleanup errors
    }

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .upload(filename, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      console.log("Logo upload error:", uploadErr.message);
      return c.json({ error: "Erro no upload do logo." }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const url = `${supabaseUrl}/storage/v1/object/public/${ASSETS_BUCKET}/${filename}`;

    // Save reference in KV
    const logoMeta = {
      url,
      filename,
      contentType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId,
    };
    await kv.set("site_logo", logoMeta);

    invalidateHomepageCache();
    return c.json({ uploaded: true, ...logoMeta });
  } catch (e) {
    console.log("Error uploading logo:", e);
    return c.json({ error: "Erro no upload do logo." }, 500);
  }
});

// DELETE /logo — remove logo (auth required)
app.delete(BASE + "/logo", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const meta: any = await kv.get("site_logo");
    if (meta?.filename) {
      await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([meta.filename]);
    }
    await kv.del("site_logo");

    invalidateHomepageCache();
    return c.json({ deleted: true });
  } catch (e) {
    console.log("Error deleting logo:", e);
    return c.json({ error: "Erro ao excluir logo." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── FOOTER LOGO (Site Assets) ────────
// ═══════════════════════════════════════

// GET /footer-logo — public (with signed URL for robustness)
app.get(BASE + "/footer-logo", async (c) => {
  console.log("GET /footer-logo called");
  try {
    const meta: any = await kv.get("site_footer_logo");
    if (!meta || !meta.filename) return c.json({ hasLogo: false, url: null });

    // Generate a signed URL (works even if bucket is accidentally private)
    let url = meta.url;
    try {
      const { data: signedData } = await supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .createSignedUrl(meta.filename, 86400); // 24h
      if (signedData?.signedUrl) url = signedData.signedUrl;
    } catch (_e) {
      console.log("Signed URL fallback failed for footer logo, using stored public URL");
    }

    return c.json({ hasLogo: true, ...meta, url });
  } catch (e: any) {
    console.log("Error fetching footer logo:", e);
    return c.json({ error: "Erro ao buscar logo do rodape." }, 500);
  }
});

// POST /footer-logo/upload — auth required
app.post(BASE + "/footer-logo/upload", async (c) => {
  console.log("POST /footer-logo/upload called");
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return c.json({ error: "Nenhum arquivo enviado." }, 400);

    const validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return c.json({ error: "Tipo nao permitido. Use AVIF, PNG, JPEG, WebP ou SVG." }, 400);
    }
    if (file.size > 2 * 1024 * 1024) {
      return c.json({ error: "Arquivo muito grande. Maximo: 2MB." }, 400);
    }

    const extMap: Record<string, string> = {
      "image/avif": "avif", "image/png": "png", "image/jpeg": "jpg",
      "image/webp": "webp", "image/svg+xml": "svg",
    };
    const ext = extMap[file.type] || "avif";
    const filename = `footer-logo.${ext}`;
    const arrayBuffer = await file.arrayBuffer();

    // Remove any old footer logo files (all possible extensions)
    // NOTE: Do NOT use .list() with prefix — Supabase Storage doesn't support prefix filtering
    try {
      const oldExts = ["avif", "png", "jpg", "webp", "svg"];
      const toRemove = oldExts.map((ext) => `footer-logo.${ext}`);
      await supabaseAdmin.storage.from(ASSETS_BUCKET).remove(toRemove);
    } catch (_e) { /* ignore */ }

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .upload(filename, arrayBuffer, { contentType: file.type, upsert: true });

    if (uploadErr) {
      console.log("Footer logo upload error:", uploadErr.message);
      return c.json({ error: "Erro no upload do footer logo." }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const url = `${supabaseUrl}/storage/v1/object/public/${ASSETS_BUCKET}/${filename}`;

    const logoMeta = {
      url, filename, contentType: file.type,
      size: file.size, uploadedAt: new Date().toISOString(), uploadedBy: userId,
    };
    await kv.set("site_footer_logo", logoMeta);
    invalidateHomepageCache();
    return c.json({ uploaded: true, ...logoMeta });
  } catch (e: any) {
    console.log("Error uploading footer logo:", e);
    return c.json({ error: "Erro no upload do logo do rodape." }, 500);
  }
});

// DELETE /footer-logo — auth required
app.delete(BASE + "/footer-logo", async (c) => {
  console.log("DELETE /footer-logo called");
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const meta: any = await kv.get("site_footer_logo");
    if (meta?.filename) {
      await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([meta.filename]);
    }
    await kv.del("site_footer_logo");
    invalidateHomepageCache();
    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("Error deleting footer logo:", e);
    return c.json({ error: "Erro ao excluir logo do rodape." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── FAVICON (Site Assets) ────────────
// ═══════════════════════════════════════

// GET /favicon — public
app.get(BASE + "/favicon", async (c) => {
  try {
    var meta: any = await kv.get("site_favicon");
    if (!meta || !meta.filename) return c.json({ hasFavicon: false, url: null });
    var url = meta.url;
    try {
      var signResult = await supabaseAdmin.storage.from(ASSETS_BUCKET).createSignedUrl(meta.filename, 86400);
      if (signResult.data && signResult.data.signedUrl) url = signResult.data.signedUrl;
    } catch (_e) {
      console.log("Signed URL fallback failed for favicon");
    }
    return c.json({ hasFavicon: true, url: url, filename: meta.filename, contentType: meta.contentType, size: meta.size, uploadedAt: meta.uploadedAt });
  } catch (e: any) {
    console.log("Error fetching favicon:", e);
    return c.json({ error: "Erro ao buscar favicon." }, 500);
  }
});

// POST /favicon/upload — auth required
app.post(BASE + "/favicon/upload", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var formData = await c.req.formData();
    var file = formData.get("file") as File | null;
    if (!file) return c.json({ error: "Nenhum arquivo enviado." }, 400);
    var validTypes = ["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml", "image/ico", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return c.json({ error: "Tipo nao permitido: " + file.type + ". Use PNG, ICO, SVG ou WebP." }, 400);
    }
    if (file.size > 1 * 1024 * 1024) {
      return c.json({ error: "Arquivo muito grande. Maximo: 1MB." }, 400);
    }
    var extMap: Record<string, string> = {
      "image/png": "png", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
      "image/svg+xml": "svg", "image/ico": "ico", "image/webp": "webp",
    };
    var ext = extMap[file.type] || "png";
    var filename = "favicon." + ext;
    var arrayBuffer = await file.arrayBuffer();
    try {
      var oldExts = ["png", "ico", "svg", "webp"];
      var toRemove = oldExts.map(function (e) { return "favicon." + e; });
      await supabaseAdmin.storage.from(ASSETS_BUCKET).remove(toRemove);
    } catch (_e) { /* ignore */ }
    var uploadResult = await supabaseAdmin.storage.from(ASSETS_BUCKET).upload(filename, arrayBuffer, { contentType: file.type, upsert: true });
    if (uploadResult.error) {
      console.log("Favicon upload error:", uploadResult.error.message);
      return c.json({ error: "Erro no upload do favicon." }, 500);
    }
    var supabaseUrl = Deno.env.get("SUPABASE_URL");
    var url = supabaseUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + filename;
    var faviconMeta = {
      url: url, filename: filename, contentType: file.type,
      size: file.size, uploadedAt: new Date().toISOString(), uploadedBy: userId,
    };
    await kv.set("site_favicon", faviconMeta);
    return c.json({ uploaded: true, url: url, filename: filename, contentType: file.type, size: file.size, uploadedAt: faviconMeta.uploadedAt });
  } catch (e: any) {
    console.log("Error uploading favicon:", e);
    return c.json({ error: "Erro no upload do favicon." }, 500);
  }
});

// DELETE /favicon — auth required
app.delete(BASE + "/favicon", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var meta: any = await kv.get("site_favicon");
    if (meta && meta.filename) {
      await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([meta.filename]);
    }
    await kv.del("site_favicon");
    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("Error deleting favicon:", e);
    return c.json({ error: "Erro ao excluir favicon." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── BANNERS (Home Page) ─────────────
// ═══════════════════════════════════════

// GET /banners — public, list active banners sorted by order
app.get(BASE + "/banners", async (c) => {
  try {
    const all = await kv.getByPrefix("banner:");
    const banners: any[] = [];
    for (const raw of all) {
      try {
        const b = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (b && b.active) banners.push(b);
      } catch { /* skip invalid */ }
    }
    banners.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    // Refresh signed URLs for each banner
    for (const b of banners) {
      if (b.filename) {
        try {
          const { data: signedData } = await supabaseAdmin.storage
            .from(ASSETS_BUCKET)
            .createSignedUrl(b.filename, 86400);
          if (signedData && signedData.signedUrl) b.imageUrl = signedData.signedUrl;
        } catch (_e) { /* keep stored url */ }
      }
    }

    return c.json({ banners });
  } catch (e: any) {
    console.log("Error fetching banners:", e);
    return c.json({ error: "Erro ao buscar banners." }, 500);
  }
});

// GET /admin/banners — list ALL banners (admin)
app.get(BASE + "/admin/banners", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const all = await kv.getByPrefix("banner:");
    const banners: any[] = [];
    for (const raw of all) {
      try {
        const b = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (b && b.id) banners.push(b);
      } catch { /* skip */ }
    }
    banners.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    // Refresh signed URLs
    for (const b of banners) {
      if (b.filename) {
        try {
          const { data: signedData } = await supabaseAdmin.storage
            .from(ASSETS_BUCKET)
            .createSignedUrl(b.filename, 86400);
          if (signedData && signedData.signedUrl) b.imageUrl = signedData.signedUrl;
        } catch (_e) { /* keep stored url */ }
      }
    }

    return c.json({ banners });
  } catch (e: any) {
    console.log("Error fetching admin banners:", e);
    return c.json({ error: "Erro ao buscar banners." }, 500);
  }
});

// POST /admin/banners — create banner (upload image + metadata)
app.post(BASE + "/admin/banners", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const title = sanitizeInput(String(formData.get("title") || "")).substring(0, 200);
    const subtitle = sanitizeInput(String(formData.get("subtitle") || "")).substring(0, 500);
    const buttonText = sanitizeInput(String(formData.get("buttonText") || "")).substring(0, 100);
    const buttonLink = sanitizeInput(String(formData.get("buttonLink") || "")).substring(0, 500);
    const orderStr = String(formData.get("order") || "0");
    const activeStr = String(formData.get("active") || "true");

    if (!file) return c.json({ error: "Nenhum arquivo de imagem enviado." }, 400);

    const validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      return c.json({ error: "Tipo não permitido: " + file.type + ". Use AVIF, PNG, JPEG, WebP ou GIF." }, 400);
    }
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: "Arquivo muito grande. Máximo: 5MB." }, 400);
    }

    const bannerId = crypto.randomUUID();
    const extMap: Record<string, string> = {
      "image/avif": "avif", "image/png": "png", "image/jpeg": "jpg",
      "image/webp": "webp", "image/gif": "gif",
    };
    const ext = extMap[file.type] || "jpg";
    const filename = "banner-" + bannerId + "." + ext;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .upload(filename, arrayBuffer, { contentType: file.type, upsert: true });

    if (uploadErr) {
      console.log("Banner upload error:", uploadErr.message);
      return c.json({ error: "Erro no upload da imagem." }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const imageUrl = supabaseUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + filename;

    const banner = {
      id: bannerId,
      title: title,
      subtitle: subtitle,
      buttonText: buttonText,
      buttonLink: buttonLink,
      imageUrl: imageUrl,
      filename: filename,
      order: parseInt(orderStr, 10) || 0,
      active: activeStr !== "false",
      contentType: file.type,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uploadedBy: userId,
    };

    await kv.set("banner:" + bannerId, JSON.stringify(banner));
    console.log("Banner created: " + bannerId);

    invalidateHomepageCache();
    return c.json({ created: true, banner });
  } catch (e: any) {
    console.log("Error creating banner:", e);
    return c.json({ error: "Erro ao criar banner." }, 500);
  }
});

// PUT /admin/banners/:id — update banner metadata (optionally replace image)
app.put(BASE + "/admin/banners/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const bannerId = (c.req.param("id") || "").substring(0, 100);
    if (!bannerId) return c.json({ error: "ID invalido." }, 400);
    const existing = await kv.get("banner:" + bannerId);
    if (!existing) return c.json({ error: "Banner não encontrado." }, 404);

    const banner = typeof existing === "string" ? JSON.parse(existing) : existing;

    const ct = c.req.header("Content-Type") || "";

    if (ct.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      const file = formData.get("file") as File | null;

      if (formData.has("title")) banner.title = sanitizeInput(String(formData.get("title") || "")).substring(0, 300);
      if (formData.has("subtitle")) banner.subtitle = sanitizeInput(String(formData.get("subtitle") || "")).substring(0, 500);
      if (formData.has("buttonText")) banner.buttonText = sanitizeInput(String(formData.get("buttonText") || "")).substring(0, 100);
      if (formData.has("buttonLink")) banner.buttonLink = sanitizeInput(String(formData.get("buttonLink") || "")).substring(0, 500);
      if (formData.has("order")) banner.order = Math.min(Math.max(parseInt(String(formData.get("order") || "0"), 10) || 0, 0), 9999);
      if (formData.has("active")) banner.active = String(formData.get("active")) !== "false";

      if (file && file.size > 0) {
        const validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/gif"];
        if (!validTypes.includes(file.type)) {
          return c.json({ error: "Tipo não permitido: " + file.type }, 400);
        }
        if (file.size > 5 * 1024 * 1024) {
          return c.json({ error: "Arquivo muito grande. Máximo: 5MB." }, 400);
        }

        if (banner.filename) {
          try { await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([banner.filename]); } catch { /* ok */ }
        }

        const extMap: Record<string, string> = {
          "image/avif": "avif", "image/png": "png", "image/jpeg": "jpg",
          "image/webp": "webp", "image/gif": "gif",
        };
        const ext = extMap[file.type] || "jpg";
        const newFilename = "banner-" + bannerId + "." + ext;
        const ab = await file.arrayBuffer();

        const { error: uploadErr } = await supabaseAdmin.storage
          .from(ASSETS_BUCKET)
          .upload(newFilename, ab, { contentType: file.type, upsert: true });

        if (uploadErr) {
          console.log("Banner update upload error:", uploadErr.message);
          return c.json({ error: "Erro no upload da imagem." }, 500);
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        banner.imageUrl = supabaseUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + newFilename;
        banner.filename = newFilename;
        banner.contentType = file.type;
        banner.fileSize = file.size;
      }
    } else {
      const body = await c.req.json();
      // Input validation for banner JSON update
      var bannerUpValid = validate(body, {
        title: { type: "string", maxLen: 300 },
        subtitle: { type: "string", maxLen: 500 },
        buttonText: { type: "string", maxLen: 100 },
        buttonLink: { type: "string", maxLen: 2000 },
        active: { type: "boolean" },
      });
      if (!bannerUpValid.ok) {
        return c.json({ error: bannerUpValid.errors[0] || "Dados invalidos." }, 400);
      }
      if (body.title !== undefined) banner.title = bannerUpValid.sanitized.title;
      if (body.subtitle !== undefined) banner.subtitle = bannerUpValid.sanitized.subtitle;
      if (body.buttonText !== undefined) banner.buttonText = bannerUpValid.sanitized.buttonText;
      if (body.buttonLink !== undefined) banner.buttonLink = bannerUpValid.sanitized.buttonLink;
      if (body.order !== undefined) banner.order = parseInt(String(body.order), 10);
      if (body.active !== undefined) banner.active = !!body.active;
    }

    banner.updatedAt = new Date().toISOString();
    await kv.set("banner:" + bannerId, JSON.stringify(banner));
    console.log("Banner updated: " + bannerId);

    invalidateHomepageCache();
    return c.json({ updated: true, banner });
  } catch (e: any) {
    console.log("Error updating banner:", e);
    return c.json({ error: "Erro ao atualizar banner." }, 500);
  }
});

// DELETE /admin/banners/:id — delete banner + image from storage
app.delete(BASE + "/admin/banners/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const bannerId = (c.req.param("id") || "").substring(0, 100);
    if (!bannerId) return c.json({ error: "ID invalido." }, 400);
    const existing = await kv.get("banner:" + bannerId);
    if (!existing) return c.json({ error: "Banner não encontrado." }, 404);

    const banner = typeof existing === "string" ? JSON.parse(existing) : existing;

    if (banner.filename) {
      try { await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([banner.filename]); } catch { /* ok */ }
    }

    await kv.del("banner:" + bannerId);
    console.log("Banner deleted: " + bannerId);

    invalidateHomepageCache();
    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("Error deleting banner:", e);
    return c.json({ error: "Erro ao excluir banner." }, 500);
  }
});

// PUT /admin/banners-reorder — reorder banners
app.put(BASE + "/admin/banners-reorder", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var reorderBody = await c.req.json();
    // Input validation
    var reorderValid = validate(reorderBody, {
      orderedIds: { required: true, type: "array", maxItems: 200 },
    });
    if (!reorderValid.ok) return c.json({ error: reorderValid.errors[0] || "Dados invalidos." }, 400);
    var orderedIds = reorderValid.sanitized.orderedIds;
    if (!Array.isArray(orderedIds)) return c.json({ error: "orderedIds deve ser um array." }, 400);

    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const raw = await kv.get("banner:" + id);
      if (raw) {
        const b = typeof raw === "string" ? JSON.parse(raw) : raw;
        b.order = i;
        b.updatedAt = new Date().toISOString();
        await kv.set("banner:" + id, JSON.stringify(b));
      }
    }

    console.log("Banners reordered: " + orderedIds.length + " items");
    invalidateHomepageCache();
    return c.json({ reordered: true, count: orderedIds.length });
  } catch (e: any) {
    console.log("Error reordering banners:", e);
    return c.json({ error: "Erro ao reordenar banners." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── API SIGE — INTEGRACAO REAL ──────
// ═══════════════════════════════════════

// POST /sige/save-config — save SIGE API configuration (baseUrl, email, password)
app.post(BASE + "/sige/save-config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var sigeBody = await c.req.json();
    // Input validation for SIGE config
    var scValid = validate(sigeBody, {
      baseUrl: { required: true, type: "string", maxLen: 500 },
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      password: { required: true, type: "string", minLen: 1, maxLen: 256, sanitize: false },
    });
    if (!scValid.ok) {
      return c.json({ error: scValid.errors[0] || "Dados invalidos." }, 400);
    }
    var baseUrl = scValid.sanitized.baseUrl;
    var email = scValid.sanitized.email;
    var password = sigeBody.password;
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "");
    // SSRF protection: only allow HTTPS URLs to public domains
    if (!/^https:\/\//i.test(normalizedUrl)) {
      return c.json({ error: "baseUrl deve usar HTTPS." }, 400);
    }
    // Block private/internal IPs
    if (/^https:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/i.test(normalizedUrl)) {
      return c.json({ error: "baseUrl nao pode apontar para enderecos internos." }, 400);
    }
    await kv.set("sige_api_config", JSON.stringify({
      baseUrl: normalizedUrl, email: email.trim(), password,
      updatedAt: new Date().toISOString(), updatedBy: userId,
    }));
    memClear("_sige_config");
    console.log("SIGE save-config: saved for user", userId, "baseUrl:", normalizedUrl);
    return c.json({ success: true });
  } catch (e) {
    console.log("Error saving SIGE config:", e);
    return c.json({ error: "Erro ao salvar configuracao." }, 500);
  }
});

// GET /sige/config — get saved config (password masked)
app.get(BASE + "/sige/config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const raw = await kv.get("sige_api_config");
    if (!raw) return c.json({});
    const config = typeof raw === "string" ? JSON.parse(raw) : raw;
    return c.json({
      baseUrl: config.baseUrl || "", email: config.email || "",
      hasPassword: !!config.password, updatedAt: config.updatedAt || null,
    });
  } catch (e) {
    console.log("Error getting SIGE config:", e);
    return c.json({ error: "Erro ao buscar configuracao." }, 500);
  }
});

// POST /sige/connect — authenticate with SIGE API (POST baseUrl/auth)
app.post(BASE + "/sige/connect", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ error: "Configuração SIGE não encontrada. Salve a URL base, email e senha primeiro." }, 400);
    const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
    if (!config.baseUrl || !config.email || !config.password) {
      return c.json({ error: "Configuracao incompleta. Preencha URL base, email e senha." }, 400);
    }
    const authUrl = `${config.baseUrl}/auth`;
    console.log(`SIGE connect: POST ${authUrl} for ${config.email}`);
    const response = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: config.email, password: config.password }),
    });
    const responseText = await response.text();
    console.log(`SIGE connect: HTTP ${response.status}, body length: ${responseText.length}`);
    if (!response.ok) {
      let errorMsg = `SIGE retornou HTTP ${response.status}`;
      try {
        const errData = JSON.parse(responseText);
        if (errData.message) errorMsg = errData.message;
        else if (errData.error) errorMsg = errData.error;
      } catch {}
      console.log(`SIGE connect: error — ${errorMsg}`);
      return c.json({ error: errorMsg, httpStatus: response.status }, 502);
    }
    let authData: any;
    try { authData = JSON.parse(responseText); }
    catch { return c.json({ error: "Resposta inválida da API SIGE (não é JSON)." }, 502); }
    const jwtToken = authData.token || authData.access_token || authData.accessToken || "";
    const tokenData = {
      token: jwtToken,
      refreshToken: authData.refreshToken || authData.refresh_token || "",
      createdAt: new Date().toISOString(),
      expiresAt: computeTokenExpiry(jwtToken),
      rawResponse: authData,
    };
    await kv.set("sige_api_token", JSON.stringify(tokenData));
    memClear("_sige_token");
    console.log("SIGE connect: token stored, expires at", tokenData.expiresAt);
    return c.json({
      connected: true, hasToken: !!tokenData.token,
      hasRefreshToken: !!tokenData.refreshToken,
      expiresAt: tokenData.expiresAt, responseKeys: Object.keys(authData),
    });
  } catch (e) {
    console.log("SIGE connect exception:", e);
    return c.json({ error: "Erro ao conectar com SIGE." }, 500);
  }
});

// POST /sige/refresh-token — refresh SIGE JWT token
app.post(BASE + "/sige/refresh-token", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ error: "Configuração SIGE não encontrada." }, 400);
    const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ error: "Nenhum token encontrado. Faça login primeiro." }, 400);
    const tokenData = typeof rawToken === "string" ? JSON.parse(rawToken) : rawToken;
    if (!tokenData.refreshToken) {
      return c.json({ error: "Refresh token não disponível. Faça login novamente." }, 400);
    }
    const refreshUrl = `${config.baseUrl}/auth/refresh`;
    console.log(`SIGE refresh-token: POST ${refreshUrl}`);
    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokenData.refreshToken }),
    });
    const responseText = await response.text();
    console.log(`SIGE refresh-token: HTTP ${response.status}`);
    if (!response.ok) {
      let errorMsg = `SIGE retornou HTTP ${response.status}`;
      try {
        const errData = JSON.parse(responseText);
        if (errData.message) errorMsg = errData.message;
        else if (errData.error) errorMsg = errData.error;
      } catch {}
      return c.json({ error: errorMsg, httpStatus: response.status }, 502);
    }
    let refreshData: any;
    try { refreshData = JSON.parse(responseText); }
    catch { return c.json({ error: "Resposta inválida da API SIGE (não é JSON)." }, 502); }
    const refreshedJwt = refreshData.token || refreshData.access_token || refreshData.accessToken || tokenData.token;
    const newTokenData = {
      token: refreshedJwt,
      refreshToken: refreshData.refreshToken || refreshData.refresh_token || tokenData.refreshToken,
      createdAt: new Date().toISOString(),
      expiresAt: computeTokenExpiry(refreshedJwt),
      rawResponse: refreshData,
    };
    await kv.set("sige_api_token", JSON.stringify(newTokenData));
    memClear("_sige_token");
    console.log("SIGE refresh-token: new token stored, expires at", newTokenData.expiresAt);
    return c.json({ refreshed: true, hasToken: !!newTokenData.token, expiresAt: newTokenData.expiresAt });
  } catch (e) {
    console.log("SIGE refresh-token exception:", e);
    return c.json({ error: "Erro ao renovar token." }, 500);
  }
});

// GET /sige/status — get current SIGE connection status
app.get(BASE + "/sige/status", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const rawConfig = await kv.get("sige_api_config");
    const hasConfig = !!rawConfig;
    let configInfo: any = {};
    if (rawConfig) {
      const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
      configInfo = { baseUrl: config.baseUrl, email: config.email, hasPassword: !!config.password };
    }
    const rawToken = await kv.get("sige_api_token");
    let tokenInfo: any = { hasToken: false, expired: true };
    if (rawToken) {
      const td = typeof rawToken === "string" ? JSON.parse(rawToken) : rawToken;
      const expiresAt = new Date(td.expiresAt).getTime();
      const now = Date.now();
      const expired = now > expiresAt;
      const renewalThreshold = expiresAt - PROACTIVE_RENEWAL_BUFFER_MS;
      const willAutoRenew = !!configInfo.hasPassword || !!(rawConfig && (typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig).password);
      tokenInfo = {
        hasToken: !!td.token, hasRefreshToken: !!td.refreshToken,
        createdAt: td.createdAt, expiresAt: td.expiresAt,
        expired, expiresInMs: Math.max(0, expiresAt - now),
        autoRenewal: willAutoRenew ? "ativo" : "inativo",
        autoRenewalNote: willAutoRenew
          ? "Token será renovado automaticamente 15 min antes de expirar ou ao receber 401. Nenhuma ação manual necessária."
          : "Sem credenciais salvas. Re-login automático não disponível.",
        renewsAt: willAutoRenew ? new Date(renewalThreshold).toISOString() : null,
      };
    }
    return c.json({ configured: hasConfig, ...configInfo, ...tokenInfo });
  } catch (e) {
    console.log("SIGE status exception:", e);
    return c.json({ error: "Erro ao buscar status." }, 500);
  }
});

// POST /sige/disconnect — clear stored SIGE tokens
app.post(BASE + "/sige/disconnect", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    await kv.del("sige_api_token");
    console.log("SIGE disconnect: token cleared by user", userId);
    return c.json({ disconnected: true });
  } catch (e) {
    console.log("SIGE disconnect exception:", e);
    return c.json({ error: "Erro ao desconectar." }, 500);
  }
});

// ─── Helper: decode JWT payload and extract expiration ───
function parseJwtExpiration(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    const decoded = atob(payload);
    const json = JSON.parse(decoded);
    if (json.exp && typeof json.exp === "number") {
      return new Date(json.exp * 1000).toISOString();
    }
    return null;
  } catch (e) {
    console.log("parseJwtExpiration: failed to decode JWT", e);
    return null;
  }
}

// ─── Helper: compute token expiration with smart fallback ───
function computeTokenExpiry(token: string): string {
  const jwtExpiry = parseJwtExpiration(token);
  if (jwtExpiry) {
    console.log(`SIGE token: real JWT expiration detected: ${jwtExpiry}`);
    return jwtExpiry;
  }
  // Fallback: 7 days (generous — auto-relogin via 401 will handle actual expiry)
  const fallback = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`SIGE token: no exp in JWT, using 7-day fallback: ${fallback}`);
  return fallback;
}

// Proactive renewal buffer: re-login 15 minutes BEFORE expiration
const PROACTIVE_RENEWAL_BUFFER_MS = 15 * 60 * 1000;

// ─── Helper: re-authenticate with SIGE using stored credentials ───
async function sigeReLogin(): Promise<string | null> {
  try {
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return null;
    const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
    if (!config.baseUrl || !config.email || !config.password) return null;
    const authUrl = `${config.baseUrl}/auth`;
    console.log(`SIGE auto-relogin: POST ${authUrl} for ${config.email}`);
    const response = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: config.email, password: config.password }),
    });
    if (!response.ok) {
      console.log(`SIGE auto-relogin: FAILED HTTP ${response.status}`);
      return null;
    }
    const responseText = await response.text();
    let authData: any;
    try { authData = JSON.parse(responseText); } catch { return null; }
    const newToken = authData.token || authData.access_token || authData.accessToken || "";
    if (!newToken) return null;
    const newTokenData = {
      token: newToken,
      refreshToken: authData.refreshToken || authData.refresh_token || "",
      createdAt: new Date().toISOString(),
      expiresAt: computeTokenExpiry(newToken),
      rawResponse: authData,
    };
    await kv.set("sige_api_token", JSON.stringify(newTokenData));
    memClear("_sige_token");
    console.log(`SIGE auto-relogin: SUCCESS, new token stored, expires ${newTokenData.expiresAt}`);
    return newToken;
  } catch (e) {
    console.log(`SIGE auto-relogin: exception`, e);
    return null;
  }
}

// ── In-memory cache for hot KV keys (avoids repeated KV reads per SIGE call) ──
const _memCache: Record<string, { value: any; expiresAt: number }> = {};

function memGet(key: string): any | null {
  const entry = _memCache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete _memCache[key];
    return null;
  }
  return entry.value;
}

function memSet(key: string, value: any, ttlMs: number): void {
  _memCache[key] = { value, expiresAt: Date.now() + ttlMs };
}

function memClear(key: string): void {
  delete _memCache[key];
}

// Helper: get SIGE config with 60s in-memory cache
async function getSigeConfig(): Promise<any> {
  const cached = memGet("_sige_config");
  if (cached) return cached;
  const raw = await kv.get("sige_api_config");
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  memSet("_sige_config", parsed, 60000);
  return parsed;
}

// Helper: get SIGE token with 30s in-memory cache
async function getSigeToken(): Promise<any> {
  const cached = memGet("_sige_token");
  if (cached) return cached;
  const raw = await kv.get("sige_api_token");
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  memSet("_sige_token", parsed, 30000);
  return parsed;
}

// Helper: get price_config with 60s in-memory cache
async function getPriceConfigCached(): Promise<any> {
  const cached = memGet("_price_config");
  if (cached) return cached;
  const raw = await kv.get("price_config");
  const parsed = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : { tier: "v2", showPrice: true };
  memSet("_price_config", parsed, 60000);
  return parsed;
}

// ─── Helper: make authenticated SIGE API call (with auto-retry on 401) ───
async function sigeAuthFetch(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: any }> {
  const config = await getSigeConfig();
  if (!config) throw new Error("Configuração SIGE não encontrada.");
  let tokenData = await getSigeToken();
  if (!tokenData) throw new Error("Token SIGE não encontrado. Conecte-se primeiro.");
  if (!tokenData.token) throw new Error("Token SIGE vazio. Reconecte.");

  // Proactive renewal: re-login 15 min BEFORE expiration (or if already expired)
  if (tokenData.expiresAt) {
    const expiresAtMs = new Date(tokenData.expiresAt).getTime();
    const renewalThreshold = expiresAtMs - PROACTIVE_RENEWAL_BUFFER_MS;
    const now = Date.now();
    if (now >= renewalThreshold) {
      const isExpired = now >= expiresAtMs;
      console.log("SIGE proxy: token " + (isExpired ? "EXPIRED" : "expiring soon") + " (" + tokenData.expiresAt + "), proactive auto-relogin...");
      const newToken = await sigeReLogin();
      if (newToken) {
        tokenData = { ...tokenData, token: newToken };
        memClear("_sige_token"); // invalidate mem cache so next call picks up fresh token
        console.log("SIGE proxy: proactive relogin SUCCESS, using fresh token");
      } else {
        console.log("SIGE proxy: proactive relogin failed, proceeding with current token");
      }
    }
  }

  var SIGE_CALL_TIMEOUT = 10000; // 10s per individual SIGE API call
  const url = config.baseUrl + path;
  console.log("SIGE proxy: " + method + " " + url);
  const buildFetchOpts = (token: string) => {
    const fetchHeaders: any = { "Content-Type": "application/json", "Authorization": "Bearer " + token };
    const fetchOpts: any = { method, headers: fetchHeaders };
    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOpts.body = JSON.stringify(body);
    }
    return fetchOpts;
  };

  var ac1 = new AbortController();
  var timer1 = setTimeout(function () { ac1.abort(); }, SIGE_CALL_TIMEOUT);
  let response: Response;
  try {
    var opts1 = buildFetchOpts(tokenData.token);
    opts1.signal = ac1.signal;
    response = await fetch(url, opts1);
  } catch (fetchErr: any) {
    clearTimeout(timer1);
    if (fetchErr.name === "AbortError") {
      console.log("SIGE proxy: TIMEOUT (" + (SIGE_CALL_TIMEOUT / 1000) + "s) on " + method + " " + path);
      return { ok: false, status: 408, data: { error: "SIGE timeout (" + (SIGE_CALL_TIMEOUT / 1000) + "s) on " + path } };
    }
    throw fetchErr;
  }
  clearTimeout(timer1);
  const responseText = await response.text();
  console.log("SIGE proxy: " + method + " " + path + " => HTTP " + response.status + ", " + responseText.length + " bytes");

  // Auto-retry on 401 (token expired/invalid)
  if (response.status === 401) {
    console.log("SIGE proxy: got 401, attempting auto-relogin and retry...");
    memClear("_sige_token");
    const newToken = await sigeReLogin();
    if (newToken) {
      console.log("SIGE proxy: retrying " + method + " " + path + " with new token");
      var ac2 = new AbortController();
      var timer2 = setTimeout(function () { ac2.abort(); }, SIGE_CALL_TIMEOUT);
      try {
        var opts2 = buildFetchOpts(newToken);
        opts2.signal = ac2.signal;
        const retryResponse = await fetch(url, opts2);
        clearTimeout(timer2);
        const retryText = await retryResponse.text();
        console.log("SIGE proxy (retry): " + method + " " + path + " => HTTP " + retryResponse.status + ", " + retryText.length + " bytes");
        let retryData: any;
        try { retryData = JSON.parse(retryText); } catch { retryData = { rawText: retryText }; }
        return { ok: retryResponse.ok, status: retryResponse.status, data: retryData };
      } catch (retryErr: any) {
        clearTimeout(timer2);
        if (retryErr.name === "AbortError") {
          console.log("SIGE proxy: TIMEOUT on 401 retry " + method + " " + path);
          return { ok: false, status: 408, data: { error: "SIGE timeout on retry " + path } };
        }
        throw retryErr;
      }
    }
    console.log("SIGE proxy: auto-relogin failed, returning original 401");
  }

  let data: any;
  try { data = JSON.parse(responseText); } catch { data = { rawText: responseText }; }
  return { ok: response.ok, status: response.status, data };
}

// ─── Helper: make PUBLIC (no JWT) SIGE API call ───
async function sigePublicFetch(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: any }> {
  const rawConfig = await kv.get("sige_api_config");
  if (!rawConfig) throw new Error("Configuração SIGE não encontrada. Salve a URL base primeiro.");
  const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
  if (!config.baseUrl) throw new Error("URL base da API SIGE não configurada.");
  const url = `${config.baseUrl}${path}`;
  console.log(`SIGE public proxy: ${method} ${url}`);
  const fetchHeaders: any = { "Content-Type": "application/json" };
  const fetchOpts: any = { method, headers: fetchHeaders };
  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    fetchOpts.body = JSON.stringify(body);
  }
  var acPub = new AbortController();
  var timerPub = setTimeout(function () { acPub.abort(); }, 10000);
  fetchOpts.signal = acPub.signal;
  let response: Response;
  try {
    response = await fetch(url, fetchOpts);
  } catch (pubErr: any) {
    clearTimeout(timerPub);
    if (pubErr.name === "AbortError") {
      console.log("SIGE public proxy: TIMEOUT (10s) on " + method + " " + path);
      return { ok: false, status: 408, data: { error: "SIGE timeout (10s) on " + path } };
    }
    throw pubErr;
  }
  clearTimeout(timerPub);
  const responseText = await response.text();
  console.log("SIGE public proxy: " + method + " " + path + " => HTTP " + response.status + ", " + responseText.length + " bytes");
  let data: any;
  try { data = JSON.parse(responseText); } catch { data = { rawText: responseText }; }
  return { ok: response.ok, status: response.status, data };
}

// ═══════════════════════════════════════════════════════════════════════
// ─── SIGE: CONFIRMAR PEDIDO (baixa no estoque) ─────────────────────
// ═══════════════════════════════════════════════════════════════════════
// When payment is confirmed, the SIGE order must be "confirmed" (situation change)
// to trigger stock deduction. Creating a PVE (codTipoMv 704) only creates the order
// in "Em Aberto" status — stock is NOT deducted until the situation changes to
// "Confirmado" or "Faturado".

// Helper: extract array from SIGE response (shared)
function extractSigeArr(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.dados && Array.isArray(data.dados)) return data.dados;
  if (data.data && Array.isArray(data.data)) return data.data;
  if (data.content && Array.isArray(data.content)) return data.content;
  if (data.items && Array.isArray(data.items)) return data.items;
  return [];
}

// Helper: invalidate balance cache for products in a SIGE order
async function invalidateOrderBalanceCache(sigeOrderId: string) {
  try {
    var saleRaw = await kv.get("sige_sale:" + sigeOrderId);
    if (saleRaw) {
      var sale = typeof saleRaw === "string" ? JSON.parse(saleRaw) : saleRaw;
      if (sale.items && Array.isArray(sale.items)) {
        var keysToDelete: string[] = [];
        for (var itm of sale.items) {
          if (itm.sku) {
            keysToDelete.push("sige_balance_" + itm.sku);
          }
        }
        if (keysToDelete.length > 0) {
          await kv.mdel(keysToDelete);
          console.log("[SIGE-CONFIRM] Invalidated " + keysToDelete.length + " balance cache entries for order " + sigeOrderId);
        }
      }
    }
    await kv.del("stock_summary_cache");
  } catch (e: any) {
    console.log("[SIGE-CONFIRM] Balance cache invalidation error (non-fatal): " + e.message);
  }
}

// Main helper: confirm a SIGE order to trigger stock deduction
async function confirmSigeOrder(sigeOrderId: string): Promise<{ ok: boolean; message: string; details?: any }> {
  if (!sigeOrderId || sigeOrderId === "null" || sigeOrderId === "undefined") {
    return { ok: false, message: "sigeOrderId vazio ou inválido" };
  }

  try {
    console.log("[SIGE-CONFIRM] Confirming order " + sigeOrderId + " to trigger stock deduction...");

    // 1. Fetch current order to see its situation
    var currentOrder: any = null;
    try {
      var orderRes = await sigeAuthFetch("GET", "/order/" + sigeOrderId);
      if (orderRes.ok && orderRes.data) {
        var od = orderRes.data.dados || orderRes.data.data || orderRes.data;
        currentOrder = Array.isArray(od) ? od[0] : od;
        var currentSit = currentOrder.codSituacao || currentOrder.situacao || "unknown";
        console.log("[SIGE-CONFIRM] Current order " + sigeOrderId + " situation: " + currentSit + ", keys: " + Object.keys(currentOrder).join(","));
        // If already confirmed/faturado, skip
        var sitStr = String(currentSit).toLowerCase();
        if (sitStr === "c" || sitStr === "confirmado" || sitStr === "f" || sitStr === "faturado" || sitStr === "2" || sitStr === "3") {
          console.log("[SIGE-CONFIRM] Order " + sigeOrderId + " already confirmed/faturado (codSituacao=" + currentSit + "), skipping");
          await invalidateOrderBalanceCache(sigeOrderId);
          return { ok: true, message: "Pedido já confirmado (codSituacao=" + currentSit + ")" };
        }
      }
    } catch (e: any) {
      console.log("[SIGE-CONFIRM] Failed to fetch current order: " + e.message);
    }

    // 2. Fetch available situations from GET /situation (cached 24h)
    var situations: any[] = [];
    var sitCacheKey = "sige_situations_cache";
    var sitCache = await kv.get(sitCacheKey);
    if (sitCache) {
      var parsed = typeof sitCache === "string" ? JSON.parse(sitCache) : sitCache;
      if (parsed.situations && Date.now() - (parsed.cachedAt || 0) < 86400000) {
        situations = parsed.situations;
      }
    }

    if (situations.length === 0) {
      try {
        var sitResult = await sigeAuthFetch("GET", "/situation?limit=100&offset=1");
        if (sitResult.ok && sitResult.data) {
          situations = extractSigeArr(sitResult.data);
          if (situations.length > 0) {
            await kv.set(sitCacheKey, JSON.stringify({ situations: situations, cachedAt: Date.now() }));
            console.log("[SIGE-CONFIRM] Cached " + situations.length + " situation codes");
          }
        }
      } catch (e: any) {
        console.log("[SIGE-CONFIRM] Failed to fetch situations: " + e.message);
      }
    }

    // 3. Find "Confirmado" situation code
    var confirmCode: any = null;
    var confirmCodeFaturado: any = null;
    if (situations.length > 0) {
      console.log("[SIGE-CONFIRM] Available situations: " + JSON.stringify(situations.slice(0, 15)));
      for (var sit of situations) {
        var desc = String(sit.descricao || sit.description || sit.nome || sit.name || "").toLowerCase();
        var code = sit.codSituacao || sit.codigo || sit.id || sit.code;
        if (!confirmCode && (desc.includes("confirmad") || desc.includes("confirm"))) {
          confirmCode = code;
          console.log("[SIGE-CONFIRM] Found Confirmado: code=" + code + ", desc=" + desc);
        }
        if (!confirmCodeFaturado && (desc.includes("faturad") || desc.includes("aprovad"))) {
          confirmCodeFaturado = code;
          console.log("[SIGE-CONFIRM] Found Faturado/Aprovado: code=" + code + ", desc=" + desc);
        }
      }
    }

    // 4. Build list of codes to try (most to least likely)
    var codesToTry: string[] = [];
    if (confirmCode) codesToTry.push(String(confirmCode));
    codesToTry.push("C", "2");
    if (confirmCodeFaturado) codesToTry.push(String(confirmCodeFaturado));
    codesToTry.push("F", "3");
    var uniqueCodes: string[] = [];
    var seen = new Set<string>();
    for (var cd of codesToTry) {
      if (!seen.has(cd)) { seen.add(cd); uniqueCodes.push(cd); }
    }

    // 5. Strategy A: PUT /order/{id} with codSituacao
    for (var tryCode of uniqueCodes) {
      try {
        console.log("[SIGE-CONFIRM] Strategy A: PUT /order/" + sigeOrderId + " codSituacao=" + tryCode);
        var putResult = await sigeAuthFetch("PUT", "/order/" + sigeOrderId, { codSituacao: tryCode });
        console.log("[SIGE-CONFIRM] PUT /order/" + sigeOrderId + " codSituacao=" + tryCode + " => HTTP " + putResult.status);

        if (putResult.ok) {
          console.log("[SIGE-CONFIRM] SUCCESS: Order " + sigeOrderId + " confirmed with codSituacao=" + tryCode);
          await invalidateOrderBalanceCache(sigeOrderId);
          return {
            ok: true,
            message: "Pedido " + sigeOrderId + " confirmado no SIGE (codSituacao=" + tryCode + ")",
            details: { method: "PUT /order", codSituacao: tryCode, response: putResult.data }
          };
        }
      } catch (e: any) {
        console.log("[SIGE-CONFIRM] Strategy A error codSituacao=" + tryCode + ": " + e.message);
      }
    }

    // 6. Strategy B: PUT /order/{id}/situation
    for (var tryCode2 of uniqueCodes) {
      try {
        console.log("[SIGE-CONFIRM] Strategy B: PUT /order/" + sigeOrderId + "/situation codSituacao=" + tryCode2);
        var sitPutResult = await sigeAuthFetch("PUT", "/order/" + sigeOrderId + "/situation", { codSituacao: tryCode2 });
        console.log("[SIGE-CONFIRM] PUT /order/" + sigeOrderId + "/situation => HTTP " + sitPutResult.status);

        if (sitPutResult.ok) {
          console.log("[SIGE-CONFIRM] SUCCESS via /situation: Order " + sigeOrderId + " confirmed (codSituacao=" + tryCode2 + ")");
          await invalidateOrderBalanceCache(sigeOrderId);
          return {
            ok: true,
            message: "Pedido " + sigeOrderId + " confirmado via /situation (codSituacao=" + tryCode2 + ")",
            details: { method: "PUT /order/situation", codSituacao: tryCode2 }
          };
        }
      } catch (e: any) {
        console.log("[SIGE-CONFIRM] Strategy B error: " + e.message);
      }
    }

    // 7. Strategy C: POST /order/{id}/confirm
    try {
      console.log("[SIGE-CONFIRM] Strategy C: POST /order/" + sigeOrderId + "/confirm");
      var confResult = await sigeAuthFetch("POST", "/order/" + sigeOrderId + "/confirm", {});
      console.log("[SIGE-CONFIRM] POST /order/" + sigeOrderId + "/confirm => HTTP " + confResult.status);
      if (confResult.ok) {
        console.log("[SIGE-CONFIRM] SUCCESS via POST /confirm");
        await invalidateOrderBalanceCache(sigeOrderId);
        return { ok: true, message: "Pedido " + sigeOrderId + " confirmado via POST /confirm", details: confResult.data };
      }
    } catch (e: any) {
      console.log("[SIGE-CONFIRM] Strategy C error: " + e.message);
    }

    // 8. Strategy D: PATCH /order/{id} with codSituacao
    try {
      var patchCode = confirmCode ? String(confirmCode) : "C";
      console.log("[SIGE-CONFIRM] Strategy D: PATCH /order/" + sigeOrderId + " codSituacao=" + patchCode);
      var patchResult = await sigeAuthFetch("PATCH", "/order/" + sigeOrderId, { codSituacao: patchCode });
      if (patchResult.ok) {
        console.log("[SIGE-CONFIRM] SUCCESS via PATCH");
        await invalidateOrderBalanceCache(sigeOrderId);
        return { ok: true, message: "Pedido confirmado via PATCH (codSituacao=" + patchCode + ")" };
      }
    } catch (e: any) {
      console.log("[SIGE-CONFIRM] Strategy D error: " + e.message);
    }

    console.log("[SIGE-CONFIRM] WARNING: All confirmation strategies failed for order " + sigeOrderId);
    return {
      ok: false,
      message: "Nenhuma estratégia de confirmação funcionou para o pedido " + sigeOrderId + ". Verifique a configuração do SIGE.",
      details: { triedCodes: uniqueCodes, situationsFound: situations.length, currentOrder: currentOrder ? { codSituacao: currentOrder.codSituacao } : null }
    };
  } catch (e: any) {
    console.log("[SIGE-CONFIRM] Exception: " + e.message);
    return { ok: false, message: "Erro ao confirmar pedido: " + e.message };
  }
}

// ══════════════��════════════════════════
// ─── SIGE: USUARIOS ──────────────────
// ═══════════════════════════════════════

// POST /sige/user/register — criar usuario SEM JWT (registro inicial do zero)
// Aceita baseUrl opcional no body para nao depender de config previa
app.post(BASE + "/sige/user/register", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var regBody = await c.req.json();
    // Input validation for SIGE user register
    var regValid = validate(regBody, {
      name: { required: true, type: "string", minLen: 1, maxLen: 150 },
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      password: { required: true, type: "string", minLen: 1, maxLen: 128, sanitize: false },
      baseUrl: { type: "string", maxLen: 500 },
    });
    if (!regValid.ok) {
      return c.json({ error: regValid.errors[0] || "Dados invalidos." }, 400);
    }
    var name = regValid.sanitized.name || "";
    var email = regValid.sanitized.email || "";
    var password = regValid.sanitized.password || "";
    var bodyBaseUrl = regValid.sanitized.baseUrl || undefined;
    if (!name || !email || !password) return c.json({ error: "Nome, email e senha são obrigatórios." }, 400);

    // Determine base URL: body param takes priority, then stored config
    let apiBaseUrl = bodyBaseUrl?.trim();
    if (!apiBaseUrl) {
      const rawConfig = await kv.get("sige_api_config");
      if (rawConfig) {
        const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
        apiBaseUrl = config.baseUrl;
      }
    }
    if (!apiBaseUrl) return c.json({ error: "URL base da API SIGE não informada. Informe no campo ou salve na configuração." }, 400);

    // Normalize: strip trailing slashes
    apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");

    // If baseUrl was provided in body, also save/update the config for future use
    if (bodyBaseUrl?.trim()) {
      const rawConfig = await kv.get("sige_api_config");
      const existing = rawConfig ? (typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig) : {};
      await kv.set("sige_api_config", JSON.stringify({ ...existing, baseUrl: apiBaseUrl, updatedAt: new Date().toISOString() }));
      memClear("_sige_config");
      console.log("SIGE config: baseUrl saved/updated via register endpoint");
    }

    // Call SIGE API directly (no JWT)
    const url = `${apiBaseUrl}/user/create`;
    console.log(`SIGE register: POST ${url}`);
    console.log(`SIGE register: body =>`, JSON.stringify({ name, email, password: "***" }));
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const responseText = await response.text();
    console.log(`SIGE register: POST /user/create => HTTP ${response.status}, body: ${responseText.substring(0, 500)}`);
    let data: any;
    try { data = JSON.parse(responseText); } catch { data = { rawText: responseText }; }
    if (!response.ok) {
      console.log("[SIGE] Register error HTTP " + response.status + ": " + (data?.message || data?.error || "unknown"));
      return c.json({ error: "Erro na comunicacao com o sistema." }, 502);
    }
    return c.json(data);
  } catch (e: any) {
    console.log("SIGE user/register exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ── Helper: sanitized SIGE proxy error response (no raw sigeData) ──
function _sigeProxyError(c: any, result: any) {
  var msg = (result.data && (result.data.message || result.data.error)) || "Erro na comunicacao com o sistema.";
  console.log("[SIGE] Proxy error HTTP " + result.status + ": " + msg);
  return c.json({ error: "Erro na comunicacao com o sistema." }, 502);
}

// POST /sige/user/create — proxy to SIGE POST /user/create (requer JWT ativo)
app.post(BASE + "/sige/user/create", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var ucBody = await c.req.json();
    // Input validation for SIGE user create
    var ucValid = validate(ucBody, {
      name: { required: true, type: "string", minLen: 1, maxLen: 150 },
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      password: { required: true, type: "string", minLen: 1, maxLen: 128, sanitize: false },
    });
    if (!ucValid.ok) {
      return c.json({ error: ucValid.errors[0] || "Dados invalidos." }, 400);
    }
    var name = ucValid.sanitized.name || "";
    var email = ucValid.sanitized.email || "";
    var password = ucValid.sanitized.password || "";
    if (!name || !email || !password) return c.json({ error: "Nome, email e senha são obrigatórios." }, 400);
    const result = await sigeAuthFetch("POST", "/user/create", { name, email, password });
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE user/create exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// GET /sige/user/me — proxy to SIGE GET /user/me
app.get(BASE + "/sige/user/me", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const result = await sigeAuthFetch("GET", "/user/me");
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE user/me exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// PATCH /sige/user/reset/:id — proxy to SIGE PATCH /user/reset/{id}
app.patch(BASE + "/sige/user/reset/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    var resetBody = await c.req.json();
    // Input validation for SIGE password reset
    var resetValid = validate(resetBody, {
      password: { required: true, type: "string", minLen: 1, maxLen: 128, sanitize: false },
      newPassword: { required: true, type: "string", minLen: 8, maxLen: 128, sanitize: false },
    });
    if (!resetValid.ok) {
      return c.json({ error: resetValid.errors[0] || "Dados invalidos." }, 400);
    }
    var password = resetValid.sanitized.password;
    var newPassword = resetValid.sanitized.newPassword;
    if (!password || !newPassword) return c.json({ error: "Senha atual e nova senha são obrigatórias." }, 400);
    const result = await sigeAuthFetch("PATCH", "/user/reset/" + id, { password: password, newPassword: newPassword });
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE user/reset exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CATEGORIAS ─────────────────
// ═══════════════════════════════════════

// GET /sige/category — proxy to SIGE GET /category
app.get(BASE + "/sige/category", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE category proxy: GET /category${queryString}`);
    const result = await sigeAuthFetch("GET", `/category${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /category exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// POST /sige/category — proxy to SIGE POST /category
app.post(BASE + "/sige/category", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    // Input validation for SIGE category
    var sigeCatValid = validate(body, {
      codCategoria: { required: true, type: "string", maxLen: 50 },
      nomeCategoria: { required: true, type: "string", maxLen: 200 },
      classe: { required: true, type: "string", maxLen: 2, oneOf: ["S", "E"] },
    });
    if (!sigeCatValid.ok) {
      return c.json({ error: sigeCatValid.errors[0] || "Dados invalidos." }, 400);
    }
    var codCategoria = sigeCatValid.sanitized.codCategoria;
    var nomeCategoria = sigeCatValid.sanitized.nomeCategoria;
    var classe = sigeCatValid.sanitized.classe;
    const result = await sigeAuthFetch("POST", "/category", { codCategoria: codCategoria, nomeCategoria: nomeCategoria, classe: classe });
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /category exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// PUT /sige/category/:id — proxy to SIGE PUT /category/{id}
app.put(BASE + "/sige/category/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    // Input validation for SIGE category update
    var sigeCatUpValid = validate(body, {
      nomeCategoria: { required: true, type: "string", maxLen: 200 },
      classe: { required: true, type: "string", maxLen: 2, oneOf: ["S", "E"] },
    });
    if (!sigeCatUpValid.ok) {
      return c.json({ error: sigeCatUpValid.errors[0] || "Dados invalidos." }, 400);
    }
    var nomeCategoria = sigeCatUpValid.sanitized.nomeCategoria;
    var classe = sigeCatUpValid.sanitized.classe;
    const result = await sigeAuthFetch("PUT", "/category/" + id, { nomeCategoria: nomeCategoria, classe: classe });
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /category exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// DELETE /sige/category/:id — proxy to SIGE DELETE /category/{id}
app.delete(BASE + "/sige/category/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const result = await sigeAuthFetch("DELETE", `/category/${id}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE DELETE /category exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CLIENTES ───────────────────
// ═══════════════════════════════════════

// GET /sige/customer — proxy to SIGE GET /customer (busca com filtros)
app.get(BASE + "/sige/customer", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE customer proxy: GET /customer${queryString}`);
    const result = await sigeAuthFetch("GET", `/customer${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// GET /sige/customer/:id — proxy to SIGE GET /customer/{id} (busca por ID)
app.get(BASE + "/sige/customer/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE customer proxy: GET /customer/${id}${queryString}`);
    const result = await sigeAuthFetch("GET", `/customer/${id}${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer/:id exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// POST /sige/customer — proxy to SIGE POST /customer (cadastrar)
app.post(BASE + "/sige/customer", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    // Input validation for SIGE customer create
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    var custValid = validate(body, {
      tipoCadastro: { required: true, type: "string", maxLen: 5, oneOf: ["F", "J"] },
      nomeCadastro: { required: true, type: "string", minLen: 1, maxLen: 200 },
      cpfCnpj: { type: "string", maxLen: 20, custom: validators.cpfOrCnpj },
      email: { type: "string", maxLen: 254 },
      telefone: { type: "string", maxLen: 30 },
    });
    if (!custValid.ok) {
      return c.json({ error: custValid.errors[0] || "Dados invalidos." }, 400);
    }
    console.log("SIGE customer proxy: POST /customer");
    const result = await sigeAuthFetch("POST", "/customer", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /customer exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// PUT /sige/customer/:id — proxy to SIGE PUT /customer/{id} (alterar)
app.put(BASE + "/sige/customer/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    // Input validation for SIGE customer update
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    var custUpValid = validate(body, {
      nomeCadastro: { type: "string", maxLen: 200 },
      cpfCnpj: { type: "string", maxLen: 20, custom: validators.cpfOrCnpj },
      email: { type: "string", maxLen: 254 },
      telefone: { type: "string", maxLen: 30 },
    });
    if (!custUpValid.ok) {
      return c.json({ error: custUpValid.errors[0] || "Dados invalidos." }, 400);
    }
    console.log("SIGE customer proxy: PUT /customer/" + id);
    const result = await sigeAuthFetch("PUT", "/customer/" + id, body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /customer/:id exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CLIENTE ENDERECO ───────────
// ═══════════════════════════════════════

// GET /sige/customer/:id/address — proxy to SIGE GET /customer/{id}/address
app.get(BASE + "/sige/customer/:id/address", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE customer address proxy: GET /customer/${id}/address${queryString}`);
    const result = await sigeAuthFetch("GET", `/customer/${id}/address${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer/:id/address exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// POST /sige/customer/:id/address — proxy to SIGE POST /customer/{id}/address
app.post(BASE + "/sige/customer/:id/address", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    if (!body.tipoEndereco) return c.json({ error: "tipoEndereco é obrigatório." }, 400);
    console.log("SIGE customer address proxy: POST /customer/" + id + "/address");
    const result = await sigeAuthFetch("POST", "/customer/" + id + "/address", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /customer/:id/address exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// PUT /sige/customer/:id/address — proxy to SIGE PUT /customer/{id}/address
app.put(BASE + "/sige/customer/:id/address", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    if (!body.tipoEndereco) return c.json({ error: "tipoEndereco é obrigatório." }, 400);
    console.log("SIGE customer address proxy: PUT /customer/" + id + "/address");
    const result = await sigeAuthFetch("PUT", "/customer/" + id + "/address", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /customer/:id/address exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CLIENTE COMPLEMENTO ────────
// ═══════════════════════════════════════

// GET /sige/customer/:id/complement — proxy to SIGE GET /customer/{id}/complement
app.get(BASE + "/sige/customer/:id/complement", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    console.log(`SIGE customer complement proxy: GET /customer/${id}/complement`);
    const result = await sigeAuthFetch("GET", `/customer/${id}/complement`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer/:id/complement exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// POST /sige/customer/:id/complement — proxy to SIGE POST /customer/{id}/complement
app.post(BASE + "/sige/customer/:id/complement", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE customer complement proxy: POST /customer/" + id + "/complement");
    const result = await sigeAuthFetch("POST", "/customer/" + id + "/complement", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /customer/:id/complement exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// PUT /sige/customer/:id/complement — proxy to SIGE PUT /customer/{id}/complement
app.put(BASE + "/sige/customer/:id/complement", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE customer complement proxy: PUT /customer/" + id + "/complement");
    const result = await sigeAuthFetch("PUT", "/customer/" + id + "/complement", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /customer/:id/complement exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CLIENTE CONTATO ────────────
// ═══════════════════════════════════════

// GET /sige/customer/:id/contact — proxy to SIGE GET /customer/{id}/contact
app.get(BASE + "/sige/customer/:id/contact", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE customer contact proxy: GET /customer/${id}/contact${queryString}`);
    const result = await sigeAuthFetch("GET", `/customer/${id}/contact${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer/:id/contact exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// POST /sige/customer/:id/contact — proxy to SIGE POST /customer/{id}/contact
app.post(BASE + "/sige/customer/:id/contact", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    if (!body.nome) return c.json({ error: "nome é obrigatório no body." }, 400);
    console.log("SIGE customer contact proxy: POST /customer/" + id + "/contact");
    const result = await sigeAuthFetch("POST", "/customer/" + id + "/contact", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /customer/:id/contact exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// PUT /sige/customer/:id/contact — proxy to SIGE PUT /customer/{id}/contact?nome=...
app.put(BASE + "/sige/customer/:id/contact", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const nome = url.searchParams.get("nome");
    if (!nome || nome.length > 200) return c.json({ error: "Query param 'nome' é obrigatório para identificar o contato a alterar." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE customer contact proxy: PUT /customer/" + id + "/contact?nome=" + nome);
    const result = await sigeAuthFetch("PUT", "/customer/" + id + "/contact?nome=" + encodeURIComponent(nome), body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /customer/:id/contact exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO ────────────────────
// ═══════════════════════════════════════

// GET /sige/product — proxy to SIGE GET /product with query filters
app.get(BASE + "/sige/product", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE product proxy: GET /product${queryString}`);
    const result = await sigeAuthFetch("GET", `/product${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// POST /sige/product — proxy to SIGE POST /product
app.post(BASE + "/sige/product", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    // Input validation: body must be a non-empty object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    if (JSON.stringify(body).length > 50000) {
      return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    }
    console.log("SIGE product proxy: POST /product");
    const result = await sigeAuthFetch("POST", "/product", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /product exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// PUT /sige/product/:id — proxy to SIGE PUT /product/{id}
app.put(BASE + "/sige/product/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    // Input validation
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    if (JSON.stringify(body).length > 50000) {
      return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    }
    console.log("SIGE product proxy: PUT /product/" + id);
    const result = await sigeAuthFetch("PUT", "/product/" + id, body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /product/:id exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO SALDO ─────────────
// ═══════════════════════════════════════

app.get(BASE + "/sige/product/:id/balance", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const queryString = url.search;
    const debug = url.searchParams.get("debug") === "1";
    console.log(`SIGE product balance proxy: GET /product/${id}/balance${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/balance${queryString}`);
    if (!result.ok) {
      console.log(`SIGE balance error for ${id}: HTTP ${result.status}`, JSON.stringify(result.data).slice(0, 500));
      return _sigeProxyError(c, result);
    }
    const topKeys = result.data && typeof result.data === "object" ? Object.keys(result.data) : [];
    console.log(`SIGE balance OK for ${id}: topKeys=[${topKeys.join(",")}]`);
    let itemKeys: string[] = [];
    if (result.data?.dados && Array.isArray(result.data.dados) && result.data.dados.length > 0) {
      itemKeys = Object.keys(result.data.dados[0]);
      console.log(`SIGE balance ${id}: dados[0] keys=[${itemKeys.join(",")}], count=${result.data.dados.length}`);
    } else if (Array.isArray(result.data) && result.data.length > 0) {
      itemKeys = Object.keys(result.data[0]);
      console.log(`SIGE balance ${id}: array[0] keys=[${itemKeys.join(",")}], count=${result.data.length}`);
    }
    if (debug) {
      return c.json({ _raw: result.data, _topKeys: topKeys, _itemKeys: itemKeys, ...result.data });
    }
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product/:id/balance exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO PCP ───────────────
// ═══════════════════════════════════════

app.get(BASE + "/sige/product/:id/product-control-plan", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE product PCP proxy: GET /product/${id}/product-control-plan${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/product-control-plan${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product/:id/product-control-plan exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO PROMOCAO ──────────
// ═══════════════════════════════════════

app.get(BASE + "/sige/product/:id/promotion", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE product promotion proxy: GET /product/${id}/promotion${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/promotion${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product/:id/promotion exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO REFERENCIA ────────
// ═══════════════════════════════════════

app.get(BASE + "/sige/product/:id/reference", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE product reference proxy: GET /product/${id}/reference${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/reference${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product/:id/reference exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.post(BASE + "/sige/product/:id/reference", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE product reference proxy: POST /product/" + id + "/reference");
    const result = await sigeAuthFetch("POST", "/product/" + id + "/reference", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /product/:id/reference exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.put(BASE + "/sige/product/:id/reference", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE product reference proxy: PUT /product/" + id + "/reference");
    const result = await sigeAuthFetch("PUT", "/product/" + id + "/reference", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /product/:id/reference exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: API DOCS STORAGE ─────────
// ═══════════════════════════════════════

app.get(BASE + "/sige/api-docs", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const doc = await kv.get("sige_api_docs");
    if (!doc) return c.json({ found: false, content: "", sections: [], updatedAt: null, size: 0 });
    const parsed = typeof doc === "string" ? JSON.parse(doc) : doc;
    return c.json({
      found: true,
      content: parsed.content || "",
      sections: parsed.sections || [],
      updatedAt: parsed.updatedAt || null,
      size: (parsed.content || "").length,
    });
  } catch (e: any) {
    console.log("SIGE api-docs GET exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.put(BASE + "/sige/api-docs", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    // Input validation for api-docs
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    var apiDocValid = validate(body, {
      content: { required: true, type: "string", maxLen: 5000000, sanitize: false, trim: false },
    });
    if (!apiDocValid.ok) return c.json({ error: apiDocValid.errors[0] || "Dados invalidos." }, 400);
    const content = String(body.content || "");
    const sections: string[] = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#{1,4}\s+/.test(trimmed) || /^[A-Z][A-Z\s\/]{3,}$/.test(trimmed) || /^\d+\.\s+[A-Z]/.test(trimmed)) {
        sections.push(trimmed.replace(/^#+\s*/, "").trim());
      }
    }
    const docData = {
      content,
      sections: sections.slice(0, 200),
      updatedAt: new Date().toISOString(),
    };
    await kv.set("sige_api_docs", JSON.stringify(docData));
    console.log(`SIGE api-docs saved: ${content.length} chars, ${sections.length} sections detected`);
    return c.json({ success: true, size: content.length, sections: sections.length, updatedAt: docData.updatedAt });
  } catch (e: any) {
    console.log("SIGE api-docs PUT exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.delete(BASE + "/sige/api-docs", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    await kv.del("sige_api_docs");
    return c.json({ success: true, message: "Documentação removida." });
  } catch (e: any) {
    console.log("SIGE api-docs DELETE exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.post(BASE + "/sige/api-docs/search", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    // Input validation for api-docs search
    var apiSearchValid = validate(body, {
      query: { required: true, type: "string", minLen: 1, maxLen: 500 },
    });
    if (!apiSearchValid.ok) return c.json({ results: [], message: "Query invalida." });
    const query = String(apiSearchValid.sanitized.query || "").toLowerCase().trim();
    if (!query) return c.json({ results: [], message: "Query vazia." });
    const doc = await kv.get("sige_api_docs");
    if (!doc) return c.json({ results: [], message: "Nenhuma documentacao salva." });
    const parsed = typeof doc === "string" ? JSON.parse(doc) : doc;
    const content = parsed.content || "";
    const docLines = content.split("\n");
    const results: Array<{ lineNumber: number; context: string }> = [];
    for (let i = 0; i < docLines.length; i++) {
      if (docLines[i].toLowerCase().includes(query)) {
        const start = Math.max(0, i - 3);
        const end = Math.min(docLines.length - 1, i + 3);
        const context = docLines.slice(start, end + 1).map((l: string, idx: number) => {
          const ln = start + idx + 1;
          const marker = (start + idx === i) ? ">>>" : "   ";
          return `${marker} ${ln}: ${l}`;
        }).join("\n");
        results.push({ lineNumber: i + 1, context });
        if (results.length >= 30) break;
      }
    }
    return c.json({ results, total: results.length, query });
  } catch (e: any) {
    console.log("SIGE api-docs search exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: DEBUG PRODUCT REFERENCE ───
// ═══════════════════════════════════════

app.get(BASE + "/sige/debug-ref/:codProduto", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const codProduto = (c.req.param("codProduto") || "").substring(0, 50);
    if (!codProduto) return c.json({ error: "codProduto invalido." }, 400);
    const debug: any = { codProduto, steps: [] };

    // Step 1: Check KV sige_map
    let sigeCodProduto = codProduto;
    let sigeId = codProduto;
    try {
      const mapEntry = await kv.get(`sige_map_${codProduto}`);
      if (mapEntry) {
        const map = typeof mapEntry === "string" ? JSON.parse(mapEntry) : mapEntry;
        if (map.codProduto) sigeCodProduto = String(map.codProduto);
        if (map.sigeId) sigeId = String(map.sigeId);
        debug.steps.push({ step: "kv_sige_map", found: true, map });
      } else {
        debug.steps.push({ step: "kv_sige_map", found: false });
      }
    } catch (e: any) {
      debug.steps.push({ step: "kv_sige_map", error: e.message });
    }
    debug.sigeCodProduto = sigeCodProduto;
    debug.sigeId = sigeId;

    // Step 2: Fetch product details
    try {
      const prodResult = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(codProduto)}&limit=1`);
      debug.steps.push({
        step: "fetch_product_by_code",
        url: `/product?codProduto=${codProduto}&limit=1`,
        status: prodResult.status,
        ok: prodResult.ok,
        data: prodResult.data,
      });
    } catch (e: any) {
      debug.steps.push({ step: "fetch_product_by_code", error: e.message });
    }

    // Step 3: Fetch product reference via /product/{id}/reference
    const idsToTry = [...new Set([sigeId, sigeCodProduto, codProduto])];
    for (const pid of idsToTry) {
      try {
        const refResult = await sigeAuthFetch("GET", `/product/${encodeURIComponent(pid)}/reference`);
        debug.steps.push({
          step: `fetch_ref_via_${pid}`,
          url: `/product/${pid}/reference`,
          status: refResult.status,
          ok: refResult.ok,
          rawData: refResult.data,
          dataType: typeof refResult.data,
          isArray: Array.isArray(refResult.data),
          keys: refResult.data && typeof refResult.data === "object" && !Array.isArray(refResult.data) ? Object.keys(refResult.data) : null,
        });
      } catch (e: any) {
        debug.steps.push({ step: `fetch_ref_via_${pid}`, error: e.message });
      }
    }

    // Step 4: Global /reference endpoint sample (3 records)
    try {
      const globalRef = await sigeAuthFetch("GET", `/reference?limit=3`);
      debug.steps.push({
        step: "global_reference_sample",
        url: "/reference?limit=3",
        status: globalRef.status,
        ok: globalRef.ok,
        rawData: globalRef.data,
      });
    } catch (e: any) {
      debug.steps.push({ step: "global_reference_sample", error: e.message });
    }

    return c.json(debug);
  } catch (e: any) {
    console.log("SIGE debug-ref exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO FICHA TECNICA ─────
// ═══════════════════════════════════════

app.get(BASE + "/sige/product/:id/technical-sheet", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE technical-sheet proxy: GET /product/${id}/technical-sheet${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/technical-sheet${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product/:id/technical-sheet exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.post(BASE + "/sige/product/:id/technical-sheet", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE technical-sheet proxy: POST /product/" + id + "/technical-sheet");
    const result = await sigeAuthFetch("POST", "/product/" + id + "/technical-sheet", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /product/:id/technical-sheet exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.put(BASE + "/sige/product/:id/technical-sheet", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE technical-sheet proxy: PUT /product/" + id + "/technical-sheet");
    const result = await sigeAuthFetch("PUT", "/product/" + id + "/technical-sheet", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /product/:id/technical-sheet exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: LISTA DE PRECOS ───────────
// ═══════════════════════════════════════

// GET /sige/list-price — proxy to SIGE GET /list-price
app.get(BASE + "/sige/list-price", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE list-price proxy: GET /list-price${queryString}`);
    const result = await sigeAuthFetch("GET", `/list-price${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /list-price exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// GET /sige/list-price-items — proxy to SIGE GET /list-price-items
app.get(BASE + "/sige/list-price-items", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE list-price-items proxy: GET /list-price-items${queryString}`);
    const result = await sigeAuthFetch("GET", `/list-price-items${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /list-price-items exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS (ORDERS) ──────────
// ═══════════════════════════════════════

app.get(BASE + "/sige/order", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE order proxy: GET /order${queryString}`);
    const result = await sigeAuthFetch("GET", `/order${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.get(BASE + "/sige/order/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    console.log(`SIGE order proxy: GET /order/${id}`);
    const result = await sigeAuthFetch("GET", `/order/${id}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order/:id exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.post(BASE + "/sige/order", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    // Input validation: body must be a non-empty object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    if (JSON.stringify(body).length > 100000) {
      return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    }
    console.log("SIGE order proxy: POST /order");
    const result = await sigeAuthFetch("POST", "/order", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /order exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS OBSERVACAO ────────
// ═══════════════════════════════════════

app.get(BASE + "/sige/order/:id/observation", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    console.log(`SIGE order observation proxy: GET /order/${id}/observation`);
    const result = await sigeAuthFetch("GET", `/order/${id}/observation`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order/:id/observation exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.post(BASE + "/sige/order/:id/observation", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE order observation proxy: POST /order/" + id + "/observation");
    const result = await sigeAuthFetch("POST", "/order/" + id + "/observation", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /order/:id/observation exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.put(BASE + "/sige/order/:id/observation", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE order observation proxy: PUT /order/" + id + "/observation");
    const result = await sigeAuthFetch("PUT", "/order/" + id + "/observation", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /order/:id/observation exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS PARCELAMENTO ──────
// ═══════════════════════════════════════

app.get(BASE + "/sige/order/:id/installment", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    console.log(`SIGE order installment proxy: GET /order/${id}/installment`);
    const result = await sigeAuthFetch("GET", `/order/${id}/installment`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order/:id/installment exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS ITEMS ─────────────
// ═══════════════════════════════════════

app.get(BASE + "/sige/order-items/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    console.log(`SIGE order-items proxy: GET /order-items/${id}`);
    const result = await sigeAuthFetch("GET", `/order-items/${id}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order-items/:id exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.post(BASE + "/sige/order-items/:id", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE order-items proxy: POST /order-items/" + id);
    const result = await sigeAuthFetch("POST", "/order-items/" + id, body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /order-items/:id exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS ITEMS TEXT ────────
// ═══════════════════════════════════════

app.get(BASE + "/sige/order-items/:id/text", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE order-items text proxy: GET /order-items/${id}/text${queryString}`);
    const result = await sigeAuthFetch("GET", `/order-items/${id}/text${queryString}`);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order-items/:id/text exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.post(BASE + "/sige/order-items/:id/text", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE order-items text proxy: POST /order-items/" + id + "/text");
    const result = await sigeAuthFetch("POST", "/order-items/" + id + "/text", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /order-items/:id/text exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

app.put(BASE + "/sige/order-items/:id/text", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 10000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    console.log("SIGE order-items text proxy: PUT /order-items/" + id + "/text");
    const result = await sigeAuthFetch("PUT", "/order-items/" + id + "/text", body);
    if (!result.ok) return _sigeProxyError(c, result);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /order-items/:id/text exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: DEPENDENCIAS (generic GET proxy) ──
// ═══════════════════════════════════════
const ALLOWED_DEP_ENDPOINTS = new Set([
  "area","area-work","branch","brand","country","currency",
  "balance-v2","division-one","division-two","division-three",
  "fiscal-classfication","grate","group","group-limit","local-stock",
  "municipality","payment-condition","promotion","reference","risk",
  "sequence","situation","type-document","type-moviment","type-register",
  "unit","list-product","list-product-overview","tracking",
  "list-price","list-price-items",
]);

app.get(BASE + "/sige/dep/:endpoint{.+}", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const fullPath = c.req.path;
    const prefix = BASE + "/sige/dep/";
    const sigePath = "/" + fullPath.substring(fullPath.indexOf(prefix) + prefix.length);
    const baseEndpoint = sigePath.split("/")[1]?.split("?")[0];
    if (!baseEndpoint || !ALLOWED_DEP_ENDPOINTS.has(baseEndpoint)) {
      console.log("[sige/dep] Blocked endpoint: " + baseEndpoint);
      return c.json({ error: "Endpoint nao permitido." }, 400);
    }
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE dep proxy: GET ${sigePath}${queryString}`);
    const result = await sigeAuthFetch("GET", sigePath + queryString);
    if (!result.ok) {
      const sigeMsg = result.data?.message || result.data?.error || "";
      console.log(`SIGE dep proxy: ${baseEndpoint} failed — SIGE HTTP ${result.status}, msg: ${sigeMsg}`);
      return c.json({
        error: sigeMsg || `SIGE retornou HTTP ${result.status} para /${baseEndpoint}`,
        endpoint: sigePath,
        sigeStatus: result.status,
        ok: false,
        data: result.data,
      }, result.status === 401 ? 401 : 502);
    }
    return c.json({ endpoint: sigePath, sigeStatus: result.status, ok: true, data: result.data });
  } catch (e: any) {
    console.log("SIGE dep proxy exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── SALDO PÚBLICO (Product Stock via SIGE) ──────────
// ═══════════════════════════════════════════════════════

// GET /produtos/saldo/:sku — public endpoint to get stock balance from SIGE
// Uses the stored admin SIGE JWT, no user auth required (only publicAnonKey)
// Caches in KV for 5 minutes to avoid hammering the SIGE API
// Strategy: try direct balance call with SKU as codProduto, fall back to search
app.get(BASE + "/produtos/saldo/:sku", async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku")).trim().substring(0, 100);
    if (!sku) return c.json({ error: "SKU obrigatório.", sku: "", found: false, sige: false, quantidade: 0 });

    const reqUrl = new URL(c.req.url);
    const forceRefresh = reqUrl.searchParams.get("force") === "1";
    // SECURITY: debug mode restricted to admin users only (prevents info disclosure of SIGE internals)
    var _debugAdminOk = false;
    if (reqUrl.searchParams.get("debug") === "1") {
      try { var _dbgChk = await isAdminUser(c.req.raw); _debugAdminOk = _dbgChk.isAdmin; } catch {}
    }
    const debugMode = _debugAdminOk;
    const debugLog: string[] = [];
    const sigeResponses: any[] = [];
    const dbg = (msg: string) => { debugLog.push(msg); console.log(msg); };

    // Global deadline: stop trying strategies after 30s to avoid frontend 45s timeout
    var routeDeadline = Date.now() + 30000;
    var isTimedOut = function () { return Date.now() >= routeDeadline; };

    // Check cache first (5 min TTL)
    const cacheKey = `sige_balance_${sku}`;
    if (!forceRefresh) {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
        const age = Date.now() - (parsed._cachedAt || 0);
        // Shorter TTL for "not found" (2 min) vs found (5 min) to retry sooner
        const ttl = parsed.found ? 5 * 60 * 1000 : 2 * 60 * 1000;
        if (age < ttl) {
          dbg(`[Saldo] Cache hit for SKU ${sku} (age ${Math.round(age/1000)}s, found=${parsed.found})`);
          return c.json({ ...parsed, cached: true, ...(debugMode ? { _debug: debugLog } : {}) });
        }
      }
    } else {
      dbg(`[Saldo] Force refresh for SKU ${sku}, bypassing cache`);
    }

    // Check if SIGE is configured and has a token
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ sku, found: false, sige: false, error: "SIGE não configurado.", quantidade: 0, ...(debugMode ? { _debug: debugLog } : {}) });
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ sku, found: false, sige: false, error: "SIGE não conectado.", quantidade: 0, ...(debugMode ? { _debug: debugLog } : {}) });

    // Helper: extract numeric value from item by trying multiple field names
    const QTD_FIELDS = ["quantidade","qtdSaldo","saldo","saldoFisico","saldoAtual","qtdFisica","qtdEstoque","qtd","estoque","qtde","qtdAtual","qtdTotal","saldoTotal","qtdSaldoFisico","vlSaldo","vlrSaldo"];
    const RES_FIELDS = ["reservado","qtdReservado","qtdReserva","saldoReservado","qtdReservada","vlReservado"];
    const DISP_FIELDS = ["disponivel","qtdDisponivel","saldoDisponivel","qtdDisp","vlDisponivel"];
    function tryFields(item: any, fields: string[]): number {
      for (const k of fields) {
        if (item[k] !== undefined && item[k] !== null && item[k] !== "") {
          const v = Number(item[k]);
          if (!isNaN(v) && v !== 0) return v;
        }
      }
      return 0;
    }
    function tryFieldsIncZero(item: any, fields: string[]): number {
      for (const k of fields) {
        if (item[k] !== undefined && item[k] !== null && item[k] !== "") {
          const v = Number(item[k]);
          if (!isNaN(v)) return v;
        }
      }
      return 0;
    }
    // Fallback: find first numeric field > 0 (not an id/code/page field)
    function autoDetectQtd(item: any): number {
      const skipPatterns = /^(cod|id|num|pagina|qtdRegistro|qtdPagina|grade|divisao|unidade)/i;
      for (const [k, v] of Object.entries(item)) {
        if (typeof v === "number" && v > 0 && !skipPatterns.test(k)) return v;
        if (typeof v === "string" && !isNaN(Number(v)) && Number(v) > 0 && !skipPatterns.test(k)) return Number(v);
      }
      return 0;
    }

    // Helper: parse balance response into structured data
    function parseBalance(balanceData: any): { totalQtd: number; totalRes: number; totalDisp: number; locais: any[]; _balItemKeys?: string[] } {
      let balanceItems: any[] = [];
      if (Array.isArray(balanceData)) {
        balanceItems = balanceData;
      } else if (balanceData?.dados && Array.isArray(balanceData.dados)) {
        balanceItems = balanceData.dados;
      } else if (balanceData?.data && Array.isArray(balanceData.data)) {
        balanceItems = balanceData.data;
      } else if (balanceData?.items && Array.isArray(balanceData.items)) {
        balanceItems = balanceData.items;
      } else if (balanceData?.content && Array.isArray(balanceData.content)) {
        balanceItems = balanceData.content;
      }

      let totalQtd = 0, totalRes = 0, totalDisp = 0;
      const locais: any[] = [];
      const balItemKeys = balanceItems.length > 0 ? Object.keys(balanceItems[0]) : [];
      if (balItemKeys.length > 0) {
        dbg(`[Saldo] parseBalance: ${balanceItems.length} items, keys=[${balItemKeys.join(",")}]`);
      }

      if (balanceItems.length > 0) {
        for (const item of balanceItems) {
          let qtd = tryFields(item, QTD_FIELDS);
          if (qtd === 0) qtd = autoDetectQtd(item);
          const res = tryFieldsIncZero(item, RES_FIELDS);
          const disp = tryFields(item, DISP_FIELDS) || (qtd - res);
          totalQtd += qtd;
          totalRes += res;
          totalDisp += disp;
          locais.push({
            local: item.descLocal || item.nomeLocal || item.localEstoque || item.codLocal || item.local || "Geral",
            filial: item.descFilial || item.nomeFilial || item.codFilial || item.filial || "",
            quantidade: qtd,
            reservado: res,
            disponivel: disp,
          });
        }
      } else if (typeof balanceData === "object" && balanceData !== null && !balanceData.error && !balanceData.message) {
        let qtd = tryFields(balanceData, QTD_FIELDS);
        if (qtd === 0) qtd = autoDetectQtd(balanceData);
        totalQtd = qtd;
        totalRes = tryFieldsIncZero(balanceData, RES_FIELDS);
        totalDisp = tryFields(balanceData, DISP_FIELDS) || (totalQtd - totalRes);
        if (totalQtd === 0) {
          dbg(`[Saldo] parseBalance: object with no recognized qty fields. Keys=[${Object.keys(balanceData).join(",")}]`);
        }
      }

      return { totalQtd, totalRes, totalDisp, locais, _balItemKeys: balItemKeys.length > 0 ? balItemKeys : undefined };
    }

    // Helper: extract products array from SIGE response
    function extractProducts(data: any): any[] {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (data?.dados && Array.isArray(data.dados)) return data.dados;
      if (data?.data && Array.isArray(data.data)) return data.data;
      if (data?.items && Array.isArray(data.items)) return data.items;
      if (data?.content && Array.isArray(data.content)) return data.content;
      if (data?.codProduto || data?.id || data?.descProdutoEst) return [data];
      return [];
    }

    // Helper: try to get balance for a found product
    async function tryBalanceForProduct(p: any, stepLabel: string): Promise<any | null> {
      const possibleIds = [p.id, p.codProduto, p.codigo, p.cod].filter(Boolean);
      const triedIds = new Set<string>();
      for (const pid of possibleIds) {
        const pidStr = String(pid);
        if (triedIds.has(pidStr)) continue;
        triedIds.add(pidStr);
        dbg(`[Saldo] ${stepLabel}: trying balance ID ${pidStr}`);
        const balRes = await sigeAuthFetch("GET", `/product/${encodeURIComponent(pidStr)}/balance`);
        dbg(`[Saldo] ${stepLabel}: balance ID ${pidStr} -> HTTP ${balRes.status}`);
        if (debugMode) sigeResponses.push({ step: `${stepLabel}_bal_${pidStr}`, path: `/product/${pidStr}/balance`, status: balRes.status, ok: balRes.ok, data: balRes.data });
        if (balRes.ok && balRes.data) {
          const { totalQtd, totalRes, totalDisp, locais, _balItemKeys } = parseBalance(balRes.data);
          dbg(`[Saldo] ${stepLabel}: balance parsed: qtd=${totalQtd}, res=${totalRes}, disp=${totalDisp}, itemKeys=${_balItemKeys?.join(",") || "none"}`);
          return {
            sku, found: true, sige: true, sigeId: pidStr,
            descricao: p.descProdutoEst || p.descricao || p.descProduto || "",
            quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
            locais: locais.length > 0 ? locais : undefined,
            _balItemKeys,
            _cachedAt: Date.now(),
          };
        }
      }
      return null;
    }

    // Helper: search SIGE with params, find product, get balance
    async function searchAndGetBalance(queryParams: string, stepLabel: string): Promise<any | null> {
      const searchPath = `/product?${queryParams}`;
      dbg(`[Saldo] ${stepLabel}: GET ${searchPath}`);
      const searchRes = await sigeAuthFetch("GET", searchPath);
      dbg(`[Saldo] ${stepLabel}: HTTP ${searchRes.status}, ok=${searchRes.ok}`);
      if (debugMode) sigeResponses.push({ step: stepLabel, path: searchPath, status: searchRes.status, ok: searchRes.ok, data: searchRes.data });
      if (searchRes.ok && searchRes.data) {
        const products = extractProducts(searchRes.data);
        dbg(`[Saldo] ${stepLabel}: found ${products.length} products. Keys: ${products[0] ? Object.keys(products[0]).slice(0, 8).join(",") : "none"}`);
        if (products.length > 0) {
          const p = products[0];
          // Check if product already has embedded balance data
          const directBal = parseBalance(p);
          if (directBal.totalQtd > 0 || directBal.totalDisp > 0) {
            dbg(`[Saldo] ${stepLabel}: product has embedded balance: qtd=${directBal.totalQtd}, disp=${directBal.totalDisp}`);
            return {
              sku, found: true, sige: true, sigeId: String(p.id || p.codProduto || ""),
              descricao: p.descProdutoEst || p.descricao || p.descProduto || "",
              quantidade: directBal.totalQtd, reservado: directBal.totalRes, disponivel: directBal.totalDisp,
              locais: directBal.locais.length > 0 ? directBal.locais : undefined,
              _cachedAt: Date.now(),
            };
          }
          return await tryBalanceForProduct(p, stepLabel);
        }
      }
      return null;
    }

    // ── Strategy 0: Check saved mapping (sige_map_<sku>) ──
    const mapEntry = await kv.get(`sige_map_${sku}`);
    if (mapEntry) {
      const map = typeof mapEntry === "string" ? JSON.parse(mapEntry) : mapEntry;
      if (map.sigeId) {
        dbg(`[Saldo] S0: Found mapping ${sku} -> SIGE ${map.sigeId} (type: ${map.matchType})`);
        const mapBal = await sigeAuthFetch("GET", `/product/${encodeURIComponent(map.sigeId)}/balance`);
        dbg(`[Saldo] S0: balance for ${map.sigeId} -> HTTP ${mapBal.status}`);
        if (debugMode) sigeResponses.push({ step: "s0_mapping", path: `/product/${map.sigeId}/balance`, status: mapBal.status, ok: mapBal.ok, data: mapBal.data });
        if (mapBal.ok && mapBal.data) {
          const { totalQtd, totalRes, totalDisp, locais, _balItemKeys } = parseBalance(mapBal.data);
          dbg(`[Saldo] S0 found via mapping: qtd=${totalQtd}, disp=${totalDisp}`);
          const result = {
            sku, found: true, sige: true, sigeId: map.sigeId,
            descricao: map.descricao || "",
            quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
            locais: locais.length > 0 ? locais : undefined,
            _balItemKeys,
            _cachedAt: Date.now(),
          };
          await kv.set(cacheKey, JSON.stringify(result));
          return c.json({ ...result, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
        }
      }
    }

    // ── Strategy 1: Direct balance call with original SKU ──
    dbg(`[Saldo] Strategy 1: GET /product/${sku}/balance`);
    const directResult = await sigeAuthFetch("GET", `/product/${encodeURIComponent(sku)}/balance`);
    dbg(`[Saldo] S1: HTTP ${directResult.status}, ok=${directResult.ok}, keys: ${directResult.data ? Object.keys(directResult.data).join(",") : "null"}`);
    if (debugMode) sigeResponses.push({ step: "s1_direct", path: `/product/${sku}/balance`, status: directResult.status, ok: directResult.ok, data: directResult.data });

    if (directResult.ok && directResult.data) {
      const { totalQtd, totalRes, totalDisp, locais, _balItemKeys } = parseBalance(directResult.data);
      dbg(`[Saldo] S1 found: qtd=${totalQtd}, disp=${totalDisp}, itemKeys=${_balItemKeys?.join(",") || "none"}`);
      const result = {
        sku, found: true, sige: true, sigeId: sku,
        quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
        locais: locais.length > 0 ? locais : undefined,
        _balItemKeys,
        _cachedAt: Date.now(),
      };
      await kv.set(cacheKey, JSON.stringify(result));
      return c.json({ ...result, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
    }

    // ── Strategy 2: Search by codProduto (exact SKU) ──
    if (isTimedOut()) { dbg("[Saldo] DEADLINE reached before S2, returning not-found"); var _nf2 = { sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now(), _timedOut: true }; await kv.set(cacheKey, JSON.stringify(_nf2)); return c.json({ ..._nf2, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) }); }
    let found = await searchAndGetBalance(`codProduto=${encodeURIComponent(sku)}&limit=5&offset=1`, "s2_cod");
    if (found) {
      await kv.set(cacheKey, JSON.stringify(found));
      return c.json({ ...found, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
    }

    // ── Strategy 3: If SKU has a dash, try the part before the dash ──
    if (isTimedOut()) { dbg("[Saldo] DEADLINE reached before S3, returning not-found"); var _nf3 = { sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now(), _timedOut: true }; await kv.set(cacheKey, JSON.stringify(_nf3)); return c.json({ ..._nf3, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) }); }
    if (sku.includes("-")) {
      const basePart = sku.split("-")[0];
      dbg(`[Saldo] S3: trying base part "${basePart}" (before dash)`);

      // 3a: Direct balance with base part
      const directBase = await sigeAuthFetch("GET", `/product/${encodeURIComponent(basePart)}/balance`);
      dbg(`[Saldo] S3a: direct /${basePart}/balance -> HTTP ${directBase.status}`);
      if (debugMode) sigeResponses.push({ step: "s3a_direct_base", path: `/product/${basePart}/balance`, status: directBase.status, ok: directBase.ok, data: directBase.data });

      if (directBase.ok && directBase.data) {
        const { totalQtd, totalRes, totalDisp, locais, _balItemKeys } = parseBalance(directBase.data);
        dbg(`[Saldo] S3a found via base "${basePart}": qtd=${totalQtd}, disp=${totalDisp}`);
        const result = {
          sku, found: true, sige: true, sigeId: basePart,
          quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
          locais: locais.length > 0 ? locais : undefined,
          _balItemKeys,
          _cachedAt: Date.now(),
        };
        await kv.set(cacheKey, JSON.stringify(result));
        return c.json({ ...result, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
      }

      // 3b: Search by codProduto with base part
      found = await searchAndGetBalance(`codProduto=${encodeURIComponent(basePart)}&limit=5&offset=1`, "s3b_cod_base");
      if (found) {
        await kv.set(cacheKey, JSON.stringify(found));
        return c.json({ ...found, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
      }
    }

    if (isTimedOut()) { dbg("[Saldo] DEADLINE reached before S4, returning not-found"); var _nf4 = { sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now(), _timedOut: true }; await kv.set(cacheKey, JSON.stringify(_nf4)); return c.json({ ..._nf4, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) }); }
    // ── Strategy 4: Try without dashes/dots/spaces (e.g. "112274376") ──
    const skuClean = sku.replace(/[-.\s]/g, "");
    if (skuClean !== sku && (!sku.includes("-") || skuClean !== sku.split("-")[0])) {
      dbg(`[Saldo] S4: trying cleaned SKU "${skuClean}"`);
      found = await searchAndGetBalance(`codProduto=${encodeURIComponent(skuClean)}&limit=5&offset=1`, "s4_cod_clean");
      if (found) {
        await kv.set(cacheKey, JSON.stringify(found));
        return c.json({ ...found, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
      }
    }

    // ── Strategy 5: Search by referencia ──
    if (isTimedOut()) { dbg("[Saldo] DEADLINE reached before S5, returning not-found"); var _nf5 = { sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now(), _timedOut: true }; await kv.set(cacheKey, JSON.stringify(_nf5)); return c.json({ ..._nf5, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) }); }
    dbg(`[Saldo] S5: searching by referencia="${sku}"`);
    found = await searchAndGetBalance(`referencia=${encodeURIComponent(sku)}&limit=5&offset=1`, "s5_ref");
    if (found) {
      await kv.set(cacheKey, JSON.stringify(found));
      return c.json({ ...found, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
    }

    // ── Strategy 6: Search by description as last resort ──
    if (isTimedOut()) { dbg("[Saldo] DEADLINE reached before S6, returning not-found"); var _nf6 = { sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now(), _timedOut: true }; await kv.set(cacheKey, JSON.stringify(_nf6)); return c.json({ ..._nf6, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) }); }
    dbg(`[Saldo] S6: searching by descProduto="${sku}"`);
    found = await searchAndGetBalance(`descProduto=${encodeURIComponent(sku)}&limit=3&offset=1`, "s6_desc");
    if (found) {
      await kv.set(cacheKey, JSON.stringify(found));
      return c.json({ ...found, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
    }

    // Nothing worked — cache as not found (2 min TTL for not-found to retry sooner)
    dbg(`[Saldo] SKU ${sku}: not found in SIGE after all 6 strategies`);
    const notFound = { sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now() };
    await kv.set(cacheKey, JSON.stringify(notFound));
    return c.json({ ...notFound, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
  } catch (e: any) {
    console.log("[Saldo] Exception for SKU " + sku + ":", e);
    return c.json({ error: "Erro ao consultar saldo.", sku: sku, found: false, sige: false, quantidade: 0 });
  }
});

// DELETE /produtos/saldo/cache — clear all balance cache entries
app.delete(BASE + "/produtos/saldo/cache", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const entries = await kv.getByPrefix("sige_balance_");
    let cleared = 0;
    for (const entry of (entries || [])) {
      if (entry?.key) {
        await kv.del(entry.key);
        cleared++;
      }
    }
    console.log(`[Saldo] Cache cleared: ${cleared} entries by user ${userId}`);
    return c.json({ cleared, message: `${cleared} entradas de cache removidas.` });
  } catch (e: any) {
    console.log("[Saldo] Cache clear exception:", e);
    return c.json({ error: "Erro ao limpar cache de saldo." }, 500);
  }
});

// DELETE /produtos/saldo/cache/:sku — clear cache for a single SKU
app.delete(BASE + "/produtos/saldo/cache/:sku", async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku")).trim().substring(0, 100);
    if (!sku) return c.json({ error: "SKU invalido." }, 400);
    const cacheKey = "sige_balance_" + sku;
    await kv.del(cacheKey);
    console.log("[Saldo] Cache cleared for SKU " + sku);
    return c.json({ cleared: true, sku: sku, message: "Cache para SKU " + sku + " removido." });
  } catch (e: any) {
    console.log("[Saldo] Cache clear exception:", e);
    return c.json({ error: "Erro ao limpar cache de saldo." }, 500);
  }
});

// POST /produtos/saldos — bulk stock balance for multiple SKUs
// OPTIMIZED: batch KV reads, mem-cached config, save mappings, batch KV writes, concurrent workers
app.post(BASE + "/produtos/saldos", async (c) => {
  try {
    const t0 = Date.now();
    const body = await c.req.json();
    // Input validation for bulk balance
    var balValid = validate(body, {
      skus: { required: true, type: "array", maxItems: 50 },
    });
    if (!balValid.ok) {
      return c.json({ error: balValid.errors[0] || "Dados invalidos.", results: [], total: 0 });
    }
    const skus: string[] = body.skus || [];
    if (!Array.isArray(skus) || skus.length === 0) return c.json({ error: "Array 'skus' obrigatório.", results: [], total: 0 });
    // Validate each SKU is a string with reasonable length
    for (var bsi = 0; bsi < skus.length; bsi++) {
      if (typeof skus[bsi] !== "string" || skus[bsi].length > 100) {
        return c.json({ error: "SKU invalido na posicao " + bsi + ".", results: [], total: 0 });
      }
    }

    // Force-refresh: bypass cache when force=true (used by stock validation flows)
    var forceRefresh = body.force === true;

    // Use mem-cached config check
    const sigeConfig = await getSigeConfig();
    if (!sigeConfig) return c.json({ results: skus.map(function(s) { return { sku: s, found: false, sige: false }; }), error: "SIGE não configurado." });
    const sigeToken = await getSigeToken();
    if (!sigeToken) return c.json({ results: skus.map(function(s) { return { sku: s, found: false, sige: false }; }), error: "SIGE não conectado." });

    // Batch-read all cache + mapping keys in parallel
    // CRITICAL FIX: kv.mget() does NOT guarantee order and does NOT return keys,
    // so we query the table directly with key+value and build maps by key (order-safe).
    const balCacheKeys = skus.map(function(s) { return "sige_balance_" + s; });
    const balMapKeys = skus.map(function(s) { return "sige_map_" + s; });
    var allBalKvKeys = balCacheKeys.concat(balMapKeys);
    var balKvResult = await supabaseAdmin
      .from("kv_store_b7b07654")
      .select("key, value")
      .in("key", allBalKvKeys);
    var balKvRows = (balKvResult.data || []) as Array<{ key: string; value: any }>;
    var balKvMap: Record<string, any> = {};
    for (var bri = 0; bri < balKvRows.length; bri++) {
      if (balKvRows[bri] && balKvRows[bri].key) {
        balKvMap[balKvRows[bri].key] = balKvRows[bri].value;
      }
    }

    // Parse cache and mappings — using key-based lookup (order-safe)
    const BALANCE_CACHE_TTL_FOUND = 15 * 60 * 1000; // 15 min
    const BALANCE_CACHE_TTL_MISS = 5 * 60 * 1000;   // 5 min
    const cacheMap: Record<string, any> = {};
    const sigeMapLookup: Record<string, { sigeId: string; descricao: string }> = {};

    for (let i = 0; i < skus.length; i++) {
      // Cache — skip entirely when force-refreshing
      if (!forceRefresh) {
        var balCacheKvKey = "sige_balance_" + skus[i];
        let raw = balKvMap[balCacheKvKey];
        if (raw) {
          if (typeof raw === "object" && raw !== null && (raw as any).value !== undefined) raw = (raw as any).value;
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (parsed && parsed._cachedAt) {
            const age = Date.now() - parsed._cachedAt;
            const ttl = parsed.found ? BALANCE_CACHE_TTL_FOUND : BALANCE_CACHE_TTL_MISS;
            if (age < ttl) { cacheMap[skus[i]] = parsed; }
          }
        }
      }
      // sige_map — lookup by exact key (order-safe)
      var balMapKvKey = "sige_map_" + skus[i];
      let mapRaw = balKvMap[balMapKvKey];
      if (mapRaw) {
        if (typeof mapRaw === "object" && mapRaw !== null && (mapRaw as any).value !== undefined) mapRaw = (mapRaw as any).value;
        const mapParsed = typeof mapRaw === "string" ? JSON.parse(mapRaw) : mapRaw;
        if (mapParsed && mapParsed.sigeId) {
          sigeMapLookup[skus[i]] = { sigeId: mapParsed.sigeId, descricao: mapParsed.descricao || "" };
        }
      }
    }

    // Separate cached results from need-fetch
    const results: any[] = [];
    const needFetch: string[] = [];
    for (const sku of skus) {
      if (cacheMap[sku]) {
        results.push({ ...cacheMap[sku], cached: true });
      } else {
        needFetch.push(sku);
      }
    }

    console.log("[Saldo bulk] cached=" + Object.keys(cacheMap).length + " needFetch=" + needFetch.length + (forceRefresh ? " FORCE" : ""));

    if (needFetch.length > 0) {
      // Helper: parse balance response — expanded field detection
      const bQF = ["quantidade","qtdSaldo","saldo","saldoFisico","saldoAtual","qtdFisica","qtdEstoque","qtd","estoque","qtde","qtdAtual","qtdTotal","saldoTotal","vlSaldo"];
      const bRF = ["reservado","qtdReservado","qtdReserva","saldoReservado","qtdReservada","vlReservado"];
      function bTf(item: any, fields: string[]): number {
        for (const k of fields) { if (item[k] !== undefined && item[k] !== null && item[k] !== "") { const v = Number(item[k]); if (!isNaN(v) && v !== 0) return v; } }
        return 0;
      }
      function bAd(item: any): number {
        const skip = /^(cod|id|num|pagina|qtdRegistro|qtdPagina|grade|divisao|unidade)/i;
        for (const [k, v] of Object.entries(item)) { if (typeof v === "number" && v > 0 && !skip.test(k)) return v; }
        return 0;
      }
      function parseBal(bd: any): { totalQtd: number; totalRes: number; totalDisp: number } {
        let items: any[] = [];
        if (Array.isArray(bd)) items = bd;
        else if (bd && bd.dados && Array.isArray(bd.dados)) items = bd.dados;
        else if (bd && bd.data && Array.isArray(bd.data)) items = bd.data;
        else if (bd && bd.items && Array.isArray(bd.items)) items = bd.items;
        else if (bd && bd.content && Array.isArray(bd.content)) items = bd.content;

        let totalQtd = 0, totalRes = 0, totalDisp = 0;
        if (items.length > 0) {
          for (const it of items) {
            let q = bTf(it, bQF); if (q === 0) q = bAd(it);
            const r = bTf(it, bRF);
            totalQtd += q;
            totalRes += r;
          }
          totalDisp = totalQtd - totalRes;
        } else if (typeof bd === "object" && bd !== null && !bd.error && !bd.message) {
          let q = bTf(bd, bQF); if (q === 0) q = bAd(bd);
          totalQtd = q;
          totalRes = bTf(bd, bRF);
          totalDisp = totalQtd - totalRes;
        }
        return { totalQtd, totalRes, totalDisp };
      }

      function extractProds(data: any): any[] {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (data && data.dados && Array.isArray(data.dados)) return data.dados;
        if (data && data.data && Array.isArray(data.data)) return data.data;
        if (data && data.items && Array.isArray(data.items)) return data.items;
        if (data && data.content && Array.isArray(data.content)) return data.content;
        if (data && (data.codProduto || data.id)) return [data];
        return [];
      }

      // Collect KV writes to batch at the end
      const kvWritesBatch: Array<{ key: string; value: string }> = [];

      // Global time budget: bail out before frontend timeout (40s max)
      var TIME_BUDGET_MS = 38000;
      var PER_SKU_BUDGET_MS = 12000;
      function timeBudgetRemaining(): number { return TIME_BUDGET_MS - (Date.now() - t0); }
      function isTimeBudgetExhausted(): boolean { return timeBudgetRemaining() < 2000; }

      async function fetchOneSku(sku: string): Promise<any> {
        var skuStart = Date.now();
        function skuTimedOut(): boolean { return (Date.now() - skuStart) > PER_SKU_BUDGET_MS || isTimeBudgetExhausted(); }

        // Strategy 0: Use pre-loaded sige_map
        const mapInfo = sigeMapLookup[sku];
        if (mapInfo) {
          const balRes = await sigeAuthFetch("GET", "/product/" + encodeURIComponent(mapInfo.sigeId) + "/balance");
          if (balRes.ok && balRes.data) {
            const { totalQtd, totalRes, totalDisp } = parseBal(balRes.data);
            const r = {
              sku: sku, found: true, sige: true, sigeId: mapInfo.sigeId,
              descricao: mapInfo.descricao,
              quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
              _cachedAt: Date.now(),
            };
            kvWritesBatch.push({ key: "sige_balance_" + sku, value: JSON.stringify(r) });
            return { ...r, cached: false };
          }
        }

        // Strategy 1: Direct balance with SKU as product ID
        if (skuTimedOut()) { var _to1 = { sku: sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now(), timedOut: true }; return { ..._to1, cached: false }; }
        const directRes = await sigeAuthFetch("GET", "/product/" + encodeURIComponent(sku) + "/balance");
        if (directRes.ok && directRes.data) {
          const { totalQtd, totalRes, totalDisp } = parseBal(directRes.data);
          const r = {
            sku: sku, found: true, sige: true, sigeId: sku,
            quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
            _cachedAt: Date.now(),
          };
          kvWritesBatch.push({ key: "sige_balance_" + sku, value: JSON.stringify(r) });
          // Also save mapping for future lookups
          if (!mapInfo) {
            kvWritesBatch.push({ key: "sige_map_" + sku, value: JSON.stringify({ sigeId: sku, descricao: "" }) });
          }
          return { ...r, cached: false };
        }

        // Strategy 2: Search by codProduto (exact SKU)
        if (skuTimedOut()) { var _to2 = { sku: sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now(), timedOut: true }; return { ..._to2, cached: false }; }
        const searchRes = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(sku) + "&limit=1&offset=1");
        if (searchRes.ok && searchRes.data) {
          const prods = extractProds(searchRes.data);
          if (prods.length > 0) {
            const p = prods[0];
            const ids = [p.id, p.codProduto, p.codigo, p.cod].filter(Boolean);
            const tried = new Set<string>();
            for (const pid of ids) {
              const pidStr = String(pid);
              if (tried.has(pidStr) || pidStr === sku) continue;
              tried.add(pidStr);
              const balRes = await sigeAuthFetch("GET", "/product/" + encodeURIComponent(pidStr) + "/balance");
              if (balRes.ok && balRes.data) {
                const { totalQtd, totalRes, totalDisp } = parseBal(balRes.data);
                const desc = p.descProdutoEst || p.descricao || p.descProduto || "";
                const r = {
                  sku: sku, found: true, sige: true, sigeId: pidStr,
                  descricao: desc,
                  quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
                  _cachedAt: Date.now(),
                };
                kvWritesBatch.push({ key: "sige_balance_" + sku, value: JSON.stringify(r) });
                kvWritesBatch.push({ key: "sige_map_" + sku, value: JSON.stringify({ sigeId: pidStr, descricao: desc }) });
                return { ...r, cached: false };
              }
            }
          }
        }

        // Strategy 3: If SKU has a dash, try the part before the dash (skip if running low on time)
        if (skuTimedOut()) { var _to3 = { sku: sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now(), timedOut: true }; return { ..._to3, cached: false }; }
        if (sku.indexOf("-") !== -1) {
          const basePart = sku.split("-")[0];
          const directBase = await sigeAuthFetch("GET", "/product/" + encodeURIComponent(basePart) + "/balance");
          if (directBase.ok && directBase.data) {
            const { totalQtd, totalRes, totalDisp } = parseBal(directBase.data);
            const r = {
              sku: sku, found: true, sige: true, sigeId: basePart,
              quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
              _cachedAt: Date.now(),
            };
            kvWritesBatch.push({ key: "sige_balance_" + sku, value: JSON.stringify(r) });
            kvWritesBatch.push({ key: "sige_map_" + sku, value: JSON.stringify({ sigeId: basePart, descricao: "" }) });
            return { ...r, cached: false };
          }
          const searchBase = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(basePart) + "&limit=1&offset=1");
          if (searchBase.ok && searchBase.data) {
            const prods = extractProds(searchBase.data);
            if (prods.length > 0) {
              const p = prods[0];
              const ids = [p.id, p.codProduto, p.codigo, p.cod].filter(Boolean);
              for (const pid of ids) {
                const pidStr = String(pid);
                const balRes = await sigeAuthFetch("GET", "/product/" + encodeURIComponent(pidStr) + "/balance");
                if (balRes.ok && balRes.data) {
                  const { totalQtd, totalRes, totalDisp } = parseBal(balRes.data);
                  const desc = p.descProdutoEst || p.descricao || p.descProduto || "";
                  const r = {
                    sku: sku, found: true, sige: true, sigeId: pidStr,
                    descricao: desc,
                    quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
                    _cachedAt: Date.now(),
                  };
                  kvWritesBatch.push({ key: "sige_balance_" + sku, value: JSON.stringify(r) });
                  kvWritesBatch.push({ key: "sige_map_" + sku, value: JSON.stringify({ sigeId: pidStr, descricao: desc }) });
                  return { ...r, cached: false };
                }
              }
            }
          }
        }

        const nf = { sku: sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now() };
        kvWritesBatch.push({ key: "sige_balance_" + sku, value: JSON.stringify(nf) });
        return { ...nf, cached: false };
      }

      // Run with concurrent workers (max 5 — reduced to avoid overwhelming SIGE API)
      const CONC_LIMIT = 5;
      let fetchIdx = 0;
      const fetchedResults: any[] = [];

      async function runWorker(): Promise<void> {
        while (fetchIdx < needFetch.length) {
          // Check global time budget before starting next SKU
          if (isTimeBudgetExhausted()) {
            // Mark remaining SKUs as timed out
            while (fetchIdx < needFetch.length) {
              var _timedIdx = fetchIdx;
              fetchIdx++;
              fetchedResults.push({ sku: needFetch[_timedIdx], found: false, sige: true, quantidade: 0, timedOut: true, cached: false });
            }
            break;
          }
          const myIdx = fetchIdx;
          fetchIdx++;
          try {
            const r = await fetchOneSku(needFetch[myIdx]);
            fetchedResults.push(r);
          } catch (ex: any) {
            console.log("[Saldo bulk] Error for SKU " + needFetch[myIdx] + ": " + (ex.message || ex));
            fetchedResults.push({ sku: needFetch[myIdx], found: false, sige: true, quantidade: 0, error: ex.message });
          }
        }
      }

      const workers: Promise<void>[] = [];
      for (let wi = 0; wi < Math.min(CONC_LIMIT, needFetch.length); wi++) {
        workers.push(runWorker());
      }
      await Promise.all(workers);

      for (const fr of fetchedResults) {
        results.push(fr);
      }

      // Batch write all KV entries at once
      if (kvWritesBatch.length > 0) {
        const batchKeys: string[] = [];
        const batchVals: string[] = [];
        for (const entry of kvWritesBatch) {
          batchKeys.push(entry.key);
          batchVals.push(entry.value);
        }
        kv.mset(batchKeys, batchVals).catch(function(e) { console.log("[Saldo bulk] mset error:", e); });
      }
    }

    const elapsed = Date.now() - t0;
    var timedOutCount = results.filter(function(r) { return r.timedOut; }).length;
    console.log("[Saldo bulk] Processed " + results.length + " SKUs, found=" + results.filter(function(r) { return r.found; }).length + " cached=" + results.filter(function(r) { return r.cached; }).length + " timedOut=" + timedOutCount + " elapsed=" + elapsed + "ms");
    return c.json({ results: results, total: results.length, partial: timedOutCount > 0 });
  } catch (e: any) {
    console.log("[Saldo bulk] Exception:", e);
    return c.json({ error: "Erro ao consultar saldo.", results: [], total: 0 });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── STOCK SUMMARY (global count across ALL products) ────
// ═══════════════════════════════════════════════════════════

// GET /produtos/stock-summary — returns global stock counts by reading all cached balance entries
app.get(BASE + "/produtos/stock-summary", async (c) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) return c.json({ error: "Configuracao incompleta." }, 500);

    // 1) Check if we have a recent cached summary (TTL 30s)
    const SUMMARY_CACHE_KEY = "stock_summary_cache";
    const cachedSummary = await kv.get(SUMMARY_CACHE_KEY);
    if (cachedSummary) {
      const parsed = typeof cachedSummary === "string" ? JSON.parse(cachedSummary) : cachedSummary;
      if (parsed._cachedAt && Date.now() - parsed._cachedAt < 30_000) {
        return c.json({ ...parsed, cached: true });
      }
    }

    // 2) Get ALL product SKUs from "produtos" table
    const headers = { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` };
    const allSkus: string[] = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/produtos?select=sku&order=sku.asc&offset=${offset}&limit=${batchSize}`,
        { headers: { ...headers, "Prefer": "count=exact" } }
      );
      const batch = await resp.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const row of batch) { if (row.sku) allSkus.push(row.sku); }
      if (batch.length < batchSize) break;
      offset += batchSize;
    }
    const totalProducts = allSkus.length;

    // 3) Get ALL cached balance entries via prefix scan
    const supabaseSrv = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: balanceRows, error: balErr } = await supabaseSrv
      .from("kv_store_b7b07654")
      .select("key, value")
      .like("key", "sige_balance_%");
    if (balErr) {
      console.log("[StockSummary] Error fetching balance cache:", balErr.message);
      return c.json({ error: "Erro ao consultar saldos de estoque." }, 500);
    }

    const balanceMap = new Map<string, any>();
    for (const row of (balanceRows || [])) {
      const sku = row.key.replace("sige_balance_", "");
      let val = row.value;
      if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
      balanceMap.set(sku, val);
    }

    // 4) Count stats for ALL products
    let inStock = 0, outOfStock = 0, notFound = 0, pending = 0;
    for (const sku of allSkus) {
      const bal = balanceMap.get(sku);
      if (!bal) { pending++; continue; }
      const age = Date.now() - (bal._cachedAt || 0);
      const ttl = bal.found ? 5 * 60 * 1000 : 2 * 60 * 1000;
      if (age > ttl) { pending++; continue; }
      if (!bal.found) { notFound++; continue; }
      const avail = Number(bal.disponivel ?? bal.quantidade ?? 0);
      if (avail > 0) inStock++; else outOfStock++;
    }

    const summary = { totalProducts, inStock, outOfStock, notFound, pending, totalCached: balanceMap.size, _cachedAt: Date.now() };
    await kv.set(SUMMARY_CACHE_KEY, JSON.stringify(summary));
    console.log(`[StockSummary] total=${totalProducts}, inStock=${inStock}, outOfStock=${outOfStock}, notFound=${notFound}, pending=${pending}`);
    return c.json({ ...summary, cached: false });
  } catch (e: any) {
    console.log("[StockSummary] Exception:", e);
    return c.json({ error: "Erro ao calcular resumo de estoque." }, 500);
  }
});

// POST /produtos/stock-scan — trigger balance scan for uncached/expired SKUs in batches
app.post(BASE + "/produtos/stock-scan", async (c) => {
  try {
    var stockScanUserId = await getAuthUserId(c.req.raw);
    if (!stockScanUserId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json().catch(() => ({}));
    // Input validation for stock-scan
    var sscValid = validate(body, {
      batchSize: { type: "number", min: 1, max: 50 },
    });
    if (!sscValid.ok) return c.json({ error: sscValid.errors[0] || "Dados invalidos." }, 400);
    const batchSize = Math.min(Number(body.batchSize) || 50, 50);

    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ error: "SIGE não configurado." });
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ error: "SIGE não conectado." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const headers = { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` };
    const allSkus: string[] = [];
    let offset = 0;
    while (true) {
      const resp = await fetch(`${supabaseUrl}/rest/v1/produtos?select=sku&order=sku.asc&offset=${offset}&limit=1000`, { headers });
      const batch = await resp.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const row of batch) { if (row.sku) allSkus.push(row.sku); }
      if (batch.length < 1000) break;
      offset += 1000;
    }

    const supabaseSrv = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: balanceRows } = await supabaseSrv.from("kv_store_b7b07654").select("key, value").like("key", "sige_balance_%");
    const balanceMap = new Map<string, any>();
    for (const row of (balanceRows || [])) {
      const sku = row.key.replace("sige_balance_", "");
      let val = row.value;
      if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
      balanceMap.set(sku, val);
    }

    const pendingSkus: string[] = [];
    for (const sku of allSkus) {
      const bal = balanceMap.get(sku);
      if (!bal) { pendingSkus.push(sku); continue; }
      const age = Date.now() - (bal._cachedAt || 0);
      const ttl = bal.found ? 5 * 60 * 1000 : 2 * 60 * 1000;
      if (age > ttl) pendingSkus.push(sku);
    }

    if (pendingSkus.length === 0) {
      await kv.del("stock_summary_cache");
      return c.json({ scanned: 0, remaining: 0, message: "Todos os produtos já estão no cache." });
    }

    const toProcess = pendingSkus.slice(0, batchSize);

    const sQF = ["quantidade","qtdSaldo","saldo","saldoFisico","saldoAtual","qtdFisica","qtdEstoque","qtd","estoque","qtde","qtdAtual","qtdTotal","saldoTotal","vlSaldo"];
    const sRF = ["reservado","qtdReservado","qtdReserva","saldoReservado","qtdReservada","vlReservado"];
    function sTf(item: any, fields: string[]): number {
      for (const k of fields) { if (item[k] !== undefined && item[k] !== null && item[k] !== "") { const v = Number(item[k]); if (!isNaN(v) && v !== 0) return v; } }
      return 0;
    }
    function sAd(item: any): number {
      const skip = /^(cod|id|num|pagina|qtdRegistro|qtdPagina|grade|divisao|unidade)/i;
      for (const [k, v] of Object.entries(item)) { if (typeof v === "number" && v > 0 && !skip.test(k)) return v; }
      return 0;
    }
    function parseBal(bd: any): { totalQtd: number; totalRes: number; totalDisp: number } {
      let items: any[] = [];
      if (Array.isArray(bd)) items = bd;
      else if (bd?.dados && Array.isArray(bd.dados)) items = bd.dados;
      else if (bd?.data && Array.isArray(bd.data)) items = bd.data;
      else if (bd?.items && Array.isArray(bd.items)) items = bd.items;
      else if (bd?.content && Array.isArray(bd.content)) items = bd.content;
      let totalQtd = 0, totalRes = 0, totalDisp = 0;
      if (items.length > 0) {
        for (const it of items) {
          let q = sTf(it, sQF); if (q === 0) q = sAd(it);
          const r = sTf(it, sRF);
          totalQtd += q;
          totalRes += r;
        }
        totalDisp = totalQtd - totalRes;
      } else if (typeof bd === "object" && bd !== null && !bd.error && !bd.message) {
        let q = sTf(bd, sQF); if (q === 0) q = sAd(bd);
        totalQtd = q;
        totalRes = sTf(bd, sRF);
        totalDisp = totalQtd - totalRes;
      }
      return { totalQtd, totalRes, totalDisp };
    }

    function extractProds(data: any): any[] {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (data?.dados && Array.isArray(data.dados)) return data.dados;
      if (data?.data && Array.isArray(data.data)) return data.data;
      if (data?.items && Array.isArray(data.items)) return data.items;
      if (data?.content && Array.isArray(data.content)) return data.content;
      if (data?.codProduto || data?.id) return [data];
      return [];
    }

    async function tryBalForProduct(p: any, sku: string, skipId?: string): Promise<any | null> {
      const ids = [p.id, p.codProduto, p.codigo, p.cod].filter(Boolean);
      const tried = new Set<string>();
      for (const pid of ids) {
        const pidStr = String(pid);
        if (tried.has(pidStr) || pidStr === skipId) continue;
        tried.add(pidStr);
        const balRes = await sigeAuthFetch("GET", `/product/${encodeURIComponent(pidStr)}/balance`);
        if (balRes.ok && balRes.data) {
          const { totalQtd, totalRes, totalDisp } = parseBal(balRes.data);
          return { sku, found: true, sige: true, sigeId: pidStr, descricao: p.descProdutoEst || p.descricao || p.descProduto || "", quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp, _cachedAt: Date.now() };
        }
      }
      return null;
    }

    async function fetchOneSku(sku: string): Promise<any> {
      // Check saved mapping first
      const mapE = await kv.get(`sige_map_${sku}`);
      if (mapE) {
        const mp = typeof mapE === "string" ? JSON.parse(mapE) : mapE;
        if (mp.sigeId) {
          const balR = await sigeAuthFetch("GET", `/product/${encodeURIComponent(mp.sigeId)}/balance`);
          if (balR.ok && balR.data) {
            const { totalQtd, totalRes, totalDisp } = parseBal(balR.data);
            return { sku, found: true, sige: true, sigeId: mp.sigeId, descricao: mp.descricao || "", quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp, _cachedAt: Date.now() };
          }
        }
      }
      const directRes = await sigeAuthFetch("GET", `/product/${encodeURIComponent(sku)}/balance`);
      if (directRes.ok && directRes.data) {
        const { totalQtd, totalRes, totalDisp } = parseBal(directRes.data);
        return { sku, found: true, sige: true, sigeId: sku, quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp, _cachedAt: Date.now() };
      }
      const searchRes = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(sku)}&limit=1&offset=1`);
      if (searchRes.ok && searchRes.data) {
        const prods = extractProds(searchRes.data);
        if (prods.length > 0) {
          const result = await tryBalForProduct(prods[0], sku, sku);
          if (result) return result;
        }
      }
      if (sku.includes("-")) {
        const basePart = sku.split("-")[0];
        const directBase = await sigeAuthFetch("GET", `/product/${encodeURIComponent(basePart)}/balance`);
        if (directBase.ok && directBase.data) {
          const { totalQtd, totalRes, totalDisp } = parseBal(directBase.data);
          return { sku, found: true, sige: true, sigeId: basePart, quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp, _cachedAt: Date.now() };
        }
        const searchBase = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(basePart)}&limit=1&offset=1`);
        if (searchBase.ok && searchBase.data) {
          const prods = extractProds(searchBase.data);
          if (prods.length > 0) {
            const result = await tryBalForProduct(prods[0], sku);
            if (result) return result;
          }
        }
      }
      return { sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now() };
    }

    const results: any[] = [];
    const PARALLEL = 5;
    for (let i = 0; i < toProcess.length; i += PARALLEL) {
      const batch = toProcess.slice(i, i + PARALLEL);
      const batchResults = await Promise.all(
        batch.map(async (sku) => {
          try {
            const result = await fetchOneSku(sku);
            await kv.set(`sige_balance_${sku}`, JSON.stringify(result));
            return result;
          } catch (ex: any) {
            console.log(`[StockScan] Error for ${sku}:`, ex.message);
            return { sku, found: false, sige: true, error: ex.message };
          }
        })
      );
      results.push(...batchResults);
    }

    await kv.del("stock_summary_cache");
    const found = results.filter((r) => r.found).length;
    console.log(`[StockScan] Scanned ${results.length}, found=${found}, remaining=${pendingSkus.length - toProcess.length}`);
    return c.json({ scanned: results.length, found, remaining: pendingSkus.length - toProcess.length, totalPending: pendingSkus.length, results });
  } catch (e: any) {
    console.log("[StockScan] Exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// ─── SIGE PRODUCT MAPPING (match local SKUs ↔ SIGE IDs) ──
// ═══════════════════════════════════════════════════════════

// GET /produtos/sige-map — list all mappings
app.get(BASE + "/produtos/sige-map", async (c) => {
  try {
    const entries = await kv.getByPrefix("sige_map_");
    const mappings: any[] = [];
    for (const entry of (entries || [])) {
      if (!entry) continue;
      let val = entry;
      if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
      if (val && typeof val === "object" && (val.sku || val.sigeId)) {
        mappings.push(val);
      }
    }
    return c.json({ mappings, total: mappings.length });
  } catch (e: any) {
    console.log("[SigeMap] GET exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// PUT /produtos/sige-map/:sku — manually map a local SKU to a SIGE product ID
app.put(BASE + "/produtos/sige-map/:sku", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const sku = decodeURIComponent(c.req.param("sku")).trim();
    if (!sku || sku.length > 100) return c.json({ error: "SKU invalido." }, 400);
    const body = await c.req.json();
    // Input validation for sige-map
    var smValid = validate(body, {
      sigeId: { required: true, type: "string", minLen: 1, maxLen: 100 },
    });
    if (!smValid.ok) return c.json({ error: smValid.errors[0] || "sigeId obrigatório." }, 400);
    const sigeId = String(smValid.sanitized.sigeId || "").trim();
    if (!sigeId) return c.json({ error: "sigeId obrigatório." }, 400);
    const mapping = {
      sku,
      sigeId,
      codProduto: body.codProduto || sigeId,
      descricao: body.descricao || "",
      matchType: "manual",
      matchedAt: Date.now(),
      matchedBy: userId,
    };
    await kv.set(`sige_map_${sku}`, JSON.stringify(mapping));
    await kv.del(`sige_balance_${sku}`);
    console.log(`[SigeMap] Manual mapping: ${sku} -> SIGE ${sigeId} by user ${userId}`);
    return c.json({ ok: true, sku, mapping });
  } catch (e: any) {
    console.log("[SigeMap] PUT exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// DELETE /produtos/sige-map/:sku — remove mapping for a SKU
app.delete(BASE + "/produtos/sige-map/:sku", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const sku = decodeURIComponent(c.req.param("sku")).trim().substring(0, 100);
    if (!sku) return c.json({ error: "SKU invalido." }, 400);
    await kv.del(`sige_map_${sku}`);
    await kv.del(`sige_balance_${sku}`);
    return c.json({ ok: true, sku, message: `Mapeamento para ${sku} removido.` });
  } catch (e: any) {
    console.log("[SigeMap] DELETE exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// POST /produtos/sige-sync — auto-match local products with SIGE products
app.post(BASE + "/produtos/sige-sync", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json().catch(() => ({}));
    // Input validation for sige-sync
    var sigeSyncValid = validate(body, {
      fetchBalances: { type: "boolean" },
      clearExisting: { type: "boolean" },
      batchSize: { type: "number", min: 1, max: 500 },
    });
    if (!sigeSyncValid.ok) return c.json({ error: sigeSyncValid.errors[0] || "Dados invalidos." }, 400);
    const fetchBal = body.fetchBalances !== false;
    const clearExisting = body.clearExisting === true;
    const pgSize = Math.min(Number(body.batchSize) || 500, 500);
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ error: "SIGE não configurado." });
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ error: "SIGE não conectado." });
    console.log(`[SigeSync] Starting. fetchBal=${fetchBal}, clear=${clearExisting}`);

    // 1) Load local product SKUs
    const sUrl = Deno.env.get("SUPABASE_URL")!;
    const sKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const dbH = { "apikey": sKey, "Authorization": `Bearer ${sKey}` };
    const localProds: { sku: string; titulo: string }[] = [];
    let dOff = 0;
    while (true) {
      const resp = await fetch(`${sUrl}/rest/v1/produtos?select=sku,titulo&order=sku.asc&offset=${dOff}&limit=1000`, { headers: dbH });
      const batch = await resp.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const row of batch) { if (row.sku) localProds.push({ sku: row.sku, titulo: row.titulo || "" }); }
      if (batch.length < 1000) break;
      dOff += 1000;
    }
    console.log(`[SigeSync] ${localProds.length} local products`);

    // 2) Load ALL SIGE products
    const sigeProd: any[] = [];
    let sOff = 1; let pg = 0;
    while (true) {
      pg++;
      const res = await sigeAuthFetch("GET", `/product?limit=${pgSize}&offset=${sOff}`);
      if (!res.ok) { console.log(`[SigeSync] SIGE fetch fail at offset ${sOff}`); break; }
      let items: any[] = [];
      const d = res.data;
      if (Array.isArray(d)) items = d;
      else if (d?.dados && Array.isArray(d.dados)) items = d.dados;
      else if (d?.data && Array.isArray(d.data)) items = d.data;
      else if (d?.items && Array.isArray(d.items)) items = d.items;
      else if (d?.content && Array.isArray(d.content)) items = d.content;
      if (items.length === 0) break;
      sigeProd.push(...items);
      console.log(`[SigeSync] Page ${pg}: ${items.length} (total: ${sigeProd.length})`);
      if (items.length < pgSize) break;
      sOff += pgSize;
    }
    console.log(`[SigeSync] ${sigeProd.length} SIGE products loaded`);

    // 3) Build SIGE lookups
    const sigeByCod = new Map<string, any>();
    const sigeByIdM = new Map<string, any>();
    for (const sp of sigeProd) {
      const cod = String(sp.codProduto || "").toLowerCase();
      const sid = String(sp.id || "");
      if (cod) {
        sigeByCod.set(cod, sp);
        sigeByCod.set(cod.replace(/^0+/, ""), sp);
        sigeByCod.set(cod.replace(/[-.\/\s]/g, ""), sp);
      }
      if (sid) sigeByIdM.set(sid, sp);
    }

    // 4) Clear existing if requested
    if (clearExisting) {
      let cleared = 0;
      for (const lp of localProds) {
        try { await kv.del(`sige_map_${lp.sku}`); cleared++; } catch {}
      }
      console.log(`[SigeSync] Cleared mappings for ${cleared} local SKUs`);
    }

    // 5) Match
    let matched = 0, unmatched = 0, skipped = 0;
    const matchRes: any[] = [];
    const newMaps: { sku: string; sigeId: string; codProduto: string; descricao: string; matchType: string }[] = [];
    for (const lp of localProds) {
      const sku = lp.sku;
      const skuL = sku.toLowerCase();
      const skuC = skuL.replace(/[-.\/\s]/g, "");
      const skuNZ = skuL.replace(/^0+/, "");
      if (!clearExisting) {
        const exm = await kv.get(`sige_map_${sku}`);
        if (exm) { skipped++; continue; }
      }
      let mp: any = null; let mt = "";
      if (sigeByCod.has(skuL)) { mp = sigeByCod.get(skuL); mt = "exact_cod"; }
      else if (sigeByCod.has(skuC)) { mp = sigeByCod.get(skuC); mt = "clean_cod"; }
      else if (skuNZ !== skuL && sigeByCod.has(skuNZ)) { mp = sigeByCod.get(skuNZ); mt = "no_zeros"; }
      else if (sigeByIdM.has(sku)) { mp = sigeByIdM.get(sku); mt = "sige_id"; }
      else if (sku.includes("-")) {
        const bp = sku.split("-")[0].toLowerCase();
        if (sigeByCod.has(bp)) { mp = sigeByCod.get(bp); mt = "base_dash"; }
      }
      if (mp) {
        const sigeId = String(mp.id || mp.codProduto || "");
        const codP = String(mp.codProduto || "");
        const desc = mp.descProdutoEst || mp.descricao || mp.descProduto || "";
        await kv.set(`sige_map_${sku}`, JSON.stringify({ sku, sigeId, codProduto: codP, descricao: desc, matchType: mt, matchedAt: Date.now() }));
        newMaps.push({ sku, sigeId, codProduto: codP, descricao: desc, matchType: mt });
        matched++;
        matchRes.push({ sku, matched: true, matchType: mt, sigeId, codProduto: codP, descricao: desc.substring(0, 60) });
      } else {
        unmatched++;
        matchRes.push({ sku, matched: false, titulo: lp.titulo.substring(0, 60) });
      }
    }
    console.log(`[SigeSync] Match: ${matched} matched, ${unmatched} unmatched, ${skipped} skipped`);

    // 6) Fetch balances for matched
    let balFetched = 0;
    if (fetchBal && newMaps.length > 0) {
      const qF = ["quantidade","qtdSaldo","saldo","saldoFisico","saldoAtual","qtdFisica","qtdEstoque","qtd","estoque","qtde","qtdAtual","qtdTotal","saldoTotal","vlSaldo"];
      const rF = ["reservado","qtdReservado","qtdReserva","saldoReservado","qtdReservada","vlReservado"];
      function stf(item: any, fields: string[]): number {
        for (const k of fields) { if (item[k] !== undefined && item[k] !== null && item[k] !== "") { const v = Number(item[k]); if (!isNaN(v) && v !== 0) return v; } } return 0;
      }
      function sad(item: any): number {
        const skip = /^(cod|id|num|pagina|qtdRegistro|qtdPagina|grade|divisao|unidade)/i;
        for (const [k, v] of Object.entries(item)) { if (typeof v === "number" && v > 0 && !skip.test(k)) return v; } return 0;
      }
      function spb(bd: any): { tQ: number; tR: number; tD: number } {
        let items: any[] = [];
        if (Array.isArray(bd)) items = bd;
        else if (bd?.dados && Array.isArray(bd.dados)) items = bd.dados;
        else if (bd?.data && Array.isArray(bd.data)) items = bd.data;
        else if (bd?.items && Array.isArray(bd.items)) items = bd.items;
        else if (bd?.content && Array.isArray(bd.content)) items = bd.content;
        let tQ = 0, tR = 0, tD = 0;
        if (items.length > 0) {
          for (const it of items) { let q = stf(it, qF); if (q === 0) q = sad(it); tQ += q; tR += stf(it, rF); }
          tD = tQ - tR;
        } else if (typeof bd === "object" && bd !== null && !bd.error && !bd.message) {
          let q = stf(bd, qF); if (q === 0) q = sad(bd); tQ = q; tR = stf(bd, rF); tD = tQ - tR;
        }
        return { tQ, tR, tD };
      }
      const PAR = 5;
      for (let i = 0; i < newMaps.length; i += PAR) {
        const batch = newMaps.slice(i, i + PAR);
        await Promise.all(batch.map(async (m) => {
          try {
            const balR = await sigeAuthFetch("GET", `/product/${encodeURIComponent(m.sigeId)}/balance`);
            if (balR.ok && balR.data) {
              const { tQ, tR, tD } = spb(balR.data);
              await kv.set(`sige_balance_${m.sku}`, JSON.stringify({
                sku: m.sku, found: true, sige: true, sigeId: m.sigeId, descricao: m.descricao,
                quantidade: tQ, reservado: tR, disponivel: tD, _cachedAt: Date.now(),
              }));
              balFetched++;
            }
          } catch (ex: any) { console.log(`[SigeSync] Bal error ${m.sku}:`, ex.message); }
        }));
      }
      console.log(`[SigeSync] Fetched ${balFetched} balances`);
    }
    await kv.del("stock_summary_cache");
    return c.json({
      ok: true, localProducts: localProds.length, sigeProducts: sigeProd.length,
      matched, unmatched, skipped, balanceFetched: balFetched,
      matchResults: matchRes.slice(0, 200), totalResults: matchRes.length,
    });
  } catch (e: any) {
    console.log("[SigeSync] Exception:", e);
    return c.json({ error: "Erro na sincronizacao SIGE." }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── PREÇOS (Price from SIGE + custom override) ──────
// ═══════════════════════════════════════════════════════

// GET /price-config — global price tier configuration
app.get(BASE + "/price-config", async (c) => {
  try {
    const raw = await kv.get("price_config");
    const config = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : { tier: "v2", showPrice: true, pixDiscountEnabled: false, pixDiscountPercent: 5 };
    // Ensure pix discount fields exist in response
    if (config.pixDiscountEnabled === undefined) config.pixDiscountEnabled = false;
    if (config.pixDiscountPercent === undefined) config.pixDiscountPercent = 5;
    if (config.installmentsCount === undefined) config.installmentsCount = 0;
    if (config.installmentsMinValue === undefined) config.installmentsMinValue = 0;
    return c.json(config);
  } catch (e: any) {
    console.log("[PriceConfig] GET exception:", e);
    return c.json({ error: "Erro ao buscar configuracao de precos." }, 500);
  }
});

// PUT /price-config — save global price tier (admin)
app.put(BASE + "/price-config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    // Input validation for price config
    var pcValid = validate(body, {
      tier: { type: "string", maxLen: 20 },
      showPrice: { type: "boolean" },
      pixDiscountEnabled: { type: "boolean" },
      pixDiscountPercent: { type: "number", min: 0, max: 100 },
      installmentsCount: { type: "number", min: 0, max: 48 },
      installmentsMinValue: { type: "number", min: 0, max: 99999999 },
    });
    if (!pcValid.ok) return c.json({ error: pcValid.errors[0] || "Dados invalidos." }, 400);
    const config: any = {
      tier: body.tier || "v2",
      showPrice: body.showPrice !== false,
      pixDiscountEnabled: body.pixDiscountEnabled === true,
      pixDiscountPercent: typeof body.pixDiscountPercent === "number" ? body.pixDiscountPercent : 5,
      installmentsCount: typeof body.installmentsCount === "number" ? body.installmentsCount : 0,
      installmentsMinValue: typeof body.installmentsMinValue === "number" ? body.installmentsMinValue : 0,
      updatedAt: Date.now(),
      updatedBy: userId,
    };
    // Preserve list price mapping if provided
    if (body.listPriceMapping && typeof body.listPriceMapping === "object") {
      config.listPriceMapping = body.listPriceMapping;
    }
    await kv.set("price_config", JSON.stringify(config));
    memClear("_price_config"); // invalidate in-memory cache
    invalidateHomepageCache();
    console.log("[PriceConfig] Updated by " + userId + ": tier=" + config.tier + ", showPrice=" + config.showPrice + ", pixDiscount=" + config.pixDiscountEnabled + "/" + config.pixDiscountPercent + "%, installments=" + config.installmentsCount);
    return c.json(config);
  } catch (e: any) {
    console.log("[PriceConfig] PUT exception:", e);
    return c.json({ error: "Erro ao salvar configuracao de preco." }, 500);
  }
});

// PUT /produtos/preco/:sku — set custom price for a product (admin)
app.put(BASE + "/produtos/preco/:sku", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const sku = decodeURIComponent(c.req.param("sku")).trim();
    if (sku.length > 100) return c.json({ error: "SKU invalido." }, 400);
    const body = await c.req.json();
    // Input validation for custom price
    var cpValid = validate(body, {
      price: { required: true, type: "number", min: 0, max: 99999999 },
    });
    if (!cpValid.ok) return c.json({ error: cpValid.errors[0] || "Preço inválido." }, 400);
    const customPrice = Number(cpValid.sanitized.price);
    if (isNaN(customPrice) || customPrice < 0) return c.json({ error: "Preço inválido." }, 400);
    const entry = { sku, price: customPrice, source: "custom", updatedAt: Date.now(), updatedBy: userId };
    await kv.set("price_custom_" + sku, JSON.stringify(entry));
    // Also clear old key format and cache
    await kv.del("product_price_" + sku);
    await kv.del("sige_price_" + sku);
    console.log("[Price] Custom price set for " + sku + ": R$" + customPrice.toFixed(2) + " by " + userId);
    return c.json({ ok: true, sku, price: customPrice });
  } catch (e: any) {
    console.log("[Price] PUT custom exception:", e);
    return c.json({ error: "Erro ao salvar preco customizado." }, 500);
  }
});

// DELETE /produtos/preco/:sku — remove custom price (admin)
app.delete(BASE + "/produtos/preco/:sku", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const sku = decodeURIComponent(c.req.param("sku")).trim().substring(0, 100);
    if (!sku) return c.json({ error: "SKU invalido." }, 400);
    await kv.del("price_custom_" + sku);
    await kv.del("product_price_" + sku);
    await kv.del("sige_price_" + sku);
    console.log("[Price] Custom price removed for " + sku + " by " + userId);
    return c.json({ ok: true, sku, message: "Preço personalizado removido." });
  } catch (e: any) {
    console.log("[Price] DELETE custom exception:", e);
    return c.json({ error: "Erro ao remover preco customizado." }, 500);
  }
});

// DELETE /produtos/precos-cache — clear ALL SIGE price caches (admin)
// Uses loop to handle PostgREST 1000-row default limit
app.delete(BASE + "/produtos/precos-cache", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    // Delete all sige_price_* keys in batches of 1000 (PostgREST default limit)
    var totalDeleted = 0;
    while (true) {
      var cacheRows = await supabaseAdmin
        .from("kv_store_b7b07654")
        .select("key")
        .like("key", "sige_price_%")
        .limit(1000);
      var keysToDelete = ((cacheRows.data || []) as Array<{ key: string }>).map(function(r) { return r.key; });
      if (keysToDelete.length === 0) break;
      await supabaseAdmin
        .from("kv_store_b7b07654")
        .delete()
        .in("key", keysToDelete);
      totalDeleted = totalDeleted + keysToDelete.length;
      // If we got fewer than 1000, that was the last batch
      if (keysToDelete.length < 1000) break;
    }
    // Also clear in-memory price config cache so tier changes take effect immediately
    memClear("_price_config");
    console.log("[Price] Cache cleared by " + userId + ": " + totalDeleted + " entries removed");
    return c.json({ ok: true, cleared: totalDeleted });
  } catch (e: any) {
    console.log("[Price] Cache clear exception:", e);
    return c.json({ error: "Erro ao limpar cache de precos." }, 500);
  }
});

// GET /produtos/preco/:sku — public endpoint to get product price
app.get(BASE + "/produtos/preco/:sku", async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku")).trim().substring(0, 100);
    if (!sku) return c.json({ error: "SKU obrigatório.", sku: "", found: false, price: null, v1: null, v2: null, v3: null, tier: "v2", showPrice: true });

    // 0. Load global price config (mem-cached)
    const cfg = await getPriceConfigCached();
    const selectedTier: string = cfg.tier || "v2";
    const showPrice = cfg.showPrice !== false;

    // 1. Check for custom price override (new key format first, then old)
    for (const prefix of ["price_custom_", "product_price_"]) {
      const customRaw = await kv.get(prefix + sku);
      if (customRaw) {
        const custom = typeof customRaw === "string" ? JSON.parse(customRaw) : customRaw;
        if (custom.price !== undefined && custom.price !== null) {
          console.log("[Price] Custom price for " + sku + ": R$" + custom.price + " (key=" + prefix + ")");
          return c.json({ sku, found: true, source: "custom", price: custom.price, v1: null, v2: null, v3: null, tier: "custom", showPrice, cached: false });
        }
      }
    }

    // 2. Check price cache (10 min for found, 2 min for not found)
    const cacheKey = "sige_price_" + sku;
    const cached = await kv.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      const age = Date.now() - (parsed._cachedAt || 0);
      const ttl = parsed.found ? 10 * 60 * 1000 : 2 * 60 * 1000;
      if (age < ttl) {
        // Recompute price using CURRENT tier (cached price may have been computed with old tier)
        if (parsed.v1 !== undefined || parsed.v2 !== undefined || parsed.v3 !== undefined) {
          var tRecomp: Record<string, number | null> = { v1: parsed.v1, v2: parsed.v2, v3: parsed.v3 };
          var recompPrice = tRecomp[selectedTier] !== undefined && tRecomp[selectedTier] !== null
            ? tRecomp[selectedTier]
            : (parsed.base !== null && parsed.base !== undefined ? parsed.base : (parsed.v2 !== null && parsed.v2 !== undefined ? parsed.v2 : (parsed.v1 !== null && parsed.v1 !== undefined ? parsed.v1 : parsed.v3)));
          parsed.price = recompPrice;
          parsed.tier = selectedTier;
        }
        return c.json({ ...parsed, showPrice, cached: true });
      }
    }

    // 3. Check SIGE configured
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ sku, found: false, source: "none", error: "SIGE não configurado.", price: null, v1: null, v2: null, v3: null, tier: selectedTier, showPrice });
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ sku, found: false, source: "none", error: "SIGE não conectado.", price: null, v1: null, v2: null, v3: null, tier: selectedTier, showPrice });

    // ─── Price lookup via SIGE /list-price-items endpoint ───

    function exArr(data: any): any[] {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (data?.dados && Array.isArray(data.dados)) return data.dados;
      if (data?.data && Array.isArray(data.data)) return data.data;
      if (data?.items && Array.isArray(data.items)) return data.items;
      if (data?.content && Array.isArray(data.content)) return data.content;
      if (data?.codProduto || data?.id || data?.descProdutoEst) return [data];
      return [];
    }

    // Extract price value from a list-price-item object
    function extractPriceValue(item: any): number | null {
      const priceFields = [
        "vlrTabela","valorTabela","vlrLista","valorLista","vlrPreco","valorPreco",
        "vlrVenda","valorVenda","precoVenda","preco","valor","vlr","vlrItem","valorItem",
        "precoItem","precoUnitario","valorUnitario","vlrUnitario","precoLista",
        "vlr_tabela","valor_tabela","preco_venda","valor_venda","vlr_venda",
      ];
      for (const k of priceFields) {
        if (item[k] !== undefined && item[k] !== null && item[k] !== "") {
          const v = Number(item[k]); if (!isNaN(v) && v > 0) return v;
        }
      }
      // Auto-detect: find any numeric field > 0 with price-like name
      for (const k of Object.keys(item)) {
        if (/^(vlr|valor|preco|tabela)/i.test(k)) {
          const v = Number(item[k]);
          if (!isNaN(v) && v > 0) return v;
        }
      }
      // Last resort: any numeric field > 0 that is not a code/id/offset
      const skipPattern = /^(cod|id|limit|offset|desc|tipo|unidade|data)/i;
      for (const k of Object.keys(item)) {
        if (skipPattern.test(k)) continue;
        const v = Number(item[k]);
        if (!isNaN(v) && v > 0) return v;
      }
      return null;
    }

    // Load list-price mapping from config: { v1: "codLista_1", v2: "codLista_2", v3: "codLista_3" }
    const listMapping = cfg.listPriceMapping || {};

    // ─── Step 4: Find product codProduto via strategies ───

    async function findProductId(): Promise<{ codProduto: string; descricao: string } | null> {
      // S0: Check mapping
      const mapEntry = await kv.get("sige_map_" + sku);
      if (mapEntry) {
        const map = typeof mapEntry === "string" ? JSON.parse(mapEntry) : mapEntry;
        if (map.sigeId) {
          console.log("[Price] S0: mapping " + sku + " -> SIGE " + map.sigeId);
          return { codProduto: map.sigeId, descricao: "" };
        }
      }

      // S1: Search by codProduto = SKU
      console.log("[Price] S1: codProduto=" + sku);
      const s1 = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(sku) + "&limit=1&offset=1");
      if (s1.ok && s1.data) {
        const prods = exArr(s1.data);
        if (prods.length > 0) {
          return { codProduto: String(prods[0].codProduto || prods[0].id || sku), descricao: prods[0].descProdutoEst || "" };
        }
      }

      // S2: Base part before dash
      if (sku.includes("-")) {
        const base = sku.split("-")[0];
        console.log("[Price] S2: base=" + base);
        const s2 = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(base) + "&limit=1&offset=1");
        if (s2.ok && s2.data) {
          const prods = exArr(s2.data);
          if (prods.length > 0) {
            return { codProduto: String(prods[0].codProduto || prods[0].id || base), descricao: prods[0].descProdutoEst || "" };
          }
        }
      }

      // S3: Clean SKU (remove dashes, dots, spaces)
      const skuC = sku.replace(/[-.\s]/g, "");
      if (skuC !== sku && skuC !== sku.split("-")[0]) {
        console.log("[Price] S3: cleaned=" + skuC);
        const s3 = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(skuC) + "&limit=1&offset=1");
        if (s3.ok && s3.data) {
          const prods = exArr(s3.data);
          if (prods.length > 0) {
            return { codProduto: String(prods[0].codProduto || prods[0].id || skuC), descricao: prods[0].descProdutoEst || "" };
          }
        }
      }

      return null;
    }

    console.log("[Price] Looking up product for SKU: " + sku);
    const productInfo = await findProductId();

    if (!productInfo) {
      console.log("[Price] " + sku + ": product not found in SIGE");
      const notFound = { sku, found: false, source: "sige", price: null, v1: null, v2: null, v3: null, tier: selectedTier, showPrice, _cachedAt: Date.now(), _priceListItems: 0, _detectedListCodes: [] as string[] };
      await kv.set(cacheKey, JSON.stringify(notFound));
      return c.json({ ...notFound, cached: false });
    }

    const { codProduto, descricao } = productInfo;
    console.log("[Price] Product found: codProduto=" + codProduto + ", desc=" + descricao.slice(0, 60));

    // ─── Step 5: Fetch prices via /list-price-items ───

    console.log("[Price] Fetching list-price-items for codProduto=" + codProduto);
    const lpRes = await sigeAuthFetch("GET", "/list-price-items?codProduto=" + encodeURIComponent(codProduto) + "&limit=50&offset=1");

    let v1: number | null = null;
    let v2: number | null = null;
    let v3: number | null = null;
    let base: number | null = null;
    let priceListItems: any[] = [];
    let detectedListCodes: string[] = [];
    let itemSampleKeys: string[] = [];
    let priceListDebug: any[] = [];

    if (lpRes.ok && lpRes.data) {
      priceListItems = exArr(lpRes.data);
      console.log("[Price] list-price-items for " + codProduto + ": " + priceListItems.length + " items");

      if (priceListItems.length > 0) {
        itemSampleKeys = Object.keys(priceListItems[0]);
        console.log("[Price] Item sample keys: [" + itemSampleKeys.join(",") + "]");
        console.log("[Price] Item sample: " + JSON.stringify(priceListItems[0]).slice(0, 500));

        // Group by codLista and extract prices
        const byList = new Map<string, { item: any; price: number | null }>();
        for (const item of priceListItems) {
          const code = String(item.codLista || item.codLista || "unknown");
          const price = extractPriceValue(item);
          if (!byList.has(code) || (price !== null && byList.get(code)!.price === null)) {
            byList.set(code, { item, price });
          }
          if (!detectedListCodes.includes(code)) detectedListCodes.push(code);
        }

        // Debug info for each list
        for (const [code, entry] of byList.entries()) {
          priceListDebug.push({ codLista: code, price: entry.price, descLista: entry.item.descLista || null });
        }
        console.log("[Price] Detected lists: " + JSON.stringify(priceListDebug));

        // Try configured mapping first
        if (listMapping.v1 && byList.has(listMapping.v1)) {
          v1 = byList.get(listMapping.v1)!.price;
          console.log("[Price] Mapped v1 = list " + listMapping.v1 + " -> " + v1);
        }
        if (listMapping.v2 && byList.has(listMapping.v2)) {
          v2 = byList.get(listMapping.v2)!.price;
          console.log("[Price] Mapped v2 = list " + listMapping.v2 + " -> " + v2);
        }
        if (listMapping.v3 && byList.has(listMapping.v3)) {
          v3 = byList.get(listMapping.v3)!.price;
          console.log("[Price] Mapped v3 = list " + listMapping.v3 + " -> " + v3);
        }

        // Auto-detect: if no mapping configured or no prices found, assign first 3 lists to v1/v2/v3
        if (v1 === null && v2 === null && v3 === null) {
          const codes = Array.from(byList.keys()).sort();
          if (codes.length >= 1) v1 = byList.get(codes[0])!.price;
          if (codes.length >= 2) v2 = byList.get(codes[1])!.price;
          if (codes.length >= 3) v3 = byList.get(codes[2])!.price;
          console.log("[Price] Auto-mapped: lists=[" + codes.slice(0,3).join(",") + "] -> v1=" + v1 + ", v2=" + v2 + ", v3=" + v3);
        }

        // Base = first available
        base = v1 ?? v2 ?? v3 ?? null;
        if (base === null && priceListItems.length > 0) {
          base = extractPriceValue(priceListItems[0]);
        }
      }
    } else {
      console.log("[Price] list-price-items for " + codProduto + ": HTTP " + lpRes.status + ", data: " + JSON.stringify(lpRes.data).slice(0, 300));
    }

    const tMap: Record<string, number | null> = { v1, v2, v3 };
    const selectedPrice = tMap[selectedTier] ?? base ?? v2 ?? v1 ?? v3;
    const found = selectedPrice !== null;

    const result: any = {
      sku, found, source: "sige", sigeId: codProduto, descricao,
      v1, v2, v3, base,
      tier: selectedTier, price: selectedPrice, showPrice, _cachedAt: Date.now(),
      _priceListItems: priceListItems.length,
      _detectedListCodes: detectedListCodes,
      _priceListDebug: priceListDebug,
      _itemSampleKeys: itemSampleKeys,
      _listMapping: listMapping,
    };

    console.log("[Price] " + sku + ": final -> found=" + found + ", v1=" + v1 + ", v2=" + v2 + ", v3=" + v3 + ", base=" + base + ", price=" + selectedPrice);
    await kv.set(cacheKey, JSON.stringify(result));
    return c.json({ ...result, cached: false });
  } catch (e: any) {
    console.log("[Price] Exception for SKU " + sku + ":", e);
    return c.json({ error: "Erro ao buscar preco.", sku: sku, found: false, price: null, v1: null, v2: null, v3: null, tier: "v2", showPrice: true });
  }
});

// ═══════════════════════════════════════════════════════
// ─── BULK PRICE ENDPOINT (public) ─────────────────────
// ═══════════════════════════════════════════════════════

// POST /produtos/precos-bulk — fetch prices for multiple SKUs in one call
// OPTIMIZED: mem-cached config, batch sige_map reads, save mappings, batch KV writes, concurrency 10
app.post(BASE + "/produtos/precos-bulk", async (c) => {
  try {
    const t0 = Date.now();
    const body = await c.req.json();
    // Input validation for precos-bulk
    var pbValid = validate(body, {
      skus: { required: true, type: "array", maxItems: 200 },
    });
    if (!pbValid.ok) return c.json({ error: pbValid.errors[0] || "Array 'skus' obrigatório.", results: [], config: null });
    const skus: string[] = body.skus || [];
    if (!Array.isArray(skus) || skus.length === 0) {
      return c.json({ error: "Array 'skus' obrigatório.", results: [], config: null });
    }
    if (skus.length > 50) {
      return c.json({ error: "Máximo 50 SKUs por requisição.", results: [], config: null });
    }

    console.log("[PriceBulk] Fetching prices for " + skus.length + " SKUs");

    // 0. Load global price config once (in-memory cached)
    const cfg = await getPriceConfigCached();
    const selectedTier: string = cfg.tier || "v2";
    const showPrice = cfg.showPrice !== false;
    const listMapping = cfg.listPriceMapping || {};

    const configOut = {
      tier: selectedTier,
      showPrice: showPrice,
      pixDiscountEnabled: cfg.pixDiscountEnabled || false,
      pixDiscountPercent: cfg.pixDiscountPercent || 5,
      installmentsCount: cfg.installmentsCount || 0,
      installmentsMinValue: cfg.installmentsMinValue || 0,
    };

    // 1. Batch-read ALL needed KV keys in parallel: custom prices, cache, sige_map
    // CRITICAL FIX: kv.mget() does NOT guarantee order and does NOT return keys,
    // so we query the table directly with key+value and build maps by key (order-safe).
    const customKeys = skus.map(function(s) { return "price_custom_" + s; });
    const oldPKeys = skus.map(function(s) { return "product_price_" + s; });
    const cacheKeys = skus.map(function(s) { return "sige_price_" + s; });
    const mapKeys = skus.map(function(s) { return "sige_map_" + s; });

    var allBulkKvKeys = customKeys.concat(oldPKeys).concat(cacheKeys).concat(mapKeys);

    // Single query returning {key, value} — order-safe
    var kvBulkResult = await supabaseAdmin
      .from("kv_store_b7b07654")
      .select("key, value")
      .in("key", allBulkKvKeys);
    var kvBulkRows = (kvBulkResult.data || []) as Array<{ key: string; value: any }>;
    var kvBulkMap: Record<string, any> = {};
    for (var kri = 0; kri < kvBulkRows.length; kri++) {
      if (kvBulkRows[kri] && kvBulkRows[kri].key) {
        kvBulkMap[kvBulkRows[kri].key] = kvBulkRows[kri].value;
      }
    }

    const customPriceMap: Record<string, any> = {};
    for (let i = 0; i < skus.length; i++) {
      var ckKey = "price_custom_" + skus[i];
      var opKey = "product_price_" + skus[i];
      let raw = kvBulkMap[ckKey] || kvBulkMap[opKey];
      if (raw) {
        if (typeof raw === "object" && raw !== null && (raw as any).value !== undefined) {
          raw = (raw as any).value;
        }
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && parsed.price !== undefined && parsed.price !== null) {
          customPriceMap[skus[i]] = parsed;
        }
      }
    }

    // 2. Parse cache and sige_map — using key-based lookup (order-safe)
    const cacheMap: Record<string, any> = {};
    const sigeMapLookup: Record<string, string> = {};
    const PRICE_CACHE_TTL_FOUND = 30 * 60 * 1000; // 30 min for found
    const PRICE_CACHE_TTL_MISS = 5 * 60 * 1000;   // 5 min for not found

    for (let i = 0; i < skus.length; i++) {
      // Cache — lookup by exact key (order-safe)
      var cacheKvKey = "sige_price_" + skus[i];
      let raw = kvBulkMap[cacheKvKey];
      if (raw) {
        if (typeof raw === "object" && raw !== null && (raw as any).value !== undefined) {
          raw = (raw as any).value;
        }
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && parsed._cachedAt) {
          const age = Date.now() - parsed._cachedAt;
          const ttl = parsed.found ? PRICE_CACHE_TTL_FOUND : PRICE_CACHE_TTL_MISS;
          if (age < ttl) {
            // Recompute price using CURRENT tier (cached price may have been computed with old tier)
            if (parsed.v1 !== undefined || parsed.v2 !== undefined || parsed.v3 !== undefined) {
              var tRecompute: Record<string, number | null> = { v1: parsed.v1, v2: parsed.v2, v3: parsed.v3 };
              var recomputedPrice = tRecompute[selectedTier] !== undefined && tRecompute[selectedTier] !== null
                ? tRecompute[selectedTier]
                : (parsed.base !== null && parsed.base !== undefined ? parsed.base : (parsed.v2 !== null && parsed.v2 !== undefined ? parsed.v2 : (parsed.v1 !== null && parsed.v1 !== undefined ? parsed.v1 : parsed.v3)));
              parsed.price = recomputedPrice;
              parsed.tier = selectedTier;
            }
            cacheMap[skus[i]] = parsed;
          }
        }
      }
      // sige_map — lookup by exact key (order-safe)
      var mapKvKey = "sige_map_" + skus[i];
      let mapRaw = kvBulkMap[mapKvKey];
      if (mapRaw) {
        if (typeof mapRaw === "object" && mapRaw !== null && (mapRaw as any).value !== undefined) {
          mapRaw = (mapRaw as any).value;
        }
        const mapParsed = typeof mapRaw === "string" ? JSON.parse(mapRaw) : mapRaw;
        if (mapParsed && mapParsed.sigeId) {
          sigeMapLookup[skus[i]] = mapParsed.sigeId;
        }
      }
    }

    // 3. Build results: custom > cache > need-fetch
    const results: any[] = [];
    const needFetch: string[] = [];

    for (const sku of skus) {
      if (customPriceMap[sku]) {
        results.push({
          sku: sku, found: true, source: "custom", price: customPriceMap[sku].price,
          v1: null, v2: null, v3: null, tier: "custom", showPrice: showPrice, cached: true,
        });
      } else if (cacheMap[sku]) {
        results.push({ ...cacheMap[sku], showPrice: showPrice, cached: true });
      } else {
        needFetch.push(sku);
      }
    }

    console.log("[PriceBulk] custom=" + Object.keys(customPriceMap).length + " cached=" + Object.keys(cacheMap).length + " needFetch=" + needFetch.length);

    // 4. Fetch remaining from SIGE in parallel (max 10 concurrent)
    if (needFetch.length > 0) {
      const sigeConfig = await getSigeConfig();
      const sigeToken = await getSigeToken();
      const sigeOk = !!sigeConfig && !!sigeToken;

      if (!sigeOk) {
        for (const sku of needFetch) {
          results.push({ sku: sku, found: false, source: "none", price: null, v1: null, v2: null, v3: null, tier: selectedTier, showPrice: showPrice, error: "SIGE não configurado." });
        }
      } else {
        function exArrBP(data: any): any[] {
          if (!data) return [];
          if (Array.isArray(data)) return data;
          if (data.dados && Array.isArray(data.dados)) return data.dados;
          if (data.data && Array.isArray(data.data)) return data.data;
          if (data.items && Array.isArray(data.items)) return data.items;
          if (data.content && Array.isArray(data.content)) return data.content;
          if (data.codProduto || data.id || data.descProdutoEst) return [data];
          return [];
        }

        function extractPriceBP(item: any): number | null {
          const priceFields = [
            "vlrTabela","valorTabela","vlrLista","valorLista","vlrPreco","valorPreco",
            "vlrVenda","valorVenda","precoVenda","preco","valor","vlr","vlrItem","valorItem",
            "precoItem","precoUnitario","valorUnitario","vlrUnitario","precoLista",
            "vlr_tabela","valor_tabela","preco_venda","valor_venda","vlr_venda",
          ];
          for (const k of priceFields) {
            if (item[k] !== undefined && item[k] !== null && item[k] !== "") {
              const v = Number(item[k]); if (!isNaN(v) && v > 0) return v;
            }
          }
          const itemKeys = Object.keys(item);
          for (const k of itemKeys) {
            if (/^(vlr|valor|preco|tabela)/i.test(k)) {
              const v = Number(item[k]);
              if (!isNaN(v) && v > 0) return v;
            }
          }
          return null;
        }

        // Collect KV writes to batch at the end
        const kvWritesBatch: Array<{ key: string; value: string }> = [];

        async function fetchOnePriceSige(sku: string): Promise<any> {
          try {
            let codProduto: string | null = null;
            let descricao = "";

            // S0: check pre-loaded mapping (already batch-read above)
            if (sigeMapLookup[sku]) {
              codProduto = sigeMapLookup[sku];
            }

            // S1: search by codProduto = SKU
            if (!codProduto) {
              const s1 = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(sku) + "&limit=1&offset=1");
              if (s1.ok && s1.data) {
                const prods = exArrBP(s1.data);
                if (prods.length > 0) {
                  codProduto = String(prods[0].codProduto || prods[0].id || sku);
                  descricao = prods[0].descProdutoEst || "";
                  // Save mapping for future lookups (avoids repeating S1/S2)
                  kvWritesBatch.push({ key: "sige_map_" + sku, value: JSON.stringify({ sigeId: codProduto, descricao: descricao }) });
                }
              }
            }

            // S2: base part before dash
            if (!codProduto && sku.indexOf("-") !== -1) {
              const basePart = sku.split("-")[0];
              const s2 = await sigeAuthFetch("GET", "/product?codProduto=" + encodeURIComponent(basePart) + "&limit=1&offset=1");
              if (s2.ok && s2.data) {
                const prods2 = exArrBP(s2.data);
                if (prods2.length > 0) {
                  codProduto = String(prods2[0].codProduto || prods2[0].id || basePart);
                  descricao = prods2[0].descProdutoEst || "";
                  kvWritesBatch.push({ key: "sige_map_" + sku, value: JSON.stringify({ sigeId: codProduto, descricao: descricao }) });
                }
              }
            }

            if (!codProduto) {
              const notFound = { sku: sku, found: false, source: "sige", price: null, v1: null, v2: null, v3: null, tier: selectedTier, showPrice: showPrice, _cachedAt: Date.now() };
              kvWritesBatch.push({ key: "sige_price_" + sku, value: JSON.stringify(notFound) });
              return notFound;
            }

            // Fetch list-price-items
            const lpRes = await sigeAuthFetch("GET", "/list-price-items?codProduto=" + encodeURIComponent(codProduto) + "&limit=50&offset=1");

            let pv1: number | null = null;
            let pv2: number | null = null;
            let pv3: number | null = null;
            let pbase: number | null = null;

            if (lpRes.ok && lpRes.data) {
              const priceListItems = exArrBP(lpRes.data);
              if (priceListItems.length > 0) {
                const byList = new Map<string, { item: any; price: number | null }>();
                for (const plItem of priceListItems) {
                  const code = String(plItem.codLista || "unknown");
                  const priceVal = extractPriceBP(plItem);
                  if (!byList.has(code) || (priceVal !== null && byList.get(code)!.price === null)) {
                    byList.set(code, { item: plItem, price: priceVal });
                  }
                }

                if (listMapping.v1 && byList.has(listMapping.v1)) pv1 = byList.get(listMapping.v1)!.price;
                if (listMapping.v2 && byList.has(listMapping.v2)) pv2 = byList.get(listMapping.v2)!.price;
                if (listMapping.v3 && byList.has(listMapping.v3)) pv3 = byList.get(listMapping.v3)!.price;

                if (pv1 === null && pv2 === null && pv3 === null) {
                  const codes = Array.from(byList.keys()).sort();
                  if (codes.length >= 1) pv1 = byList.get(codes[0])!.price;
                  if (codes.length >= 2) pv2 = byList.get(codes[1])!.price;
                  if (codes.length >= 3) pv3 = byList.get(codes[2])!.price;
                }

                pbase = pv1 !== null ? pv1 : (pv2 !== null ? pv2 : pv3);
                if (pbase === null && priceListItems.length > 0) {
                  pbase = extractPriceBP(priceListItems[0]);
                }
              }
            }

            const tMapBP: Record<string, number | null> = { v1: pv1, v2: pv2, v3: pv3 };
            const sp = tMapBP[selectedTier] !== undefined && tMapBP[selectedTier] !== null ? tMapBP[selectedTier] : (pbase !== null ? pbase : (pv2 !== null ? pv2 : (pv1 !== null ? pv1 : pv3)));
            const found = sp !== null;

            const result: any = {
              sku: sku, found: found, source: "sige", sigeId: codProduto, descricao: descricao,
              v1: pv1, v2: pv2, v3: pv3, base: pbase,
              tier: selectedTier, price: sp, showPrice: showPrice, _cachedAt: Date.now(),
            };

            kvWritesBatch.push({ key: "sige_price_" + sku, value: JSON.stringify(result) });
            return result;
          } catch (err: any) {
            console.log("[PriceBulk] Error for " + sku + ": " + (err.message || err));
            return { sku: sku, found: false, source: "sige", price: null, v1: null, v2: null, v3: null, tier: selectedTier, showPrice: showPrice, error: "Erro ao buscar preco" };
          }
        }

        // Run with concurrency limit of 10
        const CONC_LIMIT = 10;
        let fetchIdx = 0;
        const fetchedResults: any[] = [];

        async function runWorker(): Promise<void> {
          while (fetchIdx < needFetch.length) {
            const myIdx = fetchIdx;
            fetchIdx++;
            const r = await fetchOnePriceSige(needFetch[myIdx]);
            fetchedResults.push(r);
          }
        }

        const workers: Promise<void>[] = [];
        for (let wi = 0; wi < Math.min(CONC_LIMIT, needFetch.length); wi++) {
          workers.push(runWorker());
        }
        await Promise.all(workers);

        for (const fr of fetchedResults) {
          results.push({ ...fr, cached: false });
        }

        // Batch write all KV entries at once
        if (kvWritesBatch.length > 0) {
          const batchKeys: string[] = [];
          const batchVals: string[] = [];
          for (const entry of kvWritesBatch) {
            batchKeys.push(entry.key);
            batchVals.push(entry.value);
          }
          kv.mset(batchKeys, batchVals).catch(function(e) { console.log("[PriceBulk] mset error:", e); });
        }
      }
    }

    const elapsed = Date.now() - t0;
    console.log("[PriceBulk] Done. total=" + results.length + " elapsed=" + elapsed + "ms");
    return c.json({ results: results, config: configOut });
  } catch (e: any) {
    console.log("[PriceBulk] Exception:", e);
    return c.json({ error: "Erro ao buscar precos.", results: [], config: null }, 500);
  }
});

// ─── Custom prices management ───

// GET /produtos/custom-prices — list all custom prices (admin)
app.get(BASE + "/produtos/custom-prices", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const newKeys = await kv.getByPrefix("price_custom_");
    const oldKeys = await kv.getByPrefix("product_price_");

    const customs: any[] = [];
    const seenSkus = new Set<string>();

    for (const entry of [...(newKeys || []), ...(oldKeys || [])]) {
      try {
        const val = typeof entry.value === "string" ? JSON.parse(entry.value) : entry.value;
        const sku = val.sku || entry.key.replace("price_custom_", "").replace("product_price_", "");
        if (seenSkus.has(sku)) continue;
        seenSkus.add(sku);
        customs.push({
          sku,
          price: val.price,
          source: "custom",
          updatedAt: val.updatedAt || null,
        });
      } catch {}
    }

    customs.sort((a: any, b: any) => a.sku.localeCompare(b.sku));
    console.log("[Price] Custom prices list: " + customs.length + " items");
    return c.json({ customs, total: customs.length });
  } catch (e: any) {
    console.log("[Price] Custom prices list exception:", e);
    return c.json({ error: "Erro ao listar precos customizados." }, 500);
  }
});

// DELETE /price-cache — clear all price caches (admin)
// Delegates to the same batched logic as /produtos/precos-cache
app.delete(BASE + "/price-cache", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    // Delete all sige_price_* keys in batches of 1000 (PostgREST default limit)
    var totalDeleted = 0;
    while (true) {
      var batch = await supabaseAdmin
        .from("kv_store_b7b07654")
        .select("key")
        .like("key", "sige_price_%")
        .limit(1000);
      var batchKeys = ((batch.data || []) as Array<{ key: string }>).map(function(r) { return r.key; });
      if (batchKeys.length === 0) break;
      await supabaseAdmin
        .from("kv_store_b7b07654")
        .delete()
        .in("key", batchKeys);
      totalDeleted = totalDeleted + batchKeys.length;
      if (batchKeys.length < 1000) break;
    }
    memClear("_price_config");
    console.log("[Price] Cache cleared via /price-cache: " + totalDeleted + " entries by " + userId);
    return c.json({ cleared: totalDeleted, message: totalDeleted + " caches de preço removidos." });
  } catch (e: any) {
    console.log("[Price] Cache clear exception:", e);
    return c.json({ error: "Erro ao limpar cache de precos." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── PAGHIPER ─────────────────────────
// ═══════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// Server-side price validation — prevents price tampering
// by verifying items against cached/custom prices in KV.
// ═══════════════════════════════════════════════════════════
async function _validatePaymentPrices(
  items: Array<{ item_id?: string; sku?: string; price_cents: number; quantity?: number; unit_price?: number }>,
  allowedDiscountPercent: number
): Promise<{ ok: boolean; expectedTotalCents: number; clientTotalCents: number; verifiedCount: number; totalItems: number; flaggedItems: string[] }> {
  var flaggedItems: string[] = [];
  var expectedTotalCents = 0;
  var clientTotalCents = 0;
  var verifiedCount = 0;
  var totalItems = items.length;

  var skus: string[] = [];
  for (var vi = 0; vi < items.length; vi++) {
    var itemSku = items[vi].sku || items[vi].item_id || "";
    if (itemSku) skus.push(itemSku);
  }
  if (skus.length === 0) {
    return { ok: true, expectedTotalCents: 0, clientTotalCents: 0, verifiedCount: 0, totalItems: totalItems, flaggedItems: [] };
  }

  var priceKeys: string[] = [];
  for (var ski = 0; ski < skus.length; ski++) {
    priceKeys.push("price_custom_" + skus[ski]);
    priceKeys.push("sige_price_" + skus[ski]);
  }

  var priceKvResult = await supabaseAdmin
    .from("kv_store_b7b07654")
    .select("key, value")
    .in("key", priceKeys);
  var priceKvRows = (priceKvResult.data || []) as Array<{ key: string; value: any }>;
  var priceKvMap: Record<string, any> = {};
  for (var pri = 0; pri < priceKvRows.length; pri++) {
    if (priceKvRows[pri] && priceKvRows[pri].key) {
      var prVal2 = priceKvRows[pri].value;
      if (typeof prVal2 === "string") { try { prVal2 = JSON.parse(prVal2); } catch (_e) {} }
      priceKvMap[priceKvRows[pri].key] = prVal2;
    }
  }

  var pcRaw2 = await kv.get("price_config");
  var priceConfig2 = pcRaw2 ? (typeof pcRaw2 === "string" ? JSON.parse(pcRaw2) : pcRaw2) : {};
  var selectedTier2 = priceConfig2.tier || "v2";

  for (var ii = 0; ii < items.length; ii++) {
    var pItem = items[ii];
    var pSku = pItem.sku || pItem.item_id || "";
    var pQty = Number(pItem.quantity || 1);
    var clientPriceCents = pItem.price_cents !== undefined ? Number(pItem.price_cents) : Math.round((pItem.unit_price || 0) * 100);
    clientTotalCents += clientPriceCents * pQty;
    if (!pSku) continue;

    var serverPriceCents: number | null = null;
    var customEntry = priceKvMap["price_custom_" + pSku];
    if (customEntry && customEntry.price) {
      serverPriceCents = Math.round(Number(customEntry.price) * 100);
    }
    if (serverPriceCents === null) {
      var sigeEntry = priceKvMap["sige_price_" + pSku];
      if (sigeEntry && sigeEntry.price !== undefined && sigeEntry.price !== null) {
        serverPriceCents = Math.round(Number(sigeEntry.price) * 100);
      } else if (sigeEntry) {
        var tierPrice = sigeEntry[selectedTier2 || "v2"];
        if (tierPrice !== undefined && tierPrice !== null) {
          serverPriceCents = Math.round(Number(tierPrice) * 100);
        }
      }
    }

    if (serverPriceCents !== null && serverPriceCents > 0) {
      verifiedCount++;
      expectedTotalCents += serverPriceCents * pQty;
      var minAllowedCents = Math.round(serverPriceCents * (1 - allowedDiscountPercent / 100));
      if (clientPriceCents < minAllowedCents) {
        flaggedItems.push(pSku + " (client=" + clientPriceCents + " server=" + serverPriceCents + " min=" + minAllowedCents + ")");
      }
    }
  }

  var ok = true;
  if (verifiedCount > 0 && flaggedItems.length > 0) {
    if (flaggedItems.length >= Math.ceil(verifiedCount * 0.3)) {
      ok = false;
    }
  }
  return { ok: ok, expectedTotalCents: expectedTotalCents, clientTotalCents: clientTotalCents, verifiedCount: verifiedCount, totalItems: totalItems, flaggedItems: flaggedItems };
}

const PAGHIPER_PIX_URL = "https://pix.paghiper.com/invoice";
const PAGHIPER_BOLETO_URL = "https://api.paghiper.com/transaction";

// Helper: get PagHiper credentials from KV
async function getPagHiperCredentials(): Promise<{ apiKey: string; token: string } | null> {
  const raw = await kv.get("paghiper_config");
  if (!raw) return null;
  const config = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!config.apiKey || !config.token) return null;
  return { apiKey: config.apiKey, token: config.token };
}

// Helper: translate PagHiper status codes
function translateStatus(status: string): string {
  const map: Record<string, string> = {
    pending: "Pendente",
    reserved: "Reservado",
    canceled: "Cancelado",
    completed: "Pago",
    paid: "Pago",
    processing: "Processando",
    refunded: "Reembolsado",
    partially_refunded: "Reembolso Parcial",
  };
  return map[status] || status;
}

// GET /paghiper/config — get config status (admin)
app.get(BASE + "/paghiper/config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const raw = await kv.get("paghiper_config");
    if (!raw) return c.json({ configured: false });

    const config = typeof raw === "string" ? JSON.parse(raw) : raw;
    return c.json({
      configured: !!(config.apiKey && config.token),
      hasApiKey: !!config.apiKey,
      hasToken: !!config.token,
      apiKeyPreview: config.apiKey ? config.apiKey.substring(0, 8) + "..." : null,
      updatedAt: config.updatedAt || null,
    });
  } catch (e: any) {
    console.log("[PagHiper] Config get error:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// PUT /paghiper/config — save PagHiper credentials (admin)
app.put(BASE + "/paghiper/config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var phBody = await c.req.json();
    // Input validation for PagHiper config
    var phValid = validate(phBody, {
      apiKey: { required: true, type: "string", minLen: 1, maxLen: 500 },
      token: { required: true, type: "string", minLen: 1, maxLen: 500 },
    });
    if (!phValid.ok) return c.json({ error: phValid.errors[0] || "API Key e Token são obrigatórios." }, 400);
    var apiKey = (phValid.sanitized.apiKey || "").trim();
    var token = (phValid.sanitized.token || "").trim();
    if (!apiKey || !token) {
      return c.json({ error: "API Key e Token são obrigatórios." }, 400);
    }

    await kv.set("paghiper_config", JSON.stringify({
      apiKey: apiKey,
      token: token,
      updatedAt: Date.now(),
    }));

    console.log(`[PagHiper] Config saved by user ${userId}`);
    return c.json({ success: true, configured: true });
  } catch (e: any) {
    console.log("[PagHiper] Config save error:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// DELETE /paghiper/config — remove PagHiper credentials (admin)
app.delete(BASE + "/paghiper/config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    await kv.del("paghiper_config");
    console.log(`[PagHiper] Config deleted by user ${userId}`);
    return c.json({ success: true, configured: false });
  } catch (e: any) {
    console.log("[PagHiper] Config delete error:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ─── PIX ───

// POST /paghiper/pix/create — create PIX charge
app.post(BASE + "/paghiper/pix/create", async (c) => {
  try {
    // SECURITY: Require auth — only logged-in users can create charges
    var pixUserId = await getAuthUserId(c.req.raw);
    if (!pixUserId) return c.json({ error: "Autenticacao necessaria." }, 401);
    // Rate limit: 5 PIX charges per minute per IP
    var pixRl = _getRateLimitKey(c, "pix_create");
    var pixRlResult = _checkRateLimit(pixRl, 5);
    if (!pixRlResult.allowed) return _rl429(c, "Muitas tentativas. Aguarde.", pixRlResult);
    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper não configurado." }, 400);

    const body = await c.req.json();
    // Input validation for PIX charge creation
    var pixValid = validate(body, {
      order_id: { required: true, type: "string", maxLen: 100 },
      payer_email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      payer_name: { required: true, type: "string", maxLen: 200 },
      payer_cpf_cnpj: { required: true, type: "string", maxLen: 20, custom: validators.cpfOrCnpj },
      payer_phone: { type: "string", maxLen: 30 },
      items: { required: true, type: "array", maxItems: 200 },
      days_due_date: { type: "string", maxLen: 5 },
      discount_cents: { type: "number", min: 0, max: 99999999 },
    });
    if (!pixValid.ok) {
      return c.json({ error: pixValid.errors[0] || "Dados invalidos." }, 400);
    }
    const { order_id, payer_email, payer_name, payer_cpf_cnpj, payer_phone, items, days_due_date, notification_url, discount_cents } = body;

    if (!order_id || !payer_email || !payer_name || !payer_cpf_cnpj || !items?.length) {
      return c.json({ error: "Campos obrigatórios: order_id, payer_email, payer_name, payer_cpf_cnpj, items[]" }, 400);
    }

    // SECURITY: Validate prices server-side (allow up to 55% discount for PIX + coupons)
    try {
      var pixPriceCheck = await _validatePaymentPrices(items, 55);
      console.log("[PagHiper-PIX] Price validation: verified=" + pixPriceCheck.verifiedCount + "/" + pixPriceCheck.totalItems + " clientTotal=" + pixPriceCheck.clientTotalCents + " expectedTotal=" + pixPriceCheck.expectedTotalCents + " flagged=" + pixPriceCheck.flaggedItems.length);
      if (!pixPriceCheck.ok) {
        console.log("[PagHiper-PIX] PRICE TAMPERING BLOCKED for order " + order_id + " by user " + pixUserId + ": " + pixPriceCheck.flaggedItems.join(", "));
        return c.json({ error: "Valores dos itens nao conferem com o catalogo. Atualize a pagina e tente novamente." }, 400);
      }
      if (pixPriceCheck.flaggedItems.length > 0) {
        console.log("[PagHiper-PIX] PRICE WARNING for order " + order_id + ": " + pixPriceCheck.flaggedItems.join(", "));
      }
    } catch (pvErr) {
      console.log("[PagHiper-PIX] Price validation error (non-blocking): " + pvErr);
    }

    const payload: any = {
      apiKey: creds.apiKey,
      order_id,
      payer_email,
      payer_name,
      payer_cpf_cnpj: payer_cpf_cnpj.replace(/\D/g, ""),
      payer_phone: payer_phone ? payer_phone.replace(/\D/g, "") : undefined,
      // SECURITY: Hardcode notification_url server-side to prevent webhook hijacking
      notification_url: (Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/make-server-b7b07654/paghiper/notification",
      days_due_date: days_due_date || "1",
      discount_cents: discount_cents && discount_cents > 0 ? String(discount_cents) : undefined,
      items: items.map((item: any, i: number) => ({
        description: item.description || "Item " + (i + 1),
        quantity: String(item.quantity || 1),
        item_id: String(item.item_id || i + 1),
        price_cents: String(item.price_cents),
      })),
    };

    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
    console.log("[PagHiper] PIX create for order " + order_id + (discount_cents ? " | discount_cents=" + discount_cents : ""));

    const res = await fetch(`${PAGHIPER_PIX_URL}/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log(`[PagHiper] PIX create response:`, JSON.stringify(data));

    if (!res.ok || data?.pix_create_request?.result === "reject") {
      const msg = data?.pix_create_request?.response_message || data?.message || `HTTP ${res.status}`;
      return c.json({ error: msg, paghiperResponse: data }, 400);
    }

    const txId = data?.pix_create_request?.transaction_id;
    if (txId) {
      await kv.set(`paghiper_tx_${txId}`, JSON.stringify({
        type: "pix",
        order_id,
        transaction_id: txId,
        status: data?.pix_create_request?.status || "pending",
        created_at: Date.now(),
        payer_email,
        payer_name,
        payer_cpf_cnpj,
        value_cents: items.reduce((sum: number, it: any) => sum + Number(it.price_cents) * Number(it.quantity || 1), 0),
        qr_code: data?.pix_create_request?.pix_code?.qrcode_base64 || null,
        pix_url: data?.pix_create_request?.pix_code?.pix_url || null,
        emv: data?.pix_create_request?.pix_code?.emv || null,
        bacen_url: data?.pix_create_request?.pix_code?.bacen_url || null,
      }));
      await kv.set(`paghiper_order_${order_id}`, txId);
    }

    return c.json({
      success: true,
      transaction_id: txId,
      status: data?.pix_create_request?.status,
      qr_code_base64: data?.pix_create_request?.pix_code?.qrcode_base64 || null,
      pix_url: data?.pix_create_request?.pix_code?.pix_url || null,
      emv: data?.pix_create_request?.pix_code?.emv || null,
      bacen_url: data?.pix_create_request?.pix_code?.bacen_url || null,
      due_date: data?.pix_create_request?.due_date || null,
      value_cents: data?.pix_create_request?.value_cents || null,
      raw: data,
    });
  } catch (e: any) {
    console.log("[PagHiper] PIX create exception:", e);
    return c.json({ error: "Erro ao criar cobranca PIX." }, 500);
  }
});

// POST /paghiper/pix/status — check PIX payment status (requires auth)
app.post(BASE + "/paghiper/pix/status", async (c) => {
  try {
    var pixStatusUserId = await getAuthUserId(c.req.raw);
    if (!pixStatusUserId) return c.json({ error: "Autenticacao necessaria." }, 401);
    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper não configurado." }, 400);

    var pixStBody = await c.req.json();
    var pixStValid = validate(pixStBody, {
      transaction_id: { required: true, type: "string", maxLen: 100 },
    });
    if (!pixStValid.ok) return c.json({ error: "transaction_id obrigatório." }, 400);
    var transaction_id = pixStValid.sanitized.transaction_id;

    const res = await fetch(PAGHIPER_PIX_URL + "/status/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        token: creds.token,
        transaction_id: transaction_id,
      }),
    });

    const data = await res.json();
    console.log("[PagHiper] PIX status for " + transaction_id + ":", JSON.stringify(data));

    const statusData = data?.status_request;
    const status = statusData?.status || "unknown";

    const existing = await kv.get(`paghiper_tx_${transaction_id}`);
    if (existing) {
      const tx = typeof existing === "string" ? JSON.parse(existing) : existing;
      tx.status = status;
      tx.status_updated_at = Date.now();
      if (statusData?.paid_date) tx.paid_date = statusData.paid_date;
      await kv.set(`paghiper_tx_${transaction_id}`, JSON.stringify(tx));
    }

    return c.json({
      transaction_id,
      status,
      status_label: translateStatus(status),
      value_cents: statusData?.value_cents || null,
      value_cents_paid: statusData?.value_cents_paid || null,
      paid_date: statusData?.paid_date || null,
      due_date: statusData?.due_date || null,
      raw: data,
    });
  } catch (e: any) {
    console.log("[PagHiper] PIX status exception:", e);
    return c.json({ error: "Erro ao consultar status do PIX." }, 500);
  }
});

// POST /paghiper/pix/cancel — cancel PIX charge (admin)
app.post(BASE + "/paghiper/pix/cancel", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Não autorizado." }, 401);

    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper não configurado." }, 400);

    var pixCancelBody = await c.req.json();
    var pixCancelValid = validate(pixCancelBody, {
      transaction_id: { required: true, type: "string", maxLen: 100 },
      status: { type: "string", maxLen: 30 },
    });
    if (!pixCancelValid.ok) return c.json({ error: "transaction_id obrigatório." }, 400);
    var transaction_id = pixCancelValid.sanitized.transaction_id;
    var status = pixCancelValid.sanitized.status || "canceled";

    const res = await fetch(PAGHIPER_PIX_URL + "/cancel/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        token: creds.token,
        transaction_id: transaction_id,
        status: status,
      }),
    });

    const data = await res.json();
    console.log("[PagHiper] PIX cancel for " + transaction_id + ":", JSON.stringify(data));

    const existing = await kv.get(`paghiper_tx_${transaction_id}`);
    if (existing) {
      const tx = typeof existing === "string" ? JSON.parse(existing) : existing;
      tx.status = "canceled";
      tx.canceled_at = Date.now();
      tx.canceled_by = userId;
      await kv.set(`paghiper_tx_${transaction_id}`, JSON.stringify(tx));
    }

    return c.json({ success: true, transaction_id, data });
  } catch (e: any) {
    console.log("[PagHiper] PIX cancel exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ─── BOLETO ───

// POST /paghiper/boleto/create — create boleto charge
app.post(BASE + "/paghiper/boleto/create", async (c) => {
  try {
    // SECURITY: Require auth — only logged-in users can create charges
    var boletoUserId = await getAuthUserId(c.req.raw);
    if (!boletoUserId) return c.json({ error: "Autenticacao necessaria." }, 401);
    // Rate limit: 5 boleto charges per minute per IP
    var boletoRl = _getRateLimitKey(c, "boleto_create");
    var boletoRlResult = _checkRateLimit(boletoRl, 5);
    if (!boletoRlResult.allowed) return _rl429(c, "Muitas tentativas. Aguarde.", boletoRlResult);
    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper não configurado." }, 400);

    const body = await c.req.json();
    // Input validation for boleto charge creation
    var boletoValid = validate(body, {
      order_id: { required: true, type: "string", maxLen: 100 },
      payer_email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      payer_name: { required: true, type: "string", maxLen: 200 },
      payer_cpf_cnpj: { required: true, type: "string", maxLen: 20, custom: validators.cpfOrCnpj },
      payer_phone: { type: "string", maxLen: 30 },
      payer_street: { type: "string", maxLen: 200 },
      payer_number: { type: "string", maxLen: 20 },
      payer_complement: { type: "string", maxLen: 100 },
      payer_district: { type: "string", maxLen: 100 },
      payer_city: { type: "string", maxLen: 100 },
      payer_state: { type: "string", maxLen: 2 },
      payer_zip_code: { type: "string", maxLen: 10 },
      items: { required: true, type: "array", maxItems: 200 },
      days_due_date: { type: "string", maxLen: 5 },
      type_bank_slip: { type: "string", maxLen: 20 },
      discount_cents: { type: "number", min: 0, max: 99999999 },
    });
    if (!boletoValid.ok) {
      return c.json({ error: boletoValid.errors[0] || "Dados invalidos." }, 400);
    }
    const {
      order_id, payer_email, payer_name, payer_cpf_cnpj, payer_phone,
      payer_street, payer_number, payer_complement, payer_district,
      payer_city, payer_state, payer_zip_code,
      items, days_due_date, notification_url, type_bank_slip,
      fixed_description, seller_description, discount_cents
    } = body;

    if (!order_id || !payer_email || !payer_name || !payer_cpf_cnpj || !items?.length) {
      return c.json({ error: "Campos obrigatórios: order_id, payer_email, payer_name, payer_cpf_cnpj, items[]" }, 400);
    }

    // SECURITY: Validate prices server-side (allow up to 45% discount for coupons — no PIX discount on boleto)
    try {
      var boletoPriceCheck = await _validatePaymentPrices(items, 45);
      console.log("[PagHiper-Boleto] Price validation: verified=" + boletoPriceCheck.verifiedCount + "/" + boletoPriceCheck.totalItems + " clientTotal=" + boletoPriceCheck.clientTotalCents + " expectedTotal=" + boletoPriceCheck.expectedTotalCents + " flagged=" + boletoPriceCheck.flaggedItems.length);
      if (!boletoPriceCheck.ok) {
        console.log("[PagHiper-Boleto] PRICE TAMPERING BLOCKED for order " + order_id + " by user " + boletoUserId + ": " + boletoPriceCheck.flaggedItems.join(", "));
        return c.json({ error: "Valores dos itens nao conferem com o catalogo. Atualize a pagina e tente novamente." }, 400);
      }
      if (boletoPriceCheck.flaggedItems.length > 0) {
        console.log("[PagHiper-Boleto] PRICE WARNING for order " + order_id + ": " + boletoPriceCheck.flaggedItems.join(", "));
      }
    } catch (pvErr2) {
      console.log("[PagHiper-Boleto] Price validation error (non-blocking): " + pvErr2);
    }

    const payload: any = {
      apiKey: creds.apiKey,
      order_id,
      payer_email,
      payer_name,
      payer_cpf_cnpj: payer_cpf_cnpj.replace(/\D/g, ""),
      payer_phone: payer_phone ? payer_phone.replace(/\D/g, "") : undefined,
      payer_street: payer_street || undefined,
      payer_number: payer_number || undefined,
      payer_complement: payer_complement || undefined,
      payer_district: payer_district || undefined,
      payer_city: payer_city || undefined,
      payer_state: payer_state || undefined,
      payer_zip_code: payer_zip_code ? payer_zip_code.replace(/\D/g, "") : undefined,
      // SECURITY: Hardcode notification_url server-side to prevent webhook hijacking
      notification_url: (Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/make-server-b7b07654/paghiper/notification",
      days_due_date: days_due_date || "3",
      type_bank_slip: type_bank_slip || "boletoA4",
      fixed_description: fixed_description !== undefined ? String(fixed_description) : undefined,
      seller_description: seller_description || undefined,
      discount_cents: discount_cents && discount_cents > 0 ? String(discount_cents) : undefined,
      items: items.map((item: any, i: number) => ({
        description: item.description || "Item " + (i + 1),
        quantity: String(item.quantity || 1),
        item_id: String(item.item_id || i + 1),
        price_cents: String(item.price_cents),
      })),
    };

    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
    console.log("[PagHiper] Boleto create for order " + order_id + (discount_cents ? " | discount_cents=" + discount_cents : ""));

    const res = await fetch(`${PAGHIPER_BOLETO_URL}/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log(`[PagHiper] Boleto create response:`, JSON.stringify(data));

    if (!res.ok || data?.create_request?.result === "reject") {
      const msg = data?.create_request?.response_message || data?.message || `HTTP ${res.status}`;
      return c.json({ error: msg, paghiperResponse: data }, 400);
    }

    const txId = data?.create_request?.transaction_id;
    if (txId) {
      await kv.set(`paghiper_tx_${txId}`, JSON.stringify({
        type: "boleto",
        order_id,
        transaction_id: txId,
        status: data?.create_request?.status || "pending",
        created_at: Date.now(),
        payer_email,
        payer_name,
        payer_cpf_cnpj,
        value_cents: items.reduce((sum: number, it: any) => sum + Number(it.price_cents) * Number(it.quantity || 1), 0),
        bank_slip: {
          digitable_line: data?.create_request?.bank_slip?.digitable_line || null,
          url_slip: data?.create_request?.bank_slip?.url_slip || null,
          url_slip_pdf: data?.create_request?.bank_slip?.url_slip_pdf || null,
        },
      }));
      await kv.set(`paghiper_order_${order_id}`, txId);
    }

    return c.json({
      success: true,
      transaction_id: txId,
      status: data?.create_request?.status,
      due_date: data?.create_request?.due_date || null,
      value_cents: data?.create_request?.value_cents || null,
      bank_slip: {
        digitable_line: data?.create_request?.bank_slip?.digitable_line || null,
        url_slip: data?.create_request?.bank_slip?.url_slip || null,
        url_slip_pdf: data?.create_request?.bank_slip?.url_slip_pdf || null,
      },
      raw: data,
    });
  } catch (e: any) {
    console.log("[PagHiper] Boleto create exception:", e);
    return c.json({ error: "Erro ao criar boleto." }, 500);
  }
});

// POST /paghiper/boleto/status — check boleto payment status (requires auth)
app.post(BASE + "/paghiper/boleto/status", async (c) => {
  try {
    var boletoStatusUserId = await getAuthUserId(c.req.raw);
    if (!boletoStatusUserId) return c.json({ error: "Autenticacao necessaria." }, 401);
    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper não configurado." }, 400);

    var bolStBody = await c.req.json();
    var bolStValid = validate(bolStBody, {
      transaction_id: { required: true, type: "string", maxLen: 100 },
    });
    if (!bolStValid.ok) return c.json({ error: "transaction_id obrigatório." }, 400);
    var transaction_id = bolStValid.sanitized.transaction_id;

    const res = await fetch(PAGHIPER_BOLETO_URL + "/status/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        token: creds.token,
        transaction_id: transaction_id,
      }),
    });

    const data = await res.json();
    console.log("[PagHiper] Boleto status for " + transaction_id + ":", JSON.stringify(data));

    const statusData = data?.status_request;
    const status = statusData?.status || "unknown";

    const existing = await kv.get(`paghiper_tx_${transaction_id}`);
    if (existing) {
      const tx = typeof existing === "string" ? JSON.parse(existing) : existing;
      tx.status = status;
      tx.status_updated_at = Date.now();
      if (statusData?.paid_date) tx.paid_date = statusData.paid_date;
      await kv.set(`paghiper_tx_${transaction_id}`, JSON.stringify(tx));
    }

    return c.json({
      transaction_id,
      status,
      status_label: translateStatus(status),
      value_cents: statusData?.value_cents || null,
      value_cents_paid: statusData?.value_cents_paid || null,
      paid_date: statusData?.paid_date || null,
      due_date: statusData?.due_date || null,
      raw: data,
    });
  } catch (e: any) {
    console.log("[PagHiper] Boleto status exception:", e);
    return c.json({ error: "Erro ao consultar status do boleto." }, 500);
  }
});

// POST /paghiper/boleto/cancel — cancel boleto (admin)
app.post(BASE + "/paghiper/boleto/cancel", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Não autorizado." }, 401);

    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper não configurado." }, 400);

    var bolCancelBody = await c.req.json();
    var bolCancelValid = validate(bolCancelBody, {
      transaction_id: { required: true, type: "string", maxLen: 100 },
    });
    if (!bolCancelValid.ok) return c.json({ error: "transaction_id obrigatório." }, 400);
    var transaction_id = bolCancelValid.sanitized.transaction_id;

    const res = await fetch(PAGHIPER_BOLETO_URL + "/cancel/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        token: creds.token,
        transaction_id: transaction_id,
        status: "canceled",
      }),
    });

    const data = await res.json();
    console.log(`[PagHiper] Boleto cancel for ${transaction_id}:`, JSON.stringify(data));

    const existing = await kv.get(`paghiper_tx_${transaction_id}`);
    if (existing) {
      const tx = typeof existing === "string" ? JSON.parse(existing) : existing;
      tx.status = "canceled";
      tx.canceled_at = Date.now();
      tx.canceled_by = userId;
      await kv.set(`paghiper_tx_${transaction_id}`, JSON.stringify(tx));
    }

    return c.json({ success: true, transaction_id, data });
  } catch (e: any) {
    console.log("[PagHiper] Boleto cancel exception:", e);
    return c.json({ error: "Erro ao cancelar boleto." }, 500);
  }
});

// ─── NOTIFICATION WEBHOOK ───

// POST /paghiper/notification — PagHiper notification callback (public, no auth)
app.post(BASE + "/paghiper/notification", async (c) => {
  try {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      // PagHiper may send as form-urlencoded
      const text = await c.req.text();
      const params = new URLSearchParams(text);
      body = Object.fromEntries(params.entries());
    }

    // Input validation for PagHiper webhook payload
    if (!body || typeof body !== "object") return c.json({ received: true, warning: "invalid body" });
    if (JSON.stringify(body).length > 10000) return c.json({ received: true, warning: "payload too large" });
    const { notification_id, idTransacao, transaction_id: txId, apiKey: notifApiKey } = body;
    const transactionId = idTransacao || txId;
    console.log("[PagHiper] Notification received: notification_id=" + notification_id + ", transactionId=" + transactionId);

    if (!transactionId) {
      console.log("[PagHiper] Notification missing transactionId, body:", JSON.stringify(body));
      return c.json({ received: true, warning: "missing transactionId" });
    }

    // Verify credentials and validate apiKey from notification matches ours
    const creds = await getPagHiperCredentials();
    if (!creds) {
      console.log("[PagHiper] Notification: no credentials configured");
      return c.json({ received: true, warning: "no credentials" });
    }

    // PagHiper includes apiKey in webhook payload — verify it matches our configured key
    // SECURITY: require apiKey presence (not just mismatch) to prevent bypass via omission
    if (!notifApiKey || notifApiKey !== creds.apiKey) {
      console.log("[PagHiper] Notification: apiKey missing or mismatch, rejecting.");
      return c.json({ received: false, error: "invalid apiKey" }, 403);
    }

    const existing = await kv.get("paghiper_tx_" + transactionId);
    const txType = existing
      ? (typeof existing === "string" ? JSON.parse(existing) : existing).type || "pix"
      : "pix";

    const statusUrl = txType === "boleto"
      ? PAGHIPER_BOLETO_URL + "/status/"
      : PAGHIPER_PIX_URL + "/status/";

    const res = await fetch(statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        token: creds.token,
        transaction_id: transactionId,
      }),
    });

    const data = await res.json();
    const statusData = data?.status_request;
    const status = statusData?.status || "unknown";

    console.log("[PagHiper] Notification: tx=" + transactionId + " type=" + txType + " status=" + status);

    if (existing) {
      const tx = typeof existing === "string" ? JSON.parse(existing) : existing;
      tx.status = status;
      tx.status_updated_at = Date.now();
      tx.notification_id = notification_id;
      if (statusData?.paid_date) tx.paid_date = statusData.paid_date;
      if (statusData?.value_cents_paid) tx.value_cents_paid = Number(statusData.value_cents_paid);
      await kv.set("paghiper_tx_" + transactionId, JSON.stringify(tx));
    }

    await kv.set("paghiper_notif_" + Date.now(), JSON.stringify({
      notification_id,
      transaction_id: transactionId,
      type: txType,
      status,
      received_at: Date.now(),
      raw: body,
    }));

    // If payment confirmed, update user_order status + send payment email
    if (status === "paid" || status === "completed") {
      try {
        // Find the order by transactionId — scan user_order: entries
        var allUserOrders = await kv.getByPrefix("user_order:");
        if (Array.isArray(allUserOrders)) {
          for (var pni = 0; pni < allUserOrders.length; pni++) {
            try {
              var pnOrder = typeof allUserOrders[pni] === "string" ? JSON.parse(allUserOrders[pni]) : allUserOrders[pni];
              if (pnOrder.transactionId === transactionId && pnOrder.status !== "paid") {
                pnOrder.status = "paid";
                pnOrder.paidAt = new Date().toISOString();
                pnOrder.emailSent = true;
                var pnKey = "user_order:" + (pnOrder.createdBy || "") + ":" + (pnOrder.localOrderId || "");
                await kv.set(pnKey, JSON.stringify(pnOrder));
                console.log("[PagHiper] Notification: updated order " + pnOrder.localOrderId + " to paid");
                // Send payment approved email (fire-and-forget)
                _sendPaymentApprovedEmail(pnOrder).catch(function(pe2) {
                  console.log("[PagHiper] Payment email error (non-fatal): " + pe2);
                });
                // Confirm SIGE order to trigger stock deduction
                if (pnOrder.sigeOrderId) {
                  confirmSigeOrder(String(pnOrder.sigeOrderId)).catch(function(ce3) {
                    console.log("[PagHiper] SIGE confirm error (non-fatal): " + (ce3.message || ce3));
                  });
                }
                break;
              }
            } catch (pnErr) { /* skip */ }
          }
        }
      } catch (pnEx) {
        console.log("[PagHiper] Notification order update error (non-fatal): " + pnEx);
      }
    }

    return c.json({ received: true, status });
  } catch (e: any) {
    console.log("[PagHiper] Notification exception:", e);
    return c.json({ received: true }, 500);
  }
});

// ─── TRANSACTIONS LIST (admin) ───

// GET /paghiper/transactions — list all PagHiper transactions
app.get(BASE + "/paghiper/transactions", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const entries = await kv.getByPrefix("paghiper_tx_");
    const transactions: any[] = [];

    if (entries && entries.length > 0) {
      for (const entry of entries) {
        try {
          const val = typeof entry.value === "string" ? JSON.parse(entry.value) : entry.value;
          transactions.push(val);
        } catch {}
      }
    }

    transactions.sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0));
    return c.json({ transactions, total: transactions.length });
  } catch (e: any) {
    console.log("[PagHiper] Transactions list error:", e);
    return c.json({ error: "Erro ao listar transacoes PagHiper." }, 500);
  }
});

// GET /paghiper/transaction/:id — get single transaction
app.get(BASE + "/paghiper/transaction/:id", async (c) => {
  try {
    const txId = (c.req.param("id") || "").substring(0, 100);
    if (!txId) return c.json({ error: "ID invalido." }, 400);
    const raw = await kv.get(`paghiper_tx_${txId}`);
    if (!raw) return c.json({ error: "Transação não encontrada." }, 404);
    const tx = typeof raw === "string" ? JSON.parse(raw) : raw;
    return c.json(tx);
  } catch (e: any) {
    console.log("[PagHiper] Transaction get error:", e);
    return c.json({ error: "Erro ao buscar transação." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE INTEGRATION: CUSTOMER SYNC ─
// ═══════════════════════════════════════

// Helper: build SIGE customer payload from site user profile
// IMPORTANT: SIGE expects "endereco" as a NESTED object, not flat fields.
// Top-level: tipoCadastro, nomeCadastro, apelido, cpfCgc, tipoFJ, uf, observacao, email
// Nested optional: endereco { tipoEndereco, cep, endereco, bairro, cidade, numero, uf, fone, email }
function buildSigeCustomerPayload(profile: any): any {
  if (!profile) return { tipoCadastro: "C", nomeCadastro: "Cliente Site" };
  const cpfClean = (profile.cpf || "").replace(/\D/g, "");
  const phoneClean = (profile.phone || "").replace(/\D/g, "");
  const cepClean = (profile.cep || "").replace(/\D/g, "");
  const isCnpj = cpfClean.length === 14;

  const payload: any = {
    tipoCadastro: "C",
    nomeCadastro: (profile.name || profile.email || "Cliente Site").substring(0, 100),
    apelido: ((profile.name || "").split(" ")[0] || "").substring(0, 50),
    tipoFJ: isCnpj ? "J" : "F",
    observacao: `Cliente sincronizado do site. ID Supabase: ${profile.id || "?"}`,
  };

  if (cpfClean) payload.cpfCgc = cpfClean;
  if (profile.email) payload.email = profile.email;
  if (profile.state) payload.uf = profile.state;

  // Build nested endereco object only if we have address data
  const addressStr = profile.address || "";
  const cityStr = profile.city || "";
  if (addressStr || cityStr || cepClean) {
    payload.endereco = {
      tipoEndereco: "F",
      ...(cepClean ? { cep: cepClean } : {}),
      ...(addressStr ? { endereco: addressStr } : {}),
      ...(cityStr ? { cidade: cityStr } : {}),
      ...(profile.state ? { uf: profile.state } : {}),
      ...(phoneClean ? { fone: phoneClean } : {}),
      ...(profile.email ? { email: profile.email } : {}),
    };
  }

  return payload;
}

// Helper: search SIGE for existing customer by CPF, return codCadastro if found
async function findSigeCustomerByCpf(cpf: string): Promise<{ found: boolean; sigeCustomerId?: string; customerData?: any }> {
  if (!cpf) return { found: false };
  try {
    const result = await sigeAuthFetch("GET", `/customer?cpfCgc=${encodeURIComponent(cpf)}&limit=1&offset=1`);
    if (!result.ok) return { found: false };
    const dados = result.data?.dados || result.data?.data || (Array.isArray(result.data) ? result.data : []);
    const list = Array.isArray(dados) ? dados : [dados].filter(Boolean);
    if (list.length > 0 && list[0]) {
      const cust = list[0];
      const id = cust.codCadastro || cust.id || cust.codigo || null;
      if (id) return { found: true, sigeCustomerId: String(id), customerData: cust };
    }
    return { found: false };
  } catch (e) {
    console.log("findSigeCustomerByCpf exception:", e);
    return { found: false };
  }
}

// SECURITY: strip raw SIGE data from mapping before returning to end users
function _sanitizeMappingForUser(mapping: any) {
  return {
    siteUserId: mapping.siteUserId,
    sigeCustomerId: mapping.sigeCustomerId,
    syncedAt: mapping.syncedAt || null,
  };
}

// Helper: save mapping between site user and SIGE customer
async function saveSigeCustomerMapping(siteUserId: string, sigeCustomerId: string | null, sigeData: any, profile: any) {
  const mapping = {
    siteUserId,
    sigeCustomerId,
    sigeResponse: sigeData,
    syncedAt: new Date().toISOString(),
    profile: { name: profile?.name || "", email: profile?.email || "", cpf: profile?.cpf || "" },
  };
  await kv.set(`sige_customer_map:${siteUserId}`, JSON.stringify(mapping));
  if (sigeCustomerId) {
    await kv.set(`sige_customer_reverse:${sigeCustomerId}`, JSON.stringify({ siteUserId }));
  }
  return mapping;
}

// POST /sige/sync-customer — sync a site user to SIGE
app.post(BASE + "/sige/sync-customer", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var scBody = await c.req.json();
    var scValid = validate(scBody, {
      siteUserId: { required: true, type: "string", maxLen: 100 },
    });
    if (!scValid.ok) return c.json({ error: scValid.errors[0] || "Dados invalidos." }, 400);
    var siteUserId = scValid.sanitized.siteUserId;

    // SECURITY: prevent IDOR — user can only sync their own account
    if (siteUserId !== userId) {
      console.log("SIGE sync-customer IDOR blocked: auth=" + userId + " body=" + siteUserId);
      return c.json({ error: "Acesso negado." }, 403);
    }

    // Check if already synced
    const existingMap = await kv.get(`sige_customer_map:${siteUserId}`);
    if (existingMap) {
      const mapped = typeof existingMap === "string" ? JSON.parse(existingMap) : existingMap;
      console.log("SIGE sync-customer: user " + siteUserId + " already mapped to SIGE customer " + mapped.sigeCustomerId);
      return c.json({ alreadySynced: true, mapping: _sanitizeMappingForUser(mapped) });
    }

    // Load profile
    const rawProfile = await kv.get(`user_profile:${siteUserId}`);
    if (!rawProfile) return c.json({ error: "Perfil do usuário não encontrado no KV." }, 404);
    const profile = typeof rawProfile === "string" ? JSON.parse(rawProfile) : rawProfile;
    const cpfClean = (profile.cpf || "").replace(/\D/g, "");

    // Step 1: If CPF exists, search SIGE for existing customer to avoid duplicate
    if (cpfClean) {
      console.log(`SIGE sync-customer: searching SIGE by CPF ${cpfClean}...`);
      const existing = await findSigeCustomerByCpf(cpfClean);
      if (existing.found && existing.sigeCustomerId) {
        console.log("SIGE sync-customer: FOUND existing SIGE customer " + existing.sigeCustomerId + " for CPF " + cpfClean + ", linking without creating");
        const mapping = await saveSigeCustomerMapping(siteUserId, existing.sigeCustomerId, existing.customerData, profile);
        return c.json({ synced: true, linkedExisting: true, mapping: _sanitizeMappingForUser(mapping) });
      }
    }

    // Step 2: Create new customer in SIGE
    const sigePayload = buildSigeCustomerPayload(profile);
    console.log("SIGE sync-customer: creating customer in SIGE:", JSON.stringify(sigePayload));

    const result = await sigeAuthFetch("POST", "/customer", sigePayload);
    if (!result.ok) {
      const errMsg = result.data?.message || result.data?.error || "";

      // If SIGE says CPF already exists, try to find and link
      if (errMsg.toLowerCase().includes("cpf") || errMsg.toLowerCase().includes("cnpj") || errMsg.toLowerCase().includes("cadastro")) {
        console.log(`SIGE sync-customer: creation rejected (${errMsg}), attempting to find and link...`);
        if (cpfClean) {
          const fallback = await findSigeCustomerByCpf(cpfClean);
          if (fallback.found && fallback.sigeCustomerId) {
            console.log("SIGE sync-customer: fallback FOUND customer " + fallback.sigeCustomerId + ", linking");
            const mapping = await saveSigeCustomerMapping(siteUserId, fallback.sigeCustomerId, fallback.customerData, profile);
            return c.json({ synced: true, linkedExisting: true, mapping: _sanitizeMappingForUser(mapping) });
          }
        }
        // Also try searching by name/email as last resort
        if (profile.email) {
          try {
            const byName = await sigeAuthFetch("GET", `/customer?nomeCadastro=${encodeURIComponent(profile.name || profile.email)}&limit=5&offset=1`);
            if (byName.ok) {
              const dados = byName.data?.dados || byName.data?.data || (Array.isArray(byName.data) ? byName.data : []);
              const list = Array.isArray(dados) ? dados : [dados].filter(Boolean);
              const match = list.find((c: any) => c.email === profile.email || c.cpfCgc === cpfClean);
              if (match) {
                const matchId = String(match.codCadastro || match.id || match.codigo);
                console.log("SIGE sync-customer: found by name/email search: " + matchId);
                const mapping = await saveSigeCustomerMapping(siteUserId, matchId, match, profile);
                return c.json({ synced: true, linkedExisting: true, mapping: _sanitizeMappingForUser(mapping) });
              }
            }
          } catch (searchErr) {
            console.log("SIGE sync-customer: name search fallback failed:", searchErr);
          }
        }
      }

      console.log("SIGE sync-customer: SIGE error:", result.status, JSON.stringify(result.data));
      return _sigeProxyError(c, result);
    }

    // Extract SIGE customer ID
    const sigeData = result.data;
    const dados = sigeData?.dados || sigeData?.data || sigeData;
    const sigeCustomerId = dados?.codCadastro || dados?.id || dados?.codigo ||
      (Array.isArray(dados) && dados[0]?.codCadastro) || null;

    const mapping = await saveSigeCustomerMapping(siteUserId, sigeCustomerId ? String(sigeCustomerId) : null, dados, profile);

    console.log("SIGE sync-customer: SUCCESS, site user " + siteUserId + " -> SIGE customer " + sigeCustomerId);
    return c.json({ synced: true, mapping: _sanitizeMappingForUser(mapping) });
  } catch (e: any) {
    console.log("SIGE sync-customer exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// GET /sige/sync-customer/status — list all site clients with SIGE sync status
app.get(BASE + "/sige/sync-customer/status", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const profilesRaw = await kv.getByPrefix("user_profile:");
    const profiles: any[] = [];
    if (Array.isArray(profilesRaw)) {
      for (const raw of profilesRaw) {
        try { profiles.push(typeof raw === "string" ? JSON.parse(raw) : raw); } catch {}
      }
    }

    const mappingsRaw = await kv.getByPrefix("sige_customer_map:");
    const mappingsMap = new Map<string, any>();
    if (Array.isArray(mappingsRaw)) {
      for (const raw of mappingsRaw) {
        try {
          const m = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (m.siteUserId) mappingsMap.set(m.siteUserId, m);
        } catch {}
      }
    }

    let authUsers: any[] = [];
    try {
      authUsers = await _listAllAuthUsersPaginated();
    } catch {}
    const authMap = new Map<string, any>();
    for (const u of authUsers) authMap.set(u.id, u);

    const clients = profiles.map((p: any) => {
      const authUser = authMap.get(p.id);
      const mapping = mappingsMap.get(p.id);
      return {
        id: p.id,
        email: authUser?.email || p.email || "",
        name: p.name || authUser?.user_metadata?.name || "",
        phone: p.phone || "",
        cpf: p.cpf || "",
        address: p.address || "",
        city: p.city || "",
        state: p.state || "",
        cep: p.cep || "",
        created_at: p.created_at || authUser?.created_at || "",
        sigeSynced: !!mapping,
        sigeCustomerId: mapping?.sigeCustomerId || null,
        sigeSyncedAt: mapping?.syncedAt || null,
      };
    });

    clients.sort((a: any, b: any) => {
      const da = new Date(a.created_at).getTime() || 0;
      const db = new Date(b.created_at).getTime() || 0;
      return db - da;
    });

    console.log(`SIGE sync-customer status: ${clients.length} clients, ${mappingsMap.size} synced`);
    return c.json({ clients, total: clients.length, synced: mappingsMap.size });
  } catch (e: any) {
    console.log("SIGE sync-customer status exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// DELETE /sige/sync-customer/:siteUserId — remove SIGE mapping
app.delete(BASE + "/sige/sync-customer/:siteUserId", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const siteUserId = (c.req.param("siteUserId") || "").substring(0, 200);
    if (!siteUserId) return c.json({ error: "ID invalido." }, 400);

    const existingMap = await kv.get(`sige_customer_map:${siteUserId}`);
    if (existingMap) {
      const mapped = typeof existingMap === "string" ? JSON.parse(existingMap) : existingMap;
      if (mapped.sigeCustomerId) {
        await kv.del(`sige_customer_reverse:${mapped.sigeCustomerId}`);
      }
    }

    await kv.del(`sige_customer_map:${siteUserId}`);
    console.log(`SIGE sync-customer: removed mapping for site user ${siteUserId}`);
    return c.json({ removed: true });
  } catch (e: any) {
    console.log("SIGE sync-customer delete exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// GET /sige/my-mapping — check current user's SIGE customer mapping (for checkout)
app.get(BASE + "/sige/my-mapping", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const existingMap = await kv.get(`sige_customer_map:${userId}`);
    if (existingMap) {
      const mapped = typeof existingMap === "string" ? JSON.parse(existingMap) : existingMap;
      console.log("SIGE my-mapping: user " + userId + " -> SIGE customer " + mapped.sigeCustomerId);
      // SECURITY: strip sigeResponse to avoid exposing raw SIGE data to end users
      return c.json({ found: true, sigeCustomerId: mapped.sigeCustomerId, syncedAt: mapped.syncedAt || null });
    }

    console.log(`SIGE my-mapping: user ${userId} has no SIGE mapping`);
    return c.json({ found: false, sigeCustomerId: null });
  } catch (e: any) {
    console.log("SIGE my-mapping exception:", e);
    return c.json({ error: "Erro ao buscar mapeamento." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE INTEGRATION: CREATE SALE ───
// ═══════════════════════════════════════

// POST /sige/create-sale — create a complete sale (3-step flow):
//   Step 1: POST /order — create order WITH items (flat JSON, NO "dados" wrapper)
//   Step 2: POST /order/{orderId}/observation — add observacao SEPARATELY
//   Step 3: GET /order/{orderId} + GET /order-items/{orderId} — confirm
//
// LESSONS LEARNED from diagnostic endpoint (sige/debug-create-order):
//   1. MUST use flat JSON — "dados" wrapper causes "Campos requeridos: codCliFor,codTipoMv,items"
//   2. codRef is REQUIRED inside each item — without it: "Campos requeridos: items -> codRef"
//   3. codRef must be the ACTUAL reference code from SIGE (NOT codProduto!)
//      SIGE concatenates codProduto-codRef for product lookup.
//      Using codRef=codProduto causes "Produto nao encontrado [codProduto-codProduto]"
//      The backend now auto-resolves codRef via GET /product/{id}/reference
//   4. No redirect issues (HTTP 400 direct, no 301/302)
//   5. codTipoMv must be a NUMERIC STRING matching GET /type-moviment:
//      "704" = Pedido de Venda - Ecommerce (PVE) ← DEFAULT
//      "700" = Pedido de Venda (PVE) ← generic
//      "600" = Orcamento de Venda (ORV) ← quote
//
// Order fields:
//   Required: codCliFor (NUMBER), codTipoMv (STRING), items (ARRAY)
//   Optional: codFilial, codCondPgto, codLocal, codVendComp, codTransportador1,
//             tipoFrete1, nomeAux, numDoctoAux, codCarteira, codLista,
//             codCategoria, codMoeda, codAtividade, observacaoInterna (STRING)
//
// Item fields (inside items array):
//   REQUIRED: codProduto, codRef (auto-resolved from SIGE references), qtdeUnd, valorUnitario
//   AUTO-SET: atlzSaldoV3 = "S" (auto-update stock balance in SIGE V3 on order creation)
//   OPTIONAL: valorDesconto, valorFrete, valorEncargos, valorSeguro, valorIpi,
//             numLote, qtdeV1, qtdeV2, codMensagem, codCbenef, url, ncm
//
// Observation (POST /order/{id}/observation):
//   { descMensagem1..4, observacao } — all STRING fields, sent AFTER order creation
app.post(BASE + "/sige/create-sale", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    // Rate limit: 5 SIGE orders per minute per IP
    var csRl = _getRateLimitKey(c, "create_sale");
    var csRlResult = _checkRateLimit(csRl, 5);
    if (!csRlResult.allowed) return _rl429(c, "Muitas tentativas. Aguarde.", csRlResult);

    const body = await c.req.json();
    // Input validation for create-sale
    var csValid = validate(body, {
      codCliente: { required: true, type: "string", maxLen: 50 },
      items: { required: true, type: "array", maxItems: 100 },
      observacao: { type: "string", maxLen: 2000 },
      observacaoInterna: { type: "string", maxLen: 2000 },
      tipoPedido: { type: "string", maxLen: 20 },
      codVendedor: { type: "string", maxLen: 50 },
      codFilial: { type: "string", maxLen: 50 },
      codDeposito: { type: "string", maxLen: 50 },
      codCondPgto: { type: "string", maxLen: 50 },
      codTransportador: { type: "string", maxLen: 50 },
      tipoFrete: { type: "string", maxLen: 10 },
    });
    if (!csValid.ok) {
      return c.json({ error: csValid.errors[0] || "Dados invalidos." }, 400);
    }
    // Validate each item in items array
    if (Array.isArray(body.items)) {
      for (var csi = 0; csi < body.items.length; csi++) {
        var itm = body.items[csi];
        if (!itm || typeof itm !== "object") {
          return c.json({ error: "Item " + csi + " invalido." }, 400);
        }
        if (!itm.codProduto && !itm.sku) {
          return c.json({ error: "Item " + csi + " sem codProduto/sku." }, 400);
        }
        if (itm.qtd !== undefined && (Number(itm.qtd) <= 0 || Number(itm.qtd) > 9999)) {
          return c.json({ error: "Item " + csi + " com quantidade invalida." }, 400);
        }
      }
    }
    const {
      codCliente, items, observacao, observacaoInterna,
      tipoPedido, codVendedor, codFilial, codDeposito,
      codCondPgto, codTransportador, tipoFrete,
      nomeAux, numDoctoAux, codCarteira, codLista,
      codCategoria, codMoeda, codAtividade,
    } = body;

    if (!codCliente) return c.json({ error: "codCliente é obrigatório." }, 400);
    if (!items || !Array.isArray(items) || items.length === 0) {
      return c.json({ error: "items deve ser um array com pelo menos 1 item." }, 400);
    }

    // SECURITY: Validate codCliente belongs to the authenticated user (prevent IDOR)
    try {
      var mapRaw = await kv.get("sige_customer_map:" + userId);
      var userMap = mapRaw ? (typeof mapRaw === "string" ? JSON.parse(mapRaw) : mapRaw) : null;
      if (!userMap || String(userMap.sigeCustomerId) !== String(codCliente)) {
        console.log("[create-sale] IDOR blocked: userId=" + userId + " sent codCliente=" + codCliente + " but mapped=" + (userMap ? userMap.sigeCustomerId : "none"));
        return c.json({ error: "codCliente não pertence ao usuário autenticado." }, 403);
      }
    } catch (mapErr) {
      console.log("[create-sale] SIGE mapping lookup error:", mapErr);
      return c.json({ error: "Erro ao verificar mapeamento SIGE." }, 500);
    }

    const steps: any[] = [];

    // ── Resolve correct codRef for each item from SIGE product references ──
    // CRITICAL: codRef is REQUIRED by SIGE API! "Campos requeridos: items -> codRef"
    // codRef is the REFERENCE code within a product (variation), NOT a copy of codProduto!
    // SIGE concatenates codProduto-codRef for lookup, so wrong codRef = "product not found".
    // Example: codProduto="029161-493", codRef="029161-493" → lookup "029161-493-029161-493" ← WRONG!
    //          codProduto="029161-493", codRef="UNICA"      → lookup "029161-493-UNICA"      ← CORRECT!

    // Helper: resolve the correct SIGE codProduto and codRef for a SKU
    // STRATEGY ORDER:
    //   1. Explicit codRef from caller (if different from SKU)
    //   2. Global /reference?codProduto=XXX (MOST RELIABLE - always works)
    //   3. /product/{id}/reference (only works with numeric IDs)
    //   4. SKU split inference
    //   5. Fallback "0" (most common default in SIGE, NOT "UNICA")
    async function resolveProductRef(sku: string, explicitCodRef?: string): Promise<{ codProduto: string; codRef: string; _debug?: any }> {
      const debug: any = { sku, explicitCodRef, strategies: [] };

      // If caller provided a codRef that is NOT the same as codProduto, trust it
      if (explicitCodRef && explicitCodRef !== sku) {
        debug.strategies.push({ name: "explicit_codRef", result: "used", codRef: explicitCodRef });
        return { codProduto: sku, codRef: explicitCodRef, _debug: debug };
      }

      // 1. Check sige_map for mapping info
      let sigeCodProduto = sku;
      let sigeId = sku;
      try {
        const mapEntry = await kv.get(`sige_map_${sku}`);
        if (mapEntry) {
          const map = typeof mapEntry === "string" ? JSON.parse(mapEntry) : mapEntry;
          if (map.codProduto) sigeCodProduto = String(map.codProduto);
          if (map.sigeId) sigeId = String(map.sigeId);
          debug.strategies.push({ name: "kv_sige_map", found: true, map });
        } else {
          debug.strategies.push({ name: "kv_sige_map", found: false });
        }
      } catch (e: any) {
        debug.strategies.push({ name: "kv_sige_map", error: e.message });
      }

      // Helper: extract refs array from API response
      function extractRefsArr(data: any): any[] {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (data?.dados && Array.isArray(data.dados)) return data.dados;
        if (data?.data && Array.isArray(data.data)) return data.data;
        if (data?.items && Array.isArray(data.items)) return data.items;
        if (data && typeof data === "object" && data.codRef !== undefined) return [data];
        return [];
      }
      // Helper: extract products array from API response
      function extractProdsForRef(data: any): any[] {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (data?.dados && Array.isArray(data.dados)) return data.dados;
        if (data?.data && Array.isArray(data.data)) return data.data;
        if (data?.items && Array.isArray(data.items)) return data.items;
        if (data?.content && Array.isArray(data.content)) return data.content;
        if (data?.codProduto || data?.id) return [data];
        return [];
      }

      // 2. PRIMARY (per API docs): GET /product/{sku}/reference
      //    API docs confirm {id} accepts full hyphenated SKU strings like "012561-227".
      //    Also supports optional ?codRef= query param to narrow results.
      //    This is the MOST DIRECT approach.
      let skuBasePart: string | null = null;
      let skuSuffix: string | null = null;
      if (sku.includes("-")) {
        const lastHyphen = sku.lastIndexOf("-");
        skuBasePart = sku.substring(0, lastHyphen);
        skuSuffix = sku.substring(lastHyphen + 1);
        debug.skuSplit = { basePart: skuBasePart, suffix: skuSuffix };
        console.log(`SIGE create-sale: [REF-RESOLVE] SKU contains hyphen: base="${skuBasePart}", suffix="${skuSuffix}"`);
      }

      // Try the reference endpoint with multiple ID candidates
      const idsForRefLookup = [...new Set([sku, ...(skuBasePart ? [skuBasePart] : []), sigeCodProduto, sigeId])];
      for (const pid of idsForRefLookup) {
        try {
          // Use ?codRef= to narrow when we have a suffix and pid is the full SKU or base part
          const codRefParam = (skuSuffix && (pid === sku || pid === skuBasePart))
            ? `?codRef=${encodeURIComponent(skuSuffix)}` : "";
          const refPath = `/product/${encodeURIComponent(pid)}/reference${codRefParam}`;
          console.log(`SIGE create-sale: [REF-RESOLVE] Strategy 2 (PRIMARY): GET ${refPath}`);
          const refResult = await sigeAuthFetch("GET", refPath);
          const rawStr = JSON.stringify(refResult.data).substring(0, 500);
          console.log(`SIGE create-sale: [REF-RESOLVE] Strategy 2 response for ${pid}: HTTP ${refResult.status}, data=${rawStr}`);

          if (refResult.ok && refResult.data) {
            const refs = extractRefsArr(refResult.data);
            debug.strategies.push({
              name: `product_ref_direct_${pid}`,
              path: refPath,
              status: refResult.status,
              ok: true,
              refsFound: refs.length,
              firstRef: refs.length > 0 ? refs[0] : null,
              rawDataKeys: refResult.data && typeof refResult.data === "object" ? Object.keys(refResult.data) : [],
            });

            if (refs.length > 0) {
              // Prefer matching ref by suffix if available
              let activeRef: any = null;
              if (skuSuffix) {
                activeRef = refs.find((r: any) => String(r.codRef) === skuSuffix && r.status === "A")
                  || refs.find((r: any) => String(r.codRef) === skuSuffix);
              }
              if (!activeRef) {
                activeRef = refs.find((r: any) => r.status === "A") || refs[0];
              }
              if (activeRef?.codRef !== undefined && activeRef?.codRef !== null) {
                const resolvedCodRef = String(activeRef.codRef);
                const resolvedCodProduto = String(activeRef.codProduto || pid);
                console.log(`SIGE create-sale: [REF-RESOLVE] SUCCESS for ${sku}: codProduto="${resolvedCodProduto}", codRef="${resolvedCodRef}" via GET /product/${pid}/reference`);
                return { codProduto: resolvedCodProduto, codRef: resolvedCodRef, _debug: debug };
              }
            }
          } else {
            debug.strategies.push({
              name: `product_ref_direct_${pid}`,
              path: refPath,
              status: refResult.status,
              ok: false,
              rawData: JSON.stringify(refResult.data).substring(0, 300),
            });
          }
        } catch (e: any) {
          console.log(`SIGE create-sale: [REF-RESOLVE] Strategy 2 error for ${pid}:`, e.message);
          debug.strategies.push({ name: `product_ref_direct_${pid}`, error: e.message });
        }
      }

      // 3. SECONDARY: Search product via GET /product?codProduto=XXX
      //    If the /reference endpoint didn't work, try searching the product.
      const codProdutosToTry = [...new Set([sigeCodProduto, sku, ...(skuBasePart ? [skuBasePart] : [])])];
      for (const cprod of codProdutosToTry) {
        try {
          console.log(`SIGE create-sale: [REF-RESOLVE] Strategy 3: Searching GET /product?codProduto=${cprod}`);
          const prodSearchRes = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(cprod)}&limit=1&offset=1`);
          console.log(`SIGE create-sale: [REF-RESOLVE] Strategy 3 response for ${cprod}: HTTP ${prodSearchRes.status}, data=${JSON.stringify(prodSearchRes.data).substring(0, 500)}`);
          if (prodSearchRes.ok && prodSearchRes.data) {
            const prods = extractProdsForRef(prodSearchRes.data);
            if (prods.length > 0) {
              const prod = prods[0];
              const numericId = prod.id || prod.codProduto;
              const actualCodProduto = String(prod.codProduto || cprod);
              console.log(`SIGE create-sale: [REF-RESOLVE] Found product ${cprod} -> id=${numericId}, codProduto=${actualCodProduto}, keys=${Object.keys(prod).join(",")}`);
              debug.strategies.push({
                name: `product_search_${cprod}`,
                found: true,
                numericId,
                prodCodProduto: actualCodProduto,
                prodKeys: Object.keys(prod),
              });

              // If we found product via base part, suffix IS the codRef
              if (skuBasePart && cprod === skuBasePart && skuSuffix) {
                console.log(`SIGE create-sale: [REF-RESOLVE] SUCCESS for ${sku}: SKU split => codProduto="${actualCodProduto}", codRef="${skuSuffix}"`);
                debug.strategies.push({
                  name: "sku_hyphen_split",
                  result: "used",
                  codProduto: actualCodProduto,
                  codRef: skuSuffix,
                });
                return { codProduto: actualCodProduto, codRef: skuSuffix, _debug: debug };
              }

              // Try /product/{numericId}/reference if we haven't tried this ID yet
              if (numericId && !idsForRefLookup.includes(String(numericId))) {
                try {
                  console.log(`SIGE create-sale: [REF-RESOLVE] Strategy 3b: GET /product/${numericId}/reference`);
                  const refResult = await sigeAuthFetch("GET", `/product/${encodeURIComponent(numericId)}/reference`);
                  const refs = extractRefsArr(refResult.data);
                  debug.strategies.push({
                    name: `product_ref_by_id_${numericId}`,
                    status: refResult.status,
                    ok: refResult.ok,
                    refsFound: refs.length,
                    firstRef: refs.length > 0 ? refs[0] : null,
                  });
                  if (refResult.ok && refs.length > 0) {
                    let activeRef: any = null;
                    if (skuSuffix) {
                      activeRef = refs.find((r: any) => String(r.codRef) === skuSuffix && r.status === "A")
                        || refs.find((r: any) => String(r.codRef) === skuSuffix);
                    }
                    if (!activeRef) {
                      activeRef = refs.find((r: any) => r.status === "A") || refs[0];
                    }
                    if (activeRef?.codRef !== undefined && activeRef?.codRef !== null) {
                      const resolvedCodRef = String(activeRef.codRef);
                      console.log(`SIGE create-sale: [REF-RESOLVE] SUCCESS for ${sku}: codProduto="${actualCodProduto}", codRef="${resolvedCodRef}" via product search + ref lookup`);
                      return { codProduto: actualCodProduto, codRef: resolvedCodRef, _debug: debug };
                    }
                  }
                } catch (e: any) {
                  console.log(`SIGE create-sale: [REF-RESOLVE] Ref lookup by ID error:`, e.message);
                  debug.strategies.push({ name: `product_ref_by_id_${numericId}`, error: e.message });
                }
              }
            } else {
              debug.strategies.push({ name: `product_search_${cprod}`, found: false, status: prodSearchRes.status });
            }
          } else {
            debug.strategies.push({ name: `product_search_${cprod}`, found: false, status: prodSearchRes.status, ok: false });
          }
        } catch (e: any) {
          console.log(`SIGE create-sale: [REF-RESOLVE] Product search error for ${cprod}:`, e.message);
          debug.strategies.push({ name: `product_search_${cprod}`, error: e.message });
        }
      }

      // 4. FALLBACK: Global /reference?codProduto=XXX endpoint
      //    WARNING: This endpoint often ignores the filter and returns ALL refs.
      const codProdutosToTryRef = [...new Set([sigeCodProduto, sku, ...(skuBasePart ? [skuBasePart] : [])])];
      for (const cprod of codProdutosToTryRef) {
        try {
          console.log(`SIGE create-sale: [REF-RESOLVE] Strategy 4: GET /reference?codProduto=${cprod}`);
          const refResult = await sigeAuthFetch("GET", `/reference?codProduto=${encodeURIComponent(cprod)}`);
          if (refResult.ok && refResult.data) {
            const allRefs = extractRefsArr(refResult.data);
            const matchingRefs = allRefs.filter((r: any) => {
              const refCodProd = String(r.codProduto || "");
              return refCodProd === cprod || refCodProd === sku || refCodProd === sigeCodProduto
                || (skuBasePart && refCodProd === skuBasePart);
            });
            debug.strategies.push({
              name: `global_ref_filtered_${cprod}`,
              status: refResult.status,
              totalRefsReturned: allRefs.length,
              matchingRefs: matchingRefs.length,
              firstMatch: matchingRefs.length > 0 ? matchingRefs[0] : null,
              firstUnfiltered: allRefs.length > 0 ? { codProduto: allRefs[0].codProduto, codRef: allRefs[0].codRef } : null,
            });
            if (matchingRefs.length > 0) {
              const activeRef = matchingRefs.find((r: any) => r.status === "A") || matchingRefs[0];
              if (activeRef?.codRef !== undefined && activeRef?.codRef !== null) {
                const resolvedCodRef = String(activeRef.codRef);
                console.log(`SIGE create-sale: [REF-RESOLVE] SUCCESS for ${sku}: codRef="${resolvedCodRef}" via filtered global /reference`);
                return { codProduto: sigeCodProduto, codRef: resolvedCodRef, _debug: debug };
              }
            } else if (allRefs.length > 0) {
              console.log(`SIGE create-sale: [REF-RESOLVE] Global ref returned ${allRefs.length} refs but NONE match codProduto=${cprod}`);
            }
          } else {
            debug.strategies.push({ name: `global_ref_filtered_${cprod}`, status: refResult.status, ok: false });
          }
        } catch (e: any) {
          console.log(`SIGE create-sale: [REF-RESOLVE] Global ref error for ${cprod}:`, e.message);
          debug.strategies.push({ name: `global_ref_filtered_${cprod}`, error: e.message });
        }
      }

      // 5. SKU split inference (from KV sigeCodProduto)
      if (sku !== sigeCodProduto && sku.toLowerCase().startsWith(sigeCodProduto.toLowerCase())) {
        const rest = sku.substring(sigeCodProduto.length).replace(/^[-_.\s]/, "");
        if (rest) {
          console.log(`SIGE create-sale: [REF-RESOLVE] Inferred codRef from SKU split: "${rest}"`);
          debug.strategies.push({ name: "sku_split", codRef: rest });
          return { codProduto: sigeCodProduto, codRef: rest, _debug: debug };
        }
      }

      // 5b. If SKU has a hyphen and all API strategies failed, use the hyphen split directly.
      //     This is the last "educated guess" before the fallback "0".
      //     E.g. "103716-347" → codProduto="103716", codRef="347"
      if (skuBasePart && skuSuffix) {
        console.log(`SIGE create-sale: [REF-RESOLVE] Using hyphen-split fallback: codProduto="${skuBasePart}", codRef="${skuSuffix}"`);
        debug.strategies.push({
          name: "sku_hyphen_split_fallback",
          codProduto: skuBasePart,
          codRef: skuSuffix,
          explanation: `All API strategies failed, using hyphen split of "${sku}"`,
        });
        return { codProduto: skuBasePart, codRef: skuSuffix, _debug: debug };
      }

      // 6. Last resort: use "0" (the diagnostic showed most SIGE products use codRef="0")
      console.log(`SIGE create-sale: [REF-RESOLVE] WARNING - All strategies failed for ${sku}, using "0" as fallback`);
      debug.strategies.push({ name: "fallback_0" });
      return { codProduto: sigeCodProduto, codRef: "0", _debug: debug };
    }

    // Resolve all product references in parallel
    console.log(`SIGE create-sale: Resolving codRef for ${items.length} items...`);
    const resolvedRefs = await Promise.all(
      items.map((item: any) => resolveProductRef(
        String(item.codProduto || ""),
        item.codRef ? String(item.codRef) : undefined
      ))
    );

    // Helper: extract products array from API response (shared by resolveProductRef & resolveItemPrice)
    function extractProdsShared(data: any): any[] {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (data?.dados && Array.isArray(data.dados)) return data.dados;
      if (data?.data && Array.isArray(data.data)) return data.data;
      if (data?.items && Array.isArray(data.items)) return data.items;
      if (data?.content && Array.isArray(data.content)) return data.content;
      if (data?.codProduto || data?.id) return [data];
      return [];
    }

    // ── Helper: resolve price from KV/SIGE when frontend sends 0 or omits it ──
    // SIGE API REQUIRES valorUnitario in each item!
    // FIX (2026-02-18): Changed from GET /product/{sku} (returns 404 for string SKUs)
    //   to GET /product?codProduto={sku} (search endpoint that works with string codes).
    //   Also handles hyphenated SKUs: "103716-347" → tries "103716" as base part.
    async function resolveItemPrice(sku: string): Promise<number | null> {
      const priceFields = ["vlrTabela","valorTabela","vlrVenda","valorVenda","precoVenda","preco","valor","valorUnitario","precoUnitario"];

      function extractPriceFromProduct(prod: any): number | null {
        if (!prod) return null;
        const p = prod?.dados || prod;
        const src = Array.isArray(p) ? p[0] : p;
        if (!src) return null;
        for (const k of priceFields) {
          const v = src[k];
          if (v !== undefined && v !== null && Number(v) > 0) {
            console.log(`SIGE create-sale: [PRICE] Found price field ${k}=${v} for ${sku}`);
            return Number(v);
          }
        }
        return null;
      }

      try {
        // 1. Custom price override (KV)
        for (const prefix of ["price_custom_", "product_price_"]) {
          const customRaw = await kv.get(`${prefix}${sku}`);
          if (customRaw) {
            const custom = typeof customRaw === "string" ? JSON.parse(customRaw) : customRaw;
            if (custom.price !== undefined && custom.price !== null && Number(custom.price) > 0) {
              console.log(`SIGE create-sale: [PRICE] Custom price for ${sku}: R$${custom.price}`);
              return Number(custom.price);
            }
          }
        }

        // 2. Cached SIGE price (KV)
        const cachedRaw = await kv.get(`sige_price_${sku}`);
        if (cachedRaw) {
          const cached = typeof cachedRaw === "string" ? JSON.parse(cachedRaw) : cachedRaw;
          if (cached.price && Number(cached.price) > 0) {
            console.log(`SIGE create-sale: [PRICE] Cached SIGE price for ${sku}: R$${cached.price}`);
            return Number(cached.price);
          }
        }

        // 3. Try GET /product/{sku} directly (API accepts hyphenated SKU as {id})
        const skusToTry = [sku];
        if (sku.includes("-")) {
          skusToTry.push(sku.substring(0, sku.lastIndexOf("-")));
        }

        for (const searchSku of skusToTry) {
          try {
            console.log(`SIGE create-sale: [PRICE] Direct: GET /product/${searchSku}`);
            const directRes = await sigeAuthFetch("GET", `/product/${encodeURIComponent(searchSku)}`);
            console.log(`SIGE create-sale: [PRICE] Direct /product/${searchSku}: HTTP ${directRes.status}, data=${JSON.stringify(directRes.data).substring(0, 300)}`);
            if (directRes.ok && directRes.data) {
              const directPrice = extractPriceFromProduct(directRes.data);
              if (directPrice) {
                console.log(`SIGE create-sale: [PRICE] Direct product price for ${sku} (via ${searchSku}): R$${directPrice}`);
                return directPrice;
              }
            }
          } catch (e: any) {
            console.log(`SIGE create-sale: [PRICE] Direct product error for ${searchSku}:`, e.message);
          }
        }

        // 4. SIGE product SEARCH endpoint (query param approach)
        for (const searchSku of skusToTry) {
          try {
            console.log(`SIGE create-sale: [PRICE] Search: GET /product?codProduto=${searchSku}`);
            const searchRes = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(searchSku)}&limit=1&offset=1`);
            console.log(`SIGE create-sale: [PRICE] Search /product?codProduto=${searchSku}: HTTP ${searchRes.status}, data=${JSON.stringify(searchRes.data).substring(0, 300)}`);
            if (searchRes.ok && searchRes.data) {
              const prods = extractProdsShared(searchRes.data);
              if (prods.length > 0) {
                const prod = prods[0];
                const price = extractPriceFromProduct(prod);
                if (price) {
                  console.log(`SIGE create-sale: [PRICE] Product search price for ${sku} (via ${searchSku}): R$${price}`);
                  return price;
                }
                // If found but no inline price, try by numeric ID
                const numId = prod.id;
                if (numId && String(numId) !== searchSku) {
                  try {
                    const idRes = await sigeAuthFetch("GET", `/product/${encodeURIComponent(numId)}`);
                    if (idRes.ok) {
                      const idPrice = extractPriceFromProduct(idRes.data);
                      if (idPrice) {
                        console.log(`SIGE create-sale: [PRICE] Product by numericId ${numId} price for ${sku}: R$${idPrice}`);
                        return idPrice;
                      }
                    }
                  } catch { /* ignore */ }
                }
              }
            }
          } catch (e: any) {
            console.log(`SIGE create-sale: [PRICE] Search error for ${searchSku}:`, e.message);
          }
        }

        // 5. list-price-items endpoint as last resort
        for (const searchSku of skusToTry) {
          try {
            const lpRes = await sigeAuthFetch("GET", `/list-price-items?codProduto=${encodeURIComponent(searchSku)}&limit=5&offset=1`);
            if (lpRes.ok && lpRes.data) {
              const lpItems = extractProdsShared(lpRes.data);
              for (const lpItem of lpItems) {
                const v = lpItem?.vlrTabela || lpItem?.valorTabela || lpItem?.vlrVenda || lpItem?.preco || lpItem?.valor;
                if (v && Number(v) > 0) {
                  console.log(`SIGE create-sale: [PRICE] list-price-items price for ${sku} (via ${searchSku}): R$${v}`);
                  return Number(v);
                }
              }
            }
          } catch { /* ignore */ }
        }
      } catch (e: any) {
        console.log(`SIGE create-sale: [PRICE] Error resolving price for ${sku}:`, e.message);
      }
      return null;
    }

    // SECURITY: Validate item quantities and prices before processing
    for (var vi = 0; vi < items.length; vi++) {
      var vQty = Number(items[vi].quantidade || items[vi].qtdeUnd || 1);
      if (!Number.isFinite(vQty) || vQty <= 0 || vQty > 9999 || Math.floor(vQty) !== vQty) {
        return c.json({ error: "Quantidade invalida no item " + (vi + 1) + ": deve ser inteiro positivo (1-9999)." }, 400);
      }
      var vPrice = Number(items[vi].valorUnitario || items[vi].preco || 0);
      if (vPrice < 0) {
        return c.json({ error: "Preco negativo no item " + (vi + 1) + " nao e permitido." }, 400);
      }
    }

    // Build sigeItems with REQUIRED valorUnitario always present
    const sigeItems = await Promise.all(items.map(async (item: any, idx: number) => {
      const resolved = resolvedRefs[idx];
      const sigeItem: any = {
        codProduto: resolved.codProduto,
        codRef: resolved.codRef,  // REQUIRED! Now properly resolved from SIGE references
        qtdeUnd: Number(item.quantidade || item.qtdeUnd || 1),
      };

      // valorUnitario is REQUIRED by SIGE API — always include it.
      // Priority: explicit value > SIGE price lookup > 0 (let SIGE use default)
      let price = Number(item.valorUnitario || item.preco || 0);
      if (price <= 0) {
        // Try with the resolved codProduto first (base part e.g. "012561"), then original SKU
        const skuToResolve = resolved.codProduto || String(item.codProduto || item.sku || "");
        const fetchedPrice = await resolveItemPrice(skuToResolve);
        if (fetchedPrice && fetchedPrice > 0) {
          price = fetchedPrice;
          console.log(`SIGE create-sale: [PRICE] Auto-resolved price for ${skuToResolve}: R$${price.toFixed(2)}`);
        } else if (resolved.codProduto !== String(item.codProduto || "")) {
          // Fallback: try with original codProduto from cart (full SKU like "012561-227")
          const fallbackPrice = await resolveItemPrice(String(item.codProduto || item.sku || ""));
          if (fallbackPrice && fallbackPrice > 0) {
            price = fallbackPrice;
            console.log(`SIGE create-sale: [PRICE] Fallback price for ${item.codProduto}: R$${price.toFixed(2)}`);
          }
        }
      }
      sigeItem.valorUnitario = price;

      if (item.desconto || item.valorDesconto) sigeItem.valorDesconto = Number(item.desconto || item.valorDesconto || 0);
      if (item.valorFrete) sigeItem.valorFrete = Number(item.valorFrete);
      if (item.valorEncargos) sigeItem.valorEncargos = Number(item.valorEncargos);
      if (item.valorSeguro) sigeItem.valorSeguro = Number(item.valorSeguro);
      if (item.valorIpi) sigeItem.valorIpi = Number(item.valorIpi);
      if (item.numLote) sigeItem.numLote = String(item.numLote);
      if (item.ncm) sigeItem.ncm = String(item.ncm);
      if (item.url) sigeItem.url = String(item.url);
      if (item.codMensagem) sigeItem.codMensagem = String(item.codMensagem);
      if (item.codCbenef) sigeItem.codCbenef = String(item.codCbenef);
      // Flag to auto-update stock balance in SIGE V3 when order is created
      sigeItem.atlzSaldoV3 = "S";
      return sigeItem;
    }));

    // ════════════════════════════════════════════════════════════════
    // STEP 1: Build and send ORDER WITH ITEMS (POST /order)
    // ════════════════════════════════════════════════════════════════
    // IMPORTANT: items is REQUIRED by SIGE API in POST /order!
    // IMPORTANT: observacao is a SEPARATE sub-resource — do NOT include it here.
    const orderPayload: any = {
      codCliFor: Number(codCliente),
      codTipoMv: String(tipoPedido || "704"),  // 704 = Pedido de Venda - Ecommerce (PVE)
      items: sigeItems,
    };

    // Optional top-level fields (all flat strings/numbers — NO nested objects)
    if (codVendedor) orderPayload.codVendComp = Number(codVendedor);
    if (codFilial) orderPayload.codFilial = String(codFilial);
    if (codDeposito) orderPayload.codLocal = String(codDeposito);
    if (codCondPgto) orderPayload.codCondPgto = String(codCondPgto);
    if (codTransportador) orderPayload.codTransportador1 = Number(codTransportador);
    if (tipoFrete) orderPayload.tipoFrete1 = String(tipoFrete);
    if (nomeAux) orderPayload.nomeAux = String(nomeAux);
    if (numDoctoAux) orderPayload.numDoctoAux = String(numDoctoAux);
    if (codCarteira) orderPayload.codCarteira = Number(codCarteira);
    if (codLista) orderPayload.codLista = Number(codLista);
    if (codCategoria) orderPayload.codCategoria = String(codCategoria);
    if (codMoeda) orderPayload.codMoeda = Number(codMoeda);
    if (codAtividade) orderPayload.codAtividade = Number(codAtividade);
    if (observacaoInterna) orderPayload.observacaoInterna = String(observacaoInterna);

    // Build observation payload for Step 2 (POST /order/{id}/observation)
    // This is sent AFTER order creation, NOT in the order payload
    let obsPayload: any = null;
    if (observacao) {
      if (typeof observacao === "string") {
        obsPayload = { observacao: observacao };
      } else if (typeof observacao === "object") {
        const obsObj: any = {};
        if (observacao.descMensagem1) obsObj.descMensagem1 = String(observacao.descMensagem1);
        if (observacao.descMensagem2) obsObj.descMensagem2 = String(observacao.descMensagem2);
        if (observacao.descMensagem3) obsObj.descMensagem3 = String(observacao.descMensagem3);
        if (observacao.descMensagem4) obsObj.descMensagem4 = String(observacao.descMensagem4);
        if (observacao.observacao) obsObj.observacao = String(observacao.observacao);
        if (Object.keys(obsObj).length > 0) obsPayload = obsObj;
      }
    }

    console.log("SIGE create-sale: STEP 1 - Creating order WITH items (NO observacao)");
    console.log("SIGE create-sale: codCliFor:", typeof orderPayload.codCliFor, orderPayload.codCliFor);
    console.log("SIGE create-sale: items count:", sigeItems.length, "first:", JSON.stringify(sigeItems[0]));
    console.log("SIGE create-sale: Full payload keys:", Object.keys(orderPayload).join(", "));
    console.log("SIGE create-sale: Full payload:", JSON.stringify(orderPayload));
    // Validate all items have REQUIRED fields before sending
    const itemIssues: string[] = [];
    for (let ii = 0; ii < sigeItems.length; ii++) {
      const si = sigeItems[ii];
      if (!si.codProduto) itemIssues.push(`item[${ii}]: codProduto vazio`);
      if (!si.codRef && si.codRef !== "0") itemIssues.push(`item[${ii}]: codRef vazio`);
      if (si.valorUnitario === undefined || si.valorUnitario === null) itemIssues.push(`item[${ii}]: valorUnitario ausente`);
      if (si.valorUnitario <= 0) itemIssues.push(`item[${ii}]: valorUnitario=${si.valorUnitario} (zero ou negativo, SIGE pode rejeitar)`);
      if (!si.qtdeUnd || si.qtdeUnd <= 0) itemIssues.push(`item[${ii}]: qtdeUnd=${si.qtdeUnd} inválido`);
    }
    if (itemIssues.length > 0) {
      console.log("SIGE create-sale: ITEM WARNINGS:", itemIssues.join(" | "));
    }
    console.log("SIGE create-sale: Observation (step 2):", obsPayload ? JSON.stringify(obsPayload) : "none");

    // Send order+items directly — flat JSON only (NOT "dados" wrapper!).
    // Diagnostic confirmed: flat JSON → "items -> codRef"; "dados" wrapper → "codCliFor,codTipoMv,items"
    // So flat JSON is the only format the API reads correctly.
    const orderResult = await sigeAuthFetch("POST", "/order", orderPayload);
    console.log("SIGE create-sale: Step1 =>", orderResult.status, JSON.stringify(orderResult.data));
    steps.push({ step: "create_order_with_items", ok: orderResult.ok, status: orderResult.status, data: orderResult.data });

    if (!orderResult.ok) {
      console.log("[SIGE create-sale] Step 1 failed. steps=" + JSON.stringify(steps) + " payload=" + JSON.stringify(orderPayload));
      return c.json({
        error: "Erro ao criar pedido no SIGE. Tente novamente ou entre em contato.",
        sigeStatus: orderResult.status,
      }, 502);
    }

    // Extract order ID
    const orderData = orderResult.data;
    const orderDados = orderData?.dados || orderData?.data || orderData;
    const orderId = orderDados?.chaveFato || orderDados?.codPedido || orderDados?.id || orderDados?.codigo ||
      (Array.isArray(orderDados) && (orderDados[0]?.chaveFato || orderDados[0]?.codPedido)) || null;

    if (!orderId) {
      var dataKeys = orderData ? Object.keys(orderData) : [];
      var dadosKeys = orderDados ? (typeof orderDados === "object" ? Object.keys(orderDados) : []) : [];
      console.log("SIGE create-sale: Could not extract orderId. orderData keys=" + JSON.stringify(dataKeys) + " orderDados keys=" + JSON.stringify(dadosKeys) + " full=" + JSON.stringify(orderData));
      const saleRef = {
        orderId: "unknown", codCliente, itemCount: items.length,
        createdBy: userId, createdAt: new Date().toISOString(), steps,
        rawResponse: orderData,
      };
      await kv.set("sige_sale:unknown_" + Date.now(), JSON.stringify(saleRef));
      // SECURITY: do not expose steps/sentPayload/rawResponse to end users
      return c.json({
        success: true,
        orderId: null,
        warning: "Pedido criado mas nao foi possivel extrair o ID. Entre em contato com o suporte.",
      });
    }

    console.log(`SIGE create-sale: STEP 1 DONE - Order ${orderId} created with ${sigeItems.length} items`);

    // ════════════════════════════════════════════════════════════════
    // STEP 2: Add observation via POST /order/{orderId}/observation
    // ════════════════════════════════════════════════════════════════
    if (obsPayload) {
      console.log(`SIGE create-sale: STEP 2 - Adding observation to order ${orderId}`);
      const obsResult = await sigeAuthFetch("POST", `/order/${orderId}/observation`, obsPayload);
      console.log("SIGE create-sale: Step2 =>", obsResult.status, JSON.stringify(obsResult.data));
      steps.push({ step: "add_observation", ok: obsResult.ok, status: obsResult.status, data: obsResult.data });
      if (!obsResult.ok) {
        console.log(`SIGE create-sale: WARNING - Observation failed (non-fatal), continuing...`);
      }
    }

    // ════════════════════════════════════════════════════════════════
    // STEP 3: Fetch complete order + items for confirmation
    // ════════════════════════════════════════════════════════════════
    console.log(`SIGE create-sale: STEP 3 - Confirming order ${orderId}`);
    const finalOrder = await sigeAuthFetch("GET", `/order/${orderId}`);
    steps.push({ step: "fetch_order_confirm", ok: finalOrder.ok, status: finalOrder.status });

    const finalItems = await sigeAuthFetch("GET", `/order-items/${orderId}`);
    if (finalItems.ok) {
      const confirmedCount = Array.isArray(finalItems.data?.dados) ? finalItems.data.dados.length : "?";
      steps.push({ step: "fetch_items_confirm", ok: true, status: finalItems.status, confirmedItems: confirmedCount });
    }

    // Store rich order data for user order history
    const totalValue = sigeItems.reduce((sum: number, it: any) => sum + (Number(it.valorUnitario) || 0) * (Number(it.qtdeUnd) || 1), 0);
    const saleRef = {
      orderId, codCliente, itemCount: items.length,
      createdBy: userId, createdAt: new Date().toISOString(),
      status: "sige_registered",
      tipoPedido: String(tipoPedido || "704"),
      total: totalValue,
      items: items.map((it: any, idx: number) => ({
        sku: it.codProduto,
        titulo: it.titulo || it.codProduto,
        imageUrl: it.imageUrl || null,
        quantidade: it.quantidade || 1,
        valorUnitario: sigeItems[idx]?.valorUnitario || it.valorUnitario || 0,
      })),
      steps,
    };
    await kv.set(`sige_sale:${orderId}`, JSON.stringify(saleRef));

    console.log(`SIGE create-sale: COMPLETE - order ${orderId}, ${items.length} items, total R$${totalValue.toFixed(2)}`);
    // SECURITY: do not expose raw SIGE data, steps or sentPayload to end users
    return c.json({
      success: true,
      orderId,
    });
  } catch (e: any) {
    console.log("SIGE create-sale exception:", e);
    return c.json({ error: "Erro interno ao criar pedido." }, 500);
  }
});

// GET /sige/sales — list tracked sales from KV
app.get(BASE + "/sige/sales", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const salesRaw = await kv.getByPrefix("sige_sale:");
    const sales: any[] = [];
    if (Array.isArray(salesRaw)) {
      for (const raw of salesRaw) {
        try { sales.push(typeof raw === "string" ? JSON.parse(raw) : raw); } catch {}
      }
    }
    sales.sort((a: any, b: any) => {
      const da = new Date(a.createdAt).getTime() || 0;
      const db = new Date(b.createdAt).getTime() || 0;
      return db - da;
    });
    return c.json({ sales, total: sales.length });
  } catch (e: any) {
    console.log("SIGE sales list exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── USER: MY ORDERS ─────────────────
// ═══════════════════════════════════════

// POST /user/save-order — save a complete order record from checkout
app.post(BASE + "/user/save-order", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    // Rate limit: 5 save-order per minute per IP
    var soRl = _getRateLimitKey(c, "save_order");
    var soRlResult = _checkRateLimit(soRl, 5);
    if (!soRlResult.allowed) return _rl429(c, "Muitas tentativas. Aguarde.", soRlResult);

    const body = await c.req.json();
    // Input validation for save-order
    var soValid = validate(body, {
      localOrderId: { required: true, type: "string", maxLen: 80 },
      sigeOrderId: { type: "string", maxLen: 50 },
      items: { type: "array", maxItems: 200 },
      total: { type: "number", min: 0, max: 99999999 },
      paymentMethod: { type: "string", maxLen: 30 },
      transactionId: { type: "string", maxLen: 100 },
      observacao: { type: "string", maxLen: 2000 },
    });
    if (!soValid.ok) {
      return c.json({ error: soValid.errors[0] || "Dados invalidos." }, 400);
    }
    const { localOrderId: rawLocalOrderId, sigeOrderId, items, total, paymentMethod, transactionId, observacao, shippingAddress, shippingOption } = body;
    // SECURITY: Sanitize localOrderId — strip dangerous chars, limit length
    var localOrderId = String(rawLocalOrderId || "").replace(/[^a-zA-Z0-9_\-]/g, "").substring(0, 80);
    console.log("[save-order] shippingOption received: " + JSON.stringify(shippingOption || null));

    if (!localOrderId) return c.json({ error: "localOrderId obrigatório." }, 400);

    // Credit card payments: verify the charge was actually approved server-side
    var initialStatus = "awaiting_payment";
    if (paymentMethod === "cartao_credito") {
      var claimedChargeId = body.safrapayChargeId || "";
      if (claimedChargeId) {
        var chargeRecord = await kv.get("safrapay_charge:" + claimedChargeId);
        if (chargeRecord) {
          var parsedCharge = typeof chargeRecord === "string" ? JSON.parse(chargeRecord) : chargeRecord;
          // Verify the charge belongs to this user and was approved
          if (parsedCharge.userId === userId && parsedCharge.isApproved) {
            initialStatus = "paid";
            console.log("[save-order] SafraPay charge " + claimedChargeId + " verified for user " + userId);
          } else {
            console.log("[save-order] SafraPay charge " + claimedChargeId + " NOT approved or wrong user. userId=" + userId + " chargeUserId=" + parsedCharge.userId + " approved=" + parsedCharge.isApproved);
          }
        } else {
          console.log("[save-order] SafraPay charge " + claimedChargeId + " NOT FOUND in KV. Keeping awaiting_payment.");
        }
      } else {
        console.log("[save-order] paymentMethod=cartao_credito but no safrapayChargeId. Keeping awaiting_payment.");
      }
    }

    const orderRecord: any = {
      localOrderId,
      sigeOrderId: sigeOrderId || null,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      status: initialStatus,
      paymentMethod: paymentMethod || "pix",
      transactionId: transactionId || null,
      total: Number(total) || 0,
      itemCount: Array.isArray(items) ? items.length : 0,
      observacao: observacao || null,
      shippingAddress: shippingAddress ? {
        name: shippingAddress.name || null,
        address: shippingAddress.address || null,
        city: shippingAddress.city || null,
        state: shippingAddress.state || null,
        cep: shippingAddress.cep || null,
        phone: shippingAddress.phone || null,
      } : null,
      shippingOption: shippingOption ? {
        carrierName: shippingOption.carrierName || null,
        carrierId: shippingOption.carrierId || null,
        carrierType: shippingOption.carrierType || null,
        price: Number(shippingOption.price) || 0,
        deliveryDays: Number(shippingOption.deliveryDays) || 0,
        free: !!shippingOption.free,
        sisfreteQuoteId: shippingOption.sisfreteQuoteId || null,
      } : null,
      items: (items || []).map((it: any) => ({
        sku: it.sku || it.codProduto || "",
        titulo: it.titulo || it.sku || "Produto",
        imageUrl: it.imageUrl || null,
        quantidade: Number(it.quantidade) || 1,
        valorUnitario: Number(it.valorUnitario) || Number(it.precoUnitario) || 0,
        warranty: it.warranty ? {
          planId: it.warranty.planId || "",
          name: it.warranty.name || "",
          price: Number(it.warranty.price) || 0,
          durationMonths: Number(it.warranty.durationMonths) || 0,
        } : null,
      })),
    };

    // Add SafraPay credit card fields if present
    if (body.safrapayChargeId) orderRecord.safrapayChargeId = body.safrapayChargeId;
    if (body.safrapayNsu) orderRecord.safrapayNsu = body.safrapayNsu;
    if (body.cardBrand) orderRecord.cardBrand = body.cardBrand;
    if (body.cardLastFour) orderRecord.cardLastFour = body.cardLastFour;
    if (body.installments) orderRecord.installments = Number(body.installments);
    // Coupon info
    if (body.coupon) orderRecord.coupon = body.coupon;

    const kvKey = `user_order:${userId}:${localOrderId}`;
    await kv.set(kvKey, JSON.stringify(orderRecord));
    console.log(`User save-order: saved ${kvKey} for user ${userId}, ${orderRecord.itemCount} items, total R$${orderRecord.total}, status=${initialStatus}`);

    // Fire-and-forget: send order confirmation email + admin notification
    _sendOrderConfirmationEmail(orderRecord).catch(function(emailErr) {
      console.log("[save-order] Order confirmation email error (non-fatal): " + emailErr);
    });
    _getUserEmailById(userId).then(function(uEmail) {
      if (uEmail) {
        _sendAdminNewOrderNotification(orderRecord, uEmail).catch(function(adminErr) {
          console.log("[save-order] Admin notification email error (non-fatal): " + adminErr);
        });
      }
    }).catch(function() {});

    return c.json({ success: true, orderId: localOrderId });
  } catch (e: any) {
    console.log("User save-order exception:", e);
    return c.json({ error: "Erro ao salvar pedido." }, 500);
  }
});

// POST /user/update-order-status — update payment status of an order
app.post(BASE + "/user/update-order-status", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const body = await c.req.json();
    // Input validation
    var uosValid = validate(body, {
      localOrderId: { required: true, type: "string", maxLen: 80 },
      status: { type: "string", maxLen: 30 },
      transactionId: { type: "string", maxLen: 100 },
    });
    if (!uosValid.ok) {
      return c.json({ error: uosValid.errors[0] || "Dados invalidos." }, 400);
    }
    const { localOrderId: rawLOI2, status, transactionId } = body;
    // SECURITY: Sanitize localOrderId
    var localOrderId = String(rawLOI2 || "").replace(/[^a-zA-Z0-9_\-]/g, "").substring(0, 80);
    if (!localOrderId) return c.json({ error: "localOrderId obrigatório." }, 400);

    // SECURITY: Users must NOT mark their own orders as "paid"/"completed"/etc.
    // "paid" can ONLY be set by: payment gateway webhooks, admin panel, or
    // credit card flow (save-order sets initialStatus="paid" synchronously).
    var BLOCKED_USER_STATUSES = ["paid", "completed", "shipped", "delivered"];
    if (status && BLOCKED_USER_STATUSES.indexOf(status) !== -1) {
      console.log("[update-order-status] BLOCKED: user " + userId + " tried to set status '" + status + "' on " + localOrderId);
      return c.json({ error: "Status nao permitido via endpoint de usuario." }, 403);
    }

    const kvKey = `user_order:${userId}:${localOrderId}`;
    const existing = await kv.get(kvKey);
    if (!existing) return c.json({ error: "Pedido não encontrado." }, 404);

    const order = typeof existing === "string" ? JSON.parse(existing) : existing;
    if (status) order.status = status;
    if (transactionId) order.transactionId = transactionId;
    order.updatedAt = new Date().toISOString();

    // When payment is confirmed ("paid"), confirm the SIGE order to trigger stock deduction
    if (status === "paid" && order.sigeOrderId) {
      try {
        var sigeConfirm = await confirmSigeOrder(String(order.sigeOrderId));
        order.sigeConfirmResult = { ok: sigeConfirm.ok, message: sigeConfirm.message };
        console.log("User update-order-status: SIGE confirm for " + order.sigeOrderId + " => ok=" + sigeConfirm.ok + " msg=" + sigeConfirm.message);
      } catch (confirmErr: any) {
        console.log("User update-order-status: SIGE confirm error (non-fatal): " + confirmErr.message);
      }
    }

    // When paid, send warranty certificate email if any items have warranty
    if (status === "paid") {
      try {
        var warrantyItems = (order.items || []).filter(function (it: any) { return it.warranty && it.warranty.planId; });
        if (warrantyItems.length > 0) {
          // Resolve buyer email from auth
          var buyerEmail = null;
          try {
            var buyerUser = await supabaseAdmin.auth.admin.getUserById(userId);
            buyerEmail = buyerUser.data?.user?.email || null;
          } catch (ue) { /* ignore */ }
          if (buyerEmail) {
            _sendWarrantyCertificateEmail(buyerEmail, order.localOrderId || localOrderId, warrantyItems, order.shippingAddress?.name || "Cliente");
          }
        }
      } catch (wce) {
        console.log("[Warranty] Certificate email error (non-fatal): " + wce);
      }
    }

    await kv.set(kvKey, JSON.stringify(order));
    console.log("User update-order-status: " + kvKey + " -> " + status);
    return c.json({ success: true });
  } catch (e: any) {
    console.log("User update-order-status exception:", e);
    return c.json({ error: "Erro ao atualizar status do pedido." }, 500);
  }
});

// GET /user/my-orders — list orders for the current authenticated user
app.get(BASE + "/user/my-orders", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    // PRIMARY: Read from user_order:{userId}: prefix (checkout-saved orders with full data)
    const userOrdersRaw = await kv.getByPrefix(`user_order:${userId}:`);
    const myOrders: any[] = [];

    if (Array.isArray(userOrdersRaw)) {
      for (const raw of userOrdersRaw) {
        try {
          const order = typeof raw === "string" ? JSON.parse(raw) : raw;
          myOrders.push({
            orderId: order.sigeOrderId || order.localOrderId || "N/A",
            localOrderId: order.localOrderId,
            createdAt: order.createdAt,
            status: order.status || "awaiting_payment",
            paymentMethod: order.paymentMethod || null,
            transactionId: order.transactionId || null,
            total: order.total || 0,
            itemCount: order.itemCount || (order.items?.length ?? 0),
            shippingAddress: order.shippingAddress || null,
            shippingOption: order.shippingOption || null,
            items: (order.items || []).map((it: any) => ({
              sku: it.sku || it.codProduto,
              titulo: it.titulo || it.sku || "Produto",
              imageUrl: it.imageUrl || null,
              quantidade: it.quantidade || 1,
              valorUnitario: it.valorUnitario || 0,
              warranty: it.warranty || null,
            })),
          });
        } catch {}
      }
    }

    // FALLBACK: Also read from sige_sale: prefix (legacy orders before the new system)
    const existingLocalIds = new Set(myOrders.map((o: any) => o.localOrderId));
    const salesRaw = await kv.getByPrefix("sige_sale:");
    if (Array.isArray(salesRaw)) {
      for (const raw of salesRaw) {
        try {
          const sale = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (sale.createdBy === userId) {
            const sigeId = sale.orderId || "unknown";
            const localId = `SIGE-${sigeId}`;
            // Skip if already tracked via user_order
            if (existingLocalIds.has(localId) || existingLocalIds.has(sigeId)) continue;
            myOrders.push({
              orderId: sigeId !== "unknown" ? sigeId : null,
              localOrderId: localId,
              createdAt: sale.createdAt,
              status: sale.status === "confirmed" ? "sige_registered" : (sale.status || "sige_registered"),
              paymentMethod: null,
              transactionId: null,
              total: sale.total || 0,
              itemCount: sale.itemCount || (sale.items?.length ?? 0),
              items: (sale.items || []).map((it: any) => ({
                sku: it.sku || it.codProduto,
                titulo: it.titulo || it.sku || it.codProduto || "Produto",
                imageUrl: it.imageUrl || null,
                quantidade: it.quantidade || 1,
                valorUnitario: it.valorUnitario || 0,
              })),
            });
          }
        } catch {}
      }
    }

    // AUTO-RECONCILIATION: For orders with "awaiting_payment" that have a transactionId,
    // re-check PagHiper to see if payment was completed (e.g. user closed browser before polling detected it)
    const pendingOrders = myOrders.filter((o: any) => o.status === "awaiting_payment" && o.transactionId && o.paymentMethod !== "cartao_credito");
    if (pendingOrders.length > 0) {
      const creds = await getPagHiperCredentials();
      if (creds) {
        await Promise.all(pendingOrders.map(async (order: any) => {
          try {
            const isPix = order.paymentMethod === "pix";
            const statusUrl = isPix ? `${PAGHIPER_PIX_URL}/status/` : `${PAGHIPER_BOLETO_URL}/status/`;
            const res = await fetch(statusUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ apiKey: creds.apiKey, token: creds.token, transaction_id: order.transactionId }),
            });
            const data = await res.json();
            const phStatus = data?.status_request?.status;
            if (phStatus === "paid" || phStatus === "completed") {
              order.status = "paid";
              const kvKey = `user_order:${userId}:${order.localOrderId}`;
              const existing = await kv.get(kvKey);
              if (existing) {
                const rec = typeof existing === "string" ? JSON.parse(existing) : existing;
                rec.status = "paid";
                rec.paidAt = rec.paidAt || new Date().toISOString();
                rec.updatedAt = new Date().toISOString();
                // Send payment email if not already sent (dedup via emailSent flag)
                if (!rec.emailSent) {
                  rec.emailSent = true;
                  _sendPaymentApprovedEmail(rec).catch(function(arEmailErr) {
                    console.log("Auto-reconciliation: payment email error (non-fatal): " + arEmailErr);
                  });
                }
                await kv.set(kvKey, JSON.stringify(rec));
                console.log("Auto-reconciliation: " + kvKey + " -> paid (PagHiper confirmed)");
              }
              // Confirm SIGE order to trigger stock deduction
              if (order.sigeOrderId) {
                confirmSigeOrder(String(order.sigeOrderId)).catch(function(ce: any) {
                  console.log("Auto-reconciliation: SIGE confirm error (non-fatal): " + (ce.message || ce));
                });
              }
            } else if (phStatus === "canceled" || phStatus === "refunded") {
              order.status = "cancelled";
              const kvKey = `user_order:${userId}:${order.localOrderId}`;
              const existing = await kv.get(kvKey);
              if (existing) {
                const rec = typeof existing === "string" ? JSON.parse(existing) : existing;
                rec.status = "cancelled";
                rec.updatedAt = new Date().toISOString();
                await kv.set(kvKey, JSON.stringify(rec));
                console.log(`Auto-reconciliation: ${kvKey} -> cancelled (PagHiper: ${phStatus})`);
              }
            }
          } catch (e) {
            console.log(`Auto-reconciliation error for ${order.transactionId}:`, e);
          }
        }));
      }
    }

    // Sort newest first
    myOrders.sort((a: any, b: any) => {
      const da = new Date(a.createdAt).getTime() || 0;
      const db = new Date(b.createdAt).getTime() || 0;
      return db - da;
    });
    return c.json({ orders: myOrders, total: myOrders.length });
  } catch (e: any) {
    console.log("User my-orders exception:", e);
    return c.json({ error: "Erro ao buscar seus pedidos." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── USER: ORDER TRACKING (SisFrete) ──
// ═══════════════════════════════════════

// GET /user/order-tracking/:localOrderId — fetch SisFrete tracking events for a specific user order
app.get(BASE + "/user/order-tracking/:localOrderId", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var localOrderId = (c.req.param("localOrderId") || "").substring(0, 200);
    if (!localOrderId) return c.json({ error: "localOrderId obrigatorio." }, 400);

    // 1. Read the user's order
    var orderRaw = await kv.get("user_order:" + userId + ":" + localOrderId);
    if (!orderRaw) return c.json({ error: "Pedido nao encontrado." }, 404);
    var order = typeof orderRaw === "string" ? JSON.parse(orderRaw) : orderRaw;

    // 2. Determine possible order numbers to match against SisFrete
    var possibleIds: string[] = [];
    if (order.sigeOrderId) possibleIds.push(String(order.sigeOrderId));
    if (order.localOrderId) possibleIds.push(String(order.localOrderId));
    if (localOrderId) possibleIds.push(String(localOrderId));

    // 3. Search sisfrete_wt_order: entries to find the numeroDoPedido used
    var wtOrdersRaw = await kv.getByPrefix("sisfrete_wt_order:");
    var matchedWtOrder: any = null;
    var matchedNumeroPedido = "";
    if (Array.isArray(wtOrdersRaw)) {
      for (var wi = 0; wi < wtOrdersRaw.length; wi++) {
        try {
          var wtRec = typeof wtOrdersRaw[wi] === "string" ? JSON.parse(wtOrdersRaw[wi]) : wtOrdersRaw[wi];
          var wtNumero = wtRec.pedido ? String(wtRec.pedido.numeroDoPedido || "") : "";
          var wtPedidoCV = wtRec.pedido ? String(wtRec.pedido.pedidoCanalVenda || "") : "";
          for (var pi = 0; pi < possibleIds.length; pi++) {
            if (wtNumero === possibleIds[pi] || wtPedidoCV === possibleIds[pi]) {
              matchedWtOrder = wtRec;
              matchedNumeroPedido = wtNumero;
              break;
            }
          }
          if (matchedWtOrder) break;
        } catch (wtErr) { /* skip */ }
      }
    }

    if (!matchedWtOrder) {
      return c.json({
        success: true,
        found: false,
        message: "Este pedido ainda nao foi enviado para rastreamento.",
        events: [],
        trackingCode: null,
        trackingLink: null,
      });
    }

    // 4. Get SisFrete WT config
    var cfg = await getSisfreteWTConfig();
    if (!cfg || !cfg.apiToken) {
      return c.json({
        success: true,
        found: true,
        message: "Rastreamento configurado, mas token SisFrete nao disponivel.",
        events: [],
        trackingCode: matchedWtOrder.pedido ? matchedWtOrder.pedido.numeroObjeto || null : null,
        trackingLink: null,
        sentAt: matchedWtOrder.sentAt || null,
      });
    }

    // 5. Fetch SisFrete rastreio events (with simple cache — 5 min)
    var cacheKey = "sisfrete_wt_rastreio_cache";
    var cachedRaw = await kv.get(cacheKey);
    var allEvents: any[] = [];
    var cacheValid = false;

    if (cachedRaw) {
      try {
        var cached = typeof cachedRaw === "string" ? JSON.parse(cachedRaw) : cachedRaw;
        var cacheAge = Date.now() - (cached.fetchedAt ? new Date(cached.fetchedAt).getTime() : 0);
        if (cacheAge < 5 * 60 * 1000 && Array.isArray(cached.events)) {
          allEvents = cached.events;
          cacheValid = true;
        }
      } catch (ce) { /* ignore */ }
    }

    if (!cacheValid) {
      try {
        var trackRes = await fetch(SISFRETE_WT_BASE + "/rastreio", {
          method: "GET",
          headers: { "Token-API": cfg.apiToken },
          signal: AbortSignal.timeout(30000),
        });
        var trackText = await trackRes.text();
        console.log("[SisFrete-WT] User tracking: GET /rastreio => HTTP " + trackRes.status + " length=" + trackText.length);
        if (trackRes.ok) {
          try { allEvents = JSON.parse(trackText); } catch (pe) { allEvents = []; }
          if (!Array.isArray(allEvents)) allEvents = [];
          await kv.set(cacheKey, JSON.stringify({ fetchedAt: new Date().toISOString(), events: allEvents }));
        }
      } catch (fetchErr) {
        console.log("[SisFrete-WT] User tracking: fetch error: " + fetchErr);
      }
    }

    // 6. Filter events for this order
    var orderEvents: any[] = [];
    for (var ei = 0; ei < allEvents.length; ei++) {
      var evt = allEvents[ei];
      if (String(evt.pedido || "") === matchedNumeroPedido) {
        orderEvents.push(evt);
      }
    }

    // Sort by date ascending (oldest first for timeline display)
    orderEvents.sort(function (a, b) {
      return new Date(a.data_hora || 0).getTime() - new Date(b.data_hora || 0).getTime();
    });

    // Extract tracking code and link
    var trackingCode = matchedWtOrder.pedido ? matchedWtOrder.pedido.numeroObjeto || null : null;
    var trackingLink = orderEvents.length > 0 && orderEvents[0].link ? orderEvents[0].link : null;

    return c.json({
      success: true,
      found: true,
      events: orderEvents,
      total: orderEvents.length,
      trackingCode: trackingCode,
      trackingLink: trackingLink,
      carrierName: matchedWtOrder.pedido ? matchedWtOrder.pedido.transportadoraNome || null : null,
      servicoEntrega: matchedWtOrder.pedido ? matchedWtOrder.pedido.servicoEntrega || null : null,
      sentAt: matchedWtOrder.sentAt || null,
      numeroDoPedido: matchedNumeroPedido,
    });
  } catch (e: any) {
    console.log("[SisFrete-WT] User order-tracking error: " + e);
    return c.json({ error: "Erro ao consultar rastreio." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── ADMIN: ALL ORDERS ───────────────
// ═══════════════════════════════════════

// GET /admin/orders — list ALL orders across all users (admin only)
app.get(BASE + "/admin/orders", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    // Read all user_order: entries across all users
    var allOrdersRaw = await kv.getByPrefix("user_order:");
    var orders: any[] = [];

    if (Array.isArray(allOrdersRaw)) {
      for (var i = 0; i < allOrdersRaw.length; i++) {
        try {
          var raw = allOrdersRaw[i];
          var order = typeof raw === "string" ? JSON.parse(raw) : raw;
          orders.push({
            orderId: order.sigeOrderId || order.localOrderId || "N/A",
            localOrderId: order.localOrderId || null,
            sigeOrderId: order.sigeOrderId || null,
            createdBy: order.createdBy || null,
            createdAt: order.createdAt || null,
            updatedAt: order.updatedAt || null,
            status: order.status || "awaiting_payment",
            paymentMethod: order.paymentMethod || null,
            transactionId: order.transactionId || null,
            total: order.total || 0,
            itemCount: order.itemCount || (order.items ? order.items.length : 0),
            observacao: order.observacao || null,
            shippingAddress: order.shippingAddress || null,
            shippingOption: order.shippingOption || null,
            items: (order.items || []).map(function (it: any) {
              return {
                sku: it.sku || it.codProduto || "",
                titulo: it.titulo || it.sku || "Produto",
                imageUrl: it.imageUrl || null,
                quantidade: it.quantidade || 1,
                valorUnitario: it.valorUnitario || 0,
                warranty: it.warranty || null,
              };
            }),
          });
        } catch (parseErr) {
          // skip invalid entries
        }
      }
    }

    // Also read sige_sale: prefix (legacy orders)
    var existingLocalIds = new Set(orders.map(function (o: any) { return o.localOrderId; }));
    var salesRaw = await kv.getByPrefix("sige_sale:");
    if (Array.isArray(salesRaw)) {
      for (var j = 0; j < salesRaw.length; j++) {
        try {
          var saleRaw = salesRaw[j];
          var sale = typeof saleRaw === "string" ? JSON.parse(saleRaw) : saleRaw;
          var sigeId = sale.orderId || "unknown";
          var localId = "SIGE-" + sigeId;
          if (existingLocalIds.has(localId) || existingLocalIds.has(sigeId)) continue;
          orders.push({
            orderId: sigeId !== "unknown" ? sigeId : null,
            localOrderId: localId,
            sigeOrderId: sigeId !== "unknown" ? sigeId : null,
            createdBy: sale.createdBy || null,
            createdAt: sale.createdAt || null,
            updatedAt: null,
            status: sale.status === "confirmed" ? "sige_registered" : (sale.status || "sige_registered"),
            paymentMethod: null,
            transactionId: null,
            total: sale.total || 0,
            itemCount: sale.itemCount || (sale.items ? sale.items.length : 0),
            observacao: null,
            shippingAddress: null,
            items: (sale.items || []).map(function (it: any) {
              return {
                sku: it.sku || it.codProduto || "",
                titulo: it.titulo || it.sku || it.codProduto || "Produto",
                imageUrl: it.imageUrl || null,
                quantidade: it.quantidade || 1,
                valorUnitario: it.valorUnitario || 0,
              };
            }),
          });
        } catch (parseErr2) {
          // skip
        }
      }
    }

    // Resolve user emails for display
    var userIds = new Set<string>();
    for (var k = 0; k < orders.length; k++) {
      if (orders[k].createdBy) userIds.add(orders[k].createdBy);
    }
    var userMap: Record<string, { email: string; name: string }> = {};
    var userIdArray = Array.from(userIds);
    for (var u = 0; u < userIdArray.length; u++) {
      try {
        var uid = userIdArray[u];
        var userRes = await supabaseAdmin.auth.admin.getUserById(uid);
        if (userRes.data && userRes.data.user) {
          userMap[uid] = {
            email: userRes.data.user.email || "",
            name: (userRes.data.user.user_metadata && userRes.data.user.user_metadata.name) || "",
          };
        }
      } catch (ue) {
        // skip
      }
    }

    // Attach user info to orders
    for (var m = 0; m < orders.length; m++) {
      var oid = orders[m].createdBy;
      if (oid && userMap[oid]) {
        orders[m].userEmail = userMap[oid].email;
        orders[m].userName = userMap[oid].name;
      } else {
        orders[m].userEmail = null;
        orders[m].userName = null;
      }
    }

    // Sort newest first
    orders.sort(function (a: any, b: any) {
      var da = new Date(a.createdAt || 0).getTime();
      var db = new Date(b.createdAt || 0).getTime();
      return db - da;
    });

    return c.json({ orders: orders, total: orders.length });
  } catch (e: any) {
    console.log("Admin orders exception:", e);
    return c.json({ error: "Erro ao buscar pedidos." }, 500);
  }
});

// POST /admin/update-order-status — admin can update any order status
app.post(BASE + "/admin/update-order-status", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var body = await c.req.json();
    // Input validation for order status update
    var osValid = validate(body, {
      userId: { required: true, type: "string", maxLen: 200 },
      localOrderId: { required: true, type: "string", maxLen: 200 },
      status: { required: true, type: "string", maxLen: 50 },
    });
    if (!osValid.ok) return c.json({ error: osValid.errors[0] || "userId, localOrderId e status são obrigatórios." }, 400);
    var targetUserId = osValid.sanitized.userId;
    var localOrderId = osValid.sanitized.localOrderId;
    var newStatus = osValid.sanitized.status;

    if (!targetUserId || !localOrderId || !newStatus) {
      return c.json({ error: "userId, localOrderId e status são obrigatórios." }, 400);
    }

    var kvKey = "user_order:" + targetUserId + ":" + localOrderId;
    var existing = await kv.get(kvKey);
    if (!existing) return c.json({ error: "Pedido não encontrado." }, 404);

    var order = typeof existing === "string" ? JSON.parse(existing) : existing;
    order.status = newStatus;
    order.updatedAt = new Date().toISOString();
    order.updatedBy = userId;

    // When admin marks order as paid/Pago, confirm SIGE order to trigger stock deduction
    var statusLower = String(newStatus).toLowerCase();
    if ((statusLower === "paid" || statusLower === "pago") && order.sigeOrderId) {
      try {
        var adminConfirm = await confirmSigeOrder(String(order.sigeOrderId));
        order.sigeConfirmResult = { ok: adminConfirm.ok, message: adminConfirm.message };
        console.log("Admin update-order-status: SIGE confirm for " + order.sigeOrderId + " => ok=" + adminConfirm.ok + " msg=" + adminConfirm.message);
      } catch (confirmErr: any) {
        console.log("Admin update-order-status: SIGE confirm error (non-fatal): " + confirmErr.message);
      }
    }

    await kv.set(kvKey, JSON.stringify(order));
    console.log("Admin update-order-status: " + kvKey + " -> " + newStatus);

    return c.json({ success: true });
  } catch (e: any) {
    console.log("Admin update-order-status exception:", e);
    return c.json({ error: "Erro ao atualizar status do pedido." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// ─── ADMIN: RETRY SIGE REGISTRATION ─────────────────────────
// ═══════════════════════════════════════════════════════════════

// POST /admin/retry-sige-registration — re-attempt creating a SIGE order for an order
// that originally failed SIGE registration (sigeOrderId is null).
// Uses stored order items + SIGE customer mapping to build and POST /order to SIGE.
app.post(BASE + "/admin/retry-sige-registration", async function (c) {
  try {
    var adminUserId = await getAuthUserId(c.req.raw);
    if (!adminUserId) return c.json({ error: "Nao autorizado." }, 401);

    var body = await c.req.json();
    // Input validation for retry-sige-registration
    var retryValid = validate(body, {
      userId: { required: true, type: "string", maxLen: 200 },
      localOrderId: { required: true, type: "string", maxLen: 200 },
    });
    if (!retryValid.ok) return c.json({ error: retryValid.errors[0] || "Dados invalidos." }, 400);
    var targetUserId = retryValid.sanitized.userId;
    var localOrderId = retryValid.sanitized.localOrderId;

    if (!targetUserId || !localOrderId) {
      return c.json({ error: "userId e localOrderId são obrigatórios." }, 400);
    }

    // 1. Read order from KV
    var kvKey = "user_order:" + targetUserId + ":" + localOrderId;
    var existing = await kv.get(kvKey);
    if (!existing) return c.json({ error: "Pedido não encontrado no KV: " + kvKey }, 404);

    var order = typeof existing === "string" ? JSON.parse(existing) : existing;

    // Check if already has sigeOrderId
    if (order.sigeOrderId) {
      return c.json({
        error: "Pedido já possui SIGE ID: " + order.sigeOrderId + ". Use confirmar SIGE para baixar estoque.",
        sigeOrderId: order.sigeOrderId,
      }, 400);
    }

    // 2. Get SIGE customer mapping for the order's user
    var customerMapRaw = await kv.get("sige_customer_map:" + targetUserId);
    if (!customerMapRaw) {
      return c.json({ error: "Usuário " + targetUserId + " não possui mapeamento SIGE. Sincronize o cliente primeiro." }, 400);
    }
    var customerMap = typeof customerMapRaw === "string" ? JSON.parse(customerMapRaw) : customerMapRaw;
    var codCliente = customerMap.sigeCustomerId;
    if (!codCliente) {
      return c.json({ error: "Mapeamento SIGE do usuário não tem sigeCustomerId." }, 400);
    }

    console.log("Admin retry-sige-registration: order " + localOrderId + " user " + targetUserId + " sigeCustomer " + codCliente);

    // 3. Build SIGE items from stored order items using SKU split strategy
    var orderItems = order.items || [];
    if (orderItems.length === 0) {
      return c.json({ error: "Pedido não possui itens." }, 400);
    }

    var sigeItems: any[] = [];
    var refDebug: any[] = [];
    for (var i = 0; i < orderItems.length; i++) {
      var item = orderItems[i];
      var sku = String(item.sku || item.codProduto || "");
      var resolvedCodProduto = sku;
      var resolvedCodRef = "0";

      // SKU split strategy: "103716-347" -> codProduto="103716", codRef="347"
      if (sku.indexOf("-") !== -1) {
        var lastHyphen = sku.lastIndexOf("-");
        resolvedCodProduto = sku.substring(0, lastHyphen);
        resolvedCodRef = sku.substring(lastHyphen + 1);
      }

      // Try reference endpoint to get accurate codRef
      var refResolved = false;
      try {
        var refPath = "/product/" + encodeURIComponent(resolvedCodProduto) + "/reference";
        if (resolvedCodRef !== "0") {
          refPath = refPath + "?codRef=" + encodeURIComponent(resolvedCodRef);
        }
        console.log("Admin retry-sige: resolving ref for " + sku + " via GET " + refPath);
        var refResult = await sigeAuthFetch("GET", refPath);
        if (refResult.ok && refResult.data) {
          var refData = refResult.data;
          var refs = refData.dados || refData.data || refData;
          if (!Array.isArray(refs)) {
            if (refs && typeof refs === "object" && refs.codRef !== undefined) {
              refs = [refs];
            } else {
              refs = [];
            }
          }
          if (refs.length > 0) {
            var matchedRef: any = null;
            for (var r = 0; r < refs.length; r++) {
              if (String(refs[r].codRef) === resolvedCodRef && refs[r].status === "A") {
                matchedRef = refs[r];
                break;
              }
            }
            if (!matchedRef) {
              for (var r2 = 0; r2 < refs.length; r2++) {
                if (String(refs[r2].codRef) === resolvedCodRef) {
                  matchedRef = refs[r2];
                  break;
                }
              }
            }
            if (!matchedRef) {
              for (var r3 = 0; r3 < refs.length; r3++) {
                if (refs[r3].status === "A") {
                  matchedRef = refs[r3];
                  break;
                }
              }
            }
            if (!matchedRef) matchedRef = refs[0];
            if (matchedRef && matchedRef.codRef !== undefined) {
              resolvedCodRef = String(matchedRef.codRef);
              if (matchedRef.codProduto) resolvedCodProduto = String(matchedRef.codProduto);
              refResolved = true;
              console.log("Admin retry-sige: ref resolved for " + sku + " -> codProduto=" + resolvedCodProduto + " codRef=" + resolvedCodRef);
            }
          }
        }
      } catch (refErr: any) {
        console.log("Admin retry-sige: ref resolution error for " + sku + ": " + (refErr.message || String(refErr)));
      }

      var sigeItem: any = {
        codProduto: resolvedCodProduto,
        codRef: resolvedCodRef,
        qtdeUnd: Number(item.quantidade) || 1,
        valorUnitario: Number(item.valorUnitario) || Number(item.precoUnitario) || 0,
        atlzSaldoV3: "S",
      };
      sigeItems.push(sigeItem);
      refDebug.push({ sku: sku, resolved: { codProduto: resolvedCodProduto, codRef: resolvedCodRef, viaApi: refResolved } });
    }

    // 4. Build SIGE order payload (flat, no "dados" wrapper)
    var orderPayload: any = {
      codCliFor: Number(codCliente),
      codTipoMv: "704",
      items: sigeItems,
    };

    console.log("Admin retry-sige: POST /order payload: " + JSON.stringify(orderPayload));

    // 5. Create order in SIGE
    var orderResult = await sigeAuthFetch("POST", "/order", orderPayload);
    console.log("Admin retry-sige: POST /order => HTTP " + orderResult.status + " data=" + JSON.stringify(orderResult.data).substring(0, 500));

    if (!orderResult.ok) {
      var sigeErrMsg = (orderResult.data && (orderResult.data.message || orderResult.data.error)) || ("HTTP " + orderResult.status);
      return c.json({
        error: "SIGE rejeitou o pedido: " + sigeErrMsg,
        sigeResponse: orderResult.data,
        sentPayload: orderPayload,
        refDebug: refDebug,
      }, 502);
    }

    // 6. Extract SIGE order ID
    var orderData = orderResult.data;
    var orderDados = (orderData && orderData.dados) || (orderData && orderData.data) || orderData;
    var newSigeOrderId: any = null;
    if (orderDados) {
      newSigeOrderId = orderDados.chaveFato || orderDados.codPedido || orderDados.id || orderDados.codigo || null;
      if (!newSigeOrderId && Array.isArray(orderDados) && orderDados.length > 0) {
        newSigeOrderId = orderDados[0].chaveFato || orderDados[0].codPedido || orderDados[0].id || null;
      }
    }

    if (!newSigeOrderId) {
      console.log("Admin retry-sige: Order created but could not extract ID: " + JSON.stringify(orderData));
      return c.json({
        success: false,
        error: "Pedido criado no SIGE mas não foi possível extrair o ID.",
        rawResponse: orderData,
        refDebug: refDebug,
      }, 500);
    }

    console.log("Admin retry-sige: SUCCESS - SIGE order " + newSigeOrderId + " created for local order " + localOrderId);

    // 7. Update order in KV with the new sigeOrderId
    order.sigeOrderId = String(newSigeOrderId);
    order.updatedAt = new Date().toISOString();
    order.sigeRetryBy = adminUserId;
    order.sigeRetryAt = new Date().toISOString();
    await kv.set(kvKey, JSON.stringify(order));

    // 8. Also store in sige_sale: for reference
    var saleRef: any = {
      orderId: String(newSigeOrderId),
      codCliente: codCliente,
      itemCount: sigeItems.length,
      createdBy: targetUserId,
      retryBy: adminUserId,
      createdAt: order.createdAt,
      retriedAt: new Date().toISOString(),
      status: order.status || "awaiting_payment",
      total: order.total || 0,
      items: orderItems,
    };
    await kv.set("sige_sale:" + String(newSigeOrderId), JSON.stringify(saleRef));

    // 9. Try to add observation if order had one
    if (order.observacao) {
      try {
        var obsPayload: any = typeof order.observacao === "string"
          ? { observacao: order.observacao }
          : order.observacao;
        var obsResult = await sigeAuthFetch("POST", "/order/" + String(newSigeOrderId) + "/observation", obsPayload);
        console.log("Admin retry-sige: observation for " + newSigeOrderId + " => HTTP " + obsResult.status);
      } catch (obsErr: any) {
        console.log("Admin retry-sige: observation error (non-fatal): " + (obsErr.message || String(obsErr)));
      }
    }

    return c.json({
      success: true,
      sigeOrderId: String(newSigeOrderId),
      message: "Pedido registrado no SIGE com sucesso! ID: " + String(newSigeOrderId),
      refDebug: refDebug,
    });
  } catch (e: any) {
    var errMsg = e.message || String(e);
    console.log("Admin retry-sige-registration exception: " + errMsg);
    return c.json({ error: errMsg || "Erro interno ao tentar registrar no SIGE." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// ─── SIGE: CONFIRM ORDER (admin manual + diagnostic) ────────
// ═══════════════════════════════════════════════════════════════

// POST /sige/confirm-order — manually confirm a SIGE order (triggers stock deduction)
app.post(BASE + "/sige/confirm-order", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var body = await c.req.json();
    // Input validation for confirm order
    var confirmValid = validate(body, {
      sigeOrderId: { type: "string", maxLen: 100 },
      orderId: { type: "string", maxLen: 100 },
    });
    if (!confirmValid.ok) return c.json({ error: confirmValid.errors[0] || "Dados invalidos." }, 400);
    var sigeOrderId = body.sigeOrderId || body.orderId;
    if (!sigeOrderId) return c.json({ error: "sigeOrderId é obrigatório." }, 400);

    console.log("Manual SIGE confirm requested by " + userId + " for order " + sigeOrderId);
    var result = await confirmSigeOrder(String(sigeOrderId));
    return c.json(result);
  } catch (e: any) {
    console.log("SIGE confirm-order exception:", e);
    return c.json({ error: "Erro ao confirmar pedido no SIGE." }, 500);
  }
});

// GET /sige/situations — list available situation codes from SIGE (diagnostic)
app.get(BASE + "/sige/situations", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    // Clear cache to get fresh data
    await kv.del("sige_situations_cache");

    var sitResult = await sigeAuthFetch("GET", "/situation?limit=100&offset=1");
    if (!sitResult.ok) {
      return c.json({
        error: "SIGE retornou HTTP " + sitResult.status,
        data: sitResult.data
      }, 502);
    }

    var situations = extractSigeArr(sitResult.data);
    // Cache for future use
    if (situations.length > 0) {
      await kv.set("sige_situations_cache", JSON.stringify({ situations: situations, cachedAt: Date.now() }));
    }

    return c.json({
      total: situations.length,
      situations: situations,
      raw: sitResult.data,
      hint: "Use codSituacao no POST /sige/confirm-order para confirmar um pedido e dar baixa no estoque."
    });
  } catch (e: any) {
    console.log("SIGE situations exception:", e);
    return c.json({ error: "Erro ao buscar situacoes SIGE." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: DEBUG ORDER ENDPOINT ──────
// ═══════════════════════════════════════
app.post(BASE + "/sige/debug-create-order", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const body = await c.req.json();
    // Input validation for debug-create-order
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 50000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    var dcoValid = validate(body, {
      codCliFor: { required: true, type: "string", maxLen: 50 },
      codTipoMv: { type: "string", maxLen: 20 },
    });
    if (!dcoValid.ok) return c.json({ error: dcoValid.errors[0] || "Dados invalidos." }, 400);
    const { codCliFor, codTipoMv, items } = body;
    if (!codCliFor) return c.json({ error: "codCliFor obrigatório." }, 400);

    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ error: "SIGE não configurado." }, 400);
    const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ error: "Token SIGE não encontrado." }, 400);
    const tokenData = typeof rawToken === "string" ? JSON.parse(rawToken) : rawToken;
    if (!tokenData.token) return c.json({ error: "Token SIGE vazio." }, 400);

    const baseUrl = config.baseUrl;
    const token = tokenData.token;
    // Ensure each item has codRef + atlzSaldoV3 (REQUIRED by SIGE API)
    const rawItems = items || [{ codProduto: "TESTE-001", qtdeUnd: 1, valorUnitario: 100 }];
    const testItems = rawItems.map((item: any) => ({
      ...item,
      codRef: String(item.codRef || item.codProduto || ""),
      atlzSaldoV3: "S",
    }));
    const attempts: any[] = [];

    async function diagFetch(label: string, url: string, opts: any): Promise<any> {
      const startMs = Date.now();
      console.log(`SIGE debug [${label}]: ${opts.method} ${url}`);
      if (opts.body) console.log(`SIGE debug [${label}]: body:`, String(opts.body).substring(0, 500));
      try {
        const response = await fetch(url, opts);
        const elapsed = Date.now() - startMs;
        const responseText = await response.text();
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((v: string, k: string) => { respHeaders[k] = v; });
        let respData: any;
        try { respData = JSON.parse(responseText); } catch { respData = { rawText: responseText.substring(0, 2000) }; }
        const result = {
          label, url, method: opts.method,
          reqHeaders: opts.headers,
          reqBody: opts.body ? String(opts.body).substring(0, 1000) : null,
          status: response.status, ok: response.ok,
          respHeaders, data: respData,
          redirected: response.redirected, finalUrl: response.url, elapsed,
        };
        console.log(`SIGE debug [${label}]: => HTTP ${response.status}, redirected=${response.redirected}, finalUrl=${response.url}, ${elapsed}ms`);
        console.log(`SIGE debug [${label}]: resp headers:`, JSON.stringify(respHeaders));
        console.log(`SIGE debug [${label}]: resp body:`, responseText.substring(0, 500));
        attempts.push(result);
        return result;
      } catch (err: any) {
        const result = { label, url, error: err.message || String(err), elapsed: Date.now() - startMs };
        console.log(`SIGE debug [${label}]: ERROR:`, err);
        attempts.push(result);
        return result;
      }
    }

    const payload = { codCliFor: Number(codCliFor), codTipoMv: String(codTipoMv || "704"), items: testItems };

    // 1: Standard JSON
    await diagFetch("1_json", `${baseUrl}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    // 2: Detect redirect (manual)
    await diagFetch("2_no_redirect", `${baseUrl}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
      redirect: "manual",
    });

    // 3: Trailing slash
    await diagFetch("3_trailing_slash", `${baseUrl}/order/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    // 4: charset=UTF-8
    await diagFetch("4_charset", `${baseUrl}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    // 5: form-urlencoded
    const formBody = new URLSearchParams();
    formBody.append("codCliFor", String(codCliFor));
    formBody.append("codTipoMv", String(codTipoMv || "704"));
    formBody.append("items", JSON.stringify(testItems));
    await diagFetch("5_form", `${baseUrl}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Bearer ${token}` },
      body: formBody.toString(),
    });

    // 6: dados wrapper
    await diagFetch("6_dados", `${baseUrl}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ dados: payload }),
    });

    // 7: /orders (plural)
    await diagFetch("7_plural", `${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    // 8: pedido wrapper
    await diagFetch("8_pedido", `${baseUrl}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ pedido: payload }),
    });

    // 9: codCliFor as string
    await diagFetch("9_str_id", `${baseUrl}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ ...payload, codCliFor: String(codCliFor) }),
    });

    // 10: Accept header
    await diagFetch("10_accept", `${baseUrl}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    const summary = attempts.map((a: any) => ({
      label: a.label, status: a.status || "ERR", redirected: a.redirected || false,
      finalUrl: a.finalUrl || null,
      msg: a.data?.message || a.data?.error || a.error || null,
    }));

    console.log("SIGE debug summary:", JSON.stringify(summary));
    return c.json({ summary, attempts, baseUrl, testPayload: payload });
  } catch (e: any) {
    console.log("SIGE debug exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: LIST MOVEMENT TYPES (GET /type-moviment) ──────
// ═══════════════════════════════════════
// Endpoint correto no Swagger SIGE: GET /type-moviment
// Retorna os tipos de movimento disponiveis para usar como codTipoMv no POST /order
app.get(BASE + "/sige/order-types", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    // Forward query params (codTipoMv, codDocto, descricao)
    const url = new URL(c.req.url);
    const codTipoMv = url.searchParams.get("codTipoMv") || "";
    const codDocto = url.searchParams.get("codDocto") || "";
    const descricao = url.searchParams.get("descricao") || "";

    let queryString = "";
    const params: string[] = [];
    if (codTipoMv) params.push(`codTipoMv=${encodeURIComponent(codTipoMv)}`);
    if (codDocto) params.push(`codDocto=${encodeURIComponent(codDocto)}`);
    if (descricao) params.push(`descricao=${encodeURIComponent(descricao)}`);
    if (params.length > 0) queryString = "?" + params.join("&");

    console.log(`SIGE type-moviment: GET /type-moviment${queryString}`);
    const result = await sigeAuthFetch("GET", `/type-moviment${queryString}`);

    if (!result.ok) {
      console.log(`SIGE type-moviment: HTTP ${result.status}`, JSON.stringify(result.data).substring(0, 500));
      return _sigeProxyError(c, result);
    }

    // Parse the response - could be { dados: [...] } or direct array
    const rawData = result.data;
    const tiposMovimento = rawData?.dados || rawData?.data || (Array.isArray(rawData) ? rawData : [rawData].filter(Boolean));

    // Extract useful summary of each type
    const summary = (Array.isArray(tiposMovimento) ? tiposMovimento : []).map((t: any) => ({
      codTipoMv: t.codTipoMv || t.codigo || t.cod || null,
      codDocto: t.codDocto || null,
      descricao: t.descricao || t.nome || t.description || null,
      _raw: t,
    }));

    console.log(`SIGE type-moviment: found ${summary.length} types:`, JSON.stringify(summary.map((s: any) => `${s.codTipoMv} - ${s.descricao}`)));

    return c.json({
      message: `Encontrados ${summary.length} tipo(s) de movimento.`,
      types: summary,
      rawResponse: rawData,
    });
  } catch (e: any) {
    console.log("SIGE type-moviment exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: TEST ORDER WITH CUSTOM codTipoMv ──────
// ═══════════════════════════════════════
app.post(BASE + "/sige/test-order-tipomv", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const body = await c.req.json();
    // Input validation for test-order-tipomv
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    if (JSON.stringify(body).length > 50000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    var totValid = validate(body, {
      codCliFor: { required: true, type: "string", maxLen: 50 },
    });
    if (!totValid.ok) return c.json({ error: totValid.errors[0] || "Dados invalidos." }, 400);
    const { codCliFor, codTipoMv_values, items } = body;
    if (!codCliFor) return c.json({ error: "codCliFor obrigatório." }, 400);

    const valuesToTest = codTipoMv_values || ["704", "700", "600", "900", "850", "1850", "705", "714", "9999"];

    const rawItems = items || [{ codProduto: "019237", codRef: "019237", qtdeUnd: 1, valorUnitario: 100 }];
    const testItems = rawItems.map((item: any) => ({
      ...item,
      codRef: String(item.codRef || item.codProduto || ""),
      atlzSaldoV3: "S",
    }));

    const results: any[] = [];
    for (const mv of valuesToTest) {
      const payload = { codCliFor: Number(codCliFor), codTipoMv: String(mv), items: testItems };
      console.log(`SIGE test-tipomv: trying codTipoMv="${mv}"...`);
      const result = await sigeAuthFetch("POST", "/order", payload);
      const entry = {
        codTipoMv: mv,
        status: result.status,
        ok: result.ok,
        message: result.data?.message || result.data?.error || null,
        data: result.data,
      };
      results.push(entry);
      console.log(`SIGE test-tipomv [${mv}]: HTTP ${result.status} => ${entry.message}`);

      if (result.ok) {
        console.log(`SIGE test-tipomv: SUCCESS with codTipoMv="${mv}"!`);
        return c.json({
          message: `SUCESSO! codTipoMv="${mv}" funciona!`,
          workingValue: mv,
          orderData: result.data,
          allResults: results,
        });
      }
    }

    const tipoNaoEncontrado = results.filter((r: any) => r.message?.includes("Tipo de movimento"));
    const otherErrors = results.filter((r: any) => !r.message?.includes("Tipo de movimento"));

    return c.json({
      message: "Nenhum codTipoMv testado funcionou. Consulte GET /order-type no Swagger.",
      summary: {
        total: results.length,
        tipoNaoEncontrado: tipoNaoEncontrado.length,
        otherErrors: otherErrors.length,
      },
      otherErrorDetails: otherErrors,
      allResults: results,
    });
  } catch (e: any) {
    console.log("SIGE test-tipomv exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════
// ─── SIGE: DIAGNOSE ORDER (comprehensive dry-run diagnostic) ────
// ═══════════════════════════════════════════════════════════════════
// GET /sige/diagnose-order?sku=XXX&codCliente=YYY&verbose=1
// Tests every step of create-sale WITHOUT actually creating an order.
// Returns a detailed report of what works, what fails, and why.
app.get(BASE + "/sige/diagnose-order", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const url = new URL(c.req.url);
    const skuParam = url.searchParams.get("sku") || "";
    const codClienteParam = url.searchParams.get("codCliente") || "";
    const verbose = url.searchParams.get("verbose") === "1";

    const report: any = {
      timestamp: new Date().toISOString(),
      params: { sku: skuParam, codCliente: codClienteParam, verbose },
      steps: [] as any[],
      summary: { issues: [] as string[], warnings: [] as string[], ok: [] as string[], info: [] as string[] },
    };

    function addStep(name: string, status: "ok" | "warn" | "fail" | "info", details: any) {
      report.steps.push({ name, status, ...details });
      if (status === "ok") report.summary.ok.push(name);
      else if (status === "info") report.summary.info.push(name);
      else if (status === "warn") report.summary.warnings.push(`${name}: ${details.message || ""}`);
      else report.summary.issues.push(`${name}: ${details.message || ""}`);
    }

    // Helper: extract array from various SIGE response formats
    function exArr(data: any): any[] {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (data?.dados && Array.isArray(data.dados)) return data.dados;
      if (data?.data && Array.isArray(data.data)) return data.data;
      if (data?.items && Array.isArray(data.items)) return data.items;
      if (data?.content && Array.isArray(data.content)) return data.content;
      if (data?.codProduto || data?.id) return [data];
      return [];
    }

    // ── STEP 0: SIGE Connection Health ──
    try {
      const rawConfig = await kv.get("sige_api_config");
      const rawToken = await kv.get("sige_api_token");
      if (!rawConfig) {
        addStep("sige_connection", "fail", { message: "sige_api_config não encontrado no KV" });
        return c.json(report);
      }
      const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
      if (!rawToken) {
        addStep("sige_connection", "fail", { message: "sige_api_token não encontrado no KV" });
        return c.json(report);
      }
      const tokenData = typeof rawToken === "string" ? JSON.parse(rawToken) : rawToken;
      if (!tokenData.token) {
        addStep("sige_connection", "fail", { message: "Token SIGE vazio" });
        return c.json(report);
      }

      const isExpired = tokenData.expiresAt ? Date.now() >= new Date(tokenData.expiresAt).getTime() : false;
      const expiresIn = tokenData.expiresAt ? Math.round((new Date(tokenData.expiresAt).getTime() - Date.now()) / 60000) : null;
      addStep("sige_connection", isExpired ? "warn" : "ok", {
        message: isExpired ? "Token expirado (auto-relogin será tentado)" : "Token SIGE válido",
        baseUrl: config.baseUrl,
        expiresAt: tokenData.expiresAt || "unknown",
        expiresInMinutes: expiresIn,
        isExpired,
      });

      // Quick health check
      const healthCheck = await sigeAuthFetch("GET", "/user/me");
      addStep("sige_auth_test", healthCheck.ok ? "ok" : "fail", {
        message: healthCheck.ok ? "GET /user/me OK" : `GET /user/me falhou: HTTP ${healthCheck.status}`,
        status: healthCheck.status,
      });
    } catch (e: any) {
      addStep("sige_connection", "fail", { message: `Exception: ${e.message}` });
      return c.json(report);
    }

    // ── STEP 1: Find test SKU if not provided ──
    let testSku = skuParam;
    if (!testSku) {
      try {
        const { data: produtos } = await supabaseAdmin
          .from("produtos")
          .select("sku, nome")
          .limit(3);
        if (produtos && produtos.length > 0) {
          testSku = produtos[0].sku;
          addStep("find_test_sku", "ok", {
            message: `Usando SKU do catalogo: "${testSku}" (${produtos[0].nome})`,
            availableSkus: produtos.map((p: any) => p.sku),
          });
        } else {
          const maps = await kv.getByPrefix("sige_map_");
          if (maps && maps.length > 0) {
            const firstMap = typeof maps[0] === "string" ? JSON.parse(maps[0]) : maps[0];
            testSku = firstMap.codProduto || firstMap.sku || "TESTE-001";
            addStep("find_test_sku", "warn", {
              message: `Nenhum produto em Supabase, usando sige_map: "${testSku}"`,
            });
          } else {
            testSku = "TESTE-001";
            addStep("find_test_sku", "warn", { message: "Nenhum produto encontrado, usando SKU ficticio: TESTE-001" });
          }
        }
      } catch (e: any) {
        testSku = "TESTE-001";
        addStep("find_test_sku", "warn", { message: `Erro buscando SKU: ${e.message}. Usando TESTE-001.` });
      }
    } else {
      addStep("find_test_sku", "ok", { message: `SKU fornecido: "${testSku}"` });
    }

    // ── STEP 2: Check KV sige_map for this SKU ──
    let kvMapData: any = null;
    try {
      const mapEntry = await kv.get(`sige_map_${testSku}`);
      if (mapEntry) {
        kvMapData = typeof mapEntry === "string" ? JSON.parse(mapEntry) : mapEntry;
        addStep("kv_sige_map", "ok", {
          message: `sige_map_${testSku} encontrado`,
          data: kvMapData,
          sigeId: kvMapData.sigeId,
          codProduto: kvMapData.codProduto,
          sigeIdType: typeof kvMapData.sigeId,
          sigeIdIsNumeric: !isNaN(Number(kvMapData.sigeId)),
        });
      } else {
        addStep("kv_sige_map", "warn", {
          message: `sige_map_${testSku} NÃO encontrado no KV. Resolução de codRef depende da API.`,
        });
      }
    } catch (e: any) {
      addStep("kv_sige_map", "fail", { message: `Erro lendo KV: ${e.message}` });
    }

    // ── STEP 3: Product search via GET /product?codProduto=XXX ──
    let productSearchResult: any = null;
    let numericProductId: any = null;
    try {
      console.log(`[Diagnose] Searching product: GET /product?codProduto=${testSku}`);
      const prodSearchRes = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(testSku)}&limit=5&offset=1`);
      const prods = exArr(prodSearchRes.data);

      if (prods.length > 0) {
        const prod = prods[0];
        numericProductId = prod.id;
        productSearchResult = prod;

        const idIsNumeric = !isNaN(Number(prod.id)) && String(Number(prod.id)) === String(prod.id);
        const codProdutoMatchesSku = String(prod.codProduto) === testSku;

        addStep("product_search", "ok", {
          message: `Produto encontrado via GET /product?codProduto=${testSku}`,
          resultCount: prods.length,
          firstProduct: {
            id: prod.id,
            idType: typeof prod.id,
            idIsNumeric,
            codProduto: prod.codProduto,
            codProdutoMatchesSku,
            descProdutoEst: (prod.descProdutoEst || prod.descricao || "").substring(0, 80),
            allKeys: Object.keys(prod).sort(),
          },
          CRITICAL_ANALYSIS: {
            willUseAsNumericId: prod.id || prod.codProduto,
            idIsActuallyNumeric: idIsNumeric,
            possibleProblem: !idIsNumeric
              ? `prod.id="${prod.id}" NÃO é numérico! GET /product/${prod.id}/reference provavelmente vai dar 400.`
              : null,
            codProdutoFilterWorked: codProdutoMatchesSku
              ? "SIM - API retornou o produto correto"
              : `NAO! Buscamos "${testSku}" mas API retornou codProduto="${prod.codProduto}"`,
          },
          allProducts: verbose
            ? prods.map((p: any) => ({ id: p.id, codProduto: p.codProduto, desc: (p.descProdutoEst || "").substring(0, 50) }))
            : `${prods.length} resultados (use verbose=1 para ver)`,
        });
      } else {
        // If SKU has a hyphen, this failure is EXPECTED — the API doesn't accept hyphenated SKUs.
        // Show as "info" (expected behavior) instead of "fail" (real error).
        const isHyphenatedSku = testSku.includes("-");
        addStep("product_search", isHyphenatedSku ? "info" : "fail", {
          message: isHyphenatedSku
            ? `Esperado: API SIGE não aceita SKU hifenado "${testSku}" em busca direta. SKU-split será usado.`
            : `Produto NÃO encontrado: GET /product?codProduto=${testSku} retornou 0 resultados`,
          httpStatus: prodSearchRes.status,
          rawResponse: verbose ? prodSearchRes.data : "(use verbose=1)",
          expectedBehavior: isHyphenatedSku ? true : undefined,
        });
      }
    } catch (e: any) {
      addStep("product_search", "fail", { message: `Exception: ${e.message}` });
    }

    // ── STEP 3b: SKU-SPLIT strategy for hyphenated SKUs (e.g. "103716-347" → base="103716") ──
    let skuBasePart: string | null = null;
    let skuSuffix: string | null = null;
    if (testSku.includes("-") && !productSearchResult) {
      const lastHyphen = testSku.lastIndexOf("-");
      skuBasePart = testSku.substring(0, lastHyphen);
      skuSuffix = testSku.substring(lastHyphen + 1);

      try {
        console.log(`[Diagnose] SKU-SPLIT: Trying base part GET /product?codProduto=${skuBasePart}`);
        const baseSearchRes = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(skuBasePart)}&limit=5&offset=1`);
        const baseProds = exArr(baseSearchRes.data);

        if (baseProds.length > 0) {
          const baseProd = baseProds[0];
          numericProductId = baseProd.id;
          productSearchResult = baseProd;

          addStep("sku_split_search", "ok", {
            message: `SKU SPLIT FUNCIONA! "${testSku}" → base="${skuBasePart}" encontrado, suffix="${skuSuffix}" será usado como codRef`,
            basePart: skuBasePart,
            suffix: skuSuffix,
            product: {
              id: baseProd.id,
              codProduto: baseProd.codProduto,
              descProdutoEst: (baseProd.descProdutoEst || baseProd.descricao || "").substring(0, 80),
            },
            resolvedMapping: {
              codProduto: String(baseProd.codProduto || skuBasePart),
              codRef: skuSuffix,
            },
            allProducts: verbose
              ? baseProds.map((p: any) => ({ id: p.id, codProduto: p.codProduto, desc: (p.descProdutoEst || "").substring(0, 50) }))
              : `${baseProds.length} resultados`,
          });
        } else {
          addStep("sku_split_search", "warn", {
            message: `SKU split tentado: base="${skuBasePart}" também NÃO encontrado. suffix="${skuSuffix}"`,
            httpStatus: baseSearchRes.status,
          });
        }
      } catch (e: any) {
        addStep("sku_split_search", "fail", { message: `Exception no SKU split: ${e.message}` });
      }
    } else if (testSku.includes("-") && productSearchResult) {
      skuBasePart = testSku.substring(0, testSku.lastIndexOf("-"));
      skuSuffix = testSku.substring(testSku.lastIndexOf("-") + 1);
      addStep("sku_split_search", "ok", {
        message: `SKU "${testSku}" tem hífen mas busca direta já funcionou. Split disponível: base="${skuBasePart}", suffix="${skuSuffix}"`,
      });
    }

    // ── STEP 4a (PRIMARY): GET /product/{sku}/reference — API docs confirm {id} accepts SKU strings ──
    let resolvedCodRef: string | null = null;
    const refIdsToTest = [...new Set([testSku, ...(skuBasePart ? [skuBasePart] : []), ...(numericProductId ? [String(numericProductId)] : [])])];
    for (const refId of refIdsToTest) {
      try {
        // Use ?codRef= to narrow results if we have a suffix
        const codRefParam = (skuSuffix && (refId === testSku || refId === skuBasePart))
          ? `?codRef=${encodeURIComponent(skuSuffix)}` : "";
        const refPath = `/product/${encodeURIComponent(refId)}/reference${codRefParam}`;
        console.log(`[Diagnose] Testing: GET ${refPath}`);
        const refResult = await sigeAuthFetch("GET", refPath);
        const refs = exArr(refResult.data);
        const rawStr = JSON.stringify(refResult.data).substring(0, 500);

        if (refResult.ok && refs.length > 0) {
          let activeRef: any = null;
          if (skuSuffix) {
            activeRef = refs.find((r: any) => String(r.codRef) === skuSuffix && r.status === "A")
              || refs.find((r: any) => String(r.codRef) === skuSuffix);
          }
          if (!activeRef) {
            activeRef = refs.find((r: any) => r.status === "A") || refs[0];
          }
          if (!resolvedCodRef && activeRef?.codRef !== undefined) {
            resolvedCodRef = String(activeRef.codRef);
          }

          const suffixMatchFound = skuSuffix ? refs.some((r: any) => String(r.codRef) === skuSuffix) : false;
          addStep(`reference_direct_${refId}`, "ok", {
            message: `GET ${refPath} -> ${refs.length} referencia(s) encontrada(s)!`,
            resolvedCodRef: activeRef?.codRef !== undefined ? String(activeRef.codRef) : null,
            activeRef,
            suffixMatch: skuSuffix ? { suffix: skuSuffix, found: suffixMatchFound } : null,
            allRefs: refs.map((r: any) => ({
              codRef: r.codRef, codProduto: r.codProduto, status: r.status,
              descricao: r.descricao || r.descRef || "",
            })),
            rawResponsePreview: verbose ? rawStr : "(use verbose=1)",
          });
        } else {
          // If testing with the full hyphenated SKU (e.g. "012561-227"), failure is EXPECTED
          // because the SIGE API doesn't accept hyphens in the path. Show as "info".
          const isExpectedHyphenFail = testSku.includes("-") && refId === testSku;
          addStep(`reference_direct_${refId}`, isExpectedHyphenFail ? "info" : (refResult.ok ? "warn" : "fail"), {
            message: isExpectedHyphenFail
              ? `Esperado: API não aceita SKU hifenado no path. GET ${refPath} → HTTP ${refResult.status}`
              : refResult.ok
                ? `GET ${refPath} retornou 0 refs`
                : `GET ${refPath} falhou: HTTP ${refResult.status}`,
            httpStatus: refResult.status,
            rawResponsePreview: rawStr,
            refsFound: refs.length,
            expectedBehavior: isExpectedHyphenFail ? true : undefined,
          });
        }
      } catch (e: any) {
        addStep(`reference_direct_${refId}`, "fail", { message: `Exception: ${e.message}` });
      }
    }

    // ── STEP 4c: Global /reference?codProduto=XXX ──
    try {
      console.log(`[Diagnose] Testing global: GET /reference?codProduto=${testSku}`);
      const globalRef = await sigeAuthFetch("GET", `/reference?codProduto=${encodeURIComponent(testSku)}&limit=10&offset=1`);
      const allRefs = exArr(globalRef.data);
      const matching = allRefs.filter((r: any) => {
        const rcp = String(r.codProduto || "");
        return rcp === testSku || (skuBasePart && rcp === skuBasePart);
      });
      const nonMatching = allRefs.filter((r: any) => {
        const rcp = String(r.codProduto || "");
        return rcp !== testSku && !(skuBasePart && rcp === skuBasePart);
      });
      const filtersCorrectly = matching.length > 0 && nonMatching.length === 0;

      addStep("global_reference_endpoint", allRefs.length > 0 ? (filtersCorrectly ? "ok" : "warn") : "warn", {
        message: filtersCorrectly
          ? `GET /reference?codProduto=${testSku} filtra CORRETAMENTE (${matching.length} refs)`
          : allRefs.length > 0
            ? `GET /reference?codProduto=${testSku} retornou ${allRefs.length} refs mas ${nonMatching.length} NÃO pertencem ao produto!`
            : `GET /reference?codProduto=${testSku} retornou 0 refs`,
        totalReturned: allRefs.length,
        matchingThisSku: matching.length,
        nonMatchingOtherSkus: nonMatching.length,
        filtersCorrectly,
        sampleMatching: matching.slice(0, 3).map((r: any) => ({ codProduto: r.codProduto, codRef: r.codRef, status: r.status })),
        sampleNonMatching: nonMatching.slice(0, 3).map((r: any) => ({ codProduto: r.codProduto, codRef: r.codRef })),
        CRITICAL_ANALYSIS: !filtersCorrectly && allRefs.length > 0
          ? "CONFIRMA que a API ignora o filtro codProduto e retorna TODAS as refs. O filtro local no backend e ESSENCIAL."
          : null,
      });

      if (!resolvedCodRef && matching.length > 0) {
        const activeRef = matching.find((r: any) => r.status === "A") || matching[0];
        resolvedCodRef = String(activeRef.codRef);
      }
    } catch (e: any) {
      addStep("global_reference_endpoint", "fail", { message: `Exception: ${e.message}` });
    }

    // ── STEP 5: Price resolution ──
    let resolvedPrice: number = 0;
    try {
      const priceSteps: any[] = [];

      // 5a: Custom price in KV
      for (const prefix of ["price_custom_", "product_price_"]) {
        const raw = await kv.get(`${prefix}${testSku}`);
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          priceSteps.push({ source: prefix, found: true, value: parsed });
          if (resolvedPrice <= 0 && parsed.price && Number(parsed.price) > 0) {
            resolvedPrice = Number(parsed.price);
          }
        } else {
          priceSteps.push({ source: prefix, found: false });
        }
      }

      // 5b: Cached SIGE price
      const cachedRaw = await kv.get(`sige_price_${testSku}`);
      if (cachedRaw) {
        const cached = typeof cachedRaw === "string" ? JSON.parse(cachedRaw) : cachedRaw;
        priceSteps.push({ source: "sige_price_cache", found: true, value: cached });
        if (resolvedPrice <= 0 && cached.price && Number(cached.price) > 0) {
          resolvedPrice = Number(cached.price);
        }
      } else {
        priceSteps.push({ source: "sige_price_cache", found: false });
      }

      // 5c: Direct product endpoint GET /product/{sku} (potentially broken)
      const directProd = await sigeAuthFetch("GET", `/product/${encodeURIComponent(testSku)}`);
      priceSteps.push({
        source: `GET /product/${testSku} (direct)`,
        status: directProd.status,
        ok: directProd.ok,
        message: directProd.ok
          ? "Funciona com SKU string!"
          : `Falhou: HTTP ${directProd.status} - como esperado para SKUs nao-numericos`,
      });

      if (directProd.ok && directProd.data) {
        const prod = directProd.data?.dados || directProd.data;
        const _pf = ["vlrTabela","valorTabela","vlrVenda","valorVenda","precoVenda","preco","valor","valorUnitario","precoUnitario"];
        const foundPrices: any = {};
        const src5c = Array.isArray(prod) ? prod[0] : prod;
        for (const k of _pf) {
          const v = src5c?.[k];
          if (v !== undefined && v !== null && Number(v) > 0) {
            foundPrices[k] = Number(v);
            if (resolvedPrice <= 0) resolvedPrice = Number(v);
          }
        }
        priceSteps.push({ source: "product_price_fields", foundPrices });
      }

      // 5d: Try with numericId if different from SKU
      if (numericProductId && String(numericProductId) !== testSku) {
        const numProd = await sigeAuthFetch("GET", `/product/${encodeURIComponent(numericProductId)}`);
        priceSteps.push({
          source: `GET /product/${numericProductId} (numeric ID)`,
          status: numProd.status,
          ok: numProd.ok,
        });
        if (numProd.ok && numProd.data) {
          const prod = numProd.data?.dados || numProd.data;
          const _pf2 = ["vlrTabela","valorTabela","vlrVenda","valorVenda","precoVenda","preco","valor","valorUnitario","precoUnitario"];
          const foundPrices: any = {};
          const src5d = Array.isArray(prod) ? prod[0] : prod;
          for (const k of _pf2) {
            const v = src5d?.[k];
            if (v !== undefined && v !== null && Number(v) > 0) {
              foundPrices[k] = Number(v);
              if (resolvedPrice <= 0) resolvedPrice = Number(v);
            }
          }
          priceSteps.push({ source: "product_price_fields_numeric", foundPrices });
        }
      }

      // 5e: Search endpoint (mirrors resolveItemPrice logic)
      if (resolvedPrice <= 0) {
        const searchSkusForPrice = [...new Set([
          ...(skuBasePart ? [skuBasePart] : []),
          testSku,
          ...(productSearchResult?.codProduto ? [String(productSearchResult.codProduto)] : []),
        ].filter(Boolean))];
        for (const ss of searchSkusForPrice) {
          if (resolvedPrice > 0) break;
          try {
            const searchPriceRes = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(ss)}&limit=1&offset=1`);
            const searchPriceProds = exArr(searchPriceRes.data);
            if (searchPriceRes.ok && searchPriceProds.length > 0) {
              const sprod = searchPriceProds[0];
              const _pf3 = ["vlrTabela","valorTabela","vlrVenda","valorVenda","precoVenda","preco","valor","valorUnitario","precoUnitario"];
              const foundPrices: any = {};
              for (const k of _pf3) {
                const v = sprod?.[k];
                if (v !== undefined && v !== null && Number(v) > 0) {
                  foundPrices[k] = Number(v);
                  if (resolvedPrice <= 0) resolvedPrice = Number(v);
                }
              }
              priceSteps.push({ source: `GET /product?codProduto=${ss} (search)`, foundPrices, productsFound: searchPriceProds.length });
              // If no inline price, try by numeric ID
              if (resolvedPrice <= 0 && sprod.id && String(sprod.id) !== ss) {
                try {
                  const idPrRes = await sigeAuthFetch("GET", `/product/${encodeURIComponent(sprod.id)}`);
                  if (idPrRes.ok && idPrRes.data) {
                    const idProd = idPrRes.data?.dados || idPrRes.data;
                    const idSrc = Array.isArray(idProd) ? idProd[0] : idProd;
                    const idPrices: any = {};
                    for (const k of _pf3) {
                      const v = idSrc?.[k];
                      if (v !== undefined && v !== null && Number(v) > 0) {
                        idPrices[k] = Number(v);
                        if (resolvedPrice <= 0) resolvedPrice = Number(v);
                      }
                    }
                    priceSteps.push({ source: `GET /product/${sprod.id} (via search numericId)`, foundPrices: idPrices });
                  }
                } catch { /* ignore */ }
              }
            }
          } catch { /* ignore */ }
        }
      }

      // 5f (was 5e): list-price-items (try resolved codProduto, then base part, then original SKU)
      if (resolvedPrice <= 0) {
        const lpSkusToTry = [...new Set([
          productSearchResult?.codProduto,
          skuBasePart,
          testSku,
        ].filter(Boolean) as string[])];
        for (const lpSku of lpSkusToTry) {
          if (resolvedPrice > 0) break;
          try {
            const lpRes = await sigeAuthFetch("GET", `/list-price-items?codProduto=${encodeURIComponent(lpSku)}&limit=10&offset=1`);
            if (lpRes.ok && lpRes.data) {
              const items = exArr(lpRes.data);
              priceSteps.push({
                source: `GET /list-price-items?codProduto=${lpSku}`,
                found: items.length,
                sample: items.slice(0, 3),
              });
              for (const lpItem of items) {
                const v = lpItem?.vlrTabela || lpItem?.valorTabela || lpItem?.vlrVenda || lpItem?.preco || lpItem?.valor;
                if (v && Number(v) > 0 && resolvedPrice <= 0) {
                  resolvedPrice = Number(v);
                  break;
                }
              }
              if (items.length > 0) break;
            } else {
              priceSteps.push({
                source: `GET /list-price-items?codProduto=${lpSku}`,
                status: lpRes.status,
                ok: false,
              });
            }
          } catch { /* ignore */ }
        }
      }

      const anyPriceFound = resolvedPrice > 0;
      addStep("price_resolution", anyPriceFound ? "ok" : "warn", {
        message: anyPriceFound
          ? `Preco encontrado: R$${resolvedPrice.toFixed(2)}`
          : "NENHUM preço encontrado! Items irão com valorUnitario=0 (SIGE pode rejeitar)",
        resolvedPrice: anyPriceFound ? resolvedPrice : null,
        details: priceSteps,
      });
    } catch (e: any) {
      addStep("price_resolution", "fail", { message: `Exception: ${e.message}` });
    }

    // ── STEP 6: Customer/codCliFor validation ──
    let validCodCliFor: number | null = null;
    if (codClienteParam) {
      try {
        const codCliForNum = Number(codClienteParam);
        const isValidNumber = !isNaN(codCliForNum) && codCliForNum > 0;

        if (!isValidNumber) {
          addStep("customer_validation", "fail", {
            message: `codCliente="${codClienteParam}" NÃO é um número válido! Number() = ${codCliForNum}`,
            willCause: "codCliFor: NaN no payload, SIGE vai rejeitar",
          });
        } else {
          validCodCliFor = codCliForNum;
          const custResult = await sigeAuthFetch("GET", `/customer/${encodeURIComponent(codClienteParam)}`);
          addStep("customer_validation", custResult.ok ? "ok" : "warn", {
            message: custResult.ok
              ? `Cliente ${codClienteParam} encontrado no SIGE`
              : `Cliente ${codClienteParam}: GET /customer/${codClienteParam} retornou HTTP ${custResult.status}`,
            codCliFor: codCliForNum,
            codCliForType: "number",
            customerData: custResult.ok
              ? {
                  nome: custResult.data?.dados?.nomeRazao || custResult.data?.nomeRazao || "(não extraído)",
                  cpfCgc: custResult.data?.dados?.cpfCgc || custResult.data?.cpfCgc || "(não extraído)",
                }
              : null,
          });
        }
      } catch (e: any) {
        addStep("customer_validation", "fail", { message: `Exception: ${e.message}` });
      }
    } else {
      try {
        const mappings = await kv.getByPrefix("sige_customer_map:");
        if (mappings && mappings.length > 0) {
          const first = typeof mappings[0] === "string" ? JSON.parse(mappings[0]) : mappings[0];
          addStep("customer_validation", "warn", {
            message: `codCliente não fornecido. Encontrado ${mappings.length} mapeamento(s) no KV.`,
            sampleMapping: first,
            suggestion: `Use ?codCliente=${first.sigeCustomerId || first.codCadastro || "???"}`,
          });
        } else {
          addStep("customer_validation", "warn", { message: "codCliente não fornecido e nenhum mapeamento encontrado no KV" });
        }
      } catch {
        addStep("customer_validation", "warn", { message: "codCliente não fornecido" });
      }
    }

    // ── STEP 7: Test resolveItemPrice approach (now uses search endpoint + SKU split) ──
    try {
      const priceTestResults: any[] = [];

      // 7a: Test old approach (GET /product/{sku}) — expected to fail for string SKUs
      const directGet = await sigeAuthFetch("GET", `/product/${encodeURIComponent(testSku)}`);
      priceTestResults.push({
        method: `GET /product/${testSku} (old approach)`,
        ok: directGet.ok,
        status: directGet.status,
        conclusion: directGet.ok ? "Funciona com SKU string" : "Falha como esperado - endpoint só aceita IDs numéricos",
      });

      // 7b: Test new approach (GET /product?codProduto={sku}) 
      const searchSkus = [testSku];
      if (skuBasePart) searchSkus.push(skuBasePart);
      for (const ss of searchSkus) {
        const searchGet = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(ss)}&limit=1&offset=1`);
        const searchProds = exArr(searchGet.data);
        priceTestResults.push({
          method: `GET /product?codProduto=${ss} (new search approach)`,
          ok: searchGet.ok && searchProds.length > 0,
          status: searchGet.status,
          productsFound: searchProds.length,
          conclusion: searchProds.length > 0
            ? `Produto encontrado! resolveItemPrice pode buscar preço via busca`
            : `Nenhum produto encontrado para codProduto="${ss}"`,
        });
      }

      const anyNewApproachWorks = priceTestResults.some(r => r.ok && r.method.includes("new search"));
      addStep("resolveItemPrice_test", anyNewApproachWorks ? "ok" : (directGet.ok ? "ok" : "warn"), {
        message: anyNewApproachWorks
          ? "✅ resolveItemPrice CORRIGIDO: busca via GET /product?codProduto= funciona" + (skuBasePart ? ` (usando base "${skuBasePart}")` : "")
          : directGet.ok
            ? "GET /product/{sku} funciona diretamente"
            : `Nenhum método de busca de preço encontrou o produto "${testSku}"`,
        tests: priceTestResults,
        FIX_STATUS: anyNewApproachWorks
          ? "CORRIGIDO - resolveItemPrice agora usa GET /product?codProduto= + SKU-split"
          : null,
      });
    } catch (e: any) {
      addStep("resolveItemPrice_test", "fail", { message: `Exception: ${e.message}` });
    }

    // ── STEP 8: DRY-RUN payload preview ──
    // Use SKU-split data if available: suffix as codRef, base as codProduto
    const finalCodRef = resolvedCodRef || (skuSuffix ? skuSuffix : "0");
    const finalCodProduto = productSearchResult?.codProduto || (skuBasePart || testSku);
    const dryRunPayload = {
      codCliFor: validCodCliFor || 12345,
      codTipoMv: "704",
      items: [{
        codProduto: finalCodProduto,
        codRef: finalCodRef,
        qtdeUnd: 1,
        valorUnitario: resolvedPrice,
      }],
    };

    const payloadIssues: string[] = [];
    if (!validCodCliFor) payloadIssues.push("codCliFor é placeholder (12345) - não foi fornecido");
    if (!dryRunPayload.items[0].codProduto) payloadIssues.push("codProduto vazio");
    if (finalCodRef === "0") payloadIssues.push("codRef e fallback '0' - pode ser rejeitado dependendo do produto");
    if (dryRunPayload.items[0].valorUnitario <= 0) payloadIssues.push("valorUnitario=0 - SIGE pode rejeitar");

    addStep("dry_run_payload", payloadIssues.length === 0 ? "ok" : "warn", {
      message: payloadIssues.length === 0
        ? "Payload parece valido"
        : `${payloadIssues.length} problema(s) no payload`,
      issues: payloadIssues,
      payload: dryRunPayload,
      resolvedCodRef: finalCodRef,
      codRefSource: resolvedCodRef
        ? "Resolvido da API SIGE"
        : skuSuffix
          ? `Suffix do SKU split ("${testSku}" → "${skuSuffix}")`
          : "Fallback '0'",
      skuSplitUsed: skuBasePart ? { base: skuBasePart, suffix: skuSuffix } : null,
    });

    // ── FINAL SUMMARY ──
    const topFixes: string[] = [];

    // Check if any reference_direct_* step succeeded
    const refDirectSteps = report.steps.filter((s: any) => s.name.startsWith("reference_direct_"));
    const anyRefDirectOk = refDirectSteps.some((s: any) => s.status === "ok");
    if (anyRefDirectOk) {
      const okStep = refDirectSteps.find((s: any) => s.status === "ok");
      topFixes.push(`✅ GET /product/{id}/reference FUNCIONA: ${okStep?.message || ""}`);
    } else if (refDirectSteps.length > 0) {
      const failMsgs = refDirectSteps.map((s: any) => `${s.name}: ${s.message}`).join("; ");
      topFixes.push(`ATENCAO: Nenhum GET /product/{id}/reference retornou dados. Detalhes: ${failMsgs}`);
    }

    const resolveItemPriceStep = report.steps.find((s: any) => s.name === "resolveItemPrice_test");
    if (resolveItemPriceStep && resolveItemPriceStep.status !== "ok") {
      topFixes.push("resolveItemPrice(): nenhum método de preço funcionou. Verifique os endpoints com o desenvolvedor.");
    }

    const skuSplitStep = report.steps.find((s: any) => s.name === "sku_split_search");
    if (skuSplitStep?.status === "ok") {
      topFixes.push(`✅ SKU-SPLIT funciona: "${testSku}" → codProduto="${skuBasePart}", codRef="${skuSuffix}"`);
    }

    const prodSearchStep = report.steps.find((s: any) => s.name === "product_search");
    if (prodSearchStep?.status === "fail" && !skuSplitStep && !anyRefDirectOk) {
      topFixes.push(`Produto NÃO encontrado por NENHUM método. Verifique se "${testSku}" existe no SIGE.`);
    }

    const globalRefStep = report.steps.find((s: any) => s.name === "global_reference_endpoint");
    if (globalRefStep && globalRefStep.filtersCorrectly === false && globalRefStep.totalReturned > 0) {
      topFixes.push("CONFIRMA: endpoint /reference?codProduto= ignora filtro. O filtro local no backend é necessário.");
    }

    if (finalCodRef === "0") {
      topFixes.push(`ALERTA: Nenhuma referência encontrada para SKU "${testSku}". O fallback codRef="0" será usado.`);
    }

    report.conclusion = {
      totalSteps: report.steps.length,
      passed: report.summary.ok.length,
      info: report.summary.info.length,
      warnings: report.summary.warnings.length,
      failures: report.summary.issues.length,
      readyToCreateOrder: report.summary.issues.length === 0,
      topFixes,
    };

    console.log(`[Diagnose] Complete: ${report.summary.ok.length} ok, ${report.summary.warnings.length} warn, ${report.summary.issues.length} fail`);
    return c.json(report);
  } catch (e: any) {
    console.log("SIGE diagnose-order exception:", e);
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── MERCADO PAGO ─────────────────────
// ═══════════════════════════════════════

const MP_API_BASE = "https://api.mercadopago.com";

// Helper: get Mercado Pago credentials from KV
async function getMPCredentials(): Promise<{ accessToken: string; publicKey: string } | null> {
  const raw = await kv.get("mercadopago_config");
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed.accessToken) return null;
  return { accessToken: parsed.accessToken, publicKey: parsed.publicKey || "" };
}

// Helper: make authenticated request to MP API
async function mpApiFetch(path: string, accessToken: string, options?: { method?: string; body?: any }) {
  const url = MP_API_BASE + path;
  const fetchHeaders: Record<string, string> = {
    "Authorization": "Bearer " + accessToken,
    "Content-Type": "application/json",
    "X-Idempotency-Key": crypto.randomUUID(),
  };
  const fetchOptions: any = {
    method: options?.method || "GET",
    headers: fetchHeaders,
  };
  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, fetchOptions);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

// GET /mercadopago/config — get config status (admin)
app.get(BASE + "/mercadopago/config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Não autorizado" }, 401);

    const raw = await kv.get("mercadopago_config");
    if (!raw) return c.json({ configured: false });

    const parsed = JSON.parse(raw);
    return c.json({
      configured: true,
      hasAccessToken: !!parsed.accessToken,
      hasPublicKey: !!parsed.publicKey,
      accessTokenPreview: parsed.accessToken ? "****" + parsed.accessToken.slice(-8) : null,
      publicKeyPreview: parsed.publicKey ? parsed.publicKey.slice(0, 12) + "****" : null,
      sandbox: !!parsed.sandbox,
      updatedAt: parsed.updatedAt || null,
    });
  } catch (e: any) {
    console.log("[MercadoPago] Config get error:", e);
    return c.json({ error: "Erro ao buscar configuracao MercadoPago." }, 500);
  }
});

// GET /mercadopago/enabled — public: check if Mercado Pago is available for checkout
app.get(BASE + "/mercadopago/enabled", async (c) => {
  try {
    var raw = await kv.get("mercadopago_config");
    if (!raw) return c.json({ enabled: false, sandbox: false });
    var parsed = JSON.parse(raw);
    var isEnabled = !!parsed.accessToken;
    return c.json({ enabled: isEnabled, sandbox: !!parsed.sandbox });
  } catch (e: any) {
    console.log("[MercadoPago] Enabled check error:", e);
    return c.json({ enabled: false, sandbox: false });
  }
});

// PUT /mercadopago/config — save credentials (admin)
app.put(BASE + "/mercadopago/config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Não autorizado" }, 401);

    var mpBody = await c.req.json();
    // Input validation for MP config
    var mpCfgValid = validate(mpBody, {
      accessToken: { required: true, type: "string", minLen: 1, maxLen: 500 },
      publicKey: { type: "string", maxLen: 500 },
      sandbox: { type: "boolean" },
    });
    if (!mpCfgValid.ok) return c.json({ error: mpCfgValid.errors[0] || "Access Token é obrigatório." }, 400);
    var accessToken = (mpCfgValid.sanitized.accessToken || "").trim();
    var publicKey = (mpCfgValid.sanitized.publicKey || "").trim();
    var sandbox = !!mpCfgValid.sanitized.sandbox;
    if (!accessToken) {
      return c.json({ error: "Access Token é obrigatório." }, 400);
    }

    await kv.set("mercadopago_config", JSON.stringify({
      accessToken: accessToken,
      publicKey: publicKey,
      sandbox: !!sandbox,
      updatedAt: Date.now(),
    }));

    console.log("[MercadoPago] Config saved by user " + userId);
    return c.json({ success: true, configured: true });
  } catch (e: any) {
    console.log("[MercadoPago] Config save error:", e);
    return c.json({ error: "Erro ao salvar configuracao MercadoPago." }, 500);
  }
});

// DELETE /mercadopago/config — remove credentials (admin)
app.delete(BASE + "/mercadopago/config", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Não autorizado" }, 401);

    await kv.del("mercadopago_config");
    console.log("[MercadoPago] Config deleted by user " + userId);
    return c.json({ success: true, configured: false });
  } catch (e: any) {
    console.log("[MercadoPago] Config delete error:", e);
    return c.json({ error: "Erro ao remover configuracao MercadoPago." }, 500);
  }
});

// POST /mercadopago/test — test connection (admin)
app.post(BASE + "/mercadopago/test", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Não autorizado" }, 401);

    const creds = await getMPCredentials();
    if (!creds) return c.json({ error: "Mercado Pago não configurado." }, 400);

    const result = await mpApiFetch("/users/me", creds.accessToken);
    if (!result.ok) {
      console.log("[MercadoPago] test connection error:", result.status, result.text?.slice(0, 300));
      return c.json({
        success: false,
        error: "Falha na autenticacao com Mercado Pago.",
      });
    }

    return c.json({
      success: true,
      user: {
        id: result.json?.id,
        nickname: result.json?.nickname,
        email: result.json?.email,
        siteId: result.json?.site_id,
        countryId: result.json?.country_id,
      },
    });
  } catch (e: any) {
    console.log("[MercadoPago] Test error:", e);
    return c.json({ error: "Erro ao testar MercadoPago." }, 500);
  }
});

// POST /mercadopago/create-preference — create Checkout Pro preference
app.post(BASE + "/mercadopago/create-preference", async (c) => {
  try {
    // SECURITY: Require auth — only logged-in users can create charges
    var mpUserId = await getAuthUserId(c.req.raw);
    if (!mpUserId) return c.json({ error: "Autenticacao necessaria." }, 401);
    // Rate limit: 5 preferences per minute per IP
    var mpRl = _getRateLimitKey(c, "mp_create");
    var mpRlResult = _checkRateLimit(mpRl, 5);
    if (!mpRlResult.allowed) return _rl429(c, "Muitas tentativas. Aguarde.", mpRlResult);
    const creds = await getMPCredentials();
    if (!creds) return c.json({ error: "Mercado Pago não configurado." }, 400);

    const body = await c.req.json();
    // Input validation for MP preference
    var mpCreateValid = validate(body, {
      order_id: { type: "string", maxLen: 100 },
      payer_email: { type: "string", maxLen: 254 },
      payer_name: { type: "string", maxLen: 200 },
      items: { required: true, type: "array", maxItems: 200 },
      shipping_cost: { type: "number", min: 0, max: 99999 },
    });
    if (!mpCreateValid.ok) {
      return c.json({ error: mpCreateValid.errors[0] || "Dados invalidos." }, 400);
    }
    const { order_id, payer_email, payer_name, items, shipping_cost, back_urls } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return c.json({ error: "Items são obrigatórios." }, 400);
    }

    // SECURITY: Validate prices server-side (allow up to 45% discount for coupons)
    try {
      var mpItemsForValidation = items.map(function(it: any) {
        return { item_id: it.item_id || it.id || "", sku: it.item_id || it.id || "", price_cents: it.price_cents || Math.round((it.unit_price || 0) * 100), quantity: it.quantity || 1 };
      });
      var mpPriceCheck = await _validatePaymentPrices(mpItemsForValidation, 45);
      console.log("[MercadoPago] Price validation: verified=" + mpPriceCheck.verifiedCount + "/" + mpPriceCheck.totalItems + " clientTotal=" + mpPriceCheck.clientTotalCents + " expectedTotal=" + mpPriceCheck.expectedTotalCents + " flagged=" + mpPriceCheck.flaggedItems.length);
      if (!mpPriceCheck.ok) {
        console.log("[MercadoPago] PRICE TAMPERING BLOCKED for order " + (order_id || "unknown") + " by user " + mpUserId + ": " + mpPriceCheck.flaggedItems.join(", "));
        return c.json({ error: "Valores dos itens nao conferem com o catalogo. Atualize a pagina e tente novamente." }, 400);
      }
      if (mpPriceCheck.flaggedItems.length > 0) {
        console.log("[MercadoPago] PRICE WARNING for order " + (order_id || "unknown") + ": " + mpPriceCheck.flaggedItems.join(", "));
      }
    } catch (pvErr3) {
      console.log("[MercadoPago] Price validation error (non-blocking): " + pvErr3);
    }

    const mpItems = items.map((it: any) => ({
      id: it.item_id || it.id || "item",
      title: it.description || it.title || "Produto",
      quantity: it.quantity || 1,
      unit_price: it.unit_price || (it.price_cents ? it.price_cents / 100 : 0),
      currency_id: "BRL",
    }));

    if (shipping_cost && shipping_cost > 0) {
      mpItems.push({
        id: "shipping",
        title: "Frete",
        quantity: 1,
        unit_price: shipping_cost,
        currency_id: "BRL",
      });
    }

    const preference: any = {
      items: mpItems,
      external_reference: order_id || ("order_" + Date.now()),
      payer: {
        email: payer_email || "",
        name: payer_name || "",
      },
      payment_methods: {
        excluded_payment_types: [],
        installments: 12,
      },
      auto_return: "approved",
      statement_descriptor: "CARRETAO AUTO PECAS",
    };

    var supaUrl = Deno.env.get("SUPABASE_URL") || "";
    preference.notification_url = supaUrl + "/functions/v1/make-server-b7b07654/mercadopago/webhook";

    // SECURITY: Validate back_urls to prevent open redirect via MP
    if (back_urls && typeof back_urls === "object") {
      var allowedDomains = ["autopecascarretao.com", "autopecascarretao.com.br", "cafe-puce-47800704.figma.site"];
      var validBackUrls: any = {};
      var backUrlFields = ["success", "failure", "pending"];
      for (var bui = 0; bui < backUrlFields.length; bui++) {
        var buVal = back_urls[backUrlFields[bui]];
        if (buVal && typeof buVal === "string") {
          try {
            var buUrl = new URL(buVal);
            var buHost = buUrl.hostname.replace(/^www\./, "");
            var buAllowed = false;
            for (var bai = 0; bai < allowedDomains.length; bai++) {
              if (buHost === allowedDomains[bai]) { buAllowed = true; break; }
            }
            if (buAllowed) validBackUrls[backUrlFields[bui]] = buVal;
          } catch {}
        }
      }
      if (Object.keys(validBackUrls).length > 0) preference.back_urls = validBackUrls;
    }

    const result = await mpApiFetch("/checkout/preferences", creds.accessToken, {
      method: "POST",
      body: preference,
    });

    if (!result.ok) {
      console.log("[MercadoPago] Create preference error:", result.status, result.text?.slice(0, 500));
      return c.json({
        success: false,
        error: "Erro ao criar preferencia de pagamento.",
      }, 400);
    }

    var txKey = "mp_tx:" + (result.json?.id || Date.now());
    await kv.set(txKey, JSON.stringify({
      type: "preference",
      preferenceId: result.json?.id,
      externalReference: preference.external_reference,
      status: "pending",
      items: mpItems,
      payer: preference.payer,
      total: mpItems.reduce((sum: number, it: any) => sum + (it.unit_price * it.quantity), 0),
      createdAt: Date.now(),
      initPoint: result.json?.init_point,
      sandboxInitPoint: result.json?.sandbox_init_point,
    }));

    return c.json({
      success: true,
      preferenceId: result.json?.id,
      initPoint: result.json?.init_point,
      sandboxInitPoint: result.json?.sandbox_init_point,
      externalReference: preference.external_reference,
    });
  } catch (e: any) {
    console.log("[MercadoPago] Create preference error:", e);
    return c.json({ error: "Erro ao criar preferência de pagamento." }, 500);
  }
});

// POST /mercadopago/payment-status — check payment status (requires auth)
app.post(BASE + "/mercadopago/payment-status", async (c) => {
  try {
    var mpStatusUserId = await getAuthUserId(c.req.raw);
    if (!mpStatusUserId) return c.json({ error: "Autenticacao necessaria." }, 401);
    var mpStBody = await c.req.json();
    var mpStValid = validate(mpStBody, {
      payment_id: { required: true, type: "string", maxLen: 100 },
    });
    if (!mpStValid.ok) return c.json({ error: "payment_id é obrigatório." }, 400);
    var payment_id = mpStValid.sanitized.payment_id;

    const creds = await getMPCredentials();
    if (!creds) return c.json({ error: "Mercado Pago não configurado." }, 400);

    const result = await mpApiFetch("/v1/payments/" + payment_id, creds.accessToken);
    if (!result.ok) {
      console.log("[MercadoPago] payment-status error:", result.status, result.text?.slice(0, 300));
      return c.json({
        error: "Erro ao consultar pagamento.",
      }, 400);
    }

    var pay = result.json;
    return c.json({
      payment_id: pay.id,
      status: pay.status,
      status_detail: pay.status_detail,
      payment_type: pay.payment_type_id,
      payment_method: pay.payment_method_id,
      external_reference: pay.external_reference,
      transaction_amount: pay.transaction_amount,
      currency_id: pay.currency_id,
      date_created: pay.date_created,
      date_approved: pay.date_approved,
      payer: pay.payer,
    });
  } catch (e: any) {
    console.log("[MercadoPago] Payment status error:", e);
    return c.json({ error: "Erro ao consultar status do pagamento." }, 500);
  }
});

// POST /mercadopago/search-payments — search payments (admin)
app.post(BASE + "/mercadopago/search-payments", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Não autorizado" }, 401);

    const creds = await getMPCredentials();
    if (!creds) return c.json({ error: "Mercado Pago não configurado." }, 400);

    const body = await c.req.json();
    // Input validation for search-payments
    var spValid = validate(body, {
      status: { type: "string", maxLen: 50 },
      external_reference: { type: "string", maxLen: 200 },
      limit: { type: "number", min: 1, max: 100 },
      offset: { type: "number", min: 0, max: 100000 },
    });
    if (!spValid.ok) return c.json({ error: spValid.errors[0] || "Dados invalidos." }, 400);
    var queryParts: string[] = [];
    if (body.status) queryParts.push("status=" + encodeURIComponent(body.status));
    if (body.external_reference) queryParts.push("external_reference=" + encodeURIComponent(body.external_reference));
    queryParts.push("sort=date_created");
    queryParts.push("criteria=desc");
    queryParts.push("range=date_created");
    queryParts.push("limit=" + (body.limit || 30));
    queryParts.push("offset=" + (body.offset || 0));

    var searchPath = "/v1/payments/search?" + queryParts.join("&");
    const result = await mpApiFetch(searchPath, creds.accessToken);

    if (!result.ok) {
      console.log("[MercadoPago] search-payments error:", result.status, result.text?.slice(0, 300));
      return c.json({
        error: "Erro ao buscar pagamentos.",
      }, 400);
    }

    var payments = (result.json?.results || []).map((p: any) => ({
      id: p.id,
      status: p.status,
      status_detail: p.status_detail,
      payment_type: p.payment_type_id,
      payment_method: p.payment_method_id,
      external_reference: p.external_reference,
      transaction_amount: p.transaction_amount,
      currency_id: p.currency_id,
      date_created: p.date_created,
      date_approved: p.date_approved,
      description: p.description,
      payer_email: p.payer?.email,
      payer_name: (p.payer?.first_name || "") + " " + (p.payer?.last_name || ""),
    }));

    return c.json({
      payments: payments,
      total: result.json?.paging?.total || 0,
      limit: result.json?.paging?.limit || 30,
      offset: result.json?.paging?.offset || 0,
    });
  } catch (e: any) {
    console.log("[MercadoPago] Search payments error:", e);
    return c.json({ error: "Erro ao buscar pagamentos." }, 500);
  }
});

// POST /mercadopago/webhook — IPN webhook (public, HMAC signature verified)
app.post(BASE + "/mercadopago/webhook", async (c) => {
  try {
    const body = await c.req.json();
    // Input validation for MP webhook payload
    if (!body || typeof body !== "object") return c.json({ received: true, warning: "invalid body" });
    if (JSON.stringify(body).length > 50000) return c.json({ received: true, warning: "payload too large" });
    console.log("[MercadoPago] Webhook received:", JSON.stringify(body).slice(0, 1000));

    // HMAC signature verification — REQUIRED when webhook secret is configured
    // SECURITY: Reject ALL webhooks if no secret configured (prevents unauthenticated webhook injection)
    var mpCreds = await getMPCredentials();
    var webhookSecret = mpCreds ? (mpCreds as any).webhookSecret : null;
    if (!webhookSecret) {
      console.log("[MercadoPago] Webhook REJECTED: webhookSecret not configured — cannot verify authenticity");
      return c.json({ received: false, error: "Webhook auth not configured" }, 403);
    }
    if (webhookSecret) {
      var xSignature = c.req.header("x-signature") || "";
      var xRequestId = c.req.header("x-request-id") || "";
      var dataId = body.data?.id ? String(body.data.id) : "";
      // Parse x-signature: "ts=...,v1=..."
      var tsPart = "";
      var v1Part = "";
      var sigParts = xSignature.split(",");
      for (var sp = 0; sp < sigParts.length; sp++) {
        var kv2 = sigParts[sp].trim();
        if (kv2.indexOf("ts=") === 0) tsPart = kv2.substring(3);
        if (kv2.indexOf("v1=") === 0) v1Part = kv2.substring(3);
      }
      if (tsPart && v1Part) {
        var manifest = "id:" + dataId + ";request-id:" + xRequestId + ";ts:" + tsPart + ";";
        try {
          var encoder = new TextEncoder();
          var keyData = encoder.encode(webhookSecret);
          var cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
          var sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(manifest));
          var computed = Array.from(new Uint8Array(sigBytes)).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
          if (computed !== v1Part) {
            console.log("[MercadoPago] Webhook HMAC mismatch! Expected: " + v1Part.substring(0, 10) + "... Got: " + computed.substring(0, 10) + "...");
            return c.json({ error: "Invalid signature" }, 401);
          }
          console.log("[MercadoPago] Webhook HMAC verified OK");
        } catch (hmacErr) {
          console.log("[MercadoPago] HMAC verification error (rejecting): " + hmacErr);
          return c.json({ error: "HMAC verification failed" }, 401);
        }
      } else {
        console.log("[MercadoPago] Webhook missing ts/v1 in x-signature — rejecting (secret is configured)");
        return c.json({ error: "Missing HMAC signature" }, 401);
      }
    }

    if (body.type === "payment" && body.data?.id) {
      var paymentId = body.data.id;
      const creds = await getMPCredentials();
      if (creds) {
        var payResult = await mpApiFetch("/v1/payments/" + paymentId, creds.accessToken);
        if (payResult.ok && payResult.json) {
          var p = payResult.json;
          console.log("[MercadoPago] Webhook payment " + paymentId + " status=" + p.status + " ref=" + p.external_reference);

          var payKey = "mp_payment:" + paymentId;
          await kv.set(payKey, JSON.stringify({
            id: p.id,
            status: p.status,
            statusDetail: p.status_detail,
            paymentType: p.payment_type_id,
            paymentMethod: p.payment_method_id,
            externalReference: p.external_reference,
            transactionAmount: p.transaction_amount,
            dateCreated: p.date_created,
            dateApproved: p.date_approved,
            payerEmail: p.payer?.email,
            updatedAt: Date.now(),
          }));

          // If approved, update user order
          if (p.status === "approved" && p.external_reference) {
            var orderKeys = await kv.getByPrefix("user_order:");
            for (var ok2 of orderKeys) {
              try {
                if (!ok2) continue;
                var orderData = JSON.parse(ok2);
                if (orderData.orderId === p.external_reference || orderData.localOrderId === p.external_reference) {
                  orderData.status = "paid";
                  orderData.paidAt = new Date().toISOString();
                  orderData.mpPaymentId = paymentId;
                  orderData.emailSent = true;
                  var matchedOrderId = orderData.orderId || orderData.localOrderId;
                  var orderKvKey = "user_order:" + (orderData.userId || orderData.createdBy) + ":" + matchedOrderId;
                  await kv.set(orderKvKey, JSON.stringify(orderData));
                  console.log("[MercadoPago] Order " + matchedOrderId + " marked as paid via webhook");
                  // Send payment approved email (fire-and-forget)
                  _sendPaymentApprovedEmail(orderData).catch(function(mpEmailErr) {
                    console.log("[MercadoPago] Payment email error (non-fatal): " + mpEmailErr);
                  });
                  // Confirm SIGE order to trigger stock deduction
                  if (orderData.sigeOrderId) {
                    confirmSigeOrder(String(orderData.sigeOrderId)).catch(function(ce: any) {
                      console.log("[MercadoPago] SIGE confirm error (non-fatal): " + (ce.message || ce));
                    });
                  }
                  break;
                }
              } catch {}
            }
          }
        }
      }
    }

    return c.json({ received: true });
  } catch (e: any) {
    console.log("[MercadoPago] Webhook error:", e);
    return c.json({ received: true });
  }
});

// GET /mercadopago/transactions — list local MP transactions (admin)
app.get(BASE + "/mercadopago/transactions", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Não autorizado" }, 401);

    var txRaws = await kv.getByPrefix("mp_tx:");
    var payRaws = await kv.getByPrefix("mp_payment:");

    var txList: any[] = [];
    for (var raw of txRaws) {
      try { if (raw) txList.push(JSON.parse(raw)); } catch {}
    }
    for (var rawP of payRaws) {
      try { if (rawP) txList.push(JSON.parse(rawP)); } catch {}
    }

    txList.sort((a: any, b: any) => {
      var da = a.createdAt || new Date(a.dateCreated || 0).getTime();
      var db = b.createdAt || new Date(b.dateCreated || 0).getTime();
      return db - da;
    });

    return c.json({ transactions: txList });
  } catch (e: any) {
    console.log("[MercadoPago] List transactions error:", e);
    return c.json({ error: "Erro ao listar transacoes." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── ADMIN AUDIT LOG ─────────────────
// ═══════════════════════════════════════

// POST /admin/audit-log — save a log entry
app.post(BASE + "/admin/audit-log", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Unauthorized: admin audit-log save" }, 401);
    }
    var body = await c.req.json();
    // Input validation for audit-log
    var auditValid = validate(body, {
      action: { type: "string", maxLen: 200 },
      email: { type: "string", maxLen: 254 },
      userName: { type: "string", maxLen: 200 },
      details: { type: "string", maxLen: 5000 },
      userAgent: { type: "string", maxLen: 500 },
    });
    if (!auditValid.ok) return c.json({ error: auditValid.errors[0] || "Dados invalidos." }, 400);
    var ts = Date.now();
    var logId = "audit_" + ts + "_" + crypto.randomUUID().slice(0, 8);
    var entry = {
      id: logId,
      action: sanitizeInput(String(body.action || "unknown")).substring(0, 200),
      email: sanitizeInput(String(body.email || "")).substring(0, 254),
      userName: sanitizeInput(String(body.userName || "")).substring(0, 200),
      details: sanitizeInput(String(body.details || "")).substring(0, 5000),
      userAgent: sanitizeInput(String(body.userAgent || "")).substring(0, 500),
      timestamp: ts,
      createdAt: new Date(ts).toISOString()
    };
    await kv.set("admin_audit:" + logId, entry);
    console.log("[AuditLog] Saved:", entry.action, entry.email);
    return c.json({ ok: true, entry: entry });
  } catch (e: any) {
    console.log("[AuditLog] Save error:", e);
    return c.json({ error: "Erro ao salvar log." }, 500);
  }
});

// GET /admin/audit-logs — list all audit logs
app.get(BASE + "/admin/audit-logs", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Unauthorized: admin audit-logs list" }, 401);
    }
    var raws = await kv.getByPrefix("admin_audit:");
    var logs: any[] = [];
    if (Array.isArray(raws)) {
      for (var r of raws) {
        if (r) logs.push(r);
      }
    }
    // Sort newest first
    logs.sort(function(a: any, b: any) {
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    return c.json({ logs: logs, total: logs.length });
  } catch (e: any) {
    console.log("[AuditLog] List error:", e);
    return c.json({ error: "Erro ao listar logs." }, 500);
  }
});

// DELETE /admin/audit-log/:id — delete a specific log
app.delete(BASE + "/admin/audit-log/:id", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Unauthorized: admin audit-log delete" }, 401);
    }
    var logId = (c.req.param("id") || "").substring(0, 100);
    if (!logId) return c.json({ error: "ID invalido." }, 400);
    await kv.del("admin_audit:" + logId);
    console.log("[AuditLog] Deleted:", logId);
    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("[AuditLog] Delete error:", e);
    return c.json({ error: "Erro ao deletar log." }, 500);
  }
});

// POST /admin/audit-logs/clear — clear all audit logs
app.post(BASE + "/admin/audit-logs/clear", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Unauthorized: admin audit-logs clear" }, 401);
    }
    var raws = await kv.getByPrefix("admin_audit:");
    var keys: string[] = [];
    if (Array.isArray(raws)) {
      for (var r of raws) {
        if (r && r.id) {
          keys.push("admin_audit:" + r.id);
        }
      }
    }
    if (keys.length > 0) {
      await kv.mdel(keys);
    }
    console.log("[AuditLog] Cleared all:", keys.length, "entries");
    return c.json({ cleared: true, count: keys.length });
  } catch (e: any) {
    console.log("[AuditLog] Clear error:", e);
    return c.json({ error: "Erro ao limpar logs." }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── SUPER PROMO ─────────────────────────────────────
// ═══════════════════════════════════════════════════════

// GET /promo/active — public, returns current active promo (if enabled + within date range)
app.get(BASE + "/promo/active", async (c) => {
  try {
    const raw = await kv.get("super_promo");
    if (!raw) return c.json({ promo: null });
    const promo = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!promo || !promo.enabled) return c.json({ promo: null });
    const now = Date.now();
    if (now < promo.startDate || now > promo.endDate) return c.json({ promo: null });
    if (!promo.products || promo.products.length === 0) return c.json({ promo: null });
    return c.json({ promo });
  } catch (e: any) {
    console.log("[SuperPromo] GET active error:", e);
    return c.json({ promo: null });
  }
});

// GET /admin/promo — admin, returns full promo config
app.get(BASE + "/admin/promo", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const raw = await kv.get("super_promo");
    if (!raw) return c.json({ promo: null });
    const promo = typeof raw === "string" ? JSON.parse(raw) : raw;
    return c.json({ promo });
  } catch (e: any) {
    console.log("[SuperPromo] GET admin error:", e);
    return c.json({ error: "Erro ao carregar promo." }, 500);
  }
});

// POST /admin/promo — admin, save promo config
app.post(BASE + "/admin/promo", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    // Input validation for super promo
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    var promoValid = validate(body, {
      title: { type: "string", maxLen: 200 },
      subtitle: { type: "string", maxLen: 500 },
      enabled: { type: "boolean" },
      startDate: { type: "number" },
      endDate: { type: "number" },
      discountType: { type: "string", maxLen: 30, oneOf: ["percentage", "fixed"] },
      discountValue: { type: "number", min: 0, max: 100 },
      bgColor: { type: "string", maxLen: 20 },
    });
    if (!promoValid.ok) return c.json({ error: promoValid.errors[0] || "Dados invalidos." }, 400);
    var existing: any = null;
    const raw = await kv.get("super_promo");
    if (raw) existing = typeof raw === "string" ? JSON.parse(raw) : raw;
    const promo: any = {
      id: (existing && existing.id) || ("promo_" + Date.now()),
      title: body.title || (existing && existing.title) || "Super Promoção",
      subtitle: body.subtitle !== undefined ? body.subtitle : ((existing && existing.subtitle) || ""),
      enabled: body.enabled === true,
      startDate: typeof body.startDate === "number" ? body.startDate : ((existing && existing.startDate) || Date.now()),
      endDate: typeof body.endDate === "number" ? body.endDate : ((existing && existing.endDate) || (Date.now() + 7 * 24 * 3600000)),
      discountType: body.discountType || (existing && existing.discountType) || "percentage",
      discountValue: typeof body.discountValue === "number" ? body.discountValue : ((existing && existing.discountValue) || 10),
      bgColor: body.bgColor || (existing && existing.bgColor) || "#dc2626",
      products: Array.isArray(body.products) ? body.products : ((existing && existing.products) || []),
      createdAt: (existing && existing.createdAt) || Date.now(),
      updatedAt: Date.now(),
      updatedBy: userId,
    };
    await kv.set("super_promo", JSON.stringify(promo));
    invalidateHomepageCache();
    console.log("[SuperPromo] Saved by " + userId + ": " + promo.title + ", enabled=" + promo.enabled + ", products=" + promo.products.length);
    return c.json({ promo });
  } catch (e: any) {
    console.log("[SuperPromo] POST error:", e);
    return c.json({ error: "Erro ao salvar promo." }, 500);
  }
});

// DELETE /admin/promo — admin, delete promo
app.delete(BASE + "/admin/promo", async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    await kv.del("super_promo");
    console.log("[SuperPromo] Deleted by " + userId);
    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("[SuperPromo] DELETE error:", e);
    return c.json({ error: "Erro ao deletar promo." }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── HOMEPAGE CATEGORY SHOWCASE (public cards on homepage)
// ═══════════════════════════════════════════════════════

// GET /homepage-categories — public, returns active cards sorted by order
app.get(BASE + "/homepage-categories", async (c) => {
  try {
    var allRaw = await kv.getByPrefix("hpcat:");
    var cards: any[] = [];
    for (var raw of allRaw) {
      try {
        var card = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (card && card.id && card.active !== false) cards.push(card);
      } catch { /* skip */ }
    }
    cards.sort(function(a: any, b: any) { return (a.order || 0) - (b.order || 0); });

    // Generate signed URLs for images in parallel
    var signPromises = cards.map(function(card: any) {
      if (!card.filename) return Promise.resolve(null);
      return supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .createSignedUrl(card.filename, 86400)
        .then(function(res: any) {
          if (res.data && res.data.signedUrl) {
            card.imageUrl = res.data.signedUrl;
          }
          return null;
        })
        .catch(function() { return null; });
    });
    await Promise.allSettled(signPromises);

    return c.json({ categories: cards });
  } catch (e: any) {
    console.log("[homepage-categories] Error:", e);
    return c.json({ error: "Erro ao buscar categorias da homepage." }, 500);
  }
});

// POST /admin/homepage-categories — create a new homepage category card (upload image + metadata)
app.post(BASE + "/admin/homepage-categories", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var formData = await c.req.formData();
    var file = formData.get("file") as File | null;
    var name = sanitizeInput(String(formData.get("name") || "")).substring(0, 200);
    var categorySlug = sanitizeInput(String(formData.get("categorySlug") || "")).substring(0, 200);
    var categoryName = sanitizeInput(String(formData.get("categoryName") || "")).substring(0, 200);
    var orderStr = String(formData.get("order") || "0");
    var activeStr = String(formData.get("active") || "true");

    if (!file) return c.json({ error: "Nenhum arquivo de imagem enviado." }, 400);
    if (!categorySlug) return c.json({ error: "Selecione uma categoria." }, 400);

    var validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/gif"];
    if (validTypes.indexOf(file.type) === -1) {
      return c.json({ error: "Tipo não permitido: " + file.type + ". Use AVIF, PNG, JPEG, WebP ou GIF." }, 400);
    }
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: "Arquivo muito grande. Máximo: 5MB." }, 400);
    }

    var cardId = crypto.randomUUID();
    var extMap: Record<string, string> = {
      "image/avif": "avif", "image/png": "png", "image/jpeg": "jpg",
      "image/webp": "webp", "image/gif": "gif",
    };
    var ext = extMap[file.type] || "jpg";
    var filename = "hpcat-" + cardId + "." + ext;
    var arrayBuffer = await file.arrayBuffer();

    var uploadResult = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .upload(filename, arrayBuffer, { contentType: file.type, upsert: true });

    if (uploadResult.error) {
      console.log("Homepage category upload error:", uploadResult.error.message);
      return c.json({ error: "Erro no upload da imagem." }, 500);
    }

    var supabaseUrl = Deno.env.get("SUPABASE_URL");
    var imageUrl = supabaseUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + filename;

    var card = {
      id: cardId,
      name: name || categoryName,
      categorySlug: categorySlug,
      categoryName: categoryName,
      imageUrl: imageUrl,
      filename: filename,
      order: parseInt(orderStr, 10) || 0,
      active: activeStr !== "false",
      contentType: file.type,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uploadedBy: userId,
    };

    await kv.set("hpcat:" + cardId, JSON.stringify(card));
    console.log("Homepage category created: " + cardId + " slug=" + categorySlug);

    return c.json({ created: true, card: card });
  } catch (e: any) {
    console.log("Error creating homepage category:", e);
    return c.json({ error: "Erro ao criar categoria da homepage." }, 500);
  }
});

// PUT /admin/homepage-categories/:id — update a card (optionally replace image)
app.put(BASE + "/admin/homepage-categories/:id", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var cardId = (c.req.param("id") || "").substring(0, 100);
    if (!cardId) return c.json({ error: "ID invalido." }, 400);
    var existing = await kv.get("hpcat:" + cardId);
    if (!existing) return c.json({ error: "Card não encontrado." }, 404);

    var card = typeof existing === "string" ? JSON.parse(existing) : existing;
    var ct = c.req.header("Content-Type") || "";

    if (ct.includes("multipart/form-data")) {
      var formData = await c.req.formData();
      var file = formData.get("file") as File | null;
      var nameVal = formData.get("name");
      var slugVal = formData.get("categorySlug");
      var catNameVal = formData.get("categoryName");
      var orderVal = formData.get("order");
      var activeVal = formData.get("active");

      if (nameVal !== null) card.name = sanitizeInput(String(nameVal)).substring(0, 200);
      if (slugVal !== null) card.categorySlug = sanitizeInput(String(slugVal)).substring(0, 200);
      if (catNameVal !== null) card.categoryName = sanitizeInput(String(catNameVal)).substring(0, 200);
      if (orderVal !== null) card.order = Math.min(Math.max(parseInt(String(orderVal), 10) || 0, 0), 9999);
      if (activeVal !== null) card.active = String(activeVal) !== "false";

      if (file) {
        var fValidTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/gif"];
        if (fValidTypes.indexOf(file.type) === -1) {
          return c.json({ error: "Tipo não permitido: " + file.type }, 400);
        }
        if (file.size > 5 * 1024 * 1024) {
          return c.json({ error: "Arquivo muito grande. Máximo: 5MB." }, 400);
        }

        // Delete old file
        if (card.filename) {
          try { await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([card.filename]); } catch {}
        }

        var fExtMap: Record<string, string> = {
          "image/avif": "avif", "image/png": "png", "image/jpeg": "jpg",
          "image/webp": "webp", "image/gif": "gif",
        };
        var fExt = fExtMap[file.type] || "jpg";
        var newFilename = "hpcat-" + cardId + "." + fExt;
        var fArrayBuffer = await file.arrayBuffer();

        var fUploadResult = await supabaseAdmin.storage
          .from(ASSETS_BUCKET)
          .upload(newFilename, fArrayBuffer, { contentType: file.type, upsert: true });

        if (fUploadResult.error) {
          console.log("Homepage card upload error:", fUploadResult.error.message);
          return c.json({ error: "Erro no upload do arquivo." }, 500);
        }

        var fSupabaseUrl = Deno.env.get("SUPABASE_URL");
        card.imageUrl = fSupabaseUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + newFilename;
        card.filename = newFilename;
        card.contentType = file.type;
        card.fileSize = file.size;
      }
    } else {
      var body = await c.req.json();
      // Input validation for homepage category card update
      var hcValid = validate(body, {
        name: { type: "string", maxLen: 200 },
        categorySlug: { type: "string", maxLen: 200 },
        categoryName: { type: "string", maxLen: 200 },
        order: { type: "number", min: 0, max: 9999 },
        active: { type: "boolean" },
      });
      if (!hcValid.ok) return c.json({ error: hcValid.errors[0] || "Dados invalidos." }, 400);
      if (body.name !== undefined) card.name = body.name;
      if (body.categorySlug !== undefined) card.categorySlug = body.categorySlug;
      if (body.categoryName !== undefined) card.categoryName = body.categoryName;
      if (body.order !== undefined) card.order = parseInt(String(body.order), 10) || 0;
      if (body.active !== undefined) card.active = body.active !== false;
    }

    card.updatedAt = new Date().toISOString();
    await kv.set("hpcat:" + cardId, JSON.stringify(card));
    console.log("Homepage category updated: " + cardId);

    return c.json({ updated: true, card: card });
  } catch (e: any) {
    console.log("Error updating homepage category:", e);
    return c.json({ error: "Erro ao atualizar categoria da homepage." }, 500);
  }
});

// DELETE /admin/homepage-categories/:id — delete card + remove image from storage
app.delete(BASE + "/admin/homepage-categories/:id", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var cardId = (c.req.param("id") || "").substring(0, 100);
    if (!cardId) return c.json({ error: "ID invalido." }, 400);
    var existing = await kv.get("hpcat:" + cardId);
    if (!existing) return c.json({ error: "Card não encontrado." }, 404);

    var card = typeof existing === "string" ? JSON.parse(existing) : existing;

    // Remove image from storage
    if (card.filename) {
      try { await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([card.filename]); } catch {}
    }

    await kv.del("hpcat:" + cardId);
    console.log("Homepage category deleted: " + cardId);

    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("Error deleting homepage category:", e);
    return c.json({ error: "Erro ao deletar categoria da homepage." }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── MID-PAGE BANNERS (2 side-by-side banner slots between categories & products)
// ═══════════════════════════════════════════════════════

// GET /admin/mid-banners — list both mid-page banner slots
app.get(BASE + "/admin/mid-banners", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    var results: any[] = [];
    var getSupaUrl = Deno.env.get("SUPABASE_URL");
    for (var si = 1; si <= 4; si++) {
      var raw = await kv.get("mid_banner:" + si);
      if (raw) {
        var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        parsed.slot = si;
        // Ensure public URL exists (bucket is public — no signed URL needed)
        if (parsed.filename && !parsed.imageUrl) {
          parsed.imageUrl = getSupaUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + parsed.filename;
        }
        results.push(parsed);
      } else {
        results.push({ slot: si, active: false, imageUrl: null, filename: null, link: "" });
      }
    }
    return c.json({ banners: results });
  } catch (e: any) {
    console.log("[admin/mid-banners GET] Error:", e);
    return c.json({ error: "Erro ao buscar mid-banners." }, 500);
  }
});

// PUT /admin/mid-banners/:slot — upload/update a mid-page banner (slot 1-4)
app.put(BASE + "/admin/mid-banners/:slot", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    var slot = parseInt(c.req.param("slot"), 10);
    if (slot < 1 || slot > 4) return c.json({ error: "Slot inválido (1 a 4)" }, 400);

    var formData = await c.req.formData();
    var link = sanitizeInput(String(formData.get("link") || "")).substring(0, 500);
    var active = formData.get("active") !== "false";
    var imageFile = formData.get("image") as File | null;

    var kvKey = "mid_banner:" + slot;
    var existing = await kv.get(kvKey);
    var current: any = existing ? (typeof existing === "string" ? JSON.parse(existing) : existing) : {};

    // If new image uploaded, store in bucket
    if (imageFile && imageFile.size > 0) {
      var ext = imageFile.name.split(".").pop() || "jpg";
      var storagePath = "mid-banners/slot-" + slot + "-" + Date.now() + "." + ext;
      var arrayBuf = await imageFile.arrayBuffer();
      var uploadRes = await supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .upload(storagePath, arrayBuf, {
          contentType: imageFile.type || "image/jpeg",
          upsert: true,
        });
      if (uploadRes.error) {
        console.log("SEO image upload error:", uploadRes.error.message);
        return c.json({ error: "Erro no upload da imagem." }, 500);
      }
      // Remove old file if different
      if (current.filename && current.filename !== storagePath) {
        await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([current.filename]);
      }
      current.filename = storagePath;
      // Store public URL in KV (bucket is public — same pattern as banners/categories)
      var mbSupabaseUrl = Deno.env.get("SUPABASE_URL");
      current.imageUrl = mbSupabaseUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + storagePath;
    }

    current.link = link;
    current.active = active;
    current.slot = slot;
    current.updatedAt = Date.now();

    await kv.set(kvKey, current);

    console.log("[admin/mid-banners PUT] Saved slot=" + slot + " filename=" + String(current.filename) + " imageUrl=" + String(current.imageUrl) + " active=" + String(current.active));

    return c.json({ banner: current });
  } catch (e: any) {
    console.log("[admin/mid-banners PUT] Error:", e);
    return c.json({ error: "Erro ao salvar mid-banner." }, 500);
  }
});

// DELETE /admin/mid-banners/:slot — remove a mid-page banner
app.delete(BASE + "/admin/mid-banners/:slot", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    var slot = parseInt(c.req.param("slot"), 10);
    if (slot < 1 || slot > 4) return c.json({ error: "Slot inválido (1 a 4)" }, 400);

    var kvKey = "mid_banner:" + slot;
    var existing = await kv.get(kvKey);
    if (existing) {
      var parsed = typeof existing === "string" ? JSON.parse(existing) : existing;
      if (parsed.filename) {
        await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([parsed.filename]);
      }
    }
    await kv.del(kvKey);

    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("[admin/mid-banners DELETE] Error:", e);
    return c.json({ error: "Erro ao deletar mid-banner." }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── FOOTER BADGES (Payment, Shipping, Reclame Aqui logos)
// ═══════════════════════════════════════════════════════

// GET /admin/footer-badges — list all footer badge entries
app.get(BASE + "/admin/footer-badges", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    var allRaw = await kv.getByPrefix("fbadge:");
    var items: any[] = [];
    var supaUrl = Deno.env.get("SUPABASE_URL");
    for (var ri = 0; ri < allRaw.length; ri++) {
      try {
        var parsed = typeof allRaw[ri] === "string" ? JSON.parse(allRaw[ri]) : allRaw[ri];
        if (parsed && parsed.key) {
          if (parsed.filename && !parsed.imageUrl) {
            parsed.imageUrl = supaUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + parsed.filename;
          }
          items.push(parsed);
        }
      } catch { /* skip */ }
    }
    return c.json({ badges: items });
  } catch (e: any) {
    console.log("[admin/footer-badges GET] Error:", e);
    return c.json({ error: "Erro ao buscar footer badges." }, 500);
  }
});

// PUT /admin/footer-badges/:key — upload/update a footer badge
// key examples: pay1, pay2, ..., pay6, ship1, ship2, ship3, ra
app.put(BASE + "/admin/footer-badges/:key", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    var badgeKey = c.req.param("key");
    var validKeys = ["pay1","pay2","pay3","pay4","pay5","pay6","ship1","ship2","ship3","ra"];
    if (validKeys.indexOf(badgeKey) === -1) return c.json({ error: "Chave invalida: " + badgeKey }, 400);

    var formData = await c.req.formData();
    var link = sanitizeInput(String(formData.get("link") || "")).substring(0, 500);
    var alt = sanitizeInput(String(formData.get("alt") || "")).substring(0, 200);
    var active = formData.get("active") !== "false";
    var imageFile = formData.get("image") as File | null;

    var kvKey = "fbadge:" + badgeKey;
    var existing = await kv.get(kvKey);
    var current: any = existing ? (typeof existing === "string" ? JSON.parse(existing) : existing) : {};

    if (imageFile && imageFile.size > 0) {
      var ext = imageFile.name.split(".").pop() || "png";
      var storagePath = "footer-badges/" + badgeKey + "-" + Date.now() + "." + ext;
      if (current.filename) {
        await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([current.filename]);
      }
      var arrayBuf = await imageFile.arrayBuffer();
      var uploadRes = await supabaseAdmin.storage.from(ASSETS_BUCKET).upload(storagePath, arrayBuf, {
        contentType: imageFile.type || "image/png",
        upsert: true,
      });
      if (uploadRes.error) {
        console.log("[admin/footer-badges PUT] Upload error:", uploadRes.error);
        return c.json({ error: "Erro no upload do badge." }, 500);
      }
      current.filename = storagePath;
      var supaUrl = Deno.env.get("SUPABASE_URL");
      current.imageUrl = supaUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + storagePath;
    }

    var category = "payment";
    if (badgeKey.indexOf("ship") === 0) category = "shipping";
    if (badgeKey === "ra") category = "reclameaqui";

    current.key = badgeKey;
    current.category = category;
    current.link = link;
    current.alt = alt;
    current.active = active;
    current.updatedAt = Date.now();

    await kv.set(kvKey, JSON.stringify(current));
    console.log("[admin/footer-badges PUT] Saved key=" + badgeKey + " category=" + category);
    return c.json({ badge: current });
  } catch (e: any) {
    console.log("[admin/footer-badges PUT] Error:", e);
    return c.json({ error: "Erro ao salvar footer badge." }, 500);
  }
});

// DELETE /admin/footer-badges/:key — remove a footer badge
app.delete(BASE + "/admin/footer-badges/:key", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    var badgeKey = (c.req.param("key") || "").substring(0, 50);
    if (!badgeKey) return c.json({ error: "Key invalida." }, 400);
    var kvKey = "fbadge:" + badgeKey;
    var existing = await kv.get(kvKey);
    if (existing) {
      var parsed = typeof existing === "string" ? JSON.parse(existing) : existing;
      if (parsed.filename) {
        await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([parsed.filename]);
      }
    }
    await kv.del(kvKey);
    console.log("[admin/footer-badges DELETE] Deleted key=" + badgeKey);
    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("[admin/footer-badges DELETE] Error:", e);
    return c.json({ error: "Erro ao deletar footer badge." }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── HOMEPAGE-INIT (Combined endpoint — reduces 7+ API calls to 1)
// ─── Response-level cache: full JSON cached for 60s to cut CPU
// ═══════════════════════════════════════════════════════

var _homepageInitCache: { json: any; ts: number } | null = null;
var HOMEPAGE_INIT_CACHE_TTL = 60 * 1000; // 60 seconds

function invalidateHomepageCache() {
  _homepageInitCache = null;
}

app.get(BASE + "/homepage-init", async (c) => {
  try {
    // Return cached response if still fresh
    var _now = Date.now();
    if (_homepageInitCache && _now - _homepageInitCache.ts < HOMEPAGE_INIT_CACHE_TTL) {
      return c.json(_homepageInitCache.json);
    }

    // Fetch all KV data and banners in parallel
    // IMPORTANT: kv.mget does NOT guarantee order (Postgres .in() has no order guarantee),
    // so we query the table directly with key+value and build a map.
    var kvKeysToFetch = [
      "site_logo",
      "site_footer_logo",
      "ga4_config",
      "category_tree",
      "super_promo",
      "price_config"
    ];

    var kvPromise = supabaseAdmin
      .from("kv_store_b7b07654")
      .select("key, value")
      .in("key", kvKeysToFetch);
    var bannersPromise = kv.getByPrefix("banner:");
    var hpcatPromise = kv.getByPrefix("hpcat:");
    var midB1Promise = kv.get("mid_banner:1");
    var midB2Promise = kv.get("mid_banner:2");
    var midB3Promise = kv.get("mid_banner:3");
    var midB4Promise = kv.get("mid_banner:4");
    var fbadgePromise = kv.getByPrefix("fbadge:");
    var brandsPromise = kv.getByPrefix("brand:");
    var metasPromise = getAllProductMetas();

    var settled = await Promise.allSettled([kvPromise, bannersPromise, hpcatPromise, midB1Promise, midB2Promise, midB3Promise, midB4Promise, fbadgePromise, brandsPromise, metasPromise]);

    // Build a key->value map from the KV results
    var kvMap: Record<string, any> = {};
    if (settled[0].status === "fulfilled") {
      var kvData = settled[0].value;
      var kvRows = (kvData && kvData.data) ? kvData.data : [];
      for (var ki = 0; ki < kvRows.length; ki++) {
        var row = kvRows[ki];
        if (row && row.key) {
          kvMap[row.key] = row.value;
        }
      }
    }
    var bannerRaws = settled[1].status === "fulfilled" ? settled[1].value : [];
    var hpcatRaws = settled[2].status === "fulfilled" ? settled[2].value : [];
    var midB1Raw = settled[3].status === "fulfilled" ? settled[3].value : null;
    var midB2Raw = settled[4].status === "fulfilled" ? settled[4].value : null;
    var midB3Raw = settled[5].status === "fulfilled" ? settled[5].value : null;
    var midB4Raw = settled[6].status === "fulfilled" ? settled[6].value : null;
    var fbadgeRaws = settled[7].status === "fulfilled" ? settled[7].value : [];
    var brandRaws = settled[8].status === "fulfilled" ? settled[8].value : [];
    var allMetasMap = settled[9].status === "fulfilled" ? settled[9].value : new Map();

    // Access KV results by key (order-safe)
    var logoMeta = kvMap["site_logo"] || null;
    var footerLogoMeta = kvMap["site_footer_logo"] || null;
    var ga4Raw = kvMap["ga4_config"] || null;
    var categoryTreeRaw = kvMap["category_tree"] || null;
    var superPromoRaw = kvMap["super_promo"] || null;
    var priceConfigRaw = kvMap["price_config"] || null;

    // ── Logo signed URL ──
    var logoResult = { hasLogo: false, url: null as string | null };
    if (logoMeta && logoMeta.filename) {
      logoResult.hasLogo = true;
      logoResult.url = logoMeta.url || null;
      try {
        // Logo: resize to 400px wide (displayed at max 354px)
        var logoSigned = await supabaseAdmin.storage
          .from(ASSETS_BUCKET)
          .createSignedUrl(logoMeta.filename, 86400, {
            transform: { width: 400, quality: 80, resize: "contain" }
          });
        if (logoSigned.data && logoSigned.data.signedUrl) {
          logoResult.url = logoSigned.data.signedUrl;
        } else {
          // Fallback: full-size
          var logoFb = await supabaseAdmin.storage.from(ASSETS_BUCKET).createSignedUrl(logoMeta.filename, 86400);
          if (logoFb.data && logoFb.data.signedUrl) logoResult.url = logoFb.data.signedUrl;
        }
      } catch (_e) {
        // Transform not available — try full-size
        try {
          var logoFb2 = await supabaseAdmin.storage.from(ASSETS_BUCKET).createSignedUrl(logoMeta.filename, 86400);
          if (logoFb2.data && logoFb2.data.signedUrl) logoResult.url = logoFb2.data.signedUrl;
        } catch (_e2) { /* keep stored url */ }
      }
    }

    // ── Footer Logo signed URL ──
    var footerLogoResult = { hasLogo: false, url: null as string | null };
    if (footerLogoMeta && footerLogoMeta.filename) {
      footerLogoResult.hasLogo = true;
      footerLogoResult.url = footerLogoMeta.url || null;
      try {
        var flSigned = await supabaseAdmin.storage
          .from(ASSETS_BUCKET)
          .createSignedUrl(footerLogoMeta.filename, 86400);
        if (flSigned.data && flSigned.data.signedUrl) {
          footerLogoResult.url = flSigned.data.signedUrl;
        }
      } catch (_e) { /* keep stored url */ }
    }

    // ── GA4 Config ──
    var ga4Config = ga4Raw ? (typeof ga4Raw === "string" ? JSON.parse(ga4Raw) : ga4Raw) : {
      measurementId: "",
      enabled: false,
      trackPageViews: false,
      trackAddToCart: false,
      trackCheckout: false,
      trackPurchase: false,
      trackSearch: false,
      trackViewItem: false,
    };

    // ── Category Tree ──
    var categoryTree = categoryTreeRaw
      ? (typeof categoryTreeRaw === "string" ? JSON.parse(categoryTreeRaw) : categoryTreeRaw)
      : [];

    // ── Category Counts (products per category, including descendants) ──
    var directCounts: Record<string, number> = {};
    allMetasMap.forEach(function(meta: any) {
      if (meta && meta.category) {
        var cat = meta.category;
        directCounts[cat] = (directCounts[cat] || 0) + 1;
      }
    });

    // Optimized bottom-up category count: single pass, no array allocation.
    // Each node count = direct products + sum of children counts.
    function buildCategoryCountsOpt(nodes: any[], counts: Record<string, number>): void {
      for (var ni = 0; ni < nodes.length; ni++) {
        var node = nodes[ni];
        var childTotal = 0;
        if (node.children && node.children.length > 0) {
          buildCategoryCountsOpt(node.children, counts);
          for (var ci = 0; ci < node.children.length; ci++) {
            childTotal += counts[node.children[ci].slug] || 0;
          }
        }
        counts[node.slug] = (directCounts[node.slug] || 0) + childTotal;
      }
    }

    var categoryCounts: Record<string, number> = {};
    buildCategoryCountsOpt(categoryTree, categoryCounts);

    // ── Price Config ──
    var priceConfig = priceConfigRaw
      ? (typeof priceConfigRaw === "string" ? JSON.parse(priceConfigRaw) : priceConfigRaw)
      : { tier: "v2", showPrice: true };

    // ── Super Promo ──
    var promoResult = null;
    if (superPromoRaw) {
      var promo = typeof superPromoRaw === "string" ? JSON.parse(superPromoRaw) : superPromoRaw;
      if (promo && promo.enabled) {
        var now = Date.now();
        if (now >= promo.startDate && now <= promo.endDate && promo.products && promo.products.length > 0) {
          promoResult = promo;
        }
      }
    }

    // ── Banners (active, sorted, with signed URLs) ──
    var bannersList: any[] = [];
    for (var rawBanner of bannerRaws) {
      try {
        var b = typeof rawBanner === "string" ? JSON.parse(rawBanner) : rawBanner;
        if (b && b.active) bannersList.push(b);
      } catch { /* skip invalid */ }
    }
    bannersList.sort(function(a: any, b: any) { return (a.order || 0) - (b.order || 0); });

    // ── Homepage Category Showcase ──
    var hpcatCards: any[] = [];
    for (var hpRaw of hpcatRaws) {
      try {
        var hpCard = typeof hpRaw === "string" ? JSON.parse(hpRaw) : hpRaw;
        if (hpCard && hpCard.id && hpCard.active !== false) hpcatCards.push(hpCard);
      } catch { /* skip */ }
    }
    hpcatCards.sort(function(a: any, b: any) { return (a.order || 0) - (b.order || 0); });

    // ── Mid-Page Banners (4 banner slots: 3&4 after promo, 1&2 after products) ──
    var midBanners: any[] = [];
    var midRawArr = [midB1Raw, midB2Raw, midB3Raw, midB4Raw];
    for (var mbi = 0; mbi < 4; mbi++) {
      var mbRaw = midRawArr[mbi];
      if (mbRaw) {
        try {
          var mbData = typeof mbRaw === "string" ? JSON.parse(mbRaw) : mbRaw;
          if (mbData && mbData.active !== false) {
            mbData.slot = mbi + 1;
            midBanners.push(mbData);
            console.log("[homepage-init] midBanner slot=" + (mbi + 1) + " filename=" + String(mbData.filename) + " active=" + String(mbData.active));
          }
        } catch (mbErr) {
          console.log("[homepage-init] midBanner parse error slot=" + (mbi + 1) + ": " + String(mbErr));
        }
      }
    }

    console.log("[homepage-init] banners=" + bannersList.length + " hpcatRaws=" + hpcatRaws.length + " hpcatCards=" + hpcatCards.length + " midBanners=" + midBanners.length);

    // Generate signed URLs for banners, homepage categories AND mid-page banners in parallel
    var allSignedPromises = bannersList.map(function(banner: any) {
      if (!banner.filename) return Promise.resolve(null);
      // ── Banner image: serve FULL-SIZE (no transform).
      // Images are 1920x647 and must display WITHOUT any cropping or resizing.
      return supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .createSignedUrl(banner.filename, 86400)
        .then(function(res: any) {
          if (res.data && res.data.signedUrl) {
            banner.imageUrl = res.data.signedUrl;
          }
          return null;
        })
        .catch(function() { return null; });
    }).concat(hpcatCards.map(function(hpC: any) {
      if (!hpC.filename) return Promise.resolve(null);
      // ── Image transform: resize category thumbnails to 100px (displayed at 36-63px).
      // Saves ~800 KiB total (original 1080x1080 → 100x100).
      // Falls back to full-size if transform not available on this plan.
      return supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .createSignedUrl(hpC.filename, 86400, {
          transform: { width: 100, height: 100, quality: 75, resize: "cover" }
        })
        .then(function(res: any) {
          if (res.data && res.data.signedUrl) {
            hpC.imageUrl = res.data.signedUrl;
          } else {
            return supabaseAdmin.storage
              .from(ASSETS_BUCKET)
              .createSignedUrl(hpC.filename, 86400)
              .then(function(fbRes: any) {
                if (fbRes.data && fbRes.data.signedUrl) {
                  hpC.imageUrl = fbRes.data.signedUrl;
                }
                return null;
              });
          }
          return null;
        })
        .catch(function() {
          return supabaseAdmin.storage
            .from(ASSETS_BUCKET)
            .createSignedUrl(hpC.filename, 86400)
            .then(function(fbRes: any) {
              if (fbRes.data && fbRes.data.signedUrl) {
                hpC.imageUrl = fbRes.data.signedUrl;
              }
              return null;
            })
            .catch(function() { return null; });
        });
    }));

    // Mid-banners: use public URLs (bucket is public) — no signed URL needed.
    // If imageUrl was already stored in KV, keep it; otherwise build from filename.
    var midSupaUrl = Deno.env.get("SUPABASE_URL");
    for (var mbj = 0; mbj < midBanners.length; mbj++) {
      var mItem = midBanners[mbj];
      if (!mItem.imageUrl && mItem.filename) {
        mItem.imageUrl = midSupaUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + mItem.filename;
      }
      console.log("[homepage-init] midBanner slot=" + mItem.slot + " imageUrl=" + String(mItem.imageUrl));
    }

    await Promise.allSettled(allSignedPromises);

    // ── Footer Badges (payment, shipping, reclame aqui) ──
    var footerBadges: any[] = [];
    var fbSupaUrl = Deno.env.get("SUPABASE_URL");
    for (var fbi = 0; fbi < fbadgeRaws.length; fbi++) {
      try {
        var fbItem = typeof fbadgeRaws[fbi] === "string" ? JSON.parse(fbadgeRaws[fbi]) : fbadgeRaws[fbi];
        if (fbItem && fbItem.key && fbItem.active !== false) {
          if (fbItem.filename && !fbItem.imageUrl) {
            fbItem.imageUrl = fbSupaUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + fbItem.filename;
          }
          footerBadges.push(fbItem);
        }
      } catch { /* skip */ }
    }

    // ── Brands ──
    var brandCards: any[] = [];
    for (var bri = 0; bri < brandRaws.length; bri++) {
      try {
        var brItem = typeof brandRaws[bri] === "string" ? JSON.parse(brandRaws[bri]) : brandRaws[bri];
        if (brItem && brItem.id && brItem.active !== false) brandCards.push(brItem);
      } catch { /* skip */ }
    }
    brandCards.sort(function(a: any, b: any) { return (a.order || 0) - (b.order || 0); });

    // Generate signed URLs for brand logos
    var brandSignPromises = brandCards.map(function(br: any) {
      if (!br.filename) return Promise.resolve(null);
      return supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .createSignedUrl(br.filename, 86400)
        .then(function(res: any) {
          if (res.data && res.data.signedUrl) {
            br.logoUrl = res.data.signedUrl;
          }
          return null;
        })
        .catch(function() { return null; });
    });
    await Promise.allSettled(brandSignPromises);

    var _responseObj = {
      banners: bannersList,
      logo: logoResult,
      footerLogo: footerLogoResult,
      ga4Config: ga4Config,
      categoryTree: categoryTree,
      categoryCounts: categoryCounts,
      promo: promoResult,
      priceConfig: priceConfig,
      homepageCategories: hpcatCards,
      midBanners: midBanners,
      footerBadges: footerBadges,
      brands: brandCards,
    };

    // Cache the full response for subsequent requests
    _homepageInitCache = { json: _responseObj, ts: Date.now() };

    return c.json(_responseObj);
  } catch (e: any) {
    console.log("[homepage-init] Error:", e);
    return c.json({ error: "Erro ao carregar dados iniciais." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ─── PRODUCT DETAIL INIT (Combined endpoint — reduces 6 API calls to 1)
// ═══════════════════════════════════════════════════════════════════════

app.get(BASE + "/produto-detail-init/:sku", async (c) => {
  try {
    var sku = decodeURIComponent(c.req.param("sku")).trim().substring(0, 100);
    if (!sku) return c.json({ error: "SKU obrigatório." }, 400);

    var supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    var supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    console.log("[produto-detail-init] Loading all data for SKU: " + sku);
    var startMs = Date.now();

    // Run all 7 lookups in parallel with Promise.allSettled for fault isolation
    var results = await Promise.allSettled([
      // 0. Product from Supabase DB (exact SKU match)
      (async function () {
        var apiUrl = supabaseUrl + "/rest/v1/produtos?select=sku,titulo&sku=eq." + encodeURIComponent(sku) + "&order=titulo.asc";
        var res = await fetch(apiUrl, {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: "Bearer " + supabaseKey,
            "Content-Type": "application/json",
            Range: "0-0",
            Prefer: "count=exact",
          },
        });
        if (!res.ok) throw new Error("DB HTTP " + res.status);
        var data = await res.json();
        return { data: Array.isArray(data) ? data : [] };
      })(),

      // 1. Product metadata from KV
      (async function () {
        var meta = await kv.get("produto_meta:" + sku);
        return meta || { visible: true };
      })(),

      // 2. Product images from Supabase Storage
      (async function () {
        var listResult = await supabaseAdmin.storage
          .from("produtos")
          .list(sku, { limit: 100, sortBy: { column: "name", order: "asc" } });
        var listData = listResult.data;
        var listError = listResult.error;
        if (listError || !listData || listData.length === 0) {
          return { sku: sku, images: [], total: 0 };
        }
        var imageFiles = listData
          .filter(function (f: any) { return /\.(webp|png|jpg|jpeg|gif)$/i.test(f.name); })
          .sort(function (a: any, b: any) { return extractImageNumber(a.name) - extractImageNumber(b.name); });
        var images = imageFiles.map(function (f: any) {
          return {
            name: f.name,
            url: supabaseUrl + "/storage/v1/object/public/produtos/" + encodeURIComponent(sku) + "/" + encodeURIComponent(f.name),
            number: extractImageNumber(f.name),
            isPrimary: extractImageNumber(f.name) === 1,
          };
        });
        return { sku: sku, images: images, total: images.length };
      })(),

      // 3. Product attributes from CSV cache
      (async function () {
        var map = await getAtributosMap();
        var attributes = map.get(sku) || null;
        return { sku: sku, attributes: attributes, found: !!attributes };
      })(),

      // 4. Product price (reuse existing route via app.request)
      (async function () {
        var pricePath = BASE + "/produtos/preco/" + encodeURIComponent(sku);
        var priceRes = await app.request(pricePath);
        return await priceRes.json();
      })(),

      // 5. Product balance (reuse existing route via app.request)
      (async function () {
        var balancePath = BASE + "/produtos/saldo/" + encodeURIComponent(sku);
        var balanceRes = await app.request(balancePath);
        return await balanceRes.json();
      })(),

      // 6. Review summary (for JSON-LD AggregateRating + star display)
      // INLINED to avoid Deno bundler hoisting issues with async function declarations
      (async function () {
        try {
          var idsRaw = await kv.get("review_ids:" + sku);
          if (!idsRaw) return { averageRating: 0, totalReviews: 0 };
          var ids = typeof idsRaw === "string" ? JSON.parse(idsRaw) : idsRaw;
          if (!Array.isArray(ids) || ids.length === 0) return { averageRating: 0, totalReviews: 0 };
          var rKeys: string[] = [];
          for (var ri = 0; ri < ids.length; ri++) rKeys.push("review:" + ids[ri]);
          var rawRevs = await kv.mget(rKeys);
          var rTotal = 0;
          var rCount = 0;
          for (var rj = 0; rj < rawRevs.length; rj++) {
            if (!rawRevs[rj]) continue;
            var rv = typeof rawRevs[rj] === "string" ? JSON.parse(rawRevs[rj] as string) : rawRevs[rj];
            if (rv.status !== "approved") continue;
            rTotal += rv.rating;
            rCount++;
          }
          return { averageRating: rCount > 0 ? Math.round((rTotal / rCount) * 10) / 10 : 0, totalReviews: rCount };
        } catch (e) {
          console.log("[produto-detail-init] Review summary error: " + String(e));
          return { averageRating: 0, totalReviews: 0 };
        }
      })(),
    ]);

    // Extract results with safe fallbacks
    var product = results[0].status === "fulfilled" ? results[0].value : { data: [] };
    var meta = results[1].status === "fulfilled" ? results[1].value : { visible: true };
    var images = results[2].status === "fulfilled" ? results[2].value : { sku: sku, images: [], total: 0 };
    var attrs = results[3].status === "fulfilled" ? results[3].value : { sku: sku, attributes: null, found: false };
    var price = results[4].status === "fulfilled" ? results[4].value : null;
    var balance = results[5].status === "fulfilled" ? results[5].value : null;
    var reviewSummary = (results[6] && results[6].status === "fulfilled") ? results[6].value : { averageRating: 0, totalReviews: 0 };

    var elapsed = Date.now() - startMs;
    var _revCount = reviewSummary ? reviewSummary.totalReviews : 0;
    console.log("[produto-detail-init] SKU=" + sku + " completed in " + elapsed + "ms | product=" + (product.data ? product.data.length : 0) + " imgs=" + (images.total || 0) + " price=" + String(price ? price.found : "null") + " balance=" + String(balance ? balance.found : "null") + " reviews=" + String(_revCount));

    return c.json({
      product: product,
      meta: meta,
      images: images,
      attributes: attrs,
      price: price,
      balance: balance,
      reviewSummary: reviewSummary,
      _elapsed: elapsed,
    });
  } catch (e: any) {
    console.log("[produto-detail-init] Exception:", e);
    return c.json({ error: "Erro interno ao buscar detalhes do produto." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ─── OG PROXY — Server-rendered meta tags for social media crawlers ──
// ═══════════════════════════════════════════════════════════════════════
// Social crawlers (Facebook, Twitter, WhatsApp, Telegram, LinkedIn) do
// NOT execute JavaScript. This endpoint returns a minimal HTML page with
// correct og: meta tags + a redirect to the SPA for human visitors.
// Usage: share the URL /functions/v1/make-server-b7b07654/og/produto/:sku
// instead of the SPA URL. Crawlers read the meta tags; humans get
// redirected via <meta http-equiv="refresh"> + JS fallback.

app.get(BASE + "/og/produto/:sku", async (c) => {
  try {
    var sku = decodeURIComponent(c.req.param("sku")).trim().substring(0, 100);
    if (!sku) return c.text("SKU obrigatório.", 400);

    var supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    var supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    // Determine site URL for redirects
    var siteUrl = Deno.env.get("SITE_URL") || "";
    if (!siteUrl) siteUrl = "https://www.carretaoautopecas.com.br";

    var productUrl = siteUrl + "/produto/" + encodeURIComponent(sku);

    console.log("[og/produto] Generating OG page for SKU: " + sku);

    // Fetch product + images + price in parallel (lightweight — only what we need for meta tags)
    var results = await Promise.allSettled([
      // 0. Product title from DB
      (async function () {
        var apiUrl = supabaseUrl + "/rest/v1/produtos?select=sku,titulo&sku=eq." + encodeURIComponent(sku) + "&limit=1";
        var res = await fetch(apiUrl, {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: "Bearer " + supabaseKey,
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) return [];
        return await res.json();
      })(),

      // 1. Primary image URL from Storage
      (async function () {
        var listResult = await supabaseAdmin.storage
          .from("produtos")
          .list(sku, { limit: 10, sortBy: { column: "name", order: "asc" } });
        var files = listResult.data;
        if (!files || files.length === 0) return null;
        var imageFiles = files.filter(function (f) { return /\.(webp|png|jpg|jpeg|gif)$/i.test(f.name); });
        if (imageFiles.length === 0) return null;
        // Sort by number to find primary (image 1)
        imageFiles.sort(function (a, b) {
          var na = parseInt((a.name.match(/(\d+)/) || ["0", "0"])[1], 10);
          var nb = parseInt((b.name.match(/(\d+)/) || ["0", "0"])[1], 10);
          return na - nb;
        });
        // Use signed URL so crawlers can access even if bucket is private
        var filePath = sku + "/" + imageFiles[0].name;
        var signResult = await supabaseAdmin.storage.from("produtos").createSignedUrl(filePath, 86400);
        if (signResult.data && signResult.data.signedUrl) return signResult.data.signedUrl;
        // Fallback to public URL
        return supabaseUrl + "/storage/v1/object/public/produtos/" + encodeURIComponent(sku) + "/" + encodeURIComponent(imageFiles[0].name);
      })(),

      // 2. Price from SIGE (reuse existing route)
      (async function () {
        var pricePath = BASE + "/produtos/preco/" + encodeURIComponent(sku);
        var priceRes = await app.request(pricePath);
        return await priceRes.json();
      })(),
    ]);

    var productData = results[0].status === "fulfilled" ? results[0].value : [];
    var imageUrl = results[1].status === "fulfilled" ? results[1].value : null;
    var priceData = results[2].status === "fulfilled" ? results[2].value : null;

    var titulo = productData.length > 0 ? productData[0].titulo : "Produto " + sku;
    var description = "Compre " + titulo + " (SKU: " + sku + ") na Carretão Auto Peças. Entrega para todo o Brasil, garantia de fábrica.";

    // Price string for display
    var priceStr = "";
    if (priceData && priceData.found && priceData.price) {
      priceStr = "R$ " + Number(priceData.price).toFixed(2).replace(".", ",");
    }

    // Build JSON-LD
    var jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: titulo,
      sku: sku,
      image: imageUrl || undefined,
      description: description,
      url: productUrl,
      brand: { "@type": "Organization", name: "Carretão Auto Peças" },
      offers: priceData && priceData.found && priceData.price ? {
        "@type": "Offer",
        url: productUrl,
        priceCurrency: "BRL",
        price: Number(priceData.price).toFixed(2),
        availability: "https://schema.org/InStock",
        seller: { "@type": "Organization", name: "Carretão Auto Peças" },
      } : undefined,
    });

    // Build minimal HTML with all OG tags
    var html = "<!DOCTYPE html>\n<html lang=\"pt-BR\">\n<head>\n";
    html = html + "<meta charset=\"utf-8\">\n";
    html = html + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n";
    html = html + "<title>" + _escHtml(titulo) + " - Carretão Auto Peças</title>\n";
    html = html + "<meta name=\"description\" content=\"" + _escAttr(description) + "\">\n";
    // OG tags
    html = html + "<meta property=\"og:type\" content=\"product\">\n";
    html = html + "<meta property=\"og:title\" content=\"" + _escAttr(titulo) + "\">\n";
    html = html + "<meta property=\"og:description\" content=\"" + _escAttr(description) + "\">\n";
    html = html + "<meta property=\"og:url\" content=\"" + _escAttr(productUrl) + "\">\n";
    html = html + "<meta property=\"og:site_name\" content=\"Carretão Auto Peças\">\n";
    html = html + "<meta property=\"og:locale\" content=\"pt_BR\">\n";
    if (imageUrl) {
      html = html + "<meta property=\"og:image\" content=\"" + _escAttr(imageUrl) + "\">\n";
      html = html + "<meta property=\"og:image:width\" content=\"800\">\n";
      html = html + "<meta property=\"og:image:height\" content=\"800\">\n";
      html = html + "<meta property=\"og:image:alt\" content=\"" + _escAttr(titulo) + "\">\n";
    }
    if (priceData && priceData.found && priceData.price) {
      html = html + "<meta property=\"product:price:amount\" content=\"" + Number(priceData.price).toFixed(2) + "\">\n";
      html = html + "<meta property=\"product:price:currency\" content=\"BRL\">\n";
    }
    // Twitter Card tags
    html = html + "<meta name=\"twitter:card\" content=\"" + (imageUrl ? "summary_large_image" : "summary") + "\">\n";
    html = html + "<meta name=\"twitter:title\" content=\"" + _escAttr(titulo) + "\">\n";
    html = html + "<meta name=\"twitter:description\" content=\"" + _escAttr(description) + "\">\n";
    if (imageUrl) {
      html = html + "<meta name=\"twitter:image\" content=\"" + _escAttr(imageUrl) + "\">\n";
    }
    // JSON-LD structured data
    html = html + "<script type=\"application/ld+json\">" + jsonLd.replace(/<\//g, "<\\/") + "</script>\n";
    // Redirect for human visitors (crawlers stop at meta tags)
    html = html + "<meta http-equiv=\"refresh\" content=\"0; url=" + _escAttr(productUrl) + "\">\n";
    html = html + "<link rel=\"canonical\" href=\"" + _escAttr(productUrl) + "\">\n";
    html = html + "</head>\n<body>\n";
    html = html + "<p>Redirecionando para <a href=\"" + _escAttr(productUrl) + "\">" + _escHtml(titulo) + "</a>...</p>\n";
    if (priceStr) {
      html = html + "<p>" + priceStr + "</p>\n";
    }
    html = html + "<script>window.location.replace(\"" + _escJs(productUrl) + "\");</script>\n";
    html = html + "</body>\n</html>";

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (e) {
    console.log("[og/produto] Exception:", e);
    // On error, just redirect to the SPA
    var fallbackUrl = (Deno.env.get("SITE_URL") || "https://www.carretaoautopecas.com.br") + "/produto/" + encodeURIComponent(sku || "");
    return Response.redirect(fallbackUrl, 302);
  }
});

// HTML escape helpers for OG proxy
function _escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function _escAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function _escJs(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n");
}

// ═══════════════════════════════════════════════════════════════════════
// ─── ADMIN EMAIL MARKETING ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

// --- Subscribers ---

// GET /admin/email-marketing/subscribers — list all subscribers
app.get(BASE + "/admin/email-marketing/subscribers", async (c) => {
  try {
    var raws = await kv.getByPrefix("emkt_sub:");
    var subs: any[] = [];
    for (var i = 0; i < raws.length; i++) {
      try {
        var item = typeof raws[i] === "string" ? JSON.parse(raws[i]) : raws[i];
        if (item && item.email) subs.push(item);
      } catch { /* skip */ }
    }
    subs.sort(function (a: any, b: any) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return c.json({ subscribers: subs, total: subs.length });
  } catch (e: any) {
    console.log("[EmailMarketing] List subscribers error:", e);
    return c.json({ error: "Erro ao listar assinantes." }, 500);
  }
});

// POST /admin/email-marketing/subscribers — add subscriber
app.post(BASE + "/admin/email-marketing/subscribers", async (c) => {
  try {
    var body = await c.req.json();
    // Input validation
    var emkValid = validate(body, {
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      name: { type: "string", maxLen: 150 },
      tags: { type: "array", maxItems: 20 },
    });
    if (!emkValid.ok) {
      return c.json({ error: emkValid.errors[0] || "Dados invalidos." }, 400);
    }
    var email = (emkValid.sanitized.email || "").toLowerCase().trim();
    if (!email) return c.json({ error: "Email obrigatório" }, 400);
    var name = emkValid.sanitized.name || "";
    var tags = body.tags || [];
    var id = email.replace(/[^a-z0-9]/g, "_");
    var now = Date.now();
    var sub = { id: id, email: email, name: name, tags: tags, active: true, createdAt: now, updatedAt: now };
    await kv.set("emkt_sub:" + id, JSON.stringify(sub));
    console.log("[EmailMarketing] Subscriber added: " + email);
    return c.json({ ok: true, subscriber: sub });
  } catch (e: any) {
    console.log("[EmailMarketing] Add subscriber error:", e);
    return c.json({ error: "Erro ao adicionar assinante." }, 500);
  }
});

// POST /admin/email-marketing/subscribers/import — bulk import
app.post(BASE + "/admin/email-marketing/subscribers/import", async (c) => {
  try {
    var body = await c.req.json();
    // Input validation for bulk import
    var importValid = validate(body, {
      subscribers: { required: true, type: "array", maxItems: 10000 },
    });
    if (!importValid.ok) return c.json({ error: importValid.errors[0] || "Dados invalidos." }, 400);
    var list = importValid.sanitized.subscribers || [];
    if (!Array.isArray(list) || list.length === 0) return c.json({ error: "Lista vazia" }, 400);
    var imported = 0;
    var skipped = 0;
    var now = Date.now();
    for (var i = 0; i < list.length; i++) {
      var email = String(list[i].email || "").toLowerCase().trim();
      if (!email || email.indexOf("@") === -1) { skipped++; continue; }
      var name = String(list[i].name || "").trim();
      var tags = list[i].tags || [];
      var id = email.replace(/[^a-z0-9]/g, "_");
      var existing = await kv.get("emkt_sub:" + id);
      if (existing) { skipped++; continue; }
      var sub = { id: id, email: email, name: name, tags: tags, active: true, createdAt: now, updatedAt: now };
      await kv.set("emkt_sub:" + id, JSON.stringify(sub));
      imported++;
    }
    console.log("[EmailMarketing] Import: " + imported + " imported, " + skipped + " skipped");
    return c.json({ ok: true, imported: imported, skipped: skipped, total: list.length });
  } catch (e: any) {
    console.log("[EmailMarketing] Import error:", e);
    return c.json({ error: "Erro ao importar." }, 500);
  }
});

// PUT /admin/email-marketing/subscribers/:id — update subscriber
app.put(BASE + "/admin/email-marketing/subscribers/:id", async (c) => {
  try {
    var id = (c.req.param("id") || "").substring(0, 100);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    var raw = await kv.get("emkt_sub:" + id);
    if (!raw) return c.json({ error: "Assinante não encontrado" }, 404);
    var existing = typeof raw === "string" ? JSON.parse(raw) : raw;
    var body = await c.req.json();
    // Input validation for subscriber update
    var subUpValid = validate(body, {
      name: { type: "string", maxLen: 200 },
      tags: { type: "array", maxItems: 50 },
      active: { type: "boolean" },
    });
    if (!subUpValid.ok) return c.json({ error: subUpValid.errors[0] || "Dados invalidos." }, 400);
    if (body.name !== undefined) existing.name = sanitizeInput(String(body.name).trim()).substring(0, 200);
    if (body.tags !== undefined) existing.tags = body.tags;
    if (body.active !== undefined) existing.active = Boolean(body.active);
    existing.updatedAt = Date.now();
    await kv.set("emkt_sub:" + id, JSON.stringify(existing));
    return c.json({ ok: true, subscriber: existing });
  } catch (e: any) {
    console.log("[EmailMarketing] Update subscriber error:", e);
    return c.json({ error: "Erro ao atualizar." }, 500);
  }
});

// DELETE /admin/email-marketing/subscribers/:id — remove subscriber
app.delete(BASE + "/admin/email-marketing/subscribers/:id", async (c) => {
  try {
    var id = (c.req.param("id") || "").substring(0, 100);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    await kv.del("emkt_sub:" + id);
    console.log("[EmailMarketing] Subscriber deleted: " + id);
    return c.json({ ok: true, deleted: id });
  } catch (e: any) {
    console.log("[EmailMarketing] Delete subscriber error:", e);
    return c.json({ error: "Erro ao deletar." }, 500);
  }
});

// --- Templates ---

// GET /admin/email-marketing/templates — list all templates
app.get(BASE + "/admin/email-marketing/templates", async (c) => {
  try {
    var raws = await kv.getByPrefix("emkt_tpl:");
    var tpls: any[] = [];
    for (var i = 0; i < raws.length; i++) {
      try {
        var item = typeof raws[i] === "string" ? JSON.parse(raws[i]) : raws[i];
        if (item && item.id) tpls.push(item);
      } catch { /* skip */ }
    }
    tpls.sort(function (a: any, b: any) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return c.json({ templates: tpls });
  } catch (e: any) {
    console.log("[EmailMarketing] List templates error:", e);
    return c.json({ error: "Erro ao listar templates." }, 500);
  }
});

// POST /admin/email-marketing/templates — create template
app.post(BASE + "/admin/email-marketing/templates", async (c) => {
  try {
    var body = await c.req.json();
    // Input validation for email template
    var tplValid = validate(body, {
      name: { required: true, type: "string", minLen: 1, maxLen: 200 },
      subject: { type: "string", maxLen: 500 },
      htmlBody: { type: "string", maxLen: 500000, sanitize: false, trim: false },
    });
    if (!tplValid.ok) return c.json({ error: tplValid.errors[0] || "Dados invalidos." }, 400);
    var name = (tplValid.sanitized.name || "").trim();
    if (!name) return c.json({ error: "Nome obrigatório" }, 400);
    var now = Date.now();
    var id = "tpl_" + now + "_" + Math.random().toString(36).substring(2, 8);
    var tpl = {
      id: id,
      name: name,
      subject: String(body.subject || "").trim(),
      htmlBody: String(body.htmlBody || ""),
      createdAt: now,
      updatedAt: now
    };
    await kv.set("emkt_tpl:" + id, JSON.stringify(tpl));
    console.log("[EmailMarketing] Template created: " + id + " name=" + name);
    return c.json({ ok: true, template: tpl });
  } catch (e: any) {
    console.log("[EmailMarketing] Create template error:", e);
    return c.json({ error: "Erro ao criar template." }, 500);
  }
});

// PUT /admin/email-marketing/templates/:id — update template
app.put(BASE + "/admin/email-marketing/templates/:id", async (c) => {
  try {
    var id = (c.req.param("id") || "").substring(0, 100);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    var raw = await kv.get("emkt_tpl:" + id);
    if (!raw) return c.json({ error: "Template não encontrado" }, 404);
    var existing = typeof raw === "string" ? JSON.parse(raw) : raw;
    var body = await c.req.json();
    // Input validation for email template update
    var tplUpValid = validate(body, {
      name: { type: "string", maxLen: 200 },
      subject: { type: "string", maxLen: 500 },
      htmlBody: { type: "string", maxLen: 500000, sanitize: false, trim: false },
    });
    if (!tplUpValid.ok) return c.json({ error: tplUpValid.errors[0] || "Dados invalidos." }, 400);
    if (body.name !== undefined) existing.name = String(body.name).trim();
    if (body.subject !== undefined) existing.subject = String(body.subject).trim();
    if (body.htmlBody !== undefined) existing.htmlBody = String(body.htmlBody);
    existing.updatedAt = Date.now();
    await kv.set("emkt_tpl:" + id, JSON.stringify(existing));
    return c.json({ ok: true, template: existing });
  } catch (e: any) {
    console.log("[EmailMarketing] Update template error:", e);
    return c.json({ error: "Erro ao atualizar template." }, 500);
  }
});

// DELETE /admin/email-marketing/templates/:id — delete template
app.delete(BASE + "/admin/email-marketing/templates/:id", async (c) => {
  try {
    var id = (c.req.param("id") || "").substring(0, 100);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    await kv.del("emkt_tpl:" + id);
    console.log("[EmailMarketing] Template deleted: " + id);
    return c.json({ ok: true, deleted: id });
  } catch (e: any) {
    console.log("[EmailMarketing] Delete template error:", e);
    return c.json({ error: "Erro ao deletar template." }, 500);
  }
});

// --- Campaigns ---

// GET /admin/email-marketing/campaigns — list all campaigns
app.get(BASE + "/admin/email-marketing/campaigns", async (c) => {
  try {
    var raws = await kv.getByPrefix("emkt_cmp:");
    var cmps: any[] = [];
    for (var i = 0; i < raws.length; i++) {
      try {
        var item = typeof raws[i] === "string" ? JSON.parse(raws[i]) : raws[i];
        if (item && item.id) cmps.push(item);
      } catch { /* skip */ }
    }
    cmps.sort(function (a: any, b: any) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return c.json({ campaigns: cmps });
  } catch (e: any) {
    console.log("[EmailMarketing] List campaigns error:", e);
    return c.json({ error: "Erro ao listar campanhas." }, 500);
  }
});

// POST /admin/email-marketing/campaigns — create campaign
app.post(BASE + "/admin/email-marketing/campaigns", async (c) => {
  try {
    var body = await c.req.json();
    // Input validation for campaign create
    var cmpValid = validate(body, {
      name: { required: true, type: "string", minLen: 1, maxLen: 200 },
      subject: { type: "string", maxLen: 500 },
      htmlBody: { type: "string", maxLen: 500000, sanitize: false, trim: false },
      senderName: { type: "string", maxLen: 200 },
      senderEmail: { type: "string", maxLen: 254 },
      replyTo: { type: "string", maxLen: 254 },
      templateId: { type: "string", maxLen: 200 },
      targetTags: { type: "array", maxItems: 50 },
    });
    if (!cmpValid.ok) return c.json({ error: cmpValid.errors[0] || "Dados invalidos." }, 400);
    var name = (cmpValid.sanitized.name || "").trim();
    if (!name) return c.json({ error: "Nome obrigatório" }, 400);
    var now = Date.now();
    var id = "cmp_" + now + "_" + Math.random().toString(36).substring(2, 8);
    var cmp = {
      id: id,
      name: name,
      subject: String(body.subject || "").trim(),
      templateId: body.templateId || null,
      htmlBody: String(body.htmlBody || ""),
      senderName: String(body.senderName || "Carretão Auto Peças").trim(),
      senderEmail: String(body.senderEmail || "").trim(),
      replyTo: String(body.replyTo || "").trim(),
      targetTags: body.targetTags || [],
      status: "draft",
      totalSent: 0,
      totalFailed: 0,
      sentAt: null,
      createdAt: now,
      updatedAt: now
    };
    await kv.set("emkt_cmp:" + id, JSON.stringify(cmp));
    console.log("[EmailMarketing] Campaign created: " + id + " name=" + name);
    return c.json({ ok: true, campaign: cmp });
  } catch (e: any) {
    console.log("[EmailMarketing] Create campaign error:", e);
    return c.json({ error: "Erro ao criar campanha." }, 500);
  }
});

// PUT /admin/email-marketing/campaigns/:id — update campaign
app.put(BASE + "/admin/email-marketing/campaigns/:id", async (c) => {
  try {
    var id = (c.req.param("id") || "").substring(0, 100);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    var raw = await kv.get("emkt_cmp:" + id);
    if (!raw) return c.json({ error: "Campanha não encontrada" }, 404);
    var existing = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (existing.status === "sent") return c.json({ error: "Campanha já enviada não pode ser editada" }, 400);
    var body = await c.req.json();
    // Input validation for campaign update
    var cmpUpValid = validate(body, {
      name: { type: "string", maxLen: 200 },
      subject: { type: "string", maxLen: 500 },
      htmlBody: { type: "string", maxLen: 500000, sanitize: false, trim: false },
      senderName: { type: "string", maxLen: 200 },
      senderEmail: { type: "string", maxLen: 254 },
      replyTo: { type: "string", maxLen: 254 },
      templateId: { type: "string", maxLen: 200 },
      targetTags: { type: "array", maxItems: 50 },
    });
    if (!cmpUpValid.ok) return c.json({ error: cmpUpValid.errors[0] || "Dados invalidos." }, 400);
    if (body.name !== undefined) existing.name = String(body.name).trim();
    if (body.subject !== undefined) existing.subject = String(body.subject).trim();
    if (body.templateId !== undefined) existing.templateId = body.templateId;
    if (body.htmlBody !== undefined) existing.htmlBody = String(body.htmlBody);
    if (body.senderName !== undefined) existing.senderName = String(body.senderName).trim();
    if (body.senderEmail !== undefined) existing.senderEmail = String(body.senderEmail).trim();
    if (body.replyTo !== undefined) existing.replyTo = String(body.replyTo).trim();
    if (body.targetTags !== undefined) existing.targetTags = body.targetTags;
    existing.updatedAt = Date.now();
    await kv.set("emkt_cmp:" + id, JSON.stringify(existing));
    return c.json({ ok: true, campaign: existing });
  } catch (e: any) {
    console.log("[EmailMarketing] Update campaign error:", e);
    return c.json({ error: "Erro ao atualizar campanha." }, 500);
  }
});

// DELETE /admin/email-marketing/campaigns/:id — delete campaign
app.delete(BASE + "/admin/email-marketing/campaigns/:id", async (c) => {
  try {
    var id = (c.req.param("id") || "").substring(0, 100);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    await kv.del("emkt_cmp:" + id);
    console.log("[EmailMarketing] Campaign deleted: " + id);
    return c.json({ ok: true, deleted: id });
  } catch (e: any) {
    console.log("[EmailMarketing] Delete campaign error:", e);
    return c.json({ error: "Erro ao deletar campanha." }, 500);
  }
});

// --- SMTP helper ---
async function _getSmtpConfig(): Promise<any> {
  var raw = await kv.get("emkt_config");
  if (!raw) return null;
  var cfg = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!cfg.smtpHost || !cfg.smtpPort || !cfg.smtpUser || !cfg.smtpPass) return null;
  return cfg;
}

function _createSmtpTransport(cfg: any) {
  return nodemailer.createTransport({
    host: String(cfg.smtpHost),
    port: Number(cfg.smtpPort) || 587,
    secure: Boolean(cfg.smtpSecure),
    auth: {
      user: String(cfg.smtpUser),
      pass: String(cfg.smtpPass),
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

async function _sendSmtpEmail(cfg: any, opts: { from: string; to: string; subject: string; html: string; replyTo?: string }) {
  var transport = _createSmtpTransport(cfg);
  var mailOpts: any = {
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.replyTo) {
    mailOpts.replyTo = opts.replyTo;
  }
  var info = await transport.sendMail(mailOpts);
  return info;
}

// ═══════════════════════════════════════════════════════════════════════
// ─── TRANSACTIONAL EMAIL HELPERS ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function _emailBaseWrapper(bodyContent: string): string {
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
    + '<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
    + '<div style="max-width:600px;margin:0 auto;padding:20px;">'
    + '<div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">'
    + bodyContent
    + '</div>'
    + '<div style="text-align:center;padding:20px 0 10px;color:#9ca3af;font-size:12px;">'
    + '<p style="margin:0;">Carretao Auto Pecas</p>'
    + '<p style="margin:4px 0 0;font-size:11px;">Este e um e-mail automatico, por favor nao responda.</p>'
    + '</div>'
    + '</div></body></html>';
}

function _buildOrderConfirmationHtml(order: any): string {
  var itemsHtml = "";
  var items = order.items || [];
  for (var ei = 0; ei < items.length; ei++) {
    var it = items[ei];
    var warrantyLine = "";
    if (it.warranty) {
      warrantyLine = '<div style="font-size:11px;color:#2563eb;margin-top:2px;">Garantia: ' + (it.warranty.name || "") + ' (' + (it.warranty.durationMonths || 0) + ' meses) - R$ ' + Number(it.warranty.price || 0).toFixed(2).replace(".", ",") + '</div>';
    }
    itemsHtml += '<tr>'
      + '<td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;">'
      + '<div style="font-size:14px;color:#374151;font-weight:500;">' + (it.titulo || it.sku || "Produto") + '</div>'
      + '<div style="font-size:12px;color:#9ca3af;margin-top:2px;">SKU: ' + (it.sku || "N/A") + ' | Qtd: ' + (it.quantidade || 1) + '</div>'
      + warrantyLine
      + '</td>'
      + '<td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:14px;font-weight:600;color:#374151;white-space:nowrap;">'
      + 'R$ ' + Number(it.valorUnitario || 0).toFixed(2).replace(".", ",")
      + '</td></tr>';
  }

  var shippingHtml = "";
  if (order.shippingOption) {
    var so = order.shippingOption;
    var priceStr = so.free ? '<span style="color:#16a34a;font-weight:600;">Gratis</span>' : 'R$ ' + Number(so.price || 0).toFixed(2).replace(".", ",");
    shippingHtml = '<div style="padding:12px 16px;background:#eff6ff;border-radius:8px;margin:12px 16px;">'
      + '<div style="font-size:13px;color:#1e40af;font-weight:600;">' + (so.carrierName || "Transportadora") + '</div>'
      + '<div style="font-size:12px;color:#3b82f6;margin-top:2px;">Prazo: ate ' + (so.deliveryDays || "?") + ' dias uteis | Frete: ' + priceStr + '</div>'
      + '</div>';
  }

  var addressHtml = "";
  if (order.shippingAddress) {
    var sa = order.shippingAddress;
    addressHtml = '<div style="padding:12px 16px;background:#f9fafb;border-radius:8px;margin:12px 16px;">'
      + '<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:4px;">Endereco de Entrega</div>'
      + (sa.name ? '<div style="font-size:13px;color:#374151;font-weight:600;">' + sa.name + '</div>' : '')
      + (sa.address ? '<div style="font-size:12px;color:#6b7280;">' + sa.address + '</div>' : '')
      + '<div style="font-size:12px;color:#6b7280;">' + [sa.city, sa.state, sa.cep ? "CEP " + sa.cep : ""].filter(Boolean).join(" - ") + '</div>'
      + '</div>';
  }

  var payMethodLabel = "PIX";
  if (order.paymentMethod === "boleto") payMethodLabel = "Boleto Bancario";
  if (order.paymentMethod === "mercadopago") payMethodLabel = "Mercado Pago";
  if (order.paymentMethod === "cartao_credito") payMethodLabel = "Cartao de Credito";

  var body = ''
    + '<div style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:24px 20px;text-align:center;">'
    + '<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Pedido Recebido!</h1>'
    + '<p style="margin:8px 0 0;color:#fecaca;font-size:14px;">Obrigado por comprar na Carretao Auto Pecas</p>'
    + '</div>'
    + '<div style="padding:20px 16px;">'
    + '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:16px;">'
    + '<div style="font-size:13px;color:#92400e;font-weight:600;">Aguardando Pagamento</div>'
    + '<div style="font-size:12px;color:#a16207;margin-top:2px;">Forma de pagamento: ' + payMethodLabel + '</div>'
    + '</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>'
    + '<td style="width:50%;padding:0 4px 0 0;">'
    + '<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;">'
    + '<div style="font-size:11px;color:#9ca3af;">Pedido</div>'
    + '<div style="font-size:15px;color:#374151;font-weight:700;">#' + (order.localOrderId || order.sigeOrderId || "N/A") + '</div>'
    + '</div></td>'
    + '<td style="width:50%;padding:0 0 0 4px;">'
    + '<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;">'
    + '<div style="font-size:11px;color:#9ca3af;">Total</div>'
    + '<div style="font-size:15px;color:#374151;font-weight:700;">R$ ' + Number(order.total || 0).toFixed(2).replace(".", ",") + '</div>'
    + '</div></td>'
    + '</tr></table>'
    + addressHtml
    + shippingHtml
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-collapse:collapse;">'
    + '<thead><tr><th style="text-align:left;padding:8px 16px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Produto</th>'
    + '<th style="text-align:right;padding:8px 16px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Valor</th></tr></thead>'
    + '<tbody>' + itemsHtml + '</tbody>'
    + '<tfoot><tr><td style="padding:12px 16px;font-size:14px;font-weight:600;color:#374151;">Total</td>'
    + '<td style="padding:12px 16px;text-align:right;font-size:16px;font-weight:700;color:#111827;">R$ ' + Number(order.total || 0).toFixed(2).replace(".", ",") + '</td></tr></tfoot>'
    + '</table>'
    + '</div>';

  return _emailBaseWrapper(body);
}

function _buildPaymentApprovedHtml(order: any): string {
  var siteUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(".supabase.co", ".vercel.app");
  var body = ''
    + '<div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:24px 20px;text-align:center;">'
    + '<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Pagamento Confirmado!</h1>'
    + '<p style="margin:8px 0 0;color:#bbf7d0;font-size:14px;">Seu pedido esta sendo preparado</p>'
    + '</div>'
    + '<div style="padding:20px 16px;">'
    + '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:16px;">'
    + '<div style="font-size:14px;color:#166534;font-weight:600;">Pagamento aprovado com sucesso!</div>'
    + '<div style="font-size:12px;color:#16a34a;margin-top:4px;">Pedido #' + (order.localOrderId || order.sigeOrderId || "N/A") + ' | R$ ' + Number(order.total || 0).toFixed(2).replace(".", ",") + '</div>'
    + '</div>'
    + '<div style="font-size:13px;color:#6b7280;line-height:1.6;">'
    + '<p style="margin:0 0 12px;">Recebemos a confirmacao do seu pagamento. Agora estamos preparando seu pedido para envio.</p>'
    + '<p style="margin:0 0 12px;">Voce recebera atualizacoes sobre o envio e podera acompanhar o rastreio diretamente pela sua conta.</p>'
    + '</div>'
    + '<div style="text-align:center;margin-top:20px;">'
    + '<a href="' + siteUrl + '/minha-conta?tab=pedidos" '
    + 'style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Acompanhar Pedido</a>'
    + '</div>'
    + '</div>';

  return _emailBaseWrapper(body);
}

function _buildAdminNewOrderHtml(order: any, userEmail: string): string {
  var itemsList = "";
  var items = order.items || [];
  for (var ej = 0; ej < items.length; ej++) {
    var item = items[ej];
    itemsList += '<li style="margin-bottom:4px;font-size:13px;color:#374151;">'
      + (item.titulo || item.sku) + ' (SKU: ' + (item.sku || "N/A") + ') x' + (item.quantidade || 1)
      + ' - R$ ' + Number(item.valorUnitario || 0).toFixed(2).replace(".", ",")
      + '</li>';
  }

  var body = ''
    + '<div style="background:linear-gradient(135deg,#1e40af,#1e3a8a);padding:24px 20px;text-align:center;">'
    + '<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Novo Pedido Recebido</h1>'
    + '</div>'
    + '<div style="padding:20px 16px;">'
    + '<div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:16px;">'
    + '<div style="font-size:14px;color:#374151;"><strong>Pedido:</strong> #' + (order.localOrderId || order.sigeOrderId || "N/A") + '</div>'
    + '<div style="font-size:13px;color:#6b7280;margin-top:4px;"><strong>Cliente:</strong> ' + userEmail + '</div>'
    + '<div style="font-size:13px;color:#6b7280;margin-top:2px;"><strong>Total:</strong> R$ ' + Number(order.total || 0).toFixed(2).replace(".", ",") + '</div>'
    + '<div style="font-size:13px;color:#6b7280;margin-top:2px;"><strong>Pagamento:</strong> ' + (order.paymentMethod || "N/A") + '</div>'
    + '<div style="font-size:13px;color:#6b7280;margin-top:2px;"><strong>Data:</strong> ' + new Date(order.createdAt || Date.now()).toLocaleString("pt-BR") + '</div>'
    + '</div>'
    + '<div style="font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:8px;">Itens</div>'
    + '<ul style="padding-left:20px;margin:0 0 16px;">' + itemsList + '</ul>';

  if (order.shippingAddress) {
    var sa2 = order.shippingAddress;
    body += '<div style="font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:8px;">Endereco</div>'
      + '<div style="font-size:13px;color:#6b7280;margin-bottom:16px;">'
      + (sa2.name ? sa2.name + '<br>' : '')
      + (sa2.address ? sa2.address + '<br>' : '')
      + [sa2.city, sa2.state, sa2.cep].filter(Boolean).join(" - ")
      + (sa2.phone ? '<br>Tel: ' + sa2.phone : '')
      + '</div>';
  }

  body += '</div>';
  return _emailBaseWrapper(body);
}

// Helper: get user email from userId via Supabase Auth
async function _getUserEmailById(userId: string): Promise<string | null> {
  try {
    var result = await supabaseAdmin.auth.admin.getUserById(userId);
    if (result.data && result.data.user && result.data.user.email) {
      return result.data.user.email;
    }
  } catch (ue) {
    console.log("[Email] _getUserEmailById error: " + ue);
  }
  return null;
}

// Fire-and-forget: send order confirmation email to customer
async function _sendOrderConfirmationEmail(order: any) {
  try {
    var smtpCfg = await _getSmtpConfig();
    if (!smtpCfg) {
      console.log("[Email] Order confirmation: SMTP not configured, skipping.");
      return;
    }
    var userEmail = order.userEmail || null;
    if (!userEmail && order.createdBy) {
      userEmail = await _getUserEmailById(order.createdBy);
    }
    if (!userEmail) {
      console.log("[Email] Order confirmation: no user email found, skipping.");
      return;
    }
    var senderEmail = smtpCfg.defaultSenderEmail || smtpCfg.smtpUser;
    var senderName = smtpCfg.defaultSenderName || "Carretao Auto Pecas";
    var from = senderName + " <" + senderEmail + ">";
    var orderId = order.localOrderId || order.sigeOrderId || "N/A";
    console.log("[Email] Sending order confirmation to " + userEmail + " for order #" + orderId);
    await _sendSmtpEmail(smtpCfg, {
      from: from,
      to: userEmail,
      subject: "Pedido #" + orderId + " recebido - Carretao Auto Pecas",
      html: _buildOrderConfirmationHtml(order),
    });
    console.log("[Email] Order confirmation sent successfully to " + userEmail);
  } catch (err) {
    console.log("[Email] Order confirmation error (non-fatal): " + err);
  }
}

// Fire-and-forget: send payment approved email to customer
async function _sendPaymentApprovedEmail(order: any) {
  try {
    var smtpCfg = await _getSmtpConfig();
    if (!smtpCfg) {
      console.log("[Email] Payment approved: SMTP not configured, skipping.");
      return;
    }
    var userEmail = order.userEmail || null;
    if (!userEmail && order.createdBy) {
      userEmail = await _getUserEmailById(order.createdBy);
    }
    if (!userEmail) {
      console.log("[Email] Payment approved: no user email found, skipping.");
      return;
    }
    var senderEmail = smtpCfg.defaultSenderEmail || smtpCfg.smtpUser;
    var senderName = smtpCfg.defaultSenderName || "Carretao Auto Pecas";
    var from = senderName + " <" + senderEmail + ">";
    var orderId = order.localOrderId || order.sigeOrderId || "N/A";
    console.log("[Email] Sending payment approved to " + userEmail + " for order #" + orderId);
    await _sendSmtpEmail(smtpCfg, {
      from: from,
      to: userEmail,
      subject: "Pagamento confirmado - Pedido #" + orderId + " - Carretao Auto Pecas",
      html: _buildPaymentApprovedHtml(order),
    });
    console.log("[Email] Payment approved sent successfully to " + userEmail);
  } catch (err) {
    console.log("[Email] Payment approved error (non-fatal): " + err);
  }
}

// Fire-and-forget: send new order notification email to admins
async function _sendAdminNewOrderNotification(order: any, userEmail: string) {
  try {
    var smtpCfg = await _getSmtpConfig();
    if (!smtpCfg) {
      console.log("[Email] Admin notification: SMTP not configured, skipping.");
      return;
    }
    var adminEmails = await _getAdminWhitelist();
    if (!adminEmails || adminEmails.length === 0) {
      console.log("[Email] Admin notification: no admin emails found, skipping.");
      return;
    }
    var senderEmail = smtpCfg.defaultSenderEmail || smtpCfg.smtpUser;
    var senderName = smtpCfg.defaultSenderName || "Carretao Auto Pecas";
    var from = senderName + " <" + senderEmail + ">";
    var orderId = order.localOrderId || order.sigeOrderId || "N/A";
    var subject = "Novo pedido #" + orderId + " - R$ " + Number(order.total || 0).toFixed(2).replace(".", ",");
    var html = _buildAdminNewOrderHtml(order, userEmail);

    for (var ak = 0; ak < adminEmails.length; ak++) {
      try {
        console.log("[Email] Sending admin notification to " + adminEmails[ak] + " for order #" + orderId);
        await _sendSmtpEmail(smtpCfg, {
          from: from,
          to: adminEmails[ak],
          subject: subject,
          html: html,
          replyTo: userEmail,
        });
        console.log("[Email] Admin notification sent to " + adminEmails[ak]);
      } catch (ae) {
        console.log("[Email] Admin notification to " + adminEmails[ak] + " failed: " + ae);
      }
    }
  } catch (err) {
    console.log("[Email] Admin notification error (non-fatal): " + err);
  }
}

// POST /admin/email-marketing/smtp-test — test SMTP connection
app.post(BASE + "/admin/email-marketing/smtp-test", async (c) => {
  try {
    var body = await c.req.json();
    // Input validation for SMTP test
    var smtpTestValid = validate(body, {
      smtpHost: { required: true, type: "string", minLen: 1, maxLen: 300 },
      smtpPort: { type: "number", min: 1, max: 65535 },
      smtpUser: { required: true, type: "string", maxLen: 254 },
      smtpPass: { required: true, type: "string", maxLen: 500, sanitize: false },
      smtpSecure: { type: "boolean" },
    });
    if (!smtpTestValid.ok) return c.json({ error: smtpTestValid.errors[0] || "Dados invalidos." }, 400);
    var host = String(body.smtpHost || "").trim();
    var port = Number(body.smtpPort) || 587;
    var user = String(body.smtpUser || "").trim();
    var pass = String(body.smtpPass || "").trim();
    var secure = Boolean(body.smtpSecure);
    if (!host || !user || !pass) {
      return c.json({ error: "Host, usuário e senha SMTP são obrigatórios" }, 400);
    }
    var transport = nodemailer.createTransport({
      host: host,
      port: port,
      secure: secure,
      auth: { user: user, pass: pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
    await transport.verify();
    console.log("[EmailMarketing] SMTP connection test OK: " + host + ":" + port);
    return c.json({ ok: true, message: "Conexão SMTP bem-sucedida!" });
  } catch (e: any) {
    console.log("[EmailMarketing] SMTP connection test failed:", e);
    return c.json({ error: "Falha na conexao SMTP." }, 400);
  }
});

// POST /admin/email-marketing/campaigns/:id/test — send test email
app.post(BASE + "/admin/email-marketing/campaigns/:id/test", async (c) => {
  try {
    var id = c.req.param("id");
    if (!id || id.length > 100) return c.json({ error: "ID invalido." }, 400);
    var body = await c.req.json();
    // Input validation for campaign test
    var ctValid = validate(body, {
      testEmail: { required: true, type: "string", maxLen: 254, custom: validators.email },
    });
    if (!ctValid.ok) return c.json({ error: ctValid.errors[0] || "Email invalido." }, 400);
    var testEmail = String(ctValid.sanitized.testEmail || "").toLowerCase().trim();
    if (!testEmail) return c.json({ error: "Email de teste obrigatório" }, 400);

    var raw = await kv.get("emkt_cmp:" + id);
    if (!raw) return c.json({ error: "Campanha não encontrada" }, 404);
    var cmp = typeof raw === "string" ? JSON.parse(raw) : raw;

    // Resolve template if needed
    var htmlBody = cmp.htmlBody || "";
    if (cmp.templateId && !htmlBody) {
      var tplRaw = await kv.get("emkt_tpl:" + cmp.templateId);
      if (tplRaw) {
        var tpl = typeof tplRaw === "string" ? JSON.parse(tplRaw) : tplRaw;
        htmlBody = tpl.htmlBody || "";
      }
    }

    var smtpCfg = await _getSmtpConfig();
    if (!smtpCfg) {
      return c.json({ error: "SMTP não configurado. Vá em Configurações > SMTP e preencha os dados do seu servidor." }, 400);
    }

    var senderEmail = cmp.senderEmail || smtpCfg.defaultSenderEmail || smtpCfg.smtpUser;
    var senderName = cmp.senderName || smtpCfg.defaultSenderName || "Carretão Auto Peças";
    var from = senderName + " <" + senderEmail + ">";

    var info = await _sendSmtpEmail(smtpCfg, {
      from: from,
      to: testEmail,
      subject: "[TESTE] " + (cmp.subject || "Sem assunto"),
      html: htmlBody || "<p>Conteudo vazio</p>",
      replyTo: cmp.replyTo || smtpCfg.defaultReplyTo || undefined,
    });

    console.log("[EmailMarketing] Test email sent to " + testEmail + " campaignId=" + id + " messageId=" + (info.messageId || ""));
    return c.json({ ok: true, testEmail: testEmail, messageId: info.messageId || null });
  } catch (e: any) {
    console.log("[EmailMarketing] Test send error:", e);
    return c.json({ error: "Erro ao enviar teste." }, 500);
  }
});

// POST /admin/email-marketing/campaigns/:id/send — send campaign to all subscribers via SMTP
app.post(BASE + "/admin/email-marketing/campaigns/:id/send", async (c) => {
  try {
    var id = (c.req.param("id") || "").substring(0, 100);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    var raw = await kv.get("emkt_cmp:" + id);
    if (!raw) return c.json({ error: "Campanha não encontrada" }, 404);
    var cmp = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (cmp.status === "sent") return c.json({ error: "Campanha já foi enviada" }, 400);
    if (cmp.status === "sending") return c.json({ error: "Campanha está sendo enviada" }, 400);

    var smtpCfg = await _getSmtpConfig();
    if (!smtpCfg) {
      return c.json({ error: "SMTP não configurado. Vá em Configurações > SMTP e preencha os dados do seu servidor." }, 400);
    }

    // Resolve template
    var htmlBody = cmp.htmlBody || "";
    if (cmp.templateId && !htmlBody) {
      var tplRaw = await kv.get("emkt_tpl:" + cmp.templateId);
      if (tplRaw) {
        var tpl = typeof tplRaw === "string" ? JSON.parse(tplRaw) : tplRaw;
        htmlBody = tpl.htmlBody || "";
      }
    }
    if (!htmlBody) return c.json({ error: "Campanha sem conteudo HTML" }, 400);
    if (!cmp.subject) return c.json({ error: "Campanha sem assunto" }, 400);

    // Get subscribers
    var subRaws = await kv.getByPrefix("emkt_sub:");
    var subs: any[] = [];
    for (var i = 0; i < subRaws.length; i++) {
      try {
        var s = typeof subRaws[i] === "string" ? JSON.parse(subRaws[i]) : subRaws[i];
        if (s && s.email && s.active !== false) {
          // Filter by tags if campaign has targetTags
          if (cmp.targetTags && cmp.targetTags.length > 0) {
            var subTags = s.tags || [];
            var hasTag = false;
            for (var t = 0; t < cmp.targetTags.length; t++) {
              if (subTags.indexOf(cmp.targetTags[t]) >= 0) { hasTag = true; break; }
            }
            if (!hasTag) continue;
          }
          subs.push(s);
        }
      } catch { /* skip */ }
    }

    if (subs.length === 0) return c.json({ error: "Nenhum assinante ativo encontrado" }, 400);

    // Mark as sending
    cmp.status = "sending";
    cmp.updatedAt = Date.now();
    await kv.set("emkt_cmp:" + id, JSON.stringify(cmp));

    var senderEmail = cmp.senderEmail || smtpCfg.defaultSenderEmail || smtpCfg.smtpUser;
    var senderName = cmp.senderName || smtpCfg.defaultSenderName || "Carretão Auto Peças";
    var from = senderName + " <" + senderEmail + ">";
    var replyTo = cmp.replyTo || smtpCfg.defaultReplyTo || undefined;

    var totalSent = 0;
    var totalFailed = 0;
    var errors: string[] = [];

    // Send emails in batches of 3 (SMTP is slower than API, smaller batches)
    var batchSize = 3;
    for (var batchStart = 0; batchStart < subs.length; batchStart += batchSize) {
      var batch = subs.slice(batchStart, batchStart + batchSize);
      var promises = [];
      for (var j = 0; j < batch.length; j++) {
        var sub = batch[j];
        // Personalize HTML: replace {{nome}} and {{email}}
        var personalHtml = htmlBody
          .replace(/\{\{nome\}\}/g, sub.name || "")
          .replace(/\{\{email\}\}/g, sub.email || "");

        promises.push(
          _sendSmtpEmail(smtpCfg, {
            from: from,
            to: sub.email,
            subject: cmp.subject,
            html: personalHtml,
            replyTo: replyTo,
          }).then(function () {
            totalSent++;
          }).catch(function (err: any) {
            totalFailed++;
            errors.push(sub.email + ": " + String(err.message || err));
          })
        );
      }
      await Promise.allSettled(promises);
      // Small delay between batches to respect SMTP rate limits
      if (batchStart + batchSize < subs.length) {
        await new Promise(function (r) { setTimeout(r, 1000); });
      }
    }

    // Update campaign status
    cmp.status = "sent";
    cmp.totalSent = totalSent;
    cmp.totalFailed = totalFailed;
    cmp.sentAt = Date.now();
    cmp.updatedAt = Date.now();
    await kv.set("emkt_cmp:" + id, JSON.stringify(cmp));

    // Save send log
    var logId = "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    var logEntry = {
      id: logId,
      campaignId: id,
      campaignName: cmp.name,
      subject: cmp.subject,
      totalRecipients: subs.length,
      totalSent: totalSent,
      totalFailed: totalFailed,
      errors: errors.slice(0, 50),
      sentAt: cmp.sentAt
    };
    await kv.set("emkt_log:" + logId, JSON.stringify(logEntry));

    console.log("[EmailMarketing] Campaign sent via SMTP: id=" + id + " sent=" + totalSent + " failed=" + totalFailed + " total=" + subs.length);
    return c.json({ ok: true, totalSent: totalSent, totalFailed: totalFailed, totalRecipients: subs.length, errors: errors.slice(0, 10) });
  } catch (e: any) {
    console.log("[EmailMarketing] Send campaign error:", e);
    // Try to reset status to draft on failure
    try {
      var rawR = await kv.get("emkt_cmp:" + id);
      if (rawR) {
        var cmpR = typeof rawR === "string" ? JSON.parse(rawR) : rawR;
        if (cmpR.status === "sending") {
          cmpR.status = "draft";
          cmpR.updatedAt = Date.now();
          await kv.set("emkt_cmp:" + id, JSON.stringify(cmpR));
        }
      }
    } catch { /* best effort */ }
    return c.json({ error: "Erro ao enviar campanha." }, 500);
  }
});

// POST /admin/email-marketing/campaigns/:id/duplicate — duplicate a campaign
app.post(BASE + "/admin/email-marketing/campaigns/:id/duplicate", async (c) => {
  try {
    var id = (c.req.param("id") || "").substring(0, 100);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    var raw = await kv.get("emkt_cmp:" + id);
    if (!raw) return c.json({ error: "Campanha não encontrada" }, 404);
    var orig = typeof raw === "string" ? JSON.parse(raw) : raw;
    var now = Date.now();
    var newId = "cmp_" + now + "_" + Math.random().toString(36).substring(2, 8);
    var dup = {
      id: newId,
      name: orig.name + " (copia)",
      subject: orig.subject || "",
      templateId: orig.templateId || null,
      htmlBody: orig.htmlBody || "",
      senderName: orig.senderName || "",
      senderEmail: orig.senderEmail || "",
      replyTo: orig.replyTo || "",
      targetTags: orig.targetTags || [],
      status: "draft",
      totalSent: 0,
      totalFailed: 0,
      sentAt: null,
      createdAt: now,
      updatedAt: now
    };
    await kv.set("emkt_cmp:" + newId, JSON.stringify(dup));
    console.log("[EmailMarketing] Campaign duplicated: " + id + " -> " + newId);
    return c.json({ ok: true, campaign: dup });
  } catch (e: any) {
    console.log("[EmailMarketing] Duplicate campaign error:", e);
    return c.json({ error: "Erro ao duplicar." }, 500);
  }
});

// --- Send History ---

// GET /admin/email-marketing/send-logs — list send logs
app.get(BASE + "/admin/email-marketing/send-logs", async (c) => {
  try {
    var raws = await kv.getByPrefix("emkt_log:");
    var logs: any[] = [];
    for (var i = 0; i < raws.length; i++) {
      try {
        var item = typeof raws[i] === "string" ? JSON.parse(raws[i]) : raws[i];
        if (item && item.id) logs.push(item);
      } catch { /* skip */ }
    }
    logs.sort(function (a: any, b: any) { return (b.sentAt || 0) - (a.sentAt || 0); });
    return c.json({ logs: logs });
  } catch (e: any) {
    console.log("[EmailMarketing] List logs error:", e);
    return c.json({ error: "Erro ao listar historico." }, 500);
  }
});

// DELETE /admin/email-marketing/send-logs/:id — delete a send log
app.delete(BASE + "/admin/email-marketing/send-logs/:id", async (c) => {
  try {
    var id = (c.req.param("id") || "").substring(0, 100);
    if (!id) return c.json({ error: "ID invalido." }, 400);
    await kv.del("emkt_log:" + id);
    return c.json({ ok: true, deleted: id });
  } catch (e: any) {
    console.log("[EmailMarketing] Delete log error:", e);
    return c.json({ error: "Erro ao deletar log." }, 500);
  }
});

// GET /admin/email-marketing/config — get email marketing config (SMTP)
app.get(BASE + "/admin/email-marketing/config", async (c) => {
  try {
    var raw = await kv.get("emkt_config");
    var config = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};

    var hasSmtp = Boolean(config.smtpHost && config.smtpPort && config.smtpUser && config.smtpPass);

    return c.json({
      smtpConfigured: hasSmtp,
      smtpHost: config.smtpHost || "",
      smtpPort: config.smtpPort || 587,
      smtpUser: config.smtpUser || "",
      smtpHasPassword: Boolean(config.smtpPass),
      smtpSecure: Boolean(config.smtpSecure),
      defaultSenderName: config.defaultSenderName || "Carretão Auto Peças",
      defaultSenderEmail: config.defaultSenderEmail || "",
      defaultReplyTo: config.defaultReplyTo || ""
    });
  } catch (e: any) {
    console.log("[EmailMarketing] Get config error:", e);
    return c.json({ error: "Erro ao buscar config." }, 500);
  }
});

// PUT /admin/email-marketing/config — update email marketing config (SMTP + defaults)
app.put(BASE + "/admin/email-marketing/config", async (c) => {
  try {
    var body = await c.req.json();
    // Input validation for SMTP config
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    var smtpValid = validate(body, {
      smtpHost: { type: "string", maxLen: 253 },
      smtpUser: { type: "string", maxLen: 254 },
      smtpPass: { type: "string", maxLen: 500, sanitize: false },
      smtpSecure: { type: "boolean" },
      defaultSenderName: { type: "string", maxLen: 200 },
      defaultSenderEmail: { type: "string", maxLen: 254 },
      defaultReplyTo: { type: "string", maxLen: 254 },
    });
    if (!smtpValid.ok) return c.json({ error: smtpValid.errors[0] || "Dados invalidos." }, 400);

    // Load existing config so partial updates don't lose fields
    var rawExisting = await kv.get("emkt_config");
    var config: any = rawExisting ? (typeof rawExisting === "string" ? JSON.parse(rawExisting) : rawExisting) : {};

    // SMTP settings
    if (body.smtpHost !== undefined) config.smtpHost = String(body.smtpHost).trim();
    if (body.smtpPort !== undefined) config.smtpPort = Number(body.smtpPort) || 587;
    if (body.smtpUser !== undefined) config.smtpUser = String(body.smtpUser).trim();
    if (body.smtpPass !== undefined && String(body.smtpPass).trim()) config.smtpPass = String(body.smtpPass).trim();
    if (body.smtpSecure !== undefined) config.smtpSecure = Boolean(body.smtpSecure);

    // Default sender settings
    if (body.defaultSenderName !== undefined) config.defaultSenderName = String(body.defaultSenderName).trim();
    if (body.defaultSenderEmail !== undefined) config.defaultSenderEmail = String(body.defaultSenderEmail).trim();
    if (body.defaultReplyTo !== undefined) config.defaultReplyTo = String(body.defaultReplyTo).trim();

    config.updatedAt = Date.now();
    await kv.set("emkt_config", JSON.stringify(config));

    console.log("[EmailMarketing] Config updated: host=" + (config.smtpHost || "none") + " port=" + (config.smtpPort || "none"));
    return c.json({ ok: true, config: {
      smtpHost: config.smtpHost || "",
      smtpPort: config.smtpPort || 587,
      smtpUser: config.smtpUser || "",
      smtpSecure: Boolean(config.smtpSecure),
      smtpHasPassword: Boolean(config.smtpPass),
      defaultSenderName: config.defaultSenderName || "",
      defaultSenderEmail: config.defaultSenderEmail || "",
      defaultReplyTo: config.defaultReplyTo || "",
    }});
  } catch (e: any) {
    console.log("[EmailMarketing] Update config error:", e);
    return c.json({ error: "Erro ao salvar config." }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SITEMAP.XML + ROBOTS.TXT (SEO) ──
// ═══════════════════════════════════════

app.get(BASE + "/robots.txt", async (c) => {
  try {
    var siteUrl = "";
    try {
      var rawSettings = await kv.get("site_settings");
      if (rawSettings) {
        var parsed = typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
        if (parsed.siteUrl) siteUrl = parsed.siteUrl;
      }
    } catch (_e) { /* ignore */ }
    if (!siteUrl) siteUrl = "https://www.carretaoautopecas.com.br";
    var sitemapUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/make-server-b7b07654/sitemap.xml";
    var body = "User-agent: *\n";
    body += "Allow: /\n";
    body += "Disallow: /admin\n";
    body += "Disallow: /admin/\n";
    body += "Disallow: /seed\n";
    body += "Disallow: /minha-conta\n";
    body += "Disallow: /checkout\n";
    body += "Disallow: /conta/redefinir-senha\n";
    body += "\n";
    body += "Sitemap: " + sitemapUrl + "\n";
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.log("[robots.txt] Error:", e);
    return new Response("User-agent: *\nAllow: /\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" },
    });
  }
});

app.get(BASE + "/sitemap.xml", async (c) => {
  try {
    var supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    var supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    var siteUrl = "https://www.carretaoautopecas.com.br";
    try {
      var rawSettings = await kv.get("site_settings");
      if (rawSettings) {
        var parsed = typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
        if (parsed.siteUrl) siteUrl = parsed.siteUrl;
      }
    } catch (_e) { /* ignore */ }
    var today = new Date().toISOString().split("T")[0];

    // Static pages
    var staticPages = [
      { loc: "/", priority: "1.0", changefreq: "daily" },
      { loc: "/catalogo", priority: "0.9", changefreq: "daily" },
      { loc: "/contato", priority: "0.6", changefreq: "monthly" },
      { loc: "/sobre", priority: "0.5", changefreq: "monthly" },
      { loc: "/politica-de-privacidade", priority: "0.3", changefreq: "yearly" },
      { loc: "/termos-de-uso", priority: "0.3", changefreq: "yearly" },
    ];

    // Category pages
    var categoryTree: any[] = [];
    try {
      var rawTree = await kv.get("category_tree");
      if (rawTree) categoryTree = typeof rawTree === "string" ? JSON.parse(rawTree) : rawTree;
    } catch (_e) { /* ignore */ }

    function collectCategorySlugs(nodes: any[]): string[] {
      var slugs: string[] = [];
      for (var n = 0; n < nodes.length; n++) {
        if (nodes[n].slug) slugs.push(nodes[n].slug);
        if (nodes[n].children && nodes[n].children.length > 0) {
          var childSlugs = collectCategorySlugs(nodes[n].children);
          for (var cs = 0; cs < childSlugs.length; cs++) slugs.push(childSlugs[cs]);
        }
      }
      return slugs;
    }
    var categorySlugs = collectCategorySlugs(categoryTree);

    // Product SKUs (all visible products)
    var productSkus: string[] = [];
    try {
      var prodResp = await fetch(supabaseUrl + "/rest/v1/produtos?select=sku&order=sku.asc&limit=5000", {
        headers: {
          apikey: supabaseKey,
          Authorization: "Bearer " + supabaseKey,
          "Content-Type": "application/json",
        },
      });
      if (prodResp.ok) {
        var prodData = await prodResp.json();
        // Filter out invisible products
        var allMetas = await getAllProductMetas();
        for (var pi = 0; pi < prodData.length; pi++) {
          var _sku = prodData[pi].sku;
          var _meta = allMetas.get(_sku);
          if (_meta && _meta.visible === false) continue;
          productSkus.push(_sku);
        }
      }
    } catch (_e) {
      console.log("[sitemap] Error fetching products:", _e);
    }

    // Build XML
    var xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    xml += "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";

    // Static pages
    for (var sp = 0; sp < staticPages.length; sp++) {
      xml += "  <url>\n";
      xml += "    <loc>" + siteUrl + staticPages[sp].loc + "</loc>\n";
      xml += "    <lastmod>" + today + "</lastmod>\n";
      xml += "    <changefreq>" + staticPages[sp].changefreq + "</changefreq>\n";
      xml += "    <priority>" + staticPages[sp].priority + "</priority>\n";
      xml += "  </url>\n";
    }

    // Category pages
    for (var ci = 0; ci < categorySlugs.length; ci++) {
      xml += "  <url>\n";
      xml += "    <loc>" + siteUrl + "/catalogo?categoria=" + encodeURIComponent(categorySlugs[ci]) + "</loc>\n";
      xml += "    <lastmod>" + today + "</lastmod>\n";
      xml += "    <changefreq>weekly</changefreq>\n";
      xml += "    <priority>0.7</priority>\n";
      xml += "  </url>\n";
    }

    // Product pages
    for (var pk = 0; pk < productSkus.length; pk++) {
      xml += "  <url>\n";
      xml += "    <loc>" + siteUrl + "/produto/" + encodeURIComponent(productSkus[pk]) + "</loc>\n";
      xml += "    <lastmod>" + today + "</lastmod>\n";
      xml += "    <changefreq>weekly</changefreq>\n";
      xml += "    <priority>0.8</priority>\n";
      xml += "  </url>\n";
    }

    xml += "</urlset>\n";

    console.log("[sitemap.xml] Generated: " + staticPages.length + " static + " + categorySlugs.length + " categories + " + productSkus.length + " products");

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.log("[sitemap.xml] Error:", e);
    return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"></urlset>", {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8", "Access-Control-Allow-Origin": "*" },
    });
  }
});

// ════════════════════════════���══════════════════════════════════════════
// ADMIN PENDING COUNTS — lightweight badge counters for admin sidebar
// ═══════════════════════════════════════════════════════════════════════

app.get(BASE + "/admin/pending-counts", async (c: any) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var startMs = Date.now();

    // Run all 3 counts in parallel
    var results = await Promise.allSettled([
      // 1. Orders: count "paid" (needs SIGE registration) + "awaiting_payment"
      (async function () {
        try {
          var orderEntries = await kv.getByPrefix("user_order:");
          var paidCount = 0;
          var awaitingCount = 0;
          for (var oi = 0; oi < orderEntries.length; oi++) {
            try {
              var oe = orderEntries[oi];
              var od = typeof oe === "string" ? JSON.parse(oe) : oe;
              if (!od) continue;
              var st = od.status || "awaiting_payment";
              if (st === "paid") paidCount++;
              else if (st === "awaiting_payment") awaitingCount++;
            } catch (_e) { /* skip */ }
          }
          return { paid: paidCount, awaiting: awaitingCount, total: paidCount + awaitingCount };
        } catch (e) {
          console.log("[pending-counts] orders error: " + String(e));
          return { paid: 0, awaiting: 0, total: 0 };
        }
      })(),

      // 2. Reviews: count pending moderation
      (async function () {
        try {
          var raw = await kv.get("reviews_pending");
          if (!raw) return 0;
          var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          return Array.isArray(parsed) ? parsed.length : 0;
        } catch (e) {
          console.log("[pending-counts] reviews error: " + String(e));
          return 0;
        }
      })(),

      // 3. LGPD: count pending + in_progress requests
      (async function () {
        try {
          var rawIdx = await kv.get("lgpd_req_index");
          if (!rawIdx) return 0;
          var idx: string[] = [];
          try { idx = typeof rawIdx === "string" ? JSON.parse(rawIdx) : rawIdx; } catch (_e2) { return 0; }
          if (!Array.isArray(idx) || idx.length === 0) return 0;
          var reqKeys: string[] = [];
          for (var li = 0; li < idx.length; li++) reqKeys.push("lgpd_req:" + idx[li]);
          var reqs = await kv.mget(reqKeys);
          var pendingCount = 0;
          for (var lj = 0; lj < reqs.length; lj++) {
            if (!reqs[lj]) continue;
            var req = typeof reqs[lj] === "string" ? JSON.parse(reqs[lj] as string) : reqs[lj];
            if (req.status === "pending" || req.status === "in_progress") pendingCount++;
          }
          return pendingCount;
        } catch (e) {
          console.log("[pending-counts] lgpd error: " + String(e));
          return 0;
        }
      })(),

      // 4. Affiliates: count pending registrations
      (async function () {
        try {
          var ids = await _getAllAffiliateIds();
          var pCount = 0;
          for (var ai = 0; ai < ids.length; ai++) {
            var aff = await _getAffiliateById(ids[ai]);
            if (aff && aff.status === "pending") pCount++;
          }
          return pCount;
        } catch (e) {
          console.log("[pending-counts] affiliates error: " + String(e));
          return 0;
        }
      })(),
    ]);

    var orderCounts = results[0].status === "fulfilled" ? results[0].value : { paid: 0, awaiting: 0, total: 0 };
    var reviewCount = results[1].status === "fulfilled" ? results[1].value : 0;
    var lgpdCount = results[2].status === "fulfilled" ? results[2].value : 0;
    var affiliateCount = results[3] && results[3].status === "fulfilled" ? results[3].value : 0;

    var elapsed = Date.now() - startMs;
    console.log("[pending-counts] orders=" + (orderCounts as any).total + " reviews=" + reviewCount + " lgpd=" + lgpdCount + " affiliates=" + affiliateCount + " (" + elapsed + "ms)");

    return c.json({
      orders: orderCounts,
      reviews: reviewCount,
      lgpd: lgpdCount,
      affiliates: affiliateCount,
    });
  } catch (e: any) {
    console.log("[pending-counts] Exception: " + String(e));
    return c.json({ error: "Erro interno do servidor." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD — aggregated metrics
// ═══════════════════════════════════════════════════════════════════════

app.get(BASE + "/admin/dashboard-stats", async (c: any) => {
  try {
    // 1. Fetch all orders from KV
    var orderEntries = await kv.getByPrefix("user_order:");
    var totalOrders = 0;
    var totalRevenue = 0;
    var statusCounts: Record<string, number> = {};
    var recentOrders: any[] = [];
    var monthlySales: Record<string, number> = {};
    var monthlyRevenue: Record<string, number> = {};

    for (var oi = 0; oi < orderEntries.length; oi++) {
      try {
        var oe = orderEntries[oi];
        var od = typeof oe.value === "string" ? JSON.parse(oe.value) : oe.value;
        if (!od) continue;
        // Each user_order: key may contain an array of orders
        var orders = Array.isArray(od) ? od : [od];
        for (var oj = 0; oj < orders.length; oj++) {
          var order = orders[oj];
          totalOrders++;
          var orderTotal = Number(order.total) || 0;
          totalRevenue += orderTotal;
          var st = order.status || "pending";
          statusCounts[st] = (statusCounts[st] || 0) + 1;

          // Monthly aggregation
          if (order.createdAt) {
            var d = new Date(order.createdAt);
            var monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
            monthlySales[monthKey] = (monthlySales[monthKey] || 0) + 1;
            monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + orderTotal;
          }

          recentOrders.push({
            localOrderId: order.localOrderId || "",
            total: orderTotal,
            status: st,
            paymentMethod: order.paymentMethod || "",
            createdAt: order.createdAt || "",
            itemCount: order.items ? order.items.length : 0,
            userName: order.shippingAddress ? order.shippingAddress.name : "",
          });
        }
      } catch (parseErr) {
        // skip malformed entries
      }
    }

    // Sort recent orders by date desc, take top 10
    recentOrders.sort(function (a, b) {
      return (new Date(b.createdAt)).getTime() - (new Date(a.createdAt)).getTime();
    });
    recentOrders = recentOrders.slice(0, 10);

    // 2. Product count from Supabase
    var prodCount = 0;
    var prodActive = 0;
    try {
      var prodResult = await supabaseAdmin.from("produtos").select("id, ativo", { count: "exact", head: false }).limit(10000);
      prodCount = prodResult.count || 0;
      if (prodResult.data) {
        for (var pi = 0; pi < prodResult.data.length; pi++) {
          if (prodResult.data[pi].ativo !== false) prodActive++;
        }
      }
    } catch (pe) {
      console.log("[dashboard] product count error: " + pe);
    }

    // 3. Client count from Supabase auth
    var clientCount = 0;
    try {
      var profileEntries = await kv.getByPrefix("user_profile:");
      clientCount = profileEntries.length;
    } catch (ce) {
      console.log("[dashboard] client count error: " + ce);
    }

    // 4. Coupon count
    var couponCount = 0;
    try {
      var couponEntries = await kv.getByPrefix("coupon:");
      couponCount = couponEntries.length;
    } catch (cpe) { /* ignore */ }

    // Monthly chart data (last 6 months)
    var chartData: Array<{ month: string; orders: number; revenue: number }> = [];
    var now = new Date();
    for (var mi = 5; mi >= 0; mi--) {
      var md = new Date(now.getFullYear(), now.getMonth() - mi, 1);
      var mk = md.getFullYear() + "-" + String(md.getMonth() + 1).padStart(2, "0");
      var monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      chartData.push({
        month: monthNames[md.getMonth()] + "/" + String(md.getFullYear()).substring(2),
        orders: monthlySales[mk] || 0,
        revenue: monthlyRevenue[mk] || 0,
      });
    }

    var avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return c.json({
      totalOrders: totalOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      totalProducts: prodCount,
      activeProducts: prodActive,
      totalClients: clientCount,
      totalCoupons: couponCount,
      statusCounts: statusCounts,
      recentOrders: recentOrders,
      chartData: chartData,
    });
  } catch (e) {
    console.log("[admin/dashboard-stats] Error: " + e);
    return c.json({ error: "Erro ao buscar estatisticas do dashboard." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CUPONS DE DESCONTO — CRUD + validation
// KV prefix: coupon:<code>
// ═══════════════════════════════════════════════════════════════════════

// List all coupons
app.get(BASE + "/admin/coupons", async (c: any) => {
  try {
    var entries = await kv.getByPrefix("coupon:");
    var coupons: any[] = [];
    for (var i = 0; i < entries.length; i++) {
      try {
        var val = typeof entries[i].value === "string" ? JSON.parse(entries[i].value) : entries[i].value;
        if (val) coupons.push(val);
      } catch (e) { /* skip */ }
    }
    coupons.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return c.json({ coupons: coupons });
  } catch (e) {
    console.log("[admin/coupons] List error: " + e);
    return c.json({ error: "Erro ao listar cupons." }, 500);
  }
});

// Create coupon
app.post(BASE + "/admin/coupons", async (c: any) => {
  try {
    var body = await c.req.json();
    // Input validation for coupon create
    var couponValid = validate(body, {
      code: { required: true, type: "string", minLen: 3, maxLen: 50 },
      description: { type: "string", maxLen: 500 },
      discountType: { type: "string", maxLen: 20, oneOf: ["percentage", "fixed"] },
      discountValue: { type: "number", min: 0, max: 99999999 },
      minOrderValue: { type: "number", min: 0, max: 99999999 },
      maxUses: { type: "number", min: 0, max: 99999999 },
      active: { type: "boolean" },
      expiresAt: { type: "string", maxLen: 30 },
    });
    if (!couponValid.ok) return c.json({ error: couponValid.errors[0] || "Dados invalidos." }, 400);
    var code = String(body.code || "").toUpperCase().trim().replace(/[^A-Z0-9_-]/g, "");
    if (!code || code.length < 3) {
      return c.json({ error: "Código do cupom deve ter no mínimo 3 caracteres (letras, números, - e _)" }, 400);
    }
    // Check if code already exists
    var existing = await kv.get("coupon:" + code);
    if (existing) {
      return c.json({ error: "Cupom com este código já existe: " + code }, 409);
    }
    var coupon = {
      code: code,
      description: sanitizeInput(String(body.description || "")),
      discountType: body.discountType === "fixed" ? "fixed" : "percentage",
      discountValue: Math.max(0, Number(body.discountValue) || 0),
      minOrderValue: Math.max(0, Number(body.minOrderValue) || 0),
      maxUses: Math.max(0, Math.floor(Number(body.maxUses) || 0)),
      usedCount: 0,
      active: body.active !== false,
      expiresAt: body.expiresAt ? String(body.expiresAt) : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await kv.set("coupon:" + code, JSON.stringify(coupon));
    console.log("[admin/coupons] Created coupon: " + code);
    return c.json({ ok: true, coupon: coupon });
  } catch (e) {
    console.log("[admin/coupons] Create error: " + e);
    return c.json({ error: "Erro ao criar cupom." }, 500);
  }
});

// Update coupon
app.put(BASE + "/admin/coupons/:code", async (c: any) => {
  try {
    var code = String(c.req.param("code") || "").toUpperCase().trim().substring(0, 50);
    if (!code) return c.json({ error: "Codigo invalido." }, 400);
    var existing = await kv.get("coupon:" + code);
    if (!existing) {
      console.log("[coupons] Coupon not found: " + code);
      return c.json({ error: "Cupom nao encontrado." }, 404);
    }
    var current = typeof existing === "string" ? JSON.parse(existing) : existing;
    var body = await c.req.json();
    // Input validation for coupon update
    var couponUpValid = validate(body, {
      description: { type: "string", maxLen: 500 },
      discountType: { type: "string", maxLen: 20, oneOf: ["percentage", "fixed"] },
      discountValue: { type: "number", min: 0, max: 99999999 },
      minOrderValue: { type: "number", min: 0, max: 99999999 },
      maxUses: { type: "number", min: 0, max: 99999999 },
      active: { type: "boolean" },
      expiresAt: { type: "string", maxLen: 30 },
    });
    if (!couponUpValid.ok) return c.json({ error: couponUpValid.errors[0] || "Dados invalidos." }, 400);
    if (body.description !== undefined) current.description = sanitizeInput(String(body.description));
    if (body.discountType !== undefined) current.discountType = body.discountType === "fixed" ? "fixed" : "percentage";
    if (body.discountValue !== undefined) current.discountValue = Math.max(0, Number(body.discountValue) || 0);
    if (body.minOrderValue !== undefined) current.minOrderValue = Math.max(0, Number(body.minOrderValue) || 0);
    if (body.maxUses !== undefined) current.maxUses = Math.max(0, Math.floor(Number(body.maxUses) || 0));
    if (body.active !== undefined) current.active = !!body.active;
    if (body.expiresAt !== undefined) current.expiresAt = body.expiresAt ? String(body.expiresAt) : null;
    current.updatedAt = Date.now();
    await kv.set("coupon:" + code, JSON.stringify(current));
    console.log("[admin/coupons] Updated coupon: " + code);
    return c.json({ ok: true, coupon: current });
  } catch (e) {
    console.log("[admin/coupons] Update error: " + e);
    return c.json({ error: "Erro ao atualizar cupom." }, 500);
  }
});

// Delete coupon
app.delete(BASE + "/admin/coupons/:code", async (c: any) => {
  try {
    var code = String(c.req.param("code") || "").toUpperCase().trim().substring(0, 50);
    if (!code) return c.json({ error: "Codigo invalido." }, 400);
    await kv.del("coupon:" + code);
    console.log("[admin/coupons] Deleted coupon: " + code);
    return c.json({ ok: true, deleted: code });
  } catch (e) {
    console.log("[admin/coupons] Delete error: " + e);
    return c.json({ error: "Erro ao excluir cupom." }, 500);
  }
});

// ── Public: Validate coupon ──
app.post(BASE + "/coupons/validate", async (c: any) => {
  try {
    // Rate limit coupon validation: 30/min per IP
    var rlKey = _getRateLimitKey(c, "coupon_validate");
    var rlResult = _checkRateLimit(rlKey, 30);
    if (!rlResult.allowed) {
      return _rl429(c, "Too many attempts. Try again shortly.", rlResult);
    }

    var body = await c.req.json();
    // Input validation
    var cvValid = validateOrError(body, schemas.couponValidate);
    if (!cvValid.valid) {
      return c.json({ valid: false, error: cvValid.errors[0] || "Dados invalidos." });
    }
    var code = String(cvValid.data.code || "").toUpperCase().trim();
    var orderTotal = Number(cvValid.data.orderTotal) || 0;
    if (!code) {
      return c.json({ valid: false, error: "Informe o código do cupom" });
    }
    var raw = await kv.get("coupon:" + code);
    if (!raw) {
      return c.json({ valid: false, error: "Cupom não encontrado" });
    }
    var coupon = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!coupon.active) {
      return c.json({ valid: false, error: "Cupom inativo" });
    }
    if (coupon.expiresAt) {
      var expDate = new Date(coupon.expiresAt);
      if (expDate.getTime() < Date.now()) {
        return c.json({ valid: false, error: "Cupom expirado" });
      }
    }
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return c.json({ valid: false, error: "Cupom esgotado" });
    }
    if (coupon.minOrderValue > 0 && orderTotal < coupon.minOrderValue) {
      return c.json({
        valid: false,
        error: "Valor mínimo do pedido: R$ " + coupon.minOrderValue.toFixed(2).replace(".", ","),
      });
    }
    // Calculate discount
    var discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = Math.round(orderTotal * (coupon.discountValue / 100) * 100) / 100;
    } else {
      discountAmount = Math.min(coupon.discountValue, orderTotal);
    }
    return c.json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: discountAmount,
      description: coupon.description || "",
    });
  } catch (e) {
    console.log("[coupons/validate] Error: " + e);
    return c.json({ valid: false, error: "Erro ao validar cupom" }, 500);
  }
});

// ── Public: Use coupon (increment usedCount) ──
app.post(BASE + "/coupons/use", async (c: any) => {
  try {
    // Require authentication — only logged-in users can consume coupon uses
    var couponUserId = await getAuthUserId(c.req.raw);
    if (!couponUserId) return c.json({ ok: false, error: "Auth required" }, 401);
    // Rate limit: 10/min per IP to prevent abuse
    var couponUseRl = _getRateLimitKey(c, "coupon_use");
    var couponUseRlResult = _checkRateLimit(couponUseRl, 10);
    if (!couponUseRlResult.allowed) return _rl429(c, "Too many requests", couponUseRlResult);
    var body = await c.req.json();
    // Input validation
    var cuValid = validateOrError(body, schemas.couponUse);
    if (!cuValid.valid) {
      return c.json({ ok: false, error: cuValid.errors[0] || "Dados invalidos." });
    }
    var code = String(cuValid.data.code || "").toUpperCase().trim();
    if (!code) return c.json({ ok: false });
    var raw = await kv.get("coupon:" + code);
    if (!raw) return c.json({ ok: false });
    var coupon = typeof raw === "string" ? JSON.parse(raw) : raw;

    // SECURITY: Re-check maxUses before incrementing (mitigate race condition)
    if (coupon.maxUses > 0 && (coupon.usedCount || 0) >= coupon.maxUses) {
      return c.json({ ok: false, error: "Cupom esgotado." });
    }
    if (!coupon.active) {
      return c.json({ ok: false, error: "Cupom inativo." });
    }

    // SECURITY: Per-user usage tracking — prevent same user from using coupon multiple times
    var usedByList = Array.isArray(coupon.usedBy) ? coupon.usedBy : [];
    if (usedByList.indexOf(couponUserId) !== -1) {
      return c.json({ ok: false, error: "Você já utilizou este cupom." });
    }
    usedByList.push(couponUserId);
    coupon.usedBy = usedByList;

    coupon.usedCount = (coupon.usedCount || 0) + 1;
    coupon.updatedAt = Date.now();
    await kv.set("coupon:" + code, JSON.stringify(coupon));
    console.log("[coupons/use] Coupon used: " + code + " by userId=" + couponUserId + " (count: " + coupon.usedCount + ")");
    return c.json({ ok: true, usedCount: coupon.usedCount });
  } catch (e) {
    console.log("[coupons/use] Error: " + e);
    return c.json({ ok: false, error: "Erro ao aplicar cupom." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ─── LGPD — Exercicio de Direitos do Titular ───
// ═══════════════════════════════════════════════════════════════════════

var LGPD_REQ_PREFIX = "lgpd_req:";
var LGPD_REQ_INDEX = "lgpd_req_index";
var LGPD_DPO_EMAIL = "alexmeira@protonmail.com";

var LGPD_TYPE_LABELS: Record<string, string> = {
  "confirmacao": "Confirmação de tratamento de dados",
  "acesso": "Acesso aos dados",
  "correcao": "Correção de dados",
  "anonimizacao": "Anonimização ou bloqueio",
  "portabilidade": "Portabilidade dos dados",
  "eliminacao": "Eliminação dos dados",
  "revogacao": "Revogação de consentimento",
  "oposicao": "Oposição ao tratamento",
  "informacao_compartilhamento": "Informação sobre compartilhamento",
};

var LGPD_REQUEST_TYPES = [
  "confirmacao",
  "acesso",
  "correcao",
  "anonimizacao",
  "portabilidade",
  "eliminacao",
  "revogacao",
  "oposicao",
  "informacao_compartilhamento",
];

// --- LGPD email notification helpers ---
async function _sendLgpdDpoNotification(record: any) {
  try {
    var cfg = await _getSmtpConfig();
    if (!cfg) {
      console.log("[LGPD] SMTP not configured — skipping DPO notification email");
      return;
    }
    var typeLabel = LGPD_TYPE_LABELS[record.requestType] || record.requestType;
    var dateStr = new Date(record.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    var descSnippet = String(record.description || "").substring(0, 300);
    if (String(record.description || "").length > 300) {
      descSnippet = descSnippet + "...";
    }
    var cpfLine = record.cpf ? "<tr><td style=\"padding:6px 12px;color:#666;font-weight:600;\">CPF:</td><td style=\"padding:6px 12px;\">" + record.cpf + "</td></tr>" : "";
    var phoneLine = record.phone ? "<tr><td style=\"padding:6px 12px;color:#666;font-weight:600;\">Telefone:</td><td style=\"padding:6px 12px;\">" + record.phone + "</td></tr>" : "";
    var html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;\">"
      + "<div style=\"max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;\">"
      + "<div style=\"background:#dc2626;padding:24px 32px;\">"
      + "<h1 style=\"margin:0;color:#fff;font-size:20px;\">Nova Solicitação LGPD</h1>"
      + "<p style=\"margin:6px 0 0;color:#fecaca;font-size:13px;\">Carretão Auto Peças — Exercício de Direitos</p>"
      + "</div>"
      + "<div style=\"padding:24px 32px;\">"
      + "<div style=\"background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px;\">"
      + "<p style=\"margin:0;font-size:14px;color:#991b1b;\"><strong>Ação necessária:</strong> Responder em até 15 dias úteis conforme Art. 18, §5 da LGPD.</p>"
      + "</div>"
      + "<table style=\"width:100%;border-collapse:collapse;font-size:14px;\">"
      + "<tr><td style=\"padding:6px 12px;color:#666;font-weight:600;\">Protocolo:</td><td style=\"padding:6px 12px;font-weight:700;color:#dc2626;\">" + record.id + "</td></tr>"
      + "<tr style=\"background:#f9fafb;\"><td style=\"padding:6px 12px;color:#666;font-weight:600;\">Data:</td><td style=\"padding:6px 12px;\">" + dateStr + "</td></tr>"
      + "<tr><td style=\"padding:6px 12px;color:#666;font-weight:600;\">Tipo:</td><td style=\"padding:6px 12px;font-weight:600;color:#b91c1c;\">" + typeLabel + "</td></tr>"
      + "<tr style=\"background:#f9fafb;\"><td style=\"padding:6px 12px;color:#666;font-weight:600;\">Nome:</td><td style=\"padding:6px 12px;\">" + record.fullName + "</td></tr>"
      + "<tr><td style=\"padding:6px 12px;color:#666;font-weight:600;\">Email:</td><td style=\"padding:6px 12px;\"><a href=\"mailto:" + record.email + "\" style=\"color:#dc2626;\">" + record.email + "</a></td></tr>"
      + cpfLine
      + phoneLine
      + "</table>"
      + "<div style=\"margin-top:20px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e4e4e7;\">"
      + "<p style=\"margin:0 0 8px;font-weight:600;font-size:13px;color:#666;\">Descrição da solicitação:</p>"
      + "<p style=\"margin:0;font-size:14px;color:#18181b;line-height:1.6;\">" + descSnippet + "</p>"
      + "</div>"
      + "<div style=\"margin-top:24px;text-align:center;\">"
      + "<a href=\"https://carretaoautopecas.com.br/admin\" style=\"display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;\">Acessar Painel Admin</a>"
      + "</div>"
      + "</div>"
      + "<div style=\"padding:16px 32px;background:#f9fafb;border-top:1px solid #e4e4e7;text-align:center;\">"
      + "<p style=\"margin:0;font-size:12px;color:#a1a1aa;\">Este é um email automático. Não responda diretamente.</p>"
      + "</div>"
      + "</div></body></html>";

    var fromAddr = cfg.smtpFromName ? (cfg.smtpFromName + " <" + cfg.smtpUser + ">") : cfg.smtpUser;
    await _sendSmtpEmail(cfg, {
      from: fromAddr,
      to: LGPD_DPO_EMAIL,
      subject: "[LGPD] Nova solicitação: " + typeLabel + " — Protocolo " + record.id,
      html: html,
      replyTo: record.email,
    });
    console.log("[LGPD] DPO notification email sent to " + LGPD_DPO_EMAIL + " for request " + record.id);
  } catch (emailErr: any) {
    console.log("[LGPD] Failed to send DPO notification email: " + String(emailErr.message || emailErr));
  }
}

async function _sendLgpdConfirmationToRequester(record: any) {
  try {
    var cfg = await _getSmtpConfig();
    if (!cfg) {
      console.log("[LGPD] SMTP not configured — skipping confirmation email to requester");
      return;
    }
    var typeLabel = LGPD_TYPE_LABELS[record.requestType] || record.requestType;
    var html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;\">"
      + "<div style=\"max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;\">"
      + "<div style=\"background:#dc2626;padding:24px 32px;\">"
      + "<h1 style=\"margin:0;color:#fff;font-size:20px;\">Carretão Auto Peças</h1>"
      + "<p style=\"margin:6px 0 0;color:#fecaca;font-size:13px;\">Confirmação de Solicitação LGPD</p>"
      + "</div>"
      + "<div style=\"padding:24px 32px;\">"
      + "<p style=\"font-size:15px;color:#18181b;\">Olá <strong>" + record.fullName + "</strong>,</p>"
      + "<p style=\"font-size:14px;color:#3f3f46;line-height:1.6;\">Recebemos sua solicitação de <strong>" + typeLabel + "</strong> e ela está sendo analisada pela nossa equipe.</p>"
      + "<div style=\"background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;\">"
      + "<p style=\"margin:0 0 4px;font-size:13px;color:#166534;font-weight:600;\">Seu protocolo:</p>"
      + "<p style=\"margin:0;font-size:18px;color:#15803d;font-weight:700;font-family:monospace;\">" + record.id + "</p>"
      + "</div>"
      + "<p style=\"font-size:14px;color:#3f3f46;line-height:1.6;\">Conforme a Lei Geral de Proteção de Dados (LGPD), responderemos sua solicitação em até <strong>15 dias úteis</strong>.</p>"
      + "<p style=\"font-size:14px;color:#3f3f46;line-height:1.6;\">Você pode acompanhar o status da sua solicitação a qualquer momento acessando nosso <a href=\"https://carretaoautopecas.com.br/exercicio-de-direitos\" style=\"color:#dc2626;font-weight:600;\">formulário de exercício de direitos</a> e consultando pelo protocolo e email.</p>"
      + "<div style=\"margin-top:24px;padding-top:20px;border-top:1px solid #e4e4e7;\">"
      + "<p style=\"margin:0;font-size:13px;color:#a1a1aa;\">Caso tenha dúvidas, entre em contato pelo email <a href=\"mailto:privacidade@carretaoautopecas.com.br\" style=\"color:#dc2626;\">privacidade@carretaoautopecas.com.br</a> ou pelo telefone 0800 643 1170.</p>"
      + "</div>"
      + "</div>"
      + "<div style=\"padding:16px 32px;background:#f9fafb;border-top:1px solid #e4e4e7;text-align:center;\">"
      + "<p style=\"margin:0;font-size:12px;color:#a1a1aa;\">Carretão Auto Peças — Protegendo seus dados com transparência.</p>"
      + "</div>"
      + "</div></body></html>";

    var fromAddr = cfg.smtpFromName ? (cfg.smtpFromName + " <" + cfg.smtpUser + ">") : cfg.smtpUser;
    await _sendSmtpEmail(cfg, {
      from: fromAddr,
      to: record.email,
      subject: "Confirmação de solicitação LGPD — Protocolo " + record.id,
      html: html,
    });
    console.log("[LGPD] Confirmation email sent to requester " + record.email + " for request " + record.id);
  } catch (emailErr: any) {
    console.log("[LGPD] Failed to send confirmation email to requester: " + String(emailErr.message || emailErr));
  }
}

// Rate limit middleware for LGPD form
app.use(BASE + "/lgpd/request", async (c: any, next: any) => {
  if (c.req.method === "OPTIONS") return next();
  var rlKey = _getRateLimitKey(c, "lgpd_request");
  var rlResult = _checkRateLimit(rlKey, 5);
  if (!rlResult.allowed) {
    console.log("[RateLimit] BLOCKED lgpd request from " + rlKey);
    return _rl429(c, "Muitas solicitações. Tente novamente em " + Math.ceil(rlResult.retryAfterMs / 1000) + " segundos.", rlResult);
  }
  return next();
});

// POST /lgpd/request — public: submit a data subject rights request
app.post(BASE + "/lgpd/request", async (c) => {
  try {
    // Rate limit: 5 LGPD requests per minute per IP
    var lgpdRl = _getRateLimitKey(c, "lgpd_request");
    var lgpdRlResult = _checkRateLimit(lgpdRl, 5);
    if (!lgpdRlResult.allowed) return _rl429(c, "Muitas tentativas. Aguarde.", lgpdRlResult);
    var body = await c.req.json();
    // Input validation
    var lgpdValid = validate(body, {
      fullName: { required: true, type: "string", minLen: 3, maxLen: 200 },
      email: { required: true, type: "string", maxLen: 254, custom: validators.email },
      cpf: { type: "string", maxLen: 20 },
      phone: { type: "string", maxLen: 30 },
      requestType: { required: true, type: "string", maxLen: 50 },
      description: { required: true, type: "string", minLen: 10, maxLen: 5000 },
    });
    if (!lgpdValid.ok) {
      return c.json({ error: lgpdValid.errors[0] || "Dados invalidos." }, 400);
    }
    var fullName = lgpdValid.sanitized.fullName || "";
    var email = (lgpdValid.sanitized.email || "").toLowerCase();
    var cpf = sanitizeInput(String(body.cpf || "")).replace(/\D/g, "").trim();
    var phone = sanitizeInput(String(body.phone || "")).trim();
    var requestType = String(body.requestType || "").trim();
    var description = sanitizeInput(String(body.description || "")).trim();

    if (!fullName || fullName.length < 3) {
      return c.json({ error: "Nome completo é obrigatório (mínimo 3 caracteres)." }, 400);
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "Email válido é obrigatório." }, 400);
    }
    if (!requestType || LGPD_REQUEST_TYPES.indexOf(requestType) === -1) {
      return c.json({ error: "Tipo de solicitação inválido." }, 400);
    }
    if (!description || description.length < 10) {
      return c.json({ error: "Descrição é obrigatória (mínimo 10 caracteres)." }, 400);
    }
    if (description.length > 5000) {
      return c.json({ error: "Descricao excede o limite de 5000 caracteres." }, 400);
    }

    var id = "lgpd_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
    var now = Date.now();
    var record = {
      id: id,
      fullName: fullName,
      email: email,
      cpf: cpf || null,
      phone: phone || null,
      requestType: requestType,
      description: description,
      status: "pending",
      adminNotes: "",
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };

    await kv.set(LGPD_REQ_PREFIX + id, JSON.stringify(record));

    // Update index
    var rawIdx = await kv.get(LGPD_REQ_INDEX);
    var idx: string[] = [];
    if (rawIdx) {
      try { idx = typeof rawIdx === "string" ? JSON.parse(rawIdx) : rawIdx; } catch {}
    }
    idx.push(id);
    await kv.set(LGPD_REQ_INDEX, JSON.stringify(idx));

    console.log("[LGPD] New request: " + id + " | type=" + requestType + " | email=" + email);

    // Fire-and-forget: send email notifications (don't block the response)
    _sendLgpdDpoNotification(record).catch(function (err: any) {
      console.log("[LGPD] DPO notification fire-and-forget error: " + String(err));
    });
    _sendLgpdConfirmationToRequester(record).catch(function (err: any) {
      console.log("[LGPD] Requester confirmation fire-and-forget error: " + String(err));
    });

    return c.json({ ok: true, requestId: id, message: "Solicitação registrada com sucesso. Responderemos em até 15 dias úteis." });
  } catch (e) {
    console.log("[LGPD] Error creating request: " + e);
    return c.json({ error: "Erro interno ao registrar solicitacao." }, 500);
  }
});

// GET /lgpd/request/status — public: check request status by ID + email
app.get(BASE + "/lgpd/request/status", async (c) => {
  try {
    var requestId = String(c.req.query("id") || "").trim().substring(0, 100);
    var email = String(c.req.query("email") || "").trim().toLowerCase().substring(0, 254);

    if (!requestId || !email) {
      return c.json({ error: "Informe o ID da solicitação e o email." }, 400);
    }

    var raw = await kv.get(LGPD_REQ_PREFIX + requestId);
    if (!raw) {
      return c.json({ error: "Solicitação não encontrada." }, 404);
    }

    var record = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (record.email !== email) {
      return c.json({ error: "Solicitação não encontrada." }, 404);
    }

    return c.json({
      ok: true,
      request: {
        id: record.id,
        requestType: record.requestType,
        status: record.status,
        createdAt: record.createdAt,
        resolvedAt: record.resolvedAt,
      },
    });
  } catch (e) {
    console.log("[LGPD] Error checking status: " + e);
    return c.json({ error: "Erro ao consultar status." }, 500);
  }
});

// GET /admin/lgpd-requests — admin: list all LGPD requests
app.get(BASE + "/admin/lgpd-requests", async (c) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.userId) return c.json({ error: "Unauthorized" }, 401);
    if (!adminCheck.isAdmin) return c.json({ error: "Forbidden" }, 403);

    var rawIdx = await kv.get(LGPD_REQ_INDEX);
    var idx: string[] = [];
    if (rawIdx) {
      try { idx = typeof rawIdx === "string" ? JSON.parse(rawIdx) : rawIdx; } catch {}
    }

    if (idx.length === 0) {
      return c.json({ requests: [], total: 0 });
    }

    var keys = idx.map(function (id) { return LGPD_REQ_PREFIX + id; });
    var results = await kv.mget(keys);
    var requests: any[] = [];
    for (var i = 0; i < results.length; i++) {
      if (results[i]) {
        try {
          var parsed = typeof results[i] === "string" ? JSON.parse(results[i] as string) : results[i];
          requests.push(parsed);
        } catch {}
      }
    }

    requests.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    return c.json({ requests: requests, total: requests.length });
  } catch (e) {
    console.log("[LGPD Admin] Error listing requests: " + e);
    return c.json({ error: "Erro ao listar solicitacoes LGPD." }, 500);
  }
});

// PUT /admin/lgpd-requests/:id — admin: update request status/notes
app.put(BASE + "/admin/lgpd-requests/:id", async (c) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.userId) return c.json({ error: "Unauthorized" }, 401);
    if (!adminCheck.isAdmin) return c.json({ error: "Forbidden" }, 403);

    var reqId = (c.req.param("id") || "").substring(0, 200);
    if (!reqId) return c.json({ error: "ID invalido." }, 400);
    var raw = await kv.get(LGPD_REQ_PREFIX + reqId);
    if (!raw) return c.json({ error: "Solicitação não encontrada." }, 404);

    var record = typeof raw === "string" ? JSON.parse(raw) : raw;
    var body = await c.req.json();
    // Input validation for LGPD request update
    var lgpdUpValid = validate(body, {
      status: { type: "string", maxLen: 20, oneOf: ["pending", "in_progress", "completed", "rejected"] },
      adminNotes: { type: "string", maxLen: 5000 },
    });
    if (!lgpdUpValid.ok) return c.json({ error: lgpdUpValid.errors[0] || "Dados invalidos." }, 400);

    if (body.status) {
      var validStatuses = ["pending", "in_progress", "completed", "rejected"];
      if (validStatuses.indexOf(body.status) === -1) {
        return c.json({ error: "Status inválido." }, 400);
      }
      record.status = body.status;
      if (body.status === "completed" || body.status === "rejected") {
        record.resolvedAt = Date.now();
      }
    }
    if (body.adminNotes !== undefined) {
      record.adminNotes = sanitizeInput(String(body.adminNotes)).substring(0, 5000);
    }
    record.updatedAt = Date.now();

    await kv.set(LGPD_REQ_PREFIX + reqId, JSON.stringify(record));
    console.log("[LGPD Admin] Updated request " + reqId + " -> status=" + record.status);
    return c.json({ ok: true, request: record });
  } catch (e) {
    console.log("[LGPD Admin] Error updating request: " + e);
    return c.json({ error: "Erro ao atualizar solicitacao LGPD." }, 500);
  }
});

// DELETE /admin/lgpd-requests/:id — admin: delete request
app.delete(BASE + "/admin/lgpd-requests/:id", async (c) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.userId) return c.json({ error: "Unauthorized" }, 401);
    if (!adminCheck.isAdmin) return c.json({ error: "Forbidden" }, 403);

    var reqId = (c.req.param("id") || "").substring(0, 200);
    if (!reqId) return c.json({ error: "ID invalido." }, 400);
    await kv.del(LGPD_REQ_PREFIX + reqId);

    var rawIdx = await kv.get(LGPD_REQ_INDEX);
    var idx: string[] = [];
    if (rawIdx) {
      try { idx = typeof rawIdx === "string" ? JSON.parse(rawIdx) : rawIdx; } catch {}
    }
    idx = idx.filter(function (x) { return x !== reqId; });
    await kv.set(LGPD_REQ_INDEX, JSON.stringify(idx));

    console.log("[LGPD Admin] Deleted request " + reqId);
    return c.json({ ok: true, deleted: reqId });
  } catch (e) {
    console.log("[LGPD Admin] Error deleting request: " + e);
    return c.json({ error: "Erro ao excluir solicitacao LGPD." }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── BRANDS (Marcas) ─────────────────────────────────
// ═══════════════════════════════════════════════════════

// GET /brands — public, returns active brands sorted by order
app.get(BASE + "/brands", async (c) => {
  try {
    var allRaw = await kv.getByPrefix("brand:");
    var brands: any[] = [];
    for (var raw of allRaw) {
      try {
        var b = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (b && b.id && b.active !== false) brands.push(b);
      } catch { /* skip */ }
    }
    brands.sort(function(a: any, b: any) { return (a.order || 0) - (b.order || 0); });

    var signPromises = brands.map(function(brand: any) {
      if (!brand.filename) return Promise.resolve(null);
      return supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .createSignedUrl(brand.filename, 86400)
        .then(function(res: any) {
          if (res.data && res.data.signedUrl) {
            brand.logoUrl = res.data.signedUrl;
          }
          return null;
        })
        .catch(function() { return null; });
    });
    await Promise.allSettled(signPromises);

    return c.json({ brands: brands });
  } catch (e: any) {
    console.log("[brands] Error:", e);
    return c.json({ error: "Erro ao buscar marcas." }, 500);
  }
});

// GET /brands/:slug — public, returns brand info + product SKUs
app.get(BASE + "/brands/:slug", async (c) => {
  try {
    var slug = decodeURIComponent(c.req.param("slug") || "").trim().substring(0, 200);
    if (!slug) return c.json({ error: "Slug obrigatório." }, 400);

    var allRaw = await kv.getByPrefix("brand:");
    var found: any = null;
    for (var raw of allRaw) {
      try {
        var b = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (b && b.slug === slug && b.active !== false) {
          found = b;
          break;
        }
      } catch { /* skip */ }
    }

    if (!found) return c.json({ error: "Marca não encontrada." }, 404);

    if (found.filename) {
      try {
        var signRes = await supabaseAdmin.storage
          .from(ASSETS_BUCKET)
          .createSignedUrl(found.filename, 86400);
        if (signRes.data && signRes.data.signedUrl) {
          found.logoUrl = signRes.data.signedUrl;
        }
      } catch { /* keep stored url */ }
    }

    return c.json({ brand: found });
  } catch (e: any) {
    console.log("[brands/:slug] Error:", e);
    return c.json({ error: "Erro ao buscar marca." }, 500);
  }
});

// POST /admin/brands — create a new brand (upload logo + metadata)
app.post(BASE + "/admin/brands", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var formData = await c.req.formData();
    var file = formData.get("file") as File | null;
    var name = sanitizeInput(String(formData.get("name") || "")).substring(0, 200);
    var slug = sanitizeInput(String(formData.get("slug") || "")).substring(0, 200);
    var bgColor = sanitizeInput(String(formData.get("bgColor") || "#ffffff")).substring(0, 20);
    var orderStr = String(formData.get("order") || "0");
    var activeStr = String(formData.get("active") || "true");
    var productsJson = String(formData.get("products") || "[]").substring(0, 50000);
    var logoZoomStr = String(formData.get("logoZoom") || "1");

    if (!file) return c.json({ error: "Nenhum arquivo de logo enviado." }, 400);
    if (!name) return c.json({ error: "Nome da marca obrigatório." }, 400);
    if (!slug) {
      slug = name.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    var validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
    if (validTypes.indexOf(file.type) === -1) {
      return c.json({ error: "Tipo não permitido: " + file.type + ". Use AVIF, PNG, JPEG, WebP, GIF ou SVG." }, 400);
    }
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: "Arquivo muito grande. Máximo: 5MB." }, 400);
    }

    var products: any[] = [];
    try { products = JSON.parse(productsJson); } catch { products = []; }

    var brandId = crypto.randomUUID();
    var extMap: Record<string, string> = {
      "image/avif": "avif", "image/png": "png", "image/jpeg": "jpg",
      "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
    };
    var ext = extMap[file.type] || "png";
    var filename = "brand-" + brandId + "." + ext;
    var arrayBuffer = await file.arrayBuffer();

    var uploadResult = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .upload(filename, arrayBuffer, { contentType: file.type, upsert: true });

    if (uploadResult.error) {
      console.log("Brand upload error:", uploadResult.error.message);
      return c.json({ error: "Erro no upload da imagem." }, 500);
    }

    var supabaseUrl = Deno.env.get("SUPABASE_URL");
    var logoUrl = supabaseUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + filename;

    var brand = {
      id: brandId,
      name: name,
      slug: slug,
      logoUrl: logoUrl,
      filename: filename,
      bgColor: bgColor,
      logoZoom: parseFloat(logoZoomStr) || 1,
      products: products,
      order: parseInt(orderStr, 10) || 0,
      active: activeStr !== "false",
      contentType: file.type,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uploadedBy: userId,
    };

    await kv.set("brand:" + brandId, JSON.stringify(brand));
    console.log("Brand created: " + brandId + " name=" + name + " slug=" + slug);

    return c.json({ created: true, brand: brand });
  } catch (e: any) {
    console.log("Error creating brand:", e);
    return c.json({ error: "Erro ao criar marca." }, 500);
  }
});

// PUT /admin/brands/:id — update a brand (optionally replace logo)
app.put(BASE + "/admin/brands/:id", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var brandId = (c.req.param("id") || "").substring(0, 100);
    if (!brandId) return c.json({ error: "ID invalido." }, 400);
    var existing = await kv.get("brand:" + brandId);
    if (!existing) return c.json({ error: "Marca não encontrada." }, 404);

    var brand = typeof existing === "string" ? JSON.parse(existing) : existing;
    var ct = c.req.header("Content-Type") || "";

    if (ct.includes("multipart/form-data")) {
      var formData = await c.req.formData();
      var file = formData.get("file") as File | null;
      var nameVal = formData.get("name");
      var slugVal = formData.get("slug");
      var bgColorVal = formData.get("bgColor");
      var orderVal = formData.get("order");
      var activeVal = formData.get("active");
      var productsVal = formData.get("products");
      var logoZoomVal = formData.get("logoZoom");

      if (nameVal !== null) brand.name = sanitizeInput(String(nameVal)).substring(0, 200);
      if (slugVal !== null) brand.slug = sanitizeInput(String(slugVal)).substring(0, 200);
      if (bgColorVal !== null) brand.bgColor = sanitizeInput(String(bgColorVal)).substring(0, 20);
      if (orderVal !== null) brand.order = Math.min(Math.max(parseInt(String(orderVal), 10) || 0, 0), 9999);
      if (activeVal !== null) brand.active = String(activeVal) !== "false";
      if (logoZoomVal !== null) brand.logoZoom = Math.min(Math.max(parseFloat(String(logoZoomVal)) || 1, 0.1), 5);
      if (productsVal !== null) {
        try { brand.products = JSON.parse(String(productsVal)); } catch { /* keep existing */ }
      }

      if (file) {
        var fValidTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
        if (fValidTypes.indexOf(file.type) === -1) {
          return c.json({ error: "Tipo não permitido: " + file.type }, 400);
        }
        if (file.size > 5 * 1024 * 1024) {
          return c.json({ error: "Arquivo muito grande. Máximo: 5MB." }, 400);
        }

        if (brand.filename) {
          try { await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([brand.filename]); } catch {}
        }

        var fExtMap: Record<string, string> = {
          "image/avif": "avif", "image/png": "png", "image/jpeg": "jpg",
          "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
        };
        var fExt = fExtMap[file.type] || "png";
        var newFilename = "brand-" + brandId + "." + fExt;
        var fArrayBuffer = await file.arrayBuffer();

        var fUploadResult = await supabaseAdmin.storage
          .from(ASSETS_BUCKET)
          .upload(newFilename, fArrayBuffer, { contentType: file.type, upsert: true });

        if (fUploadResult.error) {
          console.log("Brand card upload error:", fUploadResult.error.message);
          return c.json({ error: "Erro no upload do arquivo." }, 500);
        }

        var fSupabaseUrl = Deno.env.get("SUPABASE_URL");
        brand.logoUrl = fSupabaseUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + newFilename;
        brand.filename = newFilename;
        brand.contentType = file.type;
        brand.fileSize = file.size;
      }
    } else {
      var body = await c.req.json();
      // Input validation for brand JSON update
      var brandUpValid = validate(body, {
        name: { type: "string", maxLen: 200 },
        slug: { type: "string", maxLen: 200 },
        bgColor: { type: "string", maxLen: 30 },
        active: { type: "boolean" },
      });
      if (!brandUpValid.ok) return c.json({ error: brandUpValid.errors[0] || "Dados invalidos." }, 400);
      if (body.name !== undefined) brand.name = brandUpValid.sanitized.name;
      if (body.slug !== undefined) brand.slug = brandUpValid.sanitized.slug;
      if (body.bgColor !== undefined) brand.bgColor = brandUpValid.sanitized.bgColor;
      if (body.order !== undefined) brand.order = parseInt(String(body.order), 10) || 0;
      if (body.active !== undefined) brand.active = body.active !== false;
      if (body.logoZoom !== undefined) brand.logoZoom = parseFloat(String(body.logoZoom)) || 1;
      if (body.products !== undefined) brand.products = body.products;
    }

    brand.updatedAt = new Date().toISOString();
    await kv.set("brand:" + brandId, JSON.stringify(brand));
    console.log("Brand updated: " + brandId);

    return c.json({ updated: true, brand: brand });
  } catch (e: any) {
    console.log("Error updating brand:", e);
    return c.json({ error: "Erro ao atualizar marca." }, 500);
  }
});

// DELETE /admin/brands/:id — delete brand + remove logo from storage
app.delete(BASE + "/admin/brands/:id", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var brandId = (c.req.param("id") || "").substring(0, 100);
    if (!brandId) return c.json({ error: "ID invalido." }, 400);
    var existing = await kv.get("brand:" + brandId);
    if (!existing) return c.json({ error: "Marca não encontrada." }, 404);

    var brand = typeof existing === "string" ? JSON.parse(existing) : existing;

    if (brand.filename) {
      try { await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([brand.filename]); } catch {}
    }

    await kv.del("brand:" + brandId);
    console.log("Brand deleted: " + brandId);

    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("Error deleting brand:", e);
    return c.json({ error: "Erro ao deletar marca." }, 500);
  }
});

// ═══════════════════════════════════════════════
// ─── AUTO-CATEGORIZE DATA (Admin) ─────────────
// ═══════════════════════════════════════════════

app.get(BASE + "/admin/auto-categorize-data", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var supabaseUrl = Deno.env.get("SUPABASE_URL");
    var supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return c.json({ error: "Configuracao do servidor incompleta." }, 500);
    }

    console.log("[AutoCateg] Fetching all data for auto-categorization...");
    var t0 = Date.now();

    // 1) Fetch ALL products from DB (sku + titulo only, no limit)
    var allProducts: Array<{ sku: string; titulo: string }> = [];
    var pageSize = 1000;
    var offset = 0;
    var hasMore = true;
    while (hasMore) {
      var rangeEnd = offset + pageSize - 1;
      var dbUrl = supabaseUrl + "/rest/v1/produtos?select=sku,titulo&order=sku.asc";
      var dbRes = await fetch(dbUrl, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: "Bearer " + supabaseKey,
          "Content-Type": "application/json",
          Range: offset + "-" + rangeEnd,
          Prefer: "count=exact",
        },
      });
      if (!dbRes.ok) {
        var errTxt = await dbRes.text();
        console.log("[AutoCateg] DB fetch error: " + errTxt);
        return c.json({ error: "Erro ao buscar produtos do banco: HTTP " + dbRes.status }, 500);
      }
      var rows = await dbRes.json();
      if (Array.isArray(rows)) {
        for (var ri = 0; ri < rows.length; ri++) {
          allProducts.push({ sku: rows[ri].sku, titulo: rows[ri].titulo || "" });
        }
      }
      hasMore = Array.isArray(rows) && rows.length === pageSize;
      offset += pageSize;
    }
    console.log("[AutoCateg] Fetched " + allProducts.length + " products from DB");

    // 2) Fetch ALL product metas (category assignments)
    var allMetas = await getAllProductMetas();
    var metasObj: Record<string, any> = {};
    allMetas.forEach(function(meta, sku) {
      metasObj[sku] = { category: meta.category || "", visible: meta.visible !== false };
    });

    // 3) Category tree
    var categoryTree = (await kv.get("category_tree")) || [];

    // 4) Attributes map (optional, may be empty)
    var attrsObj: Record<string, Record<string, string | string[]>> = {};
    try {
      var attrsMap = await getAtributosMap();
      attrsMap.forEach(function(attrs, sku) {
        attrsObj[sku] = attrs;
      });
    } catch (e) {
      console.log("[AutoCateg] Could not load attributes: " + String(e));
    }

    console.log("[AutoCateg] Done in " + (Date.now() - t0) + "ms | products=" + allProducts.length + " metas=" + Object.keys(metasObj).length + " attrs=" + Object.keys(attrsObj).length);

    return c.json({
      products: allProducts,
      metas: metasObj,
      categoryTree: categoryTree,
      attributes: attrsObj,
    });
  } catch (e) {
    console.log("[AutoCateg] Error:", e);
    return c.json({ error: "Erro ao buscar dados para auto-categorizacao." }, 500);
  }
});

// POST /admin/auto-categorize-apply — bulk apply category assignments
app.post(BASE + "/admin/auto-categorize-apply", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var body = await c.req.json();
    // Input validation for auto-categorize-apply
    var acValid = validate(body, {
      assignments: { required: true, type: "array", maxItems: 5000 },
    });
    if (!acValid.ok) return c.json({ error: acValid.errors[0] || "Dados invalidos." }, 400);
    var assignments = acValid.sanitized.assignments;
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return c.json({ error: "assignments deve ser um array nao vazio." }, 400);
    }

    console.log("[AutoCateg] Applying " + assignments.length + " category assignments...");
    var applied = 0;
    var errors: string[] = [];

    for (var ai = 0; ai < assignments.length; ai++) {
      var item = assignments[ai];
      if (!item || !item.sku || !item.category) continue;
      try {
        var existing = (await kv.get("produto_meta:" + item.sku)) || {};
        var updated = Object.assign({}, existing, { sku: item.sku, category: item.category });
        await kv.set("produto_meta:" + item.sku, updated);
        applied++;
      } catch (e2) {
        errors.push(item.sku + ": " + String(e2));
      }
    }

    invalidateMetaCache();
    console.log("[AutoCateg] Applied " + applied + "/" + assignments.length + " assignments. Errors: " + errors.length);

    return c.json({ applied: applied, total: assignments.length, errors: errors });
  } catch (e) {
    console.log("[AutoCateg] Apply error:", e);
    return c.json({ error: "Erro ao aplicar categorizacao." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ─── PRODUCT REVIEWS WITH MODERATION ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

var REVIEWS_BUCKET = "make-b7b07654-reviews";

(async function () {
  try {
    var bkts = await supabaseAdmin.storage.listBuckets();
    var bktList = bkts.data || [];
    var exists = false;
    for (var bi = 0; bi < bktList.length; bi++) {
      if (bktList[bi].name === REVIEWS_BUCKET) { exists = true; break; }
    }
    if (!exists) {
      await supabaseAdmin.storage.createBucket(REVIEWS_BUCKET, { public: false });
      console.log("Created private reviews bucket: " + REVIEWS_BUCKET);
    }
  } catch (e) {
    console.log("Error ensuring reviews bucket: " + String(e));
  }
})();

function _reviewUuid(): string {
  var s = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  var result = "";
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch === "x" || ch === "y") {
      var r = Math.floor(Math.random() * 16);
      if (ch === "y") r = (r & 0x3) | 0x8;
      result += r.toString(16);
    } else {
      result += ch;
    }
  }
  return result;
}

async function _getReviewsPending(): Promise<string[]> {
  try {
    var raw = await kv.get("reviews_pending");
    if (!raw) return [];
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function _saveReviewsPending(ids: string[]): Promise<void> {
  await kv.set("reviews_pending", JSON.stringify(ids));
}

async function _getReviewIdsBySku(sku: string): Promise<string[]> {
  try {
    var raw = await kv.get("review_ids:" + sku);
    if (!raw) return [];
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function _saveReviewIdsBySku(sku: string, ids: string[]): Promise<void> {
  await kv.set("review_ids:" + sku, JSON.stringify(ids));
}

async function _getReviewIdsByUser(userId: string): Promise<string[]> {
  try {
    var raw = await kv.get("review_user_ids:" + userId);
    if (!raw) return [];
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function _saveReviewIdsByUser(userId: string, ids: string[]): Promise<void> {
  await kv.set("review_user_ids:" + userId, JSON.stringify(ids));
}

async function _getAllReviewIds(): Promise<string[]> {
  try {
    var raw = await kv.get("reviews_all_ids");
    if (!raw) return [];
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function _saveAllReviewIds(ids: string[]): Promise<void> {
  await kv.set("reviews_all_ids", JSON.stringify(ids));
}

async function _migrateReviewIndexes(): Promise<void> {
  try {
    var existingAll = await _getAllReviewIds();
    if (existingAll.length > 0) return;
    console.log("[Reviews] Migrating review indexes from getByPrefix...");
    var allKvs = await kv.getByPrefix("review:");
    var allIds: string[] = [];
    var userMap: Record<string, string[]> = {};
    for (var mi = 0; mi < allKvs.length; mi++) {
      var mval = allKvs[mi].value;
      if (!mval) continue;
      var mrev = typeof mval === "string" ? JSON.parse(mval) : mval;
      if (!mrev.id || !mrev.sku) continue;
      allIds.push(mrev.id);
      if (mrev.userId) {
        if (!userMap[mrev.userId]) userMap[mrev.userId] = [];
        userMap[mrev.userId].push(mrev.id);
      }
    }
    if (allIds.length > 0) {
      await _saveAllReviewIds(allIds);
      var userKeys = Object.keys(userMap);
      for (var umi = 0; umi < userKeys.length; umi++) {
        var uid = userKeys[umi];
        await _saveReviewIdsByUser(uid, userMap[uid]);
      }
      console.log("[Reviews] Migrated " + allIds.length + " reviews, " + userKeys.length + " user indexes");
    }
  } catch (e) {
    console.log("[Reviews] Migration error (non-fatal): " + String(e));
  }
}

var _migrationDone = false;
async function _ensureReviewIndexes(): Promise<void> {
  if (_migrationDone) return;
  _migrationDone = true;
  await _migrateReviewIndexes();
}

async function _signReviewImages(images: any[]): Promise<any[]> {
  if (!images || images.length === 0) return [];
  var result = [];
  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    var signed = "";
    try {
      var signRes = await supabaseAdmin.storage.from(REVIEWS_BUCKET).createSignedUrl(img.path, 3600);
      if (signRes.data && signRes.data.signedUrl) signed = signRes.data.signedUrl;
    } catch (e) { /* ignore */ }
    result.push({ path: img.path, signedUrl: signed, status: img.status || "pending" });
  }
  return result;
}

app.get(BASE + "/reviews/:sku", async function (c) {
  try {
    var sku = (c.req.param("sku") || "").substring(0, 100);
    if (!sku) return c.json({ error: "SKU obrigatorio." }, 400);
    var ids = await _getReviewIdsBySku(sku);
    if (ids.length === 0) return c.json({ reviews: [], total: 0, sku: sku });
    var keys: string[] = [];
    for (var i = 0; i < ids.length; i++) keys.push("review:" + ids[i]);
    var rawReviews = await kv.mget(keys);
    var reviews = [];
    for (var ri = 0; ri < rawReviews.length; ri++) {
      var raw = rawReviews[ri];
      if (!raw) continue;
      var rev = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (rev.status !== "approved") continue;
      var approvedImages = [];
      if (rev.images) {
        for (var ii = 0; ii < rev.images.length; ii++) {
          if (rev.images[ii].status === "approved") approvedImages.push(rev.images[ii]);
        }
      }
      var signedImages = await _signReviewImages(approvedImages);
      reviews.push({ id: rev.id, sku: rev.sku, userName: rev.userName || "Anônimo", rating: rev.rating, title: rev.title || "", comment: rev.comment || "", images: signedImages, createdAt: rev.createdAt, helpful: rev.helpful || 0, verified: rev.verified || false });
    }
    reviews.sort(function (a: any, b: any) { return b.createdAt - a.createdAt; });
    return c.json({ reviews: reviews, total: reviews.length, sku: sku });
  } catch (e) {
    console.log("[Reviews] GET error:", e);
    return c.json({ error: "Erro ao buscar avaliacoes." }, 500);
  }
});

app.get(BASE + "/reviews/:sku/summary", async function (c) {
  try {
    var sku = (c.req.param("sku") || "").substring(0, 100);
    if (!sku) return c.json({ error: "SKU obrigatorio." }, 400);
    var ids = await _getReviewIdsBySku(sku);
    if (ids.length === 0) return c.json({ sku: sku, averageRating: 0, totalReviews: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    var keys: string[] = [];
    for (var i = 0; i < ids.length; i++) keys.push("review:" + ids[i]);
    var rawReviews = await kv.mget(keys);
    var totalRating = 0;
    var count = 0;
    var dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (var ri = 0; ri < rawReviews.length; ri++) {
      var raw = rawReviews[ri];
      if (!raw) continue;
      var rev = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (rev.status !== "approved") continue;
      totalRating += rev.rating;
      count++;
      var r = Math.min(5, Math.max(1, Math.round(rev.rating)));
      dist[r] = (dist[r] || 0) + 1;
    }
    var avg = count > 0 ? Math.round((totalRating / count) * 10) / 10 : 0;
    return c.json({ sku: sku, averageRating: avg, totalReviews: count, distribution: dist });
  } catch (e) {
    console.log("[reviews] Summary error:", e);
    return c.json({ error: "Erro ao calcular resumo de avaliacoes." }, 500);
  }
});

// ─── Review summaries batch (for ProductCard stars) ───
async function _computeReviewSummaryForSku(sku: string): Promise<{ averageRating: number; totalReviews: number }> {
  var ids = await _getReviewIdsBySku(sku);
  if (ids.length === 0) return { averageRating: 0, totalReviews: 0 };
  var keys: string[] = [];
  for (var ki = 0; ki < ids.length; ki++) keys.push("review:" + ids[ki]);
  var rawReviews = await kv.mget(keys);
  var totalRating = 0;
  var count = 0;
  for (var ri = 0; ri < rawReviews.length; ri++) {
    var raw = rawReviews[ri];
    if (!raw) continue;
    var rev = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (rev.status !== "approved") continue;
    totalRating += rev.rating;
    count++;
  }
  var avg = count > 0 ? Math.round((totalRating / count) * 10) / 10 : 0;
  return { averageRating: avg, totalReviews: count };
}

app.post(BASE + "/reviews/summaries-batch", async function (c) {
  try {
    var body = await c.req.json();
    // Input validation for summaries-batch
    var sbValid = validate(body, {
      skus: { required: true, type: "array", maxItems: 60 },
    });
    if (!sbValid.ok) return c.json({ summaries: {} });
    var skus: string[] = body.skus || [];
    if (!Array.isArray(skus) || skus.length === 0) {
      return c.json({ summaries: {} });
    }
    if (skus.length > 60) skus = skus.slice(0, 60);
    // Sanitize each SKU
    for (var si = 0; si < skus.length; si++) {
      skus[si] = String(skus[si] || "").substring(0, 50);
    }
    var summaries: Record<string, { averageRating: number; totalReviews: number }> = {};
    var promises = skus.map(function (sku) {
      return _computeReviewSummaryForSku(sku).then(function (result) {
        summaries[sku] = result;
      }).catch(function () {
        summaries[sku] = { averageRating: 0, totalReviews: 0 };
      });
    });
    await Promise.all(promises);
    return c.json({ summaries: summaries });
  } catch (e) {
    console.log("[Reviews] summaries-batch error: " + String(e));
    return c.json({ error: "Erro ao calcular resumos." }, 500);
  }
});

// Helper: check if a user has purchased a specific SKU (paid/completed order)
async function _userHasPurchasedSku(userId: string, sku: string): Promise<boolean> {
  try {
    var ordersRaw = await kv.getByPrefix("user_order:" + userId + ":");
    if (!Array.isArray(ordersRaw) || ordersRaw.length === 0) return false;
    for (var oi = 0; oi < ordersRaw.length; oi++) {
      try {
        var order = typeof ordersRaw[oi] === "string" ? JSON.parse(ordersRaw[oi]) : ordersRaw[oi];
        var st = (order.status || "").toLowerCase();
        if (st !== "paid" && st !== "completed" && st !== "delivered" && st !== "shipped") continue;
        var items = order.items || [];
        for (var ii = 0; ii < items.length; ii++) {
          var itemSku = items[ii].sku || items[ii].codProduto || "";
          if (itemSku === sku) return true;
        }
      } catch {}
    }
    return false;
  } catch (e) {
    console.log("[_userHasPurchasedSku] Error for user=" + userId + " sku=" + sku + ": " + String(e));
    return false;
  }
}

app.get(BASE + "/reviews/:sku/mine", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ hasReview: false, review: null, hasPurchased: false });
    var sku = (c.req.param("sku") || "").substring(0, 100);
    if (!sku) return c.json({ hasReview: false, review: null, hasPurchased: false });

    // Check purchase + existing review in parallel
    var purchasePromise = _userHasPurchasedSku(userId, sku);

    var ids = await _getReviewIdsBySku(sku);
    var foundReview: any = null;
    if (ids.length > 0) {
      var keys: string[] = [];
      for (var ci = 0; ci < ids.length; ci++) keys.push("review:" + ids[ci]);
      var rawRevs = await kv.mget(keys);
      for (var ri = 0; ri < rawRevs.length; ri++) {
        var val = rawRevs[ri];
        if (!val) continue;
        var rev = typeof val === "string" ? JSON.parse(val) : val;
        if (rev.userId === userId && rev.status !== "rejected") {
          foundReview = { id: rev.id, rating: rev.rating, title: rev.title || "", comment: rev.comment || "", status: rev.status, createdAt: rev.createdAt };
          break;
        }
      }
    }

    var hasPurchased = await purchasePromise;

    if (foundReview) {
      return c.json({ hasReview: true, review: foundReview, hasPurchased: hasPurchased });
    }
    return c.json({ hasReview: false, review: null, hasPurchased: hasPurchased });
  } catch (e) {
    return c.json({ hasReview: false, review: null, hasPurchased: false });
  }
});

app.post(BASE + "/reviews", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Voce precisa estar logado para avaliar." }, 401);
    var userResult = await supabaseAdmin.auth.admin.getUserById(userId);
    var user = userResult.data ? userResult.data.user : null;
    if (!user) return c.json({ error: "Usuario nao encontrado." }, 404);
    var body = await c.req.json();
    // Input validation via schema
    var rvValid = validateOrError(body, schemas.review);
    if (!rvValid.valid) {
      return c.json({ error: rvValid.errors[0] || "Dados invalidos." }, 400);
    }
    var sku = rvValid.data.sku;
    var rating = rvValid.data.rating;
    var title = rvValid.data.title || "";
    var comment = rvValid.data.comment || "";
    // Verify that the user has purchased this product
    var hasPurchased = await _userHasPurchasedSku(userId, sku);
    if (!hasPurchased) {
      return c.json({ error: "Somente compradores podem avaliar este produto. Compre primeiro para poder avaliar." }, 403);
    }
    var existingIds = await _getReviewIdsBySku(sku);
    if (existingIds.length > 0) {
      var existingKeys: string[] = [];
      for (var ei = 0; ei < existingIds.length; ei++) existingKeys.push("review:" + existingIds[ei]);
      var existingReviews = await kv.mget(existingKeys);
      for (var eri = 0; eri < existingReviews.length; eri++) {
        var er = existingReviews[eri];
        if (!er) continue;
        var parsed = typeof er === "string" ? JSON.parse(er) : er;
        if (parsed.userId === userId && parsed.status !== "rejected") return c.json({ error: "Voce ja avaliou este produto." }, 409);
      }
    }
    var reviewId = _reviewUuid();
    var now = Date.now();
    var userName = user.user_metadata ? (user.user_metadata.name || user.email || "Anônimo") : (user.email || "Anônimo");
    var userEmail = user.email || "";
    var review = { id: reviewId, sku: sku, userId: userId, userName: userName, userEmail: userEmail, rating: rating, title: title, comment: comment, images: [], status: "pending", createdAt: now, updatedAt: now, moderatedAt: null, moderatedBy: null, moderationNote: null, helpful: 0, verified: true };
    await kv.set("review:" + reviewId, JSON.stringify(review));
    var skuIds = await _getReviewIdsBySku(sku);
    skuIds.push(reviewId);
    await _saveReviewIdsBySku(sku, skuIds);
    var userRevIds = await _getReviewIdsByUser(userId);
    userRevIds.push(reviewId);
    await _saveReviewIdsByUser(userId, userRevIds);
    var allIds = await _getAllReviewIds();
    allIds.push(reviewId);
    await _saveAllReviewIds(allIds);
    var pending = await _getReviewsPending();
    pending.push(reviewId);
    await _saveReviewsPending(pending);
    console.log("[Reviews] New review " + reviewId + " for " + sku + " by " + userEmail);
    return c.json({ ok: true, reviewId: reviewId, status: "pending" });
  } catch (e) {
    console.log("[Reviews] POST error:", e);
    return c.json({ error: "Erro ao enviar avaliacao." }, 500);
  }
});

app.post(BASE + "/reviews/:id/images", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var reviewId = c.req.param("id");
    if (!reviewId || !/^[a-zA-Z0-9_-]{1,100}$/.test(reviewId)) return c.json({ error: "ID invalido." }, 400);
    var rawReview = await kv.get("review:" + reviewId);
    if (!rawReview) return c.json({ error: "Avaliacao nao encontrada." }, 404);
    var review = typeof rawReview === "string" ? JSON.parse(rawReview) : rawReview;
    if (review.userId !== userId) return c.json({ error: "Sem permissao." }, 403);
    var existingImgCount = review.images ? review.images.length : 0;
    if (existingImgCount >= 3) return c.json({ error: "Maximo de 3 imagens por avaliacao." }, 400);
    var formData = await c.req.formData();
    var file = formData.get("file");
    if (!file || !(file instanceof File)) return c.json({ error: "Nenhuma imagem enviada." }, 400);
    var allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    var fileType = file.type || "";
    var isAllowed = false;
    for (var ti = 0; ti < allowedTypes.length; ti++) { if (fileType === allowedTypes[ti]) { isAllowed = true; break; } }
    if (!isAllowed) return c.json({ error: "Tipo nao permitido. Use JPG, PNG, WebP ou GIF." }, 400);
    if (file.size > 5 * 1024 * 1024) return c.json({ error: "Imagem muito grande (max 5MB)." }, 400);
    var imgIndex = existingImgCount + 1;
    var ext = "webp";
    if (fileType === "image/jpeg") ext = "jpg";
    else if (fileType === "image/png") ext = "png";
    else if (fileType === "image/gif") ext = "gif";
    var filePath = reviewId + "/" + imgIndex + "." + ext;
    var arrayBuffer = await file.arrayBuffer();
    var uploadRes = await supabaseAdmin.storage.from(REVIEWS_BUCKET).upload(filePath, arrayBuffer, { contentType: fileType, upsert: true });
    if (uploadRes.error) {
      console.log("[Reviews] Image storage error:", uploadRes.error.message);
      return c.json({ error: "Erro no upload da imagem." }, 500);
    }
    if (!review.images) review.images = [];
    review.images.push({ path: filePath, status: "pending" });
    review.updatedAt = Date.now();
    await kv.set("review:" + reviewId, JSON.stringify(review));
    return c.json({ ok: true, path: filePath, imageIndex: imgIndex });
  } catch (e) {
    console.log("[Reviews] Image upload error:", e);
    return c.json({ error: "Erro ao enviar imagem." }, 500);
  }
});

app.post(BASE + "/reviews/:id/helpful", async function (c) {
  try {
    // Rate limit: 20/min per IP to prevent helpful count inflation
    var helpfulRl = _getRateLimitKey(c, "review_helpful");
    var helpfulRlResult = _checkRateLimit(helpfulRl, 20);
    if (!helpfulRlResult.allowed) return _rl429(c, "Rate limit", helpfulRlResult);
    var reviewId = c.req.param("id");
    if (!reviewId || !/^[a-zA-Z0-9_-]{1,100}$/.test(reviewId)) return c.json({ error: "ID invalido." }, 400);
    var rawReview = await kv.get("review:" + reviewId);
    if (!rawReview) return c.json({ error: "Avaliacao nao encontrada." }, 404);
    var review = typeof rawReview === "string" ? JSON.parse(rawReview) : rawReview;
    if (review.status !== "approved") return c.json({ error: "Avaliacao nao aprovada." }, 403);
    review.helpful = (review.helpful || 0) + 1;
    await kv.set("review:" + reviewId, JSON.stringify(review));
    return c.json({ ok: true, helpful: review.helpful });
  } catch (e) {
    console.log("[Reviews] Helpful error:", e);
    return c.json({ error: "Erro ao processar voto." }, 500);
  }
});

app.get(BASE + "/reviews/user/mine", async function (c) {
  try {
    await _ensureReviewIndexes();
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var ids = await _getReviewIdsByUser(userId);
    if (ids.length === 0) return c.json({ reviews: [], total: 0 });
    var keys: string[] = [];
    for (var ki = 0; ki < ids.length; ki++) keys.push("review:" + ids[ki]);
    var rawReviews = await kv.mget(keys);
    var userReviews = [];
    var validIds: string[] = [];
    for (var i = 0; i < rawReviews.length; i++) {
      var val = rawReviews[i];
      if (!val) continue;
      var rev = typeof val === "string" ? JSON.parse(val) : val;
      if (!rev.id || !rev.sku) continue;
      validIds.push(rev.id);
      var signedImages = await _signReviewImages(rev.images || []);
      userReviews.push({ id: rev.id, sku: rev.sku, userName: rev.userName, rating: rev.rating, title: rev.title || "", comment: rev.comment || "", images: signedImages, status: rev.status, createdAt: rev.createdAt, moderationNote: rev.moderationNote || null, helpful: rev.helpful || 0 });
    }
    if (validIds.length !== ids.length) {
      await _saveReviewIdsByUser(userId, validIds);
    }
    userReviews.sort(function (a: any, b: any) { return b.createdAt - a.createdAt; });
    return c.json({ reviews: userReviews, total: userReviews.length });
  } catch (e) {
    console.log("[Reviews] User mine error:", e);
    return c.json({ error: "Erro ao buscar suas avaliacoes." }, 500);
  }
});

app.get(BASE + "/admin/reviews", async function (c) {
  try {
    await _ensureReviewIndexes();
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Nao autorizado." }, 401);
    var statusFilter = (c.req.query("status") || "all").substring(0, 20);
    var allIds = await _getAllReviewIds();
    if (allIds.length === 0) return c.json({ reviews: [], total: 0 });
    var keys: string[] = [];
    for (var ki = 0; ki < allIds.length; ki++) keys.push("review:" + allIds[ki]);
    var rawReviews = await kv.mget(keys);
    var allReviews = [];
    var validIds: string[] = [];
    for (var i = 0; i < rawReviews.length; i++) {
      var val = rawReviews[i];
      if (!val) continue;
      var rev = typeof val === "string" ? JSON.parse(val) : val;
      if (!rev.id || !rev.sku || !rev.userId) continue;
      validIds.push(rev.id);
      if (statusFilter !== "all" && rev.status !== statusFilter) continue;
      var signedImages = await _signReviewImages(rev.images || []);
      allReviews.push({ id: rev.id, sku: rev.sku, userId: rev.userId, userName: rev.userName || "Anônimo", userEmail: rev.userEmail || "", rating: rev.rating, title: rev.title || "", comment: rev.comment || "", images: signedImages, status: rev.status, createdAt: rev.createdAt, updatedAt: rev.updatedAt, moderatedAt: rev.moderatedAt || null, moderatedBy: rev.moderatedBy || null, moderationNote: rev.moderationNote || null, helpful: rev.helpful || 0, verified: rev.verified || false });
    }
    if (validIds.length !== allIds.length) {
      await _saveAllReviewIds(validIds);
    }
    allReviews.sort(function (a: any, b: any) { if (a.status === "pending" && b.status !== "pending") return -1; if (a.status !== "pending" && b.status === "pending") return 1; return b.createdAt - a.createdAt; });
    return c.json({ reviews: allReviews, total: allReviews.length });
  } catch (e) {
    console.log("[admin/reviews] List error:", e);
    return c.json({ error: "Erro ao listar avaliacoes." }, 500);
  }
});

app.get(BASE + "/admin/reviews/stats", async function (c) {
  try {
    await _ensureReviewIndexes();
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Nao autorizado." }, 401);
    var allIds = await _getAllReviewIds();
    if (allIds.length === 0) return c.json({ pending: 0, approved: 0, rejected: 0, total: 0, totalImages: 0, pendingImages: 0 });
    var keys: string[] = [];
    for (var ki = 0; ki < allIds.length; ki++) keys.push("review:" + allIds[ki]);
    var rawReviews = await kv.mget(keys);
    var pendingCount = 0;
    var approvedCount = 0;
    var rejectedCount = 0;
    var totalImages = 0;
    var pendingImages = 0;
    var validIds: string[] = [];
    for (var i = 0; i < rawReviews.length; i++) {
      var val = rawReviews[i];
      if (!val) continue;
      var rev = typeof val === "string" ? JSON.parse(val) : val;
      if (!rev.id || !rev.sku) continue;
      validIds.push(rev.id);
      if (rev.status === "pending") pendingCount++;
      else if (rev.status === "approved") approvedCount++;
      else if (rev.status === "rejected") rejectedCount++;
      if (rev.images) { totalImages += rev.images.length; for (var ii = 0; ii < rev.images.length; ii++) { if (rev.images[ii].status === "pending") pendingImages++; } }
    }
    if (validIds.length !== allIds.length) {
      await _saveAllReviewIds(validIds);
    }
    return c.json({ pending: pendingCount, approved: approvedCount, rejected: rejectedCount, total: pendingCount + approvedCount + rejectedCount, totalImages: totalImages, pendingImages: pendingImages });
  } catch (e) {
    console.log("[admin/reviews] Stats error:", e);
    return c.json({ error: "Erro ao buscar estatisticas de avaliacoes." }, 500);
  }
});

app.put(BASE + "/admin/reviews/:id/moderate", async function (c) {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Nao autorizado." }, 401);
    var reviewId = c.req.param("id");
    if (!reviewId || reviewId.length > 200) return c.json({ error: "ID invalido." }, 400);
    var body = await c.req.json();
    // Input validation for review moderation
    var modValid = validate(body, {
      action: { required: true, type: "string", maxLen: 20, oneOf: ["approve", "reject"] },
      note: { type: "string", maxLen: 2000 },
    });
    if (!modValid.ok) return c.json({ error: modValid.errors[0] || "Acao invalida." }, 400);
    var action = modValid.sanitized.action;
    var note = modValid.sanitized.note || "";
    var imageActions = body.imageActions || null;
    if (action !== "approve" && action !== "reject") return c.json({ error: "Acao invalida." }, 400);
    var rawReview = await kv.get("review:" + reviewId);
    if (!rawReview) return c.json({ error: "Avaliacao nao encontrada." }, 404);
    var review = typeof rawReview === "string" ? JSON.parse(rawReview) : rawReview;
    review.status = action === "approve" ? "approved" : "rejected";
    review.moderatedAt = Date.now();
    review.moderatedBy = adminCheck.email || "admin";
    review.moderationNote = note;
    review.updatedAt = Date.now();
    if (imageActions && review.images) {
      for (var ii = 0; ii < review.images.length; ii++) {
        var imgPath = review.images[ii].path;
        if (imageActions[imgPath]) {
          review.images[ii].status = imageActions[imgPath] === "approve" ? "approved" : "rejected";
        } else if (action === "approve") {
          if (review.images[ii].status === "pending") review.images[ii].status = "approved";
        } else {
          review.images[ii].status = "rejected";
        }
      }
    } else if (review.images) {
      for (var ii2 = 0; ii2 < review.images.length; ii2++) {
        review.images[ii2].status = action === "approve" ? "approved" : "rejected";
      }
    }
    if (review.images) {
      var toRemove: string[] = [];
      for (var ri = 0; ri < review.images.length; ri++) {
        if (review.images[ri].status === "rejected") toRemove.push(review.images[ri].path);
      }
      if (toRemove.length > 0) {
        try { await supabaseAdmin.storage.from(REVIEWS_BUCKET).remove(toRemove); } catch (removeErr) { console.log("[Reviews] Remove err: " + String(removeErr)); }
        review.images = review.images.filter(function (img: any) { return img.status !== "rejected"; });
      }
    }
    await kv.set("review:" + reviewId, JSON.stringify(review));
    var pendingIds = await _getReviewsPending();
    var newPending: string[] = [];
    for (var pi = 0; pi < pendingIds.length; pi++) { if (pendingIds[pi] !== reviewId) newPending.push(pendingIds[pi]); }
    await _saveReviewsPending(newPending);
    console.log("[Reviews] " + reviewId + " " + action + "d by " + adminCheck.email);
    return c.json({ ok: true, reviewId: reviewId, status: review.status });
  } catch (e) {
    console.log("[admin/reviews] Moderate error:", e);
    return c.json({ error: "Erro ao moderar avaliacao." }, 500);
  }
});

app.delete(BASE + "/admin/reviews/:id", async function (c) {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Nao autorizado." }, 401);
    var reviewId = (c.req.param("id") || "").substring(0, 200);
    if (!reviewId) return c.json({ error: "ID invalido." }, 400);
    var rawReview = await kv.get("review:" + reviewId);
    if (!rawReview) return c.json({ error: "Avaliacao nao encontrada." }, 404);
    var review = typeof rawReview === "string" ? JSON.parse(rawReview) : rawReview;
    if (review.images && review.images.length > 0) {
      var paths: string[] = [];
      for (var ri = 0; ri < review.images.length; ri++) paths.push(review.images[ri].path);
      try { await supabaseAdmin.storage.from(REVIEWS_BUCKET).remove(paths); } catch (e2) { /* ignore */ }
    }
    if (review.sku) {
      var skuIds = await _getReviewIdsBySku(review.sku);
      var newSkuIds: string[] = [];
      for (var si = 0; si < skuIds.length; si++) { if (skuIds[si] !== reviewId) newSkuIds.push(skuIds[si]); }
      await _saveReviewIdsBySku(review.sku, newSkuIds);
    }
    if (review.userId) {
      var delUserIds = await _getReviewIdsByUser(review.userId);
      var newDelUserIds: string[] = [];
      for (var dui = 0; dui < delUserIds.length; dui++) { if (delUserIds[dui] !== reviewId) newDelUserIds.push(delUserIds[dui]); }
      await _saveReviewIdsByUser(review.userId, newDelUserIds);
    }
    var allDelIds = await _getAllReviewIds();
    var newAllDelIds: string[] = [];
    for (var adi = 0; adi < allDelIds.length; adi++) { if (allDelIds[adi] !== reviewId) newAllDelIds.push(allDelIds[adi]); }
    await _saveAllReviewIds(newAllDelIds);
    var pendingIds = await _getReviewsPending();
    var newPending: string[] = [];
    for (var pi = 0; pi < pendingIds.length; pi++) { if (pendingIds[pi] !== reviewId) newPending.push(pendingIds[pi]); }
    await _saveReviewsPending(newPending);
    await kv.del("review:" + reviewId);
    console.log("[Reviews] Deleted " + reviewId + " by " + adminCheck.email);
    return c.json({ ok: true, deleted: reviewId });
  } catch (e) {
    console.log("[admin/reviews] Delete error:", e);
    return c.json({ error: "Erro ao deletar avaliacao." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ─── WARRANTY CERTIFICATE EMAIL ───
// ═══════════════════════════════════════════════════════════════════════

async function _sendWarrantyCertificateEmail(toEmail: string, orderId: string, warrantyItems: any[], customerName: string) {
  try {
    var cfg = await _getSmtpConfig();
    if (!cfg) {
      console.log("[Warranty] SMTP not configured — skipping certificate email");
      return;
    }
    var paidDate = new Date();
    var dateStr = paidDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

    var itemsHtml = "";
    for (var i = 0; i < warrantyItems.length; i++) {
      var wi = warrantyItems[i];
      var w = wi.warranty;
      var endDate = new Date(paidDate);
      endDate.setMonth(endDate.getMonth() + (w.durationMonths || 12));
      var endDateStr = endDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
      var certId = "GE-" + orderId + "-" + String(i + 1).padStart(3, "0");

      itemsHtml = itemsHtml +
        "<tr>" +
        "<td style=\"padding:12px 16px;border-bottom:1px solid #e5e7eb;\">" +
        "<strong style=\"color:#1f2937;font-size:14px;\">" + (wi.titulo || wi.sku) + "</strong>" +
        "<br><span style=\"color:#6b7280;font-size:12px;\">SKU: " + wi.sku + "</span>" +
        "</td>" +
        "<td style=\"padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;\">" +
        "<span style=\"color:#2563eb;font-weight:700;font-size:14px;\">" + w.name + "</span>" +
        "<br><span style=\"color:#6b7280;font-size:12px;\">" + w.durationMonths + " meses</span>" +
        "</td>" +
        "<td style=\"padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;\">" +
        "<span style=\"color:#059669;font-weight:600;font-size:13px;\">" + dateStr + "</span>" +
        "<br><span style=\"color:#6b7280;font-size:11px;\">ate " + endDateStr + "</span>" +
        "</td>" +
        "<td style=\"padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;\">" +
        "<code style=\"background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;\">" + certId + "</code>" +
        "</td>" +
        "</tr>";
    }

    var html =
      "<!DOCTYPE html>" +
      "<html lang=\"pt-BR\"><head><meta charset=\"UTF-8\"></head>" +
      "<body style=\"margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;\">" +
      "<div style=\"max-width:640px;margin:0 auto;padding:20px;\">" +
      "<div style=\"background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);\">" +
      // Header
      "<div style=\"background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px 24px;text-align:center;\">" +
      "<div style=\"width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;\">" +
      "<span style=\"font-size:28px;\">&#128737;</span>" +
      "</div>" +
      "<h1 style=\"color:#ffffff;font-size:22px;margin:0 0 6px 0;\">Certificado de Garantia Estendida</h1>" +
      "<p style=\"color:rgba(255,255,255,0.85);font-size:14px;margin:0;\">Pedido " + orderId + "</p>" +
      "</div>" +
      // Body
      "<div style=\"padding:28px 24px;\">" +
      "<p style=\"color:#374151;font-size:15px;margin:0 0 20px;\">Ola, <strong>" + customerName + "</strong>!</p>" +
      "<p style=\"color:#374151;font-size:14px;margin:0 0 24px;line-height:1.6;\">Seu pagamento foi confirmado e a garantia estendida dos produtos abaixo ja esta ativa. " +
      "Guarde este e-mail como comprovante — ele serve como seu certificado de garantia.</p>" +
      // Table
      "<div style=\"overflow-x:auto;\">" +
      "<table style=\"width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;\">" +
      "<thead><tr style=\"background:#f9fafb;\">" +
      "<th style=\"padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;\">Produto</th>" +
      "<th style=\"padding:10px 16px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;\">Plano</th>" +
      "<th style=\"padding:10px 16px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;\">Vigencia</th>" +
      "<th style=\"padding:10px 16px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;\">Certificado</th>" +
      "</tr></thead>" +
      "<tbody>" + itemsHtml + "</tbody>" +
      "</table>" +
      "</div>" +
      // Info box
      "<div style=\"background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-top:24px;\">" +
      "<p style=\"color:#1e40af;font-size:13px;font-weight:700;margin:0 0 8px;\">Informacoes importantes:</p>" +
      "<ul style=\"color:#374151;font-size:13px;margin:0;padding:0 0 0 18px;line-height:1.8;\">" +
      "<li>A garantia estendida cobre defeitos de fabricacao apos o termino da garantia legal.</li>" +
      "<li>Para acionar a garantia, entre em contato informando o numero do certificado.</li>" +
      "<li>A garantia nao cobre danos por mau uso, acidentes ou desgaste natural.</li>" +
      "</ul>" +
      "</div>" +
      "</div>" +
      // Footer
      "<div style=\"background:#f9fafb;padding:20px 24px;text-align:center;border-top:1px solid #e5e7eb;\">" +
      "<p style=\"color:#9ca3af;font-size:12px;margin:0;\">Carretao Auto Pecas — Garantia Estendida</p>" +
      "<p style=\"color:#9ca3af;font-size:11px;margin:4px 0 0;\">Este e-mail foi gerado automaticamente. Em caso de duvidas, entre em contato.</p>" +
      "</div>" +
      "</div></div></body></html>";

    var fromAddr = cfg.fromName ? (cfg.fromName + " <" + cfg.smtpUser + ">") : cfg.smtpUser;
    await _sendSmtpEmail(cfg, {
      from: fromAddr,
      to: toEmail,
      subject: "Certificado de Garantia Estendida - Pedido " + orderId,
      html: html,
    });
    console.log("[Warranty] Certificate email sent to " + toEmail + " for order " + orderId + " (" + warrantyItems.length + " items)");
  } catch (e) {
    console.log("[Warranty] Certificate email send error: " + e);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ─── GARANTIA ESTENDIDA (Extended Warranty) ───
// ═══════════════════════════════════════════════════════════════════════

// KV keys:
//   warranty_plan:<id>  → plan JSON
//   warranty_plan_index → JSON array of plan IDs
//   warranty_sku:<sku>  → JSON array of plan IDs assigned to that SKU

function _warrantyPlanKey(id: string) { return "warranty_plan:" + id; }

async function _getWarrantyPlanIds(): Promise<string[]> {
  try {
    var raw = await kv.get("warranty_plan_index");
    if (!raw) return [];
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

async function _saveWarrantyPlanIds(ids: string[]): Promise<void> {
  await kv.set("warranty_plan_index", JSON.stringify(ids));
}

async function _getWarrantySkuPlans(sku: string): Promise<string[]> {
  try {
    var raw = await kv.get("warranty_sku:" + sku);
    if (!raw) return [];
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

async function _saveWarrantySkuPlans(sku: string, planIds: string[]): Promise<void> {
  if (planIds.length === 0) {
    await kv.del("warranty_sku:" + sku);
  } else {
    await kv.set("warranty_sku:" + sku, JSON.stringify(planIds));
  }
}

// ── Admin: List all warranty plans ──
app.get(BASE + "/admin/warranty/plans", async (c: any) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Não autorizado" }, 401);
    var ids = await _getWarrantyPlanIds();
    var plans: any[] = [];
    for (var i = 0; i < ids.length; i++) {
      try {
        var raw = await kv.get(_warrantyPlanKey(ids[i]));
        if (raw) {
          var plan = typeof raw === "string" ? JSON.parse(raw) : raw;
          plans.push(plan);
        }
      } catch (e) { /* skip */ }
    }
    plans.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return c.json({ plans: plans });
  } catch (e) {
    console.log("[admin/warranty] List error: " + e);
    return c.json({ error: "Erro ao listar planos de garantia." }, 500);
  }
});

// ── Admin: Create warranty plan ──
app.post(BASE + "/admin/warranty/plans", async (c: any) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Não autorizado" }, 401);
    var body = await c.req.json();
    // Input validation for warranty plan create
    var wpValid = validate(body, {
      name: { required: true, type: "string", minLen: 1, maxLen: 200 },
      description: { type: "string", maxLen: 1000 },
      durationMonths: { type: "number", min: 1, max: 120 },
      priceType: { type: "string", maxLen: 20, oneOf: ["fixed", "percentage"] },
      priceValue: { required: true, type: "number", min: 0.01, max: 999999 },
      active: { type: "boolean" },
    });
    if (!wpValid.ok) return c.json({ error: wpValid.errors[0] || "Dados invalidos." }, 400);
    var name = sanitizeInput(String(body.name || "").trim()).substring(0, 200);
    if (!name) return c.json({ error: "Nome do plano é obrigatório" }, 400);
    var durationMonths = Math.max(1, Math.min(120, parseInt(String(body.durationMonths)) || 12));
    var priceType = body.priceType === "fixed" ? "fixed" : "percentage";
    var priceValue = Math.max(0, Math.min(999999, parseFloat(String(body.priceValue)) || 0));
    if (priceValue <= 0) return c.json({ error: "Valor do plano deve ser maior que zero" }, 400);
    var id = crypto.randomUUID();
    var plan = {
      id: id,
      name: name,
      description: sanitizeInput(String(body.description || "")).substring(0, 1000),
      durationMonths: durationMonths,
      priceType: priceType,
      priceValue: priceValue,
      active: body.active !== false,
      skus: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await kv.set(_warrantyPlanKey(id), JSON.stringify(plan));
    var ids = await _getWarrantyPlanIds();
    ids.push(id);
    await _saveWarrantyPlanIds(ids);
    console.log("[admin/warranty] Created plan: " + name + " (" + id + ") by " + adminCheck.email);
    return c.json({ ok: true, plan: plan });
  } catch (e) {
    console.log("[admin/warranty] Create error: " + e);
    return c.json({ error: "Erro ao criar plano de garantia." }, 500);
  }
});

// ── Admin: Update warranty plan ──
app.put(BASE + "/admin/warranty/plans/:id", async (c: any) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Não autorizado" }, 401);
    var planId = (c.req.param("id") || "").substring(0, 100);
    if (!planId) return c.json({ error: "ID invalido." }, 400);
    var raw = await kv.get(_warrantyPlanKey(planId));
    if (!raw) return c.json({ error: "Plano não encontrado" }, 404);
    var plan = typeof raw === "string" ? JSON.parse(raw) : raw;
    var body = await c.req.json();
    // Input validation for warranty plan update
    var wpUpValid = validate(body, {
      name: { type: "string", maxLen: 200 },
      description: { type: "string", maxLen: 1000 },
      durationMonths: { type: "number", min: 1, max: 120 },
      priceType: { type: "string", maxLen: 20, oneOf: ["fixed", "percentage"] },
      priceValue: { type: "number", min: 0, max: 999999 },
      active: { type: "boolean" },
    });
    if (!wpUpValid.ok) return c.json({ error: wpUpValid.errors[0] || "Dados invalidos." }, 400);
    if (body.name !== undefined) plan.name = sanitizeInput(String(body.name).trim()).substring(0, 200);
    if (body.description !== undefined) plan.description = sanitizeInput(String(body.description)).substring(0, 1000);
    if (body.durationMonths !== undefined) plan.durationMonths = Math.max(1, Math.min(120, parseInt(String(body.durationMonths)) || 12));
    if (body.priceType !== undefined) plan.priceType = body.priceType === "fixed" ? "fixed" : "percentage";
    if (body.priceValue !== undefined) plan.priceValue = Math.max(0, Math.min(999999, parseFloat(String(body.priceValue)) || 0));
    if (body.active !== undefined) plan.active = !!body.active;
    plan.updatedAt = Date.now();
    await kv.set(_warrantyPlanKey(planId), JSON.stringify(plan));
    console.log("[admin/warranty] Updated plan: " + planId + " by " + adminCheck.email);
    return c.json({ ok: true, plan: plan });
  } catch (e) {
    console.log("[admin/warranty] Update error: " + e);
    return c.json({ error: "Erro ao atualizar plano de garantia." }, 500);
  }
});

// ── Admin: Delete warranty plan ──
app.delete(BASE + "/admin/warranty/plans/:id", async (c: any) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Não autorizado" }, 401);
    var planId = (c.req.param("id") || "").substring(0, 100);
    if (!planId) return c.json({ error: "ID invalido." }, 400);
    // Remove plan from index
    var ids = await _getWarrantyPlanIds();
    var newIds: string[] = [];
    for (var i = 0; i < ids.length; i++) { if (ids[i] !== planId) newIds.push(ids[i]); }
    await _saveWarrantyPlanIds(newIds);
    // Load plan to get assigned SKUs and clean up
    var raw = await kv.get(_warrantyPlanKey(planId));
    if (raw) {
      var plan = typeof raw === "string" ? JSON.parse(raw) : raw;
      var skus = plan.skus || [];
      for (var s = 0; s < skus.length; s++) {
        var skuPlans = await _getWarrantySkuPlans(skus[s]);
        var filtered: string[] = [];
        for (var f = 0; f < skuPlans.length; f++) { if (skuPlans[f] !== planId) filtered.push(skuPlans[f]); }
        await _saveWarrantySkuPlans(skus[s], filtered);
      }
    }
    await kv.del(_warrantyPlanKey(planId));
    console.log("[admin/warranty] Deleted plan: " + planId + " by " + adminCheck.email);
    return c.json({ ok: true, deleted: planId });
  } catch (e) {
    console.log("[admin/warranty] Delete error: " + e);
    return c.json({ error: "Erro ao excluir plano de garantia." }, 500);
  }
});

// ── Admin: Assign SKUs to plan ──
app.put(BASE + "/admin/warranty/plans/:id/skus", async (c: any) => {
  try {
    var adminCheck = await isAdminUser(c.req.raw);
    if (!adminCheck.isAdmin) return c.json({ error: "Não autorizado" }, 401);
    var planId = (c.req.param("id") || "").substring(0, 100);
    if (!planId) return c.json({ error: "ID invalido." }, 400);
    var raw = await kv.get(_warrantyPlanKey(planId));
    if (!raw) return c.json({ error: "Plano não encontrado" }, 404);
    var plan = typeof raw === "string" ? JSON.parse(raw) : raw;
    var body = await c.req.json();
    // Input validation for warranty SKU assignment
    var wskuValid = validate(body, {
      skus: { required: true, type: "array", maxItems: 5000 },
    });
    if (!wskuValid.ok) return c.json({ error: wskuValid.errors[0] || "Dados invalidos." }, 400);
    var newSkus: string[] = [];
    if (Array.isArray(body.skus)) {
      for (var i = 0; i < body.skus.length; i++) {
        var s = String(body.skus[i]).trim();
        if (s && s.length <= 100) newSkus.push(s);
      }
    }
    var oldSkus: string[] = plan.skus || [];
    // Remove plan from old SKUs that are no longer assigned
    for (var oi = 0; oi < oldSkus.length; oi++) {
      var found = false;
      for (var ni = 0; ni < newSkus.length; ni++) { if (newSkus[ni] === oldSkus[oi]) { found = true; break; } }
      if (!found) {
        var skuPlans = await _getWarrantySkuPlans(oldSkus[oi]);
        var filtered: string[] = [];
        for (var f = 0; f < skuPlans.length; f++) { if (skuPlans[f] !== planId) filtered.push(skuPlans[f]); }
        await _saveWarrantySkuPlans(oldSkus[oi], filtered);
      }
    }
    // Add plan to new SKUs
    for (var ai = 0; ai < newSkus.length; ai++) {
      var exists = false;
      for (var oi2 = 0; oi2 < oldSkus.length; oi2++) { if (oldSkus[oi2] === newSkus[ai]) { exists = true; break; } }
      if (!exists) {
        var existing = await _getWarrantySkuPlans(newSkus[ai]);
        var already = false;
        for (var ei = 0; ei < existing.length; ei++) { if (existing[ei] === planId) { already = true; break; } }
        if (!already) {
          existing.push(planId);
          await _saveWarrantySkuPlans(newSkus[ai], existing);
        }
      }
    }
    plan.skus = newSkus;
    plan.updatedAt = Date.now();
    await kv.set(_warrantyPlanKey(planId), JSON.stringify(plan));
    console.log("[admin/warranty] Updated SKUs for plan " + planId + ": " + newSkus.length + " SKUs by " + adminCheck.email);
    return c.json({ ok: true, plan: plan });
  } catch (e) {
    console.log("[admin/warranty] Assign SKUs error: " + e);
    return c.json({ error: "Erro ao atribuir SKUs de garantia." }, 500);
  }
});

// ── Public: Get warranty plans for a product SKU ──
app.get(BASE + "/warranty/product/:sku", async (c: any) => {
  try {
    var sku = (c.req.param("sku") || "").substring(0, 100);
    if (!sku) return c.json({ plans: [] });
    var planIds = await _getWarrantySkuPlans(sku);
    if (planIds.length === 0) return c.json({ plans: [] });
    var plans: any[] = [];
    for (var i = 0; i < planIds.length; i++) {
      try {
        var raw = await kv.get(_warrantyPlanKey(planIds[i]));
        if (raw) {
          var plan = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (plan.active) {
            plans.push({
              id: plan.id,
              name: plan.name,
              description: plan.description,
              durationMonths: plan.durationMonths,
              priceType: plan.priceType,
              priceValue: plan.priceValue,
            });
          }
        }
      } catch (e) { /* skip */ }
    }
    return c.json({ plans: plans });
  } catch (e) {
    console.log("[warranty] Get product plans error: " + e);
    return c.json({ plans: [] });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ─── SISTEMA DE AFILIADOS ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

// KV keys:
// affiliate:{id}            — affiliate profile (userId = id)
// affiliate_index           — JSON array of all affiliate IDs
// affiliate_code:{code}     — maps referral code → userId
// affiliate_commission:{affId}:{orderId} — commission record
// affiliate_config          — global settings

function _generateAffiliateCode(): string {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var code = "";
  for (var i = 0; i < 8; i++) {
    code = code + chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function _getAffiliateConfig(): Promise<any> {
  var raw = await kv.get("affiliate_config");
  if (!raw) return { commissionPercent: 5, minPayout: 50, cookieDays: 30, enabled: true };
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function _getAffiliateById(affId: string): Promise<any> {
  var raw = await kv.get("affiliate:" + affId);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function _saveAffiliate(aff: any): Promise<void> {
  await kv.set("affiliate:" + aff.userId, JSON.stringify(aff));
}

async function _addToAffiliateIndex(affId: string): Promise<void> {
  var raw = await kv.get("affiliate_index");
  var ids: string[] = [];
  if (raw) {
    ids = typeof raw === "string" ? JSON.parse(raw) : raw;
  }
  if (ids.indexOf(affId) < 0) {
    ids.push(affId);
    await kv.set("affiliate_index", JSON.stringify(ids));
  }
}

async function _getAllAffiliateIds(): Promise<string[]> {
  var raw = await kv.get("affiliate_index");
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// ─── POST /affiliate/register ─── Register as affiliate (authenticated)
app.post(BASE + "/affiliate/register", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    // Check if already registered
    var existing = await _getAffiliateById(userId);
    if (existing) return c.json({ error: "Voce ja esta cadastrado como afiliado.", affiliate: existing }, 400);

    var body = await c.req.json();
    // Input validation
    var affValid = validate(body, {
      name: { required: true, type: "string", minLen: 2, maxLen: 150 },
      phone: { type: "string", maxLen: 30, custom: validators.phone },
      socialMedia: { type: "string", maxLen: 300 },
      pixKey: { type: "string", maxLen: 100 },
      motivation: { type: "string", maxLen: 1000 },
    });
    if (!affValid.ok) {
      return c.json({ error: affValid.errors[0] || "Dados invalidos." }, 400);
    }
    var name = affValid.sanitized.name || "";
    var phone = affValid.sanitized.phone || "";
    var socialMedia = affValid.sanitized.socialMedia || "";
    var pixKey = affValid.sanitized.pixKey || "";
    var motivation = affValid.sanitized.motivation || "";

    if (!name.trim()) return c.json({ error: "Nome obrigatorio." }, 400);

    // Get user email
    var userEmail = "";
    try {
      var userResult = await supabaseAdmin.auth.admin.getUserById(userId);
      userEmail = userResult.data?.user?.email || "";
    } catch (ue) { /* ignore */ }

    // Generate unique code
    var code = _generateAffiliateCode();
    var codeExists = await kv.get("affiliate_code:" + code);
    var attempts = 0;
    while (codeExists && attempts < 10) {
      code = _generateAffiliateCode();
      codeExists = await kv.get("affiliate_code:" + code);
      attempts++;
    }

    var affiliate = {
      userId: userId,
      email: userEmail,
      name: name.trim(),
      phone: phone.trim(),
      socialMedia: socialMedia.trim(),
      pixKey: pixKey.trim(),
      motivation: motivation.trim(),
      code: code,
      status: "pending",
      totalClicks: 0,
      totalConversions: 0,
      totalCommission: 0,
      totalPaid: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await _saveAffiliate(affiliate);
    await kv.set("affiliate_code:" + code, userId);
    await _addToAffiliateIndex(userId);

    console.log("[Affiliate] New registration: " + name + " (" + userEmail + ") code=" + code);
    return c.json({ ok: true, affiliate: affiliate });
  } catch (e: any) {
    console.log("[Affiliate] Register error: " + e);
    return c.json({ error: "Erro ao cadastrar afiliado." }, 500);
  }
});

// ─── GET /affiliate/profile ─── Get own affiliate profile
app.get(BASE + "/affiliate/profile", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var aff = await _getAffiliateById(userId);
    if (!aff) return c.json({ affiliate: null });

    return c.json({ affiliate: aff });
  } catch (e: any) {
    console.log("[Affiliate] Profile error: " + e);
    return c.json({ error: "Erro ao buscar perfil." }, 500);
  }
});

// ─── PUT /affiliate/profile ─── Update own profile
app.put(BASE + "/affiliate/profile", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var aff = await _getAffiliateById(userId);
    if (!aff) return c.json({ error: "Afiliado nao encontrado." }, 404);

    var body = await c.req.json();
    // Input validation for affiliate profile update
    var affProfValid = validate(body, {
      phone: { type: "string", maxLen: 30 },
      socialMedia: { type: "string", maxLen: 300 },
      pixKey: { type: "string", maxLen: 100 },
    });
    if (!affProfValid.ok) return c.json({ error: affProfValid.errors[0] || "Dados invalidos." }, 400);
    if (body.phone !== undefined) aff.phone = sanitizeInput(String(body.phone)).substring(0, 30);
    if (body.socialMedia !== undefined) aff.socialMedia = sanitizeInput(String(body.socialMedia)).substring(0, 300);
    if (body.pixKey !== undefined) aff.pixKey = sanitizeInput(String(body.pixKey)).substring(0, 100);
    aff.updatedAt = Date.now();

    await _saveAffiliate(aff);
    return c.json({ ok: true, affiliate: aff });
  } catch (e: any) {
    console.log("[Affiliate] Profile update error: " + e);
    return c.json({ error: "Erro ao atualizar perfil." }, 500);
  }
});

// ─── GET /affiliate/dashboard ─── Get dashboard stats
app.get(BASE + "/affiliate/dashboard", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var aff = await _getAffiliateById(userId);
    if (!aff) return c.json({ error: "Afiliado nao encontrado." }, 404);

    // Get commissions
    var commRaw = await kv.getByPrefix("affiliate_commission:" + userId + ":");
    var commissions: any[] = [];
    if (Array.isArray(commRaw)) {
      for (var i = 0; i < commRaw.length; i++) {
        try {
          var c2 = typeof commRaw[i] === "string" ? JSON.parse(commRaw[i]) : commRaw[i];
          commissions.push(c2);
        } catch (pe) { /* skip */ }
      }
    }

    // Recent commissions (last 30)
    commissions.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var recentCommissions = commissions.slice(0, 30);

    // Calculate pending (approved but not paid)
    var pendingCommission = 0;
    var approvedCommission = 0;
    for (var j = 0; j < commissions.length; j++) {
      if (commissions[j].status === "pending") pendingCommission = pendingCommission + (commissions[j].commissionValue || 0);
      if (commissions[j].status === "approved") approvedCommission = approvedCommission + (commissions[j].commissionValue || 0);
    }

    var config = await _getAffiliateConfig();

    return c.json({
      affiliate: aff,
      stats: {
        totalClicks: aff.totalClicks || 0,
        totalConversions: aff.totalConversions || 0,
        totalCommission: aff.totalCommission || 0,
        totalPaid: aff.totalPaid || 0,
        pendingCommission: pendingCommission,
        approvedCommission: approvedCommission,
        conversionRate: aff.totalClicks > 0 ? Math.round((aff.totalConversions / aff.totalClicks) * 10000) / 100 : 0,
      },
      commissions: recentCommissions,
      config: {
        commissionPercent: config.commissionPercent || 5,
        minPayout: config.minPayout || 50,
        cookieDays: config.cookieDays || 30,
      },
    });
  } catch (e: any) {
    console.log("[Affiliate] Dashboard error: " + e);
    return c.json({ error: "Erro ao buscar dashboard." }, 500);
  }
});

// ─── POST /affiliate/track-click ─── Track referral click (public)
app.post(BASE + "/affiliate/track-click", async function (c) {
  try {
    // Rate limit: 30 clicks per minute per IP to prevent inflation attacks
    var clickRlKey = _getRateLimitKey(c, "aff_click");
    var clickRlResult = _checkRateLimit(clickRlKey, 30);
    if (!clickRlResult.allowed) return _rl429(c, "Rate limit", clickRlResult);
    var body = await c.req.json();
    // Input validation for track-click
    var tcValid = validate(body, {
      code: { required: true, type: "string", maxLen: 50 },
    });
    if (!tcValid.ok) return c.json({ ok: false });
    var code = sanitizeInput(String(body.code || "")).substring(0, 50);
    if (!code) return c.json({ ok: false });

    var affUserId = await kv.get("affiliate_code:" + code);
    if (!affUserId) return c.json({ ok: false, error: "Codigo invalido." });

    var resolvedId = typeof affUserId === "string" ? affUserId.replace(/"/g, "") : String(affUserId);
    var aff = await _getAffiliateById(resolvedId);
    if (!aff || aff.status !== "approved") return c.json({ ok: false });

    aff.totalClicks = (aff.totalClicks || 0) + 1;
    aff.updatedAt = Date.now();
    await _saveAffiliate(aff);

    console.log("[Affiliate] Click tracked for code=" + code + " affiliate=" + resolvedId);
    return c.json({ ok: true });
  } catch (e: any) {
    console.log("[Affiliate] Track click error: " + e);
    return c.json({ ok: false });
  }
});

// ─── POST /affiliate/track-sale ─── Track sale commission (authenticated user)
// SECURITY: Server validates orderTotal from the stored order, NOT client-sent value.
// This prevents users from fabricating inflated totals for fake commissions.
app.post(BASE + "/affiliate/track-sale", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    // Rate limit: 10 commission tracks per minute per IP
    var affSaleRl = _getRateLimitKey(c, "aff_sale");
    var affSaleRlResult = _checkRateLimit(affSaleRl, 10);
    if (!affSaleRlResult.allowed) return _rl429(c, "Rate limit", affSaleRlResult);

    var body = await c.req.json();
    // Input validation
    var tsValid = validate(body, {
      affiliateCode: { required: true, type: "string", maxLen: 50 },
      orderId: { required: true, type: "string", maxLen: 100 },
      buyerEmail: { type: "string", maxLen: 254 },
    });
    if (!tsValid.ok) {
      return c.json({ ok: false, error: "Dados invalidos." }, 400);
    }
    var affiliateCode = sanitizeInput(tsValid.sanitized.affiliateCode || "");
    var orderId = sanitizeInput(tsValid.sanitized.orderId || "");
    var buyerEmail = sanitizeInput(tsValid.sanitized.buyerEmail || "");

    // SECURITY: Validate order belongs to user and use SERVER-SIDE total
    var orderRaw = await kv.get("user_order:" + userId + ":" + orderId);
    if (!orderRaw) {
      console.log("[Affiliate] track-sale: order not found for user " + userId + " orderId=" + orderId);
      return c.json({ ok: false, error: "Pedido nao encontrado." }, 404);
    }
    var orderData = typeof orderRaw === "string" ? JSON.parse(orderRaw) : orderRaw;
    var orderTotal = Number(orderData.total) || 0;
    if (orderTotal <= 0) {
      return c.json({ ok: false, error: "Pedido sem valor." }, 400);
    }

    if (!affiliateCode || !orderId || orderTotal <= 0) {
      return c.json({ error: "Dados incompletos." }, 400);
    }

    // Resolve affiliate
    var affUserId = await kv.get("affiliate_code:" + affiliateCode);
    if (!affUserId) return c.json({ error: "Codigo de afiliado invalido." }, 400);

    var resolvedAffId = typeof affUserId === "string" ? affUserId.replace(/"/g, "") : String(affUserId);

    // Don't allow self-referral
    if (resolvedAffId === userId) {
      console.log("[Affiliate] Self-referral blocked: " + userId);
      return c.json({ ok: false, reason: "self_referral" });
    }

    var aff = await _getAffiliateById(resolvedAffId);
    if (!aff || aff.status !== "approved") {
      return c.json({ ok: false, reason: "affiliate_not_approved" });
    }

    // Check if commission already exists for this order
    var existingComm = await kv.get("affiliate_commission:" + resolvedAffId + ":" + orderId);
    if (existingComm) {
      return c.json({ ok: true, reason: "already_tracked" });
    }

    var config = await _getAffiliateConfig();
    var commPercent = config.commissionPercent || 5;
    var commValue = Math.round(orderTotal * commPercent) / 100;

    var commission = {
      affiliateId: resolvedAffId,
      affiliateCode: affiliateCode,
      affiliateName: aff.name || "",
      orderId: orderId,
      orderTotal: orderTotal,
      commissionPercent: commPercent,
      commissionValue: commValue,
      buyerUserId: userId,
      buyerEmail: buyerEmail,
      status: "pending",
      createdAt: Date.now(),
    };

    await kv.set("affiliate_commission:" + resolvedAffId + ":" + orderId, JSON.stringify(commission));

    // Update affiliate totals
    aff.totalConversions = (aff.totalConversions || 0) + 1;
    aff.totalCommission = Math.round(((aff.totalCommission || 0) + commValue) * 100) / 100;
    aff.updatedAt = Date.now();
    await _saveAffiliate(aff);

    console.log("[Affiliate] Sale tracked: code=" + affiliateCode + " order=" + orderId + " commission=R$" + commValue.toFixed(2));
    return c.json({ ok: true, commission: commission });
  } catch (e: any) {
    console.log("[Affiliate] Track sale error: " + e);
    return c.json({ error: "Erro ao rastrear venda." }, 500);
  }
});

// ─── ADMIN: Affiliates ───

// GET /admin/affiliates — list all affiliates
app.get(BASE + "/admin/affiliates", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var ids = await _getAllAffiliateIds();
    var affiliates: any[] = [];
    for (var i = 0; i < ids.length; i++) {
      var aff = await _getAffiliateById(ids[i]);
      if (aff) affiliates.push(aff);
    }

    affiliates.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    var config = await _getAffiliateConfig();
    return c.json({ affiliates: affiliates, total: affiliates.length, config: config });
  } catch (e: any) {
    console.log("[Admin Affiliate] List error: " + e);
    return c.json({ error: "Erro ao listar afiliados." }, 500);
  }
});

// PUT /admin/affiliate/:id/status — approve/reject/suspend affiliate
app.put(BASE + "/admin/affiliate/:id/status", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var affId = (c.req.param("id") || "").substring(0, 200);
    if (!affId) return c.json({ error: "ID invalido." }, 400);
    var aff = await _getAffiliateById(affId);
    if (!aff) return c.json({ error: "Afiliado nao encontrado." }, 404);

    var body = await c.req.json();
    // Input validation for affiliate status update
    var affStValid = validate(body, {
      status: { required: true, type: "string", maxLen: 20, oneOf: ["approved", "rejected", "suspended", "pending"] },
      rejectionReason: { type: "string", maxLen: 1000 },
    });
    if (!affStValid.ok) return c.json({ error: affStValid.errors[0] || "Status invalido." }, 400);
    var newStatus = affStValid.sanitized.status;
    if (["approved", "rejected", "suspended", "pending"].indexOf(newStatus) < 0) {
      return c.json({ error: "Status invalido. Use: approved, rejected, suspended, pending" }, 400);
    }

    var oldStatus = aff.status;
    aff.status = newStatus;
    aff.updatedAt = Date.now();
    if (body.rejectionReason) aff.rejectionReason = sanitizeInput(String(body.rejectionReason).substring(0, 1000));
    await _saveAffiliate(aff);

    console.log("[Admin Affiliate] Status change: " + affId + " " + oldStatus + " -> " + newStatus);
    return c.json({ ok: true, affiliate: aff });
  } catch (e: any) {
    console.log("[Admin Affiliate] Status update error: " + e);
    return c.json({ error: "Erro ao atualizar status." }, 500);
  }
});

// GET /admin/affiliate-config — get global settings
app.get(BASE + "/admin/affiliate-config", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var config = await _getAffiliateConfig();
    return c.json({ config: config });
  } catch (e: any) {
    console.log("[Admin Affiliate] Config get error: " + e);
    return c.json({ error: "Erro ao buscar configuracao." }, 500);
  }
});

// PUT /admin/affiliate-config — update global settings
app.put(BASE + "/admin/affiliate-config", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var body = await c.req.json();
    // Input validation for affiliate config
    var affCfgValid = validate(body, {
      commissionPercent: { type: "number", min: 0, max: 100 },
      minPayout: { type: "number", min: 0, max: 99999999 },
      cookieDays: { type: "number", min: 1, max: 365 },
      enabled: { type: "boolean" },
    });
    if (!affCfgValid.ok) return c.json({ error: affCfgValid.errors[0] || "Dados invalidos." }, 400);
    var config = await _getAffiliateConfig();
    if (body.commissionPercent !== undefined) config.commissionPercent = Number(body.commissionPercent) || 5;
    if (body.minPayout !== undefined) config.minPayout = Number(body.minPayout) || 50;
    if (body.cookieDays !== undefined) config.cookieDays = Number(body.cookieDays) || 30;
    if (body.enabled !== undefined) config.enabled = Boolean(body.enabled);

    await kv.set("affiliate_config", JSON.stringify(config));
    console.log("[Admin Affiliate] Config updated: " + JSON.stringify(config));
    return c.json({ ok: true, config: config });
  } catch (e: any) {
    console.log("[Admin Affiliate] Config update error: " + e);
    return c.json({ error: "Erro ao atualizar configuracao." }, 500);
  }
});

// PUT /admin/affiliate-commission/:affId/:orderId — update commission status (approve/pay/reject)
app.put(BASE + "/admin/affiliate-commission/:affId/:orderId", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var affId = c.req.param("affId");
    var orderId = c.req.param("orderId");
    if (!affId || affId.length > 200 || !orderId || orderId.length > 200) return c.json({ error: "Parametros invalidos." }, 400);
    var body = await c.req.json();
    // Input validation for commission status update
    var commValid = validate(body, {
      status: { required: true, type: "string", maxLen: 20, oneOf: ["pending", "approved", "paid", "rejected"] },
    });
    if (!commValid.ok) return c.json({ error: commValid.errors[0] || "Status invalido." }, 400);
    var newStatus = commValid.sanitized.status;

    if (["pending", "approved", "paid", "rejected"].indexOf(newStatus) < 0) {
      return c.json({ error: "Status invalido." }, 400);
    }

    var commKey = "affiliate_commission:" + affId + ":" + orderId;
    var raw = await kv.get(commKey);
    if (!raw) return c.json({ error: "Comissao nao encontrada." }, 404);

    var comm = typeof raw === "string" ? JSON.parse(raw) : raw;
    var oldStatus = comm.status;
    comm.status = newStatus;
    comm.updatedAt = Date.now();
    comm.updatedBy = userId;

    // If marking as paid, update affiliate totalPaid
    if (newStatus === "paid" && oldStatus !== "paid") {
      var aff = await _getAffiliateById(affId);
      if (aff) {
        aff.totalPaid = Math.round(((aff.totalPaid || 0) + (comm.commissionValue || 0)) * 100) / 100;
        aff.updatedAt = Date.now();
        await _saveAffiliate(aff);
      }
    }

    await kv.set(commKey, JSON.stringify(comm));
    console.log("[Admin Affiliate] Commission " + affId + ":" + orderId + " " + oldStatus + " -> " + newStatus);
    return c.json({ ok: true, commission: comm });
  } catch (e: any) {
    console.log("[Admin Affiliate] Commission update error: " + e);
    return c.json({ error: "Erro ao atualizar comissao." }, 500);
  }
});

// GET /admin/affiliate/:id/commissions — list all commissions for an affiliate
app.get(BASE + "/admin/affiliate/:id/commissions", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    var affId = (c.req.param("id") || "").substring(0, 200);
    if (!affId) return c.json({ error: "ID invalido." }, 400);
    var commRaw = await kv.getByPrefix("affiliate_commission:" + affId + ":");
    var commissions: any[] = [];
    if (Array.isArray(commRaw)) {
      for (var i = 0; i < commRaw.length; i++) {
        try {
          var cc = typeof commRaw[i] === "string" ? JSON.parse(commRaw[i]) : commRaw[i];
          commissions.push(cc);
        } catch (pe2) { /* skip */ }
      }
    }
    commissions.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return c.json({ commissions: commissions, total: commissions.length });
  } catch (e: any) {
    console.log("[Admin Affiliate] Commissions list error: " + e);
    return c.json({ error: "Erro ao listar comissoes." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// ─── SISFRETE WEBTRACKING API (api3.sisfrete.com.br) ────────
// ═══════════════════════════════════════════════════════════════

var SISFRETE_WT_BASE = "https://api3.sisfrete.com.br/api";

async function getSisfreteWTConfig(): Promise<any> {
  var raw = await kv.get("sisfrete_wt_config");
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

app.get(BASE + "/admin/sisfrete-wt/config", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var cfg = await getSisfreteWTConfig();
    return c.json(cfg || { apiToken: "", canalVenda: "Carretao Auto Pecas", subCanal: "Loja Virtual", cnpjCd: "", enabled: false });
  } catch (e: any) {
    console.log("[SisFrete-WT] Config GET error: " + e);
    return c.json({ error: "Erro ao buscar configuracao SisFrete." }, 500);
  }
});

app.put(BASE + "/admin/sisfrete-wt/config", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var body = await c.req.json();
    // Input validation for SisFrete WT config
    var wtValid = validate(body, {
      apiToken: { type: "string", maxLen: 500 },
      canalVenda: { type: "string", maxLen: 200 },
      subCanal: { type: "string", maxLen: 200 },
      cnpjCd: { type: "string", maxLen: 20 },
      enabled: { type: "boolean" },
    });
    if (!wtValid.ok) return c.json({ error: wtValid.errors[0] || "Dados invalidos." }, 400);
    var wtCfg: Record<string, any> = {
      apiToken: String(body.apiToken || "").trim().substring(0, 500),
      canalVenda: String(body.canalVenda || "").trim().substring(0, 200),
      subCanal: String(body.subCanal || "").trim().substring(0, 200),
      cnpjCd: String(body.cnpjCd || "").trim().substring(0, 20),
      enabled: !!body.enabled,
      updatedAt: Date.now(),
    };
    await kv.set("sisfrete_wt_config", JSON.stringify(wtCfg));
    console.log("[SisFrete-WT] Config saved by " + userId);
    return c.json(wtCfg);
  } catch (e: any) {
    console.log("[SisFrete-WT] Config PUT error: " + e);
    return c.json({ error: "Erro ao salvar configuracao SisFrete." }, 500);
  }
});

app.post(BASE + "/admin/sisfrete-wt/send-order", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var cfg = await getSisfreteWTConfig();
    if (!cfg || !cfg.apiToken) return c.json({ error: "Token SisFrete Webtracking nao configurado." }, 400);
    var body = await c.req.json();
    // Input validation for send-order
    var soValid = validate(body, {
      pedidos: { required: true, type: "array", maxItems: 100 },
    });
    if (!soValid.ok) return c.json({ error: soValid.errors[0] || "Dados invalidos." }, 400);
    if (JSON.stringify(body).length > 500000) return c.json({ error: "Payload excede o tamanho maximo." }, 400);
    var pedidos = body.pedidos;
    if (!Array.isArray(pedidos) || pedidos.length === 0) return c.json({ error: "Nenhum pedido informado." }, 400);
    console.log("[SisFrete-WT] Sending " + pedidos.length + " pedido(s)");
    var sisRes = await fetch(SISFRETE_WT_BASE + "/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Token-API": cfg.apiToken },
      body: JSON.stringify({ data: pedidos }),
      signal: AbortSignal.timeout(30000),
    });
    var sisText = await sisRes.text();
    console.log("[SisFrete-WT] POST /pedidos => HTTP " + sisRes.status + " body=" + sisText.slice(0, 1000));
    var sisData: any = {};
    try { sisData = JSON.parse(sisText); } catch (pe) { sisData = { raw: sisText }; }
    if (sisRes.ok) {
      for (var sp = 0; sp < pedidos.length; sp++) {
        var ped = pedidos[sp];
        var wtKey = "sisfrete_wt_order:" + (ped.numeroDoPedido || "unknown_" + Date.now() + "_" + sp);
        await kv.set(wtKey, JSON.stringify({ sentAt: new Date().toISOString(), sentBy: userId, pedido: ped, response: sisData.data ? sisData.data[sp] : null, status: "sent" }));
      }
      return c.json({ success: true, data: sisData });
    } else {
      return c.json({ success: false, error: "SisFrete API retornou HTTP " + sisRes.status, data: sisData }, sisRes.status >= 500 ? 502 : 400);
    }
  } catch (e: any) {
    console.log("[SisFrete-WT] send-order error: " + e);
    return c.json({ error: "Erro ao enviar pedido SisFrete." }, 500);
  }
});

app.post(BASE + "/admin/sisfrete-wt/cancel-order", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var cfg = await getSisfreteWTConfig();
    if (!cfg || !cfg.apiToken) return c.json({ error: "Token SisFrete Webtracking nao configurado." }, 400);
    var body = await c.req.json();
    // Input validation for cancel-order
    var coValid = validate(body, {
      chaveNfe: { required: true, type: "string", maxLen: 100 },
      numeroDoPedido: { required: true, type: "string", maxLen: 100 },
      pedidoCanalVenda: { required: true, type: "string", maxLen: 100 },
      cnpjCd: { type: "string", maxLen: 20 },
      notificarCanal: { type: "string", maxLen: 5 },
    });
    if (!coValid.ok) return c.json({ error: coValid.errors[0] || "Dados invalidos." }, 400);
    if (!body.chaveNfe || !body.numeroDoPedido || !body.pedidoCanalVenda) return c.json({ error: "chaveNfe, numeroDoPedido e pedidoCanalVenda sao obrigatorios." }, 400);
    var cancelPayload = { chaveNfe: body.chaveNfe, numeroDoPedido: body.numeroDoPedido, pedidoCanalVenda: body.pedidoCanalVenda, cnpjCd: body.cnpjCd || cfg.cnpjCd || "", notificarCanal: body.notificarCanal || "N" };
    console.log("[SisFrete-WT] Cancelling order " + body.numeroDoPedido);
    var cancelRes = await fetch(SISFRETE_WT_BASE + "/cancela", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Token-API": cfg.apiToken },
      body: JSON.stringify(cancelPayload),
      signal: AbortSignal.timeout(15000),
    });
    var cancelText = await cancelRes.text();
    console.log("[SisFrete-WT] POST /cancela => HTTP " + cancelRes.status + " body=" + cancelText.slice(0, 500));
    var cancelData: any = {};
    try { cancelData = JSON.parse(cancelText); } catch (pe2) { cancelData = { raw: cancelText }; }
    var wtCKey = "sisfrete_wt_order:" + body.numeroDoPedido;
    var wtExisting = await kv.get(wtCKey);
    if (wtExisting) {
      var wtRec = typeof wtExisting === "string" ? JSON.parse(wtExisting) : wtExisting;
      wtRec.status = "cancelled";
      wtRec.cancelledAt = new Date().toISOString();
      wtRec.cancelledBy = userId;
      wtRec.cancelResponse = cancelData;
      await kv.set(wtCKey, JSON.stringify(wtRec));
    }
    return c.json({ success: cancelRes.ok, data: cancelData });
  } catch (e: any) {
    console.log("[SisFrete-WT] cancel-order error: " + e);
    return c.json({ error: "Erro ao cancelar pedido SisFrete." }, 500);
  }
});

app.get(BASE + "/admin/sisfrete-wt/rastreio", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var cfg = await getSisfreteWTConfig();
    if (!cfg || !cfg.apiToken) return c.json({ error: "Token SisFrete Webtracking nao configurado." }, 400);
    console.log("[SisFrete-WT] Fetching tracking events");
    var trackRes = await fetch(SISFRETE_WT_BASE + "/rastreio", {
      method: "GET",
      headers: { "Token-API": cfg.apiToken },
      signal: AbortSignal.timeout(30000),
    });
    var trackText = await trackRes.text();
    console.log("[SisFrete-WT] GET /rastreio => HTTP " + trackRes.status + " length=" + trackText.length);
    var trackData: any = [];
    try { trackData = JSON.parse(trackText); } catch (pe3) { trackData = { raw: trackText }; }
    if (trackRes.ok) {
      await kv.set("sisfrete_wt_last_rastreio", JSON.stringify({ fetchedAt: new Date().toISOString(), events: Array.isArray(trackData) ? trackData : [], count: Array.isArray(trackData) ? trackData.length : 0 }));
      return c.json({ success: true, events: Array.isArray(trackData) ? trackData : [], total: Array.isArray(trackData) ? trackData.length : 0 });
    } else {
      var errMsg = "SisFrete API retornou HTTP " + trackRes.status;
      if (trackRes.status === 401) errMsg = "Token SisFrete Webtracking invalido ou expirado. Verifique o token na aba Configuracao.";
      if (trackRes.status === 403) errMsg = "Acesso negado pela API SisFrete. Verifique as permissoes do token.";
      return c.json({ success: false, error: errMsg, data: trackData }, trackRes.status >= 500 ? 502 : 400);
    }
  } catch (e: any) {
    console.log("[SisFrete-WT] rastreio error: " + e);
    return c.json({ error: "Erro ao consultar rastreios." }, 500);
  }
});

app.get(BASE + "/admin/sisfrete-wt/sent-orders", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var sentRaw = await kv.getByPrefix("sisfrete_wt_order:");
    var sentOrders: any[] = [];
    if (Array.isArray(sentRaw)) {
      for (var si = 0; si < sentRaw.length; si++) {
        try { sentOrders.push(typeof sentRaw[si] === "string" ? JSON.parse(sentRaw[si]) : sentRaw[si]); } catch (spe) { /* skip */ }
      }
    }
    sentOrders.sort(function (a, b) { return new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime(); });
    return c.json({ orders: sentOrders, total: sentOrders.length });
  } catch (e: any) {
    console.log("[SisFrete-WT] sent-orders error: " + e);
    return c.json({ error: "Erro ao listar pedidos enviados." }, 500);
  }
});

app.post(BASE + "/admin/sisfrete-wt/send-products", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var cfg = await getSisfreteWTConfig();
    if (!cfg || !cfg.apiToken) return c.json({ error: "Token SisFrete Webtracking nao configurado." }, 400);
    var body = await c.req.json();
    // Input validation for send-products
    var sprdValid = validate(body, {
      produtos: { required: true, type: "array", maxItems: 1000 },
    });
    if (!sprdValid.ok) return c.json({ error: sprdValid.errors[0] || "Dados invalidos." }, 400);
    var produtos = sprdValid.sanitized.produtos;
    if (!Array.isArray(produtos) || produtos.length === 0) return c.json({ error: "Nenhum produto informado." }, 400);
    console.log("[SisFrete-WT] Sending " + produtos.length + " produto(s)");
    var prodRes = await fetch(SISFRETE_WT_BASE + "/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Token-API": cfg.apiToken },
      body: JSON.stringify({ data: produtos }),
      signal: AbortSignal.timeout(30000),
    });
    var prodText = await prodRes.text();
    console.log("[SisFrete-WT] POST /produtos => HTTP " + prodRes.status + " body=" + prodText.slice(0, 500));
    var prodData: any = {};
    try { prodData = JSON.parse(prodText); } catch (ppe) { prodData = { raw: prodText }; }
    return c.json({ success: prodRes.ok, data: prodData });
  } catch (e: any) {
    console.log("[SisFrete-WT] send-products error: " + e);
    return c.json({ error: "Erro ao enviar produtos SisFrete." }, 500);
  }
});

app.post(BASE + "/admin/sisfrete-wt/send-embalamento", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var cfg = await getSisfreteWTConfig();
    if (!cfg || !cfg.apiToken) return c.json({ error: "Token SisFrete Webtracking nao configurado." }, 400);
    var body = await c.req.json();
    // Input validation for send-embalamento
    var embValid = validate(body, {
      caixas: { required: true, type: "array", maxItems: 500 },
    });
    if (!embValid.ok) return c.json({ error: embValid.errors[0] || "Dados invalidos." }, 400);
    var caixas = embValid.sanitized.caixas;
    if (!Array.isArray(caixas) || caixas.length === 0) return c.json({ error: "Nenhuma caixa informada." }, 400);
    console.log("[SisFrete-WT] Sending " + caixas.length + " caixa(s)");
    var embRes = await fetch(SISFRETE_WT_BASE + "/embalamento", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Token-API": cfg.apiToken },
      body: JSON.stringify({ data: caixas }),
      signal: AbortSignal.timeout(30000),
    });
    var embText = await embRes.text();
    console.log("[SisFrete-WT] POST /embalamento => HTTP " + embRes.status + " body=" + embText.slice(0, 500));
    var embData: any = {};
    try { embData = JSON.parse(embText); } catch (epe) { embData = { raw: embText }; }
    return c.json({ success: embRes.ok, data: embData });
  } catch (e: any) {
    console.log("[SisFrete-WT] send-embalamento error: " + e);
    return c.json({ error: "Erro ao enviar embalamento." }, 500);
  }
});

// ====================== SISFRETE DELIVERY API ======================
// Base URL: https://sisfrete-delivery.persys.eti.br/api
// Auth: Authorization-API header with token

// GET /admin/sisfrete-delivery/config
app.get(BASE + "/admin/sisfrete-delivery/config", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var raw = await kv.get("sisfrete_delivery_config");
    if (raw) return c.json(JSON.parse(raw));
    return c.json({ apiToken: "", enabled: false });
  } catch (e) {
    console.log("[SisFrete Delivery] config GET error: " + String(e));
    return c.json({ error: "Erro ao carregar configuracao Delivery." }, 500);
  }
});

// PUT /admin/sisfrete-delivery/config
app.put(BASE + "/admin/sisfrete-delivery/config", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var body = await c.req.json();
    // Input validation for SisFrete Delivery config
    var dlvValid = validate(body, {
      apiToken: { type: "string", maxLen: 500 },
      enabled: { type: "boolean" },
    });
    if (!dlvValid.ok) return c.json({ error: dlvValid.errors[0] || "Dados invalidos." }, 400);
    var cfg = { apiToken: body.apiToken || "", enabled: !!body.enabled, updatedAt: new Date().toISOString() };
    await kv.set("sisfrete_delivery_config", JSON.stringify(cfg));
    return c.json(cfg);
  } catch (e) {
    console.log("[SisFrete Delivery] config PUT error: " + String(e));
    return c.json({ error: "Erro ao salvar configuracao Delivery." }, 500);
  }
});

// POST /admin/sisfrete-delivery/create-deliveryman
app.post(BASE + "/admin/sisfrete-delivery/create-deliveryman", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var raw = await kv.get("sisfrete_delivery_config");
    if (!raw) return c.json({ error: "Config SisFrete Delivery nao encontrada." }, 400);
    var cfg = JSON.parse(raw);
    if (!cfg.apiToken) return c.json({ error: "Token SisFrete Delivery nao configurado." }, 400);
    var body = await c.req.json();
    // Input validation for create deliveryman
    var dlvmValid = validate(body, {
      document: { required: true, type: "string", maxLen: 20 },
      erpCodeDeliveryman: { type: "string", maxLen: 100 },
      name: { required: true, type: "string", minLen: 2, maxLen: 200 },
      phone: { type: "string", maxLen: 30 },
      email: { type: "string", maxLen: 254 },
    });
    if (!dlvmValid.ok) return c.json({ error: dlvmValid.errors[0] || "Dados invalidos." }, 400);
    var payload = {
      document: String(body.document || "").replace(/\D/g, ""),
      erpCodeDeliveryman: String(body.erpCodeDeliveryman || ""),
      erpCodeStore: Array.isArray(body.erpCodeStore) ? body.erpCodeStore : [String(body.erpCodeStore || "1")],
      name: String(body.name || ""),
      phone: String(body.phone || "").replace(/\D/g, ""),
      active: body.active !== undefined ? String(body.active) : "",
      email: String(body.email || ""),
    };
    console.log("[SisFrete Delivery] Creating deliveryman: " + payload.name + " doc=" + payload.document);
    var res = await fetch("https://sisfrete-delivery.persys.eti.br/api/v2/deliveryman", {
      method: "POST",
      headers: { "Authorization-API": cfg.apiToken, "Content-Type": "application/json", "Accept": "*/*" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    var resText = await res.text();
    console.log("[SisFrete Delivery] Create response HTTP " + res.status + ": " + resText.slice(0, 500));
    var resData = null;
    try { resData = JSON.parse(resText); } catch (_e) { resData = resText; }
    if (res.ok) {
      var listRaw = await kv.get("sisfrete_delivery_deliverymen");
      var list = listRaw ? JSON.parse(listRaw) : [];
      list.push({ document: payload.document, erpCodeDeliveryman: payload.erpCodeDeliveryman, erpCodeStore: payload.erpCodeStore, name: payload.name, phone: payload.phone, email: payload.email, active: payload.active, createdAt: new Date().toISOString(), apiResponse: resData });
      await kv.set("sisfrete_delivery_deliverymen", JSON.stringify(list));
      return c.json({ success: true, data: resData });
    }
    return c.json({ success: false, status: res.status, error: resData }, res.status);
  } catch (e) {
    console.log("[SisFrete Delivery] create-deliveryman error: " + String(e));
    return c.json({ error: "Erro ao criar entregador." }, 500);
  }
});

// GET /admin/sisfrete-delivery/deliverymen — list local
app.get(BASE + "/admin/sisfrete-delivery/deliverymen", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var listRaw = await kv.get("sisfrete_delivery_deliverymen");
    var list = listRaw ? JSON.parse(listRaw) : [];
    return c.json({ deliverymen: list, total: list.length });
  } catch (e) {
    console.log("[SisFrete Delivery] deliverymen GET error: " + String(e));
    return c.json({ error: "Erro ao listar entregadores." }, 500);
  }
});

// GET /admin/sisfrete-delivery/deliveryman-details — from SisFrete API
app.get(BASE + "/admin/sisfrete-delivery/deliveryman-details", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var raw = await kv.get("sisfrete_delivery_config");
    if (!raw) return c.json({ error: "Config SisFrete Delivery nao encontrada." }, 400);
    var cfg = JSON.parse(raw);
    if (!cfg.apiToken) return c.json({ error: "Token SisFrete Delivery nao configurado." }, 400);
    var res = await fetch("https://sisfrete-delivery.persys.eti.br/api/deliveryman", {
      method: "GET",
      headers: { "Authorization-API": cfg.apiToken, "Accept": "*/*" },
      signal: AbortSignal.timeout(15000),
    });
    var resText = await res.text();
    console.log("[SisFrete Delivery] Details response HTTP " + res.status + ": " + resText.slice(0, 500));
    var resData = null;
    try { resData = JSON.parse(resText); } catch (_e) { resData = resText; }
    if (res.ok) return c.json({ success: true, data: resData });
    return c.json({ success: false, status: res.status, error: resData }, res.status);
  } catch (e) {
    console.log("[SisFrete Delivery] deliveryman-details error: " + String(e));
    return c.json({ error: "Erro ao consultar detalhes do entregador." }, 500);
  }
});

// PUT /admin/sisfrete-delivery/change-password
app.put(BASE + "/admin/sisfrete-delivery/change-password", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var raw = await kv.get("sisfrete_delivery_config");
    if (!raw) return c.json({ error: "Config SisFrete Delivery nao encontrada." }, 400);
    var cfg = JSON.parse(raw);
    if (!cfg.apiToken) return c.json({ error: "Token SisFrete Delivery nao configurado." }, 400);
    var body = await c.req.json();
    // Input validation for change password
    var chPwdValid = validate(body, {
      password: { required: true, type: "string", maxLen: 200, sanitize: false },
      passwordNew: { required: true, type: "string", minLen: 4, maxLen: 200, sanitize: false },
    });
    if (!chPwdValid.ok) return c.json({ error: chPwdValid.errors[0] || "Dados invalidos." }, 400);
    var payload = { password: String(body.password || ""), passwordNew: String(body.passwordNew || "") };
    console.log("[SisFrete Delivery] Changing password");
    var res = await fetch("https://sisfrete-delivery.persys.eti.br/api/deliveryman/change_password", {
      method: "PUT",
      headers: { "Authorization-API": cfg.apiToken, "Content-Type": "application/json", "Accept": "*/*" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    var resText = await res.text();
    console.log("[SisFrete Delivery] Change password response HTTP " + res.status + ": " + resText.slice(0, 300));
    var resData = null;
    try { resData = JSON.parse(resText); } catch (_e) { resData = resText; }
    if (res.ok) return c.json({ success: true, data: resData });
    return c.json({ success: false, status: res.status, error: resData }, res.status);
  } catch (e) {
    console.log("[SisFrete Delivery] change-password error: " + String(e));
    return c.json({ error: "Erro ao alterar senha do entregador." }, 500);
  }
});

// DELETE /admin/sisfrete-delivery/deliveryman — remove from local list
app.delete(BASE + "/admin/sisfrete-delivery/deliveryman", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var body = await c.req.json();
    // Input validation for deliveryman delete
    var dlvDelValid = validate(body, {
      document: { required: true, type: "string", maxLen: 20 },
    });
    if (!dlvDelValid.ok) return c.json({ error: dlvDelValid.errors[0] || "Document obrigatorio." }, 400);
    var docToRemove = String(body.document || "").replace(/\D/g, "");
    if (!docToRemove) return c.json({ error: "Document obrigatorio." }, 400);
    var listRaw = await kv.get("sisfrete_delivery_deliverymen");
    var list = listRaw ? JSON.parse(listRaw) : [];
    var newList = list.filter(function (d: any) { return d.document !== docToRemove; });
    await kv.set("sisfrete_delivery_deliverymen", JSON.stringify(newList));
    return c.json({ success: true, removed: list.length - newList.length });
  } catch (e) {
    console.log("[SisFrete Delivery] delete deliveryman error: " + String(e));
    return c.json({ error: "Erro ao remover entregador." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ███ SAFRAPAY — CREDIT CARD PAYMENT GATEWAY ███
// ═══════════════════════════════════════════════════════════════════════

var SAFRAPAY_GATEWAY_URL = "https://payment.safrapay.com.br";
var SAFRAPAY_GATEWAY_HML_URL = "https://payment-hml.safrapay.com.br";

var _safrapayTokenCache: { accessToken: string; refreshToken: string; expiresAt: number } | null = null;

async function _getSafrapayConfig(): Promise<{ merchantToken: string; merchantId: string; sandbox: boolean; maxInstallments: number; minInstallmentValue: number; softDescriptor: string; enabled: boolean } | null> {
  try {
    var raw = await kv.get("safrapay_config");
    if (raw) {
      var cfg = typeof raw === "string" ? JSON.parse(raw) : raw;
      var mt = cfg.merchantToken || Deno.env.get("SAFRAPAY_MERCHANT_TOKEN") || "";
      var mi = cfg.merchantId || Deno.env.get("SAFRAPAY_MERCHANT_ID") || "";
      if (!mt) return null;
      return { merchantToken: mt, merchantId: mi, sandbox: cfg.sandbox !== false, maxInstallments: cfg.maxInstallments || 12, minInstallmentValue: cfg.minInstallmentValue || 500, softDescriptor: cfg.softDescriptor || "CARRETAO", enabled: cfg.enabled !== false };
    }
    var envMT = Deno.env.get("SAFRAPAY_MERCHANT_TOKEN") || "";
    var envMI = Deno.env.get("SAFRAPAY_MERCHANT_ID") || "";
    if (!envMT) return null;
    return { merchantToken: envMT, merchantId: envMI, sandbox: true, maxInstallments: 12, minInstallmentValue: 500, softDescriptor: "CARRETAO", enabled: true };
  } catch (e) {
    console.log("[SafraPay] Config read error: " + String(e));
    return null;
  }
}

function _safrapayGwUrl(sandbox: boolean): string {
  return sandbox ? SAFRAPAY_GATEWAY_HML_URL : SAFRAPAY_GATEWAY_URL;
}

async function _safrapayGatewayAuth(cfg: { merchantToken: string; sandbox: boolean }): Promise<{ accessToken: string; refreshToken: string }> {
  if (_safrapayTokenCache && Date.now() < _safrapayTokenCache.expiresAt) {
    return { accessToken: _safrapayTokenCache.accessToken, refreshToken: _safrapayTokenCache.refreshToken };
  }
  if (_safrapayTokenCache && _safrapayTokenCache.refreshToken) {
    try {
      var rr = await fetch(_safrapayGwUrl(cfg.sandbox) + "/v2/refreshtoken", {
        method: "POST",
        headers: { "Authorization": "Bearer " + _safrapayTokenCache.accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: _safrapayTokenCache.accessToken, refreshToken: _safrapayTokenCache.refreshToken })
      });
      if (rr.ok) {
        var rd = await rr.json();
        if (rd.success && rd.accessToken) {
          _safrapayTokenCache = { accessToken: rd.accessToken, refreshToken: rd.refreshToken || _safrapayTokenCache.refreshToken, expiresAt: Date.now() + 25 * 60 * 1000 };
          console.log("[SafraPay] Token refreshed OK");
          return { accessToken: _safrapayTokenCache.accessToken, refreshToken: _safrapayTokenCache.refreshToken };
        }
      }
    } catch (re) { console.log("[SafraPay] Refresh failed, re-auth: " + String(re)); }
  }
  var authUrl = _safrapayGwUrl(cfg.sandbox) + "/v2/merchant/auth";
  console.log("[SafraPay] Auth POST " + authUrl + " token-len=" + (cfg.merchantToken || "").length);
  var ar = await fetch(authUrl, { method: "POST", headers: { "Authorization": cfg.merchantToken } });
  if (!ar.ok) { var et = await ar.text(); console.log("[SafraPay] Auth FAILED status=" + ar.status + " body=" + et); throw new Error("SafraPay auth failed (" + ar.status + "): " + et); }
  var ad = await ar.json();
  if (!ad.success) throw new Error("SafraPay auth error: " + JSON.stringify(ad.errors || []));
  _safrapayTokenCache = { accessToken: ad.accessToken, refreshToken: ad.refreshToken, expiresAt: Date.now() + 25 * 60 * 1000 };
  console.log("[SafraPay] Authenticated OK, cached 25min");
  return { accessToken: ad.accessToken, refreshToken: ad.refreshToken };
}

function _detectCardBrand(n: string): number {
  var d = n.replace(/\D/g, "");
  if (d.startsWith("4")) return 1;
  if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return 2;
  if (d.startsWith("34") || d.startsWith("37")) return 3;
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011|506699)/.test(d)) return 4;
  if (/^(606282|3841|637|628)/.test(d)) return 5;
  return 1;
}

// POST /safrapay/charge — Process credit card payment
app.post(BASE + "/safrapay/charge", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var cfg = await _getSafrapayConfig();
    if (!cfg || !cfg.enabled) return c.json({ error: "Pagamento com cartao nao disponivel." }, 400);
    var body = await c.req.json();
    // Input validation for SafraPay charge
    var chgValid = validate(body, {
      cardNumber: { required: true, type: "string", minLen: 13, maxLen: 25 },
      cvv: { required: true, type: "string", minLen: 3, maxLen: 4 },
      cardholderName: { required: true, type: "string", minLen: 2, maxLen: 200 },
      cardholderDocument: { required: true, type: "string", maxLen: 20 },
      expirationMonth: { required: true, type: "number", min: 1, max: 12 },
      expirationYear: { required: true, type: "number", min: 2024, max: 2050 },
      amount: { required: true, type: "number", min: 100, max: 99999999 },
      installmentNumber: { type: "number", min: 1, max: 24 },
      installmentType: { type: "number", min: 0, max: 10 },
      customerName: { type: "string", maxLen: 200 },
      customerEmail: { type: "string", maxLen: 254 },
      customerPhone: { type: "string", maxLen: 30 },
      merchantChargeId: { type: "string", maxLen: 100 },
    });
    if (!chgValid.ok) return c.json({ error: chgValid.errors[0] || "Dados do cartao invalidos." }, 400);
    var cardNum = String(body.cardNumber || "").replace(/\D/g, "");
    var cvv = String(body.cvv || "");
    var holderName = String(body.cardholderName || "");
    var holderDoc = String(body.cardholderDocument || "").replace(/\D/g, "");
    var expMonth = Number(body.expirationMonth || 0);
    var expYear = Number(body.expirationYear || 0);
    var amt = Number(body.amount || 0);
    var instNum = Number(body.installmentNumber || 1);
    var instType = Number(body.installmentType || 0);
    var custName = String(body.customerName || "");
    var custEmail = String(body.customerEmail || "");
    var custPhone = String(body.customerPhone || "").replace(/\D/g, "");
    var mChargeId = String(body.merchantChargeId || ("CRT-" + Date.now()));

    if (!cardNum || cardNum.length < 13) return c.json({ error: "Numero do cartao invalido." }, 400);
    if (!cvv || cvv.length < 3) return c.json({ error: "CVV invalido." }, 400);
    if (!holderName) return c.json({ error: "Nome do titular obrigatorio." }, 400);
    if (!holderDoc) return c.json({ error: "CPF do titular obrigatorio." }, 400);
    if (!expMonth || !expYear) return c.json({ error: "Validade obrigatoria." }, 400);
    if (amt < 100) return c.json({ error: "Valor minimo R$1,00." }, 400);
    if (instNum < 1 || instNum > cfg.maxInstallments) return c.json({ error: "Parcelas devem ser entre 1 e " + cfg.maxInstallments + "." }, 400);

    var brand = _detectCardBrand(cardNum);
    var fInstType = 0;
    if (instNum > 1) fInstType = instType || 1;

    var tokens = await _safrapayGatewayAuth(cfg);
    var payload = {
      charge: {
        merchantChargeId: mChargeId,
        customer: {
          name: custName,
          email: custEmail,
          document: holderDoc,
          documentType: 1,
          phone: { countryCode: "55", areaCode: custPhone.length >= 2 ? custPhone.substring(0, 2) : "11", number: custPhone.length > 2 ? custPhone.substring(2) : custPhone, type: 5 }
        },
        transactions: [{
          card: { cardNumber: cardNum, cvv: cvv, brand: brand, cardholderName: holderName, cardholderDocument: holderDoc, expirationMonth: expMonth, expirationYear: expYear },
          paymentType: 2,
          amount: amt,
          installmentNumber: instNum,
          installmentType: fInstType,
          softDescriptor: cfg.softDescriptor
        }],
        source: 8
      },
      capture: true
    };

    console.log("[SafraPay] Charge " + amt + "c " + instNum + "x brand=" + brand + " id=" + mChargeId);
    var cr = await fetch(_safrapayGwUrl(cfg.sandbox) + "/v2/charge/authorization", {
      method: "POST",
      headers: { "Authorization": "Bearer " + tokens.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    var cd = await cr.json();
    console.log("[SafraPay] Charge resp: status=" + cr.status + " success=" + String(cd.success) + " chargeStatus=" + String(cd.charge ? cd.charge.chargeStatus : "N/A"));

    if (!cd.success) {
      var em = "Pagamento nao aprovado.";
      if (cd.errors && cd.errors.length > 0) em = cd.errors.map(function(e: any) { return e.message || String(e.errorCode); }).join("; ");
      console.log("[SafraPay] Charge failed: " + em);
      return c.json({ success: false, error: em, errors: cd.errors || [], traceKey: cd.traceKey || null });
    }

    var ch = cd.charge || {};
    var tx = ch.transactions && ch.transactions[0] ? ch.transactions[0] : {};

    // SECURITY: Persist verified charge ID so save-order can validate credit card payments
    if (ch.id) {
      await kv.set("safrapay_charge:" + ch.id, JSON.stringify({
        userId: userId,
        chargeId: ch.id,
        amount: tx.amount || amt,
        isApproved: tx.isApproved || false,
        chargeStatus: ch.chargeStatus,
        createdAt: Date.now(),
      }));
    }

    return c.json({
      success: true,
      chargeId: ch.id || null,
      nsu: ch.nsu || null,
      chargeStatus: ch.chargeStatus || null,
      merchantChargeId: ch.merchantChargeId || null,
      customerId: ch.customerId || null,
      transaction: {
        isApproved: tx.isApproved || false,
        transactionId: tx.transactionId || null,
        transactionStatus: tx.transactionStatus || null,
        amount: tx.amount || amt,
        installmentNumber: tx.installmentNumber || instNum,
        installmentType: tx.installmentType || null,
        isCapture: tx.isCapture || false,
        cardNumber: tx.card ? tx.card.cardNumber : null,
        brandName: tx.card ? tx.card.brandName : null,
        authorizationCode: tx.authorizationCode || null,
        acquirer: tx.acquirer || null,
        softDescriptor: tx.softDescriptor || null
      },
      traceKey: cd.traceKey || null
    });
  } catch (e) {
    console.log("[SafraPay] Charge exception: " + String(e));
    return c.json({ success: false, error: "Erro ao processar cartao." }, 500);
  }
});

// GET /safrapay/config — Admin get config
app.get(BASE + "/safrapay/config", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var cfg = await _getSafrapayConfig();
    return c.json({ configured: !!cfg, sandbox: cfg ? cfg.sandbox : true, merchantId: cfg ? cfg.merchantId : null, hasToken: cfg ? !!cfg.merchantToken : false, maxInstallments: cfg ? cfg.maxInstallments : 12, minInstallmentValue: cfg ? cfg.minInstallmentValue : 500, softDescriptor: cfg ? cfg.softDescriptor : "CARRETAO", enabled: cfg ? cfg.enabled : false });
  } catch (e) { console.log("[SafraPay] Config GET error:", e); return c.json({ error: "Erro ao buscar configuracao SafraPay." }, 500); }
});

// POST /safrapay/config — Admin save config
app.post(BASE + "/safrapay/config", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var body = await c.req.json();
    // Input validation for SafraPay config
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Body deve ser um objeto JSON." }, 400);
    }
    var spCfgValid = validate(body, {
      merchantToken: { type: "string", maxLen: 500 },
      merchantId: { type: "string", maxLen: 200 },
      sandbox: { type: "boolean" },
      maxInstallments: { type: "number", min: 1, max: 24 },
      minInstallmentValue: { type: "number", min: 0, max: 99999999 },
      softDescriptor: { type: "string", maxLen: 50 },
      enabled: { type: "boolean" },
    });
    if (!spCfgValid.ok) return c.json({ error: spCfgValid.errors[0] || "Dados invalidos." }, 400);
    await kv.set("safrapay_config", JSON.stringify({
      merchantToken: String(body.merchantToken || ""),
      merchantId: String(body.merchantId || ""),
      sandbox: body.sandbox !== false,
      maxInstallments: Number(body.maxInstallments) || 12,
      minInstallmentValue: Number(body.minInstallmentValue) || 500,
      softDescriptor: String(body.softDescriptor || "CARRETAO"),
      enabled: body.enabled !== false
    }));
    _safrapayTokenCache = null;
    console.log("[SafraPay] Config saved by " + userId);
    return c.json({ success: true });
  } catch (e) { console.log("[SafraPay] Config PUT error:", e); return c.json({ error: "Erro ao salvar configuracao SafraPay." }, 500); }
});

// POST /safrapay/activate — Activate merchant with activation code to get MerchantToken
app.post(BASE + "/safrapay/activate", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var body = await c.req.json();
    // Input validation for SafraPay activate
    var spActValid = validate(body, {
      merchantId: { required: true, type: "string", minLen: 1, maxLen: 200 },
      activationCode: { required: true, type: "string", minLen: 1, maxLen: 200 },
      sandbox: { type: "boolean" },
    });
    if (!spActValid.ok) return c.json({ error: spActValid.errors[0] || "merchantId e activationCode sao obrigatorios." }, 400);
    var merchantId = (spActValid.sanitized.merchantId || "").trim();
    var activationCode = (spActValid.sanitized.activationCode || "").trim();
    var sandbox = body.sandbox !== false;
    if (!merchantId || !activationCode) return c.json({ error: "merchantId e activationCode sao obrigatorios." }, 400);
    var sfDomain = "safrapay.com.br";
    var candidateUrls = sandbox ? [
      "https://api-hml." + sfDomain + "/v2/Merchant/Activate",
      "https://api-hml." + sfDomain + "/v1/Merchant/Activate",
      "https://api-hml." + sfDomain + "/v2/merchant/activate",
      "https://api-hml." + sfDomain + "/v1/merchant/activate",
      "https://payment-hml." + sfDomain + "/v2/Merchant/Activate",
      "https://payment-hml." + sfDomain + "/v1/Merchant/Activate"
    ] : [
      "https://api." + sfDomain + "/v2/Merchant/Activate",
      "https://api." + sfDomain + "/v1/Merchant/Activate",
      "https://api." + sfDomain + "/v2/merchant/activate",
      "https://api." + sfDomain + "/v1/merchant/activate",
      "https://payment." + sfDomain + "/v2/Merchant/Activate",
      "https://payment." + sfDomain + "/v1/Merchant/Activate"
    ];
    var payloadStr = JSON.stringify({ merchantId: merchantId, activationCode: activationCode });
    var lastStatus = 0;
    var lastBody = "";
    var successData: any = null;
    for (var ci = 0; ci < candidateUrls.length; ci++) {
      var tryUrl = candidateUrls[ci];
      console.log("[SafraPay] Activate attempt " + (ci + 1) + "/" + candidateUrls.length + " POST " + tryUrl);
      try {
        var resp = await fetch(tryUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: payloadStr });
        var respText = await resp.text();
        lastStatus = resp.status;
        lastBody = respText;
        console.log("[SafraPay] Activate attempt " + (ci + 1) + " status=" + resp.status + " body=" + respText.substring(0, 500));
        if (resp.status === 404 || resp.status === 405) continue;
        if (resp.ok) {
          try { successData = JSON.parse(respText); } catch (pe) { successData = null; }
          if (successData) { console.log("[SafraPay] Activate SUCCESS on " + tryUrl); break; }
        }
        if (resp.status !== 404 && resp.status !== 405) break;
      } catch (fetchErr) {
        console.log("[SafraPay] Activate attempt " + (ci + 1) + " fetch error: " + String(fetchErr));
        lastBody = String(fetchErr);
        continue;
      }
    }
    if (!successData) {
      return c.json({ error: "Ativacao falhou em todas URLs tentadas. Ultimo status=" + lastStatus + " resposta=" + lastBody }, 400);
    }
    var newToken = successData.merchantToken || successData.token || successData.MerchantToken || successData.Token || "";
    if (!newToken) {
      return c.json({ error: "Token nao encontrado na resposta. Campos: " + Object.keys(successData).join(", ") + " Resposta: " + JSON.stringify(successData) }, 400);
    }
    var existingRaw = await kv.get("safrapay_config");
    var existingCfg: any = {};
    if (existingRaw) { try { existingCfg = typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw; } catch (x) {} }
    existingCfg.merchantToken = newToken;
    existingCfg.merchantId = merchantId;
    existingCfg.sandbox = sandbox;
    if (!existingCfg.maxInstallments) existingCfg.maxInstallments = 12;
    if (!existingCfg.minInstallmentValue) existingCfg.minInstallmentValue = 500;
    if (!existingCfg.softDescriptor) existingCfg.softDescriptor = "CARRETAO";
    existingCfg.enabled = true;
    await kv.set("safrapay_config", JSON.stringify(existingCfg));
    _safrapayTokenCache = null;
    console.log("[SafraPay] Activated and config saved! token-len=" + newToken.length);
    return c.json({ success: true, merchantToken: newToken, message: "Merchant ativado com sucesso! Token salvo automaticamente." });
  } catch (e) { console.log("[SafraPay] Activate error: " + String(e)); return c.json({ error: "Erro ao ativar merchant SafraPay." }, 500); }
});

// GET /safrapay/test-auth — Test connection with SafraPay gateway
app.get(BASE + "/safrapay/test-auth", async function (c) {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    var isAdmin = await checkAdmin(userId);
    if (!isAdmin) return c.json({ error: "Acesso negado." }, 403);
    var cfg = await _getSafrapayConfig();
    if (!cfg || !cfg.merchantToken) return c.json({ error: "MerchantToken nao configurado. Salve a Chave de Acesso primeiro.", success: false }, 400);
    _safrapayTokenCache = null;
    var auth = await _safrapayGatewayAuth(cfg);
    if (auth && auth.accessToken) {
      return c.json({ success: true, message: "Autenticacao OK! AccessToken gerado com sucesso. Expira em 30min." });
    }
    return c.json({ error: "Auth retornou sem accessToken.", success: false }, 400);
  } catch (e) {
    console.log("[SafraPay] Test auth error: " + String(e));
    return c.json({ error: "Falha na autenticacao SafraPay.", success: false }, 400);
  }
});

// GET /safrapay/public-config — Public: is credit card enabled + rules
app.get(BASE + "/safrapay/public-config", async function (c) {
  try {
    var raw = await kv.get("safrapay_config");
    if (!raw) {
      var envMT = Deno.env.get("SAFRAPAY_MERCHANT_TOKEN") || "";
      if (envMT) return c.json({ enabled: true, maxInstallments: 12, minInstallmentValue: 500, sandbox: true });
      return c.json({ enabled: false });
    }
    var cfg = typeof raw === "string" ? JSON.parse(raw) : raw;
    var hasT = !!(cfg.merchantToken || Deno.env.get("SAFRAPAY_MERCHANT_TOKEN"));
    return c.json({ enabled: cfg.enabled !== false && hasT, maxInstallments: cfg.maxInstallments || 12, minInstallmentValue: cfg.minInstallmentValue || 500, sandbox: cfg.sandbox !== false });
  } catch (e) { return c.json({ enabled: false }); }
});

// POST /safrapay/webhook — Receive SafraPay notifications
app.post(BASE + "/safrapay/webhook", async function (c) {
  try {
    var body = await c.req.json();
    // Input validation for SafraPay webhook payload
    if (!body || typeof body !== "object") return c.json({ received: true, warning: "invalid body" });
    if (JSON.stringify(body).length > 50000) return c.json({ received: true, warning: "payload too large" });
    console.log("[SafraPay WH] " + JSON.stringify(body).substring(0, 2000));
    var authH = c.req.header("Authorization") || "";
    var cfg = await _getSafrapayConfig();
    // SECURITY: Always require merchantToken for webhook auth — reject if not configured
    if (!cfg || !cfg.merchantToken) {
      console.log("[SafraPay WH] REJECTED: merchantToken not configured");
      return c.json({ received: false, error: "Webhook auth not configured" }, 403);
    }
    try { var dec = atob(authH); if (dec !== cfg.merchantToken) { console.log("[SafraPay WH] Auth mismatch"); return c.json({ received: false }, 403); } } catch (de) { console.log("[SafraPay WH] Auth decode failed"); return c.json({ received: false }, 403); }
    var cId = body.ChargeId || body.chargeId || "";
    var cSt = body.ChargeStatus || body.chargeStatus || "";
    console.log("[SafraPay WH] chargeId=" + cId + " status=" + cSt);
    if (cId) {
      var allK = await kv.getByPrefix("user_order:");
      if (Array.isArray(allK)) {
        for (var i = 0; i < allK.length; i++) {
          try {
            var od = typeof allK[i].value === "string" ? JSON.parse(allK[i].value) : allK[i].value;
            if (od && od.safrapayChargeId === cId) {
              var ns = od.status;
              if (cSt === "Authorized" || cSt === 2) ns = "paid";
              else if (cSt === "Canceled" || cSt === 6) ns = "cancelled";
              else if (cSt === "Refunded" || cSt === 7) ns = "refunded";
              if (ns !== od.status) {
                od.status = ns;
                od.updatedAt = new Date().toISOString();
                od.safrapayWebhookStatus = cSt;
                await kv.set(allK[i].key, JSON.stringify(od));
                console.log("[SafraPay WH] Order " + od.localOrderId + " -> " + ns);
                if (ns === "paid" && !od.emailSent) {
                  od.emailSent = true;
                  await kv.set(allK[i].key, JSON.stringify(od));
                  _sendPaymentApprovedEmail(od).catch(function(ee) { console.log("[SafraPay WH] Email err: " + ee); });
                }
              }
              break;
            }
          } catch (pe) {}
        }
      }
    }
    return c.json({ received: true });
  } catch (e) {
    console.log("[SafraPay WH] Exception: " + String(e));
    return c.json({ received: true });
  }
});

// ═══════════════════════════════════════════════════════
// ─── BRANCHES (Filiais) — Managed via Admin, displayed on About page
// ═══════════════════════════════════════════════════════

// GET /branches — public list of active branches (sorted by order)
app.get(BASE + "/branches", async (c) => {
  try {
    var allRaw = await kv.getByPrefix("branch:");
    var items: any[] = [];
    for (var bi = 0; bi < allRaw.length; bi++) {
      try {
        var parsed = typeof allRaw[bi] === "string" ? JSON.parse(allRaw[bi]) : allRaw[bi];
        if (parsed && parsed.id && parsed.active !== false) {
          items.push(parsed);
        }
      } catch {}
    }
    items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    return c.json({ branches: items });
  } catch (e: any) {
    console.log("[branches GET] Error: " + String(e));
    return c.json({ error: "Erro ao buscar filiais." }, 500);
  }
});

// GET /admin/branches — admin list all branches (including inactive)
app.get(BASE + "/admin/branches", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    var allRaw = await kv.getByPrefix("branch:");
    var items: any[] = [];
    for (var bi = 0; bi < allRaw.length; bi++) {
      try {
        var parsed = typeof allRaw[bi] === "string" ? JSON.parse(allRaw[bi]) : allRaw[bi];
        if (parsed && parsed.id) items.push(parsed);
      } catch {}
    }
    items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    return c.json({ branches: items });
  } catch (e: any) {
    console.log("[admin/branches GET] Error: " + String(e));
    return c.json({ error: "Erro ao buscar filiais." }, 500);
  }
});

// PUT /admin/branches/:id — create or update a branch
app.put(BASE + "/admin/branches/:id", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    var branchId = c.req.param("id");
    if (!branchId || branchId.length > 100) return c.json({ error: "ID invalido." }, 400);
    var formData = await c.req.formData();

    var nome = sanitizeInput(String(formData.get("nome") || "")).substring(0, 200);
    var estado = sanitizeInput(String(formData.get("estado") || "")).substring(0, 50);
    var endereco = sanitizeInput(String(formData.get("endereco") || "")).substring(0, 500);
    var telefone = sanitizeInput(String(formData.get("telefone") || "")).substring(0, 30);
    var whatsapp = sanitizeInput(String(formData.get("whatsapp") || "")).substring(0, 30);
    var horario = sanitizeInput(String(formData.get("horario") || "")).substring(0, 300);
    var isMatriz = formData.get("isMatriz") === "true";
    var active = formData.get("active") !== "false";
    var order = Math.min(Math.max(parseInt((formData.get("order") as string) || "0", 10) || 0, 0), 9999);
    var mapQuery = sanitizeInput(String(formData.get("mapQuery") || "")).substring(0, 500);
    var imageFile = formData.get("image") as File | null;

    var kvKey = "branch:" + branchId;
    var existingRaw = await kv.get(kvKey);
    var current: any = existingRaw ? (typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw) : {};

    if (imageFile && imageFile.size > 0) {
      var ext = imageFile.name.split(".").pop() || "jpg";
      var storagePath = "branches/" + branchId + "-" + Date.now() + "." + ext;
      if (current.filename) {
        try {
          await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([current.filename]);
        } catch {}
      }
      var arrayBuf = await imageFile.arrayBuffer();
      var uploadRes = await supabaseAdmin.storage.from(ASSETS_BUCKET).upload(storagePath, arrayBuf, {
        contentType: imageFile.type || "image/jpeg",
        upsert: true,
      });
      if (uploadRes.error) {
        console.log("[admin/branches PUT] Upload error: " + uploadRes.error.message);
        return c.json({ error: "Erro no upload da imagem." }, 500);
      }
      var supaUrl = Deno.env.get("SUPABASE_URL");
      current.filename = storagePath;
      current.imageUrl = supaUrl + "/storage/v1/object/public/" + ASSETS_BUCKET + "/" + storagePath;
    }

    current.id = branchId;
    current.nome = nome;
    current.estado = estado;
    current.endereco = endereco;
    current.telefone = telefone;
    current.whatsapp = whatsapp;
    current.horario = horario;
    current.isMatriz = isMatriz;
    current.active = active;
    current.order = order;
    current.mapQuery = mapQuery;
    current.updatedAt = Date.now();
    if (!current.createdAt) current.createdAt = Date.now();

    await kv.set(kvKey, JSON.stringify(current));
    console.log("[admin/branches PUT] Saved branch: " + branchId + " (" + nome + ")");
    return c.json({ branch: current });
  } catch (e: any) {
    console.log("[admin/branches PUT] Error: " + String(e));
    return c.json({ error: "Erro ao salvar filial." }, 500);
  }
});

// DELETE /admin/branches/:id — delete a branch
app.delete(BASE + "/admin/branches/:id", async (c) => {
  try {
    var userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    var branchId = (c.req.param("id") || "").substring(0, 100);
    if (!branchId) return c.json({ error: "ID invalido." }, 400);
    var kvKey = "branch:" + branchId;
    var existingRaw = await kv.get(kvKey);
    if (existingRaw) {
      var parsed = typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw;
      if (parsed.filename) {
        try {
          await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([parsed.filename]);
        } catch {}
      }
    }
    await kv.del(kvKey);
    console.log("[admin/branches DELETE] Deleted branch: " + branchId);
    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("[admin/branches DELETE] Error: " + String(e));
    return c.json({ error: "Erro ao excluir filial." }, 500);
  }
});

Deno.serve(app.fetch);