/**
 * Copies text, preferring the Clipboard API and falling back to the selection trick.
 *
 * The two are tried in sequence, not either/or: this Android WebView *has* `navigator.clipboard` and
 * still rejects `writeText` with "Write permission denied", and the old shape returned false at that
 * rejection without ever reaching `execCommand`, so every copy on the device reported failure while a
 * working path existed.
 */
export async function copyText(text: string) {
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection path below.
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}
