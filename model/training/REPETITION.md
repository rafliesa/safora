# Kandidat repetisi gerakan siku

`repetition.py` mengambil pose pada 10 sampel per detik dan mencari siklus tekuk–kembali pada sudut siku dalam gambar. Modul ini memakai bobot pose pretrained yang sudah tersedia. Modul tidak memerlukan training ulang dan tidak mengubah model MURI atau model paparan sintetis.

Jalankan dari root proyek dengan Python yang sudah memiliki dependensi pose:

```bash
python training/repetition.py extract video.avi hasil_pose \
  --pose-model models/sustage/yolo11x-pose.pt --device 0
python training/repetition.py count hasil_pose/arms_10fps.csv hasil_repetisi
python -m unittest discover -s training -p test_repetition.py -v
```

Gunakan `--device cpu` untuk CPU. Pilihan `--roi xmin ymin xmax ymax` memakai koordinat relatif 0–1; nilai awal `[0, 0, 0.88, 1]` mengikuti video User124 WS10. Ubah ROI untuk kamera lain. Nama direktori hasil harus baru.

Ekstraksi menghasilkan `arms_10fps.csv` dan `metadata.json`. Penghitung menghasilkan `candidate_cycles.csv` dengan waktu mulai, puncak tekukan, dan akhir setiap kandidat; `repetition_per_second.csv` memuat jumlah kandidat yang selesai pada setiap detik, jumlah kumulatif, serta proporsi sampel dengan siku terbaca. Kolom jumlah per detik kosong saat seluruh sampel siku tidak terbaca. Jumlah kiri dan kanan tetap terpisah karena satu tindakan dapat menggerakkan kedua lengan.

Satu kandidat mensyaratkan perubahan sudut minimal 30 derajat, kemudian kembali dalam 10 derajat dari sudut awal, selama 0,4–10 detik. Penghitung memakai median tiga sampel. Nilai tersebut merupakan parameter percobaan, belum ambang ergonomi yang tervalidasi. Sudut mengacu pada proyeksi gambar 2D; putaran badan dapat mengubah sudut meskipun siku tidak menekuk.

Ketiga sendi harus memiliki confidence minimal 0,6 dan panjang tiap segmen lengan pada gambar minimal 15 piksel. Penghitung memutus siklus ketika titik hilang, kotak pekerja berubah mendadak, waktu antar-sampel melebihi 0,151 detik, atau sudut meloncat lebih dari 60 derajat. Penghitung tidak mengisi titik yang hilang. Median menggunakan satu sampel berikutnya, sehingga implementasi ini untuk analisis video tersimpan.

Hasil masih berupa kandidat gerak siku dan dapat mencakup berjalan atau aktivitas selain merakit. Pemeriksaan manual perlu memastikan pekerja yang diikuti dan jenis gerakan yang dihitung. Sistem belum menghitung genggaman, penggunaan alat, gerakan jari, atau siklus tugas lengkap. Jangan langsung memasukkan jumlah kandidat sebagai HAL atau frekuensi angkat RNLE. Penilaian paparan tangan juga memerlukan gaya; lihat [penjelasan NIOSH](https://www.cdc.gov/niosh/bulletin/2019/hand-msd.html).
