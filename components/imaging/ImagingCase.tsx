'use client';
import { useMemo, useRef, useState } from 'react';
import FundusViewer, { type FundusMode } from './FundusViewer.tsx';
import AnnotationLayer from './AnnotationLayer.tsx';
import ResponsePanel, {
  type FeatureTask,
  type GradeTask,
  type ResponseValue,
} from './ResponsePanel.tsx';
import ExpertFeedback, {
  type ExpertData,
  type FeedbackDot,
  type FeedbackResult,
} from './ExpertFeedback.tsx';

export interface CaseClass {
  id: string;
  label: string;
  color: string;
  letter: string;
}

export interface CaseMeta {
  mediaId: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  roiPolygon?: number[][];
  title: string;
  instruction: string;
  maxMarks: number;
  permittedClasses: CaseClass[];
  loupeZoom?: number;
}

export interface CaseTasks {
  gradeTask?: GradeTask;
  featureTasks: FeatureTask[];
  showConfidence?: boolean;
}

export interface DraftMark {
  id: string;
  x: number;
  y: number;
  classId: string;
}

export interface CaseFeedback {
  result: FeedbackResult;
  expert: ExpertData | null;
}

export interface ImagingCaseProps {
  caseMeta: CaseMeta;
  tasks: CaseTasks;
  initialMarks: DraftMark[];
  feedback: CaseFeedback | null;
  onDraft: (marks: DraftMark[], value: ResponseValue) => void;
  onSubmit: (marks: DraftMark[], value: ResponseValue) => void;
}

const EMPTY_RESULT: FeedbackResult = {
  tp: 0,
  fp: 0,
  fn: 0,
  duplicates: 0,
  ignored: 0,
  precision: 0,
  recall: 0,
  f1: 0,
  perClass: [],
  gradeStatus: 'Belum dinilai',
  gradeExpected: null,
  gradeGiven: null,
  rationale: '',
  missed: [],
  falseIds: [],
  duplicateIds: [],
  ignoredNote: null,
};

function createId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_err) {
    /* Lanjut ke fallback di bawah. */
  }
  return `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 100000).toString(36)}`;
}

function initialResponse(): ResponseValue {
  return { gradeId: null, notAssessable: false, features: {}, confidence: null };
}

export default function ImagingCase(props: ImagingCaseProps): React.JSX.Element {
  const { caseMeta, tasks, initialMarks, feedback, onDraft, onSubmit } = props;

  const [marks, setMarks] = useState<DraftMark[]>(initialMarks);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [viewerMode, setViewerMode] = useState<FundusMode>('add');
  const [activeClass, setActiveClass] = useState<string>(caseMeta.permittedClasses[0]?.id ?? '');
  const [response, setResponse] = useState<ResponseValue>(initialResponse);
  const [imageReady, setImageReady] = useState<boolean>(false);
  const [showExpert, setShowExpert] = useState<boolean>(false);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const viewerWrapRef = useRef<HTMLDivElement | null>(null);

  const emitDraft = (nextMarks: DraftMark[], nextValue: ResponseValue): void => {
    onDraft(nextMarks, nextValue);
  };

  const handleAddMark = (x: number, y: number): void => {
    if (marks.length >= caseMeta.maxMarks) {
      setLimitNotice(`Batas ${caseMeta.maxMarks} tanda tercapai. Hapus atau urungkan tanda sebelum menambah.`);
      return;
    }
    const next: DraftMark[] = [...marks, { id: createId(), x, y, classId: activeClass }];
    setMarks(next);
    emitDraft(next, response);
  };

  const handleDeleteMark = (id: string): void => {
    const next = marks.filter((mark) => mark.id !== id);
    setMarks(next);
    if (selectedMarkId === id) {
      setSelectedMarkId(null);
    }
    if (next.length < caseMeta.maxMarks) {
      setLimitNotice(null);
    }
    emitDraft(next, response);
  };

  const handleUndo = (): void => {
    if (marks.length === 0) {
      return;
    }
    const removed = marks[marks.length - 1];
    const next = marks.slice(0, -1);
    setMarks(next);
    if (selectedMarkId === removed.id) {
      setSelectedMarkId(null);
    }
    setLimitNotice(null);
    emitDraft(next, response);
  };

  const handleResponseChange = (next: ResponseValue): void => {
    setResponse(next);
    emitDraft(marks, next);
  };

  const submitDisabledReason = useMemo<string | null>(() => {
    if (!imageReady) {
      return 'Gambar belum siap. Tunggu hingga citra memenuhi syarat minimum (lebar ≥ 800 px).';
    }
    if (tasks.gradeTask && !response.notAssessable && response.gradeId === null) {
      return 'Pilih tingkat keparahan atau centang “Tidak dapat dinilai”.';
    }
    for (const task of tasks.featureTasks) {
      if ((response.features[task.id] ?? null) === null) {
        return `Pilih jawaban untuk “${task.label}”.`;
      }
    }
    if (tasks.showConfidence === true && response.confidence === null) {
      return 'Pilih tingkat keyakinan 1–5.';
    }
    return null;
  }, [imageReady, tasks, response]);

  const feedbackDots: FeedbackDot[] = useMemo<FeedbackDot[]>(
    () => marks.map((mark) => ({ id: mark.id, x: mark.x, y: mark.y, classId: mark.classId })),
    [marks],
  );

  const classStyles = useMemo<Record<string, { color: string; letter: string; label: string }>>(() => {
    const styles: Record<string, { color: string; letter: string; label: string }> = {};
    for (const entry of caseMeta.permittedClasses) {
      styles[entry.id] = { color: entry.color, letter: entry.letter, label: entry.label };
    }
    return styles;
  }, [caseMeta.permittedClasses]);

  const handleZoomToError = (kind: 'missed' | 'false' | 'duplicate', id: string): void => {
    if (kind !== 'missed' && marks.some((mark) => mark.id === id)) {
      setSelectedMarkId(id);
    }
    if (kind === 'missed') {
      setShowExpert(true);
    }
    if (viewerWrapRef.current && typeof viewerWrapRef.current.scrollIntoView === 'function') {
      viewerWrapRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const modeButtons: { id: FundusMode; label: string }[] = [
    { id: 'pan', label: 'Geser' },
    { id: 'add', label: 'Tambah' },
    { id: 'select', label: 'Pilih' },
  ];

  return (
    <section className='ocf-case' aria-label={caseMeta.title}>
      <header className='ocf-case-head'>
        <p className='ocf-eyebrow'>ID media: {caseMeta.mediaId}</p>
        <h2>{caseMeta.title}</h2>
        <p>{caseMeta.instruction}</p>
      </header>
      <div className='ocf-toolbar' role='group' aria-label='Mode anotasi'>
        {modeButtons.map((button) => (
          <button
            key={button.id}
            type='button'
            className={viewerMode === button.id ? 'ocf-mode-btn ocf-mode-active' : 'ocf-mode-btn'}
            aria-pressed={viewerMode === button.id}
            onClick={() => setViewerMode(button.id)}
          >
            {button.label}
          </button>
        ))}
        <span className='ocf-toolbar-sep' aria-hidden='true' />
        <div className='ocf-class-row' role='group' aria-label='Kelas tanda aktif'>
          {caseMeta.permittedClasses.map((entry) => (
            <button
              key={entry.id}
              type='button'
              className={activeClass === entry.id ? 'ocf-class-btn ocf-class-active' : 'ocf-class-btn'}
              aria-pressed={activeClass === entry.id}
              onClick={() => {
                setActiveClass(entry.id);
                setViewerMode('add');
              }}
            >
              <span className='ocf-chip' style={{ backgroundColor: entry.color }} aria-hidden='true'>
                {entry.letter}
              </span>
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
        <span className='ocf-counter' role='status'>
          {`${marks.length}/${caseMeta.maxMarks} tanda`}
        </span>
      </div>
      {limitNotice ? (
        <p className='ocf-limit-note' role='status'>
          {limitNotice}
        </p>
      ) : null}
      <div className='ocf-case-grid'>
        <div className='ocf-col'>
          <div ref={viewerWrapRef}>
            <FundusViewer
              imageUrl={caseMeta.imageUrl}
              imageWidth={caseMeta.imageWidth}
              imageHeight={caseMeta.imageHeight}
              mediaId={caseMeta.mediaId}
              roiPolygon={caseMeta.roiPolygon}
              mode={viewerMode}
              activeClass={activeClass}
              marks={marks}
              permittedClasses={caseMeta.permittedClasses}
              maxMarks={caseMeta.maxMarks}
              imageReady={imageReady}
              onReady={setImageReady}
              onAddMark={handleAddMark}
              onSelectMark={setSelectedMarkId}
              onLimit={() => {
                setLimitNotice(
                  `Batas ${caseMeta.maxMarks} tanda tercapai. Hapus atau urungkan tanda sebelum menambah.`,
                );
              }}
              selectedMarkId={selectedMarkId}
              loupeZoom={caseMeta.loupeZoom}
              onUndo={handleUndo}
              onDeleteMark={handleDeleteMark}
            />
          </div>
          <AnnotationLayer
            marks={marks}
            roi={caseMeta.roiPolygon}
            selectedId={selectedMarkId}
            imageSize={{ width: caseMeta.imageWidth, height: caseMeta.imageHeight }}
            onSelect={setSelectedMarkId}
            onDelete={handleDeleteMark}
            classStyles={classStyles}
          />
        </div>
        <div className='ocf-col'>
          <ResponsePanel
            gradeTask={tasks.gradeTask}
            featureTasks={tasks.featureTasks}
            value={response}
            onChange={handleResponseChange}
            onSubmit={() => onSubmit(marks, response)}
            submitDisabledReason={submitDisabledReason}
            confidence={tasks.showConfidence}
          />
          <ExpertFeedback
            visible={feedback !== null}
            marks={feedbackDots}
            result={feedback ? feedback.result : EMPTY_RESULT}
            expert={feedback ? feedback.expert : null}
            showExpert={showExpert}
            onToggleExpert={() => setShowExpert((prev) => !prev)}
            onZoomToError={handleZoomToError}
          />
        </div>
      </div>
    </section>
  );
}
