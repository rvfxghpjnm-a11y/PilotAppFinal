export async function loadSeelotseView(
  contentEl,
  statusEl,
  detailRow,
  escapeHtml,
  formatDateTime,
  safeJsonFromSettled,
  currentPerson
) {
  try {
    if (!currentPerson?.key) {
      throw new Error("currentPerson fehlt");
    }

    const [resSeelotse, resDispatch, resQ] = await Promise.allSettled([
      fetch(`data/${currentPerson.key}_seelotse.json`, { cache: "no-store" }),
      fetch("data/ruesterbergen_dispatch.json", { cache: "no-store" }),
      fetch("data/q_gruppen_lotsen.json", { cache: "no-store" }),
    ]);

    if (resSeelotse.status !== "fulfilled" || !resSeelotse.value.ok) {
      throw new Error(`${currentPerson.key}_seelotse.json nicht ladbar`);
    }

    const data = await resSeelotse.value.json();
    const dispatchData = await safeJsonFromSettled(resDispatch);
    const qData = await safeJsonFromSettled(resQ);

    const lotsen = Array.isArray(data.lotsen) ? data.lotsen : [];
    const grouped = groupLotsen(lotsen);
    const metaIndex = buildPilotMetaIndex(qData);

    let html = '<div style="max-width:1200px;">';

    html += renderCompactHeader(data, dispatchData, grouped, escapeHtml, formatDateTime);

    html += renderGroup("Kanalbört", grouped.kanal, metaIndex, escapeHtml);
    html += renderGroup("Seebört", grouped.see, metaIndex, escapeHtml);
    html += renderGroup("Wachgänger", grouped.wach, metaIndex, escapeHtml);

    if (grouped.sonstige.length > 0) {
      html += renderGroup("Sonstige", grouped.sonstige, metaIndex, escapeHtml);
    }

    html += "</div>";

    contentEl.innerHTML = html;
    statusEl.textContent = "Seelotse " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

function renderCompactHeader(data, dispatchData, grouped, escapeHtml, formatDateTime) {
  const statusBadge =
    data.status === "in_seelotse"
      ? '<span class="badge success">✓ In Seelotse</span>'
      : '<span class="badge gray">Nicht in Seelotse</span>';

  const kanalCount = data?.gruppen?.kanal ?? grouped.kanal.length;
  const wachCount = data?.gruppen?.wach ?? grouped.wach.length;
  const seeCount = data?.gruppen?.see ?? grouped.see.length;

  const ruebShips = dispatchData?.counts?.ships_for_ruesterbergen ?? "0";
  const ruebAssigned = dispatchData?.counts?.assignments ?? "0";
  const ruebOpen = dispatchData?.counts?.unassigned_ships ?? "0";

  return `
    <div class="view-header" style="padding:10px 12px; margin-bottom:10px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <div class="view-title" style="font-size:20px; margin:0;">Seelotse</div>
          ${statusBadge}
        </div>

        <div class="badges-row" style="gap:6px;">
          <span class="badge info">Kanal ${escapeHtml(kanalCount)}</span>
          <span class="badge info">See ${escapeHtml(seeCount)}</span>
          <span class="badge info">Wach ${escapeHtml(wachCount)}</span>
          <span class="badge gray">RÜB ${escapeHtml(ruebShips)}</span>
          <span class="badge success">Zu ${escapeHtml(ruebAssigned)}</span>
          <span class="badge gray">Offen ${escapeHtml(ruebOpen)}</span>
        </div>
      </div>

      <div class="meta-info" style="font-size:12px; margin-top:4px;">
        Generiert: ${escapeHtml(formatDateTime(data.generated_at))}
      </div>
    </div>
  `;
}

function renderGroup(title, lotsen, metaIndex, escapeHtml) {
  const sorted = [...lotsen].sort((a, b) => {
    const ta = parseTimeForSort(a.time);
    const tb = parseTimeForSort(b.time);
    return tb - ta;
  });

  let html = `
    <div class="section-header" style="margin-top:12px; margin-bottom:6px;">
      ${escapeHtml(title)} <span style="opacity:.65; font-weight:400;">(${sorted.length})</span>
    </div>
  `;

  if (!sorted.length) {
    html += '<div style="opacity:.55; padding:4px 0 8px 0; font-size:13px;">Keine Einträge</div>';
    return html;
  }

  sorted.forEach((lotse, index) => {
    const meta = findPilotMeta(lotse, metaIndex);

    const name = lotse.name || buildName(lotse) || "—";
    const time = shortTime(lotse.time);
    const aufgabe = lotse.aufgabe || "—";
    const fahrzeug = lotse.fahrzeug || "—";
    const route = lotse.route || "—";
    const etaRueb = lotse?.times?.eta_rueb || "—";
    const etaSchleuse = lotse?.times?.eta_schleuse || "—";

    const q = firstNonEmpty(
      meta.q,
      lotse.q_gruppe,
      lotse.q,
      lotse.pilot_q,
      lotse.qualifikation,
      lotse.quali,
      "—"
    );

    const takt = firstNonEmpty(
      meta.last_takt,
      "—"
    );

    const lastPos = firstNonEmpty(
      meta.last_pos,
      "—"
    );

    html += `
      <div class="card" style="margin-bottom:6px; padding:8px 10px;">
        <div style="display:flex; align-items:baseline; gap:8px 12px; flex-wrap:wrap; line-height:1.25;">
          <span style="font-weight:800; opacity:.75; min-width:26px;">${index + 1}.</span>
          <span style="font-weight:800; min-width:48px;">${escapeHtml(time)}</span>
          <span style="font-weight:800; flex:1 1 210px; min-width:0; overflow-wrap:anywhere;">${escapeHtml(name)}</span>
          <span class="badge info" style="font-size:12px;">${escapeHtml(aufgabe)}</span>
          <span class="badge gray" style="font-size:12px;">Q ${escapeHtml(q)}</span>
          <span class="badge gray" style="font-size:12px;">Takt ${escapeHtml(takt)}</span>
          <span class="badge gray" style="font-size:12px;">GB-Pos ${escapeHtml(lastPos)}</span>
        </div>

        <div style="margin-top:4px; display:flex; gap:8px 14px; flex-wrap:wrap; font-size:13px; opacity:.86; line-height:1.25;">
          <span style="font-weight:700;">${escapeHtml(fahrzeug)}</span>
          <span>${escapeHtml(route)}</span>
          <span>RÜB ${escapeHtml(etaRueb)}</span>
          <span>SL ${escapeHtml(etaSchleuse)}</span>
        </div>
      </div>
    `;
  });

  return html;
}

function groupLotsen(lotsen) {
  const grouped = {
    kanal: [],
    see: [],
    wach: [],
    sonstige: [],
  };

  lotsen.forEach((lotse) => {
    const task = normalizeText(lotse.aufgabe);

    if (task.includes("kanal")) {
      grouped.kanal.push(lotse);
    } else if (task.includes("see")) {
      grouped.see.push(lotse);
    } else if (task.includes("wach")) {
      grouped.wach.push(lotse);
    } else {
      grouped.sonstige.push(lotse);
    }
  });

  return grouped;
}

function buildPilotMetaIndex(qData) {
  const index = new Map();

  function addMetaForName(name, meta) {
    if (!name) return;

    makeNameKeys(name).forEach((key) => {
      if (!key) return;
      index.set(key, meta);
    });
  }

  function addFromEntry(entry) {
    if (!entry) return;

    const meta = {
      q: firstNonEmpty(entry.q_gruppe, entry.q, entry.qualifikation, entry.quali, ""),
      last_takt: firstNonEmpty(entry.last_takt, ""),
      last_pos: firstNonEmpty(entry.last_pos, entry.pos, entry.position, ""),
      last_seen: firstNonEmpty(entry.last_seen, ""),
    };

    const names = [];

    if (entry.name) {
      names.push(entry.name);
    }

    if (entry.vorname || entry.nachname) {
      names.push(`${entry.vorname || ""} ${entry.nachname || ""}`.trim());
      names.push(`${entry.nachname || ""}, ${entry.vorname || ""}`.trim());
      names.push(`${entry.nachname || ""} ${entry.vorname || ""}`.trim());
    }

    names.forEach((name) => addMetaForName(name, meta));
  }

  if (Array.isArray(qData?.entries)) {
    qData.entries.forEach(addFromEntry);
  }

  if (Array.isArray(qData?.lotsen)) {
    qData.lotsen.forEach(addFromEntry);
  }

  return index;
}

function findPilotMeta(lotse, metaIndex) {
  const names = [];

  if (lotse.name) {
    names.push(lotse.name);
  }

  const builtName = buildName(lotse);
  if (builtName) {
    names.push(builtName);
  }

  if (lotse.vorname || lotse.nachname) {
    names.push(`${lotse.nachname || ""}, ${lotse.vorname || ""}`.trim());
    names.push(`${lotse.nachname || ""} ${lotse.vorname || ""}`.trim());
    names.push(`${lotse.vorname || ""} ${lotse.nachname || ""}`.trim());
  }

  for (const name of names) {
    for (const key of makeNameKeys(name)) {
      const found = metaIndex.get(key);
      if (found) return found;
    }
  }

  return {};
}

function makeNameKeys(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];

  const normalized = normalizeName(raw);
  const withoutComma = normalizeName(raw.replace(",", " "));

  const tokens = withoutComma
    .split(" ")
    .filter(Boolean);

  const tokensSorted = [...tokens].sort().join(" ");
  const firstLast = tokens.join(" ");
  const lastFirst = tokens.length >= 2
    ? [tokens[tokens.length - 1], ...tokens.slice(0, tokens.length - 1)].join(" ")
    : "";

  return [...new Set([
    normalized,
    withoutComma,
    tokensSorted,
    firstLast,
    lastFirst,
  ].filter(Boolean))];
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[,.;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildName(lotse) {
  const vorname = lotse.vorname || lotse.first_name || "";
  const nachname = lotse.nachname || lotse.last_name || "";

  return `${vorname} ${nachname}`.trim();
}

function shortTime(value) {
  if (!value) return "—";

  const text = String(value).trim();

  const iso = text.match(/\b(\d{2}):(\d{2})\b/);
  if (iso) return `${iso[1]}:${iso[2]}`;

  return text;
}

function parseTimeForSort(value) {
  if (!value) return 0;

  const text = String(value).trim();

  const isoLike = text.replace(" ", "T");
  const d = new Date(isoLike);
  if (!Number.isNaN(d.getTime())) return d.getTime();

  const m = text.match(/\b(\d{2}):(\d{2})\b/);
  if (!m) return 0;

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