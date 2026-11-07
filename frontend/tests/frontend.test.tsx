import './dom.ts';
import React from 'react';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.tsx';
import { CompanyDashboard, EmployeeDetail } from '../src/pages/Workforce.tsx';
import EmployeePie from '../src/components/EmployeePie.tsx';
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
const summaryRegion = () => screen.getByRole('region', { name: 'Employee and period summary' });
const msdCard = () => screen.getByRole('article', { name: 'MSD Exposure' });
const noiseCard = () => screen.getByRole('article', { name: 'Noise Exposure' });

test('sidebar title toggle collapses labels while navigation stays accessible', async () => {
  const user = userEvent.setup();
  await mount('/overview?demo=1');
  assert.ok(screen.getByRole('link', { name: 'RAISE, overview' }));
  assert.equal(screen.queryByRole('button', { name: 'RAISE, open workspace menu' }), null);
  await user.click(screen.getByRole('button', { name: 'Close sidebar' }));
  assert.equal(screen.getByRole('button', { name: 'Open sidebar' }).getAttribute('aria-expanded'), 'false');
  assert.ok(screen.getByRole('navigation', { name: 'Main navigation' }));
  assert.equal(document.getElementById('workspace-sidebar')?.closest('.app-body')?.classList.contains('sidebar-collapsed'), true);
  await user.keyboard('{Enter}');
  assert.ok(screen.getByRole('navigation', { name: 'Main navigation' }));
  assert.equal(screen.getByRole('button', { name: 'Close sidebar' }).getAttribute('aria-expanded'), 'true');
});

test('monthly overview does not construct a date formatter for every observation', () => {
  const original = Intl.DateTimeFormat;
  let constructions = 0;
  Intl.DateTimeFormat = new Proxy(original, { construct(target, args) {
    constructions++;
    return Reflect.construct(target, args);
  } });
  try {
    render(<CompanyDashboard workers={exampleWorkers} windows={exampleWindows} recordings={exampleRecordings}
      noiseReadings={exampleNoiseReadings} date="2026-11-07" period="month" setPeriod={() => {}}
      setDate={() => {}} example onExample={() => {}} />);
    assert.ok(constructions < 100, `Constructed ${constructions} date formatters for one monthly render`);
  } finally { Intl.DateTimeFormat = original; }
});

test('RAISE branding and separate dashboards; service mode retains honest empty states', async () => {
  window.sessionStorage.setItem('raise-data-mode-v1', 'service');
  await mount('/overview');
  assert.ok(screen.getByRole('link', { name: 'RAISE, overview' }));
  assert.match(document.title, /^RAISE/);
  assert.doesNotMatch(document.body.textContent || '', /HEALY/i);
  assert.ok(screen.getByRole('link', { name: 'Company Dashboard', exact: true }));
  assert.ok(screen.getByRole('link', { name: 'Employee Dashboard', exact: true }));
  assert.ok(screen.getByText('No reviews in the queue'));
  assert.equal(screen.queryByText('Employee Summaries'), null);
  assert.equal(screen.queryByText('Priyapta Naufal'), null);
});

test('source camera has automatic cadence and no manual inference trigger or fixed employee', async () => {
  const user = userEvent.setup();
  let calls = 0;
  const original = api.startAnalysis;
  api.startAnalysis = async () => { calls++; throw new Error('No user analysis trigger'); };
  try {
    await mount('/cameras');
    assert.equal(screen.getAllByText('Not connected').length, 4);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter workstation pod' }), 'Engineering');
    assert.equal(screen.getAllByRole('link', { name: /Open camera source/ }).length, 1);
    await user.click(screen.getByRole('link', { name: /Open camera source A/ }));
    await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Camera A · Pod Engineering' })));
    assert.equal(screen.queryByRole('button', { name: /Run Analysis|Start Analysis|Start Recording/i }), null);
    assert.equal(calls, 0);
  } finally { api.startAnalysis = original; }
});

test('archive has current and historical metadata; filtering keeps source context', async () => {
  const user = userEvent.setup();
  await mount('/cameras/archive');
  assert.equal(screen.getAllByRole('link', { name: /Open recording CAM-/ }).length, 16);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filter recordings by camera' }), 'B');
  assert.equal(screen.getAllByRole('link', { name: /Open recording CAM-/ }).length, 4);
  assert.ok(screen.getAllByText('No file linked').length > 0);
});

test('employee selection opens daily/weekly exposure detail with all header context', async () => {
  const user = userEvent.setup();
  await mount('/employees');
  assert.equal(screen.getAllByRole('link', { name: 'View employee details' }).length, 8);
  await user.type(screen.getByRole('textbox', { name: 'Search employees' }), 'EMP-8021');
  await user.click(screen.getByRole('link', { name: 'View employee details' }));
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Priyapta Naufal' })));
  const context = within(summaryRegion());
  assert.ok(context.getByText('08:00–17:00 WIB'));
  assert.ok(context.getByText('Observed locations'));
  assert.ok(context.getByText('Last results update'));
  assert.ok(context.getByText('Not reviewed'));
  assert.ok(context.getByText('Demo data'));
  assert.ok(screen.getByRole('button', { name: 'Daily', exact: true }));
  assert.ok(screen.getByRole('button', { name: 'Weekly', exact: true }));
  assert.equal(screen.queryByRole('button', { name: 'Month', exact: true }), null);
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
  assert.ok(msd.getByText('Lower back exposure'));
  assert.ok(noise.getByText('Partial coverage, HSE review needed'));
  assert.ok(noise.getByText('16.7%'));
  assert.match(noiseCard().textContent || '', /88\s*dBA/);
  assert.ok(noise.getByText(/Example 85\/3 profile/));
  assert.equal(noise.queryByText('Medium', { exact: true }), null);
  assert.equal(screen.getByRole('progressbar', { name: 'Valid observation percentage' }).getAttribute('aria-valuenow'), '75');
});

test('switching period changes cards, trend, evidence and preserves per-hour arithmetic', async () => {
  const user = userEvent.setup();
  await mount('/employees/EMP-8021?period=day&demo=1');
  const dailyText = msdCard().textContent;
  await user.click(screen.getByRole('button', { name: 'Weekly', exact: true }));
  assert.ok(screen.getByRole('heading', { name: 'Weekly Exposure Trend' }));
  assert.notEqual(msdCard().textContent, dailyText);
  assert.match(noiseCard().textContent || '', /not summed across shifts/);
  await user.click(within(msdCard()).getByRole('button', { name: 'Open evidence' }));
  const dialog = screen.getByRole('dialog', { name: 'Recording Evidence · MSD' });
  assert.ok(within(dialog).getAllByText('Camera C').length > 0);
  assert.ok(within(dialog).getAllByText('Camera A').length > 0);
});

test('changing employee updates MSD, noise status and missing-data explanations', async () => {
  await mount('/employees/EMP-8109?period=day&demo=1');
  assert.ok(within(msdCard()).getByText('High', { exact: true }));
  assert.ok(within(noiseCard()).getByText('Exposure criterion reached'));
  assert.ok(within(noiseCard()).getByText('133.3%'));
  act(() => { window.location.hash = '/employees/EMP-6920?period=day'; });
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Jessica Tan' })));
  assert.ok(within(msdCard()).getByText('Low', { exact: true }));
  assert.ok(within(noiseCard()).getByText('Area coverage · personal assessment needed'));
  assert.ok(within(noiseCard()).getByText('Area readings do not establish personal dose'));
  act(() => { window.location.hash = '/employees/EMP-8044?period=day'; });
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Maya Putri' })));
  assert.ok(within(noiseCard()).getByText('Measurement data unavailable'));
  assert.ok(within(noiseCard()).getByText('Calculation profile unavailable'));
});

test('assessment and evidence modals retain metadata when the actual file is missing', async () => {
  const user = userEvent.setup();
  await mount('/employees/EMP-8021?period=day&demo=1');
  await user.click(within(msdCard()).getByRole('button', { name: 'Assessment details' }));
  const detail = screen.getByRole('dialog', { name: 'MSD Assessment Details' });
  assert.ok(within(detail).getByText('28 points · 56 points per valid hour'));
  assert.ok(within(detail).getAllByText('Data unavailable').length >= 2);
  await user.click(within(detail).getByRole('button', { name: 'Close details' }));
  await user.click(within(msdCard()).getByRole('button', { name: 'Open evidence' }));
  const evidence = screen.getByRole('dialog', { name: 'Recording Evidence · MSD' });
  assert.ok(within(evidence).getByRole('heading', { name: 'Recording unavailable' }));
  assert.ok(within(evidence).getAllByText(/00:00–00:45/).length > 0);
  assert.match(evidence.textContent || '', /Subject 1/);
});

test('mark-needs-evidence notes persist on refresh and stay scoped to the selected period', async () => {
  const user = userEvent.setup();
  const view = await mount('/employees/EMP-8021?period=day&demo=1');
  await user.click(screen.getByRole('button', { name: 'Review this period' }));
  const dialog = screen.getByRole('dialog', { name: 'Review · Priyapta Naufal' });
  await user.type(within(dialog).getByRole('textbox', { name: 'HSE reviewer name / ID' }), 'HSE-01');
  await user.type(within(dialog).getByRole('textbox', { name: 'HSE notes' }), 'Butuh rekaman pembanding dari sisi kiri.');
  await user.click(within(dialog).getByRole('button', { name: 'Mark as needing evidence' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.ok(within(summaryRegion()).getByText('Evidence needed'));
  const stored = Object.values(readLocalReviews())[0];
  assert.equal(stored.workerId, 'EMP-8021');
  assert.equal(stored.period, 'day');
  assert.ok(stored.snapshotId && stored.revision);
  view.unmount();
  await mount('/employees/EMP-8021?period=day&demo=1');
  assert.ok(within(summaryRegion()).getByText('Evidence needed'));
  assert.ok(screen.getByText('Butuh rekaman pembanding dari sisi kiri.'));
  await user.click(screen.getByRole('button', { name: 'Weekly' }));
  assert.ok(within(summaryRegion()).getByText('Not reviewed'));
});

test('save-review uses frontend local state, updates REBA attribution, and does not rewrite noise status', async () => {
  const user = userEvent.setup();
  const original = workspaceApi.reviewWorker;
  let writes = 0;
  workspaceApi.reviewWorker = async () => { writes++; return { saved: true }; };
  try {
    await mount('/employees/EMP-8021?period=day&demo=1');
    await user.click(screen.getByRole('button', { name: 'Review this period' }));
    const dialog = screen.getByRole('dialog', { name: 'Review · Priyapta Naufal' });
    await user.type(within(dialog).getByRole('textbox', { name: 'HSE reviewer name / ID' }), 'HSE-02');
    await user.type(within(dialog).getByRole('textbox', { name: 'HSE notes' }), 'Konteks dan cakupan fixture sudah ditinjau.');
    await user.click(within(dialog).getByRole('button', { name: 'Save review', exact: true }));
    await waitFor(() => assert.ok(within(summaryRegion()).getByText('Reviewed by HSE')));
    assert.ok(within(msdCard()).getByText('Reviewed by HSE · local'));
    assert.ok(within(noiseCard()).getByText('Partial coverage, HSE review needed'));
    assert.equal(Object.values(readLocalReviews())[0].storage, 'frontend_local');
    assert.equal(writes, 0);
  } finally { workspaceApi.reviewWorker = original; }
});

test('new snapshot revisions make an open review stale and leave the new result unreviewed', async () => {
  const user = userEvent.setup();
  const date = localDate();
  const props = { workers: exampleWorkers, workerId: 'EMP-8021', windows: exampleWindows, recordings: exampleRecordings, noiseReadings: exampleNoiseReadings, example: true, onExample: () => {}, period: 'day' as const, setPeriod: () => {}, date, setDate: () => {}, onRefresh: () => {} };
  const view = render(<EmployeeDetail {...props} />);
  await user.click(screen.getByRole('button', { name: 'Review this period' }));
  const target = exampleWindows.find(window => window.worker_id === 'EMP-8021' && localDate(new Date(window.observed_at)) === date)!;
  view.rerender(<EmployeeDetail {...props} windows={exampleWindows.map(window => window.id === target.id ? { ...window, revision: 2 } : window)} />);
  const dialog = screen.getByRole('dialog', { name: 'Review · Priyapta Naufal' });
  assert.match(within(dialog).getByRole('alert').textContent || '', /The snapshot changed/);
  assert.equal((within(dialog).getByRole('button', { name: 'Save review', exact: true }) as HTMLButtonElement).disabled, true);
  assert.ok(within(summaryRegion()).getByText('Not reviewed'));
  assert.deepEqual(readLocalReviews(), {});
});

test('local needs-evidence state is reflected in the company review queue for the same period', async () => {
  const user = userEvent.setup();
  await mount('/overview?period=day&demo=1');
  const count = () => Number(within(screen.getByRole('region', { name: 'Employee review distribution' })).getByRole('img').getAttribute('aria-label')?.split(' ')[0]);
  const baseline = count();
  act(() => { window.location.hash = '/employees/EMP-6920?period=day'; });
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Jessica Tan' })));
  await user.click(screen.getByRole('button', { name: 'Review this period' }));
  const dialog = screen.getByRole('dialog', { name: 'Review · Jessica Tan' });
  await user.type(within(dialog).getByRole('textbox', { name: 'HSE reviewer name / ID' }), 'HSE-03');
  await user.type(within(dialog).getByRole('textbox', { name: 'HSE notes' }), 'Perlu pengukuran personal untuk melengkapi pembacaan area.');
  await user.click(within(dialog).getByRole('button', { name: 'Mark as needing evidence' }));
  await waitFor(() => assert.ok(within(summaryRegion()).getByText('Evidence needed')));
  act(() => { window.location.hash = '/overview'; });
  await waitFor(() => assert.ok(screen.getByRole('heading', { name: 'Workplace Health Overview' })));
  assert.equal(count(), baseline + 1);
});

test('review pie uses all employees as denominator and handles an empty workforce', () => {
  const props = { workers: exampleWorkers, windows: [], period: 'day' as const, date: localDate(),
    setPeriod: () => {}, setDate: () => {}, example: false, onExample: () => {} };
  const view = render(<CompanyDashboard {...props} />);
  const region = () => within(screen.getByRole('region', { name: 'Employee review distribution' }));
  assert.equal(region().getByRole('img').getAttribute('aria-label'), `0 of ${exampleWorkers.length} employees need review (0%)`);
  view.rerender(<CompanyDashboard {...props} workers={[]} />);
  assert.equal(region().queryByRole('img'), null);
  assert.ok(region().getByText('No employees available.'));
});

test('pie segments show counts and percentages on hover and keyboard focus, including a full circle', async () => {
  const user = userEvent.setup();
  const view = render(<EmployeePie title="Risk distribution" chartLabel="Risk chart"
    segments={[{ label: 'High', count: 2, color: '#991b1b' }, { label: 'Low', count: 6, color: '#2e7d62' }]} />);
  const region = screen.getByRole('region', { name: 'Risk distribution' });
  const slice = region.querySelector('path');
  assert.ok(slice);
  fireEvent.mouseEnter(slice);
  assert.equal(region.querySelector('[aria-live]')?.textContent, 'High: 2 of 8 employees (25%)');
  await user.tab();
  await user.tab();
  assert.equal(region.querySelector('[aria-live]')?.textContent, 'Low: 6 of 8 employees (75%)');
  await user.keyboard('{Escape}');
  assert.match(region.querySelector('[aria-live]')?.textContent || '', /Hover or select/);
  view.rerender(<EmployeePie title="Risk distribution" chartLabel="Risk chart"
    segments={[{ label: 'Not assessed', count: 8, color: '#b8c4ce' }]} />);
  assert.equal(region.querySelectorAll('circle').length, 1);
  assert.equal(region.querySelectorAll('path').length, 0);
});

test('risk distribution separates every REBA band and keeps unassessed employees visible', () => {
  const scores = [1, 3, 7, 10, 15, null];
  const workers = scores.map((_, index) => ({ ...exampleWorkers[0], id: `risk-${index}` }));
  const windows = scores.map((score, index) => ({ ...exampleWindows[0], id: `risk-window-${index}`,
    worker_id: workers[index].id, observed_at: '2026-11-07T02:00:00Z', reba_score: score }));
  render(<CompanyDashboard workers={workers} windows={windows} period="day" date="2026-11-07"
    setPeriod={() => {}} setDate={() => {}} example onExample={() => {}} />);
  const region = within(screen.getByRole('region', { name: 'Employee risk distribution' }));
  for (const label of ['Negligible · 1', 'Low · 2–3', 'Medium · 4–7', 'High · 8–10', 'Very high · 11–15', 'Not assessed']) {
    assert.ok(region.getByRole('button', { name: `${label}: 1 of 6 employees (17%)` }));
  }
});

test('recording labels still support multiple workers and survive reload after the rename', async () => {
  const user = userEvent.setup();
  const view = await mount('/recordings/archive-1');
  await user.click(screen.getByRole('button', { name: 'Edit employee labels' }));
  const dialog = screen.getByRole('dialog', { name: 'Employee Recording Labels' });
  assert.equal(within(dialog).getAllByRole('group').length, 2);
  const name = within(dialog).getAllByRole('textbox', { name: 'Employee name' })[0];
  await user.clear(name); await user.type(name, 'Operator Uji');
  await user.click(within(dialog).getByRole('button', { name: 'Save recording labels' }));
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
  fireEvent.change(screen.getByLabelText('Summary end date'), { target: { value: '2020-01-01' } });
  await waitFor(() => assert.ok(within(msdCard()).getByText('Risk not assessed')));
  assert.ok(within(noiseCard()).getByText('Measurement data unavailable'));
  assert.equal((screen.getByRole('button', { name: 'Review this period' }) as HTMLButtonElement).disabled, true);
});

test('skip link focuses content without changing the current route', async () => {
  const user = userEvent.setup();
  await mount('/employees');
  await user.click(screen.getByRole('link', { name: 'Skip to content' }));
  assert.equal(window.location.hash, '#/employees');
  assert.equal(document.activeElement?.id, 'main-content');
});
