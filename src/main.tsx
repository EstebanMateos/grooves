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
        const baseUrl = import.meta.env.BASE_URL;
        navigator.serviceWorker
            .register(`${baseUrl}sw.js`)
            .then((registration) => {
                registration.update().catch(() => {});

                function listenForWaiting(reg: ServiceWorkerRegistration) {
                    if (reg.waiting) {
                        reg.waiting.postMessage({ type: "SKIP_WAITING" });
                    }
                }

                listenForWaiting(registration);

                registration.addEventListener("updatefound", () => {
                    const newWorker = registration.installing;
                    if (!newWorker) {
                        return;
                    }
                    newWorker.addEventListener("statechange", () => {
                        if (newWorker.state === "installed") {
                            listenForWaiting(registration);
                        }
                    });
                });

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
