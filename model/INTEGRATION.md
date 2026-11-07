# Menyambungkan model ke frontend origin

Panduan ini mengikuti `origin/master` commit `cf92227c583269aa82ba7f1786fd0a80b37d41a8`, khususnya `API_CONTRACT.md`, `frontend/src/lib/workspace-api.ts`, dan `frontend/src/lib/workforce.ts`. Frontend terbaru disinkronkan melalui fast-forward; commit model tidak mengubah implementasi frontend.

## Alur yang dipakai

```text
Frontend React/Vite
  → POST /recordings (multipart: file + metadata)
Backend menyimpan rekaman dan membuat job
  → worker menjalankan model/infer.py
  → result.json selesai
  → backend memverifikasi subjek ↔ pekerja, menyimpan interval dan revisi
Frontend polling GET /observations dan GET /recordings
```

Model berjalan di backend/worker, bukan di browser. Folder ini menyediakan inferensi dan adapter Python; **server API, database, antrean job, penyimpanan upload, dan autentikasi belum disediakan**. Dashboard demo lama bukan backend yang memenuhi kontrak origin.

Frontend origin mempunyai timeout request 15 detik dan polling 60 detik. Endpoint upload harus mengembalikan `Recording` sesudah file tersimpan; jangan menunggu seluruh analisis di request tersebut. Job berjalan terpisah. Tidak ada tombol POST untuk memulai analisis dalam alur frontend baru. Sumber kamera harus diproses oleh layanan independen dari tab browser; CLI ini memproses berkas, belum membuka RTSP atau menyambung hitungan antarsegmen live.

## 1. Jalankan inferensi dari worker backend

Contoh Python setelah upload tervalidasi dan disimpan di path yang ditentukan backend:

```python
import json
import subprocess
from pathlib import Path

repo = Path('/srv/safora')
video = Path('/srv/uploads/recording-123.avi')  # dari storage backend, bukan path bebas dari request
out = Path('/srv/results/recording-123/revision-1')  # harus belum ada
subprocess.run([
    str(repo / 'model/.venv/bin/python'),
    str(repo / 'model/infer.py'),
    '--video', str(video), '--output-dir', str(out), '--device', 'cpu',
], check=True)
result = json.loads((out / 'result.json').read_text())
```

Di mesin NixOS lokal ini, ganti dua argumen pertama dengan `['bash', str(repo / 'model/run.sh')]` agar library lokal dimuat. Gunakan daftar argumen, bukan string perintah yang dirangkai dari nama file pengguna. Simpan stdout/stderr dan exit code sebagai log job. Batasi konkurensi sesuai memori/GPU, validasi ukuran/format upload, dan kembalikan status gagal bila proses gagal. Jangan menerbitkan CSV parsial sebagai hasil final.

Contoh worker Node.js yang memakai proses yang sama:

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
const run = promisify(execFile);
await run('/srv/safora/model/.venv/bin/python', [
  '/srv/safora/model/infer.py', '--video', storedVideoPath,
  '--output-dir', newJobDirectory, '--device', 'cpu',
]);
const result = JSON.parse(await readFile(`${newJobDirectory}/result.json`, 'utf8'));
```

## 2. Baca hasil model

`result.json` memakai `schema_version: "healy.model.v1"`. `samples` berisi satu baris per detik; `summary` adalah ringkasan seluruh rekaman.

| Field sampel | Arti |
|---|---|
| `timestamp_s`, `sample_interval_s` | Awal interval relatif video dan panjang interval, maksimum 1 detik |
| `waist_flexion`, `waist_rotation`, `arm_height`, `knee_flexion` | Komponen MURI 1–3, nullable |
| `arm_level`, `back_level` | Kategori komponen yang lolos pemeriksaan visibilitas |
| `uwiom_level` | `low` / `moderate` / `high` / `null` |
| `uwiom_status` | `experimental_prediction` atau `pose_unavailable` |
| `arm_posture_cycle_completed`, `back_posture_cycle_completed` | Kontribusi siklus pada sampel ini: 0 atau 1 |
| `arm_posture_cycles_so_far`, `back_posture_cycles_so_far` | Total kumulatif sejak awal video; jangan dijumlahkan antarbaris |
| `clinical_msd_probability` | Selalu `null` |

Contoh output nyata dipotong ke enam sampel di [examples/result.excerpt.json](examples/result.excerpt.json). Ringkasannya tetap untuk seluruh rekaman; contoh itu bukan hasil lengkap untuk dimasukkan database. `models` dan `input` menyimpan checksum untuk audit/cache. Hasil mode CSV tidak mengklaim model mana yang menghasilkan skor MURI input.

## 3. Ubah menjadi ObservationWindow

Adapter siap dipakai di `model/integration.py`:

```python
from model.integration import observation_windows

windows = observation_windows(
    result,
    recording_id='recording-123',
    worker_id='worker-123',
    recorded_at='2026-11-07T10:00:00+07:00',
    subject_verified=True,  # backend sudah memverifikasi subjek terpilih benar pekerja ini
    revision=1,
)
# Simpan/upsert windows. GET /observations mengembalikan {"items": windows}.
```

`subject_verified=True` bukan pengganti verifikasi: jangan mengambilnya langsung dari request pengguna. Detektor sekarang memilih satu orang di ROI dan tidak menghasilkan identitas pekerja. Adapter ini hanya untuk rekaman/segmen yang telah diverifikasi berisi pekerja yang sama sepanjang analisis. Jika ada beberapa pekerja atau pergantian subjek, backend perlu tracking/asosiasi label per interval terlebih dahulu; jangan mengirim hasil yang sama ke semua pegawai.

Aturan adapter:

- Satu sampel menjadi interval `[timestamp_s, timestamp_s + sample_interval_s)`.
- `usable_s` hanya panjang interval dengan UW-IOM terbaca. `flagged_s` memakai panjang interval kelas sedang/tinggi. Ini aturan flag **UW-IOM eksperimental**, bukan nilai Table C atau indikator diagnosis.
- `reba_score` dan `exposure_points` tetap `null`: model tidak menghitung REBA lengkap atau poin RAISE. Jangan mengisi 1/2/3 sebagai REBA, mengalikan repetisi menjadi probabilitas MSD, atau memasukkan total kumulatif sebagai kontribusi interval.
- `finding` menjelaskan kelas/ketidaktersediaan; `review_state: "needs_evidence"`, `requires_review: true`, dan `source: "service"`. Keluaran AI tidak otomatis disetujui HSE.
- ID stabil dibuat dari recording, worker, dan batas interval. Analisis ulang/koreksi wajib menaikkan `revision`; refresh biasa mengembalikan revisi sama. Backend menangani persistensi revisi serta deduplikasi liputan antarrekaman/kamera.
- `recorded_at` wajib punya timezone. `observed_at` dihitung dari waktu rekaman ditambah waktu relatif, bukan waktu polling dashboard.

Lihat [examples/observations.json](examples/observations.json) untuk bentuk respons menggunakan ID contoh. Field `msd` yang meminta worksheet/Table C/episode tidak diisi karena model belum menghasilkan bukti tersebut. Frontend dapat menampilkan finding dan durasi; kartu REBA/poin memang akan tetap belum tersedia. Untuk panel UW-IOM lengkap, tambahkan kontrak hasil model tersendiri pada backend/frontend; jangan menyamarkannya sebagai REBA agar komponen lama terisi.

## 4. Hubungkan frontend Vite

Pada proyek frontend origin, atur `frontend/.env.local`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Alamat itu milik backend yang akan dibuat, bukan model CLI. Restart Vite setelah mengubah env. Jika frontend berada di mesin lain, gunakan alamat backend yang dapat dijangkau browser pengguna. Backend perlu mengizinkan CORS untuk origin frontend yang sebenarnya dan menangani preflight/OPTIONS.

Minimal rute yang dikonsumsi frontend:

| Endpoint | Tanggung jawab backend |
|---|---|
| `GET /workers` | Daftar pekerja sebenarnya, `{ items: [...] }` |
| `GET /recordings` | Rekaman tersimpan dan metadata/playback URL |
| `POST /recordings` | Terima file + metadata, simpan, antrekan job, balas `Recording` |
| `PUT /recordings/:id/labels` | Simpan label subjek setelah validasi interval/identitas |
| `GET /observations?from=...&to=...&timezone=...` | Interval yang sudah tersimpan, tersaring rentang waktu |
| `GET /live-sources` | Status kamera sebenarnya; jangan mengklaim online dari hasil file |
| `GET /noise-readings?...` | `{ items: [] }` bila tidak ada pembacaan; model ini tidak menganalisis kebisingan |

Ikuti `API_CONTRACT.md` origin untuk rute review/asesmen lain dan bentuk error `{ detail: "..." }`. Saat backend belum terhubung, biarkan env kosong sehingga frontend memakai status unavailable yang sudah didukung. Tidak diperlukan frontend demo dari arsip.
