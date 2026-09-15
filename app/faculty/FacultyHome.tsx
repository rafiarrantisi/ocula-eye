'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Overview {
  institutionId: string;
  cohorts: { id: string; name: string }[];
  assignments: { id: string; cohortId: string; releaseId: string; mode: string }[];
}

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-demo-subject': 'demo-faculty',
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
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

export default function FacultyHome({ demoMode }: { demoMode: boolean }) {
  const [institutionId, setInstitutionId] = useState('demo-institution');
  const [name, setName] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!institutionId) return;
    const res = (await api(`/api/faculty/overview?institutionId=${encodeURIComponent(institutionId)}`)) as {
      status: number;
      body: Overview & { error?: string };
    };
    if (res.status === 200) {
      setData(res.body);
      setError('');
    } else {
      setError('Tidak dapat memuat. Mode demo memerlukan LAB_DEMO_STORE=1 dan seed.');
    }
  }, [institutionId]);

  useEffect(() => {
    // Initial data load on mount/navigation: legitimate effect use (async fetch, not render-derived state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function createCohort(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = (await api('/api/faculty/cohorts', {
        method: 'POST',
        body: JSON.stringify({ institutionId, name: name.trim() }),
      })) as { status: number; body: { id?: string } };
      if (res.status === 201) {
        setName('');
        await refresh();
      } else {
        setError('Gagal membuat kohort.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lab-page">
      <p className="lab-eyebrow">OCULA · FAKULTAS</p>
      <h1>Kohort & penugasan</h1>
      {demoMode && (
        <p className="lab-note lab-demo" role="status">
          Mode demo lokal sebagai fasilitator demo. Tanpa auth asli, tanpa data nyata.
        </p>
      )}
      {!demoMode && (
        <p className="lab-note lab-warn" role="status">
          Area ini membutuhkan auth institusi yang dikelola. Minta administrator mengonfigurasi penyedia auth.
        </p>
      )}
      {error && (
        <p role="alert">{error}</p>
      )}
      <form onSubmit={createCohort} className="lab-form">
        <label>
          ID institusi
          <input value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} />
        </label>
        <label>
          Nama kohort baru
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. PPDS 2026-A" />
        </label>
        <button type="submit" className="lab-button" disabled={busy || !demoMode}>
          Buat kohort
        </button>
      </form>
      {data && (
        <>
          <h2 className="lab-h2">Kohort ({data.cohorts.length})</h2>
          <ol className="lab-list">
            {data.cohorts.map((c) => (
              <li key={c.id}>
                <Link href={`/faculty/cohorts/${c.id}`}>
                  <strong>{c.name}</strong>
                  <span>{c.id.slice(0, 8)}…</span>
                </Link>
              </li>
            ))}
          </ol>
          <h2 className="lab-h2">Penugasan ({data.assignments.length})</h2>
          <ol className="lab-list">
            {data.assignments.map((a) => (
              <li key={a.id}>
                <span>
                  <strong>{a.releaseId}</strong>
                  <span> · {a.mode}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="lab-note"><Link href="/lab">← Lab latihan</Link></p>
    </main>
  );
}
