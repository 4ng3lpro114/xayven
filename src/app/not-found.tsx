import Link from "next/link";

// Root-level fallback for paths that bypass the locale proxy entirely.
// In normal use, app/[locale]/not-found.tsx handles 404s.
export default function RootNotFound() {
  return (
    <html lang="es">
      <body
        style={{
          background: "#07060a",
          color: "#f6f4f9",
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <p style={{ fontSize: "0.75rem", letterSpacing: "0.1em", opacity: 0.6 }}>404</p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          Página no encontrada / Page not found
        </h1>
        <Link href="/es" style={{ color: "#c9a8ff" }}>
          Ir al inicio / Go home
        </Link>
      </body>
    </html>
  );
}
