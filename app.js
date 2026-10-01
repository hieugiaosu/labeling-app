// AAC-Bench listening study - static page, talks to Supabase through the RPC functions in
// pipeline/supabase/label_app.sql. Username only (no password): light security by design.
const cfg = window.AAC_CONFIG || {};
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
const BUCKET = cfg.bucket || "aac-bench-audio";
const BATCH = cfg.batchSize || 20;

const $ = (id) => document.getElementById(id);
const views = ["login", "home", "task", "done", "admin"];
// Audio only: the text mode was dropped. Policies hidden for now (same list as _hidden_policies() in
// label_app.sql): the server already leaves their reply options and items out; here they are not displayed,
// and label editing keeps their current value.
const MODE = "audio";
const HIDDEN = ["risk"];
const state = { user: null, admin: null, items: [], pos: 0, total: 0, started: 0, played: false };

function show(name) {
  views.forEach((v) => ($("view-" + v).hidden = v !== name));
  $("who").hidden = !state.user;
  $("who-name").textContent = state.user || "";
  window.scrollTo(0, 0);
}
function busy(on) { $("loading").hidden = !on; }
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
async function rpc(fn, args) {
  busy(true);
  try {
    const { data, error } = await sb.rpc(fn, args || {});
    if (error) throw new Error(error.message);
    return data;
  } finally { busy(false); }
}

// --- login ----------------------------------------------------------------------------------------
async function enter(fn) {
  const name = $("username").value.trim();
  $("login-msg").textContent = "";
  if (!name) { $("login-msg").textContent = "Please type a username."; return; }
  try {
    const r = await rpc(fn, { p_username: name });
    state.user = r.username;
    localStorage.setItem("aac_user", state.user);
    openHome();
  } catch (e) { $("login-msg").textContent = e.message; }
}
$("btn-login").onclick = () => enter("login_annotator");
$("btn-register").onclick = () => enter("register_annotator");
$("username").addEventListener("keydown", (e) => { if (e.key === "Enter") enter("login_annotator"); });
$("logout").onclick = () => {
  localStorage.removeItem("aac_user"); sessionStorage.removeItem("aac_admin");
  state.user = null; state.admin = null; $("t-audio").pause(); show("login");
};
async function adminLogin() {
  $("admin-msg").textContent = "";
  try {
    await rpc("admin_login", { p_password: $("admin-pw").value });
    state.admin = $("admin-pw").value; state.user = "admin";
    sessionStorage.setItem("aac_admin", state.admin);
    openAdmin();
  } catch (e) { $("admin-msg").textContent = e.message; }
}
$("btn-admin").onclick = adminLogin;
$("admin-pw").addEventListener("keydown", (e) => { if (e.key === "Enter") adminLogin(); });

// --- home -----------------------------------------------------------------------------------------
async function openHome() {
  show("home");
  const p = await rpc("my_progress", { p_username: state.user });
  $("p-audio").textContent = p.audio_done;
  $("p-total").textContent = p.total_items;
  $("btn-audio").textContent = p.audio_open ? `Continue batch (${p.audio_open} left)` : `New batch (${BATCH})`;
}
$("btn-audio").onclick = () => startBatch();
$("btn-home").onclick = () => openHome();
$("btn-next").onclick = () => startBatch();

async function startBatch() {
  try {
    const items = await rpc("next_batch", { p_username: state.user, p_mode: MODE, p_size: BATCH });
    if (!items.length) { alert("Nothing left to label - thank you!"); return; }
    Object.assign(state, { items, pos: 0, total: items.length });
    showItem();
  } catch (e) { alert(e.message); }
}

// --- one item -------------------------------------------------------------------------------------
function optionList(container, options, type, name, letters) {
  container.innerHTML = options.map((o) => `
    <label class="opt"><input type="${type}" name="${name}" value="${esc(o.key)}">
      ${letters ? `<span class="key">${esc(o.key)}</span>` : ""}<span>${esc(o.text)}</span></label>`).join("");
  container.querySelectorAll("input").forEach((i) => i.addEventListener("change", refresh));
}

async function showItem() {
  const it = state.items[state.pos];
  show("task");
  $("t-pos").textContent = `Item ${state.pos + 1} of ${state.total}`;
  $("t-bar").style.width = `${(100 * state.pos) / state.total}%`;
  $("t-msg").textContent = "";
  state.played = false;
  // the benchmark's own listening test: one single-choice question per key sound + a catch question
  const trials = it.sound_trials || [];
  $("t-sounds").innerHTML = trials.map((q, i) =>
    `<div class="subq"><h3>${trials.length > 1 ? `Question ${i + 1} of ${trials.length}` : ""}</h3><div class="options" id="t-snd-${i}"></div></div>`).join("");
  trials.forEach((q, i) => optionList($("t-snd-" + i), q.options, "radio", "snd-" + i, true));
  const player = $("t-audio");
  player.removeAttribute("src");
  busy(true);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(it.audio_path, 3600);
  busy(false);
  if (error) { $("t-msg").textContent = "Could not load the audio: " + error.message; }
  else { player.src = data.signedUrl; player.load(); }
  optionList($("t-replies"), it.reply_options, "radio", "reply");
  optionList($("t-delivery"), it.delivery_options, "radio", "delivery");
  state.started = performance.now();
  refresh();
}
$("t-audio").addEventListener("play", () => { state.played = true; refresh(); });

function picked(name) { return [...document.querySelectorAll(`input[name=${name}]:checked`)].map((i) => i.value); }
function soundAnswers() {
  const it = state.items[state.pos], out = {};
  (it.sound_trials || []).forEach((q, i) => { const p = picked("snd-" + i); if (p.length) out[q.id] = p[0]; });
  return out;
}
function refresh() {
  document.querySelectorAll(".opt").forEach((l) => l.classList.toggle("checked", l.querySelector("input").checked));
  const it = state.items[state.pos];
  const soundsOk = Object.keys(soundAnswers()).length === (it.sound_trials || []).length;
  const ok = state.played && soundsOk && picked("reply").length === 1 && picked("delivery").length === 1;
  $("btn-submit").disabled = !ok;
  $("t-audio-hint").hidden = state.played;
}

$("btn-submit").onclick = async () => {
  const it = state.items[state.pos];
  $("btn-submit").disabled = true;
  try {
    await rpc("submit_answer", {
      p_username: state.user, p_item_id: it.item_id, p_mode: MODE,
      p_sound_answers: soundAnswers(),
      p_reply: picked("reply")[0], p_delivery: picked("delivery")[0],
      p_seconds: Math.round((performance.now() - state.started) / 100) / 10,
    });
    $("t-audio").pause();
    state.pos += 1;
    if (state.pos < state.total) showItem();
    else {
      $("done-msg").textContent = `You finished ${state.total} items.`;
      $("btn-next").textContent = `Next batch (${BATCH})`;
      show("done");
    }
  } catch (e) { $("t-msg").textContent = e.message; refresh(); }
};

// --- admin ----------------------------------------------------------------------------------------
function table(rows, cols) {
  if (!rows || !rows.length) return "<p class='hint'>No answers yet.</p>";
  const head = cols.map((c) => `<th>${esc(c[1])}</th>`).join("");
  const body = rows.map((r) => "<tr>" + cols.map(([k]) => {
    const v = r[k];
    return typeof v === "number" ? `<td class="num">${v}</td>` : `<td>${esc(v)}</td>`;
  }).join("") + "</tr>").join("");
  return `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function card(title, html, note) {
  return `<div class="card"><h2>${esc(title)}</h2>${note ? `<p class="hint">${note}</p>` : ""}${html}</div>`;
}
function confusion(rows, policy) {
  const sel = rows.filter((r) => r.policy === policy);
  if (!sel.length) return "";
  const truths = [...new Set(sel.map((r) => r.truth))].sort(), chosen = [...new Set(sel.map((r) => r.chosen))].sort();
  const cell = (t, c) => (sel.find((r) => r.truth === t && r.chosen === c) || {}).n || 0;
  return `<h3>${esc(policy)}</h3><div class="tbl-wrap"><table><thead><tr><th>truth \\ chosen</th>` +
    chosen.map((c) => `<th>${esc(c)}</th>`).join("") + "</tr></thead><tbody>" +
    truths.map((t) => `<tr><td>${esc(t)}</td>` + chosen.map((c) => `<td class="num ${t === c ? "good" : ""}">${cell(t, c)}</td>`).join("") + "</tr>").join("") +
    "</tbody></table></div>";
}

async function openAdmin() {
  show("admin");
  openTab(sessionStorage.getItem("aac_admin_tab") || "overview");
  loadContested();
  let s;
  try { s = await rpc("admin_stats", { p_password: state.admin }); } catch (e) { $("tab-overview").innerHTML = card("Error", esc(e.message)); return; }
  const c = s.coverage || {};
  $("admin-coverage").innerHTML = [
    [c.annotators, "annotators"], [c.items, "items"], [c.audio_items, "items with an answer"],
  ].map(([v, l]) => `<div><b>${v ?? 0}</b><span>${l}</span></div>`).join("");
  const conf = s.confusion || [];
  const policies = ["initiative", "verbosity", "addressee", "risk", "disclosure"].filter((p) => !HIDDEN.includes(p));
  const hiddenNote = HIDDEN.length ? ` Hidden for now: ${HIDDEN.join(", ")} (its reply options and items are not handed out, and it is left out here).` : "";
  $("tab-overview").innerHTML =
    card("Overall", table(s.overall, [["answers", "answers"], ["annotators", "annotators"], ["items", "items"],
      ["reply_exact", "reply = benchmark"], ["delivery_acc", "delivery = benchmark"], ["mean_seconds", "sec / item"]]),
      "reply = benchmark: the chosen reply is the one the benchmark labels ask for (every policy right)." + hiddenNote) +
    card("Per policy", table(s.per_policy, [["policy", "policy"], ["answers", "answers"], ["accuracy", "agrees with benchmark"]])) +
    "";
  $("tab-details").innerHTML =
    card("Per level", table(s.per_level, [["policy", "policy"], ["level", "true level"], ["answers", "answers"], ["accuracy", "chosen = true"]]),
      "The non-default levels (Notify, Interrupt, Brief, Quiet, Loud, Yield, Confirm, Discreet) are the ones that test context use.") +
    "";
  $("tab-overview").innerHTML +=
    card("Perception (audio)", table(s.sound ? [s.sound] : [], [["answers", "answers"], ["derived", "converted from old answers"],
      ["key_questions", "key questions"], ["key_recognised", "key sound recognised"], ["all_keys_heard", "all key sounds of the item"],
      ["catch_questions", "catch questions"], ["catch_correct", "'none' right on catch"]]),
      "The same listening test as the models (benchmark perception, mixture). A person answers each question once; a model 4 times, key rotated over A-D. " +
      "Converted answers: from the old tick-all question - key ticked = recognised, not ticked = E; catch questions only where an absent sound was ticked.") +
    "";
  $("tab-details").innerHTML +=
    card("Key sounds by class", table(s.sound_by_class, [["klass", "sound class"], ["heard_of", "answers"], ["recognised", "recognised"]])) +
    "";
  $("tab-details").innerHTML +=
    card("Confusion", policies.map((p) => confusion(conf, p)).join("") +
      "<h3>delivery</h3>" + table(s.delivery_confusion, [["truth", "truth"], ["chosen", "chosen"], ["n", "n"]])) +
    card("By section", table(s.by_section, [["section", "section"], ["answers", "answers"], ["reply_exact", "reply = benchmark"], ["delivery_acc", "delivery"]])) +
    card("By annotator", table(s.by_user, [["username", "user"], ["answers", "answers"], ["reply_exact", "reply = benchmark"],
      ["delivery_acc", "delivery"], ["mean_seconds", "sec / item"]]));
}
// --- contested scenarios + label editing -----------------------------------------------------------
const LEVELS = {
  initiative: ["Normal", "Notify", "Interrupt"], verbosity: ["Normal", "Brief"], delivery: ["Normal", "Quiet", "Loud"],
  addressee: ["Respond", "Confirm", "Yield"], risk: ["Normal", "Caution"], disclosure: ["Full", "Discreet"],
};
const POLICIES = Object.keys(LEVELS).filter((p) => !HIDDEN.includes(p));   // shown / editable

async function loadContested() {
  let rows;
  try { rows = await rpc("admin_contested", { p_password: state.admin }); } catch (e) { $("admin-contested").innerHTML = `<p class="msg">${esc(e.message)}</p>`; return; }
  if (!rows.length) { $("admin-contested").innerHTML = "<p class='hint'>No answers yet.</p>"; return; }
  const head = "<tr><th>scenario</th><th>answers</th>" + POLICIES.map((p) => `<th>${p}</th>`).join("") + "<th></th></tr>";
  const body = rows.map((r) => {
    const cells = POLICIES.map((p) => {
      const x = r.policies[p] || {};
      const hot = x.disagree >= 0.5 && x.human !== x.truth;
      return `<td class="${hot ? "hot" : ""}" title="label: ${esc(x.truth)} | most chosen: ${esc(x.human)}">${esc(x.truth)}` +
        (x.disagree > 0 ? ` <small>(${Math.round(100 * x.disagree)}% -> ${esc(x.human)})</small>` : "") + "</td>";
    }).join("");
    return `<tr class="${r.override ? "changed" : ""}"><td><b>${esc(r.bench_id)}</b><br><small>${esc(r.section)}</small>` +
      (r.override ? "<br><small>edited</small>" : "") + `</td><td class="num">${r.answers}</td>${cells}` +
      `<td><button class="secondary" data-edit="${esc(r.bench_id)}">Edit labels</button> ` +
      `<button class="link" data-explore="${esc(r.bench_id)}">Answers</button></td></tr>`;
  }).join("");
  $("admin-contested").innerHTML = `<div class="tbl-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openEdit(b.dataset.edit)));
  document.querySelectorAll("[data-explore]").forEach((b) => (b.onclick = () => {
    openTab("answers"); explore(b.dataset.explore);
  }));
}

async function openEdit(benchId) {
  benchId = (benchId || "").trim().toUpperCase();
  if (!benchId) return;
  const sc = await rpc("admin_scenario", { p_password: state.admin, p_bench_id: benchId });
  if (!sc.labels) { alert(`No scenario ${benchId}.`); return; }
  const orig = sc.override ? sc.override.original : sc.labels;
  $("edit-modal").hidden = false;
  $("edit-box").innerHTML = `<div class="edit">
    <div class="row between"><h3>${esc(benchId)} <small>${esc(sc.section)} - ${sc.items} variants</small></h3>
      <button class="link" id="edit-close">Close</button></div>
    <details open><summary>Listen to the variants (${(sc.variants || []).length})</summary>
      <div class="variants">${(sc.variants || []).map((v) => `<div class="variant">
        <b>${esc(v.sample_id)}</b> <small>${v.answers} answer(s)</small> ${listenButton(v.audio_path)}
        <details><summary>situation</summary><p class="situation">${esc(v.situation)}</p></details></div>`).join("")}</div>
    </details>
    <div class="grid">${POLICIES.map((p) => `<label>${p}<select data-pol="${p}">` +
      LEVELS[p].map((l) => `<option ${sc.labels[p] === l ? "selected" : ""}>${l}</option>`).join("") +
      `</select><small class="hint">original: ${esc(orig[p])}</small></label>`).join("")}</div>
    <label>Why (kept with the change)<textarea id="edit-note" rows="2">${esc(sc.override ? sc.override.note : "")}</textarea></label>
    <div class="row"><button id="edit-save">Save labels</button>
      ${sc.override ? '<button class="secondary" id="edit-undo">Back to original</button>' : ""}
      <span id="edit-msg" class="msg"></span></div></div>`;
  $("edit-close").onclick = closeEdit;
  wireListen($("edit-box"));
  $("edit-save").onclick = async () => {
    const labels = { ...sc.labels };            // hidden policies keep their current level
    document.querySelectorAll("#edit-box select").forEach((s) => (labels[s.dataset.pol] = s.value));
    try {
      await rpc("admin_set_label", { p_password: state.admin, p_bench_id: benchId, p_labels: labels, p_note: $("edit-note").value });
      closeEdit(); openAdmin();
    } catch (e) { $("edit-msg").textContent = e.message; }
  };
  if (sc.override) $("edit-undo").onclick = async () => {
    try { await rpc("admin_clear_label", { p_password: state.admin, p_bench_id: benchId }); closeEdit(); openAdmin(); }
    catch (e) { $("edit-msg").textContent = e.message; }
  };
}
function closeEdit() { $("edit-modal").hidden = true; document.querySelectorAll("#edit-box audio").forEach((a) => a.pause()); }
$("edit-modal").addEventListener("click", (e) => { if (e.target === $("edit-modal")) closeEdit(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEdit(); });

// --- listening from the admin page: audio loads only when asked -------------------------------------
function listenButton(path) {
  return path ? `<button class="link" data-listen="${esc(path)}">&#9654; Listen</button><span class="player"></span>` : "";
}
function wireListen(root) {
  root.querySelectorAll("[data-listen]").forEach((b) => (b.onclick = async () => {
    const slot = b.nextElementSibling;
    if (slot.querySelector("audio")) { slot.innerHTML = ""; return; }      // second click closes it
    document.querySelectorAll(".player audio").forEach((a) => a.pause());
    busy(true);
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(b.dataset.listen, 3600);
    busy(false);
    slot.innerHTML = error ? `<span class="msg">${esc(error.message)}</span>`
      : `<audio controls autoplay src="${esc(data.signedUrl)}"></audio>`;
  }));
}

// --- admin tabs ------------------------------------------------------------------------------------
function openTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  ["overview", "contested", "answers", "details"].forEach((t) => ($("tab-" + t).hidden = t !== name));
  sessionStorage.setItem("aac_admin_tab", name);
}
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
// --- answers explorer ------------------------------------------------------------------------------
const tags = (labels, truth) => POLICIES.filter((p) => labels && labels[p] !== undefined)
  .map((p) => `<span class="tag ${truth && truth[p] !== labels[p] ? "off" : ""}" title="${p}">${esc(labels[p])}</span>`).join("");

async function explore(filter) {
  $("ex-filter").value = filter || "";
  let rows;
  try { rows = await rpc("admin_answers", { p_password: state.admin, p_filter: filter || "" }); }
  catch (e) { $("explorer").innerHTML = `<p class="msg">${esc(e.message)}</p>`; return; }
  if (!rows.length) { $("explorer").innerHTML = "<p class='hint'>No answers match.</p>"; return; }
  const bySample = {};
  rows.forEach((r) => (bySample[r.sample_id] = bySample[r.sample_id] || []).push(r));
  $("explorer").innerHTML = `<p class="hint">${rows.length} answers on ${Object.keys(bySample).length} samples.</p>` +
    Object.entries(bySample).map(([sid, ans]) => {
      const truth = ans[0].labels;
      const majority = ((m) => {       // the reply most people chose
        const count = {};
        m.forEach((a) => (count[a.reply_key] = (count[a.reply_key] || 0) + 1));
        const [key, n] = Object.entries(count).sort((x, y) => y[1] - x[1])[0];
        const top = m.find((a) => a.reply_key === key);
        const dcount = {};
        m.forEach((a) => (dcount[a.delivery] = (dcount[a.delivery] || 0) + 1));
        const [dkey, dn] = Object.entries(dcount).sort((x, y) => y[1] - x[1])[0];
        const missed = m.filter((a) => a.missed_key && a.missed_key.length).length;
        return `<div>${m.length} answer(s); most chose ${key === top.best_reply ? "<span class='good'>the benchmark reply</span>" : "<span class='bad'>another reply</span>"}
          (${n}/${m.length}) ${tags(top.reply_labels, truth)} delivery ${esc(dkey)} (${dn}/${m.length})` +
          ` - key sound missed by ${missed}/${m.length}` +
          `<br><small>"${esc(top.reply_text)}"</small></div>`;
      })(ans);
      const list = table(ans.map((a) => ({
        user: a.username, reply: `${a.reply_key}${a.reply_key === a.best_reply ? " *" : ""}`,
        labels: POLICIES.map((p) => (a.reply_labels || {})[p]).filter(Boolean).join("/"),
        delivery: a.delivery, heard: (a.heard || []).join("; ") || "(none)",
        missed: (a.missed_key || []).join("; ") || "-", sec: a.seconds, conv: a.sound_derived ? "yes" : "", audio: a.current_audio ? "current" : "OLD",
      })), [["user", "user"], ["reply", "reply (* = benchmark)"], ["labels", "reply means"],
            ["delivery", "delivery"], ["heard", "sounds chosen"], ["missed", "key sound missed"], ["conv", "converted"], ["sec", "sec"], ["audio", "audio"]]);
      return `<div class="sample"><b>${esc(sid)}</b> <small>${esc(ans[0].section)}</small> ${listenButton(ans[0].audio_path)}
        <details><summary>scene description</summary><p class="situation">${esc(ans[0].situation)}</p></details>
        <div>benchmark: ${tags(truth)} delivery <span class="tag">${esc(truth.delivery)}</span></div>${majority}${list}</div>`;
    }).join("");
  wireListen($("explorer"));
}
$("btn-explore").onclick = () => explore($("ex-filter").value.trim());
$("ex-filter").addEventListener("keydown", (e) => { if (e.key === "Enter") explore($("ex-filter").value.trim()); });

$("btn-edit-any").onclick = () => openEdit($("edit-id").value);
$("edit-id").addEventListener("keydown", (e) => { if (e.key === "Enter") openEdit($("edit-id").value); });

$("btn-refresh").onclick = () => openAdmin();
$("btn-export").onclick = async () => {
  const rows = await rpc("admin_export", { p_password: state.admin });
  if (!rows.length) { alert("No answers yet."); return; }
  const flat = rows.map((r) => ({
    ...r, reply_labels: JSON.stringify(r.reply_labels), truth: JSON.stringify(r.truth), sounds: JSON.stringify(r.sounds),
    sound_true: JSON.stringify(r.sound_true), sound_critical: JSON.stringify(r.sound_critical),
    sound_answers: JSON.stringify(r.sound_answers), sound_trials: JSON.stringify(r.sound_trials),
  }));
  const cols = Object.keys(flat[0]);
  const csv = [cols.join(",")].concat(flat.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `aac_bench_answers_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};

// --- start ----------------------------------------------------------------------------------------
if (!cfg.supabaseUrl || !cfg.supabaseKey) {
  document.querySelector("main").innerHTML = "<div class='card'><h1>Not configured</h1><p>Fill in config.js (Supabase URL and publishable key).</p></div>";
} else {
  const saved = localStorage.getItem("aac_user"), admin = sessionStorage.getItem("aac_admin");
  if (admin) {
    state.admin = admin; state.user = "admin";
    rpc("admin_login", { p_password: admin }).then(openAdmin).catch(() => { sessionStorage.removeItem("aac_admin"); show("login"); });
  } else if (saved) {
    $("username").value = saved;
    rpc("login_annotator", { p_username: saved })
      .then((r) => { state.user = r.username; openHome(); })
      .catch(() => show("login"));
  } else show("login");
}
