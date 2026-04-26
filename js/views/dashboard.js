/* =========================================================
   PilotAppFinal – dashboard.js
   Dashboard-View ausgelagert aus app.js
   ========================================================= */

export async function loadDashboardView(contentEl, statusEl, currentPerson, detailRow, escapeHtml, formatDateTime, safeJsonFromSettled, setView) {
  try {
    const [bundleRes, boertRes, seelotseRes, mergedRes] = await Promise.allSettled([
      fetch(`data/${currentPerson.key}_bundle.json`, { cache: "no-store" }),
      fetch(`data/${currentPerson.key}_boert.json`, { cache: "no-store" }),
      fetch(`data/${currentPerson.key}_seelotse.json`, { cache: "no-store" }),
      fetch(`data/schiffe_merged.json`, { cache: "no-store" }),
    ]);

    if (bundleRes.status !== "fulfilled" || !bundleRes.value.ok) {
      throw new Error(`${currentPerson.key}_bundle.json nicht ladbar`);
    }

    const bundle = await bundleRes.value.json();
    const boertData = await safeJsonFromSettled(boertRes);
    const mergedData = await safeJsonFromSettled(mergedRes);

    const card = bundle.action_card || {};
    const state = bundle.state || {};
    const workstart = bundle.workstart || null;
    const seelotsen = bundle.seelotsen || {};
    const boert = bundle.boert || {};
    const sourceMeta = bundle.source_meta || {};
    const snapshots = bundle.snapshots || {};
    const statusSnap = snapshots.status || {};
    const statusInfo = statusSnap.status || {};

    const tauschpartnerCount = Array.isArray(boertData?.tauschpartner) ? boertData.tauschpartner.length : 0;
    const firstSeelotse = Array.isArray(seelotsen.entries) && seelotsen.entries.length ? seelotsen.entries[0] : null;

    const stateKind = normalizeStateKind(state.kind);
    const isBoert = stateKind === "gesamtboert";
    const isSeelotse = stateKind === "seelotsen";
    const isFree = !isBoert && !isSeelotse;

    const relatedShips = resolveRelatedShips(
      Array.isArray(bundle.related_ships) ? bundle.related_ships : [],
      mergedData,
      bundle,
      firstSeelotse
    );

    const primaryShip = relatedShips.length ? relatedShips[0] : null;
    const primaryShipNorm = normalizeShipRecord(primaryShip);

    let html = '<div style="max-width:1200px">';

    html += renderHeroCard({
      card,
      state,
      bundle,
      tauschpartnerCount,
      isBoert,
      isSeelotse,
      isFree,
      workstart,
      firstSeelotse,
      primaryShipNorm,
      currentPerson,
    });

    html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">';

    if (isBoert) {
      html += renderBoertFocusCard(boert, boertData, tauschpartnerCount);
      html += renderWorkstartCard(workstart);
      html += renderStatusCard(statusInfo, statusSnap);
      html += renderStateCard(state, bundle, card, statusInfo);
    } else if (isSeelotse) {
      html += renderSeelotseShipCard(seelotsen, firstSeelotse, primaryShipNorm);
      html += renderStatusCard(statusInfo, statusSnap);
      html += renderWorkstartCard(workstart);
      html += renderStateCard(state, bundle, card, statusInfo);
    } else {
      html += renderStatusCard(statusInfo, statusSnap);
      html += renderWorkstartCard(workstart);
      html += renderStateCard(state, bundle, card, statusInfo);
      html += renderBoertFocusCard(boert, boertData, tauschpartnerCount);
    }

    html += '</div>';

    if (primaryShipNorm.exists) {
      html += renderShipDetailCard(primaryShipNorm);
    }

    html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-top:16px;">';

    if (isBoert) {
      html += renderSecondaryCard(
        "Seelotse / Schiff",
        renderSeelotseShipInner(seelotsen, firstSeelotse, primaryShipNorm),
        "Derzeit sekundär"
      );
      html += renderLinkedShipsCard(relatedShips);
    } else if (isSeelotse) {
      html += renderSecondaryCard(
        "Gesamtbört / Tauschpartner",
        renderBoertFocusInner(boert, boertData, tauschpartnerCount),
        "Derzeit sekundär"
      );
      html += renderLinkedShipsCard(relatedShips);
    } else {
      html += renderSecondaryCard(
        "Gesamtbört / Tauschpartner",
        renderBoertFocusInner(boert, boertData, tauschpartnerCount),
        "Optional"
      );
      html += renderSecondaryCard(
        "Seelotse / Schiff",
        renderSeelotseShipInner(seelotsen, firstSeelotse, primaryShipNorm),
        "Optional"
      );
    }

    html += '</div>';

    html += `
      <div class="card expanded" style="margin-top:18px;">
        <div class="card-header">
          <strong>Datenquellen</strong>
          <span class="expand-icon">▼</span>
        </div>
        <div class="card-content" style="display:block;">
          ${renderSourceMeta(sourceMeta)}
        </div>
      </div>
    `;

    html += '</div>';

    contentEl.innerHTML = html;

    document.querySelectorAll(".jump-view").forEach(btn => {
      btn.onclick = () => {
        if (typeof setView === "function") {
          setView(btn.dataset.jump);
        }
      };
    });

    statusEl.textContent = "Dashboard " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Dashboard-Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

function renderHeroCard({
  card,
  state,
  bundle,
  tauschpartnerCount,
  isBoert,
  isSeelotse,
  isFree,
  workstart,
  firstSeelotse,
  primaryShipNorm,
  currentPerson,
}) {
  let subtitle = card.subtitle || card.state_label || "Ziellotse";
  let extraLines = Array.isArray(card.lines) ? [...card.lines] : [];
  let extraBadges = [];

  if (isBoert) {
    if (tauschpartnerCount) extraBadges.push(`${tauschpartnerCount} TP`);
  }

  if (isSeelotse) {
    if (firstSeelotse?.aufgabe) extraBadges.push(firstSeelotse.aufgabe);
    if (primaryShipNorm.name !== "—") extraLines.unshift(`Schiff: ${primaryShipNorm.name}`);
    if (primaryShipNorm.eta_schleuse) extraLines.push(`ETA Schleuse: ${primaryShipNorm.eta_schleuse}`);
    if (primaryShipNorm.draft) extraLines.push(`Tiefgang: ${primaryShipNorm.draft}`);
    if (primaryShipNorm.travel_status) extraLines.push(`Status: ${primaryShipNorm.travel_status}`);
  }

  if (isFree && workstart?.from_meldung) {
    extraLines.push(`Nächster bekannter Start: ${workstart.from_meldung}`);
  }

  return `
    <div class="view-header" style="margin-bottom:18px;">
      <div class="view-title">${escapeHtml(card.title || `${currentPerson.nachname}, ${currentPerson.vorname}`)}</div>
      <div style="font-size:15px; opacity:.9; margin-bottom:10px;">
        ${escapeHtml(subtitle)}
      </div>
      <div class="badges-row">
        ${(Array.isArray(card.badges) ? card.badges : []).map(b => `<span class="badge info">${escapeHtml(b)}</span>`).join("")}
        ${state.kind ? `<span class="badge gray">${escapeHtml(state.kind)}</span>` : ""}
        ${extraBadges.map(b => `<span class="badge success">${escapeHtml(b)}</span>`).join("")}
      </div>
      ${
        extraLines.length
          ? `<div style="display:grid; gap:6px; margin-top:10px;">
              ${extraLines.map(line => `<div style="font-size:14px;">${escapeHtml(line)}</div>`).join("")}
            </div>`
          : ""
      }
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:14px;">
        <button class="jump-view" data-jump="boert">Bört</button>
        <button class="jump-view" data-jump="seelotse">Seelotse</button>
        <button class="jump-view" data-jump="graph">Graph</button>
        <button class="jump-view" data-jump="short">Short</button>
        <button class="jump-view" data-jump="long">Long</button>
      </div>
    </div>
  `;
}

function renderStateCard(state, bundle, card, statusInfo) {
  return `
    <div class="card expanded">
      <div class="card-header">
        <strong>Zustand</strong>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-content" style="display:block;">
        ${detailRow("Art", state.kind || "—")}
        ${detailRow("Quelle", state.source || "—")}
        ${detailRow("Pos", state.pos || card.pos || "—")}
        ${detailRow("Takt", state.takt || card.takt || "—")}
        ${detailRow("Q", bundle.q_gruppe || card.q_gruppe || "—")}
        ${detailRow("Zuletzt", statusInfo.zuletzt || "—")}
      </div>
    </div>
  `;
}

function renderStatusCard(statusInfo, statusSnap) {
  return `
    <div class="card expanded">
      <div class="card-header">
        <strong>Status / Urlaub</strong>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-content" style="display:block;">
        ${detailRow("Willkommen", statusInfo.willkommen || "—")}
        ${detailRow("Zuletzt", statusInfo.zuletzt || "—")}
        ${detailRow("Urlaub", statusInfo.naechster_urlaub || "—")}
        ${detailRow("Status-Datei", statusSnap.generated_at || "—")}
      </div>
    </div>
  `;
}

function renderWorkstartCard(workstart) {
  return `
    <div class="card expanded">
      <div class="card-header">
        <strong>Workstart</strong>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-content" style="display:block;">
        ${
          workstart
            ? [
                detailRow("Berechnet", workstart.ts_calc || "—"),
                detailRow("Pos", valueOrDash(workstart.pos)),
                detailRow("Meldung", workstart.from_meldung || "—"),
                detailRow("Meldung alt", workstart.from_meldung_alt || "—"),
                detailRow("Calc /2", workstart.calc_div2 || "—"),
                detailRow("Calc /3", workstart.calc_div3 || "—"),
              ].join("")
            : '<div style="opacity:.7;">Kein Workstart-Eintrag vorhanden</div>'
        }
      </div>
    </div>
  `;
}

function renderBoertFocusCard(boert, boertData, tauschpartnerCount) {
  return renderPrimaryCard(
    "Gesamtbört / Tauschpartner",
    renderBoertFocusInner(boert, boertData, tauschpartnerCount)
  );
}

function renderBoertFocusInner(boert, boertData, tauschpartnerCount) {
  const firstTp = Array.isArray(boertData?.tauschpartner) && boertData.tauschpartner.length
    ? boertData.tauschpartner[0]
    : null;

  return `
    ${detailRow("Bört-Eintrag", valueOrDash(boert.entry_count))}
    ${detailRow("Tauschpartner", valueOrDash(tauschpartnerCount))}
    ${
      boert.entry
        ? [
            detailRow("Was", boert.entry.was || "—"),
            detailRow("Zeit", boert.entry.zeit || "—"),
            detailRow("Pfeil", boert.entry.arrow || "—"),
            detailRow("Bemerkung", boert.entry.bemerkung || "—"),
          ].join("")
        : '<div style="opacity:.7;">Kein aktueller Gesamtbört-Eintrag</div>'
    }
    ${firstTp ? `<hr style="border:none; border-top:1px solid #374151; margin:10px 0;">` : ""}
    ${firstTp ? detailRow("1. TP", `${firstTp.vorname || ""} ${firstTp.nachname || ""}`.trim() || "—") : ""}
    ${firstTp ? detailRow("TP Pos", firstTp.pos || "—") : ""}
    ${firstTp ? detailRow("TP Pfeil", firstTp.arrow || firstTp.richtung || "—") : ""}
  `;
}

function renderSeelotseShipCard(seelotsen, firstSeelotse, primaryShipNorm) {
  return renderPrimaryCard(
    "Seelotse / Schiff",
    renderSeelotseShipInner(seelotsen, firstSeelotse, primaryShipNorm)
  );
}

function renderSeelotseShipInner(seelotsen, firstSeelotse, primaryShipNorm) {
  return `
    ${detailRow("Seelotsen-Einträge", valueOrDash(seelotsen.entry_count))}
    ${detailRow("Aufgabe", firstSeelotse?.aufgabe || "—")}
    ${detailRow("Fahrzeug", firstSeelotse?.fahrzeug || "—")}
    ${detailRow("Route", buildRoute(firstSeelotse?.from, firstSeelotse?.to))}
    ${detailRow("Schiff", primaryShipNorm.name || "—")}
    ${detailRow("VG", primaryShipNorm.vg || "—")}
    ${detailRow("Tiefgang", primaryShipNorm.draft || "—")}
    ${detailRow("ETA Schleuse", primaryShipNorm.eta_schleuse || "—")}
    ${detailRow("ETA RÜB", primaryShipNorm.eta_rueb || "—")}
    ${detailRow("Pilot", primaryShipNorm.pilot_1_name || "—")}
    ${detailRow("Steuerer", primaryShipNorm.steererNames || "—")}
  `;
}

function renderShipDetailCard(ship) {
  return `
    <div class="card expanded" style="margin-top:16px;">
      <div class="card-header">
        <strong>Schiff / WSV-Details</strong>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-content" style="display:block;">
        <div style="font-size:18px; font-weight:700; margin-bottom:10px;">
          ${escapeHtml(ship.name || "—")}
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px;">
          ${renderMiniSection("Kern", [
            detailRow("Richtung", ship.zulauf_richtung),
            detailRow("Queue", ship.queue_title),
            detailRow("Status", ship.travel_status),
            detailRow("ETA Schleuse", ship.eta_schleuse),
            detailRow("ETA RÜB", ship.eta_rueb),
            detailRow("ETA Text", ship.eta_text),
            detailRow("First Seen", ship.first_seen),
            detailRow("VG", ship.vg),
            detailRow("Q", ship.q_gruppe),
            detailRow("Tiefgang", ship.draft),
            detailRow("Länge", ship.length_m),
            detailRow("Breite", ship.beam_m),
            detailRow("Typ", ship.vessel_type),
          ])}

          ${renderMiniSection("Passage / Liegeplatz", [
            detailRow("Passage Start", ship.passage_start),
            detailRow("Passage Ziel", ship.passage_destination),
            detailRow("Destination", ship.destination),
            detailRow("Mooring Area", ship.mooring_area),
            detailRow("Mooring Place", ship.mooring_place),
            detailRow("Mooring Short", ship.mooring_place_short),
            detailRow("Section", ship.mooring_section),
            detailRow("Seite", ship.preferred_mooring_side),
            detailRow("Locking", ship.locking_location),
            detailRow("Lock Wall", ship.locking_wall),
            detailRow("Lock Chamber", ship.locking_chamber),
            detailRow("Mooring Reason", ship.mooring_reason),
          ])}

          ${renderMiniSection("Lotse / Steuerer", [
            detailRow("Lotspflicht", ship.pilot_required),
            detailRow("Förde", ship.pilot_foerde),
            detailRow("Pilot Order", ship.pilot_order),
            detailRow("Pilot Status", ship.pilot_status),
            detailRow("Pilot 1", ship.pilot_1_name),
            detailRow("Pilots", ship.num_of_pilots),
            detailRow("Steuerer pflichtig", ship.canal_steerer_required),
            detailRow("Steuerer Anzahl", ship.num_of_steerer),
            detailRow("Steuerer 1", ship.steerer_1_name),
            detailRow("Steuerer 2", ship.steerer_2_name),
          ])}

          ${renderMiniSection("Abrechnung / Operativ", [
            detailRow("Makler", ship.makler),
            detailRow("Payer", ship.payer),
            detailRow("Beladung", ship.type_of_loading),
            detailRow("Cargo", ship.cargo_name),
            detailRow("UN", ship.un_number),
            detailRow("Dangerous", ship.dangerous_vessel),
            detailRow("Abfahrt", ship.port_of_departure),
            detailRow("Zielhafen", ship.port_of_destination),
            detailRow("Reeder", ship.shipowner),
            detailRow("Callsign", ship.callsign),
            detailRow("IMO", ship.imo),
            detailRow("MMSI", ship.mmsi),
          ])}
        </div>

        ${renderWeichenzeitenCard(ship.weichenzeiten)}

        ${renderBlockDetailsCard(ship)}
      </div>
    </div>
  `;
}

function renderBlockDetailsCard(ship) {
  const blocks = [
    ["Passage Block", ship.passage_block],
    ["Mooring Block", ship.mooring_block],
    ["Voyage Info", ship.voyage_info_block],
    ["Pilotage", ship.pilotage_block],
    ["Steering", ship.steering_block],
    ["Locking", ship.locking_block],
    ["Vessel Info", ship.vessel_info_block],
    ["Billing", ship.billing_block],
  ].filter(([, block]) => block && Object.keys(block).length);

  if (!blocks.length) return "";

  return `
    <div style="margin-top:16px;">
      <div style="font-size:15px; font-weight:700; margin-bottom:10px;">Detailblöcke</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px;">
        ${blocks.map(([title, block]) => renderMiniSection(title, renderObjectRows(block))).join("")}
      </div>
    </div>
  `;
}

function renderMiniSection(title, rows) {
  const inner = Array.isArray(rows) ? rows.join("") : rows;
  return `
    <div style="padding:12px; border:1px solid #374151; border-radius:10px; background:rgba(255,255,255,0.02);">
      <div style="font-size:14px; font-weight:700; margin-bottom:8px;">${escapeHtml(title)}</div>
      ${inner || '<div style="opacity:.6;">Keine Daten</div>'}
    </div>
  `;
}

function renderObjectRows(obj) {
  if (!obj || typeof obj !== "object") {
    return '<div style="opacity:.6;">Keine Daten</div>';
  }

  const rows = [];

  Object.entries(obj).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (!value.length) return;
      rows.push(detailRow(humanizeKey(key), value.map(v => {
        if (v && typeof v === "object") {
          return Object.values(v).filter(Boolean).join(" | ");
        }
        return String(v);
      }).join(" • ")));
      return;
    }

    if (value && typeof value === "object") {
      rows.push(detailRow(humanizeKey(key), flattenObjectToText(value)));
      return;
    }

    rows.push(detailRow(humanizeKey(key), value));
  });

  return rows.length ? rows.join("") : '<div style="opacity:.6;">Keine Daten</div>';
}

function renderWeichenzeitenCard(weichenzeiten) {
  if (!weichenzeiten || typeof weichenzeiten !== "object") return "";

  const west = renderWeichenzeitenSide("West", weichenzeiten.west, [
    ["ostermoor", "OM"],
    ["kudensee", "KUD"],
    ["duekerswisch", "DÜK"],
    ["fischerhuette", "FIS"],
    ["oldenbuettel", "OLD"],
    ["breiholz", "BHZ"],
  ]);

  const ost = renderWeichenzeitenSide("Ost", weichenzeiten.ost, [
    ["schuelp", "SLP"],
    ["audorf_rade", "ARA"],
    ["koenigsfoerde", "KFÖ"],
    ["gross_nordsee", "GNS"],
    ["schwartenbek", "SWB"],
    ["kiel_binnenhafen", "KBH"],
  ]);

  if (!west && !ost) return "";

  return `
    <div style="margin-top:16px;">
      <div style="font-size:15px; font-weight:700; margin-bottom:10px;">Weichenzeiten</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px;">
        ${west}
        ${ost}
      </div>
    </div>
  `;
}

function renderWeichenzeitenSide(title, sideObj, order) {
  if (!sideObj || typeof sideObj !== "object") return "";

  const rows = order
    .map(([key, label]) => {
      const item = sideObj[key];
      if (!item || (!item.in && !item.out)) return "";
      return `
        <div class="detail-row">
          <div class="detail-label">${escapeHtml(label)}</div>
          <div class="detail-value">${escapeHtml(formatInOut(item.in, item.out))}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  if (!rows) return "";

  return `
    <div style="padding:12px; border:1px solid #374151; border-radius:10px; background:rgba(255,255,255,0.02);">
      <div style="font-size:14px; font-weight:700; margin-bottom:8px;">${escapeHtml(title)}</div>
      ${rows}
    </div>
  `;
}

function renderLinkedShipsCard(relatedShips) {
  if (!relatedShips.length) {
    return `
      <div class="card expanded">
        <div class="card-header">
          <strong>Verknüpfte Schiffe</strong>
          <span class="expand-icon">▼</span>
        </div>
        <div class="card-content" style="display:block;">
          <div style="opacity:.7;">Keine verknüpften Schiffe</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card expanded">
      <div class="card-header">
        <strong>Verknüpfte Schiffe</strong>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-content" style="display:block;">
        ${relatedShips.slice(0, 6).map(ship => {
          const s = normalizeShipRecord(ship);
          return `
            <div style="padding:10px 0; border-bottom:1px solid #374151;">
              <div style="font-weight:700; margin-bottom:6px;">${escapeHtml(s.name || "—")}</div>
              ${detailRow("Richtung", s.zulauf_richtung)}
              ${detailRow("Queue", s.queue_title)}
              ${detailRow("ETA Schleuse", s.eta_schleuse)}
              ${detailRow("ETA RÜB", s.eta_rueb)}
              ${detailRow("Status", s.travel_status)}
              ${detailRow("Pilot", s.pilot_1_name)}
              ${detailRow("Steuerer", s.steererNames)}
              ${detailRow("Q / VG", `${valueOrDash(s.q_gruppe)} / ${valueOrDash(s.vg)}`)}
              ${detailRow("Tiefgang", s.draft)}
              ${detailRow("Passage", [s.passage_start, s.passage_destination].filter(Boolean).join(" → ") || "—")}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderPrimaryCard(title, innerHtml) {
  return `
    <div class="card expanded">
      <div class="card-header">
        <strong>${escapeHtml(title)}</strong>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-content" style="display:block;">
        ${innerHtml}
      </div>
    </div>
  `;
}

function renderSecondaryCard(title, innerHtml, note = "") {
  return `
    <div class="card expanded">
      <div class="card-header">
        <strong>${escapeHtml(title)}</strong>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-content" style="display:block;">
        ${note ? `<div style="font-size:12px; opacity:.65; margin-bottom:8px;">${escapeHtml(note)}</div>` : ""}
        ${innerHtml}
      </div>
    </div>
  `;
}

function renderSourceMeta(sourceMeta) {
  const entries = Object.entries(sourceMeta || {});
  if (!entries.length) {
    return '<div style="opacity:.7;">Keine Source-Meta vorhanden</div>';
  }

  return entries.map(([key, val]) => {
    return `
      <div style="padding:8px 0; border-bottom:1px solid #374151;">
        <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(key)}</div>
        ${detailRow("Datei", val.file || "—")}
        ${detailRow("Vorhanden", val.exists ? "ja" : "nein")}
        ${detailRow("Generated", val.generated_at || "—")}
        ${detailRow("Count", valueOrDash(val.count))}
      </div>
    `;
  }).join("");
}

function resolveRelatedShips(bundleShips, mergedData, bundle, firstSeelotse) {
  const out = [];

  if (Array.isArray(bundleShips)) {
    bundleShips.forEach(ship => {
      if (ship) out.push(ship);
    });
  }

  if ((!out.length) && mergedData && Array.isArray(mergedData.entries)) {
    const stateKind = normalizeStateKind(bundle?.state?.kind);
    const targetNames = [];

    if (stateKind === "seelotsen") {
      const fahrzeug = normalizeShipName(firstSeelotse?.fahrzeug);
      if (fahrzeug) targetNames.push(fahrzeug);
    }

    if (targetNames.length) {
      mergedData.entries.forEach(entry => {
        const name = normalizeShipName(entry?.name);
        if (name && targetNames.includes(name)) {
          out.push(entry);
        }
      });
    }
  }

  return dedupeShips(out);
}

function dedupeShips(ships) {
  const result = [];
  const seen = new Set();

  ships.forEach(ship => {
    const key = String(ship?.ship_key || "").trim() || normalizeShipName(ship?.name || ship?.summary?.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(ship);
  });

  return result;
}

function normalizeShipRecord(ship) {
  const summary = ship?.summary || {};
  const zulauf = Array.isArray(ship?.zulauf) && ship.zulauf.length ? ship.zulauf[0] : {};
  const fallback = ship || {};

  const passage = firstValue(summary.passage_block, zulauf.passage, fallback.passage, {});
  const mooring = firstValue(summary.mooring_block, zulauf.mooring, fallback.mooring, {});
  const voyageInfo = firstValue(summary.voyage_info_block, zulauf.voyage_info, fallback.voyage_info, {});
  const pilotage = firstValue(summary.pilotage_block, zulauf.pilotage, fallback.pilotage, {});
  const steering = firstValue(summary.steering_block, zulauf.steering, fallback.steering, {});
  const locking = firstValue(summary.locking_block, zulauf.locking, fallback.locking, {});
  const vesselInfo = firstValue(summary.vessel_info_block, zulauf.vessel_info, fallback.vessel_info, {});
  const billing = firstValue(summary.billing_block, zulauf.billing, fallback.billing, {});
  const weichenzeiten = firstValue(summary.weichenzeiten, zulauf.weichenzeiten, fallback.weichenzeiten, {});

  const steererNames = [firstValue(summary.steerer_1_name, steering.steerer_1_name), firstValue(summary.steerer_2_name, steering.steerer_2_name)]
    .filter(Boolean)
    .join(" / ");

  return {
    exists: Boolean(ship),
    raw: ship,
    summary,
    zulauf,

    name: firstValue(ship?.name, summary.name, zulauf.name, fallback.name, "—"),

    queue_title: firstValue(summary.queue_title, zulauf.queue_title),
    queue_key: firstValue(summary.queue_key, zulauf.queue_key),
    area: firstValue(summary.area, zulauf.area),
    zulauf_richtung: firstValue(summary.zulauf_richtung, zulauf.zulauf_richtung),

    eta_schleuse: firstValue(summary.eta_schleuse, zulauf.eta_schleuse),
    eta_rueb: firstValue(summary.eta_rueb, zulauf.eta_rueb),
    eta_text: firstValue(summary.eta_text, zulauf.eta_text),
    first_seen: firstValue(summary.first_seen, zulauf.first_seen),

    vg: firstValue(summary.vg, zulauf.vg),
    q_gruppe: firstValue(summary.q_gruppe),
    draft: firstValue(summary.draft, zulauf.draft_m),
    length_m: firstValue(summary.length_m, zulauf.length_m),
    beam_m: firstValue(summary.beam_m, zulauf.beam_m),

    vessel_type: firstValue(summary.vessel_type, zulauf.vessel_type, vesselInfo.vessel_type),
    seagoing_or_inland_vessel: firstValue(summary.seagoing_or_inland_vessel, vesselInfo.seagoing_or_inland_vessel),
    shipowner: firstValue(summary.shipowner, vesselInfo.shipowner),
    callsign: firstValue(summary.callsign, vesselInfo.callsign),
    imo: firstValue(summary.imo, vesselInfo.imo),
    mmsi: firstValue(summary.mmsi, vesselInfo.mmsi),
    country_name: firstValue(summary.country_name, vesselInfo.country_name),
    port_of_registry: firstValue(summary.port_of_registry, vesselInfo.port_of_registry),

    pilot_required: firstValue(summary.pilot_required, zulauf.pilot_required, pilotage.pilot_required),
    pilot_foerde: firstValue(summary.pilot_foerde, zulauf.pilot_foerde, pilotage.pilot_foerde),
    pilot_order: firstValue(summary.pilot_order, zulauf.pilot_order, pilotage.pilot_order),
    pilot_status: firstValue(summary.pilot_status, zulauf.pilot_status, pilotage.pilot_status),
    pilot_1_name: firstValue(summary.pilot_1_name, zulauf.pilot_1_name, pilotage.pilot_1_name),
    num_of_pilots: firstValue(summary.num_of_pilots, zulauf.num_of_pilots, pilotage.num_of_pilots),

    canal_steerer_required: firstValue(summary.canal_steerer_required, zulauf.canal_steerer_required, steering.steerer_required),
    num_of_steerer: firstValue(summary.num_of_steerer, zulauf.num_of_steerer, steering.num_of_steerer),
    steerer_1_name: firstValue(summary.steerer_1_name, zulauf.steerer_1_name, steering.steerer_1_name),
    steerer_2_name: firstValue(summary.steerer_2_name, zulauf.steerer_2_name, steering.steerer_2_name),
    steererNames: steererNames || "—",

    travel_direction: firstValue(summary.travel_direction, zulauf.travel_direction, voyageInfo.travel_direction),
    travel_status: firstValue(summary.travel_status, zulauf.travel_status, voyageInfo.travel_status),

    passage_start: firstValue(summary.passage_start, zulauf.passage_start, passage.start_text),
    passage_destination: firstValue(summary.passage_destination, zulauf.passage_destination, passage.destination_text),
    destination: firstValue(summary.destination, zulauf.destination, passage.destination_0),

    mooring_area: firstValue(summary.mooring_area, zulauf.mooring_area, mooring.area),
    mooring_place: firstValue(summary.mooring_place, zulauf.mooring_place, mooring.place),
    mooring_place_short: firstValue(summary.mooring_place_short, zulauf.mooring_place_short, mooring.place_short),
    mooring_section: firstValue(summary.mooring_section, mooring.section),
    preferred_mooring_side: firstValue(summary.preferred_mooring_side, zulauf.preferred_mooring_side, mooring.preferred_side),

    locking_location: firstValue(locking.locking_location),
    locking_wall: firstValue(locking.locking_wall),
    locking_chamber: firstValue(locking.locking_chamber),
    mooring_reason: firstValue(locking.mooring_reason),

    makler: firstValue(summary.makler, zulauf.makler, billing.makler),
    payer: firstValue(summary.payer, billing.payer),
    type_of_loading: firstValue(summary.type_of_loading, voyageInfo.type_of_loading),
    cargo_name: firstValue(summary.cargo_name, voyageInfo.cargo_name),
    un_number: firstValue(summary.un_number, voyageInfo.un_number),
    dangerous_vessel: firstValue(summary.dangerous_vessel, voyageInfo.dangerous_vessel),
    port_of_departure: firstValue(summary.port_of_departure, voyageInfo.port_of_departure),
    port_of_destination: firstValue(summary.port_of_destination, voyageInfo.port_of_destination),

    passage_block: passage,
    mooring_block: mooring,
    voyage_info_block: voyageInfo,
    pilotage_block: pilotage,
    steering_block: steering,
    locking_block: locking,
    vessel_info_block: vesselInfo,
    billing_block: billing,
    weichenzeiten: weichenzeiten,
  };
}

function normalizeShipName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function firstValue(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) {
      return v;
    }
  }
  return null;
}

function flattenObjectToText(obj) {
  if (!obj || typeof obj !== "object") return valueOrDash(obj);

  return Object.entries(obj)
    .map(([k, v]) => {
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
      if (typeof v === "object") return `${humanizeKey(k)}: ${flattenObjectToText(v)}`;
      return `${humanizeKey(k)}: ${String(v)}`;
    })
    .filter(Boolean)
    .join(" | ");
}

function humanizeKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatInOut(i, o) {
  const inText = i ? `in ${shortDateTime(i)}` : null;
  const outText = o ? `out ${shortDateTime(o)}` : null;
  return [inText, outText].filter(Boolean).join(" / ") || "—";
}

function shortDateTime(val) {
  const txt = String(val || "");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(txt)) {
    return txt.slice(11);
  }
  return txt || "—";
}

function normalizeStateKind(kind) {
  const k = String(kind || "").toLowerCase();
  if (k.includes("gesamt")) return "gesamtboert";
  if (k.includes("boert")) return "gesamtboert";
  if (k.includes("see")) return "seelotsen";
  if (k.includes("lotse")) return "seelotsen";
  return "";
}

function buildRoute(from, to) {
  const f = valueOrDash(from);
  const t = valueOrDash(to);
  if (f === "—" && t === "—") return "—";
  return `${f} → ${t}`;
}