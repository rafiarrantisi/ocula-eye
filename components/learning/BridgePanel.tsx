'use client';
import { useCallback, useEffect, useState } from 'react';
import MechanismReturnBar from './MechanismReturnBar.tsx';

interface BridgeMechanism {
  id: string;
  description: string;
}

interface BridgeQuestion {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
  conceptId: string;
}

interface BridgeData {
  available: boolean;
  reason?: string;
  ruleId?: string;
  approvedExplanationKey?: string;
  scenarioId?: string;
  mechanisms?: BridgeMechanism[];
  question?: BridgeQuestion | null;
  followup?: { caseId: string; releaseId: string } | null;
  resume?: { attemptId: string };
}

export interface BridgePanelProps {
  attemptId: string;
  originLabel: string;
  onFollowUp: (caseId: string, originAttemptId: string) => void;
  onClose: () => void;
}

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...((init?.headers as Record<string, string> | undefined) ?? {}) },
    credentials: 'same-origin',
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Error → reviewed-mechanism → new-case bridge. Optional, skippable,
 * resumable; completion requires answering the prediction question. */
export default function BridgePanel({ attemptId, originLabel, onFollowUp, onClose }: BridgePanelProps) {
  const [data, setData] = useState<BridgeData | null>(null);
  const [failed, setFailed] = useState('');
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = (await api(`/api/attempts/${attemptId}/bridge`)) as { status: number; body: BridgeData };
      if (!cancelled) {
        if (res.status === 200) setData(res.body);
        else setFailed('Jembatan tidak tersedia untuk upaya ini.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const answer = useCallback(
    async (optionId: string) => {
      if (!data || data.available !== true || !data.question || busy) return;
      setBusy(true);
      try {
        const res = (await api(`/api/attempts/${attemptId}/bridge`, {
          method: 'POST',
          body: JSON.stringify({
            questionId: data.question.id,
            optionId,
            followupCaseId: data.followup?.caseId ?? null,
          }),
        })) as { status: number; body: { completed?: boolean; correct?: boolean } };
        if (res.status === 200) setVerdict(res.body.correct ?? null);
        else setFailed('Jawaban tidak tersimpan. Coba lagi.');
      } finally {
        setBusy(false);
      }
    },
    [data, attemptId, busy],
  );

  if (collapsed) {
    return <MechanismReturnBar originLabel={originLabel} onReturn={onClose} />;
  }
  return (
    <div className="bridge-panel">
      <MechanismReturnBar originLabel={originLabel} onReturn={onClose} />
      {!data && !failed && (
        <p role="status">Memeriksa apakah ada jembatan yang relevan…</p>
      )}
      {failed && (
        <p role="alert">{failed}</p>
      )}
      {data && !data.available && <p role="status">Tidak ada jembatan untuk kesalahan ini ({data.reason ?? 'tanpa aturan'}).</p>}
      {data && data.available && (
        <>
          <p className="small-note">Sebuah kesalahan cocok dengan penjelasan mekanisme yang telah direview. Ikuti opsional — lewati kapan saja.</p>
          <ul className="bridge-mechanisms">
            {(data.mechanisms ?? []).map((m) => (
              <li key={m.id}>{m.description}</li>
            ))}
          </ul>
          {data.question && verdict === null && (
            <div className="mech-question">
              <p><strong>Prediksi singkat. </strong>{data.question.prompt}</p>
              {data.question.options.map((o, i) => (
                <button key={o.id} disabled={busy} onClick={() => answer(o.id)}>
                  {String.fromCharCode(65 + i)}<span>{o.text}</span>
                </button>
              ))}
            </div>
          )}
          {verdict !== null && (
            <p className="quiz-feedback" role="status">
              <strong>{verdict ? 'Tepat.' : 'Belum tepat.'}</strong>{' '}
              {data.followup ? 'Coba konsep yang sama pada citra berbeda.' : 'Tidak ada kasus lanjutan yang memenuhi syarat.'}
            </p>
          )}
          {verdict !== null && data.followup && (
            <button type="button" className="lab-button" onClick={() => onFollowUp(data.followup!.caseId, attemptId)}>
              Coba kasus lanjutan
            </button>
          )}
          {verdict !== null && (
            <button type="button" className="bridge-skip" onClick={() => setCollapsed(true)}>
              Tutup jembatan
            </button>
          )}
        </>
      )}
    </div>
  );
}
