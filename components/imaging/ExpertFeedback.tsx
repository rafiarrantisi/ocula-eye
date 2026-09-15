'use client';

export interface FeedbackDot {
  id: string;
  x: number;
  y: number;
  classId: string;
  status?: 'tp' | 'fp' | 'duplikat' | 'diabaikan';
  matchedTargetId?: string | null;
}

export interface PerClassScore {
  classId: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface MissedTarget {
  id: string;
  x: number;
  y: number;
  classId: string;
}

export interface FeedbackResult {
  tp: number;
  fp: number;
  fn: number;
  duplicates?: number;
  ignored?: number;
  precision: number | null;
  recall: number | null;
  f1?: number | null;
  perClass: PerClassScore[];
  gradeStatus: string;
  gradeExpected?: string | null;
  gradeGiven?: string | null;
  rationale: string;
  missed: MissedTarget[];
  falseIds: string[];
  duplicateIds: string[];
  ignoredNote?: string | null;
}

export interface ExpertTarget {
  id: string;
  x: number;
  y: number;
  classId: string;
  ambiguous?: boolean;
}

export interface ExpertRegion {
  id: string;
  label: string;
  polygon: number[][];
}

export interface ExpertData {
  targets: ExpertTarget[];
  regions: ExpertRegion[];
}

export interface ExpertFeedbackProps {
  visible: boolean;
  marks: FeedbackDot[];
  result: FeedbackResult;
  expert: ExpertData | null;
  showExpert: boolean;
  onToggleExpert: () => void;
  onZoomToError: (kind: 'missed' | 'false' | 'duplicate', id: string) => void;
}

type ErrorKind = 'missed' | 'false' | 'duplicate';

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(2).replace('.', ',');
}

function dotStatusLabel(dot: FeedbackDot): string {
  if (dot.status === 'tp') {
    return 'tepat';
  }
  if (dot.status === 'fp') {
    return 'salah';
  }
  if (dot.status === 'duplikat') {
    return 'duplikat';
  }
  if (dot.status === 'diabaikan') {
    return 'diabaikan';
  }
  return 'ditandai';
}

export default function ExpertFeedback(props: ExpertFeedbackProps): React.JSX.Element {
  const { visible, marks, result, expert, showExpert, onToggleExpert, onZoomToError } = props;

  if (!visible) {
    return (
      <div className='ocf-feedback ocf-locked' role='status'>
        <p>Umpan balik pakar terkunci. Kirim jawaban untuk membukanya.</p>
      </div>
    );
  }

  const ignoredCount = result.ignored ?? 0;
  const duplicateCount = result.duplicates ?? result.duplicateIds.length;
  const ambiguousCount = expert ? expert.targets.filter((target) => target.ambiguous).length : 0;
  const showIgnoredNote = ignoredCount > 0 || ambiguousCount > 0 || (result.ignoredNote ?? '') !== '';

  const errorSection = (title: string, kind: ErrorKind, ids: string[], emptyText: string): React.JSX.Element => (
    <div className='ocf-err-block'>
      <h4>{title}</h4>
      {ids.length === 0 ? (
        <p className='ocf-note'>Tidak ada. {emptyText}</p>
      ) : (
        <ul className='ocf-err-list'>
          {ids.map((id) => (
            <li key={`${kind}-${id}`}>
              <span>{id}</span>
              <button type='button' className='ocf-mini-btn' onClick={() => onZoomToError(kind, id)}>
                Perbesar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className='ocf-feedback'>
      <div className='ocf-toggle' role='group' aria-label='Lapisan titik'>
        <button
          type='button'
          className={showExpert ? 'ocf-toggle-btn' : 'ocf-toggle-btn ocf-toggle-active'}
          aria-pressed={!showExpert}
          onClick={() => {
            if (showExpert) {
              onToggleExpert();
            }
          }}
        >
          Tanda saya ({marks.length})
        </button>
        <button
          type='button'
          className={showExpert ? 'ocf-toggle-btn ocf-toggle-active' : 'ocf-toggle-btn'}
          aria-pressed={showExpert}
          onClick={() => {
            if (!showExpert) {
              onToggleExpert();
            }
          }}
        >
          Tanda pakar ({expert ? expert.targets.length : 0})
        </button>
      </div>
      {showExpert && expert ? (
        <ul className='ocf-err-list'>
          {expert.targets.map((target) => (
            <li key={target.id}>
              <span>{`${target.id} · ${target.classId}${target.ambiguous ? ' · ambigu' : ''}`}</span>
            </li>
          ))}
          {expert.targets.length === 0 ? <li><span>Belum ada target pakar pada kasus ini.</span></li> : null}
        </ul>
      ) : (
        <ul className='ocf-err-list'>
          {marks.map((dot) => (
            <li key={dot.id}>
              <span>{`${dot.id} · ${dot.classId} · ${dotStatusLabel(dot)}`}</span>
            </li>
          ))}
          {marks.length === 0 ? <li><span>Belum ada tanda peserta.</span></li> : null}
        </ul>
      )}
      <div className='ocf-metrics' aria-label='Ringkasan metrik tugas'>
        <div className='ocf-metric'>
          <span>Presisi</span>
          <strong>{formatScore(result.precision)}</strong>
        </div>
        <div className='ocf-metric'>
          <span>Recall</span>
          <strong>{formatScore(result.recall)}</strong>
        </div>
        <div className='ocf-metric'>
          <span>F1</span>
          <strong>{formatScore(result.f1)}</strong>
        </div>
        <div className='ocf-metric'>
          <span>Benar (TP)</span>
          <strong>{result.tp}</strong>
        </div>
        <div className='ocf-metric'>
          <span>Salah (FP)</span>
          <strong>{result.fp}</strong>
        </div>
        <div className='ocf-metric'>
          <span>Terlewat (FN)</span>
          <strong>{result.fn}</strong>
        </div>
        {duplicateCount > 0 ? (
          <div className='ocf-metric'>
            <span>Duplikat</span>
            <strong>{duplicateCount}</strong>
          </div>
        ) : null}
      </div>
      {result.perClass.length > 0 ? (
        <table className='ocf-table'>
          <caption>Metrik per kelas</caption>
          <thead>
            <tr>
              <th scope='col'>Kelas</th>
              <th scope='col'>TP</th>
              <th scope='col'>FP</th>
              <th scope='col'>FN</th>
              <th scope='col'>Presisi</th>
              <th scope='col'>Recall</th>
              <th scope='col'>F1</th>
            </tr>
          </thead>
          <tbody>
            {result.perClass.map((row) => (
              <tr key={row.classId}>
                <th scope='row'>{row.classId}</th>
                <td>{row.tp}</td>
                <td>{row.fp}</td>
                <td>{row.fn}</td>
                <td>{formatScore(row.precision)}</td>
                <td>{formatScore(row.recall)}</td>
                <td>{formatScore(row.f1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {errorSection('Terlewat (target pakar yang tidak ditandai)', 'missed', result.missed.map((target) => target.id), 'Semua target tertandai.')}
      {errorSection('Salah (tanda tanpa padanan target)', 'false', result.falseIds, 'Tidak ada tanda berlebih.')}
      {errorSection('Duplikat (tanda ganda pada satu target)', 'duplicate', result.duplicateIds, 'Tidak ada tanda ganda.')}
      {showIgnoredNote ? (
        <p className='ocf-note' role='note'>
          {result.ignoredNote && result.ignoredNote !== ''
            ? result.ignoredNote
            : `${ignoredCount > 0 ? `${ignoredCount} temuan ` : 'Sebagian temuan '}ambigu diabaikan dalam penilaian dan tidak memengaruhi skor.`}
        </p>
      ) : null}
      <p className='ocf-grade-line' role='status'>
        {`Penilaian tingkat: ${result.gradeStatus}`}
        {result.gradeExpected || result.gradeGiven
          ? ` (pakar: ${result.gradeExpected ?? '—'} · Anda: ${result.gradeGiven ?? '—'})`
          : ''}
      </p>
      <div className='ocf-rationale'>
        <h4>Alasan pakar</h4>
        <p>{result.rationale}</p>
      </div>
    </div>
  );
}
