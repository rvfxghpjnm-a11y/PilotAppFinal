/* =========================================================
   PilotAppFinal – app.js
   Zentraler Einstieg
   - Personen aus data/persons.json
   - Dashboard / Seelotse / Rüsterbergen / Bört als eigene Views
   ========================================================= */

import { renderWorkstartChart } from "./graph.js";
import { loadRuesterbergenView } from "./views/ruesterbergen.js";
import { loadSeelotseView } from "./views/seelotse.js";
import { loadDashboardView } from "./views/dashboard.js";
import { loadBoertView } from "./views/boert.js";

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
      .map((p) => buildPersonFromConfigEntry(p))
      .filter(Boolean);

    if (!personsData.length) {
      throw new Error("Keine Personen in persons.json");
    }

    const saved = loadAppState();

    if (saved) {
      const found = personsData.find((p) => p.key === saved.personKey);
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
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-view]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentView = btn.dataset.view;
      saveAppState();
      renderView();
    };
  });
}

function syncViewButtons() {
  document.querySelectorAll("[data-view]").forEach((btn) => {
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
    return;
  }

  if (currentView === "short") {
    loadShort();
    return;
  }

  if (currentView === "long") {
    loadLong();
    return;
  }

  if (currentView === "graph") {
    loadGraph();
    return;
  }

  if (currentView === "seelotse") {
    loadSeelotseView(
      contentEl,
      statusEl,
      detailRow,
      escapeHtml,
      formatDateTime,
      safeJsonFromSettled,
      currentPerson
    );
    return;
  }

  if (currentView === "ruesterbergen") {
    loadRuesterbergenView(contentEl, statusEl, detailRow, escapeHtml);
    return;
  }

  if (currentView === "boert") {
    loadBoertView(
      contentEl,
      statusEl,
      currentPerson,
      boertFromDate,
      boertToDate,
      detailRow,
      escapeHtml,
      formatDateTime,
      parseLotseTime
    );
  }
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
  document.querySelectorAll("[data-hours]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-hours]").forEach((b) => b.classList.remove("active"));
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
    renderView();
  };

  reset.onclick = () => {
    fromEl.value = "";
    toEl.value   = "";
    boertFromDate = null;
    boertToDate   = null;
    renderView();
  };
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
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleString("de-DE");
  } catch {
    return dateStr;
  }
}

function capitalizeWords(text) {
  return String(text || "")
    .split(" ")
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

function parseLotseTime(val) {
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

// ---------------------------------------------------------
// STATE PERSISTENCE
// ---------------------------------------------------------
function saveAppState() {
  if (!currentPerson) return;

  localStorage.setItem("pilotapp_state", JSON.stringify({
    personKey: currentPerson.key,
    view: currentView,
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