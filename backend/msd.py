"""LLM interpretation of measured exposure, without clinical probability estimates."""
from datetime import datetime, timezone
import json
import os
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel, ConfigDict, Field

DEMO_WORKER_ID = 'demo-a'
DEMO_WORKER = {'id': DEMO_WORKER_ID, 'name': 'Employee A (Demo)', 'department': 'Demo · all recordings', 'initials': 'A'}
SOURCE = 'https://www.cdc.gov/niosh/ergonomics/ergo-programs/risk-factors.html'


class Finding(BaseModel):
    model_config = ConfigDict(extra='forbid')
    region: Literal['arm', 'back']
    potential_msd: Literal['shoulder_tendinopathy', 'low_back_pain', 'insufficient_evidence']
    review_priority: Literal['low', 'moderate', 'high', 'insufficient_data']
    rationale: str = Field(min_length=1, max_length=1400)
    recommendation: str = Field(min_length=1, max_length=1000)


class Interpretation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    summary: str = Field(min_length=1, max_length=1600)
    findings: list[Finding] = Field(min_length=2, max_length=2)
    limitations: list[str] = Field(min_length=1, max_length=6)
    clinical_msd_probability_pct: None


def analyze_msd(metrics):
    key = os.environ.get('OPENAI_API_KEY', '').strip()
    if not key:
        raise RuntimeError('OPENAI_API_KEY is not configured in backend/.env. Restart the backend after setting it.')
    model = os.environ.get('OPENAI_MSD_MODEL') or os.environ.get('OPENAI_VISION_MODEL') or 'gpt-4.1-mini'
    instructions = '''Write the entire response in English for an HSE demo dashboard. Interpret ONLY the supplied measurements.
Use the name Employee A. The following instructions are in Indonesian, but all output must be English.
Tafsirkan HANYA ringkasan
pengukuran postur yang diberikan. Semua rekaman diasumsikan milik Pegawai A untuk demo; identitas
tidak diverifikasi. Ini skrining paparan ergonomi, bukan diagnosis atau prediksi penyakit.
Jangan memberi angka probabilitas MSD, angka keyakinan penyakit, skor REBA, atau persentase buatan.
clinical_msd_probability_pct wajib null. exposure_pct adalah persentase durasi Moderate/High di
antara durasi terbaca, BUKAN peluang terkena penyakit. Jelaskan denominator dan coverage rendah.
Repetisi = Low → Moderate → Low (High boleh di tengah, Moderate wajib teramati); gap/missing memutus
siklus. Hitungan 1 Hz dapat melewatkan gerakan cepat atau menghitung jitter. Jangan mengklaim
jumlah angkatan/genggaman, durasi shift, gaya/beban, gejala, atau riwayat medis yang tidak diukur.
Berikan tepat satu finding arm dan satu back. potential_msd hanya kandidat untuk ditinjau:
arm: shoulder_tendinopathy atau insufficient_evidence; back: low_back_pain atau insufficient_evidence.
Jangan menyimpulkan seseorang mengidap kondisi tersebut. Jangan mengklasifikasi CTS karena postur
pergelangan/jari dan gaya genggam tidak diukur. Jika valid_s=0, pilih insufficient_evidence dan
insufficient_data. review_priority adalah prioritas pemeriksaan ergonomi kualitatif oleh LLM,
bukan tingkat risiko klinis tervalidasi. Jangan menyamakan rendahnya coverage dengan rendahnya risiko.
Berikan alasan yang merujuk angka terukur, saran ergonomi praktis, serta keterbatasan observasi.
Konteks NIOSH: postur, gaya, frekuensi, durasi dan faktor pekerja turut berpengaruh terhadap MSD.'''
    payload = {'model': model, 'store': False, 'instructions': instructions,
               'input': json.dumps(metrics, allow_nan=False), 'max_output_tokens': 4000,
               'text': {'format': {'type': 'json_schema', 'name': 'msd_exposure_review',
                                   'strict': True, 'schema': Interpretation.model_json_schema()}}}
    request = Request('https://api.openai.com/v1/responses', data=json.dumps(payload).encode(),
                      headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=90) as response:
            body = json.load(response)
    except HTTPError as error:
        raise RuntimeError(f'OpenAI returned HTTP {error.code}. Check model access, the API key, or quota, then retry.') from None
    except (URLError, TimeoutError):
        raise RuntimeError('OpenAI could not be reached or timed out. Please retry.') from None
    if body.get('status') != 'completed':
        raise RuntimeError('The OpenAI response was incomplete. Please retry.')
    output = ''.join(part['text'] for item in body.get('output', []) if item.get('type') == 'message'
                     for part in item.get('content', []) if part.get('type') == 'output_text')
    interpretation = Interpretation.model_validate_json(output)
    if {finding.region for finding in interpretation.findings} != {'arm', 'back'}:
        raise ValueError('Expected one finding per body region')
    for finding in interpretation.findings:
        allowed = 'shoulder_tendinopathy' if finding.region == 'arm' else 'low_back_pain'
        if finding.potential_msd not in (allowed, 'insufficient_evidence'):
            raise ValueError('MSD classification does not match region')
        if metrics['regions'][finding.region]['valid_s'] == 0 and (finding.potential_msd != 'insufficient_evidence' or finding.review_priority != 'insufficient_data'):
            raise ValueError('Unobserved region must remain unknown')
    return {'status': 'complete', 'language': 'en', 'model': body.get('model', model),
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'interpretation': interpretation.model_dump(), 'source_url': SOURCE}
