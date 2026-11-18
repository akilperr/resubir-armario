chrome.storage.local.get(["vr_count", "vr_backups", "vr_queue"], ({ vr_count = 0, vr_backups = {}, vr_queue }) => {
  document.getElementById("count").textContent = vr_count;

  if (vr_queue && vr_queue.items.length) {
    const mins = Math.max(0, Math.round((vr_queue.nextAt - Date.now()) / 60000));
    document.getElementById("queue").textContent = vr_queue.running
      ? `Cola: ${vr_queue.items.length} pendientes, siguiente en ~${mins} min (con una pestaña de Vinted abierta).`
      : `Cola en pausa: ${vr_queue.items.length} pendientes.`;
  }

  if (Object.keys(vr_backups).length) {
    document.getElementById("pending").style.display = "block";
    const btn = document.getElementById("export");
    btn.style.display = "block";
    btn.onclick = () => {
      const blob = new Blob([JSON.stringify(vr_backups, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "resubir-armario-copias.json";
      a.click();
    };
  }
});
