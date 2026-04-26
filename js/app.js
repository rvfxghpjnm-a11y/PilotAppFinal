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
import { loadRuesterbergenView } from "./views/ruesterbergen.js";
import { loadSeelotseView } from "./views/seelotse.js";
import { loadDashboardView } from "./views/dashboard.js";

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

  if (currentView === "dashboard") {
    loadDashboardView(
      contentEl,
      statusEl,
      currentPerson,
      detailRow,
      escapeHtml,
      formatDateTime,
      safeJsonFromSettled,
      (view) => {
        currentView = view;
        saveAppState();
        syncViewButtons();
        renderView();
      }
    );
  }

  if (currentView === "short") loadShort();
  if (currentView === "long")  loadLong();
  if (currentView === "graph") loadGraph();
  if (currentView === "seelotse") loadSeelotseView(contentEl, statusEl, detailRow, escapeHtml, formatDateTime, safeJsonFromSettled, currentPerson);
  if (currentView === "ruesterbergen") loadRuesterbergenView(contentEl, statusEl, detailRow, escapeHtml);
  if (currentView === "boert") loadBoert();
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