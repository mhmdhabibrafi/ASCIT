/**
 * Lampiran B: bukti pengujian White Box ASCIT.
 * Pemakaian Windows (PowerShell/CMD):
 *   node buat-lampiran-b.mjs D:\ascit
 * Script hanya menjalankan tiga file test terisolasi dan menulis dokumen bukti.
 * Tidak membuat hasil PASS/coverage secara manual.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const project = path.resolve(process.argv[2] || process.cwd());
const evidence = path.join(project, 'docs', 'bukti-pengujian-kp');
const coverageDir = path.join(evidence, 'coverage');
const jsonPath = path.join(evidence, 'jest-lampiran-b.json');
const testLogPath = path.join(evidence, 'jest-lampiran-b-aktual.txt');
const htmlPath = path.join(evidence, 'lampiran-b.html');
const minBranch = 60; // Target menurut konfigurasi proyek yang Anda laporkan.

function fail(msg) { console.error('\nGAGAL: ' + msg); process.exit(1); }
const specs = [
  'src/__tests__/error-handler.spec.ts',
  'src/__tests__/scoring-engine.spec.ts',
  'src/__tests__/rate-limit.spec.ts',
];
if (!fs.existsSync(path.join(project, 'package.json'))) fail('package.json tidak ditemukan di ' + project);
const missing = specs.filter(s => !fs.existsSync(path.join(project, s)));
if (missing.length) fail('File test tidak ditemukan: ' + missing.join(', ') + '. Periksa path pada specs di script.');
const jestBin = path.join(project, 'node_modules', 'jest', 'bin', 'jest.js');
if (!fs.existsSync(jestBin)) fail('Jest lokal tidak ditemukan. Jalankan instalasi dependency sesuai package manager proyek terlebih dahulu.');
fs.mkdirSync(coverageDir, { recursive: true });
console.log('Proyek :', project);
console.log('Target :', evidence);
console.log('Menjalankan 3 file pengujian aktual, termasuk pengukuran coverage...\n');

const args = [
  jestBin, '--runInBand', '--runTestsByPath', ...specs,
  '--verbose', '--json', `--outputFile=${jsonPath}`,
  '--coverage', '--coverageReporters=json-summary', '--coverageReporters=text-summary',
  `--coverageDirectory=${coverageDir}`,
];
const p = spawnSync(process.execPath, args, {
  cwd: project, encoding: 'utf8', windowsHide: true,
  maxBuffer: 20 * 1024 * 1024, timeout: 240000,
});
const combinedLog = [p.stdout || '', p.stderr || ''].filter(Boolean).join('\n');
fs.writeFileSync(testLogPath, combinedLog, 'utf8');
if (p.error) console.warn('Catatan proses Jest:', p.error.message);
if (!fs.existsSync(jsonPath)) fail('Jest tidak menghasilkan JSON hasil test. Lihat ' + testLogPath);

let jest;
try { jest = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); }
catch (err) { fail('JSON hasil Jest tidak dapat dibaca: ' + err.message); }
const cases = [];
for (const suite of jest.testResults || []) {
  for (const a of suite.assertionResults || []) {
    const relPath = path.basename(suite.name || 'file-test-tidak-diketahui');
    cases.push({
      file: relPath,
      test: a.fullName || a.title || '(tanpa nama)',
      status: a.status === 'passed' ? 'PASS' : a.status === 'failed' ? 'FAIL' : 'SKIPPED',
    });
  }
}
const passed = Number(jest.numPassedTests || 0);
const failed = Number(jest.numFailedTests || 0);
const skipped = Number(jest.numPendingTests || 0) + Number(jest.numTodoTests || 0);
const total = Number(jest.numTotalTests || cases.length);
const suiteTotal = Number(jest.numTotalTestSuites || (jest.testResults || []).length);
const suitePassed = Number(jest.numPassedTestSuites || 0);
const suiteFailed = Number(jest.numFailedTestSuites || 0);

const coveragePath = path.join(coverageDir, 'coverage-summary.json');
let cov = null;
if (fs.existsSync(coveragePath)) {
  try { cov = JSON.parse(fs.readFileSync(coveragePath, 'utf8')).total || null; }
  catch (err) { console.warn('Coverage JSON tidak terbaca:', err.message); }
}
const branch = cov?.branches?.pct;
const branchText = typeof branch === 'number' ? branch.toFixed(2).replace('.', ',') + '%' : 'Tidak tersedia';
const thresholdText = typeof branch === 'number'
  ? (branch >= minBranch ? 'MEMENUHI AMBANG' : 'BELUM MEMENUHI AMBANG')
  : 'BELUM DAPAT DIVERIFIKASI';
const runAt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date());
const htmlEscape = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const tail = combinedLog.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter(Boolean).slice(-24).join('\n');
const metric = k => cov?.[k] && typeof cov[k].pct === 'number' ? `${cov[k].pct.toFixed(2).replace('.', ',')}%` : 'Tidak tersedia';

const rows = cases.map((c, i) => `<tr><td class="no">${i+1}</td><td>${htmlEscape(c.test)}</td><td class="status">${htmlEscape(c.status)}</td><td class="source">${htmlEscape(c.file)}</td></tr>`).join('\n');
const doc = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><title>Lampiran B. Bukti Pengujian White Box ASCIT</title>
<style>
@page { size: A4 portrait; margin: 17mm 16mm 16mm 17mm; }
* { box-sizing: border-box; }
body { font-family: "Times New Roman", Times, serif; margin: 0; color: #161616; font-size: 11pt; line-height: 1.35; }
.page { page-break-after: always; break-after: page; min-height: 250mm; position: relative; }
.page:last-child { page-break-after: auto; break-after: auto; }
h1 { font-size: 13pt; text-align: center; margin: 0 0 6mm 0; }
h2 { font-size: 11pt; margin: 2mm 0 4mm; }
p { margin: 0 0 3.5mm; text-align: justify; }
.caption { font-size: 10pt; font-weight: 700; text-align: center; margin-top: 4mm; }
.meta { margin: 4mm 0; width: 100%; border-collapse: collapse; font-size: 10pt; }
.meta td { border: 1px solid #666; padding: 2mm; vertical-align: top; }
.terminal { background: #181818; color: #f3f3f3; border: 1px solid #555; padding: 4mm; font: 8pt/1.22 Consolas, "Courier New", monospace; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4mm 0 2mm; max-height: 133mm; overflow: hidden; }
.note { font-size: 9.5pt; margin-top: 4mm; }
.table { width: 100%; border-collapse: collapse; font-size: 7.5pt; line-height: 1.12; table-layout: fixed; }
.table th, .table td { border-top: 1px solid #333; border-bottom: 1px solid #333; padding: 0.7mm 1mm; vertical-align: top; overflow-wrap: anywhere; }
.table th { text-align: center; background: #f1f1f1; }
.table .no { width: 7%; text-align: center; }
.table .status { width: 10%; text-align: center; }
.table .source { width: 22%; font-size: 7pt; }
.footer { position: absolute; bottom: 0; right: 0; font-size: 10pt; }
@media screen { body { background: #eee; } .page { width: 210mm; min-height: 297mm; background: white; padding: 17mm 16mm 16mm 17mm; margin: 12px auto; box-shadow: 0 1px 8px #bbb; } .footer { right: 16mm; bottom: 14mm; } }
</style></head><body>
<section class="page">
<h1>LAMPIRAN B<br>Bukti Hasil Pengujian White Box ASCIT</h1>
<h2>B.1 Dokumentasi Hasil Pengujian Jest</h2>
<p>Pengujian otomatis dijalankan terhadap tiga file pengujian terisolasi menggunakan Jest. Rekapitulasi ini dibentuk dari berkas JSON hasil eksekusi Jest, bukan dari status yang diisi secara manual.</p>
<table class="meta">
<tr><td>Tanggal eksekusi</td><td>${htmlEscape(runAt)} WIB</td></tr>
<tr><td>Test suite</td><td>${suitePassed} PASS, ${suiteFailed} FAIL, ${suiteTotal} total</td></tr>
<tr><td>Test case</td><td>${passed} PASS, ${failed} FAIL, ${skipped} SKIPPED, ${total} total</td></tr>
<tr><td>File bukti</td><td>jest-lampiran-b.json dan jest-lampiran-b-aktual.txt</td></tr>
</table>
<p><b>Cuplikan keluaran aktual Jest:</b></p>
<pre class="terminal">${htmlEscape(tail || 'Tidak terdapat keluaran teks. Lihat file JSON Jest.')}</pre>
<p class="caption">Gambar B.1 Dokumentasi Hasil Pengujian White Box Menggunakan Jest</p>
<p class="note">Catatan. Kotak di atas adalah cuplikan teks keluaran Jest yang dicatat oleh skrip, bukan foto layar terminal. Jika kampus meminta tangkapan layar asli, tampilkan file log pada terminal lalu ambil screenshot.</p>
<div class="footer">B-1</div>
</section>
<section class="page">
<h1>LAMPIRAN B<br>Bukti Hasil Pengujian White Box ASCIT</h1>
<h2>B.2 Dokumentasi Code Coverage</h2>
<p>Pengukuran cakupan kode dilakukan pada eksekusi Jest yang sama. Hasil branch coverage global dibandingkan dengan ambang minimal ${minBranch}% yang digunakan dalam evaluasi proyek.</p>
<table class="meta">
<tr><td>Statement coverage</td><td>${htmlEscape(metric('statements'))}</td></tr>
<tr><td>Branch coverage global</td><td><b>${htmlEscape(branchText)}</b></td></tr>
<tr><td>Function coverage</td><td>${htmlEscape(metric('functions'))}</td></tr>
<tr><td>Line coverage</td><td>${htmlEscape(metric('lines'))}</td></tr>
<tr><td>Ambang branch coverage</td><td>${minBranch}%</td></tr>
<tr><td>Evaluasi ambang</td><td><b>${htmlEscape(thresholdText)}</b></td></tr>
<tr><td>Sumber angka</td><td>coverage/coverage-summary.json</td></tr>
</table>
<p class="caption">Gambar B.2 Dokumentasi Hasil Pengukuran Code Coverage ASCIT</p>
<p class="note">Catatan. Keberhasilan test case dan pencapaian ambang cakupan kode adalah dua hal yang berbeda. Test case yang lulus tidak membuktikan semua jalur program sudah diuji. Jika hasil cakupan tidak tersedia, halaman ini tidak memberikan klaim angka.</p>
<p class="note">Hasil eksekusi proses Jest: exit code ${p.status === null ? 'tidak tersedia' : p.status}. Exit code tidak selalu menunjukkan test gagal, karena konfigurasi cakupan kode dapat menyebabkan proses keluar dengan kode gagal walaupun seluruh test case lulus.</p>
<div class="footer">B-2</div>
</section>
<section class="page">
<h1>LAMPIRAN B<br>Bukti Hasil Pengujian White Box ASCIT</h1>
<h2>B.3 Rincian Test Case Aktual</h2>
<p>Daftar berikut diperoleh langsung dari assertionResults yang tersimpan pada berkas JSON Jest. Jumlah skenario terdata ${cases.length} dan statusnya mengikuti hasil eksekusi aktual. Ini bukan seluruh rancangan skenario WB-01 sampai WB-71 pada Lampiran A.</p>
<p class="caption">Tabel B.1 Rincian Hasil Pengujian White Box ASCIT</p>
<table class="table"><thead><tr><th class="no">No.</th><th>Skenario pengujian (nama test Jest)</th><th class="status">Status</th><th class="source">File pengujian</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer">B-3</div>
</section>
</body></html>`;
fs.writeFileSync(htmlPath, doc, 'utf8');

// HTML dapat dicetak menjadi PDF dari browser menggunakan Ctrl+P.
// Tidak memanggil Chromium headless, supaya script stabil di Windows.
console.log('\nHASIL PENGUJIAN AKTUAL');
console.log(`Test Suites: ${suitePassed} passed / ${suiteTotal} total`);
console.log(`Tests: ${passed} PASS, ${failed} FAIL, ${skipped} SKIPPED (${total} total)`);
console.log(`Branch coverage: ${branchText}; ambang ${minBranch}% (${thresholdText})`);
console.log(`Exit code Jest: ${p.status} (dapat nonnol karena ambang coverage)`);
console.log('\nBERKAS YANG DIBUAT:');
for (const f of [testLogPath, jsonPath, coveragePath, htmlPath]) console.log('  ' + f);
console.log('Buka lampiran-b.html di Edge/Chrome, lalu tekan Ctrl+P dan simpan sebagai PDF.');
if (cases.length !== total) console.warn('PERINGATAN: Jumlah assertionResults berbeda dari jumlah total test yang dilaporkan Jest.');
