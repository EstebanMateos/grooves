import { useEffect, useRef, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import AuthModal from "./components/AuthModal";
import { supabase } from "./supabaseClient";
import { useAuthSession } from "./hooks/useAuthSession";
import { useUserProfileSummary } from "./hooks/useUserProfileSummary";
import DiscoverProfilesPage from "./pages/DiscoverProfilesPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import MyLibraryPage from "./pages/MyLibraryPage";
import ProfileSettingsPage from "./pages/ProfileSettingsPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import ReleasePage from "./pages/ReleasePage";
import SearchResultsPage from "./pages/SearchResultsPage";

export default function App() {
    const auth = useAuthSession();
    const profile = useUserProfileSummary();
    const [authOpen, setAuthOpen] = useState<boolean>(false);
    const [menuOpen, setMenuOpen] = useState<boolean>(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    async function signOut() {
        await supabase.auth.signOut();
    }

    function toggleMenu() {
        setMenuOpen((prev) => !prev);
    }

    function closeMenu() {
        setMenuOpen(false);
    }

    const displayName = profile.username || auth.user_email || "Connected";
    const initial = displayName.trim().charAt(0).toUpperCase() || "U";

    useEffect(() => {
        if (!menuOpen) {
            return;
        }

        function handleClick(event: MouseEvent) {
            if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) {
                closeMenu();
            }
        }

        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") {
                closeMenu();
            }
        }

        document.addEventListener("click", handleClick);
        document.addEventListener("keydown", handleKey);

        return () => {
            document.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [menuOpen]);

    return (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: 16 }}>
            <header
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 20
                }}
            >
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <Link to="/" style={{ textDecoration: "none", fontWeight: 800, letterSpacing: 0.2 }}>
                        Grooves
                    </Link>

                    <Link to="/people" style={{ textDecoration: "none" }}>
                        People
                    </Link>

                    <Link to="/my-library" style={{ textDecoration: "none" }}>
                        My library
                    </Link>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {auth.is_loading ? (
                        <span style={{ opacity: 0.7, fontSize: 14 }}>Checking session…</span>
                    ) : auth.is_authenticated ? (
                        <>
                            <div style={{ position: "relative" }} ref={menuRef}>
                                <button
                                    type="button"
                                    className="btn btnGhost"
                                    onClick={toggleMenu}
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    style={{
                                        width: 38,
                                        height: 38,
                                        padding: 0,
                                        borderRadius: "50%",
                                        fontWeight: 700
                                    }}
                                >
                                    {initial}
                                </button>

                                {menuOpen ? (
                                    <div
                                        role="menu"
                                        style={{
                                            position: "absolute",
                                            right: 0,
                                            top: "calc(100% + 8px)",
                                            minWidth: 160,
                                            background: "rgba(10, 12, 18, 0.95)",
                                            border: "1px solid var(--stroke)",
                                            borderRadius: 12,
                                            padding: 8,
                                            boxShadow: "var(--shadow)",
                                            display: "grid",
                                            gap: 6,
                                            zIndex: 20
                                        }}
                                    >
                                        <div
                                            style={{
                                                padding: "6px 10px",
                                                fontSize: 13,
                                                color: "var(--muted)",
                                                borderBottom: "1px solid var(--stroke)",
                                                marginBottom: 4
                                            }}
                                        >
                                            {displayName}
                                        </div>
                                        <Link
                                            to="/profile"
                                            className="btn btnGhost"
                                            onClick={closeMenu}
                                            style={{ justifyContent: "flex-start" }}
                                            role="menuitem"
                                        >
                                            Profile
                                        </Link>
                                        <button
                                            className="btn btnGhost"
                                            onClick={() => {
                                                closeMenu();
                                                signOut();
                                            }}
                                            style={{ justifyContent: "flex-start" }}
                                            role="menuitem"
                                        >
                                            Logout
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </>
                    ) : (
                        <>
                            <span style={{ opacity: 0.8, fontSize: 14 }}>Not logged in</span>
                            <Link to="/login" className="btn btnPrimary">
                                Login
                            </Link>
                        </>
                    )}
                </div>
            </header>

            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/people" element={<DiscoverProfilesPage />} />
                <Route path="/my-library" element={<MyLibraryPage />} />
                <Route path="/profile" element={<ProfileSettingsPage />} />
                <Route path="/search" element={<SearchResultsPage />} />
                <Route path="/u/:username" element={<PublicProfilePage />} />
                <Route
                    path="/release/:discogsReleaseId"
                    element={<ReleasePage onRequireAuth={() => setAuthOpen(true)} />}
                />
            </Routes>

            <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={() => {}} />
        </div>
    );
}
