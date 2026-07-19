export function getEmailRedirectUrl(path: string) {
    const base = `${window.location.origin}${window.location.pathname}`;
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${base}#${normalized}`;
}

export function isPasswordRecoveryUrl(location: Pick<Location, "search" | "hash"> = window.location): boolean {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    return query.get("type") === "recovery" || hash.get("type") === "recovery";
}
