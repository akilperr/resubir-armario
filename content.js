// Resubir Armario — extensión no oficial para resubir artículos en Vinted (selección múltiple + resubida escalonada)
//
// Cómo funciona la cola:
//  - Eliges artículos en el panel y pulsas "Empezar".
//  - La cola se guarda en el navegador. Mientras tengas abierta AL MENOS UNA pestaña de Vinted,
//    se va resubiendo un artículo cada X minutos (con un poco de variación aleatoria).
//  - Si cierras todas las pestañas de Vinted, la cola se pausa y sigue cuando vuelvas a abrir una.

(() => {
  const ORIGIN = location.origin;
  const K = { queue: "vr_queue", backups: "vr_backups", lock: "vr_lock", count: "vr_count" };
  const TAB_ID = crypto.randomUUID();

  const SKIP_FIELDS = new Set([
    "id", "photos", "user", "user_id", "created_at", "updated_at", "url", "path",
    "favourite_count", "view_count", "is_draft", "is_closed", "is_hidden",
    "is_reserved", "is_processing", "can_edit", "can_delete", "promoted",
    "push_up", "conversion", "service_fee", "total_item_price", "discount",
    "offline_verification", "badge", "stats_visible", "can_push_up"
  ]);

  // ================= utilidades =================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get: async (k, def) => (await chrome.storage.local.get(k))[k] ?? def,
    set: (k, v) => chrome.storage.local.set({ [k]: v }),
    del: (k) => chrome.storage.local.remove(k)
  };

  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta?.content) return meta.content;
    const m = document.documentElement.innerHTML.match(/"CSRF_TOKEN\\?":\\?"([^"\\]+)/);
    return m ? m[1] : null;
  }

  async function api(path, opts = {}) {
    const h = { accept: "application/json, text/plain, */*", "x-csrf-token": csrfToken() || "", ...(opts.headers || {}) };
    const anon = getCookie("anon_id");
    if (anon) h["x-anon-id"] = anon;
    const res = await fetch(ORIGIN + path, { credentials: "include", ...opts, headers: h });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok || (data && data.code && data.code !== 0)) {
      const msg = data?.message || data?.errors?.map?.((e) => e.value || e.field).join(", ") || res.status;
      const err = new Error(`${path} → ${msg}`);
      err.status = res.status;
      err.auth = res.status === 401 || /authori[sz]|unauthori[sz]ed|authentication|token/i.test(String(msg));
      throw err;
    }
    return data;
  }

  const itemIdFromUrl = () => location.pathname.match(/\/items\/(\d+)/)?.[1] || null;
  const memberIdFromUrl = () => location.pathname.match(/\/member\/(\d+)/)?.[1] || null;

  // ================= resubir un artículo =================
  async function fetchItem(id) {
    try {
      const d = await api(`/api/v2/item_upload/items/${id}`);
      if (d.item) return d.item;
    } catch (e) { if (e.auth) throw e; /* si no, uso el público */ }
    return (await api(`/api/v2/items/${id}?localize=false`)).item;
  }

  function photoUrl(p) {
    return p.full_size_url || p.url || p.high_resolution?.url ||
      (p.thumbnails || []).sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
  }

  async function downloadPhoto(url) {
    const r = await chrome.runtime.sendMessage({ type: "vr_fetch_photo", url });
    if (!r?.ok) throw new Error("No se pudo descargar una foto: " + (r?.error || "?"));
    const bin = atob(r.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: r.type });
  }

  async function uploadPhoto(blob, tempUuid) {
    const fd = new FormData();
    fd.append("photo[type]", "item");
    fd.append("photo[file]", blob, "photo.jpg");
    fd.append("photo[temp_uuid]", tempUuid);
    const d = await api("/api/v2/photos", { method: "POST", body: fd });
    return d.id ?? d.photo?.id;
  }

  function buildPayload(item, photoIds, tempUuid) {
    const f = {};
    for (const [k, v] of Object.entries(item)) if (!SKIP_FIELDS.has(k)) f[k] = v;
    if (f.price && typeof f.price === "object") {
      f.currency = f.price.currency_code || f.currency;
      f.price = Number(f.price.amount);
    }
    if (item.brand_dto?.id && !f.brand_id) f.brand_id = item.brand_dto.id;
    if (f.brand && typeof f.brand === "object") f.brand = f.brand.title;
    if (!f.color_ids) f.color_ids = [item.color1_id, item.color2_id].filter(Boolean);
    return {
      item: { ...f, id: null, temp_uuid: tempUuid, assigned_photos: photoIds.map((id) => ({ id, orientation: 0 })) },
      feedback_id: null, push_up: false, parcel: null, upload_session_id: tempUuid
    };
  }

  const createItem = async (payload) =>
    (await api("/api/v2/item_upload/items", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
    })).item;

  async function saveBackup(oldId, payload, title) {
    const b = await store.get(K.backups, {});
    b[oldId] = { payload, title, origin: ORIGIN, at: Date.now() };
    await store.set(K.backups, b);
  }
  async function dropBackup(oldId) {
    const b = await store.get(K.backups, {});
    delete b[oldId];
    await store.set(K.backups, b);
  }

  async function relistOne(id, log) {
    // Si ya se borró el antiguo en un intento anterior (p. ej. caducó la sesión justo después),
    // publico directamente desde la copia guardada en vez de intentar leer un artículo que ya no existe.
    const bk = (await store.get(K.backups, {}))[id];
    if (bk && bk.origin === ORIGIN) {
      log(`«${bk.title}»: publicando desde la copia guardada…`);
      const created = await createItem(bk.payload);
      await dropBackup(id);
      await store.set(K.count, (await store.get(K.count, 0)) + 1);
      return { title: bk.title, newId: created?.id };
    }
    log(`Leyendo artículo ${id}…`);
    const item = await fetchItem(id);
    if (!item?.photos?.length) throw new Error("No se han podido leer las fotos.");
    if (item.is_reserved || item.is_closed) throw new Error("Está reservado o vendido; lo salto.");
    const title = item.title || id;

    const tempUuid = crypto.randomUUID();
    const photoIds = [];
    for (let i = 0; i < item.photos.length; i++) {
      log(`«${title}»: foto ${i + 1}/${item.photos.length}`);
      photoIds.push(await uploadPhoto(await downloadPhoto(photoUrl(item.photos[i])), tempUuid));
      await sleep(500);
    }
    const payload = buildPayload(item, photoIds, tempUuid);
    await saveBackup(id, payload, title);

    log(`«${title}»: borrando el antiguo…`);
    await api(`/api/v2/items/${id}/delete`, { method: "POST" });
    await sleep(2000);

    log(`«${title}»: publicando…`);
    const created = await createItem(payload);
    await dropBackup(id);
    await store.set(K.count, (await store.get(K.count, 0)) + 1);
    return { title, newId: created?.id };
  }

  async function retryBackups(log) {
    const b = await store.get(K.backups, {});
    const ids = Object.keys(b).filter((id) => b[id].origin === ORIGIN);
    if (!ids.length) return log("No hay publicaciones pendientes.");
    for (const id of ids) {
      try {
        log(`Reintentando «${b[id].title}»…`);
        await createItem(b[id].payload);
        await dropBackup(id);
        await store.set(K.count, (await store.get(K.count, 0)) + 1);
        log(`«${b[id].title}» publicado ✔`, "ok");
      } catch (e) { log(`Error: ${e.message}`, "err"); }
      await sleep(3000);
    }
  }

  // ================= cargar armario =================
  async function currentUserId() {
    const fromUrl = memberIdFromUrl();
    if (fromUrl) return fromUrl;
    for (const p of ["/api/v2/users/current", "/api/v2/users/me"]) {
      try { const d = await api(p); if (d.user?.id) return String(d.user.id); } catch { }
    }
    return null;
  }

  async function loadWardrobe(userId) {
    const all = [];
    for (let page = 1; page <= 30; page++) {
      const d = await api(`/api/v2/wardrobe/${userId}/items?page=${page}&per_page=96&order=relevance`);
      all.push(...(d.items || []));
      const total = d.pagination?.total_pages || 1;
      if (page >= total) break;
      await sleep(400);
    }
    return all.filter((i) => !i.is_closed && !i.is_reserved && !i.is_draft && !i.is_hidden);
  }

  // ================= cola escalonada =================
  // queue = { items:[{id,title}], intervalMin, nextAt, running, done:n, failed:n, log:[...] }
  async function getQueue() { return store.get(K.queue, null); }

  async function acquireLock() {
    const l = await store.get(K.lock, null);
    if (l && l.until > Date.now() && l.tab !== TAB_ID) return false;
    await store.set(K.lock, { tab: TAB_ID, until: Date.now() + 3 * 60 * 1000 });
    await sleep(300);
    return (await store.get(K.lock, null))?.tab === TAB_ID; // por si otra pestaña ganó
  }
  const releaseLock = () => store.del(K.lock);

  async function qlog(msg, cls = "") {
    const q = await getQueue();
    if (!q) return;
    q.log = [...(q.log || []), { t: Date.now(), msg, cls }].slice(-60);
    await store.set(K.queue, q);
  }

  let working = false;
  async function tick() {
    if (working) return;
    const q = await getQueue();
    if (!q?.running || !q.items.length || Date.now() < q.nextAt) return;
    if (!csrfToken()) return; // esta pestaña no tiene sesión; que lo haga otra
    if (!(await acquireLock())) return;
    working = true;
    const next = q.items[0];
    try {
      const r = await relistOne(next.id, (m) => qlog(m));
      await qlog(`«${r.title}» resubido ✔`, "ok");
      await finishStep(true);
    } catch (e) {
      console.error("[Resubir Armario]", e);
      if (e.auth && (await authRetries(next.id)) < MAX_AUTH_RELOADS) {
        // Sesión caducada: no cuento el fallo. Recargo la pestaña (Vinted renueva el token al cargar)
        // y el mismo artículo se reintenta en cuanto vuelva a estar disponible.
        await bumpAuthRetries(next.id);
        await qlog(`Sesión de Vinted caducada; recargo la pestaña y reintento «${next.title}»…`);
        setTimeout(() => location.reload(), 1500);
        return;
      }
      await qlog(`«${next.title}»: ${e.message}`, "err");
      await finishStep(false);
    } finally {
      working = false;
      await releaseLock();
    }
  }

  // Cuántas recargas por sesión caducada llevamos para un mismo artículo (evita bucles de recarga)
  const MAX_AUTH_RELOADS = 3;
  async function authRetries(id) {
    const r = await store.get("vr_auth_retry", null);
    return r?.id === String(id) ? r.n : 0;
  }
  async function bumpAuthRetries(id) {
    await store.set("vr_auth_retry", { id: String(id), n: (await authRetries(id)) + 1 });
  }

  async function finishStep(ok) {
    await store.del("vr_auth_retry");
    const q = await getQueue();
    q.items.shift();
    ok ? q.done++ : q.failed++;
    const jitter = 0.8 + Math.random() * 0.4; // ±20 %
    q.nextAt = Date.now() + q.intervalMin * 60000 * jitter;
    if (!q.items.length) { q.running = false; q.log.push({ t: Date.now(), msg: "Cola terminada 🎉", cls: "ok" }); }
    await store.set(K.queue, q);
  }

  setInterval(tick, 5000);

  // ================= interfaz =================
  let launcher, panel;
  let wardrobe = [];

  function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

  function mountLauncher() {
    if (launcher) return;
    launcher = el(`<button id="vr-launch" title="Resubir Armario">🔁</button>`);
    launcher.onclick = () => (panel ? closePanel() : openPanel());
    document.body.appendChild(launcher);
  }

  function closePanel() { panel?.remove(); panel = null; }

  function openPanel() {
    panel = el(`
      <div id="vr-panel">
        <div class="vr-head"><strong>Resubir Armario</strong><span id="vr-x">✕</span></div>
        <div id="vr-single"></div>
        <div class="vr-sec">
          <button id="vr-load">Cargar mis artículos</button>
          <div id="vr-listwrap" style="display:none">
            <div class="vr-row">
              <label><input type="checkbox" id="vr-all"> Todos</label>
              <span id="vr-sel">0 seleccionados</span>
            </div>
            <div id="vr-list"></div>
            <div class="vr-row">
              <label>Cada <input type="number" id="vr-min" min="1" value="5"> min</label>
              <button id="vr-start" class="vr-small">Empezar</button>
            </div>
          </div>
        </div>
        <div class="vr-sec" id="vr-qbox"></div>
        <button id="vr-retry" class="vr-secondary" style="display:none">Reintentar publicaciones pendientes</button>
        <div id="vr-log"></div>
      </div>`);
    document.body.appendChild(panel);
    panel.querySelector("#vr-x").onclick = closePanel;
    panel.querySelector("#vr-load").onclick = onLoad;
    panel.querySelector("#vr-all").onchange = (e) => {
      panel.querySelectorAll(".vr-it input").forEach((c) => (c.checked = e.target.checked));
      updateSel();
    };
    panel.querySelector("#vr-start").onclick = onStart;
    panel.querySelector("#vr-retry").onclick = () => retryBackups(plog).then(render);

    const single = itemIdFromUrl();
    if (single) {
      const b = el(`<button>Resubir este artículo ahora</button>`);
      b.onclick = async () => {
        if (!confirm("Se borrará este anuncio y se publicará de nuevo. ¿Continuar?")) return;
        b.disabled = true;
        try {
          const r = await relistOne(single, plog);
          plog(`«${r.title}» resubido ✔`, "ok");
          if (r.newId) setTimeout(() => (location.href = `${ORIGIN}/items/${r.newId}`), 1200);
        } catch (e) { plog("Error: " + e.message, "err"); }
        b.disabled = false; render();
      };
      panel.querySelector("#vr-single").appendChild(b);
    }
    render();
  }

  function plog(msg, cls = "") {
    const box = panel?.querySelector("#vr-log");
    if (!box) return;
    const d = document.createElement("div");
    d.textContent = msg; if (cls) d.className = cls;
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }

  async function onLoad() {
    const btn = panel.querySelector("#vr-load");
    btn.disabled = true; btn.textContent = "Cargando…";
    try {
      const uid = await currentUserId();
      if (!uid) throw new Error("No sé cuál es tu perfil. Entra en tu perfil (tu armario) y vuelve a pulsar.");
      wardrobe = await loadWardrobe(uid);
      const list = panel.querySelector("#vr-list");
      list.innerHTML = "";
      for (const it of wardrobe) {
        const p = it.photo || it.photos?.[0] || {};
        const thumbs = (p.thumbnails || []).filter((t) => t.url);
        const small = thumbs.find((t) => (t.width || 999) <= 310) || thumbs[0];
        const img = p.url || small?.url || p.full_size_url || "";
        const price = it.price?.amount ? `${it.price.amount} ${it.price.currency_code || ""}` : (it.price || "");
        const row = el(`<label class="vr-it"><input type="checkbox" value="${it.id}">
          <img src="${img}"><span class="vr-t"></span><span class="vr-p">${price}</span></label>`);
        row.querySelector(".vr-t").textContent = it.title;
        const im = row.querySelector("img");
        im.referrerPolicy = "no-referrer";
        im.onerror = () => {
          // Si la página bloquea la imagen, la pido a través de la extensión
          chrome.runtime.sendMessage({ type: "vr_fetch_photo", url: img }, (r) => {
            if (r?.ok) im.src = `data:${r.type};base64,${r.b64}`;
            else im.style.visibility = "hidden";
          });
          im.onerror = null;
        };
        row.querySelector("input").onchange = updateSel;
        list.appendChild(row);
      }
      panel.querySelector("#vr-listwrap").style.display = "block";
      btn.textContent = `Recargar (${wardrobe.length} disponibles)`;
    } catch (e) {
      plog(e.message, "err"); btn.textContent = "Cargar mis artículos";
    }
    btn.disabled = false;
  }

  function updateSel() {
    const n = panel.querySelectorAll(".vr-it input:checked").length;
    panel.querySelector("#vr-sel").textContent = `${n} seleccionados`;
  }

  async function onStart() {
    const ids = [...panel.querySelectorAll(".vr-it input:checked")].map((c) => c.value);
    if (!ids.length) return plog("Selecciona al menos un artículo.", "err");
    const min = Math.max(1, Number(panel.querySelector("#vr-min").value) || 5);
    const existing = await getQueue();
    if (existing?.running && existing.items.length) {
      if (!confirm("Ya hay una cola en marcha. ¿Añadir estos artículos al final?")) return;
      const known = new Set(existing.items.map((i) => String(i.id)));
      for (const id of ids) if (!known.has(id)) existing.items.push({ id, title: wardrobe.find((w) => String(w.id) === id)?.title || id });
      existing.intervalMin = min;
      await store.set(K.queue, existing);
    } else {
      if (!confirm(`Se resubirán ${ids.length} artículos, uno cada ~${min} min. Deja abierta una pestaña de Vinted. ¿Empezar?`)) return;
      await store.set(K.queue, {
        items: ids.map((id) => ({ id, title: wardrobe.find((w) => String(w.id) === id)?.title || id })),
        intervalMin: min, nextAt: Date.now(), running: true, done: 0, failed: 0, log: []
      });
    }
    render();
  }

  async function render() {
    if (!panel) return;
    const q = await getQueue();
    const box = panel.querySelector("#vr-qbox");
    if (!q || (!q.items.length && !q.log?.length)) { box.innerHTML = ""; }
    else {
      const mins = Math.max(0, Math.round((q.nextAt - Date.now()) / 60000));
      const status = !q.items.length ? "Terminada"
        : q.running ? (working ? "Resubiendo ahora…" : `Siguiente en ~${mins} min`) : "En pausa";
      box.innerHTML = `
        <div class="vr-row"><strong>Cola</strong><span>${status}</span></div>
        <div class="vr-row"><span>Pendientes: ${q.items.length}</span><span>✔ ${q.done} · ✖ ${q.failed}</span></div>
        <div class="vr-row">
          ${q.items.length ? `<button class="vr-small" id="vr-pause">${q.running ? "Pausar" : "Reanudar"}</button>` : ""}
          <button class="vr-small vr-secondary" id="vr-clear">Vaciar cola</button>
        </div>
        <div class="vr-qlog"></div>`;
      const ql = box.querySelector(".vr-qlog");
      for (const l of (q.log || []).slice(-15)) {
        const d = document.createElement("div");
        d.textContent = new Date(l.t).toLocaleTimeString().slice(0, 5) + " " + l.msg;
        if (l.cls) d.className = l.cls;
        ql.appendChild(d);
      }
      ql.scrollTop = ql.scrollHeight;
      box.querySelector("#vr-pause")?.addEventListener("click", async () => {
        const qq = await getQueue(); qq.running = !qq.running;
        if (qq.running && qq.nextAt < Date.now()) qq.nextAt = Date.now();
        await store.set(K.queue, qq); render();
      });
      box.querySelector("#vr-clear").onclick = async () => {
        if (confirm("¿Vaciar la cola? Los artículos que falten no se resubirán.")) { await store.del(K.queue); render(); }
      };
    }
    const b = await store.get(K.backups, {});
    panel.querySelector("#vr-retry").style.display =
      Object.values(b).some((x) => x.origin === ORIGIN) ? "block" : "none";
  }

  chrome.storage.onChanged.addListener(() => render());
  setInterval(render, 30000);

  // Vinted es una SPA: el panel se reconstruye al cambiar de página
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) { last = location.href; if (panel) { closePanel(); openPanel(); } }
    mountLauncher();
  }, 1000);
  mountLauncher();
})();
