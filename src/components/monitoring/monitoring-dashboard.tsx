'use client';

/**
 * Monitoring Dashboard Component
 * UI untuk monitoring system health dan metrics
 */

import React, { useEffect, useState } from 'react';
import { HealthCheckResponse } from '@/lib/health-check';
import { Activity, Database, Zap, AlertCircle, CheckCircle, Clock, Bot, Layers3, Timer, MemoryStick } from 'lucide-react';

type AiSystemMetrics = {
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  provider: string;
  model: string;
  latestRunStatus?: string | null;
  queue: { pending: number; processing: number; completed: number; failed: number };
  inference: { avgDurationMs: number };
  cache: { totalEntries: number; latestRunHitCount: number; latestRunMissCount: number };
  runtime: {
    reachable: boolean;
    responseTimeMs: number;
    loadedModels: Array<{ name: string; sizeBytes: number; sizeVramBytes: number; expiresAt?: string }>;
  };
};

interface MonitoringMetrics {
  health: HealthCheckResponse | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

export function MonitoringDashboard() {
  const [aiMetrics, setAiMetrics] = useState<AiSystemMetrics | null>(null);
  const [metrics, setMetrics] = useState<MonitoringMetrics>({
    health: null,
    loading: true,
    error: null,
    lastUpdate: null,
  });

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const [response, systemResponse] = await Promise.all([
          fetch('/api/health', { cache: 'no-store' }),
          fetch('/api/system/health', { cache: 'no-store' })
        ]);
        const data = await response.json();
        if (systemResponse.ok) {
          const systemData = await systemResponse.json();
          setAiMetrics(systemData.aiMetrics || null);
        }
        setMetrics({
          health: data,
          loading: false,
          error: null,
          lastUpdate: new Date(),
        });
      } catch (error) {
        setMetrics((prev) => ({
          ...prev,
          loading: false,
          error: (error as Error).message,
        }));
      }
    };

    // Initial fetch
    fetchHealth();

    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (metrics.loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="mb-4 animate-spin">
            <Activity className="w-8 h-8 text-blue-500 mx-auto" />
          </div>
          <p className="text-gray-600">Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  const health = metrics.health;
  if (!health) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center text-red-600">
          <AlertCircle className="w-8 h-8 mx-auto mb-4" />
          <p>{metrics.error || 'Failed to load monitoring data'}</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
      case 'healthy':
        return 'bg-green-100 text-green-800';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
      case 'unhealthy':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">System Monitoring Dashboard</h1>
          <p className="text-gray-600 mt-2">Real-time system health and performance metrics</p>
        </div>

        {/* Overall Status */}
        <div className={`rounded-lg p-6 mb-8 ${getStatusColor(health.status)}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(health.status)}
              <div>
                <p className="text-sm font-semibold opacity-75">Overall Status</p>
                <p className="text-2xl font-bold capitalize">{health.status}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-75">Uptime</p>
              <p className="text-xl font-semibold">{formatUptime(health.uptime)}</p>
            </div>
          </div>
        </div>

        {/* Health Checks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Database Check */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Database className="w-6 h-6 text-blue-500" />
                <h2 className="text-lg font-semibold">Database</h2>
              </div>
              {getStatusIcon(health.checks.database.status)}
            </div>
            <p className={`px-3 py-1 rounded-full text-sm inline-block mb-3 ${getStatusColor(health.checks.database.status)}`}>
              {health.checks.database.status}
            </p>
            <p className="text-gray-600 text-sm mb-2">{health.checks.database.message}</p>
            <p className="text-gray-500 text-xs">
              Response time: {health.checks.database.responseTime.toFixed(2)}ms
            </p>
          </div>

          {/* Cache Check */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Zap className="w-6 h-6 text-purple-500" />
                <h2 className="text-lg font-semibold">Cache</h2>
              </div>
              {getStatusIcon(health.checks.cache.status)}
            </div>
            <p className={`px-3 py-1 rounded-full text-sm inline-block mb-3 ${getStatusColor(health.checks.cache.status)}`}>
              {health.checks.cache.status}
            </p>
            <p className="text-gray-600 text-sm mb-2">{health.checks.cache.message}</p>
            <p className="text-gray-500 text-xs">
              Response time: {health.checks.cache.responseTime.toFixed(2)}ms
            </p>
          </div>

          {/* API Check */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-green-500" />
                <h2 className="text-lg font-semibold">API</h2>
              </div>
              {getStatusIcon(health.checks.api.status)}
            </div>
            <p className={`px-3 py-1 rounded-full text-sm inline-block mb-3 ${getStatusColor(health.checks.api.status)}`}>
              {health.checks.api.status}
            </p>
            <p className="text-gray-600 text-sm mb-2">{health.checks.api.message}</p>
            <p className="text-gray-500 text-xs">
              Response time: {health.checks.api.responseTime.toFixed(2)}ms
            </p>
          </div>
        </div>

        {/* Cache Metrics */}
        {health.metrics?.cacheStats && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Cache Metrics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border-l-4 border-purple-500 pl-4">
                <p className="text-gray-600 text-sm">Cache Entries</p>
                <p className="text-2xl font-bold">{health.metrics.cacheStats.size}</p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <p className="text-gray-600 text-sm">Cache Hits</p>
                <p className="text-2xl font-bold">{health.metrics.cacheStats.hits}</p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4">
                <p className="text-gray-600 text-sm">Cache Misses</p>
                <p className="text-2xl font-bold">{health.metrics.cacheStats.misses}</p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <p className="text-gray-600 text-sm">Hit Rate</p>
                <p className="text-2xl font-bold">{health.metrics.cacheStats.hitRate}</p>
              </div>
            </div>
          </div>
        )}

        {aiMetrics ? (
          <div className="mb-8 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-emerald-700" />
                <div>
                  <h2 className="font-bold text-slate-900">Runtime AI & Antrean Ollama</h2>
                  <p className="text-xs text-slate-500">{aiMetrics.model} · run terakhir {aiMetrics.latestRunStatus || '-'}</p>
                </div>
              </div>
              <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${aiMetrics.runtime.reachable ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                {aiMetrics.runtime.reachable ? `Ollama aktif · ${aiMetrics.runtime.responseTimeMs}ms` : 'Ollama tidak terhubung'}
              </span>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <AiRuntimeCard icon={Layers3} label="Antrean" value={`${aiMetrics.queue.processing} proses · ${aiMetrics.queue.pending} tunggu`} hint={`${aiMetrics.queue.completed} selesai · ${aiMetrics.queue.failed} gagal`} />
              <AiRuntimeCard icon={Timer} label="Rata-rata inferensi" value={formatDuration(aiMetrics.inference.avgDurationMs)} hint="Berdasarkan 100 pekerjaan terakhir" />
              <AiRuntimeCard icon={Zap} label="Cache AI" value={`${aiMetrics.cache.totalEntries} entri`} hint={`Run terakhir: ${aiMetrics.cache.latestRunHitCount} hit · ${aiMetrics.cache.latestRunMissCount} miss`} />
              <AiRuntimeCard icon={MemoryStick} label="Model aktif" value={aiMetrics.runtime.loadedModels[0]?.name || 'Belum dimuat'} hint={aiMetrics.runtime.loadedModels.length ? `${formatBytes(aiMetrics.runtime.loadedModels.reduce((sum, model) => sum + model.sizeBytes, 0))} di memori` : 'Dimuat otomatis saat diperlukan'} />
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>Last updated: {metrics.lastUpdate?.toLocaleTimeString()}</span>
          </div>
          <p>Auto-refresh every 30 seconds</p>
        </div>
      </div>
    </div>
  );
}

function AiRuntimeCard({ icon: Icon, label, value, hint }: { icon: typeof Bot; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><Icon className="h-4 w-4 text-emerald-700" />{label}</div>
      <div className="mt-2 break-words text-lg font-black text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function formatDuration(milliseconds: number) {
  if (!milliseconds) return 'Belum terukur';
  const seconds = Math.round(milliseconds / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 MB';
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
