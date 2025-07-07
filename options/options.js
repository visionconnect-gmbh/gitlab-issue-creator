document.addEventListener("DOMContentLoaded", async () => {
  const { gitlabUrl, gitlabToken } = await browser.storage.local.get([
    "gitlabUrl",
    "gitlabToken",
  ]);
  document.getElementById("gitlabUrl").value = gitlabUrl || "";
  document.getElementById("gitlabToken").value = gitlabToken || "";
});

document.getElementById("save").addEventListener("click", async () => {
  const gitlabUrl = document.getElementById("gitlabUrl").value.trim();
  const gitlabToken = document.getElementById("gitlabToken").value.trim();

  await browser.storage.local.set({ gitlabUrl, gitlabToken });
  alert("Einstellungen gespeichert.");
  browser.runtime.sendMessage({ type: "settings-updated" });
  window.close();
});
