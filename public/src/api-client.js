/**
 * Requests an explanation for a known question id.
 * @param {string} questionId
 * @returns {Promise<{ explanation: string, fallback: boolean }>}
 */
export async function fetchExplanation(questionId) {
  const response = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: questionId }),
  });
  if (!response.ok) throw new Error("Explanation unavailable");
  const payload = await response.json();
  if (typeof payload.explanation !== "string") throw new Error("Explanation unavailable");
  return { explanation: payload.explanation, fallback: Boolean(payload.fallback) };
}

/**
 * Copies text using the clipboard API or a temporary selection fallback.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.className = "clipboard-fallback";
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      return copied;
    } catch {
      return false;
    }
  }
}
