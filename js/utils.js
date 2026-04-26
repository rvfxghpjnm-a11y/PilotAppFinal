export async function safeJsonFromSettled(result) {
  try {
    if (result.status !== "fulfilled") return null;
    if (!result.value?.ok) return null;
    return await result.value.json();
  } catch {
    return null;
  }
}

export function valueOrDash(v) {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

export function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

export function detailRow(label, value) {
  return `
    <div class="detail-row">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${escapeHtml(valueOrDash(value))}</div>
    </div>
  `;
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleString("de-DE");
  } catch {
    return dateStr;
  }
}

export function capitalizeWords(text) {
  return String(text || "")
    .split(" ")
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

export function parseLotseTime(val) {
  const m = String(val || "").match(/^([A-Z][a-z])(\d{2}):(\d{2})$/);
  if (!m) return null;

  const wdMap = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 0 };
  const wdTarget = wdMap[m[1]];
  if (wdTarget === undefined) return null;

  const hh = Number(m[2]);
  const mm = Number(m[3]);

  const now = new Date();
  const d = new Date(now);

  const diff = (wdTarget - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  d.setHours(hh, mm, 0, 0);

  if (d.getTime() - now.getTime() > 36 * 3600 * 1000) {
    return null;
  }

  return d;
}