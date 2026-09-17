"use client";

import { Printer, Search, RefreshCcw, Network, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader, PageStack } from "@/components/ui/page";
import { systemBrand } from "@/lib/branding";

function escapeHtml(value: unknown) {
  const normalized = value === null || value === undefined || String(value).trim() === "" ? "-" : value;
  return String(normalized)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPrintDocument({
  reportLabel,
  summary,
  rows,
}: {
  reportLabel: string;
  summary: { segment: string; };
  rows: any[];
}) {
  const documentDate = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const columns = [
    ["no", "NO"],
    ["segment", "NAMA JARINGAN"],
    ["assetName", "NAMA ASSET"],
    ["macAddress", "MAC ADDRESS"],
    ["ipAddress", "IP ADDRESS"],
    ["status", "STATUS"]
  ];

  const tableHead = columns.map(([_, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const tableBody = rows.length
    ? rows
        .map((row) => {
          const isDouble = row.isDouble;
          const trClass = isDouble ? ' class="row-double"' : '';
          const statusText = isDouble ? `BENTROK (${row.count} Aset)` : row.assetName ? "TERPAKAI" : "KOSONG";
          
          return `<tr${trClass}>
            <td style="text-align:center;">${escapeHtml(row.no)}</td>
            <td class="wrap">${escapeHtml(row.segment)}</td>
            <td class="wrap">${escapeHtml(row.assetNameDisplay || row.assetName)}</td>
            <td>${escapeHtml(row.macAddressDisplay || row.macAddress)}</td>
            <td>${escapeHtml(row.ipAddress)}</td>
            <td style="text-align:center; font-weight:bold; ${isDouble ? 'color:#dc2626;' : ''}">${escapeHtml(statusText)}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="6" class="empty">Tidak ada data laporan.</td></tr>`;

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reportLabel)} - ${escapeHtml(systemBrand.name)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11pt; color: #1e293b; background: #fff; line-height: 1.5; }
    .header-print { display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 24px; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-left img { height: 40px; }
    .header-right { text-align: right; }
    .header-right .brand { color: #059669; font-size: 14pt; font-weight: 900; margin: 0; letter-spacing: 0.5px; }
    .header-right .subtitle { color: #64748b; font-size: 9pt; font-weight: 700; margin: 0; }
    h1 { font-size: 16pt; font-weight: 800; text-align: center; margin: 0 0 16px; color: #0f172a; text-transform: uppercase; }
    
    .info-bar { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 10px; }
    .info-left { display: flex; gap: 16px; }
    .info-item span { font-weight: bold; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #000; padding: 5px 6px; text-align: left; vertical-align: middle; font-size: 9px; }
    th { background: #d1d5db; color: #000; font-weight: bold; text-transform: uppercase; text-align: center; border-bottom: 2px solid #000; white-space: nowrap; }
    td { white-space: nowrap; }
    td.wrap { white-space: normal; word-wrap: break-word; min-width: 120px; }
    tr:nth-child(even) td { background: #f9fafb; }
    tr.row-double td { background: #fef2f2; color: #991b1b; }
    .empty { text-align: center; color: #666; font-style: italic; padding: 20px; }
    
    .footer { margin-top: 20px; display: flex; justify-content: flex-end; page-break-inside: avoid; }
    .signature { text-align: center; width: 250px; }
    .signature-date { margin-bottom: 8px; font-size: 10px; }
    .signature-title { margin-bottom: 60px; font-size: 10px; }
    .signature-name { font-weight: bold; font-size: 10px; }
    .signature-nip { margin-top: 4px; font-size: 10px; border-top: 1px solid #000; padding-top: 4px; display: inline-block; min-width: 150px; }
  </style>
</head>
<body>
  <div class="header-print">
    <div class="header-left">
      <img src="/images/rs-awal-bros-logo.png" alt="Awal Bros" onerror="this.style.display='none'" />
    </div>
    <div class="header-right">
      <div class="brand">ASCIT</div>
      <div class="subtitle">Asset Care Information Technology System</div>
    </div>
  </div>

  <h1>${escapeHtml(reportLabel.toUpperCase())}</h1>

  <div class="info-bar">
    <div class="info-left">
      <div class="info-item"><span>Segmen:</span> ${escapeHtml(summary.segment)}</div>
    </div>
    <div>
      <div class="info-item"><span>Total Data:</span> ${rows.length} IP</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>${tableHead}</tr>
    </thead>
    <tbody>
      ${tableBody}
    </tbody>
  </table>

  <div class="footer">
    <div class="signature">
      <div class="signature-date">Pekanbaru, ${escapeHtml(documentDate)}</div>
      <div class="signature-title">Mengetahui,<br/>Penanggung Jawab IT</div>
      <div class="signature-name">Arpi Nanda Putra</div>
      <div class="signature-nip">NIP/NIK: -</div>
    </div>
  </div>
</body>
</html>`;
}

export function IPMonitoringClient() {
  const [master, setMaster] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [loading, setLoading] = useState(true);

  const [octet, setOctet] = useState("2");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"ALL" | "USED" | "DOUBLE">("ALL");

  async function load() {
    setLoading(true);
    try {
      const [masterRes, assetsRes] = await Promise.all([
        fetch("/api/master-data"),
        fetch("/api/assets?page=1&limit=200&assetType=ALL&hasIp=true")
      ]);
      setMaster(await masterRes.json());
      const assetsData = await assetsRes.json();
      const allAssets = [...(assetsData?.data || [])];
      const totalPages = Number(assetsData?.pagination?.totalPages || 1);

      // API membatasi satu respons maksimal 200 data. Ambil seluruh halaman agar
      // Monitoring IP selalu sinkron dengan aset IT dan aset vendor yang ber-IP.
      if (totalPages > 1) {
        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            fetch(`/api/assets?page=${index + 2}&limit=200&assetType=ALL&hasIp=true`)
              .then((response) => response.json())
          )
        );

        for (const page of remainingPages) {
          allAssets.push(...(page?.data || []));
        }
      }

      setAssets(allAssets);
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (master?.segments?.length > 0 && !segmentId) {
       const firstSeg = master.segments.find((s: any) => s.name.trim().toUpperCase() !== "DHCP");
       if (firstSeg) {
           setSegmentId(firstSeg.id);
           const match = firstSeg.name.match(/\d+/);
           if (match) setOctet(match[0]);
       }
    }
  }, [master, segmentId]);

  const selectedSegmentName = master?.segments?.find((s: any) => s.id === segmentId)?.name || "Semua Jaringan";

  // Calculate raw rows and detect duplicates across ALL assets using Map lookup O(N)
  const { allRows, summaryStats } = useMemo(() => {
    const baseIP = `192.168.${octet || "0"}.`;
    const rows = [];
    let usedCount = 0;
    let freeCount = 0;
    let doubleCount = 0;
    
    // Index assets by IP in a single pass O(N)
    const assetMap = new Map<string, any[]>();
    for (let j = 0; j < assets.length; j++) {
      const a = assets[j];
      if (a.ipAddress) {
        const trimmed = a.ipAddress.trim();
        if (trimmed) {
          const list = assetMap.get(trimmed);
          if (list) {
            list.push(a);
          } else {
            assetMap.set(trimmed, [a]);
          }
        }
      }
    }

    for (let i = 1; i <= 254; i++) {
      const currentIP = `${baseIP}${i}`;
      // Constant-time lookup O(1)
      const matchedAssets = assetMap.get(currentIP) || [];
      const count = matchedAssets.length;
      const isDouble = count > 1;

      if (count === 0) {
        freeCount++;
      } else {
        usedCount++;
        if (isDouble) doubleCount++;
      }

      const primaryAsset = matchedAssets[0];
      const segmentNames = matchedAssets.map(a => a.segment?.name).filter(Boolean);
      const uniqueSegments = Array.from(new Set(segmentNames)).join(", ");

      rows.push({
        no: i,
        matchedAssets,
        count,
        isDouble,
        segment: uniqueSegments || (primaryAsset?.segment?.name || "-"),
        assetName: primaryAsset ? primaryAsset.assetName : "",
        assetNameDisplay: matchedAssets.map(a => `${a.assetCode} (${a.assetName})`).join(" | "),
        macAddress: primaryAsset ? (primaryAsset.macAddress || "-") : "",
        macAddressDisplay: matchedAssets.map(a => a.macAddress || "-").join(" | "),
        ipAddress: currentIP
      });
    }

    return {
      allRows: rows,
      summaryStats: {
        total: 254,
        used: usedCount,
        free: freeCount,
        double: doubleCount
      }
    };
  }, [assets, octet]);

  const filteredIpRows = useMemo(() => {
    let rows = allRows;

    if (filterMode === "USED") {
      rows = rows.filter(r => r.count > 0);
    } else if (filterMode === "DOUBLE") {
      rows = rows.filter(r => r.isDouble);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => 
        r.assetNameDisplay.toLowerCase().includes(q) ||
        r.macAddressDisplay.toLowerCase().includes(q) ||
        r.ipAddress.toLowerCase().includes(q) ||
        r.segment.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [allRows, filterMode, searchQuery]);

  function printReport() {
    const popup = window.open("", "_blank", "width=1120,height=760");
    if (!popup) {
      window.alert("Pop-up print diblokir browser.");
      return;
    }

    popup.document.write(buildPrintDocument({ 
      reportLabel: "Monitoring IP Address", 
      summary: { segment: selectedSegmentName }, 
      rows: filteredIpRows 
    }));
    popup.document.close();
    popup.focus();
    const triggerPrint = () => window.setTimeout(() => popup.print(), 350);
    if (popup.document.readyState === "complete") triggerPrint();
    else popup.addEventListener("load", triggerPrint, { once: true });
  }

  return (
    <PageStack>
      <PageHeader
        eyebrow="Monitoring"
        title="Monitoring IP Address"
        description={`Pantau seluruh aset IT dan aset vendor dengan IP Address 192.168.${octet}.1 sampai 192.168.${octet}.254 (${selectedSegmentName}).`}
        actions={
          <>
            <Button type="button" variant="outline" onClick={load}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button type="button" variant="outline" onClick={printReport}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={CheckCircle2}
          label="IP Terpakai"
          value={summaryStats.used}
          hint="IP teralokasi pada aset"
          tone="success"
        />
        <MetricCard
          icon={Network}
          label="IP Kosong"
          value={summaryStats.free}
          hint="Tersedia untuk alokasi baru"
          tone="info"
        />
        <MetricCard
          icon={ShieldAlert}
          label="IP Bentrok / Double"
          value={summaryStats.double}
          hint={summaryStats.double > 0 ? "Perlu penanganan IP ganda" : "Tidak ada IP ganda"}
          tone={summaryStats.double > 0 ? "danger" : "info"}
          className={summaryStats.double > 0 ? "border-red-200 bg-red-50/40" : ""}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <CardTitle>Alokasi IP</CardTitle>
              {summaryStats.double > 0 && (
                <Badge tone="danger" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {summaryStats.double} IP Bentrok
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-slate-200 bg-slate-100/80 p-1 text-xs font-medium text-slate-600">
                <button
                  type="button"
                  onClick={() => setFilterMode("ALL")}
                  className={`rounded-md px-3 py-1.5 transition-all ${filterMode === "ALL" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
                >
                  Semua ({summaryStats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("USED")}
                  className={`rounded-md px-3 py-1.5 transition-all ${filterMode === "USED" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
                >
                  Terpakai ({summaryStats.used})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("DOUBLE")}
                  className={`rounded-md px-3 py-1.5 transition-all ${filterMode === "DOUBLE" ? "bg-red-600 text-white shadow-sm font-semibold" : "text-red-600 hover:bg-red-50"}`}
                >
                  Double IP ({summaryStats.double})
                </button>
              </div>

              <div className="w-full sm:w-[220px]">
                <div className="relative">
                  <Input
                    placeholder="Cari IP, nama aset..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    disabled={loading}
                  />
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div className="w-full sm:w-[180px]">
                <div className="relative">
                  <Select
                    value={segmentId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSegmentId(id);
                      if (id) {
                        const seg = master?.segments?.find((s: any) => s.id === id);
                        if (seg) {
                          const match = seg.name.match(/\d+/);
                          if (match) setOctet(match[0]);
                        }
                      }
                    }}
                    className="pl-9"
                    disabled={loading}
                  >
                    {master?.segments
                      ?.filter((s: any) => s.name.trim().toUpperCase() !== "DHCP")
                      .map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                  <Network className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="px-4 py-3 font-semibold text-slate-900 w-[60px] text-center">NO</th>
                  <th className="px-4 py-3 font-semibold text-slate-900">NAMA JARINGAN</th>
                  <th className="px-4 py-3 font-semibold text-slate-900">NAMA ASSET</th>
                  <th className="px-4 py-3 font-semibold text-slate-900">MAC ADDRESS</th>
                  <th className="px-4 py-3 font-semibold text-slate-900">IP ADDRESS</th>
                  <th className="px-4 py-3 font-semibold text-slate-900 text-center">STATUS IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Memuat data...
                    </td>
                  </tr>
                ) : filteredIpRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Tidak ada alokasi IP yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredIpRows.map((row) => (
                    <tr
                      key={row.no}
                      className={`transition-colors ${
                        row.isDouble
                          ? "bg-red-50/70 hover:bg-red-100/70 border-l-4 border-l-red-500"
                          : "hover:bg-slate-50/50"
                      }`}
                    >
                      <td className="px-4 py-3 text-slate-500 text-center font-medium">{row.no}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{row.segment || <span className="text-slate-300 italic">-</span>}</td>
                      <td className="px-4 py-3 text-slate-900">
                        {row.isDouble ? (
                          <div className="space-y-1">
                            {row.matchedAssets.map((asset: any) => (
                              <div key={asset.id} className="flex items-center gap-2">
                                <span className="font-mono text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
                                  {asset.assetCode}
                                </span>
                                <span className="font-semibold text-red-900">{asset.assetName}</span>
                                {asset.assetType === "VENDOR" && (
                                  <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1 py-0.5 rounded">
                                    Vendor
                                  </span>
                                )}
                                {asset.unit?.name && (
                                  <span className="text-xs text-red-600">({asset.unit.name})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          row.assetName ? (
                            <div className="flex items-center flex-wrap gap-1.5">
                              <span className="font-semibold text-slate-900">{row.assetName}</span>
                              {row.matchedAssets[0]?.assetCode && (
                                <span className="font-mono text-xs text-slate-500">
                                  ({row.matchedAssets[0].assetCode})
                                </span>
                              )}
                              {row.matchedAssets[0]?.assetType === "VENDOR" && (
                                <span className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-600/20">
                                  Asset Vendor
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-normal">-</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                        {row.isDouble ? (
                          <div className="space-y-1">
                            {row.matchedAssets.map((asset: any, idx: number) => (
                              <div key={asset.id || idx} className="text-red-700">
                                {asset.macAddress || "-"}
                              </div>
                            ))}
                          </div>
                        ) : (
                          row.macAddress || "-"
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium">
                        <span className={row.isDouble ? "text-red-700 font-bold" : "text-slate-900"}>
                          {row.ipAddress}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.isDouble ? (
                          <Badge tone="danger" className="flex items-center justify-center gap-1 animate-pulse">
                            <AlertTriangle className="h-3 w-3" />
                            DOUBLE IP ({row.count})
                          </Badge>
                        ) : row.count > 0 ? (
                          <Badge tone="success">
                            Terpakai
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400 font-normal">Kosong</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageStack>
  );
}
