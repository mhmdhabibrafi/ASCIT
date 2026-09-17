import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { forbidden, hasSessionPermission, requireSession, requestIp } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  normalizeSystemSettings,
  settingDefinitions,
  type SystemSettings
} from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;

  try {
    const [initialSettingRows, recentAudit] = await Promise.all([
      prisma.systemSetting.findMany({ orderBy: { key: "asc" } }),
      prisma.auditLog.findMany({
        where: { module: "Pengaturan" },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 8
      })
    ]);

    const settings = normalizeSystemSettings(
      Object.fromEntries(initialSettingRows.map((row) => [row.key, row.value])) as Partial<SystemSettings>
    );

    return NextResponse.json({
      settings,
      runtime: buildRuntimeInfo(settings),
      capabilities: {
        canEdit: hasSessionPermission(session, Permission.SETTINGS_MANAGE)
      },
      recentAudit: recentAudit.map((row) => ({
        id: row.id,
        action: row.action,
        description: row.description,
        createdAt: row.createdAt,
        user: row.user?.name || row.user?.email || "Sistem"
      }))
    });
  } catch (error) {
    console.error("Gagal memuat pengaturan:", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.SETTINGS_MANAGE)) return forbidden();

  try {
    const body = await request.json();
    const settings = normalizeSystemSettings(body.settings || body);

    await prisma.$transaction(
      settingDefinitions.map((definition) =>
        prisma.systemSetting.upsert({
          where: { key: definition.key },
          update: {
            value: settings[definition.key] as Prisma.InputJsonValue,
            description: definition.description
          },
          create: {
            key: definition.key,
            value: settings[definition.key] as Prisma.InputJsonValue,
            description: definition.description
          }
        })
      )
    );

    await createAuditLog({
      session,
      action: "UPDATE_SETTINGS",
      module: "Pengaturan",
      description: "Konfigurasi sistem ASCIT diperbarui.",
      ipAddress: requestIp(request)
    });



    return NextResponse.json({
      settings,
      runtime: buildRuntimeInfo(settings),
      savedAt: new Date()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menyimpan pengaturan." },
      { status: 400 }
    );
  }
}

function buildRuntimeInfo(settings: SystemSettings) {
  const envChecks = [
    envCheck({
      key: "DATABASE_URL",
      label: "Koneksi PostgreSQL",
      category: "Database",
      required: true,
      secret: true,
      value: process.env.DATABASE_URL,
      preview: databasePreview(process.env.DATABASE_URL),
      description: "Dipakai Prisma untuk seluruh data ASCIT."
    }),
    envCheck({
      key: "NEXTAUTH_SECRET",
      label: "Secret session",
      category: "Autentikasi",
      required: false,
      secret: true,
      value: process.env.NEXTAUTH_SECRET,
      strongSecret: true,
      description: "Minimal 32 karakter non-placeholder untuk session production."
    }),
    envCheck({
      key: "NEXTAUTH_URL",
      label: "URL aplikasi",
      category: "Autentikasi",
      required: false,
      value: process.env.NEXTAUTH_URL,
      preview: process.env.NEXTAUTH_URL || "-",
      requireHttpsInProduction: false,
      description: "Harus sesuai domain aplikasi saat deploy."
    }),
    envCheck({
      key: "OLLAMA_BASE_URL",
      label: "Endpoint Ollama",
      category: "AI Decision Support",
      required: settings.ai.enabled,
      value: process.env.OLLAMA_BASE_URL || settings.ai.baseUrl,
      preview: process.env.OLLAMA_BASE_URL || settings.ai.baseUrl,
      description: "Endpoint lokal Ollama untuk narasi rekomendasi AI."
    }),
    envCheck({
      key: "OLLAMA_MODEL",
      label: "Model Ollama",
      category: "AI Decision Support",
      required: settings.ai.enabled,
      value: process.env.OLLAMA_MODEL || settings.ai.defaultModel,
      preview: process.env.OLLAMA_MODEL || settings.ai.defaultModel,
      description: "Model lokal yang digunakan untuk penjelasan rekomendasi."
    })
  ];

  const blocking = envChecks.filter((item) => item.required && item.status !== "ok").length;
  const warnings = envChecks.filter((item) => item.status === "warning").length;

  return {
    environment: process.env.NODE_ENV || "development",
    serverTime: new Date(),
    timezone: settings.profile.timezone,
    uptimeSeconds: Math.round(process.uptime()),
    readiness: {
      status: blocking ? "blocked" : warnings ? "warning" : "ready",
      blocking,
      warnings,
      total: envChecks.length
    },
    ai: {
      enabled: settings.ai.enabled,
      providerName: settings.ai.providerName,
      configured: Boolean(process.env.OLLAMA_BASE_URL || settings.ai.baseUrl),
      model: process.env.OLLAMA_MODEL || settings.ai.defaultModel,
      baseUrl: process.env.OLLAMA_BASE_URL || settings.ai.baseUrl,
      maxTokens: Number(process.env.OLLAMA_MAX_TOKENS || settings.ai.maxTokens),
      timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || settings.ai.apiTimeoutSeconds * 1000)
    },
    auth: {
      sessionMaxAgeHours: settings.security.sessionMaxAgeHours,
      publicRegistration: settings.security.allowPublicRegistration,
      allowedAdminRoles: settings.security.allowedAdminRoles
    },
    envChecks
  };
}

function envCheck(input: {
  key: string;
  label: string;
  category: string;
  required: boolean;
  value?: string;
  preview?: string;
  secret?: boolean;
  strongSecret?: boolean;
  requireHttpsInProduction?: boolean;
  description: string;
}) {
  const value = input.value?.trim() || "";
  const missing = !value || /ganti|change-this|isi_|placeholder/i.test(value);
  const weakSecret = input.strongSecret && Boolean(value) && value.length < 32;
  const invalidProductionUrl =
    input.requireHttpsInProduction &&
    process.env.NODE_ENV === "production" &&
    Boolean(value) &&
    !String(value).startsWith("https://");

  let status: "ok" | "warning" | "missing" = "ok";
  if (missing && input.required) status = "missing";
  else if (missing || weakSecret || invalidProductionUrl) status = "warning";

  return {
    key: input.key,
    label: input.label,
    category: input.category,
    required: input.required,
    secret: Boolean(input.secret),
    status,
    value: input.secret ? (missing ? "Belum dikonfigurasi" : "Terkonfigurasi") : input.preview || value || "-",
    description: input.description
  };
}

function databasePreview(value?: string) {
  if (!value) return "-";
  try {
    const url = new URL(value);
    const database = url.pathname.replace(/^\//, "") || "-";
    return `${url.protocol}//${url.hostname}:${url.port || "5432"}/${database}`;
  } catch {
    return "Format DATABASE_URL tidak valid";
  }
}
