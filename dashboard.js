import {parseExport, normalizeUsername, mergeRows, counts, startBlockReason} from "./core.js";
import {verifyAccount} from "./verification.js";
import {activeRun} from "./queue.js";
const $ = id => document.getElementById(id);
const api = globalThis.chrome;
let state = {rows: [], owners: [], account: "", interval: 30}, verified = null, runner = null, running = false, page = 0, ready = false, verifying = false;
let writes = Promise.resolve();
async function command(message) {
  const response = await api.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "Background worker did not respond. Reload the extension and reopen the dashboard.");
  return response.state;
}
function receive(saved) {
  if ((saved.revision || 0) < (state.revision || 0)) return;
  state = saved; running = activeRun(state);
  if (state.run?.message) status(state.run.message);
  render();
}
const save = () => {
  const snapshot = structuredClone(state);
  writes = writes.catch(() => {}).then(async () => {
    const saved = await command({type: "edit", state: snapshot, revision: state.revision || 0});
    receive(saved);
  });
  return writes;
};
const status = message => {
  $("status").textContent = message;
  $("runStatus").textContent = message;
};
const startReason = () => startBlockReason({ready, running, verifying, verified: !!verified,
  confirmed: $("confirm").checked, pending: counts(state.rows).pending, interval: Number($("interval").value)});
const report = error => status(error.message || String(error));
const filtered = () => state.rows.filter(row => row.username.includes($("search").value.trim().toLowerCase().replace(/^@/, "")) &&
  ($("filter").value === "all" || ($("filter").value === "done" ? ["blocked", "already-blocked"].includes(row.status) : row.status === $("filter").value)));
function render() {
  const n = counts(state.rows);
  for (const key of ["total", "pending", "done", "failed"]) $(key).textContent = n[key].toLocaleString();
  $("bar").style.width = `${n.total ? n.done / n.total * 100 : 0}%`;
  $("start").disabled = running || verifying || !ready;
  $("startHint").textContent = running ? "Run in progress. Use Pause to stop subsequent actions." : startReason();
  $("pause").hidden = !running;
  for (const id of ["connect", "account", "interval", "files", "clear", "confirm", "selectAll"]) $(id).disabled = running;
  for (const id of ["connect", "account", "files", "clear"]) $(id).disabled = running || verifying;
  $("connect").textContent = verifying ? "Verifying account…" : "Open Instagram & verify account ↗";
  $("start").firstChild.textContent = running ? "Running in background " : n.done ? "Resume automatic blocking " : "Start automatic blocking ";
  const rows = filtered(); const pages = Math.max(1, Math.ceil(rows.length / 50)); page = Math.min(page, pages - 1);
  const shown = rows.slice(page * 50, (page + 1) * 50);
  $("pageInfo").textContent = rows.length ? `${page * 50 + 1}–${Math.min((page + 1) * 50, rows.length)} of ${rows.length}` : "0 accounts";
  $("previous").disabled = page === 0; $("next").disabled = page >= pages - 1;
  const selectable = shown.filter(r => r.status === "pending");
  $("selectAll").checked = selectable.length > 0 && selectable.every(r => r.selected);
  $("selectAll").indeterminate = selectable.some(r => r.selected) && !$("selectAll").checked;
  $("list").replaceChildren();
  if (!shown.length) {
    const box = document.createElement("div"); box.className = "empty";
    const heading = document.createElement("h3"); heading.textContent = state.rows.length ? "No matching accounts." : "A fresh start begins here.";
    const note = document.createElement("p"); note.textContent = state.rows.length ? "Try another search or filter." : "Your imported connections will appear in this space.";
    box.append(heading, note); $("list").append(box);
  }
  for (const row of shown) {
    const el = document.createElement("div"); el.className = "row";
    const check = document.createElement("input"); check.type = "checkbox"; check.checked = row.selected;
    check.disabled = running || row.status !== "pending"; check.setAttribute("aria-label", `Select @${row.username}`);
    check.onchange = async () => { row.selected = check.checked; $("confirm").checked = false; await save(); render(); };
    const avatar = document.createElement("span"); avatar.className = "avatar"; avatar.textContent = row.username[0].toUpperCase();
    const info = document.createElement("div"); info.className = "row-info";
    const link = document.createElement("a"); link.href = `https://www.instagram.com/${row.username}/`; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = `@${row.username}`;
    info.append(link);
    if (row.detail) { const detail = document.createElement("div"); detail.className = "detail"; detail.textContent = row.detail; info.append(detail); }
    const badge = document.createElement("span"); badge.className = `badge ${row.status}`;
    badge.textContent = ({"already-blocked": "Already blocked", failed: "Needs review", blocking: "In progress", blocked: "Blocked", pending: row.selected ? "Queued" : "Excluded"})[row.status];
    el.append(check, avatar, info, badge);
    if (row.status === "failed") {
      const retry = document.createElement("button"); retry.className = "quiet"; retry.textContent = "Retry"; retry.disabled = running;
      retry.onclick = async () => { row.status = "pending"; row.detail = ""; delete row.failure; row.selected = true; $("confirm").checked = false; await save(); render(); };
      el.append(retry);
    }
    $("list").append(el);
  }
}
async function importFiles(files) {
  if (running || verifying || !ready) return;
  const validFiles = [...files]; let imported = 0;
  let stagedRows = state.rows, stagedOwners = state.owners;
  for (const file of validFiles) {
    if (!/\.html?$/i.test(file.name)) throw new Error("Choose the original .html files from your Instagram export.");
    if (file.size > 25 * 1024 * 1024) throw new Error("Each file must be under 25 MB.");
    const parsed = parseExport(await file.text(), document);
    if (!parsed.usernames.length) throw new Error("No Instagram profile links found. Use the original followers/following HTML file.");
    const before = stagedRows.length;
    stagedRows = mergeRows(stagedRows, parsed.usernames);
    stagedOwners = [...new Set([...stagedOwners, ...parsed.owners])];
    imported += stagedRows.length - before;
  }
  state.rows = stagedRows; state.owners = stagedOwners;
  // Imported owners cannot be the destination account.
  if (verified && state.owners.includes(verified.account)) { verified = null; $("accountStatus").textContent = "The destination matches an export's original account. Choose your new account."; }
  $("confirm").checked = false; page = 0;
  await save(); render();
  $("importStatus").textContent = `Added ${imported} unique accounts. ${state.rows.length} total. Duplicate links merged.`;
  status("Review your list, verify your new account, then start.");
}
$("files").onchange = () => importFiles($("files").files).catch(report);
for (const event of ["dragover", "dragleave", "drop"]) $("drop").addEventListener(event, e => {
  e.preventDefault(); $("drop").classList.toggle("drag", event === "dragover");
  if (event === "drop") importFiles(e.dataTransfer.files).catch(report);
});
$("account").oninput = () => { verified = null; $("confirm").checked = false; $("accountStatus").textContent = "Verify this account before starting."; render(); };
$("connect").onclick = async () => {
  if (running || verifying || !ready) return;
  verifying = true; verified = null; render();
  $("accountStatus").textContent = "Checking your signed-in Instagram account…";
  status("Verifying account…");
  try {
    const account = normalizeUsername($("account").value);
    if (!account) throw new Error("Enter a valid new account username.");
    if (state.owners.includes(account)) throw new Error("This is the account that generated an imported export. Enter your new account instead.");
    if (state.account && state.account !== account && state.rows.some(r => r.status !== "pending")) throw new Error("This progress belongs to another destination account. Export progress and clear data before changing accounts.");
    verified = await verifyAccount(api, account); state.account = account;
    await save(); $("accountStatus").textContent = `Verified @${account}. Checked again before every blocking step.`;
    status(`Ready to block from @${account}. Review your selections below.`); render();
  } catch (error) {
    verified = null;
    $("accountStatus").textContent = `Verification failed: ${error.message || String(error)}`;
    report(error);
  } finally { verifying = false; render(); }
};
$("confirm").onchange = render;
$("interval").oninput = render;
$("search").oninput = () => {page = 0; render();}; $("filter").onchange = () => {page = 0; render();};
$("previous").onclick = () => {page--; render();}; $("next").onclick = () => {page++; render();};
$("selectAll").onchange = async () => { for (const row of filtered().slice(page * 50, (page + 1) * 50)) if (row.status === "pending") row.selected = $("selectAll").checked; $("confirm").checked = false; await save(); render(); };
$("pause").onclick = async () => {
  status("Pausing the background run…");
  try { receive(await command({type: "pause"})); } catch (error) { report(error); }
};
$("start").onclick = async () => {
  const reason = startReason();
  if (reason) { status(reason); return; }
  status("Starting background run…");
  $("start").disabled = true;
  try {
    await writes;
    receive(await command({type: "start", account: verified.account, tabId: verified.tabId,
      interval: Number($("interval").value), confirmed: $("confirm").checked, revision: state.revision || 0}));
    $("confirm").checked = false;
  } catch (error) { report(error); }
  finally { render(); }
};
$("clear").onclick = async () => {
  if (running || !confirm("Delete all locally saved usernames and progress? This does not unblock anyone on Instagram.")) return;
  state = {rows: [], owners: [], account: "", interval: 30, revision: state.revision || 0}; verified = null;
  await save(); $("account").value = ""; $("files").value = ""; $("confirm").checked = false; $("interval").value = 30;
  $("importStatus").textContent = "Local data cleared."; $("accountStatus").textContent = "No account verified.";
  status("Import your files to get started."); render();
};
$("export").onclick = () => {
  const blob = new Blob([JSON.stringify({version: 1, exportedAt: new Date().toISOString(), account: state.account, rows: state.rows}, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "fresh-start-progress.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function init() {
  if (!api?.storage?.local || !api?.runtime?.sendMessage) {
    status("Load the extension in Chrome to use Fresh Start. See README for setup.");
    for (const el of document.querySelectorAll("button,input,select")) el.disabled = true;
    return;
  }
  await api.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.freshStart?.newValue) receive(changes.freshStart.newValue);
  });
  state = await command({type: "snapshot"});
  $("account").value = state.account;
  $("interval").value = Math.max(10, state.interval || 30);
  running = activeRun(state);
  status(state.run?.message || (state.rows.length ? "Progress restored. Verify your account to resume." : "Import your files to get started."));
  render();
}
// Hold one dashboard writer for its full lifetime, including imports and recovery.
if (api?.storage?.local) {
  navigator.locks.request("fresh-start-dashboard", {ifAvailable: true}, async lock => {
    if (!lock) {
      status("Fresh Start is already open in another tab. Use that dashboard or close it and reload this one.");
      for (const el of document.querySelectorAll("button,input,select")) el.disabled = true;
      return;
    }
    await init();
    ready = true; render();
    await new Promise(() => {});
  }).catch(report);
} else init().catch(report);
