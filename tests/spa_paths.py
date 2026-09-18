"""SPA shell GET paths — keep aligned with ``src/router/routes.ts`` and ``app.py`` ``@app.get``."""

from __future__ import annotations

# Static routes (SPA_PATHS + home)
SPA_SHELL_PATHS: tuple[str, ...] = (
    "/",
    "/login",
    "/register",
    "/forgot",
    "/reset",
    "/verify",
    "/feed",
    "/likes",
    "/chats",
    "/me",
    "/onboard",
    "/chats/1",
    "/p/1",
    "/r/testcode",
)
