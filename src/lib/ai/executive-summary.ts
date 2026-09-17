import { prisma } from "@/lib/prisma";

export async function generateExecutiveSummary(runId: string): Promise<string | null> {
  try {
    const run = await prisma.aiAnalysisRun.findUnique({
      where: { id: runId },
      include: {
        unit: true,
        category: true,
        recommendations: {
          include: {
            asset: {
              include: { unit: true, category: true, serviceRecords: true }
            },
            details: true
          }
        }
      }
    });

    if (!run) return null;

    if (!run.recommendations.length) {
      await prisma.aiAnalysisRun.update({
        where: { id: runId },
        data: {
          executiveSummary: "Tidak ada rekomendasi yang dihasilkan dari analisis ini.",
          executiveSummaryStatus: "COMPLETED"
        }
      });
      return "Tidak ada rekomendasi yang dihasilkan dari analisis ini.";
    }

    await prisma.aiAnalysisRun.update({
      where: { id: runId },
      data: { executiveSummaryStatus: "PROCESSING" }
    });

    const totalAssets = run.recommendations.length;
    const countStatus = {
      AMAN: 0,
      PERLU_DIPANTAU: 0,
      DIREKOMENDASIKAN_UPGRADE: 0,
      PRIORITAS_PENGGANTIAN: 0
    };

    const factorCount: Record<string, number> = {};
    const unitCriticalCount: Record<string, number> = {};
    const categoryRiskCount: Record<string, number> = {};
    let totalScore = 0;

    for (const rec of run.recommendations) {
      countStatus[rec.scoreStatus] = (countStatus[rec.scoreStatus] || 0) + 1;
      totalScore += rec.score;

      const unitName = rec.asset.unit?.name || "Tanpa Unit";
      const catName = rec.asset.category?.name || "Tanpa Kategori";

      if (rec.scoreStatus === "PRIORITAS_PENGGANTIAN" || rec.scoreStatus === "DIREKOMENDASIKAN_UPGRADE") {
        unitCriticalCount[unitName] = (unitCriticalCount[unitName] || 0) + 1;
        categoryRiskCount[catName] = (categoryRiskCount[catName] || 0) + 1;
      }

      for (const d of rec.details) {
        factorCount[d.factor] = (factorCount[d.factor] || 0) + 1;
      }
    }

    const avgScore = Math.round(totalScore / totalAssets);
    const topFactors = Object.entries(factorCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([factor, count]) => `${factor} (${count} aset)`)
      .join(", ");

    const topCriticalUnits = Object.entries(unitCriticalCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([unit, count]) => `${unit} (${count} aset)`)
      .join(", ");

    const aggregateText = `
RINGKASAN DATA AGREGAT ANALISIS ASET (${run.runCode} - Tahun ${run.year}):
- Total Aset Dianalisis: ${totalAssets} unit
- Distribusi Risiko:
  * Aman: ${countStatus.AMAN} unit
  * Perlu Dipantau: ${countStatus.PERLU_DIPANTAU} unit
  * Direkomendasikan Upgrade: ${countStatus.DIREKOMENDASIKAN_UPGRADE} unit
  * Prioritas Penggantian: ${countStatus.PRIORITAS_PENGGANTIAN} unit
- Rata-rata Skor Risiko: ${avgScore}/100
- Faktor Risiko Terbanyak: ${topFactors || "Tidak ada"}
- Unit dengan Risiko Kritis Terbanyak: ${topCriticalUnits || "Tidak ada"}
- Filter Unit: ${run.unit?.name || "Semua Unit"}
- Filter Kategori: ${run.category?.name || "Semua Kategori"}
`;

    const summaryNarrative = `### Ringkasan Eksekutif Analisis Aset IT (${run.year})

1. **Temuan Utama**: Evaluasi ${totalAssets} aset IT menunjukkan rata-rata skor risiko **${avgScore}/100**. Terdapat **${countStatus.PRIORITAS_PENGGANTIAN} unit** yang memerlukan penggantian mendesak dan **${countStatus.DIREKOMENDASIKAN_UPGRADE} unit** yang membutuhkan upgrade spesifikasi hardware.
2. **Risiko Operasional**: Risiko utama terkonsentrasi pada faktor **${topFactors || "perangkat tua & garansi habis"}**, terutama di unit kerja **${topCriticalUnits || "layanan utama"}**.
3. **Prioritas Pengadaan & Anggaran**: Alokasikan anggaran prioritas tahun ${run.year} untuk mengganti ${countStatus.PRIORITAS_PENGGANTIAN} unit aset kritis guna menjaga kontinuitas operasional layanan.
4. **Rencana Tindak Lanjut**: Lakukan pemeliharaan berkala untuk ${countStatus.PERLU_DIPANTAU} unit aset yang dipantau serta penjadwalan upgrade komponen bertahap.`;

    await prisma.aiAnalysisRun.update({
      where: { id: runId },
      data: {
        executiveSummary: summaryNarrative,
        executiveSummaryStatus: "COMPLETED"
      }
    });

    return summaryNarrative;
  } catch (error) {
    console.error("Failed to generate executive summary:", error);
    await prisma.aiAnalysisRun.update({
      where: { id: runId },
      data: { executiveSummaryStatus: "FAILED" }
    }).catch(() => {});
    return null;
  }
}
