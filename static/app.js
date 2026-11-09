"use strict";

const $ = (id) => document.getElementById(id);

const el = {
  input:     $("input"),
  result:    $("result"),
  convert:   $("convert"),
  verify:    $("verify"),
  copy:      $("copy"),
  download:  $("download"),
  filename:  $("filename"),
  clear:     $("clear"),
  file:      $("file"),
  loadSample:$("load-sample"),
  format:    $("format"),
  media:     $("opt-media"),
  status:    $("status"),
  badge:     $("badge"),
  srcHeading:$("src-heading"),
  outHeading:$("out-heading"),
  tabI:      $("dir-ios2nxos"),
  tabN:      $("dir-nxos2ios"),
  highlight: $("highlight"),
  hideDiff:  $("hide-diff"),
  popout:    $("popout"),
  diffPanel: $("diff-panel"),
  diffTable: $("diff-table"),
  diffTbody: $("diff-tbody"),
  diffSrcH:  $("diff-src-h"),
  diffDstH:  $("diff-dst-h"),
  diffStats: $("diff-stats"),
};

const STATE = {
  direction: "ios2nxos",
};

function setStatus(msg, kind) {
  el.status.textContent = msg || "";
  el.status.className = "status" + (kind ? " " + kind : "");
}
function setBadge(ok, text) {
  el.badge.hidden = false;
  el.badge.textContent = text;
  el.badge.className = "badge " + (ok ? "ok" : "bad");
}
function clearBadge() { el.badge.hidden = true; }

function setOutput(text) {
  el.result.value = text || "";
  const has = (text || "").length > 0;
  el.copy.disabled = !has;
  el.download.disabled = !has;
  el.highlight.disabled = !has;
  // A fresh text result invalidates any highlighted view we were showing.
  closeDiffPanel();
}

function openDiffPanel() {
  document.body.classList.add("has-diff");
  el.highlight.textContent = "Refresh highlights";
}
function closeDiffPanel() {
  document.body.classList.remove("has-diff");
  el.highlight.textContent = "Highlight changes";
}

function suggestFilename() {
  const fmt = el.format.value;
  const ext = fmt === "sidebyside" ? "md" : "cfg";
  el.filename.value = `converted_${STATE.direction}.${ext}`;
}

function setDirection(dir) {
  STATE.direction = dir === "nxos2ios" ? "nxos2ios" : "ios2nxos";
  const i2n = STATE.direction === "ios2nxos";
  el.tabI.classList.toggle("active", i2n);
  el.tabN.classList.toggle("active", !i2n);
  el.tabI.setAttribute("aria-selected", i2n ? "true" : "false");
  el.tabN.setAttribute("aria-selected", i2n ? "false" : "true");
  el.srcHeading.textContent = i2n
    ? "1 \u00b7 Paste your Catalyst / IOS XE config"
    : "1 \u00b7 Paste your Nexus / NX-OS config";
  el.outHeading.textContent = i2n
    ? "2 \u00b7 Deployable NX-OS output"
    : "2 \u00b7 Deployable IOS XE output";
  el.input.setAttribute(
    "placeholder",
    i2n
      ? "Paste a Cisco IOS XE (Catalyst) running-config here, or click 'Load sample' to try it out."
      : "Paste a Cisco NX-OS (Nexus) running-config here, or click 'Load sample' to try it out."
  );
  suggestFilename();
}

async function postJSON(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* keep {} */ }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function currentPayload() {
  return {
    direction: STATE.direction,
    format: el.format.value,
    options: { media: (el.media.value || "GigabitEthernet").trim() },
    content: el.input.value,
  };
}

async function doConvert() {
  clearBadge();
  if (!el.input.value.trim()) {
    setStatus("Nothing to convert \u2014 paste or load a config first.", "err");
    return;
  }
  setStatus("Converting\u2026");
  el.convert.disabled = true;
  try {
    const data = await postJSON("/api/convert", currentPayload());
    setOutput(data.output);
    if (data.filename) el.filename.value = data.filename;
    setStatus("Done.", "ok");
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  } finally {
    el.convert.disabled = false;
  }
}

// Build and render the highlighted diff table from server JSON.  All
// user-supplied text reaches the DOM through textContent only -- never
// innerHTML -- so a malicious config can't inject markup into the page.
function renderDiff(data) {
  el.diffSrcH.textContent = data.source_label || "Source";
  el.diffDstH.textContent = data.target_label || "Target";

  const tbody = el.diffTbody;
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
  el.diffStats.textContent = parts.join("  \u00b7  ");
}

async function doHighlight() {
  clearBadge();
  if (!el.input.value.trim()) {
    setStatus("Nothing to highlight \u2014 add some input first.", "err");
    return;
  }
  setStatus("Building highlighted diff\u2026");
  el.highlight.disabled = true;
  try {
    const data = await postJSON("/api/diff", currentPayload());
    renderDiff(data);
    openDiffPanel();
    setStatus("Showing color-coded changes.", "ok");
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  } finally {
    el.highlight.disabled = !(el.result.value && el.result.value.length);
  }
}

// Pop the highlighted view out into a new browser tab, full-width.
// The payload is handed to the new tab via sessionStorage keyed to a
// short random id so it stays on the user's machine.  The new tab
// reads the key from its URL, pulls the payload, fetches /api/diff
// itself, and renders the same table.
function popoutDiff() {
  if (!el.input.value.trim()) {
    setStatus("Nothing to pop out \u2014 add some input first.", "err");
    return;
  }
  const key = "diff-payload-" + Math.random().toString(36).slice(2, 10);
  try {
    sessionStorage.setItem(key, JSON.stringify(currentPayload()));
  } catch (err) {
    setStatus("Could not stash payload for new tab: " + err.message, "err");
    return;
  }
  const win = window.open("/highlight.html?k=" + encodeURIComponent(key), "_blank");
  if (!win) {
    setStatus("Pop-up was blocked by the browser. Allow pop-ups for 127.0.0.1 and try again.", "err");
    sessionStorage.removeItem(key);
    return;
  }
  setStatus("Opened highlighted view in a new tab.", "ok");
}

async function doVerify() {
  clearBadge();
  if (!el.input.value.trim()) {
    setStatus("Nothing to verify \u2014 add some input first.", "err");
    return;
  }
  setStatus("Running round-trip\u2026");
  el.verify.disabled = true;
  try {
    const data = await postJSON("/api/verify", currentPayload());
    setOutput(data.report);
    setBadge(data.ok, data.ok ? "ROUND-TRIP LOSSLESS" : "DIFFERENCES FOUND");
    setStatus("Verification complete.", data.ok ? "ok" : "err");
  } catch (err) {
    setStatus("Error: " + err.message, "err");
  } finally {
    el.verify.disabled = false;
  }
}

function triggerDownload() {
  const text = el.result.value;
  if (!text) return;
  const name = (el.filename.value || "converted.cfg").trim() || "converted.cfg";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus(`Saved as "${name}".`, "ok");
}

async function copyOutput() {
  const text = el.result.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.", "ok");
  } catch {
    el.result.focus();
    el.result.select();
    setStatus("Copy failed \u2014 select the text and press Ctrl/Cmd-C.", "err");
  }
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    el.input.value = String(reader.result || "");
    setStatus(`Loaded "${file.name}" (${file.size.toLocaleString()} bytes).`, "ok");
  };
  reader.onerror = () => setStatus("Could not read that file.", "err");
  reader.readAsText(file);
}

async function loadSample() {
  const path = STATE.direction === "ios2nxos"
    ? "/samples/sample_ios.cfg"
    : "/samples/sample_nxos.cfg";
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    el.input.value = await res.text();
    setStatus("Sample loaded.", "ok");
  } catch (err) {
    setStatus("Could not load the sample: " + err.message, "err");
  }
}

function init() {
  el.convert.addEventListener("click", doConvert);
  el.verify.addEventListener("click", doVerify);
  el.copy.addEventListener("click", copyOutput);
  el.download.addEventListener("click", triggerDownload);
  el.format.addEventListener("change", suggestFilename);
  el.highlight.addEventListener("click", doHighlight);
  el.hideDiff.addEventListener("click", closeDiffPanel);
  el.popout.addEventListener("click", popoutDiff);
  el.clear.addEventListener("click", () => {
    el.input.value = "";
    setOutput("");
    clearBadge();
    setStatus("");
    el.file.value = "";
    closeDiffPanel();
  });
  el.file.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) loadFile(f);
  });
  el.loadSample.addEventListener("click", loadSample);
  el.tabI.addEventListener("click", () => setDirection("ios2nxos"));
  el.tabN.addEventListener("click", () => setDirection("nxos2ios"));
  setDirection("ios2nxos");
  setStatus("Ready.");
}

init();
