// ═══════════════════════════════════════════════════════════════════════
// reCAPTCHA v3 hook — DISABLED
// All captcha verification is bypassed. This hook is a no-op stub.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback } from "react";

export function useRecaptcha() {
  var executeRecaptcha = useCallback(function (_action: string): Promise<string> {
    return Promise.resolve("");
  }, []);

  return { ready: false, executeRecaptcha: executeRecaptcha };
}
