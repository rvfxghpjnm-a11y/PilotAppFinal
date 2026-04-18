/* =========================================================
   PilotAppFinal – app.js
   Personen ausschließlich aus data/persons.json
   Dashboard zustandsabhängig:
   - Gesamtbört: Fokus auf Pos / Takt / Start / TP
   - Seelotsen: Fokus auf Aufgabe / Fahrzeug / Schiff / ETA
   - Short / Long / Graph / Seelotse / Bört bleiben erhalten
   Neu:
   - Dashboard nutzt die neuen Merge-/WSV-Felder deutlich stärker
   - Schiffsdaten, Passage, Mooring, Lotse/Steuerer, Billing,
     Weichenzeiten werden direkt angezeigt, wenn vorhanden
   ========================================================= */

import { renderWorkstartChart } from "./graph.js";

console.log("APP.JS LOADED");

// ---------------------------------------------------------
// STATE
// ---------------------------------------------------------
let boertFromDate = null;
let boertToDate   = null;
let currentPerson = null;
let currentView   = "dashboard";
let currentHours  = 24;
let personsData   = [];

// ---------------------------------------------------------
// DOM
// ---------------------------------------------------------
const personsEl = document.getElementById("persons");
const contentEl = document.getElementById("content");
const statusEl  = document.getElementById("status");
const boertRangeEl = document.getElementById("boertRange");

// ---------------------------------------------------------
// INIT
// ---------------------------------------------------------
init();

setInterval(() => {
  if (currentPerson) {
    renderView();
  }
}, 60000);

function init() {
  bindViewButtons();
  bindHourButtons();
  bindRefreshButton();
  bindBoertRangeButtons();
  loadPersons();
}

// ---------------------------------------------------------
// PERSONEN – NUR AUS persons.json
// ---------------------------------------------------------
async function loadPersons() {
  try {
    const res = await fetch("data/persons.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error("persons.json nicht ladbar");
    }

    const data = await res.json();
    const rawPersons = Array.isArray(data.persons) ? data.persons : [];

    personsData = rawPersons
      .map(p => buildPersonFromConfigEntry(p))
      .filter(Boolean);

    if (!personsData.length) {
      throw new Error("Keine Personen in persons.json");
    }

    const saved = loadAppState();

    if (saved) {
      const found = personsData.find(p => p.key === saved.personKey);
      if (found) {
        currentPerson = found;
        currentView = saved.view || currentView;
      }
    }

    if (!currentPerson) {
      currentPerson = personsData[0];
    }

    renderPersonButtons();
    syncViewButtons();
    renderView();

  } catch (e) {
    personsEl.innerHTML = "<b>❌ Personen konnten nicht geladen werden</b>";
    contentEl.innerHTML = `<div class="error">❌ Frontend-Init fehlgeschlagen: ${escapeHtml(e.message)}</div>`;
    console.error(e);
  }
}

function buildPersonFromConfigEntry(p) {
  const key = String(p?.key || "").trim();
  const vorname = String(p?.vorname || "").trim().toLowerCase();
  const nachname = String(p?.nachname || "").trim().toLowerCase();

  if (!key || !vorname || !nachname) {
    return null;
  }

  return {
    key,
    vorname,
    nachname,
    file: `workstart_history_${key}.json`,
  };
}

function renderPersonButtons() {
  personsEl.innerHTML = "";

  personsData.forEach((p) => {
    const btn = document.createElement("button");
    btn.textContent = `${capitalizeWords(p.vorname)} ${capitalizeWords(p.nachname)}`;
    btn.classList.toggle("active", p.key === currentPerson?.key);
    btn.onclick = () => selectPerson(p);
    personsEl.appendChild(btn);
  });
}

function selectPerson(person) {
  currentPerson = person;
  saveAppState();
  renderPersonButtons();
  renderView();
}

// ---------------------------------------------------------
// VIEW SWITCH
// ---------------------------------------------------------
function bindViewButtons() {
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("[data-view]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentView = btn.dataset.view;
      saveAppState();
      renderView();
    };
  });
}

function syncViewButtons() {
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === currentView);
  });
}

// ---------------------------------------------------------
// RENDER
// ---------------------------------------------------------
function renderView() {
  if (!currentPerson) {
    contentEl.textContent = "Bitte Person auswählen";
    return;
  }

  const timeControls = document.getElementById("timeControls");
  timeControls.style.display = currentView === "graph" ? "flex" : "none";

  if (boertRangeEl) {
    boertRangeEl.style.display = currentView === "boert" ? "flex" : "none";
  }

  if (currentView === "dashboard") loadDashboard();
  if (currentView === "short") loadShort();
  if (currentView === "long")  loadLong();
  if (currentView === "graph") loadGraph();
  if (currentView === "seelotse") loadSeelotse();
  if (currentView === "ruesterbergen") loadRuesterbergen();
  if (currentView === "boert") loadBoert();
}

// ---------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------
async function loadDashboard() {
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
    const seelotseData = await safeJsonFromSettled(seelotseRes);
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

    // -----------------------------------------------------
    // Hauptkarte
    // -----------------------------------------------------
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
    });

    // -----------------------------------------------------
    // Fokus-Zeile abhängig vom Zustand
    // -----------------------------------------------------
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

    // -----------------------------------------------------
    // Große Schiffskarte mit neuen WSV-/Merge-Daten
    // -----------------------------------------------------
    if (primaryShipNorm.exists) {
      html += renderShipDetailCard(primaryShipNorm);
    }

    // -----------------------------------------------------
    // Sekundär-Zeile
    // -----------------------------------------------------
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

    // -----------------------------------------------------
    // Quellen unten
    // -----------------------------------------------------
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
        currentView = btn.dataset.jump;
        saveAppState();
        syncViewButtons();
        renderView();
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

// ---------------------------------------------------------
// SHORT
// ---------------------------------------------------------
async function loadShort() {
  const res = await fetch(`data/${currentPerson.key}_short.json`, { cache: "no-store" });
  const data = await res.json();
  contentEl.innerHTML = `<pre>${escapeHtml(data.short || "")}</pre>`;
  statusEl.textContent = "Aktualisiert " + new Date().toLocaleTimeString("de-DE");
}

// ---------------------------------------------------------
// LONG
// ---------------------------------------------------------
async function loadLong() {
  const res = await fetch(`data/${currentPerson.key}_long.json`, { cache: "no-store" });
  const data = await res.json();
  contentEl.innerHTML = `<pre>${escapeHtml(data.long || "")}</pre>`;
  statusEl.textContent = "Aktualisiert " + new Date().toLocaleTimeString("de-DE");
}

// ---------------------------------------------------------
// GRAPH
// ---------------------------------------------------------
async function loadGraph() {
  const file = currentPerson.file || `workstart_history_${currentPerson.key}.json`;

  contentEl.innerHTML = `
    <div style="padding:8px; font-size:13px; opacity:.8">
      Lade Graph für <b>${escapeHtml(currentPerson.key)}</b><br>
      Datei: <code>${escapeHtml(file)}</code>
    </div>
    <canvas id="workstartChart" style="height:520px"></canvas>
  `;

  try {
    const res = await fetch(`data/${file}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Fetch fehlgeschlagen");

    const data = await res.json();

    if (!Array.isArray(data.entries) || data.entries.length === 0) {
      contentEl.insertAdjacentHTML(
        "afterbegin",
        "<div style='color:#f87171'>❌ Keine Einträge in workstart_history</div>"
      );
      return;
    }

    renderWorkstartChart(data.entries, currentHours);
    statusEl.textContent = "Aktualisiert " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.insertAdjacentHTML(
      "afterbegin",
      `<div style="color:#f87171">❌ Graph-Fehler: ${escapeHtml(err.message)}</div>`
    );
    console.error(err);
  }
}

// ---------------------------------------------------------
// ZEITFILTER
// ---------------------------------------------------------
function bindHourButtons() {
  document.querySelectorAll("[data-hours]").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("[data-hours]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentHours = Number(btn.dataset.hours);
      if (currentView === "graph") loadGraph();
    };
  });
}

function bindRefreshButton() {
  const refreshBtn = document.getElementById("refreshNow");
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      renderView();
    };
  }
}

function bindBoertRangeButtons() {
  const fromEl = document.getElementById("boertFrom");
  const toEl   = document.getElementById("boertTo");
  const apply  = document.getElementById("boertApply");
  const reset  = document.getElementById("boertReset");

  if (!apply || !reset) return;

  apply.onclick = () => {
    boertFromDate = fromEl.value ? new Date(fromEl.value) : null;
    boertToDate   = toEl.value   ? new Date(toEl.value)   : null;
    loadBoert();
  };

  reset.onclick = () => {
    fromEl.value = "";
    toEl.value   = "";
    boertFromDate = null;
    boertToDate   = null;
    loadBoert();
  };
}

// ---------------------------------------------------------
// SEELOTSE VIEW
// ---------------------------------------------------------
// ===== BEGIN ERSATZ-FUNKTION loadSeelotse() =====
async function loadSeelotse() {
  try {
    const [resSeelotse, resDispatch] = await Promise.allSettled([
      fetch(`data/${currentPerson.key}_seelotse.json`, { cache: "no-store" }),
      fetch("data/ruesterbergen_dispatch.json", { cache: "no-store" }),
    ]);

    if (resSeelotse.status !== "fulfilled" || !resSeelotse.value.ok) {
      throw new Error(`${currentPerson.key}_seelotse.json nicht ladbar`);
    }

    const data = await resSeelotse.value.json();
    const dispatchData = await safeJsonFromSettled(resDispatch);

    let html = '<div style="max-width: 1200px;">';

    html += '<div class="view-header">';
    html += '<div class="view-title">Seelotse</div>';
    html += '<div class="badges-row">';

    if (data.status === "in_seelotse") {
      html += '<span class="badge success">✓ In Seelotse</span>';
    } else {
      html += '<span class="badge gray">Nicht in Seelotse</span>';
    }

    if (data.gruppen) {
      html += `<span class="badge info">Kanal: ${escapeHtml(data.gruppen.kanal)}</span>`;
      html += `<span class="badge info">Wach: ${escapeHtml(data.gruppen.wach)}</span>`;
      html += `<span class="badge info">See: ${escapeHtml(data.gruppen.see)}</span>`;
    }

    if (dispatchData?.counts) {
      html += `<span class="badge info">RÜB-Schiffe: ${escapeHtml(dispatchData.counts.ships_for_ruesterbergen)}</span>`;
      html += `<span class="badge success">Zuordnungen: ${escapeHtml(dispatchData.counts.assignments)}</span>`;
      if (dispatchData.counts.unassigned_ships > 0) {
        html += `<span class="badge gray">Offen: ${escapeHtml(dispatchData.counts.unassigned_ships)}</span>`;
      }
    }

    html += '</div>';
    html += `<div class="meta-info">Generiert: ${formatDateTime(data.generated_at)}</div>`;
    html += '</div>';

    // -----------------------------------------------------
    // SEELOTSEN-LISTE
    // -----------------------------------------------------
    if (data.lotsen && data.lotsen.length > 0) {
      html += '<div class="section-header">Lotsen</div>';

      data.lotsen.forEach((lotse, idx) => {
        const targetClass = lotse.is_target ? ' target' : '';
        html += `<div class="lotse-item${targetClass}" data-lotse="${idx}">`;
        html += '<div class="lotse-header">';
        html += `<div class="lotse-nr">${escapeHtml(lotse.nr || '—')}</div>`;
        html += `<div class="lotse-name">${escapeHtml(lotse.name || "")}</div>`;
        html += `<div class="lotse-info">${escapeHtml(lotse.aufgabe || '')}</div>`;
        html += `<div class="lotse-info">${escapeHtml(lotse.fahrzeug || '')}</div>`;
        html += `<div class="lotse-info">${escapeHtml(lotse.route || '')}</div>`;
        html += '<span class="expand-icon">▼</span>';
        html += '</div>';

        html += '<div class="lotse-details">';
        if (lotse.times) {
          html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin-top: 8px;">';
          if (lotse.times.eta_schleuse) {
            html += detailRow("ETA Schleuse", lotse.times.eta_schleuse);
          }
          if (lotse.times.eta_rueb) {
            html += detailRow("ETA Rüb", lotse.times.eta_rueb);
          }
          if (lotse.times.delta_rueb_schleuse) {
            html += detailRow("Δ Rüb-Schleuse", lotse.times.delta_rueb_schleuse);
          }
          if (lotse.times.delta_start_rueb) {
            html += detailRow("Δ Start-Rüb", lotse.times.delta_start_rueb);
          }
          html += '</div>';
        } else {
          html += '<div class="detail-row" style="color: #9ca3af;">Keine Zeitinformationen verfügbar</div>';
        }
        if (lotse.time) {
          html += detailRow("Zeit", lotse.time);
        }
        html += '</div>';

        html += '</div>';
      });
    }

    // -----------------------------------------------------
    // BISHERIGE RÜSTERBERGEN-LISTE AUS SEELOTSE-DATEI
    // -----------------------------------------------------
    if (data.ruesterbergen && data.ruesterbergen.length > 0) {
      html += '<div class="section-header">Rüsterbergen - Kommende Schiffe</div>';
      html += '<div class="ruesterbergen-list">';

      data.ruesterbergen.forEach(ship => {
        html += '<div class="ruesterbergen-item">';
        html += `<div class="ruesterbergen-eta">${escapeHtml(ship.eta_rueb || '—')}</div>`;
        html += `<div class="ruesterbergen-ship">${escapeHtml(ship.ship || '—')}</div>`;
        html += `<div class="ruesterbergen-gruppe">Q${escapeHtml(ship.q_gruppe || '—')}</div>`;
        html += `<div class="ruesterbergen-route">${escapeHtml(ship.route || '—')}</div>`;
        html += '</div>';
      });

      html += '</div>';
    }

    // -----------------------------------------------------
    // NEU: DISPATCH-ÜBERSICHT
    // -----------------------------------------------------
    if (dispatchData) {
      html += '<div class="section-header">Rüsterbergen-Disposition</div>';

      if (Array.isArray(dispatchData.ships) && dispatchData.ships.length > 0) {
        dispatchData.ships.forEach((ship, idx) => {
          const assignment = Array.isArray(dispatchData.assignments)
            ? dispatchData.assignments.find(a => a.ship_key === ship.ship_key)
            : null;

          html += `<div class="lotse-item expanded" data-dispatch-ship="${idx}">`;
          html += '<div class="lotse-header">';
          html += `<div class="lotse-nr">${escapeHtml(ship.meldung?.nr || '—')}</div>`;
          html += `<div class="lotse-name">${escapeHtml(ship.ship_name || '—')}</div>`;
          html += `<div class="lotse-info">ETA RÜB: ${escapeHtml(ship.eta_rueb || '—')}</div>`;
          html += `<div class="lotse-info">Q${escapeHtml(ship.ship_q ?? '—')}</div>`;
          html += `<div class="lotse-info">${escapeHtml(ship.meldung?.route || ship.summary?.route || '—')}</div>`;
          html += '<span class="expand-icon">▼</span>';
          html += '</div>';

          html += '<div class="lotse-details" style="display:block;">';

          html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px; margin-top:8px;">';
          html += detailRow("Meldung Zeit", ship.meldung?.time || "—");
          html += detailRow("ETA RÜB", ship.eta_rueb || "—");
          html += detailRow("ETA Quelle", ship.eta_rueb_source || "—");
          html += detailRow("Q Schiff", ship.ship_q ?? "—");
          html += detailRow("Tiefgang", ship.summary?.draft || ship.meldung?.draft || "—");
          html += detailRow("VG", ship.summary?.vg || "—");
          html += detailRow("Route", ship.summary?.route || ship.meldung?.route || "—");
          html += detailRow("Status", ship.summary?.travel_status || "—");
          html += detailRow("Makler", ship.summary?.makler || "—");
          html += detailRow("Beladung", ship.summary?.type_of_loading || "—");
          html += '</div>';

          html += '<hr style="border:none; border-top:1px solid #374151; margin:12px 0;">';

          if (assignment) {
            html += `<div style="font-weight:700; margin-bottom:8px;">Zugeordneter Lotse: ${escapeHtml(assignment.assigned_pilot || '—')}</div>`;
            html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px;">';
            html += detailRow("Lotse", assignment.assigned_pilot || "—");
            html += detailRow("Q Lotse", assignment.assigned_pilot_q ?? "—");
            html += detailRow("Abteilungszeit", assignment.assigned_abteilungszeit || "—");
            html += detailRow("Aktuelles Schiff", assignment.assigned_current_ship_name || "—");
            html += detailRow("Aktuelle ETA RÜB", assignment.assigned_current_ship_eta_rueb || "—");
            html += detailRow("Begründung", assignment.reason || "—");
            html += '</div>';

            if (Array.isArray(assignment.candidates) && assignment.candidates.length > 0) {
              html += '<div style="margin-top:12px; font-weight:700;">Kandidaten</div>';
              assignment.candidates.forEach(candidate => {
                html += `
                  <div style="padding:8px 0; border-bottom:1px solid #374151;">
                    ${detailRow("Lotse", candidate.pilot_name || "—")}
                    ${detailRow("Q", candidate.pilot_q ?? "—")}
                    ${detailRow("Abteilungszeit", candidate.abteilungszeit || "—")}
                    ${detailRow("Ziel", candidate.to || "—")}
                    ${detailRow("Aufgabe", candidate.aufgabe || "—")}
                    ${detailRow("Aktuelles Schiff", candidate.current_ship_name || "—")}
                    ${detailRow("ETA RÜB aktuell", candidate.current_ship_eta_rueb || "—")}
                  </div>
                `;
              });
            }

            if (Array.isArray(assignment.excluded) && assignment.excluded.length > 0) {
              html += '<div style="margin-top:12px; font-weight:700;">Ausgeschlossene Lotsen</div>';
              assignment.excluded.forEach(ex => {
                html += `
                  <div style="padding:8px 0; border-bottom:1px solid #374151;">
                    ${detailRow("Lotse", ex.pilot_name || "—")}
                    ${detailRow("Grund", ex.reason || "—")}
                    ${detailRow("Pilot ETA", ex.pilot_eta || ex.current_ship_eta_rueb || "—")}
                    ${detailRow("Schiff ETA", ex.ship_eta_rueb || "—")}
                    ${detailRow("Pilot Q", ex.pilot_q ?? "—")}
                    ${detailRow("Schiff Q", ex.ship_q ?? "—")}
                    ${detailRow("Aktuelles Schiff", ex.current_ship_name || "—")}
                  </div>
                `;
              });
            }
          } else {
            html += '<div style="color:#f87171; font-weight:700; margin-bottom:8px;">Kein Lotse zugeordnet</div>';

            const unassigned = Array.isArray(dispatchData.unassigned_ships)
              ? dispatchData.unassigned_ships.find(u => u.ship_key === ship.ship_key)
              : null;

            if (unassigned?.reason) {
              html += detailRow("Grund", unassigned.reason);
            }

            if (Array.isArray(unassigned?.excluded) && unassigned.excluded.length > 0) {
              html += '<div style="margin-top:12px; font-weight:700;">Ausgeschlossene Lotsen</div>';
              unassigned.excluded.forEach(ex => {
                html += `
                  <div style="padding:8px 0; border-bottom:1px solid #374151;">
                    ${detailRow("Lotse", ex.pilot_name || "—")}
                    ${detailRow("Grund", ex.reason || "—")}
                    ${detailRow("Pilot ETA", ex.pilot_eta || ex.current_ship_eta_rueb || "—")}
                    ${detailRow("Schiff ETA", ex.ship_eta_rueb || "—")}
                    ${detailRow("Pilot Q", ex.pilot_q ?? "—")}
                    ${detailRow("Schiff Q", ex.ship_q ?? "—")}
                    ${detailRow("Aktuelles Schiff", ex.current_ship_name || "—")}
                  </div>
                `;
              });
            }
          }

          html += '</div>';
          html += '</div>';
        });
      } else {
        html += '<div style="opacity:.7; padding:8px 0;">Keine Rüsterbergen-Schiffe vorhanden</div>';
      }

      // Nur sichtbar, nicht disponierbar
      if (Array.isArray(dispatchData.visible_only_pilots) && dispatchData.visible_only_pilots.length > 0) {
        html += '<div class="section-header">Nur sichtbar (noch nicht automatisch disponierbar)</div>';

        dispatchData.visible_only_pilots.forEach(pilot => {
          html += `
            <div class="card expanded">
              <div class="card-header">
                <strong>${escapeHtml(pilot.pilot_name || '—')}</strong>
                <span class="expand-icon">▼</span>
              </div>
              <div class="card-content" style="display:block;">
                ${detailRow("Abteilungszeit", pilot.abteilungszeit || "—")}
                ${detailRow("Q", pilot.pilot_q ?? "—")}
                ${detailRow("Aufgabe", pilot.aufgabe || "—")}
                ${detailRow("Route", pilot.route || "—")}
                ${detailRow("Aktuelles Schiff", pilot.current_ship_name || "—")}
                ${detailRow("ETA RÜB aktuell", pilot.current_ship_eta_rueb || "—")}
              </div>
            </div>
          `;
        });
      }
    }

    html += '</div>';

    contentEl.innerHTML = html;

    document.querySelectorAll('.lotse-item').forEach(item => {
      const header = item.querySelector('.lotse-header');
      if (header) {
        header.addEventListener('click', () => {
          item.classList.toggle('expanded');
        });
      }
    });

    statusEl.textContent = "Aktualisiert " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Seelotse-Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}
// ===== END ERSATZ-FUNKTION loadSeelotse() =====

// ---------------------------------------------------------
// BÖRT VIEW
// ---------------------------------------------------------
async function loadBoert() {
  try {
    const res = await fetch(`data/${currentPerson.key}_boert.json`, { cache: "no-store" });
    const data = await res.json();

    let filteredLotsen = data.lotsen || [];

    const filterActive = Boolean(boertFromDate || boertToDate);

    if (filterActive) {
      const fromTs = boertFromDate ? boertFromDate.getTime() : null;
      const toTs   = boertToDate   ? boertToDate.getTime()   : null;

      filteredLotsen = filteredLotsen.filter(lotse => {
        if (!lotse.times) return false;

        return Object.values(lotse.times).some(val => {
          if (!val) return false;

          const d = parseLotseTime(val);
          if (!d) return false;

          const ts = d.getTime();

          if (fromTs && ts < fromTs) return false;
          if (toTs   && ts > toTs)   return false;

          return true;
        });
      });
    }

    let filteredTauschpartner = Array.isArray(data.tauschpartner)
      ? data.tauschpartner.filter(tp =>
          filteredLotsen.some(l => l.pos === tp.pos)
        )
      : [];

    const totalLotsen = (data.lotsen || []).length;
    const shownLotsen = filteredLotsen.length;

    let html = '<div style="max-width: 1200px;">';

    html += '<div class="view-header">';
    html += '<div class="view-title">Bört</div>';
    html += '<div class="badges-row">';
    html += `<div class="meta-info">${filterActive ? "🔎 Filter aktiv – " : ""}Anzeige ${shownLotsen} von ${totalLotsen} Lotsen</div>`;

    if (data.status === "boert") {
      html += '<span class="badge success">✓ Im Bört</span>';
    } else {
      html += '<span class="badge gray">Nicht im Bört</span>';
    }

    html += '</div>';
    html += `<div class="meta-info">Generiert: ${formatDateTime(data.generated_at)}</div>`;
    html += '</div>';

    if (data.person || data.target) {
      const p = data.person || data.target;
      html += '<div class="person-card">';
      html += `<div class="person-name">${escapeHtml(p.vorname)} ${escapeHtml(p.nachname)}</div>`;
      html += `<div class="person-pos">Position ${escapeHtml(p.pos)}</div>`;
      if (p.takt) {
        html += `<div class="person-takt">Takt: ${escapeHtml(p.takt)}</div>`;
      }

      if (p.times) {
        html += '<div class="times-grid">';
        if (p.times.from_meldung) {
          html += `<div class="time-item"><div class="time-label">von Meldung</div><div class="time-value">${escapeHtml(p.times.from_meldung)}</div></div>`;
        }
        if (p.times.calc_div2) {
          html += `<div class="time-item"><div class="time-label">calc div2</div><div class="time-value">${escapeHtml(p.times.calc_div2)}</div></div>`;
        }
        if (p.times.calc_div3) {
          html += `<div class="time-item"><div class="time-label">calc div3</div><div class="time-value">${escapeHtml(p.times.calc_div3)}</div></div>`;
        }
        if (p.times.from_meldung_alt) {
          html += `<div class="time-item"><div class="time-label">von Meldung alt</div><div class="time-value">${escapeHtml(p.times.from_meldung_alt)}</div></div>`;
        }
        html += '</div>';
      }

      if (p.bemerkung) {
        html += `<div style="margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 14px;">📝 ${escapeHtml(p.bemerkung)}</div>`;
      }

      html += '</div>';
    }

    if (filteredTauschpartner.length > 0) {
      html += '<div class="section-header">Tauschpartner</div>';
      html += '<div class="tauschpartner-grid">';

      filteredTauschpartner.forEach(tp => {
        let cardClass = 'tauschpartner-card';
        if (tp.verguetung) {
          cardClass += ' verguetung';
        } else if (tp.arrow === '↑' || tp.richtung === '↑') {
          cardClass += ' arrow-up';
        } else if (tp.arrow === '↓' || tp.richtung === '↓') {
          cardClass += ' arrow-down';
        }

        html += `<div class="${cardClass}">`;
        html += `<div class="tauschpartner-name">${escapeHtml(tp.vorname)} ${escapeHtml(tp.nachname)}</div>`;
        html += `<div class="tauschpartner-info">Pos ${escapeHtml(tp.pos)}</div>`;
        html += '</div>';
      });

      html += '</div>';
    } else {
      html += '<div class="section-header">Tauschpartner</div>';
      html += '<div style="opacity:.6; padding:8px">Keine Tauschpartner gefunden</div>';
    }

    if (filteredLotsen.length > 0) {
      html += '<div class="section-header">Alle Lotsen</div>';

      filteredLotsen.forEach((lotse, idx) => {
        const targetClass = lotse.is_target ? ' target' : '';
        html += `<div class="lotse-item${targetClass}" data-lotse="${idx}">`;
        html += '<div class="lotse-header">';
        html += `<div class="lotse-nr">${escapeHtml(lotse.pos)}</div>`;
        html += `<div class="lotse-name">${escapeHtml(lotse.vorname)} ${escapeHtml(lotse.nachname)}</div>`;

        if (lotse.arrow) {
          const arrowClass = lotse.arrow.includes('↑') ? 'arrow-up' : (lotse.arrow.includes('↓') ? 'arrow-down' : '');
          html += `<div class="lotse-info"><span class="${arrowClass}">${escapeHtml(lotse.arrow)}</span></div>`;
        }

        if (lotse.times && lotse.times.from_meldung) {
          html += `<div class="lotse-info">${escapeHtml(lotse.times.from_meldung)}</div>`;
        }

        if (lotse.verguetung) {
          html += '<div class="lotse-info"><span class="verguetung">$$</span></div>';
        }

        html += '<span class="expand-icon">▼</span>';
        html += '</div>';

        html += '<div class="lotse-details">';
        if (lotse.times) {
          html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin-top: 8px;">';
          if (lotse.times.from_meldung) {
            html += detailRow("von Meldung", lotse.times.from_meldung);
          }
          if (lotse.times.calc_div2) {
            html += detailRow("calc div2", lotse.times.calc_div2);
          }
          if (lotse.times.calc_div3) {
            html += detailRow("calc div3", lotse.times.calc_div3);
          }
          if (lotse.times.from_meldung_alt) {
            html += detailRow("von Meldung alt", lotse.times.from_meldung_alt);
          }
          html += '</div>';
        }
        if (lotse.bemerkung) {
          html += detailRow("Bemerkung", lotse.bemerkung);
        }
        html += '</div>';

        html += '</div>';
      });
    }

    html += '</div>';

    contentEl.innerHTML = html;

    document.querySelectorAll('.lotse-item').forEach(item => {
      item.querySelector('.lotse-header').addEventListener('click', () => {
        item.classList.toggle('expanded');
      });
    });

    statusEl.textContent = "Aktualisiert " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Bört-Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

// ---------------------------------------------------------
// HELPER – MERGE / SCHIFFE
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// HELPER – ALLGEMEIN
// ---------------------------------------------------------
async function safeJsonFromSettled(result) {
  try {
    if (result.status !== "fulfilled") return null;
    if (!result.value?.ok) return null;
    return await result.value.json();
  } catch {
    return null;
  }
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

function detailRow(label, value) {
  return `
    <div class="detail-row">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${escapeHtml(valueOrDash(value))}</div>
    </div>
  `;
}

function valueOrDash(v) {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleString('de-DE');
  } catch {
    return dateStr;
  }
}

function capitalizeWords(text) {
  return String(text || "")
    .split(" ")
    .filter(Boolean)
    .map(x => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

function parseLotseTime(val) {
  const m = String(val || "").match(/^([A-Z][a-z])(\d{2}):(\d{2})$/);
  if (!m) return null;

  const wdMap = { Mo:1, Di:2, Mi:3, Do:4, Fr:5, Sa:6, So:0 };
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

// ---------------------------------------------------------
// STATE PERSISTENCE
// ---------------------------------------------------------
function saveAppState() {
  if (!currentPerson) return;

  localStorage.setItem("pilotapp_state", JSON.stringify({
    personKey: currentPerson.key,
    view: currentView
  }));
}

function loadAppState() {
  try {
    const raw = localStorage.getItem("pilotapp_state");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}




// ---------------------------------------------------------
// RÜSTERBERGEN VIEW (NEU – KOMPAKT)
// ---------------------------------------------------------
async function loadRuesterbergen() {
  try {
    const res = await fetch("data/ruesterbergen_dispatch.json", { cache: "no-store" });

    if (!res.ok) throw new Error("ruesterbergen_dispatch.json fehlt");

    const data = await res.json();

    let html = '<div style="max-width:1000px;">';

    html += '<div class="view-header">';
    html += '<div class="view-title">Rüsterbergen</div>';
    html += '<div class="badges-row">';

    if (data.counts) {
      html += `<span class="badge info">Schiffe: ${data.counts.ships_for_ruesterbergen}</span>`;
      html += `<span class="badge success">Zugeordnet: ${data.counts.assignments}</span>`;
      html += `<span class="badge gray">Offen: ${data.counts.unassigned_ships}</span>`;
    }

    html += '</div>';
    html += '</div>';

    // -----------------------------------------------------
    // LISTE – KOMPAKT
    // -----------------------------------------------------
    if (Array.isArray(data.ships)) {

      data.ships.forEach(ship => {

        const assignment = data.assignments?.find(a => a.ship_key === ship.ship_key);

        html += `
          <div class="card" style="margin-bottom:10px;">
            <div class="card-header">
              <strong>${escapeHtml(ship.ship_name || "—")}</strong>
              <span>${escapeHtml(ship.eta_rueb || "—")}</span>
            </div>

            <div class="card-content" style="display:block;">
              
              ${detailRow("Route", ship.summary?.route || "—")}
              ${detailRow("Q", ship.ship_q ?? "—")}
              ${detailRow("Tiefgang", ship.summary?.draft || "—")}

              <hr style="border:none; border-top:1px solid #374151; margin:8px 0;">

              ${
                assignment
                  ? `
                    ${detailRow("Lotse", assignment.assigned_pilot)}
                    ${detailRow("Abt.", assignment.assigned_abteilungszeit)}
                    ${detailRow("ETA aktuell", assignment.assigned_current_ship_eta_rueb)}
                  `
                  : `<div style="color:#f87171;">❌ Kein Lotse</div>`
              }

            </div>
          </div>
        `;
      });
    }

    html += '</div>';

    contentEl.innerHTML = html;
    statusEl.textContent = "Rüsterbergen " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}


