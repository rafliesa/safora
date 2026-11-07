# Spesifikasi desain dashboard HEALY

| Dokumen | Keterangan |
| --- | --- |
| Revisi | 2.0, 7 November 2026 |
| Acuan visual | Presentasi Canva RAISE, slide 1–3 |
| Sumber | [Presentasi referensi](https://canva.link/fx0agynk1cdh47z) |
| Acuan produk | HEALY_PRD.md versi 1.2 dan alur yang dikonfirmasi dalam FLOW.md |
| Lingkup | Warna, tipografi, layout, komponen, dan state frontend workspace HSE |

## 1. Arah visual dari presentasi Canva

Presentasi telah ditinjau melalui preview 22 slide. Slide 1–3 menampilkan identitas RAISE yang sesuai dengan dua gambar referensi pengguna. Gunakan ketiga slide tersebut sebagai acuan utama. Slide berikutnya memuat materi dan variasi template lain.

Ciri visual yang diterapkan ke dashboard adalah biru baja, hitam pekat, biru muda sebagai highlight, latar putih keabuan, judul tebal, serta header panel dengan gradien horizontal. Konten memiliki pembagian bidang yang jelas dan angka utama berukuran besar.

| Elemen pada presentasi | Penerapan pada dashboard |
| --- | --- |
| Header hitam menuju biru baja | Header halaman, aksen merek, dan kepala kartu asesmen |
| Highlight biru muda di belakang teks | Pilihan aktif, anotasi singkat, dan ringkasan pendukung |
| Latar putih keabuan | Canvas aplikasi |
| Kotak informasi dengan garis tegas | Kartu dan tabel dengan border yang jelas |
| Judul besar dan tebal | Judul halaman dan angka metrik |
| Foto industri berlapis biru gelap | Aksen branding opsional pada masthead ketika aset tersedia |
| Garis vertikal pendek di kiri judul | Penanda bagian atau judul kartu |

Token warna di bawah merupakan adaptasi dari preview Canva. Nilai latar dan highlight diambil dari bidang warna yang berulang pada preview. Stop gradien, font frontend, radius, dan jarak adalah spesifikasi implementasi yang disesuaikan untuk dashboard.

Nama merek pada UI berasal dari konfigurasi nama aplikasi di proyek. Gaya wordmark mengikuti judul tebal pada referensi.

## 2. Palet utama

| Token | HEX | Pemakaian |
| --- | --- | --- |
| `canvas` | `#F3F3F3` | Latar luar aplikasi, mengikuti latar slide 2–3 |
| `surface` | `#FFFFFF` | Kartu, tabel, modal, dan bidang isi |
| `surface-muted` | `#F7F9FB` | Metadata dan bidang isi sekunder |
| `surface-blue` | `#E8F0F6` | Kepala tabel, tab, dan pilihan lembut |
| `brand-black` | `#050404` | Stop awal gradien dan bidang branding gelap |
| `brand-mid` | `#243F57` | Stop tengah gradien dan lapisan navy |
| `brand` | `#47769E` | Biru baja utama dari header referensi |
| `brand-deep` | `#2D4C69` | Tombol utama, judul bagian, dan pilihan aktif |
| `brand-hover` | `#345A78` | Hover tombol dan tautan |
| `highlight` | `#9BBEDC` | Highlight seperti blok teks pada slide |
| `ink` | `#111820` | Judul utama, teks isi, dan angka |
| `text-secondary` | `#405567` | Deskripsi dan label pendukung |
| `text-muted` | `#607080` | Metadata, timestamp, dan catatan |
| `text-on-dark` | `#FFFFFF` | Teks di atas header gradien |
| `border` | `#CEDAE4` | Border kartu dan pemisah tabel |
| `border-strong` | `#7D97AB` | Border input dan kontrol yang perlu mudah dikenali |
| `preview` | `#08131C` | Latar panel rekaman |
| `preview-control` | `#173044` | Toolbar dan kapsul metadata rekaman |

Gunakan `brand-deep` untuk tombol isi dengan label putih. `brand` dipakai sebagai aksen, garis grafik, dan stop gradien. `highlight` dipasangkan dengan teks gelap.

### Warna semantik

Warna merek dan warna risiko memiliki fungsi yang berbeda dalam UI.

| Token | Latar | Teks/ikon | Penggunaan |
| --- | --- | --- | --- |
| `risk-low` | `#ECFDF3` | `#166534` | Label Low dan status yang sesuai |
| `risk-medium` | `#FFFBEB` | `#854D0E` | Label Medium dan kebutuhan pemeriksaan |
| `risk-high` | `#FEF2F2` | `#991B1B` | Label High dan prioritas tindakan |
| `status-info` | `#E8F0F6` | `#2D4C69` | Informasi pengukuran dan konteks |
| `status-neutral` | `#F1F5F9` | `#475569` | Belum direview, cakupan belum lengkap, dan status kosong |
| `status-demo` | `#E8F0F6` | `#2D4C69` | Data demo dan Simulasi |
| `status-reviewed` | `#ECFDF3` | `#166534` | Review HSE selesai untuk revisi yang ditampilkan |

Setiap badge memiliki teks dan dapat memakai ikon atau titik sebagai penanda tambahan. Status hasil AI, label risiko, dan status review ditampilkan dengan label masing-masing.

## 3. Gradien dan aksen

Gunakan gradien yang terinspirasi header presentasi.

```css
--gradient-brand: linear-gradient(
  90deg,
  #050404 0%,
  #243f57 45%,
  #47769e 100%
);

--gradient-title-marker: linear-gradient(
  180deg,
  #050404 0%,
  #47769e 100%
);
```

Penerapannya sebagai berikut.

- Header utama dapat memakai gradien dengan wordmark putih.
- Kepala kartu MSD dan kebisingan dapat memakai gradien yang sama, dengan ikon dan judul berbeda.
- Garis penanda di kiri judul menggunakan gradien vertikal selebar 4–6 px.
- Isi kartu, tabel, form, dan grafik menggunakan permukaan terang.
- Highlight teks memakai blok biru muda dengan padding horizontal 4–6 px.
- Border putus-putus cocok untuk area lampiran atau placeholder rekaman yang memerlukan tindakan.

Untuk masthead dengan foto industri yang sudah tersedia, gunakan lapisan navy transparan agar teks putih terbaca. Tinggi masthead mengikuti kebutuhan halaman dan memberi ruang utama untuk data.

## 4. Tipografi

Karakter font pada preview adalah sans-serif geometris dengan judul berat. Gunakan Poppins sebagai padanan frontend yang mendekati karakter tersebut. Pemilihan family ini merupakan adaptasi visual karena preview yang dibaca tidak memberikan metadata family font.

Inter dapat menjadi fallback sesuai font yang tersedia pada proyek. Pakai `font-variant-numeric: tabular-nums` pada angka, tabel, waktu, dan metrik.

| Peran | Desktop | Mobile | Bobot |
| --- | --- | --- | --- |
| Wordmark | 26–32 px | 22–26 px | 800 |
| Judul halaman | 30–34 px | 24–28 px | 700–800 |
| Angka metrik utama | 32–40 px | 28–32 px | 700–800 |
| Judul kartu asesmen | 18–20 px | 17–18 px | 700 |
| Judul bagian | 16–18 px | 16 px | 600–700 |
| Isi dan rekomendasi | 14–16 px | 14–16 px | 400–500 |
| Isi tabel | 13–14 px | 13–14 px | 400–600 |
| Metadata dan badge | 12–13 px | 12–13 px | 500–600 |

Gunakan line-height 1.2–1.3 untuk judul dan 1.45–1.6 untuk isi. Subtitle branding boleh menggunakan italic seperti presentasi, sementara informasi asesmen memakai bentuk reguler agar mudah dipindai.

Teks rekomendasi dapat membungkus. Pasangkan angka utama dengan satuan dan penjelasan interval yang lebih kecil.

## 5. Layout, bentuk, dan jarak

Kerangka desktop yang sudah tercatat pada spesifikasi awal dapat dipakai sebagai titik awal. Pada viewport 1568 × 1176, wadah aplikasi memiliki lebar maksimum sekitar 1472 px dengan margin luar 48 px. Ukuran aktual mengikuti layout frontend dan tinggi konten.

| Elemen | Spesifikasi |
| --- | --- |
| Wadah aplikasi | Radius 24–28 px, permukaan putih, border ringan |
| Kartu standar | Radius 14–16 px, border 1 px |
| Panel utama atau modal | Radius 18–20 px |
| Kepala kartu | Tinggi minimum 52–60 px, radius mengikuti kartu |
| Field dan tombol | Tinggi minimum 44 px, radius 10–12 px |
| Badge | Tinggi minimum 26 px, radius penuh |
| Ikon | 18–22 px dengan area interaksi minimum 44 × 44 px |
| Padding kartu | 20–24 px pada desktop, 16–20 px pada mobile |
| Jarak antarkartu | 20–24 px |
| Jarak label dan nilai | 6–8 px |
| Jarak antarbagian | 24–32 px |

Gunakan skala jarak 4, 8, 12, 16, 20, 24, 32, dan 48 px. Grid dan sidebar mengikuti struktur aplikasi yang sudah tersedia. Radius sedang dan garis tegas mengadaptasi panel persegi pada presentasi ke antarmuka dashboard.

Bayangan opsional cukup halus, misalnya `0 4px 16px rgba(5, 4, 4, 0.06)`. Border menjadi pemisah utama.

## 6. Shell workspace HSE

Header memuat wordmark, konteks halaman, dan aksi yang relevan. Warna putih pada gradien memberikan hubungan visual yang kuat dengan judul presentasi.

Sidebar menggunakan ikon garis dengan label atau tooltip mengikuti pola proyek. Pilihan aktif menggunakan latar biru muda, teks navy, dan penanda vertikal biru baja. Hover memakai `surface-blue`.

Navigasi mengikuti PRD dan FLOW.

| Area | Fokus konten |
| --- | --- |
| Dashboard perusahaan | Ringkasan periode, jumlah pegawai, tren, dan antrean review |
| Dashboard pegawai | Daftar pegawai dan detail rekap harian/mingguan |
| Camera hub | Sumber kamera, arsip rekaman, dan label manual subjek |

Pada halaman panjang, header ringkas dan pemilih periode dapat tetap mudah dijangkau melalui sticky header sesuai pola proyek.

## 7. Komponen bersama

### Kartu metrik

Gunakan permukaan putih, label sekunder kecil, angka gelap besar, serta catatan periode dan coverage. Satu kartu penekanan dapat memakai latar biru muda.

Contoh peran metrik adalah pegawai dengan hasil, pegawai perlu review, waktu pengamatan valid, dan hasil terbaru. Nilai diambil dari data aplikasi atau fixture yang sedang aktif.

### Tombol

| Jenis | Latar | Teks | Pemakaian |
| --- | --- | --- | --- |
| Utama | `brand-deep` | Putih | Simpan review dan aksi utama halaman |
| Sekunder | Putih | `brand-deep` | Lihat bukti atau rincian |
| Lembut | `surface-blue` | `brand-deep` | Filter dan navigasi pendukung |
| Teks | Transparan | `brand-deep` | Buka rincian singkat |
| Berisiko | `risk-high` sesuai token | Sesuai pasangan semantik | Aksi yang memang memiliki konsekuensi terkait |

Hover tombol utama memakai `brand-hover`. Disabled memakai tampilan netral dan penjelasan bila pengguna memerlukan konteks. Loading menampilkan indikator dan label tindakan yang sedang berlangsung.

### Filter dan tab

Tab Harian/Mingguan menggunakan kelompok pada permukaan lembut. Tab aktif berisi navy dengan teks putih atau biru muda dengan teks navy dan penanda aktif yang tegas.

Field memiliki label di atas, border `border-strong`, dan fokus biru baja. Filter periode menyertakan tanggal agar scope rekap jelas.

### Tabel

Kepala tabel memakai `surface-blue`, teks navy, dan bobot 600. Isi tabel memakai permukaan putih dengan pemisah ringan. Hover baris menggunakan biru sangat lembut.

Tampilkan nama pegawai lebih menonjol daripada ID. Kolom metrik memakai angka tabular, satuan, dan interval. Badge risiko dan badge review berada pada kolom masing-masing.

### Grafik

| Seri | Warna |
| --- | --- |
| Paparan MSD | `#47769E` |
| Paparan kebisingan | `#243F57` |
| Seri pendukung | `#9BBEDC` |
| Grid dan pembatas | `#DDE5EC` |

Gunakan tooltip, label, dan bentuk penanda agar seri dapat dibedakan. Label sumbu mencantumkan satuan. Grafik tren mengikuti interval yang tersedia pada data dan mempertahankan gap pengamatan.

### Rekaman dan bukti

Preview memakai latar `preview`. Toolbar memakai `preview-control` dan teks putih. Timestamp ditampilkan dalam kapsul gelap dengan angka tabular.

Overlay pose mengikuti data observasi yang tersedia. Gunakan biru muda atau putih untuk garis dasar, lalu warna semantik pada temuan yang memang diklasifikasikan sesuai data.

## 8. Dashboard perusahaan

Susun judul, subtitle periode, pemilih tanggal, dan waktu hasil terakhir pada bagian atas. Letakkan kartu metrik di bawahnya, lalu tren dan daftar pegawai yang memerlukan review.

Judul halaman memakai teks gelap dan penanda vertikal gradien. Aksen gradien cukup pada masthead atau judul bagian. Area isi berwarna terang dengan jarak antarblok yang konsisten.

Badge koneksi layanan, mode data, dan status review memiliki label yang jelas. Data demo memakai badge biru muda.

## 9. Daftar dan detail pegawai

### Daftar pegawai

Gunakan tabel atau kartu responsif dengan nama, periode, level MSD, status kebisingan, paparan, rekomendasi prioritas, status review, dan waktu hasil terakhir.

### Header detail

Tampilkan nama/ID, periode, shift, lokasi teramati, waktu hasil terbaru, label data, snapshot/revisi, dan review HSE. Ringkasan coverage ditempatkan dekat judul agar mudah ditemukan.

### Dua kartu asesmen utama

Gunakan dua kolom seimbang pada desktop dan susunan vertikal pada layar kecil. Tiap kartu memiliki kepala gradien, ikon, judul putih, dan badge status yang tetap terbaca.

| Area kartu | Paparan MSD | Paparan kebisingan terkait NIHL |
| --- | --- | --- |
| Judul dan ikon | Aktivitas/postur | Suara/pengukuran |
| Hasil utama | Badge Low/Medium/High dan REBA | Status penilaian kebisingan |
| Temuan | Bagian tubuh, gerakan, dan alasan | Paparan pada interval yang diamati |
| Metrik | Durasi, holding time, kejadian, dan poin kumulatif | dBA, durasi, cakupan, kontribusi dosis, dan profil |
| Tren | Seri harian/mingguan | Riwayat pengukuran sesuai data |
| Rekomendasi | Tindakan, alasan, dan prioritas | Tindakan, alasan, dan prioritas |
| Bukti | Rekaman dan timestamp | Sumber pembacaan dan interval |

Angka utama memakai 32–40 px. Keterangan cakupan dan satuan berada tepat di bawahnya. Rincian tambahan dapat dibuka dengan accordion, drawer, atau modal mengikuti komponen proyek.

Rekomendasi menggunakan bidang biru lembut dengan judul navy. Prioritas mempunyai badge semantik sendiri. Sediakan ruang cukup untuk kalimat yang membungkus.

### Konteks dan review

Suhu tubuh dan kondisi ruang berada pada panel konteks sekunder. Catatan HSE memakai form pada permukaan putih dengan border jelas.

Aksi Simpan review memakai tombol navy. Status Belum direview, Perlu bukti, dan Direview menampilkan teks serta ikon. Snapshot ID/revisi tetap tersedia sebagai metadata.

## 10. Camera hub dan arsip

Kartu kamera memiliki nama sumber, lokasi, status koneksi, dan tautan arsip. Foto atau video memakai panel gelap dengan toolbar ringkas. Identitas pegawai muncul melalui label subjek pada rekaman.

Arsip dapat memakai tabel tanggal, sumber, durasi, ketersediaan file, provenance, dan aksi bukti. Entri metadata saja memakai ikon dokumen atau rekaman kosong dengan status yang eksplisit.

Status pemrosesan ditampilkan sebagai informasi layanan dan interval hasil terbaru. Rekap pegawai menggunakan hasil periodik dari alur otomatis yang ditetapkan PRD dan FLOW.

## 11. State data dan interaksi

| State | Tampilan |
| --- | --- |
| Memuat data | Skeleton netral dengan transisi lembut |
| Hasil tersedia | Konten kartu beserta waktu hasil dan coverage |
| Data mock lokal | Badge Data demo pada scope halaman dan Simulasi pada pembacaan instrumen |
| Data periode kosong | Pesan singkat, periode aktif, dan status sumber |
| Pengamatan parsial | Badge Cakupan parsial dan penjelasan durasi valid |
| Rekaman belum tersedia | Placeholder berbingkai putus-putus dengan status file |
| HSE perlu bukti | Badge amber dan catatan yang terkait |
| HSE selesai review | Badge hijau pada snapshot yang direview |
| Hasil baru setelah review | Penanda hasil atau revisi baru dengan waktu pengamatan |
| Error data | Pesan ringkas dengan aksi pemulihan yang sesuai |

Animasi fokus dan hover menggunakan 120–180 ms. Konten rekap mengikuti state data yang dipilih. Preferensi reduced motion menggunakan transisi minimal.

## 12. Responsif dan keterbacaan

| Viewport | Susunan |
| --- | --- |
| 1280 px ke atas | Kartu asesmen dua kolom, metrik ringkasan hingga empat kolom |
| 768–1279 px | Metrik dua kolom, kartu asesmen dapat ditumpuk sesuai lebar isi |
| Di bawah 768 px | Satu kolom, toolbar membungkus, navigasi mengikuti menu mobile proyek |

Tabel dapat digulir horizontal dalam kontainernya. Nama pegawai dan label status harus tetap mudah ditemukan saat ruang sempit. Halaman mengikuti tinggi konten.

Gunakan area sentuh minimum 44 × 44 px, nama aksesibel untuk tombol ikon, fokus keyboard yang terlihat, label form, serta teks untuk setiap status.

Pasangan utama yang sudah dihitung memiliki rasio kontras berikut.

| Teks / latar | Rasio perkiraan |
| --- | --- |
| Putih / brand-deep | 8.94:1 |
| Ink / highlight | 9.18:1 |
| Text-muted / putih | 5.09:1 |
| Brand-deep / surface-blue | 7.76:1 |
| Success-ink / success-soft | 6.76:1 |
| Warning-ink / warning-soft | 6.61:1 |
| Danger-ink / danger-soft | 7.60:1 |

Pastikan teks di seluruh gradien memiliki kontras yang memadai pada stop paling terang. Target desain untuk teks isi adalah minimal 4.5:1.

## 13. Token CSS untuk implementasi

```css
:root {
  --color-canvas: #f3f3f3;
  --color-surface: #ffffff;
  --color-surface-muted: #f7f9fb;
  --color-surface-blue: #e8f0f6;

  --color-brand-black: #050404;
  --color-brand-mid: #243f57;
  --color-brand: #47769e;
  --color-brand-deep: #2d4c69;
  --color-brand-hover: #345a78;
  --color-highlight: #9bbedc;

  --color-ink: #111820;
  --color-text-secondary: #405567;
  --color-text-muted: #607080;
  --color-text-on-dark: #ffffff;
  --color-border: #cedae4;
  --color-border-strong: #7d97ab;
  --color-preview: #08131c;
  --color-preview-control: #173044;

  --color-risk-low-bg: #ecfdf3;
  --color-risk-low-fg: #166534;
  --color-risk-medium-bg: #fffbeb;
  --color-risk-medium-fg: #854d0e;
  --color-risk-high-bg: #fef2f2;
  --color-risk-high-fg: #991b1b;
  --color-neutral-bg: #f1f5f9;
  --color-neutral-fg: #475569;

  --gradient-brand: linear-gradient(
    90deg,
    var(--color-brand-black) 0%,
    var(--color-brand-mid) 45%,
    var(--color-brand) 100%
  );

  --gradient-title-marker: linear-gradient(
    180deg,
    var(--color-brand-black) 0%,
    var(--color-brand) 100%
  );

  --font-ui: "Poppins", "Inter", ui-sans-serif, system-ui, sans-serif;
  --radius-shell: 28px;
  --radius-card: 16px;
  --radius-control: 10px;
  --shadow-card: 0 4px 16px rgb(5 4 4 / 6%);
}
```

Map token ini ke theme atau variabel yang sudah digunakan proyek. Badge informasi dan simulasi dapat memakai pasangan `surface-blue` / `brand-deep`. Alias token lama disesuaikan sesuai peran komponennya.

## 14. Pemetaan tema sebelumnya

| Peran sebelumnya | Token baru |
| --- | --- |
| Aksen merek lime | brand atau brand-deep |
| Tombol utama lime | brand-deep dengan label putih |
| Penanda kotak lime | brand atau penanda gradien vertikal |
| Track progres lime | brand pada track surface-blue |
| Kartu ringkasan lime | highlight dengan teks ink |
| Garis pose lime | highlight atau putih pada preview gelap |
| Info biru terang | brand-deep pada surface-blue |
| Header kartu polos | Header gradien atau judul dengan penanda vertikal |

Gunakan pemetaan berdasarkan fungsi. Warna status risiko mengikuti tabel semantik. Nilai data dan label asesmen mengikuti PRD serta state aplikasi.

## 15. Pemeriksaan hasil

- [ ] Preview menunjukkan canvas putih keabuan, biru baja, navy, hitam, dan highlight biru muda dari slide 1–3.
- [ ] Header gradien dan judul tebal mengingatkan pada presentasi referensi.
- [ ] Tabel, form, dan metrik memiliki permukaan terang serta teks yang terbaca.
- [ ] Kartu MSD dan NIHL mempunyai hierarki yang sama dan isi sesuai modulnya.
- [ ] Badge risiko, status kebisingan, review, dan data demo dapat dibedakan melalui teks.
- [ ] Angka, satuan, periode, coverage, dan provenance tampil berdekatan.
- [ ] Contoh layar mengikuti navigasi serta alur otomatis dari PRD/FLOW.
- [ ] Layout diuji pada desktop, tablet, dan mobile.
- [ ] Fokus keyboard, sentuhan, pembungkusan teks, dan kontras sudah diperiksa.
- [ ] Nama merek dan isi metrik berasal dari konfigurasi serta data proyek.

Referensi Canva menentukan arah visual. Token dan komponen dalam dokumen ini menerjemahkan arah tersebut menjadi spesifikasi frontend yang dapat langsung digunakan.
