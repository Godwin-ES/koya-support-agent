"use client";

import { useEffect } from "react";

/** Last resort, when the root layout itself fails: it replaces the whole document, so it carries its own minimal markup and styles (Next's docs: global styles don't reach it). */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f7f8fa", color: "#1a2233", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
        <main style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <p style={{ fontWeight: 600, fontSize: 20, color: "#14315c" }}>
            Relay<span style={{ color: "#1d7a82" }}>Pay</span>
          </p>
          <h1 style={{ fontSize: 20, margin: "24px 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#5b6472", fontSize: 14, lineHeight: 1.6 }}>The app couldn&apos;t load. Try again in a moment.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 20, border: 0, borderRadius: 999, background: "#1d7a82", color: "#fff", padding: "10px 20px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
