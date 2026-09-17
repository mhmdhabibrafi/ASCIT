# Panduan Instalasi Docker & Deployment ASCIT di Ubuntu Server

> **Panduan Deployment Server**  
> Sistem: **ASCIT (Asset Care Information Technology System)**  
> Pengembang / Pencipta: **Muhammad Habib Rafi** ([@mhmdhabibrafi](https://github.com/mhmdhabibrafi))  
> Repositori: [https://github.com/mhmdhabibrafi/ASCIT](https://github.com/mhmdhabibrafi/ASCIT)  
> Pusat Bantuan: [GitHub Issues](https://github.com/mhmdhabibrafi/ASCIT/issues)  

---

Panduan ini mencakup instalasi **Docker Engine**, **Docker Compose**, konfigurasi keamanan sistem, dan langkah deployment aplikasi **ASCIT** pada Ubuntu Server (22.04 LTS, 24.04 LTS, atau 26.04 LTS 64-bit).

---

## 1. Akses Server & Persiapan Awal

Masuk ke server produksi atau staging melalui SSH:

```bash
ssh nama_user@IP_SERVER_RS_AWAL_BROS
```

Periksa versi sistem operasi dan arsitektur CPU:

```bash
cat /etc/os-release
dpkg --print-architecture
```

Pastikan server terhubung ke internet dan paket sistem berada pada versi terkini:

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 2. Pembersihan Paket Lama / Konflik

Hapus paket Docker lama yang mungkin terpasang dari repositori default Ubuntu:

```bash
sudo apt remove -y docker.io docker-compose docker-compose-v2 \
  docker-doc podman-docker containerd runc
```

---

## 3. Konfigurasi Repositori Resmi Docker

Pasang paket prasyarat untuk komunikasi HTTPS dan sertifikat:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
```

Tambahkan kunci GPG resmi Docker ke sistem:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Tambahkan repositori resmi Docker ke daftar sumber APT:

```bash
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

---

## 4. Instalasi Docker Engine & Docker Compose

Pasang Docker CE dan plugin Compose:

```bash
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Aktifkan service Docker agar otomatis berjalan saat server menyala (*boot on startup*):

```bash
sudo systemctl enable --now docker
```

Verifikasi status layanan dan versi:

```bash
sudo systemctl status docker --no-pager
sudo docker version
sudo docker compose version
```

---

## 5. Konfigurasi Hak Akses User (Opsional)

Agar dapat menjalankan Docker tanpa mengetikkan `sudo` setiap kali:

```bash
sudo usermod -aG docker "$USER"
```

> **Catatan**: Logout dari sesi SSH (`exit`) dan masuk kembali agar perubahan grup pengguna aktif.

---

## 6. Deployment Aplikasi ASCIT

### A. Clone Repositori ke Direktori Server

```bash
sudo mkdir -p /opt/ascit
sudo chown -R $USER:$USER /opt/ascit
cd /opt/ascit
git clone <URL_REPOSITORY_ASCIT> .
```

### B. Konfigurasi Lingkungan (`.env`)

Buat file environment dari template:

```bash
cp .env.example .env
nano .env
```

Pastikan variabel-variabel kunci telah disesuaikan:

```env
# URL Database PostgreSQL internal Docker
DATABASE_URL="postgresql://ascit_admin:PasswordAmanASCIT2026@postgres:5432/ascit?schema=public"

# Kunci rahasia sesi NextAuth (Gunakan: openssl rand -base64 32)
NEXTAUTH_SECRET="KunciRahasiaAcakYangSangatPanjangDanAman2026"
NEXTAUTH_URL="http://IP_SERVER:3000"

# Identitas Rumah Sakit
NEXT_PUBLIC_APP_NAME="ASCIT"
NEXT_PUBLIC_HOSPITAL_NAME="RS Awal Bros Panam"
NEXT_PUBLIC_HOSPITAL_SITE="RS Awal Bros Panam Pekanbaru"
```

### C. Build & Jalankan Container

Jalankan seluruh service (Aplikasi ASCIT + Database PostgreSQL) di latar belakang:

```bash
docker compose up -d --build
```

Pantau proses build dan inisialisasi:

```bash
docker compose ps
docker compose logs -f app
```

---

## 7. Keamanan Jaringan & Firewall (UFW)

Untuk lingkungan rumah sakit, amankan port server menggunakan firewall UFW:

```bash
# Izinkan akses SSH
sudo ufw allow OpenSSH

# Izinkan port web aplikasi ASCIT (atau reverse proxy Nginx)
sudo ufw allow 3000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Aktifkan firewall
sudo ufw enable
sudo ufw status verbose
```

> **PERINGATAN**: Jangan pernah mengekspos port database `5432` ke jaringan publik atau eksternal. Database harus terisolasi di dalam network internal Docker atau di-bind ke `127.0.0.1`.

---

## 8. Prosedur Backup & Restore Rutin

### Backup Database:
```bash
docker compose exec -T postgres pg_dump -U ascit_admin ascit > /opt/ascit/backups/ascit_backup_$(date +%F_%H%M).sql
```

### Restore Database:
```bash
cat /opt/ascit/backups/file_backup.sql | docker compose exec -T postgres psql -U ascit_admin -d ascit
```

---

## 9. Pemeliharaan & Pembaruan Sistem

Untuk memperbarui aplikasi ke versi terbaru dari repositori Git:

```bash
cd /opt/ascit
git pull origin main
docker compose down
docker compose up -d --build
```

Untuk memperbarui paket engine Docker:

```bash
sudo apt update
sudo apt install --only-upgrade docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

---

## 10. Bantuan & Dukungan Teknis

Jika ditemukan kendala teknis saat deployment atau pengoperasian di server:

* **Pengembang**: **Muhammad Habib Rafi** ([@mhmdhabibrafi](https://github.com/mhmdhabibrafi))
* **Pelaporan Masalah**: Silakan buat tiket kendala pada **[GitHub Issues](https://github.com/mhmdhabibrafi/ASCIT/issues)**.

---
*Copyright © 2026 Muhammad Habib Rafi. All rights reserved.*
