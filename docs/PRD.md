# SICAPS — Product Requirements Document (PRD)

## 1. Overview

**Nama Produk:** SICAPS (Sistem Cerdas AI untuk Pemeriksaan Skabies)  
**Versi:** MVP (Fase 1)  
**Oleh:** dr. Widjayanti — Universitas YARSI  
**Tanggal:** 22 Juni 2026

### 1.1 Deskripsi Produk

SICAPS adalah chatbot berbasis web yang melakukan skrining awal skabies melalui percakapan interaktif. Sistem menerima input suara atau teks dari pengguna, mengekstrak keyword klinis, menghitung skor risiko, memahami persepsi penyakit pasien, dan memberikan output berupa kesimpulan risiko, respons psikologis, rekomendasi aksi, serta saran penanganan yang dipersonalisasi.

### 1.2 Tujuan

- Menyediakan skrining awal skabies yang mudah diakses oleh santri di pondok pesantren
- Memfasilitasi kader kesehatan dalam pencatatan dan monitoring kesehatan santri
- Memberikan edukasi dan saran penanganan berdasarkan tingkat risiko
- Mengumpulkan data epidemiologi untuk penelitian
- Menghubungkan hasil screening dengan dokter untuk review klinis

### 1.3 Target User

| User | Deskripsi |
|------|-----------|
| Santri | Pengguna utama yang melakukan screening (via kader atau mandiri) |
| Kader Kesehatan | Petugas lapangan yang menginput/mencatat screening santri |
| Dokter | Tenaga medis yang mereview hasil screening |
| Admin/Peneliti | Pengelola sistem dan pengumpul data riset |
| User Umum | Masyarakat umum yang ingin screening mandiri |

---

## 2. User Roles & Permissions

### 2.1 Admin
| Fitur | Deskripsi |
|-------|-----------|
| Approve/Reject User | Mengelola registrasi Kader dan Dokter |
| Lihat Semua Data | Akses seluruh data screening |
| Export Data | Download CSV/Excel untuk riset |
| Kelola User | Aktivasi/deaktivasi akun |

### 2.2 Dokter (Perlu Approval Admin)
| Fitur | Deskripsi |
|-------|-----------|
| Antrian Review | Melihat screening dengan skor ≥ 4 |
| Review Hasil | Konfirmasi/koreksi diagnosis AI |
| Respons Klinis | Structured input + free text + override saran |
| Rujukan | Mengarahkan pasien ke fasilitas kesehatan |

### 2.3 Kader (Perlu Approval Admin)
| Fitur | Deskripsi |
|-------|-----------|
| Kelola Responden | Tambah/edit data responden (santri/peserta) |
| Jalankan Screening | Memulai sesi screening untuk responden |
| Lihat Hasil | Melihat hasil screening + respons dokter |
| Serahkan Device | Memberikan device ke responden saat menjawab pertanyaan |

### 2.4 User Umum (Login Opsional)
| Fitur | Deskripsi |
|-------|-----------|
| Screening Mandiri | Isi demografis + jalankan screening sendiri |
| Riwayat | Melihat riwayat screening sendiri |
| Mode Incognito | Screening tanpa tersimpan di riwayat akun (lihat [AI_BOT_SPEC.md §14.3](./phase-1/AI_BOT_SPEC.md)) |

### 2.5 Anonim (Tanpa Login)
| Fitur | Deskripsi |
|-------|-----------|
| Screening 1x | Isi demografis minimal + screening |
| Lihat Hasil | Di akhir sesi + shareable link |
| Riwayat Lokal | Tersimpan di browser (localStorage, 30 hari). Bisa lihat ulang hasil & transcript chat. |
| Data Tersimpan | Untuk keperluan riset (dengan UUID session) |

---

## 3. Fitur & User Stories

### 3.1 Landing Page

**US-01:** Sebagai pengunjung, saya ingin melihat penjelasan SICAPS agar memahami fungsinya.

**Acceptance Criteria:**
- Menampilkan judul "SICAPS – Cek Keluhan Gatalmu dengan AI"
- Deskripsi singkat: analisis gejala, nilai risiko skabies, berikan saran
- Disclaimer di awal: "SICAPS bukan pengganti dokter. Hasil skrining bersifat edukasi."
- Tombol CTA: "Mulai Screening" dan "Login"
- Link ke halaman Cara Penggunaan
- Tombol "Riwayat Screening" (secondary) — hanya tampil jika ada data riwayat di localStorage

---

### 3.2 Autentikasi & Registrasi

**US-02:** Sebagai user, saya ingin mendaftar dan login sesuai role saya.

**Acceptance Criteria:**
- Form register dengan pilihan role: Kader, Dokter, User Umum
- Login via email/password (Supabase Auth)
- Opsi "Lanjut tanpa login" untuk anonim
- Kader & Dokter mendapat status "Pending Approval" setelah register
- Pesan informatif jika akun belum di-approve
- Redirect sesuai role setelah login

---

### 3.3 Form Demografis

**US-03:** Sebagai user/kader, saya ingin mengisi data demografis responden untuk keperluan riset.

**Acceptance Criteria:**

#### 3.3.1 Pre-chat Form (Diisi oleh semua user sebelum screening)

| Field | Tipe | Keterangan |
|-------|------|------------|
| Nama | Text | Opsional |
| Usia | Number | Tahun |
| Jenis Kelamin | Toggle | Laki-laki, Perempuan |
| Tingkat Pendidikan | Dropdown | SD, SMP, SMA, Perguruan Tinggi |

- Hanya 1 step, minimal friction
- Tingkat Pendidikan menentukan chat theme (SD → Playful, lainnya → Hybrid)
- Data kebiasaan dan riwayat digali oleh bot dalam chat (lihat [AI_BOT_SPEC.md §2.3](./phase-1/AI_BOT_SPEC.md))

#### 3.3.2 Form Pengelompokan Kader (Fase 2)

Data lokasi dan institusi dikelola oleh Kader di dashboard terpisah:

| Field | Tipe | Keterangan |
|-------|------|------------|
| Provinsi | Dropdown | Bertingkat (data Kemendagri) |
| Kabupaten/Kota | Dropdown | Filter by Provinsi |
| Kecamatan | Dropdown | Filter by Kab/Kota |
| Desa/Kelurahan | Dropdown | Filter by Kecamatan |
| Nama Pondok/Institusi | Text | Opsional |
| Durasi Tinggal | Dropdown | <6 bln, 6-12 bln, 1-2 thn, >2 thn |
| Jumlah Penghuni Kamar | Number | — |

- Data ini melekat ke profil kader/pondok, bukan per sesi screening
- Digunakan untuk pengelompokan dan statistik wilayah

---

### 3.4 Chat Screening

**US-04:** Sebagai user, saya ingin berinteraksi dengan chatbot untuk menceritakan keluhan melalui teks atau suara.

> **Detail lengkap:** Lihat [AI_BOT_SPEC.md](./phase-1/AI_BOT_SPEC.md) untuk spesifikasi persona, conversation flow, keyword extraction, adaptive language, edge cases, dan safety guardrails.

**Acceptance Criteria:**
- UI bubble chat (mirip WhatsApp)
- Input: text field + tombol voice (Web Speech API browser)
- Output: text bubble + voice output (Web Speech API TTS) — lihat [AI_BOT_SPEC.md §13](./phase-1/AI_BOT_SPEC.md)
- Voice mode toggle di input area (sebelah tombol mic 🎤): ON → auto-TTS + auto-STT (full-voice experience)
- Long-press bubble AI → play TTS bubble tersebut (on-demand)
- AI memulai dengan greeting statis (berbeda per theme — lihat AI_BOT_SPEC §2.4)
- AI menggali 6 kategori scoring secara **adaptive** (bukan rigid berurutan):
  1. Intensitas gatal
  2. Waktu muncul
  3. Distribusi lokasi tubuh
  4. Riwayat kontak
  5. Lesi kulit
  6. Faktor risiko (incl. kebiasaan, riwayat skabies/pengobatan)
- Persepsi user di-**infer** dari konteks percakapan (bukan pertanyaan terpisah)
- Chat theme ditentukan oleh tingkat pendidikan: SD → Playful, lainnya → Hybrid
- Follow-up max 1x per kategori jika confidence rendah. Jika tetap ambigu → terima sebagai confidence `medium`, masuk scoring
- Chat input di-disable setelah result ditampilkan (tidak ada interaksi post-result)

---

### 3.5 Keyword Extraction & Scoring (Backend)

**US-05:** Sebagai sistem, saya mengekstrak keyword dan menghitung skor risiko secara akurat.

> **Detail arsitektur LLM & extraction:** Lihat [AI_BOT_SPEC.md §3-4](./phase-1/AI_BOT_SPEC.md)

**Acceptance Criteria:**

**Alur:**
1. User menjawab → kirim ke LLM (single call: respond + extract)
2. LLM ekstrak keywords per kategori + confidence score (high/medium/low) → return structured JSON
3. Backend normalize & match keywords ke tabel skor → hitung skor per kategori
4. Backend update state → kirim instruction ke LLM untuk turn berikutnya

**Scoring Rules:**
- Kumulatif: semua keyword yang match dijumlahkan
- Longest match priority: "gatal banget" match → "gatal" tidak dihitung lagi
- Unique: setiap keyword unik hanya dihitung 1x meskipun diulang
- Floor 0 per kategori: keyword negatif mengurangi, tapi skor min = 0
- Total skor akhir juga floor 0
- Confidence `low` → keyword tidak masuk scoring sampai dikonfirmasi
- Confidence `medium`/`high` → keyword masuk scoring

**Tabel Keyword & Skor:**

**Intensitas Gatal (skor per pattern: 1):**
| Keyword | Skor |
|---------|------|
| gatal banget, gatal, parah, parah banget | 1 |
| ga tahan / nggak tahan | 1 |
| pengen garuk terus / garuk terus | 1 |
| ganggu tidur / sampe kebangun / ga bisa tidur | 1 |
| sampe luka / berdarah | 1 |
| perih, lumayan gatal / agak gatal, dikit doang | 0 |

**Waktu (skor per pattern: 2):**
| Keyword | Skor |
|---------|------|
| malam / tiap malam | 2 |
| makin parah malam | 2 |
| pas mau tidur / tengah malam / kebangun malam / subuh | 2 |
| Siang/Pagi mendingan | 1 |
| sepanjang hari / terus-terusan | 1 |

**Lokasi (skor per pattern: 2):**
| Keyword | Skor |
|---------|------|
| sela jari / sela sela jari | 2 |
| kelamin / buah zakar / batang kelamin | 2 |
| jari tangan / pergelangan / ketiak / pusar / perut / pinggang / bokong / pantat / selangkangan / paha dalam / dada | 1 |
| Seluruh badan | 0 |

**Riwayat Kontak (skor per pattern: 2):**
| Keyword | Skor |
|---------|------|
| temen sekamar / teman sekamar / satu kamar | 2 |
| serumah / temen pondok | 2 |
| banyak yang gatal / barengan gatal / ketularan / nular | 2 |
| satu kasur / satu selimut | 2 |

**Lesi Kulit (skor per pattern: 2):**
| Keyword | Skor |
|---------|------|
| bintil / bintil kecil | 2 |
| bentol / bentol bentol | 1 |
| merah merah / beruntusan | 1 |
| lecet / luka / luka garukan / koreng / bernanah | 1 |
| garis / jalur | 1 |
| kayak digigit | 0 |
| kulit kering / pecah pecah | 0 |

**Faktor Risiko (skor per pattern: 2):**
| Keyword | Skor |
|---------|------|
| pondok / asrama | 2 |
| sekamar rame / banyak orang / desek desekan | 2 |
| tukeran baju / pinjem baju / tukeran sarung / tukeran handuk | 2 |
| kasur barengan | 2 |
| jarang ganti sprei / kebersihan kurang / jarang cuci tangan | 2 |

**Keyword Negatif (semua kategori):**
| Keyword | Skor |
|---------|------|
| ga gatal / tidak gatal | -2 |
| cuma siang / tidak malam | -1 |
| sendiri / ga ada yang lain | -2 |
| kulit normal / ga ada bentol | -2 |

**Interpretasi Skor Total:**
| Skor | Level | Interpretasi |
|------|-------|-------------|
| ≥ 7 | Tinggi | Kemungkinan besar skabies |
| 4 – 6 | Sedang | Curiga skabies, perlu evaluasi lanjut |
| ≤ 3 | Rendah | Kemungkinan kecil skabies |

---

### 3.6 Persepsi Penyakit

**US-06:** Sebagai sistem, saya ingin memahami persepsi pasien untuk memberikan respons yang sesuai.

> **Detail implementasi:** Lihat [AI_BOT_SPEC.md §8.3](./phase-1/AI_BOT_SPEC.md)

Persepsi user **di-infer dari konteks percakapan** (bukan pertanyaan eksplisit). LLM mendeteksi indikator persepsi dari kalimat user sepanjang chat.

**Mapping Persepsi:**
| Persepsi | Indikator | Respons AI di Output |
|----------|-----------|---------------------|
| Underestimate | "cuma gatal biasa", "gapapa", "nanti sembuh" | "Walaupun terlihat ringan, kondisi ini bisa menular ke orang lain." |
| Overestimate | "takut banget", "ini bahaya ga", "parno" | "Tidak perlu terlalu khawatir, kondisi ini umumnya bisa ditangani." |
| Barrier | "malu", "males periksa", "ga ada biaya" | "Kamu bisa mulai dari konsultasi online atau fasilitas kesehatan terdekat." |
| Adequate | "mau periksa", "harus diobatin" | "Kamu sudah berada di pemahaman yang tepat." |

---

### 3.7 Output Hasil Screening

**US-07:** Sebagai user, saya ingin melihat hasil screening yang jelas dan actionable.

> **Detail output generation:** Lihat [AI_BOT_SPEC.md §8](./phase-1/AI_BOT_SPEC.md)

**Output 4 bagian:**

1. **Kesimpulan & Level Risiko** (LLM-generated, berdasarkan skor total)
2. **Respons Persepsi** (LLM-generated, adaptif terhadap persepsi user yang di-infer)
3. **Rekomendasi Aksi** (LLM paraphrase dari template per level — substance fixed):
   - Tinggi: Segera periksa ke tenaga kesehatan, hindari berbagi barang
   - Sedang: Pantau, segera periksa jika makin parah, jaga kebersihan
   - Rendah: Jaga kebersihan kulit, periksa jika tidak membaik
4. **Saran Penanganan Personalisasi** (LLM-generated berdasarkan konteks jawaban user)

**Tampilan:**
- Semua user: Total skor + level risiko + breakdown per kategori + 4 bagian output
- Dashboard Kader/Dokter/Admin (Fase 2): Semua di atas + full chat transcript
- Disclaimer di result card: "Ini bukan diagnosis medis. Untuk penanganan yang tepat, konsultasikan ke tenaga kesehatan."
- Jika skor ≥ 4: label "Disarankan konsultasi ke tenaga kesehatan" (MVP). Label "Menunggu review dokter" baru aktif di Fase 2 saat sistem dokter tersedia.
- Tombol: "Mulai Screening Baru" & "Kembali ke Beranda"

---

### 3.8 Riwayat Screening (Phase 1 — Client-Side)

**US-08:** Sebagai pengguna anonim, saya ingin melihat riwayat screening yang pernah saya lakukan agar bisa mengecek hasil sebelumnya tanpa perlu screenshot.

**Acceptance Criteria:**

| # | Kriteria |
|---|----------|
| 1 | Halaman `/history` menampilkan list screening **yang sudah selesai** dari localStorage |
| 2 | Setiap item menampilkan: tanggal, risk badge (warna), skor total, mode (AI/questionnaire) |
| 3 | "Lihat Hasil" → navigasi ke halaman result |
| 4 | "Lihat Chat" → navigasi ke halaman chat dalam mode read-only (hide input, scroll-only) |
| 5 | Riwayat otomatis terhapus setelah 30 hari (auto-expire) |
| 6 | Tombol "Hapus Semua Riwayat" dengan confirmation dialog |
| 7 | Privacy note: "Riwayat hanya tersimpan di perangkat ini" |
| 8 | Landing page: tombol "Riwayat Screening" conditional (hanya tampil jika ada data di localStorage) |
| 9 | Empty state: ilustrasi Capi + "Belum ada riwayat" + CTA mulai screening |
| 10 | localStorage hanya simpan metadata (sessionId, shareToken, tanggal, skor, risk level, mode) — bukan konten chat |
| 11 | Transcript chat dapat dibuka kembali dalam mode read-only (tanpa input, scroll-only) |

**Batasan & Desain:**

| Aspek | Detail |
|-------|--------|
| Storage | localStorage browser — data tidak dikirim ke server |
| Kapan disimpan | Setelah screening **completed** (result diterima). Session incomplete tidak masuk riwayat. |
| Keamanan | Akses detail require sessionId + shareToken (double verification) |
| Expire | 30 hari dari tanggal screening |
| Cross-device | Tidak support — riwayat hanya per device/browser |
| Incognito browser | Riwayat tidak tersimpan (localStorage dihapus saat tab ditutup) |

**Phase 2 Upgrade:**

Saat user login, riwayat localStorage di-migrate ke server:
- Frontend kirim sessionId + shareToken pairs ke backend
- Backend verify & link ke userId
- Halaman `/history` switch source: localStorage → API
- Fitur "Mode Incognito" (§2.4) = screening yang tidak di-link ke akun
- **Resume incomplete sessions:** Tampilkan session belum selesai dengan tombol "Lanjutkan". Jika expired (>24 jam), handle gracefully: "Sesi kedaluwarsa, mulai baru?"

---

### 3.9 Dashboard Kader

**US-09:** Sebagai kader, saya ingin mengelola responden dan melihat hasil screening.

**Acceptance Criteria:**
- Daftar responden: nama, tanggal screening terakhir, status (belum/selesai/pending review)
- Tombol "Tambah Responden" → form demografis
- Detail per responden: hasil screening + skor detail + respons dokter
- Filter/search responden

---

### 3.10 Dashboard Dokter

**US-10:** Sebagai dokter, saya ingin mereview hasil screening yang membutuhkan perhatian klinis.

**Acceptance Criteria:**
- Antrian: list screening skor ≥ 4, sorted terbaru
- Per item tampilkan: data demografis, jawaban chat, skor per kategori, output AI
- Form review:
  - Konfirmasi/Koreksi level risiko (dropdown)
  - Catatan dokter (free text)
  - Override/tambah saran penanganan
  - Aksi: Rujuk ke faskes / Cukup edukasi / Lainnya
- Status tracking: Pending → Reviewed
- Saran AI yang di-override ditampilkan sebagai "Catatan Dokter" ke user/kader

---

### 3.11 Dashboard Admin

**US-11:** Sebagai admin, saya ingin mengelola user dan mengakses data riset.

**Acceptance Criteria:**
- List Kader & Dokter pending → tombol Approve/Reject
- Export data screening ke CSV (filter: tanggal, wilayah, level risiko)
- Overview: total user, total screening, breakdown per status

---

### 3.12 Halaman Cara Penggunaan

**US-12:** Sebagai user, saya ingin panduan cara menggunakan SICAPS.

**Acceptance Criteria:**
- Step-by-step penggunaan
- Penjelasan tentang SICAPS dan limitasinya
- Contoh alur percakapan
- FAQ

---

## 4. Non-Functional Requirements

### 4.1 Performa
- Respons chat AI < 5 detik
- Halaman load < 3 detik (3G network)
- Voice-to-text latency < 2 detik

### 4.2 Keamanan
- Rate limiting pada endpoint LLM
- Role-based access control (RBAC)
- Input validation & sanitization
- CSRF protection
- Data medis di-handle dengan prinsip privasi
- API key tidak exposed ke client

### 4.3 Aksesibilitas
- Mobile-first responsive design (3 breakpoints: mobile < 640px, tablet 640-1024px, desktop > 1024px)
- Voice input (STT) sebagai alternatif mengetik
- Voice output (TTS) sebagai alternatif membaca — Web Speech API, detail di [AI_BOT_SPEC.md §13](./phase-1/AI_BOT_SPEC.md)
- Bahasa Indonesia (semi-informal)
- Minimum WCAG 2.1 AA
- Adaptive chat theme berdasarkan tingkat pendidikan — see [DESIGN_SPEC.md](./phase-1/DESIGN_SPEC.md)
- PDF download hasil screening (dengan header YARSI)
- Shareable link hasil

### 4.4 Reliabilitas
- Graceful fallback jika LLM tidak tersedia
- Session recovery jika koneksi terputus
- Error handling yang informatif

---

## 5. Fase Pengembangan

### Fase 1 — MVP (Scope Minimal)
- Landing page sederhana + disclaimer
- Anonim saja (tanpa login/register)
- Form demografis
- Chat screening (bubble chat + voice input)
- Scoring engine (hybrid: LLM extract → backend hitung)
- Output hasil screening (4 bagian + disclaimer)
- Data persist ke Supabase (untuk riset)
- Bilingual support (Indonesia + English) — see [BILINGUAL_SPEC.md](./phase-1/BILINGUAL_SPEC.md)
- LLM via Hugging Face Inference API
- Deploy: Vercel (frontend + API) + Supabase (DB)

### Fase 2 — Auth & Roles
- Login/Register system (Supabase Auth)
- Role: Admin, Dokter, Kader, User Umum
- Admin approval kader/dokter
- Dashboard Kader (kelola responden)
- Dashboard Dokter (review skor ≥ 4)
- Dashboard Admin (approve + export)
- Image-based assessment (custom CV model) — see [IMAGE_ASSESSMENT_SPEC.md](./phase-2/IMAGE_ASSESSMENT_SPEC.md)

### Fase 3 — Enhancement
- Statistik real-time (chart distribusi risiko, tabel per wilayah)
- Peta sebaran interaktif
- Notifikasi email/push untuk dokter saat screening baru masuk
- PWA (Progressive Web App) untuk offline access
- LLM migrasi ke self-deployed server

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Screening completed/minggu | ≥ 50 |
| Akurasi vs diagnosis dokter | ≥ 80% |
| Response time dokter | < 24 jam |
| User drop-off rate (mulai tapi tidak selesai) | < 20% |
| Coverage wilayah | ≥ 5 pondok |
