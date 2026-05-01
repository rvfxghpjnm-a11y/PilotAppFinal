
export async function loadKielView(
  contentEl,
  statusEl,
  escapeHtml,
  formatDateTime
) {
  try {
    const res = await fetch("data/schiffe_merged.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error("schiffe_merged.json nicht ladbar");
    }

    const data = await res.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const rows = buildKielRows(entries);

    let html = '<div style="max-width:1200px;">';

    html += `
      <div class="view-header" style="padding:10px 12px; margin-bottom:10px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div class="view-title" style="font-size:20px; margin:0;">Kiel</div>
            <span class="badge info">${escapeHtml(rows.length)} Meldungen</span>
          </div>
          <div class="badges-row" style="gap:6px;">
            <span class="badge success">bestätigt ${escapeHtml(rows.filter(r => r.confirmed).length)}</span>
            <span class="badge gray">offen ${escapeHtml(rows.filter(r => !r.confirmed).length)}</span>
          </div>
        </div>
        <div class="meta-info" style="font-size:12px; margin-top:4px;">
          Generiert: ${escapeHtml(formatDateTime(data.generated_at))}
        </div>
      </div>
    `;

    if (!rows.length) {
      html += '<div style="opacity:.65; padding:12px;">Keine Kiel-Meldungen gefunden.</div>';
      html += "</div>";
      contentEl.innerHTML = html;
      statusEl.textContent = "Kiel " + new Date().toLocaleTimeString("de-DE");
      return;
    }

    html += '<div class="section-header" style="margin-top:12px; margin-bottom:6px;">Meldungen Kiel</div>';

    rows.forEach((row, index) => {
      html += renderKielRow(row, index, escapeHtml);
    });

    html += "</div>";

    contentEl.innerHTML = html;
    statusEl.textContent = "Kiel " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Kiel-Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

function buildKielRows(entries) {
  const rows = [];

  entries.forEach((shipEntry) => {
    const summary = shipEntry.summary || {};
    const meldungen = Array.isArray(shipEntry.meldungen_kiel)
      ? shipEntry.meldungen_kiel
      : [];

    meldungen.forEach((meldung) => {
      const remark = firstNonEmpty(
        meldung.remark,
        summary.remark_kiel,
        summary.remark,
        ""
      );

      rows.push({
        ship_key: shipEntry.ship_key || normalizeShipName(shipEntry.name),
        name: firstNonEmpty(meldung.name, shipEntry.name, summary.name, "—"),
        nr: firstNonEmpty(meldung.nr, "—"),
        time: firstNonEmpty(meldung.time, summary.eta_kiel, summary.eta_schleuse, ""),
        route: buildRoute(meldung, summary),
        from: firstNonEmpty(meldung.from, ""),
        to: firstNonEmpty(meldung.to, ""),
        q: firstNonEmpty(meldung.q_gruppe, summary.q_gruppe, "—"),
        draft: firstNonEmpty(meldung.draft, summary.draft, "—"),
        lotsen: firstNonEmpty(meldung.lotsen_anzahl, summary.lotsen_anzahl_kiel, "—"),
        confirmed: Boolean(meldung.confirmed !== undefined && meldung.confirmed !== null ? meldung.confirmed : summary.confirmed_kiel),
        remark,
        liegeplatz: extractLiegeplatz(remark),
        agentur: firstNonEmpty(
          summary.makler,
          summary.agentur,
          summary.agency,
          meldung.makler,
          meldung.agentur,
          "—"
        ),
        assignedPilots: buildAssignedPilots(shipEntry),
        currentEta: firstNonEmpty(
          summary.eta_schleuse,
          summary.eta_kiel,
          summary.eta,
          summary.eta_rueb,
          ""
        ),
        sourceSummary: summary,
      });
    });
  });

  rows.sort((a, b) => {
    const ta = parseDateForSort(a.time);
    const tb = parseDateForSort(b.time);
    return ta - tb;
  });

  return rows;
}

function renderKielRow(row, index, escapeHtml) {
  const confirmedBadge = row.confirmed
    ? '<span class="badge success" style="font-size:12px;">bestätigt</span>'
    : '<span class="badge gray" style="font-size:12px;">offen</span>';

  const remarkHtml = isMeaningful(row.remark)
    ? `<span>Bem. ${escapeHtml(row.remark)}</span>`
    : "";

  const etaHtml = isMeaningful(row.currentEta)
    ? `<span>ETA ${escapeHtml(shortTime(row.currentEta))}</span>`
    : "";

  const pilotsHtml = isMeaningful(row.assignedPilots)
    ? `<span>Lotse ${escapeHtml(row.assignedPilots)}</span>`
    : "";

  return `
    <div class="card" style="margin-bottom:6px; padding:8px 10px;">
      <div style="display:flex; gap:8px 12px; flex-wrap:wrap; align-items:baseline; line-height:1.25;">
        <span style="font-weight:800; opacity:.75; min-width:26px;">${index + 1}.</span>
        <span style="font-weight:800; min-width:48px;">${escapeHtml(shortTime(row.time))}</span>
        <span style="font-weight:800; flex:1 1 180px; min-width:0; overflow-wrap:anywhere;">${escapeHtml(row.name)}</span>
        <span class="badge gray" style="font-size:12px;">Nr ${escapeHtml(row.nr)}</span>
        <span class="badge gray" style="font-size:12px;">Q ${escapeHtml(row.q)}</span>
        <span class="badge gray" style="font-size:12px;">TG ${escapeHtml(row.draft)}</span>
        <span class="badge gray" style="font-size:12px;">Lotsen ${escapeHtml(row.lotsen)}</span>
        ${confirmedBadge}
      </div>

      <div style="margin-top:4px; display:flex; gap:8px 14px; flex-wrap:wrap; font-size:13px; opacity:.88; line-height:1.25;">
        <span style="font-weight:700;">${escapeHtml(row.route)}</span>
        ${etaHtml}
        <span>Agentur ${escapeHtml(row.agentur)}</span>
        <span>LP ${escapeHtml(row.liegeplatz)}</span>
        ${pilotsHtml}
        ${remarkHtml}
      </div>
    </div>
  `;
}

function buildAssignedPilots(shipEntry) {
  const summary = shipEntry.summary || {};
  const names = [];

  if (Array.isArray(summary.assigned_pilots)) {
    names.push(...summary.assigned_pilots);
  }

  if (summary.pilot_1_name) {
    names.push(summary.pilot_1_name);
  }

  if (Array.isArray(shipEntry.seelotsen)) {
    shipEntry.seelotsen.forEach((p) => {
      if (p.pilot_name) names.push(p.pilot_name);
    });
  }

  return [...new Set(names.filter(Boolean))].join(", ");
}

function buildRoute(meldung, summary) {
  const from = firstNonEmpty(meldung.from, "");
  const to = firstNonEmpty(meldung.to, "");

  if (from || to) {
    return `${from || "—"} → ${to || "—"}`;
  }

  return firstNonEmpty(meldung.route, summary.route, "—");
}

function extractLiegeplatz(text) {
  const value = String(text || "");

  const lp = value.match(/\bLp\.?\s*([0-9A-Za-zÄÖÜäöüß./-]+)/i);
  if (lp) return lp[1];

  const liegeplatz = value.match(/\bLiegeplatz\s*([0-9A-Za-zÄÖÜäöüß./-]+)/i);
  if (liegeplatz) return liegeplatz[1];

  return "—";
}

function shortTime(value) {
  if (!value) return "—";

  const text = String(value).trim();

  const m = text.match(/\b(\d{2}):(\d{2})\b/);
  if (m) return `${m[1]}:${m[2]}`;

  return text;
}

function parseDateForSort(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;

  const text = String(value).trim();
  const isoLike = text.replace(" ", "T");
  const d = new Date(isoLike);

  if (!Number.isNaN(d.getTime())) return d.getTime();

  const m = text.match(/\b(\d{2}):(\d{2})\b/);
  if (!m) return Number.MAX_SAFE_INTEGER;

  const now = new Date();
  now.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return now.getTime();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return "";
}

function isMeaningful(value) {
  const text = String(value !== undefined && value !== null ? value : "").trim();
  return text !== "" && text !== "—";
}

function normalizeShipName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}
