/* =========================================================
   PilotAppFinal – boert.js
   Bört-View ausgelagert aus app.js
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
          filteredLotsen.some((l) => l.pos === tp.pos)
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
        html += `<div style="margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 14px;">📝 ${escapeHtml(p.bemerkung)}</div>`;
      }

      html += "</div>";
    }

    html += '<div class="section-header">Tauschpartner</div>';

    if (filteredTauschpartner.length > 0) {
      html += '<div class="tauschpartner-grid">';

      filteredTauschpartner.forEach((tp) => {
        let cardClass = "tauschpartner-card";
        if (tp.verguetung) {
          cardClass += " verguetung";
        } else if (tp.arrow === "↑" || tp.richtung === "↑") {
          cardClass += " arrow-up";
        } else if (tp.arrow === "↓" || tp.richtung === "↓") {
          cardClass += " arrow-down";
        }

        html += `<div class="${cardClass}">`;
        html += `<div class="tauschpartner-name">${escapeHtml(tp.vorname)} ${escapeHtml(tp.nachname)}</div>`;
        html += `<div class="tauschpartner-info">Pos ${escapeHtml(tp.pos)}</div>`;
        html += "</div>";
      });

      html += "</div>";
    } else {
      html += '<div style="opacity:.6; padding:8px">Keine Tauschpartner gefunden</div>';
    }

    if (filteredLotsen.length > 0) {
      html += '<div class="section-header">Alle Lotsen</div>';

      filteredLotsen.forEach((lotse, idx) => {
        const targetClass = lotse.is_target ? " target" : "";
        html += `<div class="lotse-item${targetClass}" data-lotse="${idx}">`;
        html += '<div class="lotse-header">';
        html += `<div class="lotse-nr">${escapeHtml(lotse.pos)}</div>`;
        html += `<div class="lotse-name">${escapeHtml(lotse.vorname)} ${escapeHtml(lotse.nachname)}</div>`;

        if (lotse.arrow) {
          const arrowClass = lotse.arrow.includes("↑")
            ? "arrow-up"
            : (lotse.arrow.includes("↓") ? "arrow-down" : "");
          html += `<div class="lotse-info"><span class="${arrowClass}">${escapeHtml(lotse.arrow)}</span></div>`;
        }

        if (lotse.times && lotse.times.from_meldung) {
          html += `<div class="lotse-info">${escapeHtml(lotse.times.from_meldung)}</div>`;
        }

        if (lotse.verguetung) {
          html += '<div class="lotse-info"><span class="verguetung">$$</span></div>';
        }

        html += '<span class="expand-icon">▼</span>';
        html += "</div>";

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
          html += "</div>";
        }
        if (lotse.bemerkung) {
          html += detailRow("Bemerkung", lotse.bemerkung);
        }
        html += "</div>";

        html += "</div>";
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

    statusEl.textContent = "Aktualisiert " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Bört-Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}