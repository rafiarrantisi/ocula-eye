'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type FundusMode = 'pan' | 'add' | 'select';

export interface FundusMark {
  id: string;
  x: number;
  y: number;
  classId: string;
}

export interface FundusClass {
  id: string;
  label: string;
  color: string;
  letter: string;
}

export interface FundusViewerProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  mediaId: string;
  roiPolygon?: number[][];
  mode: FundusMode;
  activeClass: string;
  marks: FundusMark[];
  permittedClasses: FundusClass[];
  maxMarks: number;
  imageReady: boolean;
  onReady: (ready: boolean) => void;
  onAddMark: (x: number, y: number) => void;
  onSelectMark: (id: string | null) => void;
  onLimit: () => void;
  selectedMarkId: string | null;
  loupeZoom?: number;
  onUndo?: () => void;
  onDeleteMark?: (id: string) => void;
}

interface Point2D {
  x: number;
  y: number;
}

interface ScreenDot extends Point2D {
  id: string;
  cx: number;
  cy: number;
  classId: string;
}

interface ViewerLike {
  viewport: {
    imageToViewportCoordinates: (point: Point2D) => Point2D;
    viewportToImageCoordinates: (point: Point2D) => Point2D;
    viewerElementToViewportCoordinates: (point: Point2D) => Point2D;
    viewportToViewerElementCoordinates: (point: Point2D) => Point2D;
  };
  addHandler: (event: string, handler: () => void) => void;
  removeHandler: (event: string, handler: () => void) => void;
  destroy: () => void;
}

const CLICK_DRAG_THRESHOLD_PX = 10;
const CLICK_MAX_DURATION_MS = 600;
const SELECT_HIT_RADIUS_PX = 16;
const LOUPE_RADIUS_PX = 60;
const MIN_READY_WIDTH = 800;

function classStyleFor(classId: string, permitted: FundusClass[]): FundusClass {
  const found = permitted.find((entry) => entry.id === classId);
  if (found) {
    return found;
  }
  return {
    id: classId,
    label: classId,
    color: '#8a99a5',
    letter: classId.trim().charAt(0).toUpperCase() || '?',
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export default function FundusViewer(props: FundusViewerProps): React.JSX.Element {
  const {
    imageUrl,
    imageWidth,
    imageHeight,
    mediaId,
    roiPolygon,
    mode,
    activeClass,
    marks,
    permittedClasses,
    maxMarks,
    imageReady,
    onReady,
    onAddMark,
    onSelectMark,
    onLimit,
    selectedMarkId,
    loupeZoom,
    onUndo,
    onDeleteMark,
  } = props;

  const zoom = loupeZoom && loupeZoom > 0 ? loupeZoom : 2.5;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osdRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<ViewerLike | null>(null);
  const pressRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const marksRef = useRef<FundusMark[]>(marks);
  marksRef.current = marks;
  const roiRef = useRef<number[][] | undefined>(roiPolygon);
  roiRef.current = roiPolygon;
  const modeRef = useRef<FundusMode>(mode);
  modeRef.current = mode;
  const maxMarksRef = useRef<number>(maxMarks);
  maxMarksRef.current = maxMarks;
  const selectedRef = useRef<string | null>(selectedMarkId);
  selectedRef.current = selectedMarkId;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onAddMarkRef = useRef(onAddMark);
  onAddMarkRef.current = onAddMark;
  const onSelectMarkRef = useRef(onSelectMark);
  onSelectMarkRef.current = onSelectMark;
  const onLimitRef = useRef(onLimit);
  onLimitRef.current = onLimit;
  const onDeleteMarkRef = useRef(onDeleteMark);
  onDeleteMarkRef.current = onDeleteMark;

  const [dots, setDots] = useState<ScreenDot[]>([]);
  const [roiPx, setRoiPx] = useState<Point2D[]>([]);
  const [viewSize, setViewSize] = useState<Point2D>({ x: 0, y: 0 });
  const [loupe, setLoupe] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });

  const syncOverlay = useCallback(() => {
    const viewer = viewerRef.current;
    const container = containerRef.current;
    if (!viewer || !container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      return;
    }
    setViewSize({ x: rect.width, y: rect.height });
    setDots(
      marksRef.current.map((mark) => {
        const viewportPoint = viewer.viewport.imageToViewportCoordinates({ x: mark.x, y: mark.y });
        const pixel = viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
        return { id: mark.id, x: mark.x, y: mark.y, cx: pixel.x, cy: pixel.y, classId: mark.classId };
      }),
    );
    const roi = roiRef.current;
    if (Array.isArray(roi) && roi.length >= 3) {
      setRoiPx(
        roi.map((vertex) => {
          const viewportPoint = viewer.viewport.imageToViewportCoordinates({ x: vertex[0], y: vertex[1] });
          return viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
        }),
      );
    } else {
      setRoiPx([]);
    }
  }, []);

  const syncRef = useRef(syncOverlay);
  syncRef.current = syncOverlay;

  useEffect(() => {
    let disposed = false;
    let viewer: ViewerLike | null = null;
    let observer: ResizeObserver | null = null;
    const handleSync = (): void => {
      syncRef.current();
    };
    async function create(): Promise<void> {
      const mount = osdRef.current;
      if (!mount) {
        return;
      }
      const loaded: unknown = await import('openseadragon');
      if (disposed) {
        return;
      }
      const interop = loaded as { default?: unknown };
      const candidate: unknown = interop.default ?? loaded;
      const factory = candidate as (options: Record<string, unknown>) => ViewerLike;
      viewer = factory({
        element: mount,
        tileSources: { type: 'image', url: imageUrl },
        showNavigationControl: false,
        clickToZoom: false,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
        visibilityRatio: 0.6,
        constrainDuringPan: true,
        minZoomLevel: 0.4,
      });
      viewerRef.current = viewer;
      viewer.addHandler('open', handleSync);
      viewer.addHandler('viewport-change', handleSync);
      viewer.addHandler('resize', handleSync);
      handleSync();
      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        observer = new ResizeObserver(handleSync);
        observer.observe(containerRef.current);
      }
    }
    void create().catch(() => {
      /* Penampil memakai fallback status siap; galat jaringan ditangani panel induk. */
    });
    return () => {
      disposed = true;
      if (observer) {
        observer.disconnect();
      }
      if (viewer) {
        try {
          viewer.removeHandler('open', handleSync);
          viewer.removeHandler('viewport-change', handleSync);
          viewer.removeHandler('resize', handleSync);
        } catch {
          /* Abaikan: viewer sedang dihancurkan. */
        }
        try {
          viewer.destroy();
        } catch {
          /* Abaikan: elemen mount mungkin sudah dilepas. */
        }
      }
      viewerRef.current = null;
    };
  }, [imageUrl]);

  useEffect(() => {
    syncOverlay();
  }, [marks, roiPolygon, imageWidth, imageHeight, syncOverlay]);

  useEffect(() => {
    let cancelled = false;
    const probe = new Image();
    probe.onload = (): void => {
      if (cancelled) {
        return;
      }
      const ready = imageReady || imageWidth >= MIN_READY_WIDTH || probe.naturalWidth >= MIN_READY_WIDTH;
      onReadyRef.current(ready);
    };
    probe.onerror = (): void => {
      if (cancelled) {
        return;
      }
      onReadyRef.current(imageReady || imageWidth >= MIN_READY_WIDTH);
    };
    probe.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl, imageWidth, imageReady]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === 'Escape') {
        onSelectMarkRef.current(null);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = selectedRef.current;
        const deleter = onDeleteMarkRef.current;
        if (selected && deleter) {
          event.preventDefault();
          deleter(selected);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const toImageCoords = (clientX: number, clientY: number): Point2D | null => {
    const viewer = viewerRef.current;
    const container = containerRef.current;
    if (!viewer || !container) {
      return null;
    }
    const rect = container.getBoundingClientRect();
    const elementPoint = { x: clientX - rect.left, y: clientY - rect.top };
    const viewportPoint = viewer.viewport.viewerElementToViewportCoordinates(elementPoint);
    return viewer.viewport.viewportToImageCoordinates(viewportPoint);
  };

  const tryAddAt = (clientX: number, clientY: number): void => {
    if (marksRef.current.length >= maxMarksRef.current) {
      onLimitRef.current();
      return;
    }
    const imagePoint = toImageCoords(clientX, clientY);
    if (!imagePoint) {
      return;
    }
    if (imagePoint.x < 0 || imagePoint.y < 0 || imagePoint.x > imageWidth || imagePoint.y > imageHeight) {
      return;
    }
    onAddMarkRef.current(Math.round(imagePoint.x), Math.round(imagePoint.y));
  };

  const handleTap = (clientX: number, clientY: number): void => {
    const currentMode = modeRef.current;
    if (currentMode === 'add') {
      tryAddAt(clientX, clientY);
      return;
    }
    if (currentMode === 'select') {
      const container = containerRef.current;
      const viewer = viewerRef.current;
      if (!container || !viewer) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      let bestId: string | null = null;
      let bestDist = SELECT_HIT_RADIUS_PX;
      for (const dot of marksRef.current) {
        const viewportPoint = viewer.viewport.imageToViewportCoordinates({ x: dot.x, y: dot.y });
        const pixel = viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);
        const dist = Math.hypot(pixel.x - px, pixel.y - py);
        if (dist <= bestDist) {
          bestDist = dist;
          bestId = dot.id;
        }
      }
      onSelectMarkRef.current(bestId);
    }
  };

  const handleCenterTap = (): void => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    tryAddAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const activeStyle = classStyleFor(activeClass, permittedClasses);
  const atLimit = marks.length >= maxMarks;
  const hintText =
    mode === 'add'
      ? `Mode tambah · ketuk gambar untuk menandai ${activeStyle.label}. Seret untuk menggeser.`
      : mode === 'select'
        ? 'Mode pilih · ketuk tanda untuk memilih. Delete menghapus, Escape membatalkan.'
        : 'Mode geser · seret untuk menggeser, gulir atau cubit untuk memperbesar.';

  return (
    <div className='ocf-viewer'>
      <div
        ref={containerRef}
        className='ocf-viewer-stage'
        onPointerDown={(event: React.PointerEvent<HTMLDivElement>) => {
          pressRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
        }}
        onPointerUp={(event: React.PointerEvent<HTMLDivElement>) => {
          const press = pressRef.current;
          pressRef.current = null;
          if (!press) {
            return;
          }
          const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
          const elapsed = Date.now() - press.time;
          if (moved <= CLICK_DRAG_THRESHOLD_PX && elapsed <= CLICK_MAX_DURATION_MS) {
            handleTap(event.clientX, event.clientY);
          }
        }}
        onPointerMove={(event: React.PointerEvent<HTMLDivElement>) => {
          const container = containerRef.current;
          if (!container) {
            return;
          }
          const rect = container.getBoundingClientRect();
          setLoupe({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            visible: true,
          });
        }}
        onPointerLeave={() => {
          setLoupe((prev) => ({ ...prev, visible: false }));
        }}
      >
        <div ref={osdRef} className='ocf-osd' aria-label='Penampil citra fundus' />
        <svg
          className='ocf-overlay'
          width={viewSize.x}
          height={viewSize.y}
          aria-hidden={mode === 'pan' ? 'true' : 'false'}
        >
          {roiPx.length >= 3 ? (
            <polygon points={roiPx.map((p) => `${p.x},${p.y}`).join(' ')} className='ocf-roi' />
          ) : null}
          {dots.map((dot) => {
            const style = classStyleFor(dot.classId, permittedClasses);
            const selected = dot.id === selectedMarkId;
            return (
              <g
                key={dot.id}
                className={selected ? 'ocf-dot ocf-dot-selected' : 'ocf-dot'}
                transform={`translate(${dot.cx} ${dot.cy})`}
                onPointerDown={(event: React.PointerEvent<SVGGElement>) => {
                  event.stopPropagation();
                }}
                onPointerUp={(event: React.PointerEvent<SVGGElement>) => {
                  event.stopPropagation();
                }}
                onClick={(event: React.MouseEvent<SVGGElement>) => {
                  event.stopPropagation();
                  onSelectMark(dot.id);
                }}
              >
                <circle r={13} fill={style.color} className='ocf-dot-circle' />
                <text dy='0.35em' textAnchor='middle' className='ocf-dot-letter'>
                  {style.letter}
                </text>
              </g>
            );
          })}
        </svg>
        {mode === 'add' ? (
          <div className='ocf-crosshair' aria-hidden='true'>
            <span className='ocf-crosshair-h' />
            <span className='ocf-crosshair-v' />
          </div>
        ) : null}
        {loupe.visible && mode !== 'pan' && viewSize.x > 0 ? (
          <div
            className='ocf-loupe'
            aria-hidden='true'
            style={{
              left: loupe.x,
              top: loupe.y,
              backgroundImage: `url('${imageUrl}')`,
              backgroundSize: `${Math.round(viewSize.x * zoom)}px ${Math.round(viewSize.y * zoom)}px`,
              backgroundPosition: `-${Math.round((loupe.x / viewSize.x) * viewSize.x * zoom - LOUPE_RADIUS_PX)}px -${Math.round((loupe.y / viewSize.y) * viewSize.y * zoom - LOUPE_RADIUS_PX)}px`,
            }}
          />
        ) : null}
        <span className='ocf-badge'>ID media: {mediaId}</span>
      </div>
      <div className='ocf-actions'>
        {mode === 'add' ? (
          <button type='button' className='ocf-action-btn' onClick={handleCenterTap} disabled={atLimit}>
            Tandai titik tengah
          </button>
        ) : null}
        {onUndo && marks.length > 0 ? (
          <button type='button' className='ocf-action-btn' onClick={onUndo}>
            Urungkan
          </button>
        ) : null}
      </div>
      <p className='ocf-hint'>{hintText}</p>
      {atLimit ? <p className='ocf-limit-note' role='status'>Batas {maxMarks} tanda tercapai.</p> : null}
      {!imageReady ? (
        <p className='ocf-ready-note' role='status'>
          Gambar belum memenuhi syarat minimum (lebar ≥ 800 px).
        </p>
      ) : null}
    </div>
  );
}
