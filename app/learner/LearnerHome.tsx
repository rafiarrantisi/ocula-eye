'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface LearnerAssignment {
  id: string;
  cohortId: string;
  releaseId: string;
  pathway: string | null;
  mode: string;
  openAt: string;
  dueAt: string | null;
  revealPolicy: string;
  releaseVersion: string | null;
}

const DEMO_LEARNERS = ['demo-learner-1', 'demo-learner-2', 'demo-learner-3'];

export default function LearnerHome({ demoMode }: { demoMode: boolean }) {
  const [subject, setSubject] = useState('demo-learner-1');
  const [data, setData] = useState<{ displayName?: string; cohorts?: { id: string; name: string }[]; assignments?: LearnerAssignment[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetch('/api/preview-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      }).catch(() => null);
      const res = await fetch('/api/learner/assignments', {
        headers: { 'x-demo-subject': subject },
        credentials: 'same-origin',
      }).catch(() => null);
      if (cancelled) return;
      if (!res || !res.ok) {
        setError('Penugasan tidak tersedia (butuh mode demo + seed, atau auth institusi).');
        setData(null);
        return;
      }
      setError('');
      setData((await res.json()) as Exclude<typeof data, null>);
    })();
    return () => {
      cancelled = true;
    };
  }, [subject]);

  async function signOut() {
    await fetch('/api/preview-session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    setData(null);
    setError('Sesi diakhiri di browser ini.');
  }

  return (
    <main className="lab-page">
      <p className="lab-eyebrow">OCULA · PESERTA</p>
      <h1>Penugasanku</h1>
      {demoMode && (
        <p className="lab-note lab-demo" role="status">
          Mode demo lokal. Pilih identitas demo (bukan akun asli) — masuk institusi memakai auth yang dikelola.
        </p>
      )}
      {!demoMode && (
        <p className="lab-note lab-warn" role="status">
          Masuk peserta membutuhkan auth institusi yang dikelola.
        </p>
      )}
      <div className="preset-row" role="group" aria-label="Identitas demo">
        {DEMO_LEARNERS.map((s) => (
          <button key={s} type="button" className={subject === s ? 'active' : ''} onClick={() => setSubject(s)}>
            {s}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p className="lab-note">Halo, {data.displayName ?? subject}. Kohort: {(data.cohorts ?? []).map((c) => c.name).join(', ') || '—'}</p>
          <ol className="lab-list">
            {(data.assignments ?? []).map((a) => (
              <li key={a.id}>
                <Link href="/lab">
                  <strong>{a.releaseId}</strong>
                  <span>{a.mode} · {a.revealPolicy}</span>
                </Link>
              </li>
            ))}
          </ol>
          {(data.assignments ?? []).length === 0 && <p className="lab-note">Belum ada penugasan terbuka.</p>}
        </>
      )}
      <p className="lab-note">
        <button type="button" className="lab-button" onClick={signOut}>Keluar</button>{' '}
        <Link href="/lab">Latihan bebas</Link>
      </p>
    </main>
  );
}
