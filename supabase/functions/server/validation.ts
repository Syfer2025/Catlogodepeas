// ═══════════════════════════════════════════════════════════════════════
// Input Validation Utilities — lightweight schema-based validation
// Prevents XSS stored, injection, and malformed payloads
// ═══════════════════════════════════════════════════════════════════════

// --- Validation result type ---
export interface ValidationResult {
  ok: boolean;
  errors: string[];
  sanitized: Record<string, any>;
}

// --- Field rule definition ---
export interface FieldRule {
  required?: boolean;
  type?: "string" | "number" | "boolean" | "array" | "object";
  minLen?: number;
  maxLen?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  patternMsg?: string;
  sanitize?: boolean;        // strip HTML tags (default true for strings)
  trim?: boolean;            // trim whitespace (default true)
  maxItems?: number;         // for arrays
  oneOf?: (string | number)[];
  custom?: (val: any) => string | null;  // return error message or null
}

export type Schema = Record<string, FieldRule>;

// --- HTML tag stripper (prevents stored XSS) ---
function _stripTags(input: string): string {
  if (!input) return "";
  // First pass: remove tags
  var clean = input.replace(/<[^>]*>/g, "");
  // Decode common entities and strip again (double-encoding bypass prevention)
  clean = clean.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
  clean = clean.replace(/<[^>]*>/g, "");
  // Strip dangerous patterns (javascript: protocol, event handlers)
  clean = clean.replace(/javascript\s*:/gi, "");
  clean = clean.replace(/on\w+\s*=/gi, "");
  // Collapse excessive whitespace
  clean = clean.replace(/\s{10,}/g, "  ");
  return clean;
}

// --- Email validation ---
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function _isValidEmail(v: string): boolean {
  if (!v || v.length > 254) return false;
  return EMAIL_RE.test(v);
}

// --- CPF validation (Brazilian) ---
function _isValidCPF(cpf: string): boolean {
  var digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  // Check for known invalid sequences (all same digit)
  if (/^(\d)\1{10}$/.test(digits)) return false;
  // Validate check digits
  var sum = 0;
  for (var i = 0; i < 9; i++) sum += parseInt(digits.charAt(i)) * (10 - i);
  var rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  if (rem !== parseInt(digits.charAt(9))) return false;
  sum = 0;
  for (var j = 0; j < 10; j++) sum += parseInt(digits.charAt(j)) * (11 - j);
  rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  if (rem !== parseInt(digits.charAt(10))) return false;
  return true;
}

// --- CNPJ validation (Brazilian) ---
function _isValidCNPJ(cnpj: string): boolean {
  var digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  var weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  var weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  var sum = 0;
  for (var i = 0; i < 12; i++) sum += parseInt(digits.charAt(i)) * weights1[i];
  var rem = sum % 11;
  var d1 = rem < 2 ? 0 : 11 - rem;
  if (parseInt(digits.charAt(12)) !== d1) return false;
  sum = 0;
  for (var j = 0; j < 13; j++) sum += parseInt(digits.charAt(j)) * weights2[j];
  rem = sum % 11;
  var d2 = rem < 2 ? 0 : 11 - rem;
  if (parseInt(digits.charAt(13)) !== d2) return false;
  return true;
}

// --- CEP validation (Brazilian postal code) ---
var CEP_RE = /^\d{5}-?\d{3}$/;

// --- Phone validation (Brazilian, flexible) ---
var PHONE_RE = /^(\+?55)?\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/;

// --- Main validate function ---
export function validate(body: any, schema: Schema): ValidationResult {
  var errors: string[] = [];
  var sanitized: Record<string, any> = {};

  if (!body || typeof body !== "object") {
    return { ok: false, errors: ["Corpo da requisicao invalido."], sanitized: {} };
  }

  var keys = Object.keys(schema);
  for (var ki = 0; ki < keys.length; ki++) {
    var field = keys[ki];
    var rule = schema[field];
    var raw = body[field];
    var val = raw;

    // --- Required check ---
    if (rule.required) {
      if (val === undefined || val === null || val === "") {
        errors.push("Campo '" + field + "' e obrigatorio.");
        continue;
      }
    }

    // If not required and not present, skip
    if (val === undefined || val === null) {
      sanitized[field] = val;
      continue;
    }

    // --- Type check ---
    var expectedType = rule.type || "string";
    if (expectedType === "string") {
      val = String(val);
      // Trim
      if (rule.trim !== false) val = val.trim();
      // Sanitize (strip HTML by default)
      if (rule.sanitize !== false) val = _stripTags(val);
      // MaxLen
      if (rule.maxLen && val.length > rule.maxLen) {
        val = val.substring(0, rule.maxLen);
      }
      // MinLen
      if (rule.minLen && val.length < rule.minLen) {
        errors.push("Campo '" + field + "' deve ter pelo menos " + rule.minLen + " caracteres.");
        continue;
      }
      // Pattern
      if (rule.pattern && !rule.pattern.test(val)) {
        errors.push(rule.patternMsg || "Campo '" + field + "' tem formato invalido.");
        continue;
      }
      // OneOf
      if (rule.oneOf && rule.oneOf.indexOf(val) === -1) {
        errors.push("Campo '" + field + "' valor invalido.");
        continue;
      }
    } else if (expectedType === "number") {
      val = Number(val);
      if (isNaN(val)) {
        errors.push("Campo '" + field + "' deve ser um numero.");
        continue;
      }
      if (rule.min !== undefined && val < rule.min) {
        errors.push("Campo '" + field + "' deve ser no minimo " + rule.min + ".");
        continue;
      }
      if (rule.max !== undefined && val > rule.max) {
        errors.push("Campo '" + field + "' deve ser no maximo " + rule.max + ".");
        continue;
      }
    } else if (expectedType === "boolean") {
      val = Boolean(val);
    } else if (expectedType === "array") {
      if (!Array.isArray(val)) {
        errors.push("Campo '" + field + "' deve ser uma lista.");
        continue;
      }
      if (rule.maxItems && val.length > rule.maxItems) {
        errors.push("Campo '" + field + "' excede o maximo de " + rule.maxItems + " itens.");
        continue;
      }
    } else if (expectedType === "object") {
      if (typeof val !== "object" || Array.isArray(val)) {
        errors.push("Campo '" + field + "' deve ser um objeto.");
        continue;
      }
    }

    // Custom validator
    if (rule.custom) {
      var customErr = rule.custom(val);
      if (customErr) {
        errors.push(customErr);
        continue;
      }
    }

    sanitized[field] = val;
  }

  return { ok: errors.length === 0, errors: errors, sanitized: sanitized };
}

// --- Pre-built validators for common fields ---
export var validators = {
  email: function (v: any): string | null {
    if (!_isValidEmail(String(v || ""))) return "Email invalido.";
    return null;
  },
  cpf: function (v: any): string | null {
    var s = String(v || "").replace(/\D/g, "");
    if (s.length === 0) return null; // optional
    if (!_isValidCPF(s)) return "CPF invalido.";
    return null;
  },
  cnpj: function (v: any): string | null {
    var s = String(v || "").replace(/\D/g, "");
    if (s.length === 0) return null;
    if (!_isValidCNPJ(s)) return "CNPJ invalido.";
    return null;
  },
  cpfOrCnpj: function (v: any): string | null {
    var s = String(v || "").replace(/\D/g, "");
    if (s.length === 0) return null;
    if (s.length === 11) return _isValidCPF(s) ? null : "CPF invalido.";
    if (s.length === 14) return _isValidCNPJ(s) ? null : "CNPJ invalido.";
    return "CPF/CNPJ invalido.";
  },
  cep: function (v: any): string | null {
    if (!CEP_RE.test(String(v || ""))) return "CEP invalido.";
    return null;
  },
  phone: function (v: any): string | null {
    var s = String(v || "").trim();
    if (s.length === 0) return null; // optional
    if (!PHONE_RE.test(s)) return "Telefone invalido.";
    return null;
  },
  noScript: function (v: any): string | null {
    var s = String(v || "");
    if (/<script/i.test(s) || /javascript\s*:/i.test(s) || /on\w+\s*=/i.test(s)) {
      return "Conteudo nao permitido.";
    }
    return null;
  },
  positiveInt: function (v: any): string | null {
    var n = Number(v);
    if (!Number.isInteger(n) || n < 1) return "Deve ser um numero inteiro positivo.";
    return null;
  },
};

// --- Schemas for common routes ---
export var schemas = {
  signup: {
    email: { required: true, maxLen: 254, custom: validators.email },
    password: { required: true, type: "string" as const, minLen: 8, maxLen: 128, sanitize: false },
    name: { maxLen: 150 },
    phone: { maxLen: 30, custom: validators.phone },
    cpf: { maxLen: 20, custom: validators.cpf },
    website: { maxLen: 500 },
    company_url: { maxLen: 500 },
    fax_number: { maxLen: 500 },
  },
  login: {
    email: { required: true, maxLen: 254, custom: validators.email },
    password: { required: true, type: "string" as const, minLen: 1, maxLen: 128, sanitize: false },
    website: { maxLen: 500 },
    company_url: { maxLen: 500 },
    fax_number: { maxLen: 500 },
  },
  forgotPassword: {
    email: { required: true, maxLen: 254, custom: validators.email },
    website: { maxLen: 500 },
    company_url: { maxLen: 500 },
    fax_number: { maxLen: 500 },
  },
  changePassword: {
    currentPassword: { required: true, type: "string" as const, minLen: 1, maxLen: 128, sanitize: false },
    newPassword: { required: true, type: "string" as const, minLen: 8, maxLen: 128, sanitize: false },
  },
  review: {
    sku: { required: true, type: "string" as const, maxLen: 100 },
    rating: { required: true, type: "number" as const, min: 1, max: 5 },
    title: { maxLen: 200 },
    comment: { maxLen: 2000 },
  },
  address: {
    label: { maxLen: 50 },
    cep: { required: true, maxLen: 10, custom: validators.cep },
    street: { required: true, maxLen: 200 },
    number: { required: true, maxLen: 20 },
    complement: { maxLen: 100 },
    neighborhood: { required: true, maxLen: 100 },
    city: { required: true, maxLen: 100 },
    state: { required: true, maxLen: 2 },
    recipient: { maxLen: 150 },
  },
  couponValidate: {
    code: { required: true, type: "string" as const, maxLen: 50 },
    orderTotal: { type: "number" as const, min: 0, max: 99999999 },
  },
  couponUse: {
    code: { required: true, type: "string" as const, maxLen: 50 },
    orderId: { type: "string" as const, maxLen: 100 },
  },
  profileUpdate: {
    name: { maxLen: 150 },
    phone: { maxLen: 30, custom: validators.phone },
    cpf: { maxLen: 20, custom: validators.cpf },
    birthdate: { maxLen: 15 },
  },
};

// --- Request body size limiter (bytes) ---
export function checkBodySize(body: string | null, maxBytes: number): boolean {
  if (!body) return true;
  // Use TextEncoder for accurate byte count (UTF-8)
  var byteLen = new TextEncoder().encode(body).length;
  return byteLen <= maxBytes;
}

// --- Validate and return early response if invalid ---
export function validateOrError(body: any, schema: Schema): { valid: true; data: Record<string, any> } | { valid: false; errors: string[] } {
  var result = validate(body, schema);
  if (!result.ok) {
    return { valid: false, errors: result.errors };
  }
  return { valid: true, data: result.sanitized };
}
