# Kontrak layanan frontend RAISE

Gunakan `VITE_API_BASE_URL` untuk origin layanan. Adapter alur otomatis berada di `src/lib/workspace-api.ts`, tipe datanya di `src/lib/workforce.ts`. Endpoint di bawah adalah kontrak integrasi; repository ini tidak menyediakan pipeline kamera atau server inferensi.

## Sumber dan hasil otomatis

| Endpoint | Respons |
| --- | --- |
| `GET /live-sources` | `{ items: LiveSource[] }` |
| `GET /workers` | `{ items: Worker[] }` |
| `GET /observations?from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=Asia%2FJakarta` | `{ items: ObservationWindow[] }` |
| `GET /noise-readings?from=...&to=...&timezone=Asia%2FJakarta` | `{ items: NoiseReading[] }`; pembacaan Simulasi dengan interval, scope, profil, status, dan kontribusi dosis |
| `GET /recordings` | `{ items: Recording[] }` |
| `POST /recordings` | `Recording`; multipart `file` dan JSON `metadata` |
| `PUT /recordings/:id/labels` | `Recording` dengan label manual yang disimpan |
| `POST /workers/:id/reviews` | `{ saved: true }`; simpan review atas snapshot ID/revisi terpilih |

Frontend membaca data pada mount, setiap 60 detik, dan saat tab kembali terlihat. Review pegawai saat ini memakai state frontend lokal dan memperbarui antrean UI tanpa POST layanan. Untuk menelusuri periode lama, pembacaan observasi menggunakan rentang hingga 90 hari sebelum tanggal akhir yang dipilih. Pemilihan tanggal lain memuat rentang historis yang sesuai.

**Tidak ada POST untuk memulai analisis dari UI.** Layanan harus mengaktifkan pipeline sejak sumber kamera menyala dan menerbitkan hasil berkala. Menutup/membuka dashboard tidak boleh menghentikan/memulai ulang inferensi atau hitungan.

Tanpa origin backend, sumber kamera berstatus offline/unavailable dan hasil/pegawai layanan kosong. Catatan arsip contoh dan hasil preview tidak dikembalikan sebagai data layanan. Label/rekaman lokal disimpan browser; review layanan yang belum tersedia menghasilkan error 501.

## Bentuk data

`Worker`: `id`, `name`, `department`, `initials`. Tidak ada `camera_id` sebagai kepemilikan pegawai.

`LiveSource`: `id`, `camera_id`, `status` (`offline`, `online`, `error`), optional `playback_url` yang dapat diputar browser, `analysis_status` (`waiting`, `running`, `unavailable`), `cadence_s`, nullable `last_observation_at`, optional `device_name`. Koneksi live tidak boleh diklaim hanya karena template kamera tersedia.

`Recording`: `id`, `camera_id`, `station_id`, `title`, `filename`, `recorded_at` dengan offset/UTC, `duration_s`, `source` (`example`, `local`, `service`), `labels`, optional `playback_url`, `content_hash`, `width`, `height`, dan `labels_updated_at`. `local_file_id` hanya dipakai oleh arsip browser.

`ManualLabel`: `worker_id`, `worker_name`, `subject_label`, `start_s`, `end_s`, `origin: "manual"`. Interval setengah terbuka `[start_s, end_s)` relatif ke rekaman. Satu rekaman dapat berisi beberapa subjek. Backend wajib memverifikasi pemetaan subjek ke observasi; tidak boleh mendistribusikan semua temuan pada semua label tanpa asosiasi subjek.

`ObservationWindow`: `id`, `revision`, `worker_id`, `recording_id`, `observed_at` (timestamp interval), `start_s`, `end_s`, `usable_s`, `flagged_s`, nullable `reba_score`, nullable `exposure_points`, `requires_review`, `review_state` (`draft`, `needs_evidence`, `approved`), nullable `finding`, `source` (`service` untuk data sebenarnya).

Setiap observasi adalah **kontribusi interval**, bukan total kumulatif sebelumnya. Gunakan satu ID kanonis dan revisi yang meningkat untuk koreksi interval. Respons refresh boleh mengembalikan interval yang sama: frontend menggantinya menurut ID/revisi, tidak menambahkannya lagi. Jangan mengembalikan partial cumulative totals sebagai delta interval.

## Agregasi dan review

Layanan menentukan interval eligible yang tidak tumpang tindih untuk analisis pegawai yang dipilih. ID berbeda untuk liputan yang sama dari beberapa kamera tidak boleh menyebabkan waktu dan paparan dihitung ganda. Resolusi overlap, region analisis, rule version, dan cache inferensi harus ditetapkan oleh layanan, bukan ditebak frontend.

Hasil AI langsung terlihat walaupun `review_state` masih draft. Pegawai perlu review ketika setidaknya ada interval `requires_review: true` yang belum approved. Nilai tinggi yang belum direview tidak diberi label HSE-verified.

Frontend menjumlahkan kontribusi poin/waktu dari interval unik dan menampilkan REBA tertinggi pada periode. Missing/Unknown tetap berbeda dari hasil rendah. Nilai poin RAISE tetap eksperimental dan harus berasal dari Table C/durasi yang memenuhi syarat.

Payload review: `reviewer`, `rationale`, `window_versions: [{ id, revision }]`. Scope dibekukan saat dialog review dibuka. Backend harus memvalidasi identitas HSE, kelengkapan worksheet, konflik revisi, alasan, timestamp, dan versi yang disetujui. Interval baru tidak otomatis ikut direview. Kembalikan 409 jika revisi yang diminta sudah berubah dan harus ditinjau kembali.

## Kompatibilitas asesmen

`src/lib/api.ts` mempertahankan endpoint PRD untuk laporan versi: `GET /health`, `GET /config`, `GET/POST /videos`, `GET /analysis-sessions`, `GET /analysis-sessions/:id`, `GET/PATCH /analysis-sessions/:id/assessment`, `POST /assessment-versions/:id/reviews`, dan `GET /dashboard`.

Metode legacy `startAnalysis` tersedia untuk kompatibilitas kontrak, tetapi tidak dipanggil oleh navigasi, kamera, atau dashboard baru. Unknown ID tetap 404, input tidak valid 422, write belum tersedia 501, dan pipeline belum tersedia 503. Tidak ada hasil atau approval palsu yang disimpan.

Error layanan dapat mengirim `{ detail: "Pesan untuk pengguna" }`. Timeout jaringan 15 detik; kegagalan polling mempertahankan hasil terakhir. Review HSE tidak mengubah provenance Simulated pada data instrumen.

## Asesmen pegawai terkini

`ObservationWindow.msd` opsional memuat bagian tubuh, aktivitas, rasional, subtotal Table C, episode statis/dinamis dengan ID stabil, ketersediaan tracking hold, intervensi, dan konteks input. Field tidak tersedia tetap null/absent; frontend tidak menebak holding time atau worksheet. `updated_at` membedakan waktu hasil dari waktu sinkronisasi UI.

`NoiseReading` memuat ID/revision, worker atau area/stasiun, recording_id, start_at/end_at, level_dba nullable, covered_s, dose_contribution_pct nullable, profile nullable, interval_model, instrument_id, source Simulasi, assessment_status, status_priority, finding, rationale, dan interventions. Status ditampilkan dari payload; tidak dipetakan ke Low/Medium/High. Dosis area tidak dianggap dosis personal. Interval personal overlap/profil tidak kompatibel menghasilkan kontribusi gabungan belum tersedia. Untuk minggu, kontribusi ditampilkan per hari, bukan dijumlahkan antarshift.

`buildEmployeeSnapshot` membentuk snapshotId yang stabil untuk pegawai/periode serta revision fingerprint dari interval, pembacaan, dan label sumber yang ditampilkan. Review lokal disimpan pada `raise-hse-reviews-v1` dengan pegawai, periode, from/to, snapshotId, revision, source, reviewer, notes, status, savedAt, dan storage frontend_local. Status adalah needs_evidence atau reviewed; ketiadaan entry berarti Belum direview. Snapshot berubah membuat entry lama tidak berlaku pada tampilan baru. UI pegawai tidak memakai endpoint POST review pada tabel integrasi di atas; endpoint tersebut tetap tersedia untuk integrasi backend di masa depan.
