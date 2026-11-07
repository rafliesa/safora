# Alur RAISE yang dikonfirmasi

Klarifikasi pengguna ini menjadi acuan alur frontend ketika berbeda dari contoh desain atau alur awal pada PRD.

1. **Kamera bukan milik satu pegawai.** Untuk hackathon, asosiasi pegawai dilakukan melalui label manual per video. Satu rekaman dapat memiliki beberapa subjek; pegawai yang sama dapat muncul pada sumber yang berbeda.
2. **Analisis berjalan otomatis sejak kamera menyala.** Pipeline memproses secara berkala, dengan cadence contoh satu menit. Tidak ada tombol mulai analisis. Rekap pegawai mengakumulasi interval hasil dan dapat menampilkan tren.
3. **Tidak ada panel kondisi live pegawai.** Detail pegawai menampilkan rekap periodik dan riwayat, bukan monitor postur saat ini.
4. **Hasil langsung masuk dashboard perusahaan.** HSE dapat melihat berapa pegawai yang memerlukan review, lalu membuka daftar dan detail pegawai. Status review terpisah dari ketersediaan hasil AI.
5. **Rekaman disimpan dan dapat ditelusuri.** Camera hub memiliki arsip hari-hari sebelumnya, termasuk catatan hardcode untuk demonstrasi.

## Struktur navigasi

- Dashboard perusahaan → ringkasan seluruh pegawai, hasil periode, tren, dan antrean review.
- Dashboard pegawai → daftar pegawai → detail satu pegawai → rekap harian/mingguan, tren kumulatif, riwayat hasil, bukti rekaman, review HSE.
- Camera hub → sumber kamera → arsip rekaman → detail rekaman dan label manual.

Kedua dashboard berada dalam workspace HSE. Tidak ditambahkan akun atau portal terpisah untuk pegawai.

## Batas implementasi frontend

Pembaruan dashboard setiap 60 detik adalah pembacaan hasil. Layanan kamera bertanggung jawab menjalankan inferensi dan menyimpan stream sejak sumber menyala; pekerjaan tersebut tidak boleh bergantung pada tab browser yang terbuka.

Tanpa backend/footage, data layanan tetap kosong dan sumber tampil belum terhubung. Arsip hardcode berisi metadata yang diberi label, bukan file video buatan. Pengguna bisa menyimpan file sebenarnya secara lokal. Mode hasil contoh bersifat opt-in, diberi label, dan terpisah dari hasil layanan.

Poin paparan dan durasi bertambah dari interval unik. REBA tidak dijumlahkan antar interval. Review HSE mencatat snapshot ID/revisi yang benar-benar dilihat. Aturan penggabungan interval lintas kamera dan kelengkapan perhitungan ditentukan layanan, dengan provenance yang tetap terlihat.

## Detail asesmen dan desain terbaru

Nama aplikasi adalah **RAISE**, dikonfigurasi di `src/lib/brand.ts`. Tema mengikuti `design.md` revisi 2.0: Poppins, header gradien hitam–biru baja, permukaan terang, highlight biru muda, border jelas, dan warna risiko semantik.

Detail pegawai memuat kartu **Paparan MSD** dan **Paparan Kebisingan** secara terpisah. Low/Medium/High berasal dari REBA; status kebisingan berasal dari data pengukuran mock. Setiap kartu memuat metrik, periode/coverage, temuan, intervensi, dan akses rincian/bukti. Data tanpa file diberi label Rekaman belum tersedia. Suhu tubuh dan kondisi ruangan yang belum memiliki data tampil sebagai konteks sekunder dengan status belum tersedia.

Tinjauan HSE kini memakai state frontend lokal sesuai permintaan pengguna. Catatan, Tandai perlu bukti, dan Simpan review terikat pada pegawai, periode, snapshotId/revision yang ditampilkan. Hasil langsung terlihat dalam status Belum direview. Review tidak dipindahkan ke periode/pegawai lain; revisi baru meminta review kembali.
