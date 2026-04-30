export async function loadRuesterbergenView(contentEl, statusEl, detailRow, escapeHtml) {
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
              ${detailRow("Route", buildRouteFromMeldung(ship))}
              ${detailRow("Q", ship.meldung?.q_gruppe ?? ship.ship_q ?? "—")}
              ${detailRow("Tiefgang", ship.meldung?.draft || ship.summary?.draft || "—")}

              <hr style="border:none; border-top:1px solid #374151; margin:8px 0;">

              ${
                assignment
                  ? `
                    ${detailRow("Lotse", assignment.assigned_pilot || "—")}
                    ${detailRow("Abt.", assignment.assigned_abteilungszeit || "—")}
                    ${detailRow("ETA aktuell", assignment.assigned_current_ship_eta_rueb || "—")}
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

function buildRouteFromMeldung(ship) {
  const from = normalizeText(ship?.meldung?.from);
  const to = normalizeText(ship?.meldung?.to);

  if (from || to) {
    return `${from || "—"} → ${to || "—"}`;
  }

  const route = normalizeText(ship?.meldung?.route);
  if (route) {
    return route;
  }

  return "—";
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}