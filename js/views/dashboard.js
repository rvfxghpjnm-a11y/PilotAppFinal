/* =========================================================
   PilotAppFinal – dashboard.js
   Dashboard-View ausgelagert aus app.js
   Eigenständig, ohne Abhängigkeit von utils.js
   ========================================================= */

export async function loadDashboardView(
  contentEl,
  statusEl,
  currentPerson,
  setView
) {
  try {
    const [bundleRes, boertRes, mergedRes] = await Promise.allSettled([
      fetch(`data/${currentPerson.key}_bundle.json`, { cache: "no-store" }),
      fetch(`data/${currentPerson.key}_boert.json`, { cache: "no-store" }),
      fetch(`data/schiffe_merged.json`, { cache: "no-store" }),
    ]);

    if (bundleRes.status !== "fulfilled" || !bundleRes.value.ok) {
      throw new Error(`${currentPerson.key}_bundle.json nicht ladbar`);
    }

    const bundle = await bundleRes.value.json();
    const boertData = await safeJsonFromSettledLocal(boertRes);
    const mergedData = await safeJsonFromSettledLocal(mergedRes);

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

    const stateKind = normalizeStateKindLocal(state.kind);
    const isBoert = stateKind === "gesamtboert";
    const isSeelotse = stateKind === "seelotsen";
    const isFree = !isBoert && !isSeelotse;

    const relatedShips = resolveRelatedShipsLocal(
      Array.isArray(bundle.related_ships) ? bundle.related_ships : [],
      mergedData,
      bundle,
      firstSeelotse
    );

    const primaryShip = relatedShips.length ? relatedShips[0] : null;
    const primaryShipNorm = normalizeShipRecordLocal(primaryShip);

    let html = '<div style="max-width:1200px">';

    html += renderHeroCard({
      card,
      state,
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

    html += "</div>";

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

    html += "</div>";

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

    html += "</div>";

    contentEl.innerHTML = html;

    document.querySelectorAll(".jump-view").forEach((btn) => {
      btn.onclick = () => {
        if (typeof setView === "function") {
          setView(btn.dataset.jump);
        }
      };
    });

    statusEl.textContent = "Dashboard " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Dashboard-Fehler: ${escapeHtmlLocal(err.message)}</div>`;
    console.error(err);
  }
}

function renderHeroCard({
  card,
  state,
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
      <div class="view-title">${escapeHtmlLocal(card.title || `${currentPerson.nachname}, ${currentPerson.vorname}`)}</div>
      <div style="font-size:15px; opacity:.9; margin-bottom:10px;">
        ${escapeHtmlLocal(subtitle)}
      </div>
      <div class="badges-row">
        ${(Array.isArray(card.badges) ? card.badges : []).map((b) => `<span class="badge info">${escapeHtmlLocal(b)}</span>`).join("")}
        ${state.kind ? `<span class="badge gray">${escapeHtmlLocal(state.kind)}</span>` : ""}
        ${extraBadges.map((b) => `<span class="badge success">${escapeHtmlLocal(b)}</span>`).join("")}
      </div>
      ${
        extraLines.length
          ? `<div style="display:grid; gap:6px; margin-top:10px;">
              ${extraLines.map((line) => `<div style="font-size:14px;">${escapeHtmlLocal(line)}</div>`).join("")}
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
        ${detailRowLocal("Art", state.kind || "—")}
        ${detailRowLocal("Quelle", state.source || "—")}
        ${detailRowLocal("Pos", state.pos || card.pos || "—")}
        ${detailRowLocal("Takt", state.takt || card.takt || "—")}
        ${detailRowLocal("Q", bundle.q_gruppe || card.q_gruppe || "—")}
        ${detailRowLocal("Zuletzt", statusInfo.zuletzt || "—")}
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
        ${detailRowLocal("Willkommen", statusInfo.willkommen || "—")}
        ${detailRowLocal("Zuletzt", statusInfo.zuletzt || "—")}
        ${detailRowLocal("Urlaub", statusInfo.naechster_urlaub || "—")}
        ${detailRowLocal("Status-Datei", statusSnap.generated_at || "—")}
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
                detailRowLocal("Berechnet", workstart.ts_calc || "—"),
                detailRowLocal("Pos", valueOrDashLocal(workstart.pos)),
                detailRowLocal("Meldung", workstart.from_meldung || "—"),
                detailRowLocal("Meldung alt", workstart.from_meldung_alt || "—"),
                detailRowLocal("Calc /2", workstart.calc_div2 || "—"),
                detailRowLocal("Calc /3", workstart.calc_div3 || "—"),
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
    ${detailRowLocal("Bört-Eintrag", valueOrDashLocal(boert.entry_count))}
    ${detailRowLocal("Tauschpartner", valueOrDashLocal(tauschpartnerCount))}
    ${
      boert.entry
        ? [
            detailRowLocal("Was", boert.entry.was || "—"),
            detailRowLocal("Zeit", boert.entry.zeit || "—"),
            detailRowLocal("Pfeil", boert.entry.arrow || "—"),
            detailRowLocal("Bemerkung", boert.entry.bemerkung || "—"),
          ].join("")
        : '<div style="opacity:.7;">Kein aktueller Gesamtbört-Eintrag</div>'
    }
    ${firstTp ? `<hr style="border:none; border-top:1px solid #374151; margin:10px 0;">` : ""}
    ${firstTp ? detailRowLocal("1. TP", `${firstTp.vorname || ""} ${firstTp.nachname || ""}`.trim() || "—") : ""}
    ${firstTp ? detailRowLocal("TP Pos", firstTp.pos || "—") : ""}
    ${firstTp ? detailRowLocal("TP Pfeil", firstTp.arrow || firstTp.richtung || "—") : ""}
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
    ${detailRowLocal("Seelotsen-Einträge", valueOrDashLocal(seelotsen.entry_count))}
    ${detailRowLocal("Aufgabe", firstSeelotse?.aufgabe || "—")}
    ${detailRowLocal("Fahrzeug", firstSeelotse?.fahrzeug || "—")}
    ${detailRowLocal("Route", buildRouteLocal(firstSeelotse?.from, firstSeelotse?.to))}
    ${detailRowLocal("Schiff", primaryShipNorm.name || "—")}
    ${detailRowLocal("VG", primaryShipNorm.vg || "—")}
    ${detailRowLocal("Tiefgang", primaryShipNorm.draft || "—")}
    ${detailRowLocal("ETA Schleuse", primaryShipNorm.eta_schleuse || "—")}
    ${detailRowLocal("ETA RÜB", primaryShipNorm.eta_rueb || "—")}
    ${detailRowLocal("Pilot", primaryShipNorm.pilot_1_name || "—")}
    ${detailRowLocal("Steuerer", primaryShipNorm.steererNames || "—")}
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
          ${escapeHtmlLocal(ship.name || "—")}
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px;">
          ${renderMiniSection("Kern", [
            detailRowLocal("Richtung", ship.zulauf_richtung),
            detailRowLocal("Queue", ship.queue_title),
            detailRowLocal("Status", ship.travel_status),
            detailRowLocal("ETA Schleuse", ship.eta_schleuse),
            detailRowLocal("ETA RÜB", ship.eta_rueb),
            detailRowLocal("ETA Text", ship.eta_text),
            detailRowLocal("First Seen", ship.first_seen),
            detailRowLocal("VG", ship.vg),
            detailRowLocal("Q", ship.q_gruppe),
            detailRowLocal("Tiefgang", ship.draft),
            detailRowLocal("Länge", ship.length_m),
            detailRowLocal("Breite", ship.beam_m),
            detailRowLocal("Typ", ship.vessel_type),
          ])}

          ${renderMiniSection("Passage / Liegeplatz", [
            detailRowLocal("Passage Start", ship.passage_start),
            detailRowLocal("Passage Ziel", ship.passage_destination),
            detailRowLocal("Destination", ship.destination),
            detailRowLocal("Mooring Area", ship.mooring_area),
            detailRowLocal("Mooring Place", ship.mooring_place),
            detailRowLocal("Mooring Short", ship.mooring_place_short),
            detailRowLocal("Section", ship.mooring_section),
            detailRowLocal("Seite", ship.preferred_mooring_side),
            detailRowLocal("Locking", ship.locking_location),
            detailRowLocal("Lock Wall", ship.locking_wall),
            detailRowLocal("Lock Chamber", ship.locking_chamber),
            detailRowLocal("Mooring Reason", ship.mooring_reason),
          ])}

          ${renderMiniSection("Lotse / Steuerer", [
            detailRowLocal("Lotspflicht", ship.pilot_required),
            detailRowLocal("Förde", ship.pilot_foerde),
            detailRowLocal("Pilot Order", ship.pilot_order),
            detailRowLocal("Pilot Status", ship.pilot_status),
            detailRowLocal("Pilot 1", ship.pilot_1_name),
            detailRowLocal("Pilots", ship.num_of_pilots),
            detailRowLocal("Steuerer pflichtig", ship.canal_steerer_required),
            detailRowLocal("Steuerer Anzahl", ship.num_of_steerer),
            detailRowLocal("Steuerer 1", ship.steerer_1_name),
            detailRowLocal("Steuerer 2", ship.steerer_2_name),
          ])}

          ${renderMiniSection("Abrechnung / Operativ", [
            detailRowLocal("Makler", ship.makler),
            detailRowLocal("Payer", ship.payer),
            detailRowLocal("Beladung", ship.type_of_loading),
            detailRowLocal("Cargo", ship.cargo_name),
            detailRowLocal("UN", ship.un_number),
            detailRowLocal("Dangerous", ship.dangerous_vessel),
            detailRowLocal("Abfahrt", ship.port_of_departure),
            detailRowLocal("Zielhafen", ship.port_of_destination),
            detailRowLocal("Reeder", ship.shipowner),
            detailRowLocal("Callsign", ship.callsign),
            detailRowLocal("IMO", ship.imo),
            detailRowLocal("MMSI", ship.mmsi),
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
      <div style="font-size:14px; font-weight:700; margin-bottom:8px;">${escapeHtmlLocal(title)}</div>
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
      rows.push(detailRowLocal(humanizeKeyLocal(key), value.map((v) => {
        if (v && typeof v === "object") {
          return Object.values(v).filter(Boolean).join(" | ");
        }
        return String(v);
      }).join(" • ")));
      return;
    }

    if (value && typeof value === "object") {
      rows.push(detailRowLocal(humanizeKeyLocal(key), flattenObjectToTextLocal(value)));
      return;
    }

    rows.push(detailRowLocal(humanizeKeyLocal(key), value));
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
          <div class="detail-label">${escapeHtmlLocal(label)}</div>
          <div class="detail-value">${escapeHtmlLocal(formatInOutLocal(item.in, item.out))}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  if (!rows) return "";

  return `
    <div style="padding:12px; border:1px solid #374151; border-radius:10px; background:rgba(255,255,255,0.02);">
      <div style="font-size:14px; font-weight:700; margin-bottom:8px;">${escapeHtmlLocal(title)}</div>
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
        ${relatedShips.slice(0, 6).map((ship) => {
          const s = normalizeShipRecordLocal(ship);
          return `
            <div style="padding:10px 0; border-bottom:1px solid #374151;">
              <div style="font-weight:700; margin-bottom:6px;">${escapeHtmlLocal(s.name || "—")}</div>
              ${detailRowLocal("Richtung", s.zulauf_richtung)}
              ${detailRowLocal("Queue", s.queue_title)}
              ${detailRowLocal("ETA Schleuse", s.eta_schleuse)}
              ${detailRowLocal("ETA RÜB", s.eta_rueb)}
              ${detailRowLocal("Status", s.travel_status)}
              ${detailRowLocal("Pilot", s.pilot_1_name)}
              ${detailRowLocal("Steuerer", s.steererNames)}
              ${detailRowLocal("Q / VG", `${valueOrDashLocal(s.q_gruppe)} / ${valueOrDashLocal(s.vg)}`)}
              ${detailRowLocal("Tiefgang", s.draft)}
              ${detailRowLocal("Passage", [s.passage_start, s.passage_destination].filter(Boolean).join(" → ") || "—")}
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
        <strong>${escapeHtmlLocal(title)}</strong>
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
        <strong>${escapeHtmlLocal(title)}</strong>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-content" style="display:block;">
        ${note ? `<div style="font-size:12px; opacity:.65; margin-bottom:8px;">${escapeHtmlLocal(note)}</div>` : ""}
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

  return entries.map(([key, val]) => `
      <div style="padding:8px 0; border-bottom:1px solid #374151;">
        <div style="font-weight:600; margin-bottom:4px;">${escapeHtmlLocal(key)}</div>
        ${detailRowLocal("Datei", val.file || "—")}
        ${detailRowLocal("Vorhanden", val.exists ? "ja" : "nein")}
        ${detailRowLocal("Generated", val.generated_at || "—")}
        ${detailRowLocal("Count", valueOrDashLocal(val.count))}
      </div>
    `).join("");
}

function resolveRelatedShipsLocal(bundleShips, mergedData, bundle, firstSeelotse) {
  const out = [];

  if (Array.isArray(bundleShips)) {
    bundleShips.forEach((ship) => {
      if (ship) out.push(ship);
    });
  }

  if ((!out.length) && mergedData && Array.isArray(mergedData.entries)) {
    const stateKind = normalizeStateKindLocal(bundle?.state?.kind);
    const targetNames = [];

    if (stateKind === "seelotsen") {
      const fahrzeug = normalizeShipNameLocal(firstSeelotse?.fahrzeug);
      if (fahrzeug) targetNames.push(fahrzeug);
    }

    if (targetNames.length) {
      mergedData.entries.forEach((entry) => {
        const name = normalizeShipNameLocal(entry?.name);
        if (name && targetNames.includes(name)) {
          out.push(entry);
        }
      });
    }
  }

  return dedupeShipsLocal(out);
}

function dedupeShipsLocal(ships) {
  const result = [];
  const seen = new Set();

  ships.forEach((ship) => {
    const key = String(ship?.ship_key || "").trim() || normalizeShipNameLocal(ship?.name || ship?.summary?.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(ship);
  });

  return result;
}

function normalizeShipRecordLocal(ship) {
  const summary = ship?.summary || {};
  const zulauf = Array.isArray(ship?.zulauf) && ship.zulauf.length ? ship.zulauf[0] : {};
  const fallback = ship || {};

  const passage = firstValueLocal(summary.passage_block, zulauf.passage, fallback.passage, {});
  const mooring = firstValueLocal(summary.mooring_block, zulauf.mooring, fallback.mooring, {});
  const voyageInfo = firstValueLocal(summary.voyage_info_block, zulauf.voyage_info, fallback.voyage_info, {});
  const pilotage = firstValueLocal(summary.pilotage_block, zulauf.pilotage, fallback.pilotage, {});
  const steering = firstValueLocal(summary.steering_block, zulauf.steering, fallback.steering, {});
  const locking = firstValueLocal(summary.locking_block, zulauf.locking, fallback.locking, {});
  const vesselInfo = firstValueLocal(summary.vessel_info_block, zulauf.vessel_info, fallback.vessel_info, {});
  const billing = firstValueLocal(summary.billing_block, zulauf.billing, fallback.billing, {});
  const weichenzeiten = firstValueLocal(summary.weichenzeiten, zulauf.weichenzeiten, fallback.weichenzeiten, {});

  const steererNames = [
    firstValueLocal(summary.steerer_1_name, steering.steerer_1_name),
    firstValueLocal(summary.steerer_2_name, steering.steerer_2_name),
  ].filter(Boolean).join(" / ");

  return {
    exists: Boolean(ship),
    raw: ship,
    summary,
    zulauf,

    name: firstValueLocal(ship?.name, summary.name, zulauf.name, fallback.name, "—"),

    queue_title: firstValueLocal(summary.queue_title, zulauf.queue_title),
    queue_key: firstValueLocal(summary.queue_key, zulauf.queue_key),
    area: firstValueLocal(summary.area, zulauf.area),
    zulauf_richtung: firstValueLocal(summary.zulauf_richtung, zulauf.zulauf_richtung),

    eta_schleuse: firstValueLocal(summary.eta_schleuse, zulauf.eta_schleuse),
    eta_rueb: firstValueLocal(summary.eta_rueb, zulauf.eta_rueb),
    eta_text: firstValueLocal(summary.eta_text, zulauf.eta_text),
    first_seen: firstValueLocal(summary.first_seen, zulauf.first_seen),

    vg: firstValueLocal(summary.vg, zulauf.vg),
    q_gruppe: firstValueLocal(summary.q_gruppe),
    draft: firstValueLocal(summary.draft, zulauf.draft_m),
    length_m: firstValueLocal(summary.length_m, zulauf.length_m),
    beam_m: firstValueLocal(summary.beam_m, zulauf.beam_m),

    vessel_type: firstValueLocal(summary.vessel_type, zulauf.vessel_type, vesselInfo.vessel_type),
    seagoing_or_inland_vessel: firstValueLocal(summary.seagoing_or_inland_vessel, vesselInfo.seagoing_or_inland_vessel),
    shipowner: firstValueLocal(summary.shipowner, vesselInfo.shipowner),
    callsign: firstValueLocal(summary.callsign, vesselInfo.callsign),
    imo: firstValueLocal(summary.imo, vesselInfo.imo),
    mmsi: firstValueLocal(summary.mmsi, vesselInfo.mmsi),
    country_name: firstValueLocal(summary.country_name, vesselInfo.country_name),
    port_of_registry: firstValueLocal(summary.port_of_registry, vesselInfo.port_of_registry),

    pilot_required: firstValueLocal(summary.pilot_required, zulauf.pilot_required, pilotage.pilot_required),
    pilot_foerde: firstValueLocal(summary.pilot_foerde, zulauf.pilot_foerde, pilotage.pilot_foerde),
    pilot_order: firstValueLocal(summary.pilot_order, zulauf.pilot_order, pilotage.pilot_order),
    pilot_status: firstValueLocal(summary.pilot_status, zulauf.pilot_status, pilotage.pilot_status),
    pilot_1_name: firstValueLocal(summary.pilot_1_name, zulauf.pilot_1_name, pilotage.pilot_1_name),
    num_of_pilots: firstValueLocal(summary.num_of_pilots, zulauf.num_of_pilots, pilotage.num_of_pilots),

    canal_steerer_required: firstValueLocal(summary.canal_steerer_required, zulauf.canal_steerer_required, steering.steerer_required),
    num_of_steerer: firstValueLocal(summary.num_of_steerer, zulauf.num_of_steerer, steering.num_of_steerer),
    steerer_1_name: firstValueLocal(summary.steerer_1_name, zulauf.steerer_1_name, steering.steerer_1_name),
    steerer_2_name: firstValueLocal(summary.steerer_2_name, zulauf.steerer_2_name, steering.steerer_2_name),
    steererNames: steererNames || "—",

    travel_direction: firstValueLocal(summary.travel_direction, zulauf.travel_direction, voyageInfo.travel_direction),
    travel_status: firstValueLocal(summary.travel_status, zulauf.travel_status, voyageInfo.travel_status),

    passage_start: firstValueLocal(summary.passage_start, zulauf.passage_start, passage.start_text),
    passage_destination: firstValueLocal(summary.passage_destination, zulauf.passage_destination, passage.destination_text),
    destination: firstValueLocal(summary.destination, zulauf.destination, passage.destination_0),

    mooring_area: firstValueLocal(summary.mooring_area, zulauf.mooring_area, mooring.area),
    mooring_place: firstValueLocal(summary.mooring_place, zulauf.mooring_place, mooring.place),
    mooring_place_short: firstValueLocal(summary.mooring_place_short, zulauf.mooring_place_short, mooring.place_short),
    mooring_section: firstValueLocal(summary.mooring_section, mooring.section),
    preferred_mooring_side: firstValueLocal(summary.preferred_mooring_side, zulauf.preferred_mooring_side, mooring.preferred_side),

    locking_location: firstValueLocal(locking.locking_location),
    locking_wall: firstValueLocal(locking.locking_wall),
    locking_chamber: firstValueLocal(locking.locking_chamber),
    mooring_reason: firstValueLocal(locking.mooring_reason),

    makler: firstValueLocal(summary.makler, zulauf.makler, billing.makler),
    payer: firstValueLocal(summary.payer, billing.payer),
    type_of_loading: firstValueLocal(summary.type_of_loading, voyageInfo.type_of_loading),
    cargo_name: firstValueLocal(summary.cargo_name, voyageInfo.cargo_name),
    un_number: firstValueLocal(summary.un_number, voyageInfo.un_number),
    dangerous_vessel: firstValueLocal(summary.dangerous_vessel, voyageInfo.dangerous_vessel),
    port_of_departure: firstValueLocal(summary.port_of_departure, voyageInfo.port_of_departure),
    port_of_destination: firstValueLocal(summary.port_of_destination, voyageInfo.port_of_destination),

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

function normalizeShipNameLocal(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function firstValueLocal(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) {
      return v;
    }
  }
  return null;
}

function flattenObjectToTextLocal(obj) {
  if (!obj || typeof obj !== "object") return valueOrDashLocal(obj);

  return Object.entries(obj)
    .map(([k, v]) => {
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
      if (typeof v === "object") return `${humanizeKeyLocal(k)}: ${flattenObjectToTextLocal(v)}`;
      return `${humanizeKeyLocal(k)}: ${String(v)}`;
    })
    .filter(Boolean)
    .join(" | ");
}

function humanizeKeyLocal(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatInOutLocal(i, o) {
  const inText = i ? `in ${shortDateTimeLocal(i)}` : null;
  const outText = o ? `out ${shortDateTimeLocal(o)}` : null;
  return [inText, outText].filter(Boolean).join(" / ") || "—";
}

function shortDateTimeLocal(val) {
  const txt = String(val || "");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(txt)) {
    return txt.slice(11);
  }
  return txt || "—";
}

function normalizeStateKindLocal(kind) {
  const k = String(kind || "").toLowerCase();
  if (k.includes("gesamt")) return "gesamtboert";
  if (k.includes("boert")) return "gesamtboert";
  if (k.includes("see")) return "seelotsen";
  if (k.includes("lotse")) return "seelotsen";
  return "";
}

function buildRouteLocal(from, to) {
  const f = valueOrDashLocal(from);
  const t = valueOrDashLocal(to);
  if (f === "—" && t === "—") return "—";
  return `${f} → ${t}`;
}

async function safeJsonFromSettledLocal(result) {
  try {
    if (result.status !== "fulfilled") return null;
    if (!result.value?.ok) return null;
    return await result.value.json();
  } catch {
    return null;
  }
}

function valueOrDashLocal(v) {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

function escapeHtmlLocal(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function detailRowLocal(label, value) {
  return `
    <div class="detail-row">
      <div class="detail-label">${escapeHtmlLocal(label)}</div>
      <div class="detail-value">${escapeHtmlLocal(valueOrDashLocal(value))}</div>
    </div>
  `;
}