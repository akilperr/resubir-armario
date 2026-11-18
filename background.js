// Descarga las fotos desde el service worker (evita problemas de CORS en la página)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "vr_fetch_photo") return;
  (async () => {
    try {
      const res = await fetch(msg.url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      sendResponse({ ok: true, b64: btoa(bin), type: res.headers.get("content-type") || "image/jpeg" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
