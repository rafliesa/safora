"""Real-video UI check against an isolated backend on 8000 and Vite on 3000."""
import csv
import io
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/run/current-system/sw/bin/google-chrome')
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:3000/#/cameras/archive')
    page.get_by_role('button', name='Add recording', exact=True).click()
    dialog = page.get_by_role('dialog')
    dialog.locator('input[type=file]').set_input_files(os.environ.get('TEST_VIDEO', '/tmp/healy-integration-clip.mp4'))
    dialog.get_by_role('button', name='Save recording', exact=True).click()
    expect(page.get_by_role('region', name='Model exposure results')).to_be_visible(timeout=20000)
    expect(page.get_by_role('link', name='Download per-second CSV')).to_be_visible(timeout=180000)
    page.wait_for_function("document.querySelector('video')?.readyState >= 2")
    assert page.locator('video').evaluate('(video) => video.error === null')
    recording_id = page.url.rsplit('/', 1)[-1]
    data = page.request.get(f'http://127.0.0.1:8000/recordings/{recording_id}/result').json()
    assert len(data['samples']) == 3
    assert all(s['clinical_msd_probability'] is None for s in data['samples'])
    for sample in data['samples']:
        page.locator('video').evaluate('(video, t) => {video.currentTime = t; video.dispatchEvent(new Event("timeupdate"));}', sample['timestamp_s'])
        expected = {None:'Not readable', 'low':'Low', 'moderate':'Moderate', 'high':'High'}[sample['uwiom_level']]
        expect(page.get_by_test_id('uwiom-level')).to_have_text(expected)
    rows = list(csv.DictReader(io.StringIO(page.request.get(f'http://127.0.0.1:8000/recordings/{recording_id}/samples.csv').body().decode('utf-8-sig'))))
    assert len(rows) == 3
    query = '?from=2026-01-01&to=2026-12-31'
    assert page.request.get('http://127.0.0.1:8000/observations'+query).json()['items'] == []
    page.get_by_role('button', name='Edit employee labels').click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_role('button', name='Add employee to video').click()
    dialog.get_by_label('Employee ID', exact=True).fill('qa-user124')
    dialog.get_by_label('Employee name', exact=True).fill('QA User124')
    dialog.get_by_label('Subject identifier in video').fill('Single foreground worker in sustAGE clip')
    dialog.get_by_role('checkbox').check()
    dialog.get_by_role('button', name='Save recording labels').click()
    expect(dialog).not_to_be_visible(timeout=15000)
    windows = page.request.get('http://127.0.0.1:8000/observations'+query).json()['items']
    assert len(windows) == 3 and all(w['worker_id'] == 'qa-user124' for w in windows)
    assert all(w['reba_score'] is None and w['exposure_points'] is None for w in windows)
    page.reload()
    expect(page.get_by_role('link', name='Download per-second CSV')).to_be_visible(timeout=15000)
    assert page.locator('video').get_attribute('src').startswith('/api/recordings/')
    page.screenshot(path='/tmp/healy-integrated-desktop.png', full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/healy-integrated-mobile.png', full_page=True)
    assert not errors, errors
    Path('/tmp/healy-integration-browser.json').write_text(json.dumps({'recording_id':recording_id,'samples':len(rows),'windows':len(windows),'levels':[s['uwiom_level'] for s in data['samples']],'page_errors':errors},indent=2))
    print(Path('/tmp/healy-integration-browser.json').read_text())
    browser.close()
