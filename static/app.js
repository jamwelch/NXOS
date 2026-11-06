"use strict";

// Local IOS <-> NX-OS converter front-end.
// All DOM writes go through textContent / value; the only user-supplied
// text that reaches the DOM is placed in a <textarea> value, which is
// not parsed as HTML.

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
};

const STATE = {
  direction: "ios2nxos",
};

// --- UI helpers -----------------------------------------------------------
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
  el.convert.textContent = i2n ? "Convert \u2192" : "Convert \u2192";
  suggestFilename();
}

// --- API ------------------------------------------------------------------
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

async function doVerify() {
  clearBadge();
  if (!el.input.value.trim()) {
    setStatus("Nothing to verify \u2014 paste or load a config first.", "err");
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

// --- Output destinations --------------------------------------------------
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

// --- Wiring ---------------------------------------------------------------
function init() {
  el.convert.addEventListener("click", doConvert);
  el.verify.addEventListener("click", doVerify);
  el.copy.addEventListener("click", copyOutput);
  el.download.addEventListener("click", triggerDownload);
  el.format.addEventListener("change", suggestFilename);
  el.clear.addEventListener("click", () => {
    el.input.value = "";
    setOutput("");
    clearBadge();
    setStatus("");
    el.file.value = "";
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
