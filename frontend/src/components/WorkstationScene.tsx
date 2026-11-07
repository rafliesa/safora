import { useId } from 'react';

export default function WorkstationScene({ view = 'side', variant = 'A', large = false }: { view?: 'side' | 'front'; variant?: string; large?: boolean }) {
  const id = useId().replace(/:/g, '');
  const warning = variant === 'B';
  const color = '#9BBEDC';
  const lean = variant === 'D' ? -12 : warning ? 14 : 0;
  return <svg className={`workstation-scene ${large ? 'scene-large' : ''}`} viewBox="0 0 640 300" fill="none" role="img" aria-label={`Workstation illustration, ${view === 'front' ? 'front view' : 'side view'}, not a recording or analysis result`}>
    <defs><pattern id={`grid-${id}`} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" stroke="#94a3b8" strokeOpacity=".07" strokeWidth=".7" /></pattern></defs>
    <rect width="640" height="300" fill="#08131C" /><rect width="640" height="300" fill={`url(#grid-${id})`} />
    <path d="M40 259H602" stroke="#455165" strokeWidth="1.3" /><path d="M80 259L39 300M180 259L158 300M280 259L276 300M380 259L397 300M480 259L516 300M580 259L635 300M12 285H628" stroke="#94a3b8" strokeOpacity=".08" />
    <rect x="49" y="56" width="89" height="112" rx="4" fill="#1a2638" stroke="#2b384b" />
    <path d="M59 148L77 119L91 132L111 94L128 109" stroke="#435166" strokeWidth="1.5" /><path d="M60 70H107M60 78H90" stroke="#344257" strokeWidth="3" strokeLinecap="round" />
    <path d="M527 252V201M518 220C499 218 503 202 509 199C523 197 528 211 527 224M530 209C533 187 551 193 550 201C550 212 536 218 530 218" stroke="#3e5057" strokeWidth="4" strokeLinecap="round" /><path d="M511 239H542L538 257H516L511 239Z" fill="#344352" />
    {view === 'side' ? <>
      <rect x="367" y="87" width="116" height="80" rx="7" fill="#2e3b50" stroke="#5b687d" strokeWidth="1.3" /><rect x="374" y="94" width="102" height="64" rx="3" fill="#1d2a3d" /><path d="M385 113H434M385 122H459M385 131H421" stroke="#405069" strokeWidth="3" strokeLinecap="round" /><path d="M423 167V188M405 189H441" stroke="#6d7889" strokeWidth="4" strokeLinecap="round" />
      <path d="M321 197H505M341 200V258M490 200V258" stroke="#6b7687" strokeWidth="5" strokeLinecap="round" /><path d="M350 190H397" stroke="#7e8897" strokeWidth="4" strokeLinecap="round" />
      <path d="M216 151L226 211H277M249 215V252M225 258L249 251L274 258" stroke="#4e5b70" strokeWidth="6" strokeLinecap="round" /><rect x="211" y="138" width="17" height="55" rx="8" fill="#3c4960" transform="rotate(-8 211 138)" />
      <path d={`M${276 + lean} 112L260 166L258 202L310 208L329 251L351 253`} stroke="#465268" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${276 + lean} 123L311 169L359 181`} stroke="#515e73" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx={286 + lean} cy="84" rx="22" ry="27" fill="#576477" /><path d={`M${281 + lean} 57C${267 + lean} 57 ${261 + lean} 68 ${264 + lean} 80L${278 + lean} 76L${299 + lean} 79C${303 + lean} 66 ${292 + lean} 57 ${281 + lean} 57Z`} fill="#303d51" />
      <path d={`M${286 + lean} 101L${276 + lean} 120L260 167L258 201L309 208L329 251L350 253M${276 + lean} 121L311 169L359 181`} stroke={color} strokeOpacity=".9" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${286 + lean} 101L${276 + lean} 120L260 167`} stroke={warning ? '#9BBEDC' : color} strokeWidth="2.5" strokeLinecap="round" />
      {[[286 + lean, 101], [276 + lean, 121], [260, 167], [258, 201], [309, 208], [329, 251], [311, 169], [359, 181]].map(([x, y], index) => <g key={index}><circle cx={x} cy={y} r="6" fill="#08131C" /><circle cx={x} cy={y} r="3.5" fill={warning && index < 3 ? '#9BBEDC' : color} /></g>)}
      <path d="M237 54H223V68M350 54H364V68M223 227V242H237M350 242H364V227" stroke={color} strokeOpacity=".45" strokeWidth="1.2" />
      <path d="M258 163V134M258 139A29 29 0 0 1 276 145" stroke="#8a96a7" strokeOpacity=".6" strokeDasharray="3 4" />
    </> : <>
      <path d="M229 150L228 216H403M312 218V251M279 259L312 250L344 259" stroke="#4e5b70" strokeWidth="6" strokeLinecap="round" /><rect x="243" y="135" width="137" height="76" rx="20" fill="#2c3a4f" />
      <path d="M311 116V201M267 135L255 184L287 201M355 135L370 184L337 201M311 201L274 213L272 253M311 201L350 213L352 253" stroke="#4d5b70" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="311" cy="83" rx="24" ry="29" fill="#576477" /><path d="M288 77C285 46 337 45 336 77L322 68L307 75L288 77Z" fill="#303d51" />
      <path d="M311 112V202L274 213L272 253M311 202L350 213L352 253M267 135L255 184L287 201M355 135L370 184L337 201" stroke={color} strokeWidth="2.3" strokeLinecap="round" /><path d="M267 135L311 123L355 135" stroke="#9BBEDC" strokeWidth="2.3" strokeLinecap="round" />
      {[[311, 112], [311, 123], [267, 135], [355, 135], [255, 184], [370, 184], [287, 201], [337, 201], [311, 202], [274, 213], [350, 213], [272, 253], [352, 253]].map(([x, y], index) => <g key={index}><circle cx={x} cy={y} r="5.5" fill="#08131C" /><circle cx={x} cy={y} r="3.1" fill={index === 2 || index === 3 ? '#9BBEDC' : color} /></g>)}
      <path d="M236 43H222V57M386 43H400V57M222 245V259H236M386 259H400V245" stroke={color} strokeOpacity=".45" strokeWidth="1.2" />
    </>}
    <circle cx="579" cy="64" r="18" stroke="#3c485b" strokeDasharray="2 4" /><path d="M572 64H586M579 57V71" stroke="#6a778a" strokeWidth="1.1" />
  </svg>;
}
