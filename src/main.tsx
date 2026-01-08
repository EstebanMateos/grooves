import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <HashRouter>
            <App />
        </HashRouter>
    </React.StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        const base_url = import.meta.env.BASE_URL;
        navigator.serviceWorker
            .register(`${base_url}sw.js`)
            .then((registration) => {
                registration.update().catch(() => {});
                let update_prompted = false;

                function promptForUpdate(reg: ServiceWorkerRegistration): void {
                    if (update_prompted || !reg.waiting) {
                        return;
                    }
                    update_prompted = true;
                    const should_reload = window.confirm("Une nouvelle version est disponible. Recharger ?");
                    if (should_reload) {
                        reg.waiting.postMessage({ type: "SKIP_WAITING" });
                    }
                }

                registration.addEventListener("updatefound", () => {
                    const new_worker = registration.installing;
                    if (!new_worker) {
                        return;
                    }
                    new_worker.addEventListener("statechange", () => {
                        if (new_worker.state === "installed") {
                            promptForUpdate(registration);
                        }
                    });
                });

                if (registration.waiting) {
                    promptForUpdate(registration);
                }

                let refreshing = false;
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                    if (refreshing) {
                        return;
                    }
                    refreshing = true;
                    window.location.reload();
                });
            })
            .catch(() => {});
    });
}
