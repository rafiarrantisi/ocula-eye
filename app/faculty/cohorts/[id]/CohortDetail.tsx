'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Preview {
  token: string;
  total: number;
  entries: { email: string; displayName: string; pathway: string; alreadyMember: boolean }[];
  invalid: { line: number; reason: string }[] | string[];
  duplicates: string[];
  newCount: number;
  existingCount: number;
}

interface Report {
  counts?: Record<string, number>;
  [key: string]: unknown;
}

interface Reveal {
  assignmentId: string;
  revealPolicy: string;
  dueAt: string | null;
  revealedAt: string | null;
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

const CSV_TEMPLATE = 'email,display_name,learner_pathway\npeserta.satu@demo.local,Peserta Satu,resident_foundation';

export default function CohortDetail({ cohortId }: { cohortId: string }) {
  const [csv, setCsv] = useState(CSV_TEMPLATE);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [releaseId, setReleaseId] = useState('demo-synthetic-0.1.0');
  const [assignMsg, setAssignMsg] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [reportId, setReportId] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [revealMsg, setRevealMsg] = useState('');
  const [error, setError] = useState('');

  const runPreview = useCallback(async () => {
    setError('');
    const res = await api(`/api/faculty/cohorts/${cohortId}/import`, { method: 'POST', body: JSON.stringify({ csvText: csv }) });
    if (res.status === 200) setPreview(res.body as Preview);
    else setError('Pratinjau gagal.');
  }, [cohortId, csv]);

  async function confirm() {
    if (!preview) return;
    const res = await api(`/api/faculty/cohorts/${cohortId}/import-confirm`, {
      method: 'POST',
      body: JSON.stringify({ token: preview.token, csvText: csv }),
    });
    if (res.status === 200) {
      const b = res.body as { added?: number; existing?: number };
      setConfirmMsg(`Ditambahkan ${b.added ?? 0}, sudah ada ${b.existing ?? 0}.`);
    } else setError('Konfirmasi gagal.');
  }

  async function createAssignment(e: React.FormEvent) {
    e.preventDefault();
    setAssignMsg('');
    const res = await api('/api/faculty/assignments', {
      method: 'POST',
      body: JSON.stringify({
        cohortId,
        releaseId,
        pathway: 'resident_foundation',
        mode: 'practice',
        openAt: new Date().toISOString(),
        revealPolicy: 'immediate',
      }),
    });
    if (res.status === 201) setAssignMsg(`Penugasan dibuat: ${(res.body as { id?: string }).id ?? ''}`);
    else setAssignMsg('Gagal membuat penugasan.');
  }

  const loadReport = useCallback(async (assignmentId: string) => {
    setReportId(assignmentId);
    const res = await api(`/api/faculty/assignments/${assignmentId}/report`);
    if (res.status === 200) setReport(res.body as Report);
    else setError('Laporan gagal dimuat.');
    const rev = await api(`/api/faculty/assignments/${assignmentId}/reveal`);
    if (rev.status === 200) setReveal(rev.body as Reveal);
    else setReveal(null);
  }, []);

  async function revealAnswers() {
    if (!reportId) return;
    setRevealMsg('');
    const res = await api(`/api/faculty/assignments/${reportId}/reveal`, { method: 'POST' });
    if (res.status === 200) {
      setRevealMsg('Jawaban dibuka untuk penugasan ini.');
      loadReport(reportId);
    } else setRevealMsg('Gagal membuka jawaban.');
  }

  useEffect(() => {
    const last = window.localStorage.getItem('ocula-last-assignment');
    // Restore last-viewed report on mount (async fetch, not render-derived state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last) loadReport(last);
  }, [loadReport]);

  return (
    <main className="lab-page">
      <p className="lab-note"><Link href="/faculty">← Fakultas</Link></p>
      <p className="lab-eyebrow">KOHORT</p>
      <h1>{cohortId}</h1>
      {error && <p role="alert">{error}</p>}
      <h2 className="lab-h2">Impor peserta (CSV)</h2>
      <p className="small-note">Header wajib: email,display_name,learner_pathway. Maks 200 baris. Tanpa NIK/data pasien.</p>
      <textarea className="lab-textarea" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="CSV peserta" />
      <button type="button" className="lab-button" onClick={runPreview}>Pratinjau (tanpa efek)</button>
      {preview && (
        <div className="lab-report">
          <p>Baru: {preview.newCount} · Sudah ada: {preview.existingCount} · Tak-valid: {preview.invalid.length} · Duplikat: {preview.duplicates.length}</p>
          <button type="button" className="lab-button" onClick={confirm}>Konfirmasi impor</button>
          {confirmMsg && <p role="status">{confirmMsg}</p>}
        </div>
      )}
      <h2 className="lab-h2">Penugasan baru</h2>
      <form onSubmit={createAssignment} className="lab-form">
        <label>
          Release ID
          <input value={releaseId} onChange={(e) => setReleaseId(e.target.value)} />
        </label>
        <button type="submit" className="lab-button">Buat penugasan praktik</button>
        {assignMsg && <p role="status">{assignMsg}</p>}
      </form>
      <h2 className="lab-h2">Laporan</h2>
      <p className="small-note">Tempel ID penugasan untuk melihat ringkasan, atau buka dari riwayat terakhir.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const id = new FormData(e.currentTarget).get('assignmentId');
          if (typeof id === 'string' && id) {
            window.localStorage.setItem('ocula-last-assignment', id);
            loadReport(id);
          }
        }}
        className="lab-form"
      >
        <label>
          ID penugasan
          <input name="assignmentId" placeholder="assignment id" />
        </label>
        <button type="submit" className="lab-button">Muat laporan</button>
      </form>
      {report && (
        <pre className="lab-report">{JSON.stringify(report.counts ?? report, null, 2)}</pre>
      )}
      {reveal && (
        <div className="lab-report">
          <p>Kebijakan buka: {reveal.revealPolicy} · Status: {reveal.revealedAt ? `dibuka ${reveal.revealedAt}` : 'belum dibuka'}</p>
          {!reveal.revealedAt && (reveal.revealPolicy === 'manual' || reveal.revealPolicy === 'scheduled') && (
            <button type="button" className="lab-button" onClick={revealAnswers}>Buka jawaban sekarang</button>
          )}
          {revealMsg && <p role="status">{revealMsg}</p>}
        </div>
      )}
    </main>
  );
}
