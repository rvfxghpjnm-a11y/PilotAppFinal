export async function loadRuesterbergenView(contentEl, statusEl, detailRow, escapeHtml) {
  try {
    const res = await fetch("data/ruesterbergen_dispatch.json", { cache: "no-store" });
    if (!res.ok) throw new Error("ruesterbergen_dispatch.json fehlt");

    const data = await res.json();

    const assignments = Array.isArray(data.assignments) ? data.assignments : [];
    const unassignedShips = Array.isArray(data.unassigned_ships) ? data.unassigned_ships : [];
    const visibleOnlyPilots = Array.isArray(data.visible_only_pilots) ? data.visible_only_pilots : [];
    const ships = Array.isArray(data.ships) ?
	data.ships : [];

    const assignmentMap = new Map(assignments.map(a => [a.ship_key, a]));
    const unassignedMap = new Map(unassignedShips.map(u => [u.ship_key, u]));

    const assignedShips = ships.filter(ship => assignmentMap.has(ship.ship_key));
    const openShips = ships.filter(ship => !assignmentMap.has(ship.ship_key));

    let html = '<div style="max-width:1100px;">';

    html += '<div class="view-header">';
    html += '<div class="view-title">Rüsterbergen</div>';
    html += '<div class="badges-row">';

    if (data.counts) {
      html += badge("info", `Schiffe: ${valueOrDash(data.counts.ships_for_ruesterbergen)}`);
      html += badge("success", `Zugeordnet: ${valueOrDash(data.counts.assignments)}`);
      html += badge("gray", `Offen: ${valueOrDash(data.counts.unassigned_ships)}`);

      if (data.counts.pilots_dispatchable !== undefined) {
        html += badge("info", `Disponierbar: ${valueOrDash(data.counts.pilots_dispatchable)}`);
      }
      if (data.counts.pilots_visible_only !== undefined) {
        html += badge("gray", `Nur sichtbar: ${valueOrDash(data.counts.pilots_visible_only)}`);
      }
    }

    html += '</div>';
    html += `<div class="meta-info">Aktualisiert: ${escapeHtml(new Date().toLocaleTimeString("de-DE"))}</div>`;
    html += '</div>';

    html += renderShipSection(
      "Offene Schiffe",
      openShips,
      "❌",
      "Kein Lotse zugeordnet",
      ship => renderOpenShipCard(ship, unassignedMap.get(ship.ship_key), detailRow, escapeHtml)
    );

    html += renderShipSection(
      "Zugeordnete Schiffe",
      assignedShips,
      "✓",
      "Lotse zugeordnet",
      ship => renderAssignedShipCard(ship, assignmentMap.get(ship.ship_key), detailRow, escapeHtml)
    );

    html += renderVisibleOnlyPilotsSection(visibleOnlyPilots, detailRow, escapeHtml);

    html += '</div>';

    contentEl.innerHTML = html;
    bindExpandableCards(contentEl);
    statusEl.textContent = "Rüsterbergen " + new Date().toLocaleTimeString("de-DE");

  } catch (err) {
    contentEl.innerHTML = `<div class="error">❌ Fehler: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

function renderShipSection(title, ships, icon, subtitle, renderCard) {
  let html = `<div class="section-header">${title}</div>`;

  if (!ships.length) {
    html += `<div style="opacity:.7; padding:8px 0 14px 0;">Keine Einträge</div>`;
    return html;
  }

  ships.forEach(ship => {
    html += renderCard(ship, icon, subtitle);
  });

  return html;
}

function renderAssignedShipCard(ship, assignment, detailRow, escapeHtml) {
  const route = buildRouteFromMeldung(ship);
  const etaRueb = ship?.eta_rueb || "—";
  const q = ship?.meldung?.q_gruppe ?? ship?.ship_q ?? "—";
  const draft = ship?.meldung?.draft || ship?.summary?.draft || "—";
  const vg = ship?.summary?.vg || "—";
  const lotse = assignment?.assigned_pilot || "—";
  const abt = assignment?.assigned_abteilungszeit || "—";
  const currentShip = assignment?.assigned_current_ship_name || "—";
  const currentEta = assignment?.assigned_current_ship_eta_rueb || "—";
  const reason = assignment?.reason || "—";

  return `
    <div class="card ruest-card expanded" style="margin-bottom:12px;">
      <div class="card-header ruest-header" style="cursor:pointer;">
        <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <strong>${escapeHtml(ship?.ship_name || "—")}</strong>
            <span class="badge success">✓ zugeordnet</span>
          </div>
          <div style="font-size:13px; opacity:.85;">
            ETA RÜB ${escapeHtml(etaRueb)} · ${escapeHtml(route)} · Q ${escapeHtml(q)} · TG ${escapeHtml(draft)} · VG ${escapeHtml(vg)}
          </div>
          <div style="font-size:13px; opacity:.9;">
            Lotse: <b>${escapeHtml(lotse)}</b>
          </div>
        </div>
        <span class="expand-icon">▼</span>
      </div>

      <div class="card-content" style="display:block;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px;">
          <div>
            ${detailRow("Schiff", ship?.ship_name || "—")}
            ${detailRow("ETA RÜB", etaRueb)}
            ${detailRow("Route", route)}
            ${detailRow("Q", q)}
            ${detailRow("Tiefgang", draft)}
            ${detailRow("VG", vg)}
          </div>

          <div>
            ${detailRow("Lotse", lotse)}
            ${detailRow("Abt.", abt)}
            ${detailRow("Aktuelles Schiff", currentShip)}
            ${detailRow("ETA aktuell", currentEta)}
            ${detailRow("Grund", reason)}
          </div>
        </div>

        ${renderCandidatesBlock(assignment?.candidates, "Weitere passende Kandidaten", detailRow, escapeHtml)}
      </div>
    </div>
  `;
}

function renderOpenShipCard(ship, unassigned, detailRow, escapeHtml) {
  const route = buildRouteFromMeldung(ship);
  const etaRueb = ship?.eta_rueb || "—";
  const q = ship?.meldung?.q_gruppe ?? ship?.ship_q ?? "—";
  const draft = ship?.meldung?.draft || ship?.summary?.draft || "—";
  const vg = ship?.summary?.vg || "—";
  const reason = unassigned?.reason || "Kein passender Lotse rechtzeitig verfügbar";

  return `
    <div class="card ruest-card expanded" style="margin-bottom:12px;">
      <div class="card-header ruest-header" style="cursor:pointer;">
        <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <strong>${escapeHtml(ship?.ship_name || "—")}</strong>
            <span class="badge gray">offen</span>
          </div>
          <div style="font-size:13px; opacity:.85;">
            ETA RÜB ${escapeHtml(etaRueb)} · ${escapeHtml(route)} · Q ${escapeHtml(q)} · TG ${escapeHtml(draft)} · VG ${escapeHtml(vg)}
          </div>
          <div style="font-size:13px; color:#fca5a5;">
            ${escapeHtml(reason)}
          </div>
        </div>
        <span class="expand-icon">▼</span>
      </div>

      <div class="card-content" style="display:block;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px;">
          <div>
            ${detailRow("Schiff", ship?.ship_name || "—")}
            ${detailRow("ETA RÜB", etaRueb)}
            ${detailRow("Route", route)}
            ${detailRow("Q", q)}
            ${detailRow("Tiefgang", draft)}
            ${detailRow("VG", vg)}
          </div>

          <div>
            ${detailRow("Grund", reason)}
            ${detailRow("Pilotstatus", ship?.summary?.pilot_status || "—")}
            ${detailRow("Pilot 1", ship?.summary?.pilot_1_name || "—")}
            ${detailRow("Makler", ship?.summary?.makler || "—")}
            ${detailRow("Beladung", ship?.summary?.type_of_loading || "—")}
          </div>
        </div>

        ${renderExcludedBlock(unassigned?.excluded, detailRow, escapeHtml)}
      </div>
    </div>
  `;
}

function renderVisibleOnlyPilotsSection(pilots, detailRow, escapeHtml) {
  let html = `<div class="section-header">Nur sichtbar (noch nicht automatisch disponierbar)</div>`;

  if (!pilots.length) {
    html += `<div style="opacity:.7; padding:8px 0 14px 0;">Keine Einträge</div>`;
    return html;
  }

  pilots.forEach(pilot => {
    html += `
      <div class="card" style="margin-bottom:12px;">
        <div class="card-header">
          <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
            <strong>${escapeHtml(pilot?.pilot_name || "—")}</strong>
            <div style="font-size:13px; opacity:.85;">
              ${escapeHtml(buildPilotRoute(pilot))} · Q ${escapeHtml(pilot?.pilot_q ?? "—")}
            </div>
          </div>
          <span class="badge gray">sichtbar</span>
        </div>
        <div class="card-content" style="display:block;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px;">
            <div>
              ${detailRow("Abt.", pilot?.abteilungszeit || "—")}
              ${detailRow("Aufgabe", pilot?.aufgabe || "—")}
              ${detailRow("Route", buildPilotRoute(pilot))}
              ${detailRow("Q", pilot?.pilot_q ?? "—")}
            </div>
            <div>
              ${detailRow("Aktuelles Schiff", pilot?.current_ship_name || "—")}
              ${detailRow("ETA RÜB aktuell", pilot?.current_ship_eta_rueb || "—")}
              ${detailRow("Quelle", pilot?.current_ship_source || "—")}
            </div>
          </div>
        </div>
      </div>
    `;
  });

  return html;
}

function renderCandidatesBlock(candidates, title, detailRow, escapeHtml) {
  if (!Array.isArray(candidates) || candidates.length <= 1) return "";

  const rest = candidates.slice(1);
  if (!rest.length) return "";

  return `
    <div style="margin-top:14px;">
      <div style="font-weight:700; margin-bottom:8px;">${escapeHtml(title)}</div>
      ${rest.map(candidate => `
        <div style="padding:8px 0; border-top:1px solid #374151;">
          ${detailRow("Lotse", candidate?.pilot_name || "—")}
          ${detailRow("Abt.", candidate?.abteilungszeit || "—")}
          ${detailRow("Q", candidate?.pilot_q ?? "—")}
          ${detailRow("Aktuelles Schiff", candidate?.current_ship_name || "—")}
          ${detailRow("ETA aktuell", candidate?.current_ship_eta_rueb || "—")}
        </div>
      `).join("")}
    </div>
  `;
}

function renderExcludedBlock(excluded, detailRow, escapeHtml) {
  if (!Array.isArray(excluded) || !excluded.length) return "";

  return `
    <div style="margin-top:14px;">
      <div style="font-weight:700; margin-bottom:8px;">Warum andere Lotsen ausschieden</div>
      ${excluded.slice(0, 8).map(ex => `
        <div style="padding:8px 0; border-top:1px solid #374151;">
          ${detailRow("Lotse", ex?.pilot_name || "—")}
          ${detailRow("Grund", ex?.reason || "—")}
          ${detailRow("Aktuelles Schiff", ex?.current_ship_name || "—")}
          ${detailRow("ETA aktuell", ex?.current_ship_eta_rueb || ex?.pilot_eta || "—")}
        </div>
      `).join("")}
    </div>
  `;
}

function bindExpandableCards(root) {
  root.querySelectorAll(".ruest-card .ruest-header").forEach(header => {
    header.addEventListener("click", () => {
      const card = header.closest(".ruest-card");
      if (card) card.classList.toggle("expanded");
    });
  });
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

function buildPilotRoute(pilot) {
  const from = normalizeText(pilot?.from);
  const to = normalizeText(pilot?.to);

  if (from || to) {
    return `${from || "—"} → ${to || "—"}`;
  }

  return normalizeText(pilot?.route) || "—";
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function badge(variant, text) {
  return `<span class="badge ${variant}">${escapeHtmlText(text)}</span>`;
}

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function escapeHtmlText(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}