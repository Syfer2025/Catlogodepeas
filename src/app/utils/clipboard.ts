/**
 * Fallback clipboard copy using a temporary textarea + execCommand.
 * Works in iframes and restricted permission-policy environments
 * where navigator.clipboard.writeText is blocked.
 */
export function copyToClipboard(text: string): void {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  } catch (e) {
    console.warn("[clipboard] fallback copy failed:", e);
  }
}
