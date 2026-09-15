'use client';
import { useMemo, useState } from 'react';
import { ChevronRight, RotateCcw, ArrowLeft } from 'lucide-react';
import { selectScenario } from '../../lib/domain/simulation/dr.ts';
import type { DRScenario } from '../../lib/domain/simulation/dr.ts';
import { loadDrPack, type LoadedDrPack } from '../../content/packs/dr-mechanism-0.1.0/load.ts';

export interface MechanismLessonProps {
  releaseId: string;
  scenario: DRScenario;
  focus: string[];
  onScenario: (id: DRScenario) => void;
  onToggleFocus: (id: string) => void;
  onReset: () => void;
  onReturn: () => void;
  onQuestionResult: (taskId: string, correct: boolean) => void;
}

export const SCENARIO_ID: Record<DRScenario, string> = {
  normal_barrier: 'Sawar normal',
  leakage: 'Kebocoran / edema',
  capillary_nonperfusion: 'Nonperfusi kapiler',
  ischemia_neovascularization: 'Iskemia + neovaskularisasi',
  combined: 'Gabungan',
};

const ORDER: DRScenario[] = ['normal_barrier', 'leakage', 'capillary_nonperfusion', 'ischemia_neovascularization', 'combined'];

function loadPack(): { pack: LoadedDrPack | null; error: string } {
  try {
    return { pack: loadDrPack(), error: '' };
  } catch (e) {
    return { pack: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export default function MechanismLesson(props: MechanismLessonProps) {
  const { pack, error } = useMemo(() => loadPack(), []);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const evaluated = useMemo(() => selectScenario(props.scenario), [props.scenario]);
  if (error || !pack) {
    return (
      <div className="structure-title">
        <span className="tissue-category">Mekanisme DR · draft</span>
        <h2>Paket belum dapat dimuat</h2>
        <p>{error || 'unknown'}</p>
      </div>
    );
  }
  const state = evaluated.ok ? evaluated.state : null;
  const mechanisms = pack.mechanisms.filter(m => state?.activeMechanismIds.includes(m.id));
  const focused = mechanisms.find(m => props.focus.includes(m.id)) ?? mechanisms[0];
  const claims = pack.claims.filter(c => mechanisms.some(m => m.claimIds.includes(c.id)));
  function answer(taskId: string, optionId: string, correct: boolean) {
    setAnswers(a => (a[taskId] === optionId ? a : { ...a, [taskId]: optionId }));
    props.onQuestionResult(taskId, correct);
  }
  return (
    <div>
      <div className="structure-title">
        <span className="tissue-category">Mekanisme DR · draft, bukan diagnosis</span>
        <h2>{SCENARIO_ID[props.scenario]}</h2>
        <p>Skenario {ORDER.indexOf(props.scenario) + 1} dari {ORDER.length} · urutan belajar, bukan perjalanan pasien</p>
      </div>
      <div className="detail-section">
        <h3>Pilih skenario</h3>
        <div className="cataract-types" role="group" aria-label="Skenario mekanisme">
          {ORDER.map(id => (
            <button key={id} className={props.scenario === id ? 'active' : ''} aria-pressed={props.scenario === id} onClick={() => props.onScenario(id)}>
              {SCENARIO_ID[id]}
            </button>
          ))}
        </div>
      </div>
      <div className="detail-section">
        <h3>Fokus mekanisme</h3>
        <div className="cataract-types" role="group" aria-label="Fokus mekanisme">
          {mechanisms.map(m => (
            <button key={m.id} className={props.focus.includes(m.id) ? 'active' : ''} aria-pressed={props.focus.includes(m.id)} onClick={() => props.onToggleFocus(m.id)}>
              {m.name.en ?? m.id}
            </button>
          ))}
        </div>
      </div>
      {focused && (
        <div className="detail-section">
          <h3>Sedang dipelajari</h3>
          <p>{focused.description}</p>
        </div>
      )}
      <div className="detail-section">
        <h3>Uji pemahaman (3 soal tetap)</h3>
        {pack.questions.map((q, qi) => {
          const picked = answers[q.id];
          const done = picked !== undefined;
          return (
            <div key={q.id} className="mech-question">
              <p><strong>{qi + 1}. </strong>{q.prompt}</p>
              {q.options.map((o, oi) => {
                const cls = !done ? '' : o.id === q.correctOptionId ? 'correct' : o.id === picked ? 'incorrect' : '';
                return (
                  <button key={o.id} className={cls} onClick={() => answer(q.id, o.id, o.id === q.correctOptionId)}>
                    {String.fromCharCode(65 + oi)}<span>{o.text}</span>
                  </button>
                );
              })}
              {done && (
                <p className="quiz-feedback" role="status">
                  <strong>{picked === q.correctOptionId ? 'Tepat.' : 'Belum tepat.'}</strong> Lihat mekanisme terkait di atas. Distraktor masih usulan draft.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <details className="fold">
        <summary><span>Penjelasan, sumber & batas</span><ChevronRight size={15} /></summary>
        <div className="fold-body">
          {claims.map(c => (
            <p key={c.id}><strong>{c.id}.</strong> {c.context} Batas: {c.limitations.join(' ')}</p>
          ))}
          <p className="small-note">
            Sumber: {pack.sources.map(s => `${s.title} (${s.version})`).join('; ')}. Skala/waktu disederhanakan;
            animasi adalah ilustrasi di atas model kausal, bukan transpor numerik. Tanpa prediktor HbA1c, tahun, VEGF, atau visus.
          </p>
        </div>
      </details>
      <div className="structure-controls">
        <button className="isolate-button exploration-reset" onClick={props.onReset}><RotateCcw size={16} />Ulangi skenario awal</button>
        <button className="isolate-button" onClick={props.onReturn}><ArrowLeft size={16} />Kembali ke anatomi</button>
      </div>
    </div>
  );
}
