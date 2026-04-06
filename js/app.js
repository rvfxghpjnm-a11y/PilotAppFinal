/* =========================================================
   PilotAppFinal – app.js
   Personen ausschließlich aus data/persons.json
   Dashboard zustandsabhängig:
   - Gesamtbört: Fokus auf Pos / Takt / Start / TP
   - Seelotsen: Fokus auf Aufgabe / Fahrzeug / Schiff / ETA
   - Short / Long / Graph / Seelotse / Bört bleiben erhalten
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
  if (currentView === "boert") loadBoert();
}

// ---------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------
async function loadDashboard() {
  try {
    const [bundleRes, boertRes, seelotseRes] = await Promise.allSettled([
      fetch(`data/${currentPerson.key}_bundle.json`, { cache: "no-store" }),
      fetch(`data/${currentPerson.key}_boert.json`, { cache: "no-store" }),
      fetch(`data/${currentPerson.key}_seelotse.json`, { cache: "no-store" }),
    ]);

    if (bundleRes.status !== "fulfilled" || !bundleRes.value.ok) {
      throw new Error(`${currentPerson.key}_bundle.json nicht ladbar`);
    }

    const bundle = await bundleRes.value.json();
    const boertData = await safeJsonFromSettled(boertRes);
    const seelotseData = await safeJsonFromSettled(seelotseRes);

    const card = bundle.action_card || {};
    const state = bundle.state || {};
    const workstart = bundle.workstart || null;
    const relatedShips = Array.isArray(bundle.related_ships) ? bundle.related_ships : [];
    const seelotsen = bundle.seelotsen || {};
    const boert = bundle.boert || {};
    const sourceMeta = bundle.source_meta || {};
    const snapshots = bundle.snapshots || {};
    const statusSnap = snapshots.status || {};
    const statusInfo = statusSnap.status || {};

    const tauschpartnerCount = Array.isArray(boertData?.tauschpartner) ? boertData.tauschpartner.length : 0;
    const firstSeelotse = Array.isArray(seelotsen.entries) && seelotsen.entries.length ? seelotsen.entries[0] : null;
    const firstShip = relatedShips.length ? relatedShips[0] : null;
    const firstShipSummary = firstShip?.summary || {};

    const stateKind = normalizeStateKind(state.kind);
    const isBoert = stateKind === "gesamtboert";
    const isSeelotse = stateKind === "seelotsen";
    const isFree = !isBoert && !isSeelotse;

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
      firstShip,
      firstShipSummary,
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
      html += renderSeelotseShipCard(seelotsen, firstSeelotse, firstShip, firstShipSummary);
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
    // Sekundär-Zeile
    // -----------------------------------------------------
    html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-top:16px;">';

    if (isBoert) {
      html += renderSecondaryCard(
        "Seelotse / Schiff",
        renderSeelotseShipInner(seelotsen, firstSeelotse, firstShip, firstShipSummary),
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
        renderSeelotseShipInner(seelotsen, firstSeelotse, firstShip, firstShipSummary),
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
  firstShip,
  firstShipSummary,
}) {
  let subtitle = card.subtitle || card.state_label || "Ziellotse";
  let extraLines = Array.isArray(card.lines) ? [...card.lines] : [];
  let extraBadges = [];

  if (isBoert) {
    if (tauschpartnerCount) extraBadges.push(`${tauschpartnerCount} TP`);
  }

  if (isSeelotse) {
    if (firstSeelotse?.aufgabe) extraBadges.push(firstSeelotse.aufgabe);
    if (firstShip?.name) extraLines.unshift(`Schiff: ${firstShip.name}`);
    if (firstShipSummary?.eta_schleuse) extraLines.push(`ETA Schleuse: ${firstShipSummary.eta_schleuse}`);
    if (firstShipSummary?.draft) extraLines.push(`Tiefgang: ${firstShipSummary.draft}`);
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

function renderSeelotseShipCard(seelotsen, firstSeelotse, firstShip, firstShipSummary) {
  return renderPrimaryCard(
    "Seelotse / Schiff",
    renderSeelotseShipInner(seelotsen, firstSeelotse, firstShip, firstShipSummary)
  );
}

function renderSeelotseShipInner(seelotsen, firstSeelotse, firstShip, firstShipSummary) {
  return `
    ${detailRow("Seelotsen-Einträge", valueOrDash(seelotsen.entry_count))}
    ${detailRow("Aufgabe", firstSeelotse?.aufgabe || "—")}
    ${detailRow("Fahrzeug", firstSeelotse?.fahrzeug || "—")}
    ${detailRow("Route", buildRoute(firstSeelotse?.from, firstSeelotse?.to))}
    ${detailRow("Schiff", firstShip?.name || "—")}
    ${detailRow("VG", firstShipSummary.vg || "—")}
    ${detailRow("Tiefgang", firstShipSummary.draft || "—")}
    ${detailRow("ETA Schleuse", firstShipSummary.eta_schleuse || "—")}
    ${detailRow("ETA RÜB", firstShipSummary.eta_rueb || "—")}
  `;
}

function renderLinkedShipsCard(relatedShips) {
  return `
    <div class="card expanded">
      <div class="card-header">
        <strong>Verknüpfte Schiffe</strong>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-content" style="display:block;">
        ${
          relatedShips.length
            ? relatedShips.slice(0, 3).map(ship => {
                const s = ship.summary || {};
                return `
                  <div style="padding:10px 0; border-bottom:1px solid #374151;">
                    <div style="font-weight:600; margin-bottom:6px;">${escapeHtml(ship.name || "—")}</div>
                    ${detailRow("Richtung", s.zulauf_richtung || "—")}
                    ${detailRow("Queue", s.queue_title || "—")}
                    ${detailRow("ETA Schleuse", s.eta_schleuse || "—")}
                    ${detailRow("ETA RÜB", s.eta_rueb || "—")}
                    ${detailRow("VG", s.vg || "—")}
                    ${detailRow("Q Schiff", s.q_gruppe || "—")}
                    ${detailRow("Tiefgang", s.draft || "—")}
                  </div>
                `;
              }).join("")
            : '<div style="opacity:.7;">Keine verknüpften Schiffe</div>'
        }
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
async function loadSeelotse() {
  try {
    const res = await fetch(`data/${currentPerson.key}_seelotse.json`, { cache: "no-store" });
    const data = await res.json();

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

    html += '</div>';
    html += `<div class="meta-info">Generiert: ${formatDateTime(data.generated_at)}</div>`;
    html += '</div>';

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

    html += '</div>';

    contentEl.innerHTML = html;

    document.querySelectorAll('.lotse-item').forEach(item => {
      item.querySelector('.lotse-header').addEventListener('click', () => {
        item.classList.toggle('expanded');
      });
    });

    statusEl.textContent = "Aktualisiert " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Seelotse-Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

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
// HELPER
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