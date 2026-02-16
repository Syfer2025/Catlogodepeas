import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";
import { seedData } from "./seed.tsx";

const app = new Hono();

// Supabase admin client (service role)
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Helper: verify auth token and return user id
async function getAuthUserId(request: Request): Promise<string | null> {
  // Check X-User-Token first (used when Authorization carries the anon key),
  // then fall back to Authorization header
  const userToken = request.headers.get("X-User-Token") 
    || request.headers.get("Authorization")?.split(" ")[1];
  if (!userToken) return null;
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(userToken);
    if (error || !user?.id) return null;
    return user.id;
  } catch {
    return null;
  }
}

// Enable logger
app.use("*", logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  })
);

const BASE = "/make-server-b7b07654";

// ─── Health ───
app.get(`${BASE}/health`, (c) => {
  return c.json({ status: "ok" });
});

// ─── Seed ───
app.post(`${BASE}/seed`, async (c) => {
  try {
    const wasSeeded = await seedData();
    return c.json({ seeded: wasSeeded });
  } catch (e) {
    console.log("Error seeding data:", e);
    return c.json({ error: `Error seeding data: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── AUTH ─────────────────────────────
// ═══════════════════════════════════════

// Signup (creates user with admin service role)
app.post(`${BASE}/signup`, async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "Email e senha são obrigatórios." }, 400);
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || "Admin" },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true,
    });
    if (error) {
      console.log("Signup error:", error.message);
      return c.json({ error: `Erro ao criar usuário: ${error.message}` }, 400);
    }
    return c.json({ user: { id: data.user.id, email: data.user.email } }, 201);
  } catch (e) {
    console.log("Signup exception:", e);
    return c.json({ error: `Erro interno no signup: ${e}` }, 500);
  }
});

// Verify session (check if token is valid)
app.get(`${BASE}/auth/me`, async (c) => {
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
    return c.json({ error: `Erro na verificação de auth: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── PRODUCTS ─────────────────────────
// ═══════════════════════════════════════

app.get(`${BASE}/products`, async (c) => {
  try {
    const products = await kv.getByPrefix("product:");
    return c.json(products);
  } catch (e) {
    console.log("Error fetching products:", e);
    return c.json({ error: `Error fetching products: ${e}` }, 500);
  }
});

app.get(`${BASE}/products/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    const product = await kv.get(`product:${id}`);
    if (!product) {
      return c.json({ error: `Product not found: ${id}` }, 404);
    }
    return c.json(product);
  } catch (e) {
    console.log("Error fetching product:", e);
    return c.json({ error: `Error fetching product: ${e}` }, 500);
  }
});

app.post(`${BASE}/products`, async (c) => {
  try {
    const body = await c.req.json();
    const id = body.id || `prod_${Date.now()}`;
    const product = { ...body, id };
    await kv.set(`product:${id}`, product);
    return c.json(product, 201);
  } catch (e) {
    console.log("Error creating product:", e);
    return c.json({ error: `Error creating product: ${e}` }, 500);
  }
});

app.put(`${BASE}/products/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const existing = await kv.get(`product:${id}`);
    if (!existing) {
      return c.json({ error: `Product not found for update: ${id}` }, 404);
    }
    const updated = { ...existing, ...body, id };
    await kv.set(`product:${id}`, updated);
    return c.json(updated);
  } catch (e) {
    console.log("Error updating product:", e);
    return c.json({ error: `Error updating product: ${e}` }, 500);
  }
});

app.delete(`${BASE}/products/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    await kv.del(`product:${id}`);
    return c.json({ deleted: true });
  } catch (e) {
    console.log("Error deleting product:", e);
    return c.json({ error: `Error deleting product: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── CATEGORIES ───────────────────────
// ═══════════════════════════════════════

app.get(`${BASE}/categories`, async (c) => {
  try {
    const categories = await kv.getByPrefix("category:");
    return c.json(categories);
  } catch (e) {
    console.log("Error fetching categories:", e);
    return c.json({ error: `Error fetching categories: ${e}` }, 500);
  }
});

app.post(`${BASE}/categories`, async (c) => {
  try {
    const body = await c.req.json();
    const id = body.id || `cat_${Date.now()}`;
    const category = { ...body, id };
    await kv.set(`category:${id}`, category);
    return c.json(category, 201);
  } catch (e) {
    console.log("Error creating category:", e);
    return c.json({ error: `Error creating category: ${e}` }, 500);
  }
});

app.put(`${BASE}/categories/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const existing = await kv.get(`category:${id}`);
    if (!existing) {
      return c.json({ error: `Category not found for update: ${id}` }, 404);
    }
    const updated = { ...existing, ...body, id };
    await kv.set(`category:${id}`, updated);
    return c.json(updated);
  } catch (e) {
    console.log("Error updating category:", e);
    return c.json({ error: `Error updating category: ${e}` }, 500);
  }
});

app.delete(`${BASE}/categories/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    await kv.del(`category:${id}`);
    return c.json({ deleted: true });
  } catch (e) {
    console.log("Error deleting category:", e);
    return c.json({ error: `Error deleting category: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── CATEGORY TREE (hierarchical) ─────
// ═══════════════════════════════════════

app.get(`${BASE}/category-tree`, async (c) => {
  try {
    const tree = await kv.get("category_tree");
    if (!tree) {
      return c.json([]);
    }
    return c.json(tree);
  } catch (e) {
    console.log("Error fetching category tree:", e);
    return c.json({ error: `Error fetching category tree: ${e}` }, 500);
  }
});

app.put(`${BASE}/category-tree`, async (c) => {
  try {
    const body = await c.req.json();
    await kv.set("category_tree", body);
    return c.json(body);
  } catch (e) {
    console.log("Error saving category tree:", e);
    return c.json({ error: `Error saving category tree: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── MESSAGES ─────────────────────────
// ══════════════════════════════════════

app.get(`${BASE}/messages`, async (c) => {
  try {
    const messages = await kv.getByPrefix("message:");
    return c.json(messages);
  } catch (e) {
    console.log("Error fetching messages:", e);
    return c.json({ error: `Error fetching messages: ${e}` }, 500);
  }
});

app.post(`${BASE}/messages`, async (c) => {
  try {
    const body = await c.req.json();
    const id = body.id || `msg_${Date.now()}`;
    const message = { ...body, id, read: false, date: new Date().toLocaleString("pt-BR") };
    await kv.set(`message:${id}`, message);
    return c.json(message, 201);
  } catch (e) {
    console.log("Error creating message:", e);
    return c.json({ error: `Error creating message: ${e}` }, 500);
  }
});

app.put(`${BASE}/messages/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const existing = await kv.get(`message:${id}`);
    if (!existing) {
      return c.json({ error: `Message not found for update: ${id}` }, 404);
    }
    const updated = { ...existing, ...body };
    await kv.set(`message:${id}`, updated);
    return c.json(updated);
  } catch (e) {
    console.log("Error updating message:", e);
    return c.json({ error: `Error updating message: ${e}` }, 500);
  }
});

app.delete(`${BASE}/messages/:id`, async (c) => {
  try {
    const id = c.req.param("id");
    await kv.del(`message:${id}`);
    return c.json({ deleted: true });
  } catch (e) {
    console.log("Error deleting message:", e);
    return c.json({ error: `Error deleting message: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SETTINGS ─────────────────────────
// ═══════════════════════════════════════

app.get(`${BASE}/settings`, async (c) => {
  try {
    const settings = await kv.get("settings");
    return c.json(settings || {});
  } catch (e) {
    console.log("Error fetching settings:", e);
    return c.json({ error: `Error fetching settings: ${e}` }, 500);
  }
});

app.put(`${BASE}/settings`, async (c) => {
  try {
    const body = await c.req.json();
    await kv.set("settings", body);
    return c.json(body);
  } catch (e) {
    console.log("Error updating settings:", e);
    return c.json({ error: `Error updating settings: ${e}` }, 500);
  }
});

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

// ═══════════════════════════════════════════════════════
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
app.get(`${BASE}/produtos/imagens/:sku`, async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku"));
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
      return c.json({ sku, images: [], total: 0, error: error.message });
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
    return c.json({ error: `Erro ao listar imagens: ${e}`, sku: c.req.param("sku"), images: [], total: 0 }, 500);
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
app.get(`${BASE}/produtos/atributos`, async (c) => {
  try {
    const skuParam = (c.req.query("sku") || "").trim();
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
    return c.json({ error: `Erro ao buscar atributos: ${e}`, attributes: null, found: false }, 500);
  }
});

// POST /produtos/atributos/upload — upload CSV, validate against DB, store in Storage, invalidate cache
app.post(`${BASE}/produtos/atributos/upload`, async (c) => {
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
    return c.json({ error: `Erro ao processar upload: ${e}` }, 500);
  }
});

// DELETE /produtos/atributos — clear the CSV from Storage and invalidate cache
app.delete(`${BASE}/produtos/atributos`, async (c) => {
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
      return c.json({ error: `Erro ao remover CSV: ${error.message}` }, 500);
    }

    atributosCache = null;
    return c.json({ success: true, message: "CSV de atributos removido com sucesso." });
  } catch (e) {
    console.log("Error deleting attributes CSV:", e);
    return c.json({ error: `Erro ao remover atributos: ${e}` }, 500);
  }
});

// POST /produtos/match-skus — bulk match CSV SKUs against DB (used during analysis step)
app.post(`${BASE}/produtos/match-skus`, async (c) => {
  try {
    const body = await c.req.json();
    const skus: string[] = body?.skus;

    if (!Array.isArray(skus) || skus.length === 0) {
      return c.json({ error: "Campo 'skus' deve ser um array de strings nao vazio." }, 400);
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
    return c.json({ error: `Erro ao verificar SKUs: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── AUTOCOMPLETE ENDPOINT ────────────
// ═══════════════════════════════════════

app.get(`${BASE}/produtos/autocomplete`, async (c) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return c.json({ error: "Configuração incompleta do servidor." }, 500);
    }

    const query = (c.req.query("q") || "").trim();
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
      return c.json({ error: `Erro na busca: HTTP ${response.status}`, results: [] }, response.status);
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
    return c.json({ error: `Erro no autocomplete: ${e}`, results: [] }, 500);
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
const META_INDEX_CACHE_TTL = 60 * 1000; // 1 minute

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

    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = Math.min(parseInt(c.req.query("limit") || "24", 10), 100);
    const search = c.req.query("search") || "";
    const categoriaSlug = (c.req.query("categoria") || "").trim();

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
        console.log(`Catalog query error [${response.status}]: ${errorText}`);
        return c.json({ error: `Erro ao consultar produtos: HTTP ${response.status}` }, response.status);
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
      console.log(`Catalog category query error [${response.status}]: ${errorText}`);
      return c.json({ error: `Erro ao consultar produtos: HTTP ${response.status}` }, response.status);
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
app.get(`${BASE}/produtos/destaques`, async (c) => {
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
    return c.json({ error: `Erro interno ao buscar destaques: ${e}` }, 500);
  }
});

app.get(`${BASE}/produtos`, async (c) => {
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

    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = Math.min(parseInt(c.req.query("limit") || "24", 10), 100);
    const search = c.req.query("search") || "";
    const skuExact = c.req.query("sku") || "";
    const categoriaSlug = (c.req.query("categoria") || "").trim();
    const publicMode = c.req.query("public") || "";

    const offset = (page - 1) * limit;
    const rangeStart = offset;
    const rangeEnd = offset + limit - 1;

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
      catQueryStr += "&order=titulo.asc";

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
        console.log(`Catalog query error [${catResponse.status}]: ${errorText}`);
        return c.json({ error: `Erro ao consultar produtos: HTTP ${catResponse.status}` }, catResponse.status);
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
    queryStr += "&order=titulo.asc";

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
    return c.json({ error: `Erro interno ao buscar produtos: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════════════════
// ─── PRODUTO CRUD (Admin — titulo in DB, meta in KV)
// ═══════════════════════════════════════════════════

// GET /produtos/meta/:sku — product metadata from KV
app.get(`${BASE}/produtos/meta/:sku`, async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku"));
    const meta = await kv.get(`produto_meta:${sku}`);
    return c.json(meta || { visible: true });
  } catch (e) {
    console.log("Error fetching product meta:", e);
    return c.json({ error: `Erro ao buscar metadados: ${e}` }, 500);
  }
});

// PUT /produtos/meta/:sku — save product metadata in KV
app.put(`${BASE}/produtos/meta/:sku`, async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku"));
    const body = await c.req.json();
    const existing = (await kv.get(`produto_meta:${sku}`)) || {};
    const updated = { ...existing, ...body, sku };
    await kv.set(`produto_meta:${sku}`, updated);
    invalidateMetaCache();
    return c.json(updated);
  } catch (e) {
    console.log("Error saving product meta:", e);
    return c.json({ error: `Erro ao salvar metadados: ${e}` }, 500);
  }
});

// PUT /produtos/:sku/titulo — update titulo in DB via service role
app.put(`${BASE}/produtos/:sku/titulo`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const sku = decodeURIComponent(c.req.param("sku"));
    const { titulo } = await c.req.json();
    if (!titulo || !titulo.trim()) return c.json({ error: "Titulo obrigatorio." }, 400);

    const { error } = await supabaseAdmin
      .from("produtos")
      .update({ titulo: titulo.trim() })
      .eq("sku", sku);

    if (error) {
      console.log("Error updating titulo:", error.message);
      return c.json({ error: `Erro ao atualizar titulo: ${error.message}` }, 500);
    }
    return c.json({ sku, titulo: titulo.trim(), updated: true });
  } catch (e) {
    console.log("Error updating titulo:", e);
    return c.json({ error: `Erro ao atualizar titulo: ${e}` }, 500);
  }
});

// PUT /produtos/:sku/rename — rename SKU in DB + move KV meta
app.put(`${BASE}/produtos/:sku/rename`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const oldSku = decodeURIComponent(c.req.param("sku"));
    const { newSku } = await c.req.json();
    if (!newSku || !newSku.trim()) return c.json({ error: "Novo SKU obrigatorio." }, 400);
    const trimmed = newSku.trim();
    if (trimmed === oldSku) return c.json({ error: "SKU igual ao atual." }, 400);

    const { data: existing } = await supabaseAdmin.from("produtos").select("sku").eq("sku", trimmed).limit(1);
    if (existing && existing.length > 0) {
      return c.json({ error: `SKU "${trimmed}" ja existe no banco.` }, 409);
    }

    const { error: dbErr } = await supabaseAdmin.from("produtos").update({ sku: trimmed }).eq("sku", oldSku);
    if (dbErr) {
      console.log("Error renaming SKU in DB:", dbErr.message);
      return c.json({ error: `Erro ao renomear SKU no banco: ${dbErr.message}` }, 500);
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
    return c.json({ error: `Erro ao renomear SKU: ${e}` }, 500);
  }
});

// POST /produtos/create — insert new product in DB + meta in KV
app.post(`${BASE}/produtos/create`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const { sku, titulo, meta } = await c.req.json();
    if (!sku?.trim() || !titulo?.trim()) return c.json({ error: "SKU e titulo obrigatorios." }, 400);

    const { error } = await supabaseAdmin
      .from("produtos")
      .insert({ sku: sku.trim(), titulo: titulo.trim() });

    if (error) {
      console.log("Error inserting product:", error.message);
      return c.json({ error: `Erro ao criar produto: ${error.message}` }, 500);
    }

    if (meta) {
      await kv.set(`produto_meta:${sku.trim()}`, { ...meta, sku: sku.trim(), visible: meta.visible !== false });
      invalidateMetaCache();
    }

    return c.json({ sku: sku.trim(), titulo: titulo.trim(), created: true }, 201);
  } catch (e) {
    console.log("Error creating product:", e);
    return c.json({ error: `Erro ao criar produto: ${e}` }, 500);
  }
});

// DELETE /produtos/:sku/delete — remove from DB + KV meta + optional images
app.delete(`${BASE}/produtos/:sku/delete`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const sku = decodeURIComponent(c.req.param("sku"));

    const { error: dbErr } = await supabaseAdmin.from("produtos").delete().eq("sku", sku);
    if (dbErr) {
      console.log("Error deleting product from DB:", dbErr.message);
      return c.json({ error: `Erro ao excluir do banco: ${dbErr.message}` }, 500);
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
    return c.json({ error: `Erro ao excluir produto: ${e}` }, 500);
  }
});

// POST /produtos/imagens/:sku/upload — upload image to Storage
app.post(`${BASE}/produtos/imagens/:sku/upload`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const sku = decodeURIComponent(c.req.param("sku"));
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const filename = (formData.get("filename") as string) || file?.name || `${sku}.1.webp`;

    if (!file) return c.json({ error: "Nenhum arquivo enviado." }, 400);

    const filePath = `${sku}/${filename}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("produtos")
      .upload(filePath, arrayBuffer, {
        contentType: file.type || "image/webp",
        upsert: true,
      });

    if (uploadErr) {
      console.log("Image upload error:", uploadErr.message);
      return c.json({ error: `Erro no upload: ${uploadErr.message}` }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const url = `${supabaseUrl}/storage/v1/object/public/produtos/${encodeURIComponent(sku)}/${encodeURIComponent(filename)}`;

    return c.json({ uploaded: true, path: filePath, url, filename });
  } catch (e) {
    console.log("Error uploading image:", e);
    return c.json({ error: `Erro no upload de imagem: ${e}` }, 500);
  }
});

// DELETE /produtos/imagens/:sku/file — delete specific image from Storage
app.delete(`${BASE}/produtos/imagens/:sku/file`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const sku = decodeURIComponent(c.req.param("sku"));
    const { filename } = await c.req.json();
    if (!filename) return c.json({ error: "Filename obrigatorio." }, 400);

    const filePath = `${sku}/${filename}`;
    const { error } = await supabaseAdmin.storage.from("produtos").remove([filePath]);

    if (error) {
      console.log("Image delete error:", error.message);
      return c.json({ error: `Erro ao excluir imagem: ${error.message}` }, 500);
    }

    return c.json({ deleted: true, path: filePath });
  } catch (e) {
    console.log("Error deleting image:", e);
    return c.json({ error: `Erro ao excluir imagem: ${e}` }, 500);
  }
});

// POST /produtos/meta/bulk — get metadata for multiple SKUs
app.post(`${BASE}/produtos/meta/bulk`, async (c) => {
  try {
    const { skus } = await c.req.json();
    if (!Array.isArray(skus)) return c.json({ error: "skus deve ser um array." }, 400);

    const result: Record<string, any> = {};
    for (const sku of skus.slice(0, 50)) {
      const meta = await kv.get(`produto_meta:${sku}`);
      result[sku] = meta || { visible: true };
    }
    return c.json(result);
  } catch (e) {
    console.log("Error fetching bulk meta:", e);
    return c.json({ error: `Erro ao buscar metadados em lote: ${e}` }, 500);
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
app.get(`${BASE}/logo`, async (c) => {
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
    return c.json({ error: `Erro ao buscar logo: ${e}` }, 500);
  }
});

// POST /logo/upload — upload logo AVIF (auth required)
app.post(`${BASE}/logo/upload`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return c.json({ error: "Nenhum arquivo enviado." }, 400);

    // Validate file type
    const validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return c.json({ error: `Tipo de arquivo nao permitido: ${file.type}. Use AVIF, PNG, JPEG, WebP ou SVG.` }, 400);
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
      return c.json({ error: `Erro no upload: ${uploadErr.message}` }, 500);
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

    return c.json({ uploaded: true, ...logoMeta });
  } catch (e) {
    console.log("Error uploading logo:", e);
    return c.json({ error: `Erro no upload do logo: ${e}` }, 500);
  }
});

// DELETE /logo — remove logo (auth required)
app.delete(`${BASE}/logo`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const meta: any = await kv.get("site_logo");
    if (meta?.filename) {
      await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([meta.filename]);
    }
    await kv.del("site_logo");

    return c.json({ deleted: true });
  } catch (e) {
    console.log("Error deleting logo:", e);
    return c.json({ error: `Erro ao excluir logo: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── FOOTER LOGO (Site Assets) ────────
// ═══════════════════════════════════════

// GET /footer-logo — public (with signed URL for robustness)
app.get(`${BASE}/footer-logo`, async (c) => {
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
    return c.json({ error: `Erro ao buscar logo do rodape: ${e}` }, 500);
  }
});

// POST /footer-logo/upload — auth required
app.post(`${BASE}/footer-logo/upload`, async (c) => {
  console.log("POST /footer-logo/upload called");
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return c.json({ error: "Nenhum arquivo enviado." }, 400);

    const validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      return c.json({ error: `Tipo nao permitido: ${file.type}. Use AVIF, PNG, JPEG, WebP ou SVG.` }, 400);
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
      return c.json({ error: `Erro no upload: ${uploadErr.message}` }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const url = `${supabaseUrl}/storage/v1/object/public/${ASSETS_BUCKET}/${filename}`;

    const logoMeta = {
      url, filename, contentType: file.type,
      size: file.size, uploadedAt: new Date().toISOString(), uploadedBy: userId,
    };
    await kv.set("site_footer_logo", logoMeta);
    return c.json({ uploaded: true, ...logoMeta });
  } catch (e: any) {
    console.log("Error uploading footer logo:", e);
    return c.json({ error: `Erro no upload do logo do rodape: ${e}` }, 500);
  }
});

// DELETE /footer-logo — auth required
app.delete(`${BASE}/footer-logo`, async (c) => {
  console.log("DELETE /footer-logo called");
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const meta: any = await kv.get("site_footer_logo");
    if (meta?.filename) {
      await supabaseAdmin.storage.from(ASSETS_BUCKET).remove([meta.filename]);
    }
    await kv.del("site_footer_logo");
    return c.json({ deleted: true });
  } catch (e: any) {
    console.log("Error deleting footer logo:", e);
    return c.json({ error: `Erro ao excluir logo do rodape: ${e}` }, 500);
  }
});

Deno.serve(app.fetch);