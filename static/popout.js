"use strict";

// Standalone page that renders a highlighted side-by-side diff.
// Reads its payload from sessionStorage (written by the parent tab
// before window.open), fetches /api/diff, and renders the same table
// the main app renders inline.  Nothing is innerHTML'd; user text
// reaches the DOM only through textContent / createElement.

const $ = (id) => document.getElementById(id);

function setStatus(msg, kind) {
  const s = $("popout-status");
  s.textContent = msg || "";
  s.className = "status" + (kind ? " " + kind : "");
}

function renderDiff(data) {
  $("diff-src-h").textContent = data.source_label || "Source";
  $("diff-dst-h").textContent = data.target_label || "Target";

  const tbody = $("diff-tbody");
  tbody.textContent = "";

  const changeLabel = {
    modified: "Modified",
    added: "Added",
    removed: "Removed",
    preserved: "Preserved",
    unchanged: "Unchanged",
  };

  const frag = document.createDocumentFragment();
  for (const row of (data.rows || [])) {
    const tr = document.createElement("tr");
    tr.className = "diff-row diff-" + row.change_type;

    const srcTxt = (row.source || "").replace(/\s+$/, "");
    const outTxt = (row.output || [])
      .filter((o) => o != null)
      .join("\n")
      .replace(/\s+$/, "");

    const srcTd = document.createElement("td");
    srcTd.className = "diff-src";
    if (srcTxt === "" || /^\(.*\)$/.test(srcTxt.trim())) {
      srcTd.classList.add("diff-placeholder");
      srcTd.textContent = srcTxt.trim() || "\u2014";
    } else {
      srcTd.textContent = srcTxt;
    }

    const dstTd = document.createElement("td");
    dstTd.className = "diff-dst";
    if (outTxt === "") {
      dstTd.classList.add("diff-placeholder");
      dstTd.textContent = "(removed)";
    } else {
      dstTd.textContent = outTxt;
    }

    const chTd = document.createElement("td");
    chTd.className = "diff-change";
    chTd.textContent = changeLabel[row.change_type] || row.change_type;

    const noteTd = document.createElement("td");
    noteTd.className = "diff-note";
    noteTd.textContent = row.note || "";

    tr.appendChild(srcTd);
    tr.appendChild(dstTd);
    tr.appendChild(chTd);
    tr.appendChild(noteTd);
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);

  const s = data.stats || {};
  const parts = [];
  for (const k of ["modified", "added", "removed", "preserved", "unchanged"]) {
    parts.push(`${changeLabel[k]}: ${s[k] || 0}`);
  }
  $("diff-stats").textContent = parts.join("  \u00b7  ");

  const dir = data.direction || "";
  const label = dir === "nxos2ios"
    ? "NX-OS \u2192 IOS XE"
    : "IOS XE \u2192 NX-OS";
  $("popout-title").textContent = "Highlighted comparison \u2014 " + label;
  document.title = "Highlighted: " + label;
}

function readPayloadFromSession() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("k");
  if (!key || !/^diff-payload-[a-z0-9]{1,16}$/i.test(key)) {
    throw new Error("missing or invalid payload key in URL");
  }
  const raw = sessionStorage.getItem(key);
  // Clear it immediately so a browser-history navigation can't replay a
  // stale payload and so sessionStorage doesn't accumulate junk.
  sessionStorage.removeItem(key);
  if (!raw) {
    throw new Error(
      "payload not found in session storage. The parent tab writes it " +
      "right before opening this one \u2014 please use the \"Pop out\" " +
      "button on the main page to open this view."
    );
  }
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error("payload is not valid JSON"); }
  if (!data || typeof data !== "object") {
    throw new Error("payload is not an object");
  }
  if (!("direction" in data) || !("content" in data)) {
    throw new Error("payload is missing direction or content");
  }
  window.__payload = data;
  return data;
}

async function refresh() {
  const payload = window.__payload;
  if (!payload) {
    setStatus("No payload loaded. Reopen from the main page.", "err");
    return;
  }
  setStatus("Loading\u2026");
  try {
    const res = await fetch("/api/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderDiff(data);
    const rows = (data.rows || []).length;
    setStatus(`Showing ${rows} row${rows === 1 ? "" : "s"}.`, "ok");
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  }
}

function init() {
  $("close-tab").addEventListener("click", () => window.close());
  $("refresh").addEventListener("click", refresh);
  try {
    readPayloadFromSession();
  } catch (err) {
    setStatus("Could not load payload: " + err.message, "err");
    return;
  }
  refresh();
}

init();
