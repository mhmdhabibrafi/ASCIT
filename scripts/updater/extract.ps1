param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
    $size = 0L
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\','/')
        if ($name -match '(^/|:|(^|/)\.\.(/|$)|(^|/)\.env($|\.(?!(example|template)$))|(^|/)(node_modules|\.local|\.git|uploads)(/|$))') {
            throw "Isi paket tidak diizinkan: $name"
        }
        if (($entry.ExternalAttributes -band 0xF0000000) -eq 0xA0000000) { throw 'Symlink tidak diizinkan.' }
        $target = [IO.Path]::GetFullPath((Join-Path $root $name))
        if (-not $target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path paket tidak aman.' }
        $size += $entry.Length
        if ($size -gt 1GB) { throw 'Paket terlalu besar.' }
    }
} finally { $zip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($Archive, $root)
