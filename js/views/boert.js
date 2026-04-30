/* =========================================================
   PilotAppFinal – boert.js
   Bört-View ausgelagert aus app.js
   Tauschpartner erweitert:
   - Pfeil
   - mit/ohne Vergütung
   - voraus/achtern
   - mögliche Uhrzeiten
   - taktische Nummer
   - Positionsnummer
   - Bemerkung

   Mobile-Fix:
   - Header umbrechen auf iPhone
   - nichts mehr rechts abschneiden
   ========================================================= */

export async function loadBoertView(
  contentEl,
  statusEl,
  currentPerson,
  boertFromDate,
  boertToDate,
  detailRow,
  escapeHtml,
  formatDateTime,
  parseLotseTime
) {
  try {
    const res = await fetch(`data/${currentPerson.key}_boert.json`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`${currentPerson.key}_boert.json nicht ladbar`);
    }

    const data = await res.json();

    let filteredLotsen = data.lotsen || [];
    const filterActive = Boolean(boertFromDate || boertToDate);

    if (filterActive) {
      const fromTs = boertFromDate ? boertFromDate.getTime() : null;
      const toTs   = boertToDate   ? boertToDate.getTime()   : null;

      filteredLotsen = filteredLotsen.filter((lotse) => {
        if (!lotse.times) return false;

        return Object.values(lotse.times).some((val) => {
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

    const filteredTauschpartner = Array.isArray(data.tauschpartner)
      ? data.tauschpartner.filter((tp) =>
          filteredLotsen.some((l) => String(l.pos) === String(tp.pos))
        )
      : [];

    const totalLotsen = (data.lotsen || []).length;
    const shownLotsen = filteredLotsen.length;
    const targetPerson = data.person || data.target || {};
    const targetPos = toInt(targetPerson.pos);

    let html = '<div style="max-width:1200px;">';

    html += '<div class="view-header">';
    html += '<div class="view-title">Bört</div>';
    html += '<div class="badges-row">';
    html += `<div class="meta-info">${filterActive ? "🔎 Filter aktiv – " : ""}Anzeige ${shownLotsen} von ${totalLotsen} Lotsen</div>`;

    if (data.status === "boert") {
      html += '<span class="badge success">✓ Im Bört</span>';
    } else {
      html += '<span class="badge gray">Nicht im Bört</span>';
    }

    html += "</div>";
    html += `<div class="meta-info">Generiert: ${formatDateTime(data.generated_at)}</div>`;
    html += "</div>";

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
        html += "</div>";
      }

      if (p.bemerkung) {
        html += `<div style="margin-top:12px; padding:8px; background:rgba(0,0,0,0.2); border-radius:6px; font-size:14px;">📝 ${escapeHtml(p.bemerkung)}</div>`;
      }

      html += "</div>";
    }

    html += '<div class="section-header">Tauschpartner</div>';

    if (filteredTauschpartner.length > 0) {
      filteredTauschpartner.forEach((tp, idx) => {
        html += renderTauschpartnerCard(tp, idx, targetPos, detailRow, escapeHtml);
      });
    } else {
      html += '<div style="opacity:.6; padding:8px">Keine Tauschpartner gefunden</div>';
    }

    if (filteredLotsen.length > 0) {
      html += '<div class="section-header">Alle Lotsen</div>';

      filteredLotsen.forEach((lotse, idx) => {
        html += renderLotseCard(lotse, idx, detailRow, escapeHtml);
      });
    }

    html += "</div>";

    contentEl.innerHTML = html;

    document.querySelectorAll(".lotse-item").forEach((item) => {
      const header = item.querySelector(".lotse-header");
      if (header) {
        header.addEventListener("click", () => {
          item.classList.toggle("expanded");
        });
      }
    });

    document.querySelectorAll(".tp-item").forEach((item) => {
      const header = item.querySelector(".tp-header");
      if (header) {
        header.addEventListener("click", () => {
          item.classList.toggle("expanded");
        });
      }
    });

    statusEl.textContent = "Aktualisiert " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Bört-Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

function renderLotseCard(lotse, idx, detailRow, escapeHtml) {
  const targetClass = lotse.is_target ? " target" : "";
  const pos = firstNonEmpty(lotse.pos, lotse.position, "—");
  const name = `${firstNonEmpty(lotse.vorname, "")} ${firstNonEmpty(lotse.nachname, "")}`.trim() || firstNonEmpty(lotse.name, "—");
  const takt = firstNonEmpty(lotse.takt, lotse.taktische_nummer, lotse.nr, "—");
  const arrow = getArrow(lotse);
  const verguetung = hasVerguetung(lotse);
  const arrowText = getArrowLabel(arrow, verguetung);
  const summaryTime = getSummaryTime(lotse);

  return `
    <div class="lotse-item${targetClass}" data-lotse="${idx}" style="margin-bottom:12px; border:1px solid #374151; border-radius:10px; overflow:hidden; background:rgba(255,255,255,0.02);">
      <div class="lotse-header" style="padding:12px; cursor:pointer;">
        <div style="display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; width:100%;">
          <div style="font-weight:700; min-width:70px; flex:0 1 auto;">Pos ${escapeHtml(pos)}</div>
          <div style="font-weight:700; min-width:180px; flex:1 1 220px; min-width:0; overflow-wrap:anywhere;">${escapeHtml(name)}</div>
          <div style="flex:0 1 auto;">Takt ${escapeHtml(takt)}</div>
          <div style="flex:0 1 auto; overflow-wrap:anywhere;">${escapeHtml(arrowText)}</div>
          <div style="flex:0 1 auto;">${escapeHtml(summaryTime)}</div>
          <div style="margin-left:auto; flex:0 0 auto;"><span class="expand-icon">▼</span></div>
        </div>
      </div>

      <div class="lotse-details">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px; margin-top:8px;">
          ${detailRow("Positionsnummer", pos)}
          ${detailRow("Taktische Nummer", takt)}
          ${detailRow("Pfeil", arrow || "—")}
          ${detailRow("Vergütung", verguetung ? "mit Vergütung" : "ohne Vergütung")}
          ${detailRow("Zeit", firstNonEmpty(lotse.zeit, "—"))}
        </div>

        ${
          lotse.times
            ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px; margin-top:12px;">
                ${lotse.times.from_meldung ? detailRow("von Meldung", lotse.times.from_meldung) : ""}
                ${lotse.times.calc_div2 ? detailRow("calc div2", lotse.times.calc_div2) : ""}
                ${lotse.times.calc_div3 ? detailRow("calc div3", lotse.times.calc_div3) : ""}
                ${lotse.times.from_meldung_alt ? detailRow("von Meldung alt", lotse.times.from_meldung_alt) : ""}
              </div>
            `
            : ""
        }

        ${lotse.bemerkung ? `<div style="margin-top:12px;">${detailRow("Bemerkung", lotse.bemerkung)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderTauschpartnerCard(tp, idx, targetPos, detailRow, escapeHtml) {
  const arrow = getArrow(tp);
  const verguetung = hasVerguetung(tp);
  const pos = firstNonEmpty(tp.pos, tp.position, tp.positionsnummer, "—");
  const takt = firstNonEmpty(tp.takt, tp.taktische_nummer, tp.nr, "—");
  const bemerkung = firstNonEmpty(tp.bemerkung, tp.remark, tp.bemerkungen, "—");
  const relation = getRelationLabel(tp, targetPos);
  const arrowText = getArrowLabel(arrow, verguetung);
  const name = `${firstNonEmpty(tp.vorname, "")} ${firstNonEmpty(tp.nachname, "")}`.trim() || firstNonEmpty(tp.name, "—");
  const timeRows = renderTpTimes(tp, detailRow);
  const summaryTime = getSummaryTime(tp);

  let cardClass = "tp-item";
  if (verguetung) {
    cardClass += " verguetung";
  } else if (arrow === "↑") {
    cardClass += " arrow-up";
  } else if (arrow === "↓") {
    cardClass += " arrow-down";
  }

  return `
    <div class="${cardClass}" data-tp="${idx}" style="margin-bottom:12px; border:1px solid #374151; border-radius:10px; overflow:hidden; background:rgba(255,255,255,0.02);">
      <div class="tp-header" style="padding:12px; cursor:pointer;">
        <div style="display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; width:100%;">
          <div style="font-weight:700; min-width:180px; flex:1 1 220px; min-width:0; overflow-wrap:anywhere;">${escapeHtml(name)}</div>
          <div style="flex:0 1 auto;">Pos ${escapeHtml(pos)}</div>
          <div style="flex:0 1 auto;">Takt ${escapeHtml(takt)}</div>
          <div style="flex:0 1 auto; overflow-wrap:anywhere;">${escapeHtml(arrowText)}</div>
          <div style="flex:0 1 auto;">${escapeHtml(summaryTime)}</div>
          <div style="margin-left:auto; flex:0 0 auto;"><span class="expand-icon">▼</span></div>
        </div>
      </div>

      <div class="tp-details" style="display:none; padding:0 12px 12px 12px; border-top:1px solid #374151;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px; margin-top:10px;">
          ${detailRow("Name", name)}
          ${detailRow("Positionsnummer", pos)}
          ${detailRow("Taktische Nummer", takt)}
          ${detailRow("Pfeil", arrow || "—")}
          ${detailRow("Vergütung", verguetung ? "mit Vergütung" : "ohne Vergütung")}
          ${detailRow("Lage", relation)}
          ${detailRow("Bemerkung", bemerkung)}
        </div>

        ${timeRows ? `
          <div style="margin-top:12px;">
            <div style="font-weight:700; margin-bottom:8px;">Mögliche Uhrzeiten</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px;">
              ${timeRows}
            </div>
          </div>
        ` : ""}

        ${renderAdditionalTpFields(tp, detailRow)}
      </div>
    </div>
  `;
}

function renderTpTimes(tp, detailRow) {
  const rows = [];

  if (tp.times && typeof tp.times === "object") {
    if (tp.times.from_meldung) rows.push(detailRow("von Meldung", tp.times.from_meldung));
    if (tp.times.from_meldung_alt) rows.push(detailRow("von Meldung alt", tp.times.from_meldung_alt));
    if (tp.times.calc_div2) rows.push(detailRow("calc div2", tp.times.calc_div2));
    if (tp.times.calc_div3) rows.push(detailRow("calc div3", tp.times.calc_div3));

    Object.entries(tp.times).forEach(([key, value]) => {
      if (!value) return;
      if (["from_meldung", "from_meldung_alt", "calc_div2", "calc_div3"].includes(key)) return;
      rows.push(detailRow(humanizeKey(key), value));
    });
  }

  const directTimeFields = [
    ["Zeit", tp.time],
    ["Uhrzeit", tp.uhrzeit],
    ["ETA", tp.eta],
  ];

  directTimeFields.forEach(([label, value]) => {
    if (value) rows.push(detailRow(label, value));
  });

  return rows.join("");
}

function renderAdditionalTpFields(tp, detailRow) {
  const usedKeys = new Set([
    "vorname", "nachname", "name",
    "pos", "position", "positionsnummer",
    "takt", "taktische_nummer", "nr",
    "arrow", "richtung",
    "verguetung",
    "bemerkung", "bemerkungen", "remark",
    "times", "time", "uhrzeit", "eta"
  ]);

  const extraRows = [];

  Object.entries(tp || {}).forEach(([key, value]) => {
    if (usedKeys.has(key)) return;
    if (value === null || value === undefined || value === "") return;
    if (typeof value === "object") return;
    extraRows.push(detailRow(humanizeKey(key), value));
  });

  if (!extraRows.length) return "";

  return `
    <div style="margin-top:12px;">
      <div style="font-weight:700; margin-bottom:8px;">Weitere Felder</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px;">
        ${extraRows.join("")}
      </div>
    </div>
  `;
}

function getArrow(tp) {
  const raw = firstNonEmpty(tp.arrow, tp.richtung, "");
  const text = String(raw);
  if (text.includes("↑")) return "↑";
  if (text.includes("↓")) return "↓";
  return text || "";
}

function hasVerguetung(tp) {
  if (tp.verguetung === true) return true;
  if (tp.verguetung === false) return false;

  const arrowText = String(firstNonEmpty(tp.arrow, tp.richtung, ""));
  if (arrowText.includes("$$")) return true;

  const verg = String(tp.verguetung ?? "").toLowerCase();
  return ["1", "true", "ja", "yes", "$$", "mit"].includes(verg);
}

function getRelationLabel(tp, targetPos) {
  const tpPos = toInt(firstNonEmpty(tp.pos, tp.position, tp.positionsnummer, null));
  if (tpPos === null || targetPos === null) return "—";
  if (tpPos < targetPos) return "voraus";
  if (tpPos > targetPos) return "achtern";
  return "gleiche Position";
}

function getArrowLabel(arrow, verguetung) {
  if (!arrow) return "kein Pfeil";
  if (arrow === "↑") return verguetung ? "↑ mit Vergütung" : "↑ ohne Vergütung";
  if (arrow === "↓") return verguetung ? "↓ mit Vergütung" : "↓ ohne Vergütung";
  return verguetung ? `${arrow} mit Vergütung` : `${arrow} ohne Vergütung`;
}

function getSummaryTime(tp) {
  if (tp?.times?.from_meldung) return String(tp.times.from_meldung);
  if (tp?.times?.from_meldung_alt) return String(tp.times.from_meldung_alt);
  if (tp?.times?.calc_div2) return String(tp.times.calc_div2);
  if (tp?.times?.calc_div3) return String(tp.times.calc_div3);
  if (tp?.time) return String(tp.time);
  if (tp?.uhrzeit) return String(tp.uhrzeit);
  return "keine Zeit";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return "";
}

function toInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

function humanizeKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}