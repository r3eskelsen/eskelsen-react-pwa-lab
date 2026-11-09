export function registerOfflineSupport() {
  const host = document.querySelector("aside");
  if (!host) return;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = "Offline shell: checking support...";
  host.append(status);

  if (!("serviceWorker" in navigator)) {
    status.textContent = "Offline shell: service workers are unavailable.";
    return;
  }

  const showController = () => {
    status.textContent = navigator.serviceWorker.controller
      ? "Offline shell: service worker control established. Cached files support offline loading; device data stays in this browser."
      : "Offline shell: installed; reload once to establish control.";
  };

  navigator.serviceWorker.addEventListener("controllerchange", showController);

  navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none"
  }).then(registration => {
    const showWaiting = () => {
      status.textContent =
        "Update ready. Close all Fieldnote tabs and app windows, then reopen to activate.";
    };
    if (registration.waiting) showWaiting();
    else showController();

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") {
          if (registration.waiting) showWaiting();
          else showController();
        }
      });
    });
  }).catch(error => {
    status.textContent = `Offline shell registration failed: ${String(error)}`;
  });
}