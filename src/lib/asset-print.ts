export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface PrintableAssetData {
  assetCode: string;
  assetName: string;
  serialNumber?: string | null;
  qrCodeUrl: string;
}

function getAdaptiveFontSize(text: string): string {
  const len = text.length;
  if (len <= 12) return "13.5pt";
  const size = Math.max(6.5, 13.5 * (12 / len));
  return `${size.toFixed(1)}pt`;
}

export function buildSingleAssetQrLabelHtml(asset: PrintableAssetData): string {
  const code = escapeHtml(asset.assetCode);
  const rawSn = String(asset.serialNumber || "").trim();
  const snText = rawSn && rawSn !== "-"
    ? (rawSn.toUpperCase().startsWith("SN") ? escapeHtml(rawSn) : `SN: ${escapeHtml(rawSn)}`)
    : escapeHtml(asset.assetName);
  const fontSize = getAdaptiveFontSize(snText);

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>QR ${code}</title>
  <style>
    @page { size: 100mm 45mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100mm;
      height: 45mm;
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, Roboto, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      overflow: hidden;
    }
    .label-card {
      width: 100mm;
      height: 45mm;
      border: 2px solid #000;
      display: flex;
      flex-direction: column;
      background: #fff;
      box-sizing: border-box;
    }
    
    /* Top Header Section */
    .header-row {
      display: flex;
      height: 11mm;
      border-bottom: 2px solid #000;
      width: 100%;
    }
    .header-left {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 2mm;
      border-right: 2px solid #000;
      min-width: 0;
    }
    .rs-title {
      color: #dc2626;
      font-size: 16pt;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-family: 'Arial Black', 'Trebuchet MS', 'Impact', system-ui, sans-serif;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
    }
    .header-right {
      width: 33mm;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1mm;
      text-align: center;
    }
    .ascit-title {
      color: #059669;
      font-size: 12pt;
      font-weight: 900;
      line-height: 1;
      letter-spacing: 0.3px;
    }
    .ascit-subtitle {
      color: #059669;
      font-size: 4pt;
      font-weight: 700;
      line-height: 1.1;
      margin-top: 1px;
      white-space: nowrap;
    }

    /* Main Bottom Section */
    .main-row {
      display: flex;
      height: 34mm;
      width: 100%;
    }
    .qr-container {
      width: 34mm;
      height: 34mm;
      border-right: 2px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5mm;
      flex-shrink: 0;
    }
    .qr-img {
      width: 31mm;
      height: 31mm;
      object-fit: contain;
      display: block;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
    .info-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5mm 2mm;
      text-align: center;
      gap: 2.5mm;
      min-width: 0;
      overflow: hidden;
    }
    .asset-code-pill {
      background: #e0f2fe;
      color: #0284c7;
      font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
      font-size: 11.5pt;
      font-weight: 800;
      padding: 1.5mm 4mm;
      border-radius: 1.5mm;
      letter-spacing: 0.5px;
      display: inline-block;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .asset-sn-text {
      color: #0f172a;
      font-weight: 900;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: clip;
      max-width: 100%;
      padding: 0 1mm;
    }

    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="label-card">
    <div class="header-row">
      <div class="header-left">
        <div class="rs-title">RS AWAL BROS</div>
      </div>
      <div class="header-right">
        <div class="ascit-title">ASCIT</div>
        <div class="ascit-subtitle">Asset Care Information Technology System</div>
      </div>
    </div>
    <div class="main-row">
      <div class="qr-container">
        <img src="${asset.qrCodeUrl}" alt="QR ${code}" class="qr-img" />
      </div>
      <div class="info-container">
        <div class="asset-code-pill">${code}</div>
        <div class="asset-sn-text" style="font-size: ${fontSize}">${snText}</div>
      </div>
    </div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

export function buildMultipleAssetQrLabelsHtml(assets: PrintableAssetData[]): string {
  const labelPages = assets
    .map((asset, index) => {
      const code = escapeHtml(asset.assetCode);
      const rawSn = String(asset.serialNumber || "").trim();
      const snText = rawSn && rawSn !== "-"
        ? (rawSn.toUpperCase().startsWith("SN") ? escapeHtml(rawSn) : `SN: ${escapeHtml(rawSn)}`)
        : escapeHtml(asset.assetName);
      const fontSize = getAdaptiveFontSize(snText);

      return `<section class="label-page">
      <div class="label-card">
        <div class="header-row">
          <div class="header-left">
            <div class="rs-title">RS AWAL BROS</div>
          </div>
          <div class="header-right">
            <div class="ascit-title">ASCIT</div>
            <div class="ascit-subtitle">Asset Care Information Technology System</div>
          </div>
        </div>
        <div class="main-row">
          <div class="qr-container">
            <img src="${asset.qrCodeUrl}" alt="QR ${code}" class="qr-img" />
          </div>
          <div class="info-container">
            <div class="asset-code-pill">${code}</div>
            <div class="asset-sn-text" style="font-size: ${fontSize}">${snText}</div>
          </div>
        </div>
      </div>
      <span class="page-count">${index + 1}/${assets.length}</span>
    </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Semua QR Aset (${assets.length})</title>
  <style>
    @page { size: 100mm 45mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, Roboto, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-hint {
      margin: 16px auto;
      max-width: 100mm;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      color: #334155;
      background: #f8fafc;
      font-size: 12px;
      line-height: 1.5;
    }
    .label-page {
      position: relative;
      width: 100mm;
      height: 45mm;
      margin: 8px auto;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
      background: #fff;
    }
    .label-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .label-card {
      width: 100mm;
      height: 45mm;
      border: 2px solid #000;
      display: flex;
      flex-direction: column;
      background: #fff;
      box-sizing: border-box;
    }
    
    /* Top Header Section */
    .header-row {
      display: flex;
      height: 11mm;
      border-bottom: 2px solid #000;
      width: 100%;
    }
    .header-left {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 2mm;
      border-right: 2px solid #000;
      min-width: 0;
    }
    .rs-title {
      color: #dc2626;
      font-size: 16pt;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-family: 'Arial Black', 'Trebuchet MS', 'Impact', system-ui, sans-serif;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
    }
    .header-right {
      width: 33mm;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1mm;
      text-align: center;
    }
    .ascit-title {
      color: #059669;
      font-size: 12pt;
      font-weight: 900;
      line-height: 1;
      letter-spacing: 0.3px;
    }
    .ascit-subtitle {
      color: #059669;
      font-size: 4pt;
      font-weight: 700;
      line-height: 1.1;
      margin-top: 1px;
      white-space: nowrap;
    }

    /* Main Bottom Section */
    .main-row {
      display: flex;
      height: 34mm;
      width: 100%;
    }
    .qr-container {
      width: 34mm;
      height: 34mm;
      border-right: 2px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5mm;
      flex-shrink: 0;
    }
    .qr-img {
      width: 31mm;
      height: 31mm;
      object-fit: contain;
      display: block;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
    .info-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5mm 2mm;
      text-align: center;
      gap: 2.5mm;
      min-width: 0;
      overflow: hidden;
    }
    .asset-code-pill {
      background: #e0f2fe;
      color: #0284c7;
      font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
      font-size: 11.5pt;
      font-weight: 800;
      padding: 1.5mm 4mm;
      border-radius: 1.5mm;
      letter-spacing: 0.5px;
      display: inline-block;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .asset-sn-text {
      color: #0f172a;
      font-weight: 900;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: clip;
      max-width: 100%;
      padding: 0 1mm;
    }

    .page-count { display: none; }
    @media print {
      .print-hint { display: none !important; }
      .label-page { margin: 0 !important; }
    }
  </style>
</head>
<body>
  <div class="print-hint"><strong>${assets.length} label siap dicetak.</strong><br/>Gunakan ukuran kertas <strong>100 × 45 mm</strong>, skala <strong>100%</strong>, margin <strong>None</strong>, dan nonaktifkan header/footer browser.</div>
  ${labelPages}
  <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
</body>
</html>`;
}
