import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./extract.ps1", import.meta.url));
test("Windows ZIP extractor accepts source and rejects traversal, secrets and data directories", { skip: process.platform !== "win32" }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ascit-zip-test-"));
  for (const [index, name] of ["package.json", ".env.example", ".env.template", "../escape.txt", "C:/escape.txt", ".env", ".env.production", ".local/postgres/data", "public/uploads/data", "node_modules/run.js"].entries()) {
    const archive = path.join(root, `${index}.zip`);
    const destination = path.join(root, `out-${index}`);
    const create = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $zip = [IO.Compression.ZipFile]::Open($env:TEST_ARCHIVE, 'Create')
      $entry = $zip.CreateEntry($env:TEST_ENTRY)
      $writer = New-Object IO.StreamWriter($entry.Open())
      $writer.Write('fixture'); $writer.Dispose(); $zip.Dispose()
    `], { env: { ...process.env, TEST_ARCHIVE: archive, TEST_ENTRY: name }, encoding: "utf8", windowsHide: true });
    assert.equal(create.status, 0, create.stderr);
    const extract = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", script, "-Archive", archive, "-Destination", destination], { encoding: "utf8", windowsHide: true });
    if (index < 3) {
      assert.equal(extract.status, 0, extract.stderr);
      assert.equal(await readFile(path.join(destination, name), "utf8"), "fixture");
    } else {
      assert.notEqual(extract.status, 0, name);
      await assert.rejects(access(destination));
    }
  }
});
