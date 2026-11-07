import './dom.ts';
import React from 'react';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.tsx';
import { EmployeeDetail } from '../src/pages/Workforce.tsx';
import { api } from '../src/lib/api.ts';
import { usePeriodicRefresh } from '../src/lib/useWorkspace.ts';
import { REFRESH_INTERVAL_MS } from '../src/lib/workforce.ts';
import { exampleNoiseReadings, exampleRecordings, exampleWindows, exampleWorkers } from '../src/lib/demo.ts';
import { localDate } from '../src/lib/utils.ts';
import { readLocalRecordings } from '../src/lib/recording-storage.ts';
import { readLocalReviews } from '../src/lib/local-reviews.ts';
import { workspaceApi } from '../src/lib/workspace-api.ts';

afterEach(() => { cleanup(); window.localStorage.clear(); window.sessionStorage.clear(); window.location.hash = '/overview'; });
async function mount(path: string) {
  window.location.hash = path;
  const view = render(<App />);
  await waitFor(() => assert.equal(screen.getByRole('main').getAttribute('aria-busy'), 'false'));
  return view;
}
const summaryRegion = () => screen.getByRole('region', { name: 'Ringkasan pegawai dan periode' });
const msdCard = () => screen.getByRole('article', { name: 'Paparan MSD' });
const noiseCard = () => screen.getByRole('article', { name: 'Paparan Kebisingan' });

test('RAISE branding and separate dashboards; service mode retains honest empty states', async () => {
  window.sessionStorage.setItem('raise-data-mode-v1', 'service');
  await mount('/overview');
  assert.ok(screen.getByRole('button', { name: 'RAISE, buka menu workspace' }));
  assert.match(document.title, /^RAISE/);
  assert.doesNotMatch(document.body.textContent || '', /HEALY/i);
  assert.ok(screen.getByRole('link', { name: 'Dashboard Perusahaan', exact: true }));
  assert.ok(screen.getByRole('link', { name: 'Dashboard Pegawai', exact: true }));
  assert.ok(screen.getByText('Menunggu observasi pertama'));
  assert.equal(screen.queryByText('Priyapta Naufal'), null);
});

test('source camera has automatic cadence and no manual inference trigger or fixed employee', async () => {
  const user = userEvent.setup();
  let calls = 0;
  const original = api.startAnalysis;
  api.startAnalysis = async () => { calls++; throw new Error('No user analysis trigger'); };
  try {
    await mount('/cameras');
    assert.equal(screen.getAllByText('Belum terhubung').length, 4);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter pod workstation' }), 'Engineering');
    assert.equal(screen.getAllByRole('link', { name: /Buka sumber Kamera/ }).length, 1);
    await user.click(screen.getByRole('link', { name: /Buka sumber Kamera A/ }));
    await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Kamera A · Pod Engineering' })));
    assert.ok(screen.getByText(/Analisis otomatis setiap 60 detik/));
    assert.equal(screen.queryByRole('button', { name: /Jalankan Analisis|Mulai Analisis|Mulai Rekam/i }), null);
    assert.equal(calls, 0);
  } finally { api.startAnalysis = original; }
});

test('archive has current and historical metadata; filtering keeps source context', async () => {
  const user = userEvent.setup();
  await mount('/cameras/archive');
  assert.equal(screen.getAllByRole('link', { name: /Buka rekaman CAM-/ }).length, 16);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filter kamera rekaman' }), 'B');
  assert.equal(screen.getAllByRole('link', { name: /Buka rekaman CAM-/ }).length, 4);
  assert.ok(screen.getAllByText('File belum ditautkan').length > 0);
});

test('employee selection opens daily/weekly exposure detail with all header context', async () => {
  const user = userEvent.setup();
  await mount('/employees');
  assert.equal(screen.getAllByRole('link', { name: 'Lihat detail pegawai' }).length, 8);
  await user.type(screen.getByRole('textbox', { name: 'Cari pegawai' }), 'EMP-8021');
  await user.click(screen.getByRole('link', { name: 'Lihat detail pegawai' }));
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Priyapta Naufal' })));
  const context = within(summaryRegion());
  assert.ok(context.getByText('08.00–17.00 WIB'));
  assert.ok(context.getByText('Lokasi teramati'));
  assert.ok(context.getByText('Pembaruan hasil terakhir'));
  assert.ok(context.getByText('Belum direview'));
  assert.ok(context.getByText('Data demo'));
  assert.ok(screen.getByRole('button', { name: 'Harian', exact: true }));
  assert.ok(screen.getByRole('button', { name: 'Mingguan', exact: true }));
  assert.equal(screen.queryByRole('button', { name: 'Bulan', exact: true }), null);
  assert.equal(screen.queryByText(/Postur saat ini|Kondisi terkini secara live/i), null);
});

test('reference daily cards show 28 points, 56 per hour, Medium REBA, 40%, and 16.7% personal interval dose', async () => {
  await mount('/employees/EMP-8021?period=day&demo=1');
  const msd = within(msdCard()), noise = within(noiseCard());
  assert.ok(msd.getByText('Medium', { exact: true }));
  assert.match(msdCard().textContent || '', /5\s*\/\s*15/);
  assert.ok(msd.getByText('40%'));
  assert.ok(msd.getByText('28', { selector: 'strong' }));
  assert.ok(msd.getByText('56', { selector: 'strong' }));
  assert.ok(msd.getByText('45', { selector: 'strong' }));
  assert.ok(msd.getByText('14', { selector: 'strong' }));
  assert.ok(msd.getByText('Paparan punggung bawah'));
  assert.ok(noise.getByText('Cakupan parsial, perlu review HSE'));
  assert.ok(noise.getByText('16,7%'));
  assert.match(noiseCard().textContent || '', /88\s*dBA/);
  assert.ok(noise.getByText(/Profil contoh 85\/3/));
  assert.equal(noise.queryByText('Medium', { exact: true }), null);
  assert.equal(screen.getByRole('progressbar', { name: 'Persentase pengamatan valid' }).getAttribute('aria-valuenow'), '75');
});

test('switching period changes cards, trend, evidence and preserves per-hour arithmetic', async () => {
  const user = userEvent.setup();
  await mount('/employees/EMP-8021?period=day&demo=1');
  const dailyText = msdCard().textContent;
  await user.click(screen.getByRole('button', { name: 'Mingguan', exact: true }));
  assert.ok(screen.getByRole('heading', { name: 'Tren Paparan Mingguan' }));
  assert.notEqual(msdCard().textContent, dailyText);
  assert.match(noiseCard().textContent || '', /tidak dijumlahkan antarshift/);
  await user.click(within(msdCard()).getByRole('button', { name: 'Buka bukti' }));
  const dialog = screen.getByRole('dialog', { name: 'Bukti Rekaman · MSD' });
  assert.ok(within(dialog).getAllByText('Kamera C').length > 0);
  assert.ok(within(dialog).getAllByText('Kamera A').length > 0);
});

test('changing employee updates MSD, noise status and missing-data explanations', async () => {
  await mount('/employees/EMP-8109?period=day&demo=1');
  assert.ok(within(msdCard()).getByText('High', { exact: true }));
  assert.ok(within(noiseCard()).getByText('Kriteria paparan tercapai'));
  assert.ok(within(noiseCard()).getByText('133,3%'));
  act(() => { window.location.hash = '/employees/EMP-6920?period=day'; });
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Jessica Tan' })));
  assert.ok(within(msdCard()).getByText('Low', { exact: true }));
  assert.ok(within(noiseCard()).getByText('Cakupan area · asesmen personal diperlukan'));
  assert.ok(within(noiseCard()).getByText('Pembacaan area tidak menetapkan dosis personal'));
  act(() => { window.location.hash = '/employees/EMP-8044?period=day'; });
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Maya Putri' })));
  assert.ok(within(noiseCard()).getByText('Data pengukuran belum tersedia'));
  assert.ok(within(noiseCard()).getByText('Profil perhitungan belum tersedia'));
});

test('assessment and evidence modals retain metadata when the actual file is missing', async () => {
  const user = userEvent.setup();
  await mount('/employees/EMP-8021?period=day&demo=1');
  await user.click(within(msdCard()).getByRole('button', { name: 'Rincian penilaian' }));
  const detail = screen.getByRole('dialog', { name: 'Rincian Penilaian MSD' });
  assert.ok(within(detail).getByText('28 poin · 56 poin/jam valid'));
  assert.ok(within(detail).getAllByText('Data belum tersedia').length >= 2);
  await user.click(within(detail).getByRole('button', { name: 'Tutup rincian' }));
  await user.click(within(msdCard()).getByRole('button', { name: 'Buka bukti' }));
  const evidence = screen.getByRole('dialog', { name: 'Bukti Rekaman · MSD' });
  assert.ok(within(evidence).getByRole('heading', { name: 'Rekaman belum tersedia' }));
  assert.ok(within(evidence).getAllByText(/00:00–00:45/).length > 0);
  assert.match(evidence.textContent || '', /Subjek 1/);
});

test('mark-needs-evidence notes persist on refresh and stay scoped to the selected period', async () => {
  const user = userEvent.setup();
  const view = await mount('/employees/EMP-8021?period=day&demo=1');
  await user.click(screen.getByRole('button', { name: 'Tinjau hasil periode ini' }));
  const dialog = screen.getByRole('dialog', { name: 'Review · Priyapta Naufal' });
  await user.type(within(dialog).getByRole('textbox', { name: 'Nama / identitas petugas HSE' }), 'HSE-01');
  await user.type(within(dialog).getByRole('textbox', { name: 'Catatan HSE' }), 'Butuh rekaman pembanding dari sisi kiri.');
  await user.click(within(dialog).getByRole('button', { name: 'Tandai perlu bukti' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.ok(within(summaryRegion()).getByText('Perlu bukti'));
  const stored = Object.values(readLocalReviews())[0];
  assert.equal(stored.workerId, 'EMP-8021');
  assert.equal(stored.period, 'day');
  assert.ok(stored.snapshotId && stored.revision);
  view.unmount();
  await mount('/employees/EMP-8021?period=day&demo=1');
  assert.ok(within(summaryRegion()).getByText('Perlu bukti'));
  assert.ok(screen.getByText('Butuh rekaman pembanding dari sisi kiri.'));
  await user.click(screen.getByRole('button', { name: 'Mingguan' }));
  assert.ok(within(summaryRegion()).getByText('Belum direview'));
});

test('save-review uses frontend local state, updates REBA attribution, and does not rewrite noise status', async () => {
  const user = userEvent.setup();
  const original = workspaceApi.reviewWorker;
  let writes = 0;
  workspaceApi.reviewWorker = async () => { writes++; return { saved: true }; };
  try {
    await mount('/employees/EMP-8021?period=day&demo=1');
    await user.click(screen.getByRole('button', { name: 'Tinjau hasil periode ini' }));
    const dialog = screen.getByRole('dialog', { name: 'Review · Priyapta Naufal' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Nama / identitas petugas HSE' }), 'HSE-02');
    await user.type(within(dialog).getByRole('textbox', { name: 'Catatan HSE' }), 'Konteks dan cakupan fixture sudah ditinjau.');
    await user.click(within(dialog).getByRole('button', { name: 'Simpan review', exact: true }));
    await waitFor(() => assert.ok(within(summaryRegion()).getByText('Sudah direview HSE')));
    assert.ok(within(msdCard()).getByText('Sudah direview HSE · lokal'));
    assert.ok(within(noiseCard()).getByText('Cakupan parsial, perlu review HSE'));
    assert.equal(Object.values(readLocalReviews())[0].storage, 'frontend_local');
    assert.equal(writes, 0);
  } finally { workspaceApi.reviewWorker = original; }
});

test('new snapshot revisions make an open review stale and leave the new result unreviewed', async () => {
  const user = userEvent.setup();
  const date = localDate();
  const props = { workers: exampleWorkers, workerId: 'EMP-8021', windows: exampleWindows, recordings: exampleRecordings, noiseReadings: exampleNoiseReadings, example: true, onExample: () => {}, period: 'day' as const, setPeriod: () => {}, date, setDate: () => {}, onRefresh: () => {} };
  const view = render(<EmployeeDetail {...props} />);
  await user.click(screen.getByRole('button', { name: 'Tinjau hasil periode ini' }));
  const target = exampleWindows.find(window => window.worker_id === 'EMP-8021' && localDate(new Date(window.observed_at)) === date)!;
  view.rerender(<EmployeeDetail {...props} windows={exampleWindows.map(window => window.id === target.id ? { ...window, revision: 2 } : window)} />);
  const dialog = screen.getByRole('dialog', { name: 'Review · Priyapta Naufal' });
  assert.match(within(dialog).getByRole('alert').textContent || '', /Snapshot berubah/);
  assert.equal((within(dialog).getByRole('button', { name: 'Simpan review', exact: true }) as HTMLButtonElement).disabled, true);
  assert.ok(within(summaryRegion()).getByText('Belum direview'));
  assert.deepEqual(readLocalReviews(), {});
});

test('local needs-evidence state is reflected in the company review queue for the same period', async () => {
  const user = userEvent.setup();
  await mount('/overview?period=day&demo=1');
  const count = () => Number(screen.getByText('Pegawai perlu review').closest('article')?.querySelector('.metric-value')?.textContent?.replace('Pegawai', ''));
  const baseline = count();
  act(() => { window.location.hash = '/employees/EMP-6920?period=day'; });
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Jessica Tan' })));
  await user.click(screen.getByRole('button', { name: 'Tinjau hasil periode ini' }));
  const dialog = screen.getByRole('dialog', { name: 'Review · Jessica Tan' });
  await user.type(within(dialog).getByRole('textbox', { name: 'Nama / identitas petugas HSE' }), 'HSE-03');
  await user.type(within(dialog).getByRole('textbox', { name: 'Catatan HSE' }), 'Perlu pengukuran personal untuk melengkapi pembacaan area.');
  await user.click(within(dialog).getByRole('button', { name: 'Tandai perlu bukti' }));
  await waitFor(() => assert.ok(within(summaryRegion()).getByText('Perlu bukti')));
  act(() => { window.location.hash = '/overview'; });
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Gambaran Kesehatan Kerja' })));
  assert.equal(count(), baseline + 1);
});

test('recording labels still support multiple workers and survive reload after the rename', async () => {
  const user = userEvent.setup();
  const view = await mount('/recordings/archive-1');
  await user.click(screen.getByRole('button', { name: 'Edit label pegawai' }));
  const dialog = screen.getByRole('dialog', { name: 'Label Pegawai pada Rekaman' });
  assert.equal(within(dialog).getAllByRole('group').length, 2);
  const name = within(dialog).getAllByRole('textbox', { name: 'Nama pegawai' })[0];
  await user.clear(name); await user.type(name, 'Operator Uji');
  await user.click(within(dialog).getByRole('button', { name: 'Simpan label rekaman' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(readLocalRecordings()[0].labels[0].worker_name, 'Operator Uji');
  view.unmount(); await mount('/recordings/archive-1');
  assert.ok(screen.getByText('Operator Uji'));
});

test('periodic dashboard refresh remains read-only every minute and clears its timer', () => {
  const originalInterval = window.setInterval, originalClear = window.clearInterval;
  let callback: (() => void) | undefined, delay = 0, cleared = false, calls = 0;
  window.setInterval = ((handler: TimerHandler, ms?: number) => { callback = handler as () => void; delay = ms || 0; return 773; }) as typeof window.setInterval;
  window.clearInterval = ((id: number | undefined) => { if (id === 773) cleared = true; }) as typeof window.clearInterval;
  try {
    const refresh = () => calls++;
    const hook = renderHook(() => usePeriodicRefresh(refresh));
    assert.equal(delay, REFRESH_INTERVAL_MS); assert.equal(calls, 0);
    act(() => callback?.()); assert.equal(calls, 1);
    hook.unmount(); assert.equal(cleared, true);
  } finally { window.setInterval = originalInterval; window.clearInterval = originalClear; }
});

test('empty historical periods name missing data instead of displaying a low risk', async () => {
  await mount('/employees/EMP-8021?period=day&demo=1');
  fireEvent.change(screen.getByLabelText('Tanggal akhir rekap'), { target: { value: '2020-01-01' } });
  await waitFor(() => assert.ok(within(msdCard()).getByText('Risiko belum dinilai')));
  assert.ok(within(noiseCard()).getByText('Data pengukuran belum tersedia'));
  assert.equal((screen.getByRole('button', { name: 'Tinjau hasil periode ini' }) as HTMLButtonElement).disabled, true);
});

test('skip link focuses content without changing the current route', async () => {
  const user = userEvent.setup();
  await mount('/employees');
  await user.click(screen.getByRole('link', { name: 'Lewati ke konten' }));
  assert.equal(window.location.hash, '#/employees');
  assert.equal(document.activeElement?.id, 'main-content');
});
