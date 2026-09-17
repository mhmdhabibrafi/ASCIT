"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body>
        <div style={{ display: "flex", height: "100vh", width: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc", padding: "24px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ marginBottom: "24px", display: "flex", height: "80px", width: "80px", alignItems: "center", justifyContent: "center", borderRadius: "50%", backgroundColor: "#fee2e2", color: "#dc2626" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <h1 style={{ marginBottom: "8px", fontSize: "24px", fontWeight: "bold", color: "#0f172a" }}>Kesalahan Fatal Sistem</h1>
          <p style={{ marginBottom: "32px", maxWidth: "28rem", color: "#64748b" }}>
            Terjadi kesalahan mendasar yang menyebabkan aplikasi berhenti berfungsi. Silakan muat ulang halaman ini.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{ padding: "10px 20px", backgroundColor: "#0f7680", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
          >
            Muat Ulang Halaman
          </button>
        </div>
      </body>
    </html>
  );
}
