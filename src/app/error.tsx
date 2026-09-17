"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-red-600">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Terjadi Kesalahan Sistem</h1>
      <p className="mb-8 max-w-md text-slate-500">
        Sistem mengalami gangguan saat memuat halaman ini. Silakan coba muat ulang halaman atau hubungi administrator jika masalah berlanjut.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          Muat Ulang Halaman
        </Button>
        <Button onClick={reset} className="gap-2">
          Coba Lagi
        </Button>
      </div>
      {process.env.NODE_ENV === "development" && (
        <div className="mt-8 max-w-2xl overflow-auto rounded bg-slate-900 p-4 text-left text-xs text-red-400">
          <pre>{error.message}</pre>
        </div>
      )}
    </div>
  );
}
