export function getEmailRedirectUrl(path: string) {
    const base = `${window.location.origin}${window.location.pathname}`;
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${base}#${normalized}`;
}
