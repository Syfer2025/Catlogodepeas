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

// Supabase anon client (for operations that trigger built-in emails, e.g. signUp confirmation)
const supabaseAnon = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
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
app.post(`${BASE}/auth/forgot-password`, async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: "Email é obrigatório." }, 400);
    }

    const recoveryId = crypto.randomUUID();
    console.log("Forgot-password: sending for:", email, "rid:", recoveryId);

    // Look up user to get their current last_sign_in_at
    let userId: string | null = null;
    let lastSignInBefore: string | null = null;
    try {
      const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) {
        console.log("Forgot-password: listUsers error:", listErr.message);
      }
      const user = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
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
    return c.json({ error: `Erro interno: ${e}` }, 500);
  }
});

// Step 2: Frontend polls this to check if the link was clicked.
// We detect the click by comparing last_sign_in_at before and after.
app.post(`${BASE}/auth/recovery-status`, async (c) => {
  try {
    const { rid } = await c.req.json();
    if (!rid) return c.json({ status: "not_found" });

    const raw = await kv.get(`recovery:${rid}`);
    if (!raw) return c.json({ status: "not_found" });

    const data = JSON.parse(raw as string);

    // Expire after 1 hour
    if (Date.now() - data.created_at > 3600000) {
      await kv.del(`recovery:${rid}`);
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
        await kv.set(`recovery:${rid}`, JSON.stringify({
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
app.post(`${BASE}/auth/reset-password`, async (c) => {
  try {
    const { rid, newPassword } = await c.req.json();
    if (!rid || !newPassword) {
      return c.json({ error: "Dados incompletos." }, 400);
    }
    if (newPassword.length < 6) {
      return c.json({ error: "A senha deve ter pelo menos 6 caracteres." }, 400);
    }

    const raw = await kv.get(`recovery:${rid}`);
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
      await kv.del(`recovery:${rid}`);
      return c.json({ error: "Recuperação expirada." }, 410);
    }

    // Update password via admin API
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: newPassword,
    });

    if (updateErr) {
      console.log("Reset-password: updateUserById error:", updateErr.message);
      return c.json({ error: `Erro ao redefinir senha: ${updateErr.message}` }, 500);
    }

    // Clean up
    await kv.del(`recovery:${rid}`);
    console.log("Reset-password: password updated for userId:", data.userId);

    return c.json({ ok: true });
  } catch (e) {
    console.log("Reset-password exception:", e);
    return c.json({ error: `Erro interno: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── USER AUTH (public user accounts) ─
// ═══════════════════════════════════════

// Signup for regular site users
app.post(`${BASE}/auth/user/signup`, async (c) => {
  try {
    const { email, password, name, phone, cpf } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email e senha são obrigatórios." }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: "A senha deve ter pelo menos 6 caracteres." }, 400);
    }

    // Check if user already exists
    try {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const existing = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
      if (existing) {
        return c.json({ error: "Este email já está cadastrado. Faça login." }, 409);
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
            return c.json({ error: "Este CPF já está cadastrado em outra conta." }, 409);
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
      return c.json({ error: `Erro ao criar conta: ${error.message}` }, 400);
    }

    if (!data.user?.id) {
      console.log("User signup: no user returned");
      return c.json({ error: "Erro inesperado ao criar conta." }, 500);
    }

    // Store user profile in KV for additional data
    await kv.set(`user_profile:${data.user.id}`, JSON.stringify({
      id: data.user.id,
      email: data.user.email,
      name: name || "",
      phone: phone || "",
      cpf: cpf || "",
      created_at: new Date().toISOString(),
    }));

    console.log("User signup: created user:", data.user.id, email, "- confirmation email sent");
    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: name || "",
      },
      emailConfirmationRequired: true,
    }, 201);
  } catch (e) {
    console.log("User signup exception:", e);
    return c.json({ error: `Erro interno no cadastro: ${e}` }, 500);
  }
});

// Get user profile (requires auth)
app.get(`${BASE}/auth/user/me`, async (c) => {
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
      created_at: user.created_at,
    });
  } catch (e) {
    console.log("User me exception:", e);
    return c.json({ error: `Erro ao buscar perfil: ${e}` }, 500);
  }
});

// Update user profile (requires auth)
app.put(`${BASE}/auth/user/profile`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }

    const body = await c.req.json();
    const { name, phone, cpf, address, city, state, cep } = body;

    // Update user_metadata in Supabase Auth
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        name: name || "",
        phone: phone || "",
        role: "user",
      },
    });

    if (updateErr) {
      console.log("User profile update auth error:", updateErr.message);
      return c.json({ error: `Erro ao atualizar perfil: ${updateErr.message}` }, 500);
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
    return c.json({ error: `Erro ao atualizar perfil: ${e}` }, 500);
  }
});

// User password change (requires auth)
app.post(`${BASE}/auth/user/change-password`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: "Token inválido ou expirado." }, 401);
    }

    const { newPassword } = await c.req.json();
    if (!newPassword || newPassword.length < 6) {
      return c.json({ error: "A nova senha deve ter pelo menos 6 caracteres." }, 400);
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateErr) {
      console.log("User change-password error:", updateErr.message);
      return c.json({ error: `Erro ao alterar senha: ${updateErr.message}` }, 500);
    }

    console.log("User password changed:", userId);
    return c.json({ ok: true });
  } catch (e) {
    console.log("User change-password exception:", e);
    return c.json({ error: `Erro ao alterar senha: ${e}` }, 500);
  }
});

// User forgot password (recovery email)
app.post(`${BASE}/auth/user/forgot-password`, async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: "Email é obrigatório." }, 400);
    }

    const recoveryId = crypto.randomUUID();
    console.log("User forgot-password: sending for:", email, "rid:", recoveryId);

    let userId: string | null = null;
    let lastSignInBefore: string | null = null;
    try {
      const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) console.log("User forgot-password: listUsers error:", listErr.message);
      const user = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
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
    return c.json({ error: `Erro interno: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── ADMIN: CLIENTS ───────────────────
// ═══════════════════════════════════════

// List all registered clients (requires admin auth)
app.get(`${BASE}/auth/admin/clients`, async (c) => {
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

    // Enrich with Supabase Auth data (email_confirmed_at, last_sign_in_at)
    let authUsers: any[] = [];
    try {
      const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (!listErr && users) {
        authUsers = users;
      }
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
    return c.json({ error: `Erro ao buscar clientes: ${e}` }, 500);
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

// ═══════════════════════════════════════
// ─── API SIGE — INTEGRACAO REAL ──────
// ═══════════════════════════════════════

// POST /sige/save-config — save SIGE API configuration (baseUrl, email, password)
app.post(`${BASE}/sige/save-config`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const { baseUrl, email, password } = await c.req.json();
    if (!baseUrl || !email || !password) {
      return c.json({ error: "URL base, email e senha sao obrigatorios." }, 400);
    }
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "");
    await kv.set("sige_api_config", JSON.stringify({
      baseUrl: normalizedUrl, email: email.trim(), password,
      updatedAt: new Date().toISOString(), updatedBy: userId,
    }));
    console.log("SIGE save-config: saved for user", userId, "baseUrl:", normalizedUrl);
    return c.json({ success: true });
  } catch (e) {
    console.log("Error saving SIGE config:", e);
    return c.json({ error: `Erro ao salvar configuracao: ${e}` }, 500);
  }
});

// GET /sige/config — get saved config (password masked)
app.get(`${BASE}/sige/config`, async (c) => {
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
    return c.json({ error: `Erro ao buscar configuracao: ${e}` }, 500);
  }
});

// POST /sige/connect — authenticate with SIGE API (POST baseUrl/auth)
app.post(`${BASE}/sige/connect`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ error: "Configuracao SIGE nao encontrada. Salve a URL base, email e senha primeiro." }, 400);
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
    catch { return c.json({ error: "Resposta invalida da API SIGE (nao e JSON)." }, 502); }
    const tokenData = {
      token: authData.token || authData.access_token || authData.accessToken || "",
      refreshToken: authData.refreshToken || authData.refresh_token || "",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      rawResponse: authData,
    };
    await kv.set("sige_api_token", JSON.stringify(tokenData));
    console.log("SIGE connect: token stored, expires at", tokenData.expiresAt);
    return c.json({
      connected: true, hasToken: !!tokenData.token,
      hasRefreshToken: !!tokenData.refreshToken,
      expiresAt: tokenData.expiresAt, responseKeys: Object.keys(authData),
    });
  } catch (e) {
    console.log("SIGE connect exception:", e);
    return c.json({ error: `Erro ao conectar com SIGE: ${e}` }, 500);
  }
});

// POST /sige/refresh-token — refresh SIGE JWT token
app.post(`${BASE}/sige/refresh-token`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ error: "Configuracao SIGE nao encontrada." }, 400);
    const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ error: "Nenhum token encontrado. Faca login primeiro." }, 400);
    const tokenData = typeof rawToken === "string" ? JSON.parse(rawToken) : rawToken;
    if (!tokenData.refreshToken) {
      return c.json({ error: "Refresh token nao disponivel. Faca login novamente." }, 400);
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
    catch { return c.json({ error: "Resposta invalida da API SIGE (nao e JSON)." }, 502); }
    const newTokenData = {
      token: refreshData.token || refreshData.access_token || refreshData.accessToken || tokenData.token,
      refreshToken: refreshData.refreshToken || refreshData.refresh_token || tokenData.refreshToken,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      rawResponse: refreshData,
    };
    await kv.set("sige_api_token", JSON.stringify(newTokenData));
    console.log("SIGE refresh-token: new token stored");
    return c.json({ refreshed: true, hasToken: !!newTokenData.token, expiresAt: newTokenData.expiresAt });
  } catch (e) {
    console.log("SIGE refresh-token exception:", e);
    return c.json({ error: `Erro ao renovar token: ${e}` }, 500);
  }
});

// GET /sige/status — get current SIGE connection status
app.get(`${BASE}/sige/status`, async (c) => {
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
      tokenInfo = {
        hasToken: !!td.token, hasRefreshToken: !!td.refreshToken,
        createdAt: td.createdAt, expiresAt: td.expiresAt,
        expired: now > expiresAt, expiresInMs: Math.max(0, expiresAt - now),
      };
    }
    return c.json({ configured: hasConfig, ...configInfo, ...tokenInfo });
  } catch (e) {
    console.log("SIGE status exception:", e);
    return c.json({ error: `Erro ao buscar status: ${e}` }, 500);
  }
});

// POST /sige/disconnect — clear stored SIGE tokens
app.post(`${BASE}/sige/disconnect`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    await kv.del("sige_api_token");
    console.log("SIGE disconnect: token cleared by user", userId);
    return c.json({ disconnected: true });
  } catch (e) {
    console.log("SIGE disconnect exception:", e);
    return c.json({ error: `Erro ao desconectar: ${e}` }, 500);
  }
});

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
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      rawResponse: authData,
    };
    await kv.set("sige_api_token", JSON.stringify(newTokenData));
    console.log(`SIGE auto-relogin: SUCCESS, new token stored, expires ${newTokenData.expiresAt}`);
    return newToken;
  } catch (e) {
    console.log(`SIGE auto-relogin: exception`, e);
    return null;
  }
}

// ─── Helper: make authenticated SIGE API call (with auto-retry on 401) ───
async function sigeAuthFetch(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: any }> {
  const rawConfig = await kv.get("sige_api_config");
  if (!rawConfig) throw new Error("Configuracao SIGE nao encontrada.");
  const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
  const rawToken = await kv.get("sige_api_token");
  if (!rawToken) throw new Error("Token SIGE nao encontrado. Conecte-se primeiro.");
  let tokenData = typeof rawToken === "string" ? JSON.parse(rawToken) : rawToken;
  if (!tokenData.token) throw new Error("Token SIGE vazio. Reconecte.");

  // Check if token is expired and proactively re-login
  if (tokenData.expiresAt && new Date(tokenData.expiresAt).getTime() < Date.now()) {
    console.log(`SIGE proxy: token expired (${tokenData.expiresAt}), attempting auto-relogin...`);
    const newToken = await sigeReLogin();
    if (newToken) {
      tokenData = { ...tokenData, token: newToken };
    } else {
      console.log("SIGE proxy: auto-relogin failed, proceeding with expired token");
    }
  }

  const url = `${config.baseUrl}${path}`;
  console.log(`SIGE proxy: ${method} ${url}`);
  const buildFetchOpts = (token: string) => {
    const fetchHeaders: any = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
    const fetchOpts: any = { method, headers: fetchHeaders };
    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOpts.body = JSON.stringify(body);
    }
    return fetchOpts;
  };

  const response = await fetch(url, buildFetchOpts(tokenData.token));
  const responseText = await response.text();
  console.log(`SIGE proxy: ${method} ${path} => HTTP ${response.status}, ${responseText.length} bytes`);

  // Auto-retry on 401 (token expired/invalid)
  if (response.status === 401) {
    console.log(`SIGE proxy: got 401, attempting auto-relogin and retry...`);
    const newToken = await sigeReLogin();
    if (newToken) {
      console.log(`SIGE proxy: retrying ${method} ${path} with new token`);
      const retryResponse = await fetch(url, buildFetchOpts(newToken));
      const retryText = await retryResponse.text();
      console.log(`SIGE proxy (retry): ${method} ${path} => HTTP ${retryResponse.status}, ${retryText.length} bytes`);
      let retryData: any;
      try { retryData = JSON.parse(retryText); } catch { retryData = { rawText: retryText }; }
      return { ok: retryResponse.ok, status: retryResponse.status, data: retryData };
    }
    console.log(`SIGE proxy: auto-relogin failed, returning original 401`);
  }

  let data: any;
  try { data = JSON.parse(responseText); } catch { data = { rawText: responseText }; }
  return { ok: response.ok, status: response.status, data };
}

// ─── Helper: make PUBLIC (no JWT) SIGE API call ───
async function sigePublicFetch(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: any }> {
  const rawConfig = await kv.get("sige_api_config");
  if (!rawConfig) throw new Error("Configuracao SIGE nao encontrada. Salve a URL base primeiro.");
  const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
  if (!config.baseUrl) throw new Error("URL base da API SIGE nao configurada.");
  const url = `${config.baseUrl}${path}`;
  console.log(`SIGE public proxy: ${method} ${url}`);
  const fetchHeaders: any = { "Content-Type": "application/json" };
  const fetchOpts: any = { method, headers: fetchHeaders };
  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    fetchOpts.body = JSON.stringify(body);
  }
  const response = await fetch(url, fetchOpts);
  const responseText = await response.text();
  console.log(`SIGE public proxy: ${method} ${path} => HTTP ${response.status}, ${responseText.length} bytes`);
  let data: any;
  try { data = JSON.parse(responseText); } catch { data = { rawText: responseText }; }
  return { ok: response.ok, status: response.status, data };
}

// ═══════════════════════════════════════
// ─── SIGE: USUARIOS ──────────────────
// ═══════════════════════════════════════

// POST /sige/user/register — criar usuario SEM JWT (registro inicial do zero)
// Aceita baseUrl opcional no body para nao depender de config previa
app.post(`${BASE}/sige/user/register`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const { name, email, password, baseUrl: bodyBaseUrl } = await c.req.json();
    if (!name || !email || !password) return c.json({ error: "Nome, email e senha sao obrigatorios." }, 400);

    // Determine base URL: body param takes priority, then stored config
    let apiBaseUrl = bodyBaseUrl?.trim();
    if (!apiBaseUrl) {
      const rawConfig = await kv.get("sige_api_config");
      if (rawConfig) {
        const config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig;
        apiBaseUrl = config.baseUrl;
      }
    }
    if (!apiBaseUrl) return c.json({ error: "URL base da API SIGE nao informada. Informe no campo ou salve na configuracao." }, 400);

    // Normalize: strip trailing slashes
    apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");

    // If baseUrl was provided in body, also save/update the config for future use
    if (bodyBaseUrl?.trim()) {
      const rawConfig = await kv.get("sige_api_config");
      const existing = rawConfig ? (typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig) : {};
      await kv.set("sige_api_config", JSON.stringify({ ...existing, baseUrl: apiBaseUrl, updatedAt: new Date().toISOString() }));
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
    if (!response.ok) return c.json({ error: data?.message || data?.error || `SIGE HTTP ${response.status}`, sigeStatus: response.status, sigeData: data, attemptedUrl: url }, 502);
    return c.json(data);
  } catch (e: any) {
    console.log("SIGE user/register exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /sige/user/create — proxy to SIGE POST /user/create (requer JWT ativo)
app.post(`${BASE}/sige/user/create`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const { name, email, password } = await c.req.json();
    if (!name || !email || !password) return c.json({ error: "Nome, email e senha sao obrigatorios." }, 400);
    const result = await sigeAuthFetch("POST", "/user/create", { name, email, password });
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE user/create exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// GET /sige/user/me — proxy to SIGE GET /user/me
app.get(`${BASE}/sige/user/me`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const result = await sigeAuthFetch("GET", "/user/me");
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE user/me exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PATCH /sige/user/reset/:id — proxy to SIGE PATCH /user/reset/{id}
app.patch(`${BASE}/sige/user/reset/:id`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const { password, newPassword } = await c.req.json();
    if (!password || !newPassword) return c.json({ error: "Senha atual e nova senha sao obrigatorias." }, 400);
    const result = await sigeAuthFetch("PATCH", `/user/reset/${id}`, { password, newPassword });
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE user/reset exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CATEGORIAS ─────────────────
// ═══════════════════════════════════════

// GET /sige/category — proxy to SIGE GET /category
app.get(`${BASE}/sige/category`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE category proxy: GET /category${queryString}`);
    const result = await sigeAuthFetch("GET", `/category${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /category exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /sige/category — proxy to SIGE POST /category
app.post(`${BASE}/sige/category`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    const { codCategoria, nomeCategoria, classe } = body;
    if (!codCategoria || !nomeCategoria || !classe) return c.json({ error: "codCategoria, nomeCategoria e classe sao obrigatorios." }, 400);
    if (classe !== "S" && classe !== "E") return c.json({ error: "classe deve ser 'S' (Saidas) ou 'E' (Entradas)." }, 400);
    const result = await sigeAuthFetch("POST", "/category", { codCategoria, nomeCategoria, classe });
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /category exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /sige/category/:id — proxy to SIGE PUT /category/{id}
app.put(`${BASE}/sige/category/:id`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    const { nomeCategoria, classe } = body;
    if (!nomeCategoria || !classe) return c.json({ error: "nomeCategoria e classe sao obrigatorios." }, 400);
    if (classe !== "S" && classe !== "E") return c.json({ error: "classe deve ser 'S' (Saidas) ou 'E' (Entradas)." }, 400);
    const result = await sigeAuthFetch("PUT", `/category/${id}`, { nomeCategoria, classe });
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /category exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// DELETE /sige/category/:id — proxy to SIGE DELETE /category/{id}
app.delete(`${BASE}/sige/category/:id`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const result = await sigeAuthFetch("DELETE", `/category/${id}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE DELETE /category exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CLIENTES ───────────────────
// ═══════════════════════════════════════

// GET /sige/customer — proxy to SIGE GET /customer (busca com filtros)
app.get(`${BASE}/sige/customer`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE customer proxy: GET /customer${queryString}`);
    const result = await sigeAuthFetch("GET", `/customer${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// GET /sige/customer/:id — proxy to SIGE GET /customer/{id} (busca por ID)
app.get(`${BASE}/sige/customer/:id`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE customer proxy: GET /customer/${id}${queryString}`);
    const result = await sigeAuthFetch("GET", `/customer/${id}${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer/:id exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /sige/customer — proxy to SIGE POST /customer (cadastrar)
app.post(`${BASE}/sige/customer`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    if (!body.tipoCadastro || !body.nomeCadastro) return c.json({ error: "tipoCadastro e nomeCadastro sao obrigatorios." }, 400);
    console.log("SIGE customer proxy: POST /customer");
    const result = await sigeAuthFetch("POST", "/customer", body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /customer exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /sige/customer/:id — proxy to SIGE PUT /customer/{id} (alterar)
app.put(`${BASE}/sige/customer/:id`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE customer proxy: PUT /customer/${id}`);
    const result = await sigeAuthFetch("PUT", `/customer/${id}`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /customer/:id exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CLIENTE ENDERECO ───────────
// ═══════════════════════════════════════

// GET /sige/customer/:id/address — proxy to SIGE GET /customer/{id}/address
app.get(`${BASE}/sige/customer/:id/address`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE customer address proxy: GET /customer/${id}/address${queryString}`);
    const result = await sigeAuthFetch("GET", `/customer/${id}/address${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer/:id/address exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /sige/customer/:id/address — proxy to SIGE POST /customer/{id}/address
app.post(`${BASE}/sige/customer/:id/address`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    if (!body.tipoEndereco) return c.json({ error: "tipoEndereco e obrigatorio." }, 400);
    console.log(`SIGE customer address proxy: POST /customer/${id}/address`);
    const result = await sigeAuthFetch("POST", `/customer/${id}/address`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /customer/:id/address exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /sige/customer/:id/address — proxy to SIGE PUT /customer/{id}/address
app.put(`${BASE}/sige/customer/:id/address`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    if (!body.tipoEndereco) return c.json({ error: "tipoEndereco e obrigatorio." }, 400);
    console.log(`SIGE customer address proxy: PUT /customer/${id}/address`);
    const result = await sigeAuthFetch("PUT", `/customer/${id}/address`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /customer/:id/address exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CLIENTE COMPLEMENTO ────────
// ═══════════════════════════════════════

// GET /sige/customer/:id/complement — proxy to SIGE GET /customer/{id}/complement
app.get(`${BASE}/sige/customer/:id/complement`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    console.log(`SIGE customer complement proxy: GET /customer/${id}/complement`);
    const result = await sigeAuthFetch("GET", `/customer/${id}/complement`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer/:id/complement exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /sige/customer/:id/complement — proxy to SIGE POST /customer/{id}/complement
app.post(`${BASE}/sige/customer/:id/complement`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE customer complement proxy: POST /customer/${id}/complement`);
    const result = await sigeAuthFetch("POST", `/customer/${id}/complement`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /customer/:id/complement exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /sige/customer/:id/complement — proxy to SIGE PUT /customer/{id}/complement
app.put(`${BASE}/sige/customer/:id/complement`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE customer complement proxy: PUT /customer/${id}/complement`);
    const result = await sigeAuthFetch("PUT", `/customer/${id}/complement`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /customer/:id/complement exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: CLIENTE CONTATO ────────────
// ═══════════════════════════════════════

// GET /sige/customer/:id/contact — proxy to SIGE GET /customer/{id}/contact
app.get(`${BASE}/sige/customer/:id/contact`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE customer contact proxy: GET /customer/${id}/contact${queryString}`);
    const result = await sigeAuthFetch("GET", `/customer/${id}/contact${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /customer/:id/contact exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /sige/customer/:id/contact — proxy to SIGE POST /customer/{id}/contact
app.post(`${BASE}/sige/customer/:id/contact`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    if (!body.nome) return c.json({ error: "nome e obrigatorio no body." }, 400);
    console.log(`SIGE customer contact proxy: POST /customer/${id}/contact`);
    const result = await sigeAuthFetch("POST", `/customer/${id}/contact`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /customer/:id/contact exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /sige/customer/:id/contact — proxy to SIGE PUT /customer/{id}/contact?nome=...
app.put(`${BASE}/sige/customer/:id/contact`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const nome = url.searchParams.get("nome");
    if (!nome) return c.json({ error: "Query param 'nome' e obrigatorio para identificar o contato a alterar." }, 400);
    const body = await c.req.json();
    console.log(`SIGE customer contact proxy: PUT /customer/${id}/contact?nome=${nome}`);
    const result = await sigeAuthFetch("PUT", `/customer/${id}/contact?nome=${encodeURIComponent(nome)}`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /customer/:id/contact exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO ────────────────────
// ═══════════════════════════════════════

// GET /sige/product — proxy to SIGE GET /product with query filters
app.get(`${BASE}/sige/product`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE product proxy: GET /product${queryString}`);
    const result = await sigeAuthFetch("GET", `/product${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /sige/product — proxy to SIGE POST /product
app.post(`${BASE}/sige/product`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    console.log("SIGE product proxy: POST /product");
    const result = await sigeAuthFetch("POST", "/product", body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /product exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /sige/product/:id — proxy to SIGE PUT /product/{id}
app.put(`${BASE}/sige/product/:id`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE product proxy: PUT /product/${id}`);
    const result = await sigeAuthFetch("PUT", `/product/${id}`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /product/:id exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO SALDO ─────────────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/product/:id/balance`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const queryString = url.search;
    const debug = url.searchParams.get("debug") === "1";
    console.log(`SIGE product balance proxy: GET /product/${id}/balance${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/balance${queryString}`);
    if (!result.ok) {
      console.log(`SIGE balance error for ${id}: HTTP ${result.status}`, JSON.stringify(result.data).slice(0, 500));
      return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO PCP ───────────────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/product/:id/product-control-plan`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE product PCP proxy: GET /product/${id}/product-control-plan${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/product-control-plan${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product/:id/product-control-plan exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO PROMOCAO ──────────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/product/:id/promotion`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE product promotion proxy: GET /product/${id}/promotion${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/promotion${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product/:id/promotion exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO REFERENCIA ────────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/product/:id/reference`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE product reference proxy: GET /product/${id}/reference${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/reference${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product/:id/reference exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.post(`${BASE}/sige/product/:id/reference`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE product reference proxy: POST /product/${id}/reference`);
    const result = await sigeAuthFetch("POST", `/product/${id}/reference`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /product/:id/reference exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.put(`${BASE}/sige/product/:id/reference`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE product reference proxy: PUT /product/${id}/reference`);
    const result = await sigeAuthFetch("PUT", `/product/${id}/reference`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /product/:id/reference exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PRODUTO FICHA TECNICA ─────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/product/:id/technical-sheet`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE technical-sheet proxy: GET /product/${id}/technical-sheet${queryString}`);
    const result = await sigeAuthFetch("GET", `/product/${id}/technical-sheet${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /product/:id/technical-sheet exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.post(`${BASE}/sige/product/:id/technical-sheet`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE technical-sheet proxy: POST /product/${id}/technical-sheet`);
    const result = await sigeAuthFetch("POST", `/product/${id}/technical-sheet`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /product/:id/technical-sheet exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.put(`${BASE}/sige/product/:id/technical-sheet`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE technical-sheet proxy: PUT /product/${id}/technical-sheet`);
    const result = await sigeAuthFetch("PUT", `/product/${id}/technical-sheet`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /product/:id/technical-sheet exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: LISTA DE PRECOS ───────────
// ═══════════════════════════════════════

// GET /sige/list-price — proxy to SIGE GET /list-price
app.get(`${BASE}/sige/list-price`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE list-price proxy: GET /list-price${queryString}`);
    const result = await sigeAuthFetch("GET", `/list-price${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /list-price exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// GET /sige/list-price-items — proxy to SIGE GET /list-price-items
app.get(`${BASE}/sige/list-price-items`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE list-price-items proxy: GET /list-price-items${queryString}`);
    const result = await sigeAuthFetch("GET", `/list-price-items${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /list-price-items exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS (ORDERS) ──────────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/order`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE order proxy: GET /order${queryString}`);
    const result = await sigeAuthFetch("GET", `/order${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.get(`${BASE}/sige/order/:id`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    console.log(`SIGE order proxy: GET /order/${id}`);
    const result = await sigeAuthFetch("GET", `/order/${id}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order/:id exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.post(`${BASE}/sige/order`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    console.log("SIGE order proxy: POST /order");
    const result = await sigeAuthFetch("POST", "/order", body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /order exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS OBSERVACAO ────────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/order/:id/observation`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    console.log(`SIGE order observation proxy: GET /order/${id}/observation`);
    const result = await sigeAuthFetch("GET", `/order/${id}/observation`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order/:id/observation exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.post(`${BASE}/sige/order/:id/observation`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE order observation proxy: POST /order/${id}/observation`);
    const result = await sigeAuthFetch("POST", `/order/${id}/observation`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /order/:id/observation exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.put(`${BASE}/sige/order/:id/observation`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE order observation proxy: PUT /order/${id}/observation`);
    const result = await sigeAuthFetch("PUT", `/order/${id}/observation`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /order/:id/observation exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS PARCELAMENTO ──────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/order/:id/installment`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    console.log(`SIGE order installment proxy: GET /order/${id}/installment`);
    const result = await sigeAuthFetch("GET", `/order/${id}/installment`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order/:id/installment exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS ITEMS ─────────────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/order-items/:id`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    console.log(`SIGE order-items proxy: GET /order-items/${id}`);
    const result = await sigeAuthFetch("GET", `/order-items/${id}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order-items/:id exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.post(`${BASE}/sige/order-items/:id`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE order-items proxy: POST /order-items/${id}`);
    const result = await sigeAuthFetch("POST", `/order-items/${id}`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /order-items/:id exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── SIGE: PEDIDOS ITEMS TEXT ────────
// ═══════════════════════════════════════

app.get(`${BASE}/sige/order-items/:id/text`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const url = new URL(c.req.url);
    const queryString = url.search;
    console.log(`SIGE order-items text proxy: GET /order-items/${id}/text${queryString}`);
    const result = await sigeAuthFetch("GET", `/order-items/${id}/text${queryString}`);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE GET /order-items/:id/text exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.post(`${BASE}/sige/order-items/:id/text`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE order-items text proxy: POST /order-items/${id}/text`);
    const result = await sigeAuthFetch("POST", `/order-items/${id}/text`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE POST /order-items/:id/text exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

app.put(`${BASE}/sige/order-items/:id/text`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const id = c.req.param("id");
    const body = await c.req.json();
    console.log(`SIGE order-items text proxy: PUT /order-items/${id}/text`);
    const result = await sigeAuthFetch("PUT", `/order-items/${id}/text`, body);
    if (!result.ok) return c.json({ error: result.data?.message || result.data?.error || `SIGE HTTP ${result.status}`, sigeStatus: result.status, sigeData: result.data }, 502);
    return c.json(result.data);
  } catch (e: any) {
    console.log("SIGE PUT /order-items/:id/text exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
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

app.get(`${BASE}/sige/dep/:endpoint{.+}`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const fullPath = c.req.path;
    const prefix = `${BASE}/sige/dep/`;
    const sigePath = "/" + fullPath.substring(fullPath.indexOf(prefix) + prefix.length);
    const baseEndpoint = sigePath.split("/")[1]?.split("?")[0];
    if (!baseEndpoint || !ALLOWED_DEP_ENDPOINTS.has(baseEndpoint)) {
      return c.json({ error: `Endpoint '${baseEndpoint}' nao permitido.` }, 400);
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── SALDO PÚBLICO (Product Stock via SIGE) ──────────
// ═══════════════════════════════════════════════════════

// GET /produtos/saldo/:sku — public endpoint to get stock balance from SIGE
// Uses the stored admin SIGE JWT, no user auth required (only publicAnonKey)
// Caches in KV for 5 minutes to avoid hammering the SIGE API
// Strategy: try direct balance call with SKU as codProduto, fall back to search
app.get(`${BASE}/produtos/saldo/:sku`, async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku")).trim();
    if (!sku) return c.json({ error: "SKU obrigatorio.", sku: "", found: false, sige: false, quantidade: 0 });

    const reqUrl = new URL(c.req.url);
    const forceRefresh = reqUrl.searchParams.get("force") === "1";
    const debugMode = reqUrl.searchParams.get("debug") === "1";
    const debugLog: string[] = [];
    const sigeResponses: any[] = [];
    const dbg = (msg: string) => { debugLog.push(msg); console.log(msg); };

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
    if (!rawConfig) return c.json({ sku, found: false, sige: false, error: "SIGE nao configurado.", quantidade: 0, ...(debugMode ? { _debug: debugLog } : {}) });
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ sku, found: false, sige: false, error: "SIGE nao conectado.", quantidade: 0, ...(debugMode ? { _debug: debugLog } : {}) });

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
    let found = await searchAndGetBalance(`codProduto=${encodeURIComponent(sku)}&limit=5&offset=1`, "s2_cod");
    if (found) {
      await kv.set(cacheKey, JSON.stringify(found));
      return c.json({ ...found, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
    }

    // ── Strategy 3: If SKU has a dash, try the part before the dash ──
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
    dbg(`[Saldo] S5: searching by referencia="${sku}"`);
    found = await searchAndGetBalance(`referencia=${encodeURIComponent(sku)}&limit=5&offset=1`, "s5_ref");
    if (found) {
      await kv.set(cacheKey, JSON.stringify(found));
      return c.json({ ...found, cached: false, ...(debugMode ? { _debug: debugLog, _sigeResponses: sigeResponses } : {}) });
    }

    // ── Strategy 6: Search by description as last resort ──
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
    console.log(`[Saldo] Exception for SKU ${c.req.param("sku")}:`, e);
    return c.json({ error: e.message || `Erro: ${e}`, sku: c.req.param("sku"), found: false, sige: false, quantidade: 0 });
  }
});

// DELETE /produtos/saldo/cache — clear all balance cache entries
app.delete(`${BASE}/produtos/saldo/cache`, async (c) => {
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// DELETE /produtos/saldo/cache/:sku — clear cache for a single SKU
app.delete(`${BASE}/produtos/saldo/cache/:sku`, async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku")).trim();
    const cacheKey = `sige_balance_${sku}`;
    await kv.del(cacheKey);
    console.log(`[Saldo] Cache cleared for SKU ${sku}`);
    return c.json({ cleared: true, sku, message: `Cache para SKU ${sku} removido.` });
  } catch (e: any) {
    console.log("[Saldo] Cache clear exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /produtos/saldos — bulk stock balance for multiple SKUs (admin)
app.post(`${BASE}/produtos/saldos`, async (c) => {
  try {
    const body = await c.req.json();
    const skus: string[] = body.skus || [];
    if (!Array.isArray(skus) || skus.length === 0) return c.json({ error: "Array 'skus' obrigatorio.", results: [], total: 0 });
    if (skus.length > 50) return c.json({ error: "Maximo 50 SKUs por requisicao.", results: [], total: 0 });

    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ results: skus.map((s: string) => ({ sku: s, found: false, sige: false })), error: "SIGE nao configurado." });
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ results: skus.map((s: string) => ({ sku: s, found: false, sige: false })), error: "SIGE nao conectado." });

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
      else if (bd?.dados && Array.isArray(bd.dados)) items = bd.dados;
      else if (bd?.data && Array.isArray(bd.data)) items = bd.data;
      else if (bd?.items && Array.isArray(bd.items)) items = bd.items;
      else if (bd?.content && Array.isArray(bd.content)) items = bd.content;

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

    // Process one SKU: mapping -> cache -> direct balance -> search+balance -> try base part
    async function fetchOneSku(sku: string): Promise<any> {
      const cacheKey = `sige_balance_${sku}`;
      const cached = await kv.get(cacheKey);
      if (cached) {
        const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
        const age = Date.now() - (parsed._cachedAt || 0);
        const ttl = parsed.found ? 5 * 60 * 1000 : 2 * 60 * 1000;
        if (age < ttl) {
          return { ...parsed, cached: true };
        }
      }

      // Strategy 0: Check if there's a saved mapping (sige_map_<sku>)
      const mapEntry = await kv.get(`sige_map_${sku}`);
      if (mapEntry) {
        const map = typeof mapEntry === "string" ? JSON.parse(mapEntry) : mapEntry;
        if (map.sigeId) {
          const balRes = await sigeAuthFetch("GET", `/product/${encodeURIComponent(map.sigeId)}/balance`);
          if (balRes.ok && balRes.data) {
            const { totalQtd, totalRes, totalDisp } = parseBal(balRes.data);
            const r = {
              sku, found: true, sige: true, sigeId: map.sigeId,
              descricao: map.descricao || "",
              quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
              _cachedAt: Date.now(),
            };
            await kv.set(cacheKey, JSON.stringify(r));
            return { ...r, cached: false };
          }
        }
      }

      // Helper: extract products array
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

      // Helper: try balance with possible IDs from a product
      async function tryBalForProduct(p: any, skipId?: string): Promise<any | null> {
        const ids = [p.id, p.codProduto, p.codigo, p.cod].filter(Boolean);
        const tried = new Set<string>();
        for (const pid of ids) {
          const pidStr = String(pid);
          if (tried.has(pidStr) || pidStr === skipId) continue;
          tried.add(pidStr);
          const balRes = await sigeAuthFetch("GET", `/product/${encodeURIComponent(pidStr)}/balance`);
          if (balRes.ok && balRes.data) {
            const { totalQtd, totalRes, totalDisp } = parseBal(balRes.data);
            return {
              sku, found: true, sige: true, sigeId: pidStr,
              descricao: p.descProdutoEst || p.descricao || p.descProduto || "",
              quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
              _cachedAt: Date.now(),
            };
          }
        }
        return null;
      }

      // Strategy 1: Direct balance with SKU as product ID
      const directRes = await sigeAuthFetch("GET", `/product/${encodeURIComponent(sku)}/balance`);
      if (directRes.ok && directRes.data) {
        const { totalQtd, totalRes, totalDisp } = parseBal(directRes.data);
        const r = {
          sku, found: true, sige: true, sigeId: sku,
          quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
          _cachedAt: Date.now(),
        };
        await kv.set(cacheKey, JSON.stringify(r));
        return { ...r, cached: false };
      }

      // Strategy 2: Search by codProduto (exact SKU)
      const searchRes = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(sku)}&limit=1&offset=1`);
      if (searchRes.ok && searchRes.data) {
        const prods = extractProds(searchRes.data);
        if (prods.length > 0) {
          const result = await tryBalForProduct(prods[0], sku);
          if (result) { await kv.set(cacheKey, JSON.stringify(result)); return { ...result, cached: false }; }
        }
      }

      // Strategy 3: If SKU has a dash, try the part before the dash
      if (sku.includes("-")) {
        const basePart = sku.split("-")[0];
        // 3a: Direct balance with base part
        const directBase = await sigeAuthFetch("GET", `/product/${encodeURIComponent(basePart)}/balance`);
        if (directBase.ok && directBase.data) {
          const { totalQtd, totalRes, totalDisp } = parseBal(directBase.data);
          const r = {
            sku, found: true, sige: true, sigeId: basePart,
            quantidade: totalQtd, reservado: totalRes, disponivel: totalDisp,
            _cachedAt: Date.now(),
          };
          await kv.set(cacheKey, JSON.stringify(r));
          return { ...r, cached: false };
        }
        // 3b: Search by codProduto with base part
        const searchBase = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(basePart)}&limit=1&offset=1`);
        if (searchBase.ok && searchBase.data) {
          const prods = extractProds(searchBase.data);
          if (prods.length > 0) {
            const result = await tryBalForProduct(prods[0]);
            if (result) { await kv.set(cacheKey, JSON.stringify(result)); return { ...result, cached: false }; }
          }
        }
      }

      const nf = { sku, found: false, sige: true, quantidade: 0, _cachedAt: Date.now() };
      await kv.set(cacheKey, JSON.stringify(nf));
      return { ...nf, cached: false };
    }

    // Process in parallel batches of 5
    const results: any[] = [];
    const BATCH = 5;
    for (let i = 0; i < skus.length; i += BATCH) {
      const batch = skus.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (sku: string) => {
          try {
            return await fetchOneSku(sku);
          } catch (ex: any) {
            console.log(`[Saldo bulk] Error for SKU ${sku}:`, ex.message);
            return { sku, found: false, sige: true, quantidade: 0, error: ex.message };
          }
        })
      );
      results.push(...batchResults);
    }

    console.log(`[Saldo bulk] Processed ${results.length} SKUs: ${results.filter((r: any) => r.found).length} found, ${results.filter((r: any) => r.cached).length} cached`);
    return c.json({ results, total: results.length });
  } catch (e: any) {
    console.log("[Saldo bulk] Exception:", e);
    // Always return 200 with structured data so frontend doesn't throw
    return c.json({ error: e.message || `Erro: ${e}`, results: [], total: 0 });
  }
});

// ═══════════════════════════════════════════════════════════
// ─── STOCK SUMMARY (global count across ALL products) ────
// ═══════════════════════════════════════════════════════════

// GET /produtos/stock-summary — returns global stock counts by reading all cached balance entries
app.get(`${BASE}/produtos/stock-summary`, async (c) => {
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
      return c.json({ error: balErr.message }, 500);
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /produtos/stock-scan — trigger balance scan for uncached/expired SKUs in batches
app.post(`${BASE}/produtos/stock-scan`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const batchSize = Math.min(Number(body.batchSize) || 50, 50);

    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ error: "SIGE nao configurado." });
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ error: "SIGE nao conectado." });

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
      return c.json({ scanned: 0, remaining: 0, message: "Todos os produtos ja estao no cache." });
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// ─── SIGE PRODUCT MAPPING (match local SKUs ↔ SIGE IDs) ──
// ═══════════════════════════════════════════════════════════

// GET /produtos/sige-map — list all mappings
app.get(`${BASE}/produtos/sige-map`, async (c) => {
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /produtos/sige-map/:sku — manually map a local SKU to a SIGE product ID
app.put(`${BASE}/produtos/sige-map/:sku`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const sku = decodeURIComponent(c.req.param("sku")).trim();
    const body = await c.req.json();
    const sigeId = String(body.sigeId || "").trim();
    if (!sigeId) return c.json({ error: "sigeId obrigatorio." }, 400);
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// DELETE /produtos/sige-map/:sku — remove mapping for a SKU
app.delete(`${BASE}/produtos/sige-map/:sku`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const sku = decodeURIComponent(c.req.param("sku")).trim();
    await kv.del(`sige_map_${sku}`);
    await kv.del(`sige_balance_${sku}`);
    return c.json({ ok: true, sku, message: `Mapeamento para ${sku} removido.` });
  } catch (e: any) {
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// POST /produtos/sige-sync — auto-match local products with SIGE products
app.post(`${BASE}/produtos/sige-sync`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json().catch(() => ({}));
    const fetchBal = body.fetchBalances !== false;
    const clearExisting = body.clearExisting === true;
    const pgSize = Math.min(Number(body.batchSize) || 500, 500);
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ error: "SIGE nao configurado." });
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ error: "SIGE nao conectado." });
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════════════════════
// ─── PREÇOS (Price from SIGE + custom override) ──────
// ═══════════════════════════════════════════════════════

// GET /price-config — global price tier configuration
app.get(`${BASE}/price-config`, async (c) => {
  try {
    const raw = await kv.get("price_config");
    const config = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : { tier: "v2", showPrice: true };
    return c.json(config);
  } catch (e: any) {
    console.log("[PriceConfig] GET exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /price-config — save global price tier (admin)
app.put(`${BASE}/price-config`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const body = await c.req.json();
    const config: any = {
      tier: body.tier || "v2",
      showPrice: body.showPrice !== false,
      updatedAt: Date.now(),
      updatedBy: userId,
    };
    // Preserve list price mapping if provided
    if (body.listPriceMapping && typeof body.listPriceMapping === "object") {
      config.listPriceMapping = body.listPriceMapping;
    }
    await kv.set("price_config", JSON.stringify(config));
    console.log(`[PriceConfig] Updated by ${userId}: tier=${config.tier}, showPrice=${config.showPrice}, listMapping=${JSON.stringify(config.listPriceMapping || {})}`);
    return c.json(config);
  } catch (e: any) {
    console.log("[PriceConfig] PUT exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /produtos/preco/:sku — set custom price for a product (admin)
app.put(`${BASE}/produtos/preco/:sku`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const sku = decodeURIComponent(c.req.param("sku")).trim();
    const body = await c.req.json();
    const customPrice = Number(body.price);
    if (isNaN(customPrice) || customPrice < 0) return c.json({ error: "Preco invalido." }, 400);
    const entry = { sku, price: customPrice, source: "custom", updatedAt: Date.now(), updatedBy: userId };
    await kv.set(`price_custom_${sku}`, JSON.stringify(entry));
    // Also clear old key format and cache
    await kv.del(`product_price_${sku}`);
    await kv.del(`sige_price_${sku}`);
    console.log(`[Price] Custom price set for ${sku}: R$${customPrice.toFixed(2)} by ${userId}`);
    return c.json({ ok: true, sku, price: customPrice });
  } catch (e: any) {
    console.log("[Price] PUT custom exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// DELETE /produtos/preco/:sku — remove custom price (admin)
app.delete(`${BASE}/produtos/preco/:sku`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);
    const sku = decodeURIComponent(c.req.param("sku")).trim();
    await kv.del(`price_custom_${sku}`);
    await kv.del(`product_price_${sku}`);
    await kv.del(`sige_price_${sku}`);
    console.log(`[Price] Custom price removed for ${sku} by ${userId}`);
    return c.json({ ok: true, sku, message: "Preco personalizado removido." });
  } catch (e: any) {
    console.log("[Price] DELETE custom exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// GET /produtos/preco/:sku — public endpoint to get product price
app.get(`${BASE}/produtos/preco/:sku`, async (c) => {
  try {
    const sku = decodeURIComponent(c.req.param("sku")).trim();
    if (!sku) return c.json({ error: "SKU obrigatorio.", sku: "", found: false, price: null, v1: null, v2: null, v3: null, tier: "v2", showPrice: true });

    // 0. Load global price config
    const cfgRaw = await kv.get("price_config");
    const cfg = cfgRaw ? (typeof cfgRaw === "string" ? JSON.parse(cfgRaw) : cfgRaw) : { tier: "v2", showPrice: true };
    const selectedTier: string = cfg.tier || "v2";
    const showPrice = cfg.showPrice !== false;

    // 1. Check for custom price override (new key format first, then old)
    for (const prefix of ["price_custom_", "product_price_"]) {
      const customRaw = await kv.get(`${prefix}${sku}`);
      if (customRaw) {
        const custom = typeof customRaw === "string" ? JSON.parse(customRaw) : customRaw;
        if (custom.price !== undefined && custom.price !== null) {
          console.log(`[Price] Custom price for ${sku}: R$${custom.price} (key=${prefix})`);
          return c.json({ sku, found: true, source: "custom", price: custom.price, v1: null, v2: null, v3: null, tier: "custom", showPrice, cached: false });
        }
      }
    }

    // 2. Check price cache (10 min for found, 2 min for not found)
    const cacheKey = `sige_price_${sku}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      const age = Date.now() - (parsed._cachedAt || 0);
      const ttl = parsed.found ? 10 * 60 * 1000 : 2 * 60 * 1000;
      if (age < ttl) {
        return c.json({ ...parsed, showPrice, cached: true });
      }
    }

    // 3. Check SIGE configured
    const rawConfig = await kv.get("sige_api_config");
    if (!rawConfig) return c.json({ sku, found: false, source: "none", error: "SIGE nao configurado.", price: null, v1: null, v2: null, v3: null, tier: selectedTier, showPrice });
    const rawToken = await kv.get("sige_api_token");
    if (!rawToken) return c.json({ sku, found: false, source: "none", error: "SIGE nao conectado.", price: null, v1: null, v2: null, v3: null, tier: selectedTier, showPrice });

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
      const mapEntry = await kv.get(`sige_map_${sku}`);
      if (mapEntry) {
        const map = typeof mapEntry === "string" ? JSON.parse(mapEntry) : mapEntry;
        if (map.sigeId) {
          console.log(`[Price] S0: mapping ${sku} -> SIGE ${map.sigeId}`);
          return { codProduto: map.sigeId, descricao: "" };
        }
      }

      // S1: Search by codProduto = SKU
      console.log(`[Price] S1: codProduto=${sku}`);
      const s1 = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(sku)}&limit=1&offset=1`);
      if (s1.ok && s1.data) {
        const prods = exArr(s1.data);
        if (prods.length > 0) {
          return { codProduto: String(prods[0].codProduto || prods[0].id || sku), descricao: prods[0].descProdutoEst || "" };
        }
      }

      // S2: Base part before dash
      if (sku.includes("-")) {
        const base = sku.split("-")[0];
        console.log(`[Price] S2: base=${base}`);
        const s2 = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(base)}&limit=1&offset=1`);
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
        console.log(`[Price] S3: cleaned=${skuC}`);
        const s3 = await sigeAuthFetch("GET", `/product?codProduto=${encodeURIComponent(skuC)}&limit=1&offset=1`);
        if (s3.ok && s3.data) {
          const prods = exArr(s3.data);
          if (prods.length > 0) {
            return { codProduto: String(prods[0].codProduto || prods[0].id || skuC), descricao: prods[0].descProdutoEst || "" };
          }
        }
      }

      return null;
    }

    console.log(`[Price] Looking up product for SKU: ${sku}`);
    const productInfo = await findProductId();

    if (!productInfo) {
      console.log(`[Price] ${sku}: product not found in SIGE`);
      const notFound = { sku, found: false, source: "sige", price: null, v1: null, v2: null, v3: null, tier: selectedTier, showPrice, _cachedAt: Date.now(), _priceListItems: 0, _detectedListCodes: [] as string[] };
      await kv.set(cacheKey, JSON.stringify(notFound));
      return c.json({ ...notFound, cached: false });
    }

    const { codProduto, descricao } = productInfo;
    console.log(`[Price] Product found: codProduto=${codProduto}, desc=${descricao.slice(0, 60)}`);

    // ─── Step 5: Fetch prices via /list-price-items ───

    console.log(`[Price] Fetching list-price-items for codProduto=${codProduto}`);
    const lpRes = await sigeAuthFetch("GET", `/list-price-items?codProduto=${encodeURIComponent(codProduto)}&limit=50&offset=1`);

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
      console.log(`[Price] list-price-items for ${codProduto}: ${priceListItems.length} items`);

      if (priceListItems.length > 0) {
        itemSampleKeys = Object.keys(priceListItems[0]);
        console.log(`[Price] Item sample keys: [${itemSampleKeys.join(",")}]`);
        console.log(`[Price] Item sample: ${JSON.stringify(priceListItems[0]).slice(0, 500)}`);

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
        console.log(`[Price] Detected lists: ${JSON.stringify(priceListDebug)}`);

        // Try configured mapping first
        if (listMapping.v1 && byList.has(listMapping.v1)) {
          v1 = byList.get(listMapping.v1)!.price;
          console.log(`[Price] Mapped v1 = list ${listMapping.v1} -> ${v1}`);
        }
        if (listMapping.v2 && byList.has(listMapping.v2)) {
          v2 = byList.get(listMapping.v2)!.price;
          console.log(`[Price] Mapped v2 = list ${listMapping.v2} -> ${v2}`);
        }
        if (listMapping.v3 && byList.has(listMapping.v3)) {
          v3 = byList.get(listMapping.v3)!.price;
          console.log(`[Price] Mapped v3 = list ${listMapping.v3} -> ${v3}`);
        }

        // Auto-detect: if no mapping configured or no prices found, assign first 3 lists to v1/v2/v3
        if (v1 === null && v2 === null && v3 === null) {
          const codes = Array.from(byList.keys()).sort();
          if (codes.length >= 1) v1 = byList.get(codes[0])!.price;
          if (codes.length >= 2) v2 = byList.get(codes[1])!.price;
          if (codes.length >= 3) v3 = byList.get(codes[2])!.price;
          console.log(`[Price] Auto-mapped: lists=[${codes.slice(0,3).join(",")}] -> v1=${v1}, v2=${v2}, v3=${v3}`);
        }

        // Base = first available
        base = v1 ?? v2 ?? v3 ?? null;
        if (base === null && priceListItems.length > 0) {
          base = extractPriceValue(priceListItems[0]);
        }
      }
    } else {
      console.log(`[Price] list-price-items for ${codProduto}: HTTP ${lpRes.status}, data: ${JSON.stringify(lpRes.data).slice(0, 300)}`);
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

    console.log(`[Price] ${sku}: final -> found=${found}, v1=${v1}, v2=${v2}, v3=${v3}, base=${base}, price=${selectedPrice}`);
    await kv.set(cacheKey, JSON.stringify(result));
    return c.json({ ...result, cached: false });
  } catch (e: any) {
    console.log(`[Price] Exception for SKU ${c.req.param("sku")}:`, e);
    return c.json({ error: e.message || `Erro: ${e}`, sku: c.req.param("sku"), found: false, price: null, v1: null, v2: null, v3: null, tier: "v2", showPrice: true });
  }
});

// ─── Custom prices management ───

// GET /produtos/custom-prices — list all custom prices (admin)
app.get(`${BASE}/produtos/custom-prices`, async (c) => {
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
    console.log(`[Price] Custom prices list: ${customs.length} items`);
    return c.json({ customs, total: customs.length });
  } catch (e: any) {
    console.log("[Price] Custom prices list exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// DELETE /price-cache — clear all price caches (admin)
app.delete(`${BASE}/price-cache`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const cachedEntries = await kv.getByPrefix("sige_price_");
    let cleared = 0;
    if (cachedEntries && cachedEntries.length > 0) {
      const keys = cachedEntries.map((e: any) => e.key);
      await kv.mdel(keys);
      cleared = keys.length;
    }
    console.log(`[Price] Cache cleared: ${cleared} entries by ${userId}`);
    return c.json({ cleared, message: `${cleared} caches de preco removidos.` });
  } catch (e: any) {
    console.log("[Price] Cache clear exception:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ═══════════════════════════════════════
// ─── PAGHIPER ─────────────────────────
// ═══════════════════════════════════════

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
app.get(`${BASE}/paghiper/config`, async (c) => {
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// PUT /paghiper/config — save PagHiper credentials (admin)
app.put(`${BASE}/paghiper/config`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const { apiKey, token } = await c.req.json();
    if (!apiKey || !token) {
      return c.json({ error: "API Key e Token sao obrigatorios." }, 400);
    }

    await kv.set("paghiper_config", JSON.stringify({
      apiKey,
      token,
      updatedAt: Date.now(),
    }));

    console.log(`[PagHiper] Config saved by user ${userId}`);
    return c.json({ success: true, configured: true });
  } catch (e: any) {
    console.log("[PagHiper] Config save error:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// DELETE /paghiper/config — remove PagHiper credentials (admin)
app.delete(`${BASE}/paghiper/config`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    await kv.del("paghiper_config");
    console.log(`[PagHiper] Config deleted by user ${userId}`);
    return c.json({ success: true, configured: false });
  } catch (e: any) {
    console.log("[PagHiper] Config delete error:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ─── PIX ───

// POST /paghiper/pix/create — create PIX charge
app.post(`${BASE}/paghiper/pix/create`, async (c) => {
  try {
    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper nao configurado." }, 400);

    const body = await c.req.json();
    const { order_id, payer_email, payer_name, payer_cpf_cnpj, payer_phone, items, days_due_date, notification_url } = body;

    if (!order_id || !payer_email || !payer_name || !payer_cpf_cnpj || !items?.length) {
      return c.json({ error: "Campos obrigatorios: order_id, payer_email, payer_name, payer_cpf_cnpj, items[]" }, 400);
    }

    const payload: any = {
      apiKey: creds.apiKey,
      order_id,
      payer_email,
      payer_name,
      payer_cpf_cnpj: payer_cpf_cnpj.replace(/\D/g, ""),
      payer_phone: payer_phone ? payer_phone.replace(/\D/g, "") : undefined,
      notification_url: notification_url || "",
      days_due_date: days_due_date || "1",
      items: items.map((item: any, i: number) => ({
        description: item.description || `Item ${i + 1}`,
        quantity: String(item.quantity || 1),
        item_id: String(item.item_id || i + 1),
        price_cents: String(item.price_cents),
      })),
    };

    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
    console.log(`[PagHiper] PIX create for order ${order_id}`);

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
    return c.json({ error: e.message || `Erro ao criar PIX: ${e}` }, 500);
  }
});

// POST /paghiper/pix/status — check PIX payment status
app.post(`${BASE}/paghiper/pix/status`, async (c) => {
  try {
    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper nao configurado." }, 400);

    const { transaction_id } = await c.req.json();
    if (!transaction_id) return c.json({ error: "transaction_id obrigatorio." }, 400);

    const res = await fetch(`${PAGHIPER_PIX_URL}/status/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        token: creds.token,
        transaction_id,
      }),
    });

    const data = await res.json();
    console.log(`[PagHiper] PIX status for ${transaction_id}:`, JSON.stringify(data));

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
    return c.json({ error: e.message || `Erro ao consultar PIX: ${e}` }, 500);
  }
});

// POST /paghiper/pix/cancel — cancel PIX charge (admin)
app.post(`${BASE}/paghiper/pix/cancel`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper nao configurado." }, 400);

    const { transaction_id, status } = await c.req.json();
    if (!transaction_id) return c.json({ error: "transaction_id obrigatorio." }, 400);

    const res = await fetch(`${PAGHIPER_PIX_URL}/cancel/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        token: creds.token,
        transaction_id,
        status: status || "canceled",
      }),
    });

    const data = await res.json();
    console.log(`[PagHiper] PIX cancel for ${transaction_id}:`, JSON.stringify(data));

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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ─── BOLETO ───

// POST /paghiper/boleto/create — create boleto charge
app.post(`${BASE}/paghiper/boleto/create`, async (c) => {
  try {
    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper nao configurado." }, 400);

    const body = await c.req.json();
    const {
      order_id, payer_email, payer_name, payer_cpf_cnpj, payer_phone,
      payer_street, payer_number, payer_complement, payer_district,
      payer_city, payer_state, payer_zip_code,
      items, days_due_date, notification_url, type_bank_slip,
      fixed_description, seller_description
    } = body;

    if (!order_id || !payer_email || !payer_name || !payer_cpf_cnpj || !items?.length) {
      return c.json({ error: "Campos obrigatorios: order_id, payer_email, payer_name, payer_cpf_cnpj, items[]" }, 400);
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
      notification_url: notification_url || "",
      days_due_date: days_due_date || "3",
      type_bank_slip: type_bank_slip || "boletoA4",
      fixed_description: fixed_description !== undefined ? String(fixed_description) : undefined,
      seller_description: seller_description || undefined,
      items: items.map((item: any, i: number) => ({
        description: item.description || `Item ${i + 1}`,
        quantity: String(item.quantity || 1),
        item_id: String(item.item_id || i + 1),
        price_cents: String(item.price_cents),
      })),
    };

    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
    console.log(`[PagHiper] Boleto create for order ${order_id}`);

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
    return c.json({ error: e.message || `Erro ao criar boleto: ${e}` }, 500);
  }
});

// POST /paghiper/boleto/status — check boleto payment status
app.post(`${BASE}/paghiper/boleto/status`, async (c) => {
  try {
    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper nao configurado." }, 400);

    const { transaction_id } = await c.req.json();
    if (!transaction_id) return c.json({ error: "transaction_id obrigatorio." }, 400);

    const res = await fetch(`${PAGHIPER_BOLETO_URL}/status/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        token: creds.token,
        transaction_id,
      }),
    });

    const data = await res.json();
    console.log(`[PagHiper] Boleto status for ${transaction_id}:`, JSON.stringify(data));

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
    return c.json({ error: e.message || `Erro ao consultar boleto: ${e}` }, 500);
  }
});

// POST /paghiper/boleto/cancel — cancel boleto (admin)
app.post(`${BASE}/paghiper/boleto/cancel`, async (c) => {
  try {
    const userId = await getAuthUserId(c.req.raw);
    if (!userId) return c.json({ error: "Nao autorizado." }, 401);

    const creds = await getPagHiperCredentials();
    if (!creds) return c.json({ error: "PagHiper nao configurado." }, 400);

    const { transaction_id } = await c.req.json();
    if (!transaction_id) return c.json({ error: "transaction_id obrigatorio." }, 400);

    const res = await fetch(`${PAGHIPER_BOLETO_URL}/cancel/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        token: creds.token,
        transaction_id,
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// ─── NOTIFICATION WEBHOOK ───

// POST /paghiper/notification — PagHiper notification callback (public, no auth)
app.post(`${BASE}/paghiper/notification`, async (c) => {
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

    const { notification_id, idTransacao, transaction_id: txId } = body;
    const transactionId = idTransacao || txId;
    console.log(`[PagHiper] Notification received: notification_id=${notification_id}, transactionId=${transactionId}`);

    if (!transactionId) {
      console.log("[PagHiper] Notification missing transactionId, body:", JSON.stringify(body));
      return c.json({ received: true, warning: "missing transactionId" });
    }

    const existing = await kv.get(`paghiper_tx_${transactionId}`);
    const txType = existing
      ? (typeof existing === "string" ? JSON.parse(existing) : existing).type || "pix"
      : "pix";

    const creds = await getPagHiperCredentials();
    if (!creds) {
      console.log("[PagHiper] Notification: no credentials configured");
      return c.json({ received: true, warning: "no credentials" });
    }

    const statusUrl = txType === "boleto"
      ? `${PAGHIPER_BOLETO_URL}/status/`
      : `${PAGHIPER_PIX_URL}/status/`;

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

    console.log(`[PagHiper] Notification: tx=${transactionId} type=${txType} status=${status}`);

    if (existing) {
      const tx = typeof existing === "string" ? JSON.parse(existing) : existing;
      tx.status = status;
      tx.status_updated_at = Date.now();
      tx.notification_id = notification_id;
      if (statusData?.paid_date) tx.paid_date = statusData.paid_date;
      if (statusData?.value_cents_paid) tx.value_cents_paid = Number(statusData.value_cents_paid);
      await kv.set(`paghiper_tx_${transactionId}`, JSON.stringify(tx));
    }

    await kv.set(`paghiper_notif_${Date.now()}`, JSON.stringify({
      notification_id,
      transaction_id: transactionId,
      type: txType,
      status,
      received_at: Date.now(),
      raw: body,
    }));

    return c.json({ received: true, status });
  } catch (e: any) {
    console.log("[PagHiper] Notification exception:", e);
    return c.json({ received: true, error: e.message }, 500);
  }
});

// ─── TRANSACTIONS LIST (admin) ───

// GET /paghiper/transactions — list all PagHiper transactions
app.get(`${BASE}/paghiper/transactions`, async (c) => {
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
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

// GET /paghiper/transaction/:id — get single transaction
app.get(`${BASE}/paghiper/transaction/:id`, async (c) => {
  try {
    const txId = c.req.param("id");
    const raw = await kv.get(`paghiper_tx_${txId}`);
    if (!raw) return c.json({ error: "Transacao nao encontrada." }, 404);
    const tx = typeof raw === "string" ? JSON.parse(raw) : raw;
    return c.json(tx);
  } catch (e: any) {
    console.log("[PagHiper] Transaction get error:", e);
    return c.json({ error: e.message || `Erro: ${e}` }, 500);
  }
});

Deno.serve(app.fetch);