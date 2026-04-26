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
      html += `<span class="badge info">Kanal: ${escapeHtml(data.gruppen.kanal ?? "—")}</span>`;
      html += `<span class="badge info">Wach: ${escapeHtml(data.gruppen.wach ?? "—")}</span>`;
      html += `<span class="badge info">See: ${escapeHtml(data.gruppen.see ?? "—")}</span>`;
    }

    if (dispatchData?.counts) {
      html += `<span class="badge info">RÜB-Schiffe: ${escapeHtml(dispatchData.counts.ships_for_ruesterbergen ?? "0")}</span>`;
      html += `<span class="badge success">Zuordnungen: ${escapeHtml(dispatchData.counts.assignments ?? "0")}</span>`;
      html += `<span class="badge gray">Offen: ${escapeHtml(dispatchData.counts.unassigned_ships ?? "0")}</span>`;
    }

    html += "</div>";
    html += `<div class="meta-info">Generiert: ${formatDateTime(data.generated_at)}</div>`;
    html += "</div>";

    if (Array.isArray(data.lotsen) && data.lotsen.length > 0) {
      html += '<div class="section-header">Lotsen</div>';

      data.lotsen.forEach((lotse) => {
        html += `
          <div class="card" style="margin-bottom:10px;">
            <div class="card-header">
              <strong>${escapeHtml(lotse.name || "—")}</strong>
              <span>${escapeHtml(lotse.aufgabe || "—")}</span>
            </div>
            <div class="card-content" style="display:block;">
              ${detailRow("Fahrzeug", lotse.fahrzeug || "—")}
              ${detailRow("Route", lotse.route || "—")}
              ${detailRow("Zeit", lotse.time || "—")}
              ${detailRow("ETA Schleuse", lotse?.times?.eta_schleuse || "—")}
              ${detailRow("ETA RÜB", lotse?.times?.eta_rueb || "—")}
            </div>
          </div>
        `;
      });
    }

    if (dispatchData?.ships?.length) {
      html += '<div class="section-header">Rüsterbergen (Kurz)</div>';

      dispatchData.ships.slice(0, 8).forEach((ship) => {
        const assignment = Array.isArray(dispatchData.assignments)
          ? dispatchData.assignments.find((x) => x.ship_key === ship.ship_key)
          : null;

        html += `
          <div class="card" style="margin-bottom:10px;">
            <div class="card-header">
              <strong>${escapeHtml(ship.ship_name || "—")}</strong>
              <span>${escapeHtml(ship.eta_rueb || "—")}</span>
            </div>
            <div class="card-content" style="display:block;">
              ${detailRow("Route", ship.summary?.route || ship.meldung?.route || "—")}
              ${detailRow("Q", ship.ship_q ?? "—")}
              ${detailRow("Tiefgang", ship.summary?.draft || ship.meldung?.draft || "—")}
              ${detailRow("Lotse", assignment?.assigned_pilot || "—")}
              ${detailRow("Abt.", assignment?.assigned_abteilungszeit || "—")}
              ${detailRow("ETA aktuell", assignment?.assigned_current_ship_eta_rueb || "—")}
            </div>
          </div>
        `;
      });
    }

    html += "</div>";

    contentEl.innerHTML = html;
    statusEl.textContent = "Seelotse " + new Date().toLocaleTimeString("de-DE");
  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}