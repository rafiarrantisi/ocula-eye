'use client';
import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import BridgePanel from '../../../components/learning/BridgePanel.tsx';
import MechanismReturnBar from '../../../components/learning/MechanismReturnBar.tsx';
import ImagingCase, {
  type CaseFeedback,
  type CaseMeta,
  type CaseTasks,
  type DraftMark,
} from '../../../components/imaging/ImagingCase.tsx';
import type { ResponseValue } from '../../../components/imaging/ResponsePanel.tsx';

interface RunnerTask {
  taskId: string;
  kind: string;
  prompt: string;
  options?: { id: string; text: string }[];
  permittedClasses?: string[];
  roi?: { polygon: number[][] };
  maxMarks?: number;
  allowNotAssessable?: boolean;
}

interface RunnerCase {
  caseId: string;
  title: string;
  tasks: RunnerTask[];
  media: { asset: string; width: number; height: number }[];
}

const CLASS_META: Record<string, { label: string; color: string; letter: string }> = {
  microaneurysm: { label: 'Mikroaneurisma', color: '#ff6b60', letter: 'M' },
  hemorrhage: { label: 'Perdarahan', color: '#d0342c', letter: 'H' },
  hard_exudate: { label: 'Eksudat keras', color: '#ffd60a', letter: 'E' },
  cotton_wool_spot: { label: 'Cotton-wool spot', color: '#f5f0e6', letter: 'C' },
};

const GRADE_LABEL: Record<string, string> = {
  'grade-0': 'Derajat 0',
  'grade-1': 'Derajat 1',
  'grade-2': 'Derajat 2',
  'grade-3': 'Derajat 3',
  'grade-4': 'Derajat 4',
};

interface RunnerProps {
  releaseId: string;
  releaseVersion: string;
  caseEntry: RunnerCase;
  demoMode: boolean;
}

async function api(path: string, init?: RequestInit, key?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) };
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

export default function LabRunner(props: RunnerProps) {
  return (
    <Suspense>
      <LabRunnerInner {...props} />
    </Suspense>
  );
}

function LabRunnerInner({ releaseId, releaseVersion, caseEntry, demoMode }: RunnerProps) {
  const [phase, setPhase] = useState<'boot' | 'ready' | 'failed'>('boot');
  const [fatal, setFatal] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState<CaseFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromAttempt = searchParams.get('from');
  const [idemKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const locTask = caseEntry.tasks.find((t) => t.kind === 'localization');
  const roiPolygon = locTask?.roi?.polygon;
  const media = caseEntry.media[0];

  const caseMeta: CaseMeta = {
    mediaId: media.asset,
    imageUrl: `/lab-demo/${media.asset}`,
    imageWidth: media.width,
    imageHeight: media.height,
    roiPolygon: locTask?.roi?.polygon,
    title: caseEntry.title,
    instruction: 'Kasus sintetis: tandai temuan, jawab pertanyaan, lalu kirim.',
    maxMarks: locTask?.maxMarks ?? 0,
    permittedClasses: locTask
      ? (locTask.permittedClasses ?? ['microaneurysm']).map((id) => ({
          id,
          label: CLASS_META[id]?.label ?? id,
          color: CLASS_META[id]?.color ?? '#fff',
          letter: CLASS_META[id]?.letter ?? '?',
        }))
      : [],
  };
  const tasks: CaseTasks = {
    gradeTask: caseEntry.tasks.find((t) => t.kind === 'grade')
      ? {
          label: 'Tingkat',
          options: (caseEntry.tasks.find((t) => t.kind === 'grade')!.options ?? []).map((o) => ({ id: o.id, label: GRADE_LABEL[o.id] ?? o.text })),
          allowNotAssessable: caseEntry.tasks.find((t) => t.kind === 'grade')!.allowNotAssessable,
        }
      : undefined,
    featureTasks: caseEntry.tasks
      .filter((t) => t.kind === 'feature')
      .map((t) => ({ id: t.taskId, label: t.prompt, options: (t.options ?? []).map((o) => ({ id: o.id, label: o.text })) })),
    showConfidence: true,
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sess = await api('/api/preview-session', { method: 'POST', body: JSON.stringify({}) });
      if (sess.status !== 201) {
        if (!cancelled) {
          setFatal('Sesi tidak tersedia (server butuh penyimpanan demo atau database).');
          setPhase('failed');
        }
        return;
      }
      const created = (await api('/api/attempts', {
        method: 'POST',
        body: JSON.stringify({ releaseId, caseId: caseEntry.caseId, mode: 'practice', idempotencyKey: idemKey }),
      }, idemKey)) as { status: number; body: { attemptId?: string; revision?: number } };
      if (created.status !== 201 || !created.body.attemptId) {
        if (!cancelled) {
          setFatal('Gagal membuka attempt.');
          setPhase('failed');
        }
        return;
      }
      if (!cancelled) {
        setAttemptId(created.body.attemptId);
        setRevision(created.body.revision ?? 0);
        setPhase('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseId, caseEntry.caseId, idemKey]);

  const sendDraft = useCallback(
    async (marks: DraftMark[], value: ResponseValue) => {
      if (!attemptId || feedback) return;
      const res = await api(`/api/attempts/${attemptId}/draft`, {
        method: 'PUT',
        body: JSON.stringify({ payload: { marks, response: value }, expectedRevision: revision }),
      });
      if (res.status === 200) {
        const b = res.body as { revision?: number };
        if (typeof b.revision === 'number') setRevision(b.revision);
      }
    },
    [attemptId, revision, feedback],
  );

  const sendSubmit = useCallback(
    async (marks: DraftMark[], value: ResponseValue) => {
      if (!attemptId || busy) return;
      setBusy(true);
      try {
        const answers: Record<string, string> = {};
        if (value.gradeId) answers[`${caseEntry.caseId}-grade`] = value.gradeId;
        if (value.notAssessable) answers[`${caseEntry.caseId}-grade`] = 'not_assessable';
        for (const [taskId, optionId] of Object.entries(value.features)) {
          if (optionId) answers[taskId] = optionId;
        }
        const gradeEntry = caseEntry.tasks.find((t) => t.kind === 'grade');
        const gradeTaskId = tasks.gradeTask && gradeEntry ? gradeEntry.taskId : null;
        const payload: Record<string, unknown> = {
          version: 1,
          answers,
          marks: marks.map((m) => ({ id: m.id, classId: m.classId, x: m.x, y: m.y })),
          releaseVersion,
        };
        const sub = await api(`/api/attempts/${attemptId}/submit`, { method: 'POST', body: JSON.stringify(payload) }, idemKey);
        if (sub.status !== 200) {
          setFatal('Submit ditolak server. Coba lagi.');
          return;
        }
        const fb = (await api(`/api/attempts/${attemptId}/feedback`)) as {
          status: number;
          body: {
            score?: {
            localization?: {
              tp: number; fp: number; fn: number;
              precision: number | null; recall: number | null; f1: number | null;
              matchPairs: [string, string][]; unscoredMarkIds: string[]; ignoredMarkIds: string[];
              duplicateMarkIds: string[];
              perClass: Record<string, { tp: number; fp: number; fn: number; precision: number | null; recall: number | null; f1: number | null }>;
            };
              perTask?: { taskId: string; correct: boolean }[];
            };
            expert?: {
              targets: { id: string; classId: string; polygon: number[][]; cx: number; cy: number }[];
              ignored: { polygon: number[][]; reason: string }[];
              rationale: string | null;
              gradeExpected: Record<string, string | null>;
            } | null;
          };
        };
        if (fb.status !== 200 || !fb.body.score) {
          setFatal('Umpan balik belum tersedia.');
          return;
        }
        const s = fb.body.score;
        const loc = s.localization;
        const dots = marks.map((m) => {
          const paired = loc?.matchPairs.find(([markId]) => markId === m.id);
          const dup = (loc?.duplicateMarkIds ?? []).includes(m.id);
          const status = paired && !dup ? 'tp' : dup ? 'duplikat' : loc?.ignoredMarkIds.includes(m.id) ? 'diabaikan' : loc?.unscoredMarkIds.includes(m.id) ? 'diabaikan' : 'fp';
          return { ...m, status: status as 'tp' | 'fp' | 'duplikat' | 'diabaikan', matchedTargetId: paired ? paired[1] : null };
        });
        const missedIds = new Set((loc?.matchPairs ?? []).map(([, targetId]) => targetId));
        const missed = (fb.body.expert?.targets ?? [])
          .filter((t) => !missedIds.has(t.id))
          .map((t) => ({ id: t.id, x: t.cx, y: t.cy, classId: t.classId }));
        const falseIds = dots.filter((d) => d.status === 'fp').map((d) => d.id);
        const duplicateIds = loc?.duplicateMarkIds ?? [];
        const perTask = s.perTask ?? [];
        const gradeOk = perTask.every((t) => t.correct);
        setFeedback({
          result: {
            tp: loc?.tp ?? 0,
            fp: loc?.fp ?? 0,
            fn: loc?.fn ?? 0,
            duplicates: duplicateIds.length,
            ignored: (loc?.ignoredMarkIds ?? []).length,
            precision: loc?.precision ?? null,
            recall: loc?.recall ?? null,
            f1: loc?.f1 ?? null,
            perClass: Object.entries(loc?.perClass ?? {}).map(([classId, v]) => ({ classId, ...v })),
            gradeStatus: perTask.length === 0 ? 'Tanpa tugas opsi' : gradeOk ? 'Sesuai' : 'Perlu tinjau',
            gradeExpected: gradeTaskId ? (fb.body.expert?.gradeExpected?.[gradeTaskId] ?? null) : null,
            gradeGiven: gradeTaskId ? (answers[gradeTaskId] ?? null) : null,
            rationale: fb.body.expert?.rationale ?? 'Kasus sintetis.',
            missed,
            falseIds,
            duplicateIds,
            ignoredNote: (loc?.ignoredMarkIds.length ?? 0) > 0 ? 'Tanda di wilayah ambigu tidak dinilai.' : null,
          },
          expert: fb.body.expert
            ? {
                targets: fb.body.expert.targets.map((t) => ({ id: t.id, x: t.cx, y: t.cy, classId: t.classId })),
                regions: [
                  ...(roiPolygon
                    ? [{ id: 'task-roi', label: 'Wilayah tugas', polygon: roiPolygon }]
                    : []),
                  ...fb.body.expert.ignored.map((r, i) => ({ id: `ignored-${i}`, label: r.reason, polygon: r.polygon })),
                ],
              }
            : null,
        });
      } finally {
        setBusy(false);
      }
    },
    [attemptId, busy, caseEntry.caseId, caseEntry.tasks, releaseVersion, tasks.gradeTask, roiPolygon, idemKey],
  );

  if (phase === 'boot') {
    return (
      <main className="lab-page">
        <p role="status">Menyiapkan sesi latihan…</p>
      </main>
    );
  }
  if (phase === 'failed') {
    return (
      <main className="lab-page">
        <p role="alert">{fatal}</p>
        <p className="lab-note"><Link href="/lab">← Daftar kasus</Link></p>
      </main>
    );
  }
  return (
    <main className="lab-case">
      {demoMode && (
        <p className="lab-note lab-demo" role="status">
          Mode demo lokal: data sintetis, tersimpan di file lokal. Bukan data klinis.
        </p>
      )}
      <p className="lab-note"><Link href="/lab">← Daftar kasus</Link></p>
      {fromAttempt && (
        <MechanismReturnBar
          originLabel={`upaya ${fromAttempt.slice(0, 8)}…`}
          onReturn={() => router.back()}
        />
      )}
      <ImagingCase
        caseMeta={caseMeta}
        tasks={tasks}
        initialMarks={[]}
        feedback={feedback}
        onDraft={sendDraft}
        onSubmit={sendSubmit}
      />
      {feedback && !bridgeOpen && (
        <button type="button" className="lab-button" onClick={() => setBridgeOpen(true)}>
          Pelajari mekanisme kesalahan ini
        </button>
      )}
      {feedback && bridgeOpen && attemptId && (
        <BridgePanel
          attemptId={attemptId}
          originLabel={caseEntry.title}
          onFollowUp={(nextCaseId, originAttemptId) => {
            try {
              window.sessionStorage.setItem('ocula-bridge-origin', JSON.stringify({ attemptId: originAttemptId, caseId: caseEntry.caseId }));
            } catch {
              /* penyimpanan sesi tidak tersedia */
            }
            router.push(`/lab/${nextCaseId}?from=${originAttemptId}`);
          }}
          onClose={() => setBridgeOpen(false)}
        />
      )}
    </main>
  );
}
