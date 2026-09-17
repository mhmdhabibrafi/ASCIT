import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { forbidden, hasSessionPermission } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const SYSTEM_PROMPT = `Anda adalah ASCIT Assistant, asisten AI khusus inventaris dan manajemen aset IT untuk rumah sakit.

ATURAN KETAT:
1. Anda HANYA boleh menjawab pertanyaan seputar:
   - Inventaris aset IT (komputer, laptop, printer, server, router, switch, UPS, monitor, dll)
   - Manajemen siklus hidup aset (pembelian, mutasi, perbaikan, penghapusan)
   - Spesifikasi hardware dan rekomendasi upgrade
   - Garansi, maintenance, dan service record
   - Evaluasi kondisi aset (scoring, prioritas penggantian, upgrade)
   - Kebijakan IT asset management di lingkungan rumah sakit
   - Tips perawatan perangkat IT
   - Analisis biaya perbaikan vs penggantian

2. Jika pengguna bertanya di LUAR topik inventaris IT, tolak dengan sopan:
   "Maaf, saya hanya bisa membantu pertanyaan seputar inventaris dan manajemen aset IT. Silakan ajukan pertanyaan terkait aset IT Anda."

3. Jawab dalam bahasa Indonesia, ringkas, profesional, dan informatif.
4. Jangan pernah memberikan kode program, SQL query, atau informasi teknis sistem internal.
5. Jika ditanya soal ringkasan atau statistik aset, gunakan referensi data sistem saat ini yang diberikan di bawah. Jika ditanya soal data spesifik per aset, arahkan untuk melihat halaman Data Aset IT.`;

async function buildSystemContext(): Promise<string> {
  try {
    const [totalAssets, totalUnits, totalServiceRecords, assetsRusak, catCounts, categories, latestAiAnalysis, topCriticalAssets, recentRecommendations] = await Promise.all([
      prisma.asset.count({ where: { deletedAt: null, assetType: "IT" } }),
      prisma.unit.count(),
      prisma.serviceRecord.count({ where: { asset: { assetType: "IT" } } }),
      prisma.asset.count({
        where: { deletedAt: null, assetType: "IT", conditionStatus: { in: ["RUSAK_BERAT", "LAYAK_GANTI"] } }
      }),
      prisma.asset.groupBy({
        by: ["categoryId"],
        where: { deletedAt: null, assetType: "IT" },
        _count: true
      }),
      prisma.assetCategory.findMany({ select: { id: true, name: true } }),
      prisma.aiAnalysisRun.findFirst({ orderBy: { createdAt: "desc" } }).catch(() => null),
      prisma.asset.findMany({
        where: { deletedAt: null, assetType: "IT" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { assetCode: true, assetName: true }
      }).catch(() => []),
      prisma.aiAssetRecommendation.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, asset: { assetType: "IT" } }
      }).catch(() => 0)
    ]);

    const catMap = new Map(categories.map(c => [c.id, c.name]));
    const catSummary = catCounts
      .filter(c => c._count > 0)
      .map(c => `- ${c.categoryId ? (catMap.get(c.categoryId) || c.categoryId) : "Tanpa Kategori"}: ${c._count} unit`)
      .join("\n");

    const aiAnalysisInfo = latestAiAnalysis 
      ? `\nStatus Analisis AI Terakhir (${latestAiAnalysis.runCode}): ${latestAiAnalysis.status} (Total ${latestAiAnalysis.totalAssets} aset diproses)`
      : "";
      
    const criticalAssetsInfo = topCriticalAssets.length > 0
      ? `\nAset Terbaru:\n${topCriticalAssets.map(a => `- ${a.assetName} (${a.assetCode})`).join("\n")}`
      : "";

    const recommendationsInfo = `\nRekomendasi AI dalam 30 hari terakhir: ${recentRecommendations}`;

    return `\n\n=== DATA SISTEM ASCIT SAAT INI (REAL-TIME) ===
Total aset terdaftar: ${totalAssets} unit
Total unit/departemen: ${totalUnits} unit
Total riwayat perbaikan/maintenance: ${totalServiceRecords} catatan
Aset kondisi Rusak Berat/Layak Ganti: ${assetsRusak} unit${aiAnalysisInfo}${criticalAssetsInfo}${recommendationsInfo}

Kategori Aset:
${catSummary}
PENTING: Gunakan data di atas HANYA jika pengguna menanyakan jumlah, ringkasan, atau statistik sistem saat ini.`;
  } catch {
    return "";
  }
}

async function getAiConfig() {
  let baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api";
  let model = process.env.OLLAMA_MODEL || "qwen3:1.7b";
  let timeoutMs = 60000;
  let temperature = 0.4;

  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "ai" } });
    if (row && row.value && typeof row.value === "object") {
      const val = row.value as any;
      if (val.baseUrl) baseUrl = val.baseUrl;
      if (val.defaultModel) model = val.defaultModel;
      if (val.apiTimeoutSeconds) timeoutMs = val.apiTimeoutSeconds * 1000;
      if (typeof val.temperature === "number") temperature = val.temperature;
    }
  } catch {
    // fallback to defaults
  }
  return { baseUrl, model, timeoutMs, temperature };
}

function chatEndpoint(baseUrl: string) {
  if (baseUrl.includes("11434")) return `${baseUrl.replace(/\/$/, "")}/chat`;
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  if (!hasSessionPermission(session as never, Permission.AI_ANALYZE)) return forbidden();

  const userKey = String((session.user as { id?: string }).id || session.user?.email || "unknown");
  const limit = checkRateLimit(`ai-chat:${userKey}`, 20, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak pesan. Silakan coba kembali nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json();
  const messages: Array<{ role: string; content: string }> = body.messages;
  const streamParam = body.stream === true;

  if (!messages?.length) {
    return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
  }

  const config = await getAiConfig();
  const candidateBaseUrls = Array.from(
    new Set([
      config.baseUrl,
      "http://127.0.0.1:11434/api",
      "http://localhost:11434/api",
      "http://172.17.0.1:11434/api",
      "http://ollama:11434/api"
    ])
  ).filter(Boolean);

  const finalSystemPrompt = SYSTEM_PROMPT + (await buildSystemContext());

  // Smart history trimming: token-budget ~3000 tokens (4 chars/token = 12000 chars)
  const MAX_CHARS = 12000;
  let currentLen = finalSystemPrompt.length;
  const trimmedMessages = [];
  
  const lastThree = messages.slice(-3);
  const remaining = messages.slice(0, -3).reverse();
  
  for (const msg of lastThree) currentLen += msg.content.length;
  
  for (const msg of remaining) {
    if (currentLen + msg.content.length <= MAX_CHARS) {
      trimmedMessages.unshift(msg);
      currentLen += msg.content.length;
    } else {
      break;
    }
  }
  
  const fullMessages = [
    { role: "system", content: finalSystemPrompt },
    ...trimmedMessages,
    ...lastThree
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    let response: Response | null = null;
    let lastErr: Error | null = null;
    let isOllamaResponse = false;

    for (const url of candidateBaseUrls) {
      try {
        const isOllama = url.includes("11434");
        const payload = isOllama
          ? {
              model: config.model,
              messages: fullMessages,
              stream: streamParam,
              options: {
                temperature: config.temperature,
                num_predict: 512
              }
            }
          : {
              model: config.model,
              messages: fullMessages,
              stream: streamParam,
              max_tokens: 512,
              temperature: config.temperature
            };

        const res = await fetch(chatEndpoint(url), {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.ok || res.status < 500) {
          response = res;
          isOllamaResponse = isOllama;
          break;
        }
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }

    if (!streamParam) clearTimeout(timeout);

    if (!response) {
      return NextResponse.json(
        { error: lastErr?.message || "Gagal menghubungi server AI Ollama." },
        { status: 502 }
      );
    }

    if (!response.ok) {
      if (streamParam) clearTimeout(timeout);
      const text = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `AI gagal merespons (${response.status}). ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    if (streamParam) {
      const stream = new ReadableStream({
        async start(controllerStream) {
          const reader = response!.body?.getReader();
          if (!reader) {
            controllerStream.close();
            clearTimeout(timeout);
            return;
          }
          try {
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              
              for (const line of lines) {
                if (!line.trim()) continue;
                if (isOllamaResponse) {
                  try {
                    const parsed = JSON.parse(line);
                    if (parsed.message?.content) {
                      controllerStream.enqueue(`data: ${JSON.stringify({ token: parsed.message.content })}\n\n`);
                    }
                  } catch (e) { }
                } else {
                  if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") continue;
                    try {
                      const parsed = JSON.parse(data);
                      const token = parsed.choices?.[0]?.delta?.content;
                      if (token) {
                        controllerStream.enqueue(`data: ${JSON.stringify({ token })}\n\n`);
                      }
                    } catch (e) { }
                  }
                }
              }
            }
            if (buffer.trim()) {
              if (isOllamaResponse) {
                try {
                  const parsed = JSON.parse(buffer);
                  if (parsed.message?.content) {
                    controllerStream.enqueue(`data: ${JSON.stringify({ token: parsed.message.content })}\n\n`);
                  }
                } catch (e) { }
              }
            }
            controllerStream.enqueue(`data: [DONE]\n\n`);
          } catch (e) {
          } finally {
            controllerStream.close();
            clearTimeout(timeout);
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    }

    const result = await response.json();
    const content =
      result.message?.content?.trim() ||
      result.choices?.[0]?.message?.content?.trim() ||
      "Maaf, AI tidak memberikan respons.";

    return NextResponse.json({ content });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "AI timeout, coba lagi." }, { status: 504 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menghubungi AI." },
      { status: 500 }
    );
  }
}
