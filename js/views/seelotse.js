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
    const metaIndex = buildPilotMetaIndex(dispatchData, qData);

    let html = '<div style="max-width:1200px;">';

    html += renderCompactHeader(data, dispatchData, grouped, escapeHtml, formatDateTime);

    html += renderGroup("Kanalbört", grouped.kanal, metaIndex, escapeHtml);
    html += renderGroup("Seebört", grouped.see, metaIndex, escapeHtml);
    html += renderGroup("Wachgänger", grouped.wach, metaIndex, escapeHtml);

    if (grouped.sonstige.length > 0) {
      html += renderGroup("Sonstige", grouped.sonstige, metaIndex, escapeHtml);
    }

    html += renderRuebCompact(dispatchData, escapeHtml);

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
      lotse.q,
      lotse.q_gruppe,
      lotse.pilot_q,
      meta.q,
      "—"
    );

    const takt = firstNonEmpty(
      lotse.takt,
      lotse.taktische_nummer,
      lotse.nr,
      meta.takt,
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

function renderRuebCompact(dispatchData, escapeHtml) {
  if (!dispatchData?.ships?.length) return "";

  let html = `
    <div class="section-header" style="margin-top:14px; margin-bottom:6px;">
      Rüsterbergen kurz
    </div>
  `;

  dispatchData.ships.slice(0, 8).forEach((ship, index) => {
    const assignment = Array.isArray(dispatchData.assignments)
      ? dispatchData.assignments.find((x) => x.ship_key === ship.ship_key)
      : null;

    const route = buildShipRoute(ship);
    const q = ship.ship_q ?? "—";
    const draft = ship.summary?.draft || ship.meldung?.draft || "—";

    html += `
      <div class="card" style="margin-bottom:6px; padding:8px 10px;">
        <div style="display:flex; gap:8px 12px; flex-wrap:wrap; align-items:baseline; line-height:1.25;">
          <span style="font-weight:800; opacity:.75; min-width:26px;">${index + 1}.</span>
          <span style="font-weight:800; min-width:48px;">${escapeHtml(shortTime(ship.eta_rueb))}</span>
          <span style="font-weight:800; flex:1 1 180px; min-width:0; overflow-wrap:anywhere;">${escapeHtml(ship.ship_name || "—")}</span>
          <span class="badge gray" style="font-size:12px;">Q ${escapeHtml(q)}</span>
          <span class="badge gray" style="font-size:12px;">TG ${escapeHtml(draft)}</span>
        </div>

        <div style="margin-top:4px; display:flex; gap:8px 14px; flex-wrap:wrap; font-size:13px; opacity:.86; line-height:1.25;">
          <span>${escapeHtml(route)}</span>
          <span>Lotse ${escapeHtml(assignment?.assigned_pilot || "—")}</span>
          <span>Abt. ${escapeHtml(shortTime(assignment?.assigned_abteilungszeit))}</span>
          <span>ETA aktuell ${escapeHtml(shortTime(assignment?.assigned_current_ship_eta_rueb))}</span>
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

function buildPilotMetaIndex(dispatchData, qData) {
  const index = new Map();

  function add(name, q, takt) {
    if (!name) return;

    const keys = makeNameKeys(name);

    keys.forEach((key) => {
      if (!key) return;

      const existing = index.get(key) || {};
      index.set(key, {
        q: firstNonEmpty(existing.q, q, ""),
        takt: firstNonEmpty(existing.takt, takt, ""),
      });
    });
  }

  const pilotArrays = [
    dispatchData?.pilots,
    dispatchData?.dispatchable_pilots,
    dispatchData?.visible_but_not_dispatchable_pilots,
    dispatchData?.unused_pilots,
  ];

  pilotArrays.forEach((arr) => {
    if (!Array.isArray(arr)) return;

    arr.forEach((p) => {
      add(
        p.pilot_name || p.name,
        p.pilot_q ?? p.q ?? p.q_gruppe,
        p.pilot_tactical_nr ?? p.tactical ?? p.takt
      );
    });
  });

  if (Array.isArray(dispatchData?.assignments)) {
    dispatchData.assignments.forEach((a) => {
      add(
        a.assigned_pilot,
        a.assigned_pilot_q,
        a.assigned_tactical_nr
      );

      if (Array.isArray(a.candidates)) {
        a.candidates.forEach((c) => {
          add(
            c.pilot_name,
            c.pilot_q,
            c.pilot_tactical_nr
          );
        });
      }
    });
  }

  if (Array.isArray(qData?.entries)) {
    qData.entries.forEach((x) => {
      add(
        x.name,
        x.q_gruppe ?? x.q,
        x.takt ?? x.taktische_nummer ?? x.nr
      );
    });
  }

  if (Array.isArray(qData?.lotsen)) {
    qData.lotsen.forEach((x) => {
      const name = `${x.nachname || ""}, ${x.vorname || ""}`.trim();
      add(
        name,
        x.q_gruppe ?? x.q,
        x.takt ?? x.taktische_nummer ?? x.nr
      );
    });
  }

  return index;
}

function findPilotMeta(lotse, metaIndex) {
  const keys = [];

  if (lotse.name) {
    keys.push(...makeNameKeys(lotse.name));
  }

  const builtName = buildName(lotse);
  if (builtName) {
    keys.push(...makeNameKeys(builtName));
  }

  for (const key of keys) {
    const found = metaIndex.get(key);
    if (found) return found;
  }

  return {};
}

function makeNameKeys(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];

  const normalized = normalizeName(raw);

  const withoutComma = normalizeName(raw.replace(",", " "));
  const tokensSorted = withoutComma
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");

  return [...new Set([normalized, withoutComma, tokensSorted])];
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[,.;:]/g, " ")
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

function buildShipRoute(ship) {
  const from = ship?.meldung?.from || "";
  const to = ship?.meldung?.to || "";

  if (from || to) {
    return `${from || "—"} → ${to || "—"}`;
  }

  return ship?.summary?.route || ship?.meldung?.route || "—";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return "";
}