export async function loadSeelotseView(contentEl, statusEl, detailRow, escapeHtml, formatDateTime, safeJsonFromSettled) {
  try {
    const [resSeelotse, resDispatch] = await Promise.allSettled([
      fetch(`data/${window.currentPerson.key}_seelotse.json`, { cache: "no-store" }),
      fetch("data/ruesterbergen_dispatch.json", { cache: "no-store" }),
    ]);

    if (resSeelotse.status !== "fulfilled" || !resSeelotse.value.ok) {
      throw new Error(`${window.currentPerson.key}_seelotse.json nicht ladbar`);
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

    html += '</div>';
    html += `<div class="meta-info">Generiert: ${formatDateTime(data.generated_at)}</div>`;
    html += '</div>';

    // -------- LOTSEN --------
    if (data.lotsen && data.lotsen.length > 0) {
      html += '<div class="section-header">Lotsen</div>';

      data.lotsen.forEach(lotse => {
        html += `
          <div class="card">
            <div class="card-header">
              <strong>${escapeHtml(lotse.name || "—")}</strong>
              <span>${escapeHtml(lotse.aufgabe || "")}</span>
            </div>
            <div class="card-content" style="display:block;">
              ${detailRow("Fahrzeug", lotse.fahrzeug)}
              ${detailRow("Route", lotse.route)}
              ${detailRow("Zeit", lotse.time)}
            </div>
          </div>
        `;
      });
    }

    // -------- DISPATCH KURZ --------
    if (dispatchData?.ships?.length) {
      html += '<div class="section-header">Rüsterbergen (Kurz)</div>';

      dispatchData.ships.slice(0, 5).forEach(ship => {
        const a = dispatchData.assignments?.find(x => x.ship_key === ship.ship_key);

        html += `
          <div class="card">
            <div class="card-header">
              <strong>${escapeHtml(ship.ship_name)}</strong>
              <span>${escapeHtml(ship.eta_rueb)}</span>
            </div>
            <div class="card-content" style="display:block;">
              ${detailRow("Route", ship.summary?.route)}
              ${detailRow("Lotse", a?.assigned_pilot || "—")}
            </div>
          </div>
        `;
      });
    }

    html += '</div>';

    contentEl.innerHTML = html;
    statusEl.textContent = "Seelotse " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}