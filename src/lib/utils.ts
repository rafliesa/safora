import type { CameraTemplate, Period } from './types.ts';

export const cameras: CameraTemplate[] = [
  { id: 'A', department: 'Engineering', station: 'B-12', device: 'Logitech Brio 4K', angle: 'Lateral 90°', view: 'side' },
  { id: 'B', department: 'Operations', station: 'O-04', device: 'USB Cam 02', angle: 'Lateral 90°', view: 'side' },
  { id: 'C', department: 'Support', station: 'S-08', device: 'Logitech C920', angle: 'Frontal 0°', view: 'front' },
  { id: 'D', department: 'Design', station: 'D-02', device: 'Brio 4K', angle: 'Lateral 85°', view: 'side' },
];

export function time(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const value = Math.floor(seconds);
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function localDate(value = new Date(), timezone = 'Asia/Jakarta'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value || '').join('-');
}

export function dateRange(date: string, period: Period): { from: string; to: string } {
  const end = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(end.getTime())) throw new Error('Tanggal tidak valid.');
  const start = new Date(end);
  if (period === 'week') start.setUTCDate(end.getUTCDate() - 6);
  if (period === 'month') start.setUTCDate(1);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function risk(score: number | null): { label: string; tone: string; action: string } {
  if (score === null || !Number.isInteger(score) || score < 1 || score > 15) return { label: 'Belum dinilai', tone: 'neutral', action: 'Worksheet belum lengkap' };
  if (score >= 11) return { label: 'Tinggi · tindakan segera', tone: 'danger', action: 'Very high · ikuti prosedur tindakan segera setelah konfirmasi HSE' };
  if (score >= 8) return { label: 'Tinggi', tone: 'danger', action: 'High · prioritaskan tindakan korektif' };
  if (score >= 4) return { label: 'Sedang', tone: 'warning', action: 'Medium · tentukan perbaikan dan asesmen ulang' };
  return { label: 'Rendah', tone: 'success', action: score === 1 ? 'Negligible · observasi rutin' : 'Low · pertimbangkan perbaikan' };
}

export function validateRange(start: number, end: number, duration: number): boolean {
  return [start, end, duration].every(Number.isFinite) && start >= 0 && end > start && end <= duration;
}

// Experimental RAISE metric. Call only with reviewed, nonoverlapping episodes.
export function exposurePoints(episodes: { tableC: number; durationMinutes: number; extraHoldMinutes: number }[], usableMinutes: number): { points: number; perHour: number | null } {
  if (!Number.isFinite(usableMinutes) || usableMinutes < 0) throw new Error('Invalid usable observation time');
  let flaggedMinutes = 0;
  const points = episodes.reduce((sum, episode) => {
    const { tableC, durationMinutes, extraHoldMinutes } = episode;
    if (!Number.isInteger(tableC) || tableC < 1 || tableC > 12 || !Number.isFinite(durationMinutes) || !Number.isFinite(extraHoldMinutes) || durationMinutes < 0 || extraHoldMinutes < 0 || extraHoldMinutes > durationMinutes) throw new Error('Invalid exposure episode');
    flaggedMinutes += durationMinutes;
    return sum + (tableC <= 3 ? 1 : tableC <= 7 ? 2 : 3) * (durationMinutes + extraHoldMinutes);
  }, 0);
  if (flaggedMinutes > usableMinutes) throw new Error('Flagged time exceeds usable observation time');
  return { points, perHour: usableMinutes > 0 ? points / (usableMinutes / 60) : null };
}

export function exportCsv(filename: string, rows: (string | number)[][]): void {
  const csv = '\uFEFF' + rows.map(row => row.map(cell => {
    let value = String(cell);
    if (/^[\s]*[=+\-@]/.test(value)) value = `'${value}`;
    return `"${value.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function inspectVideo(file: File): Promise<{ duration_s: number; width: number; height: number; content_hash: string }> {
  const url = URL.createObjectURL(file);
  try {
    const metadata = await new Promise<{ duration_s: number; width: number; height: number }>((resolve, reject) => {
      const video = document.createElement('video');
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Video tidak dapat dibaca dalam 20 detik. Pilih file MP4 atau WebM yang lebih kecil.')); }, 20000);
      const cleanup = () => { window.clearTimeout(timeout); video.onloadedmetadata = null; video.onerror = null; video.removeAttribute('src'); video.load(); };
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const data = { duration_s: video.duration, width: video.videoWidth, height: video.videoHeight };
        cleanup();
        if (!Number.isFinite(data.duration_s) || data.duration_s <= 0 || data.width <= 0) reject(new Error('Durasi atau resolusi video tidak valid. Coba MP4 (H.264) atau WebM.'));
        else resolve(data);
      };
      video.onerror = () => { cleanup(); reject(new Error('Format video tidak didukung atau file rusak. Coba MP4 (H.264) atau WebM.')); };
      video.src = url;
    });
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const content_hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { ...metadata, content_hash };
  } finally {
    URL.revokeObjectURL(url);
  }
}
