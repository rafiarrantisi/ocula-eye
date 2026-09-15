'use client';

export interface AnnotationMark {
  id: string;
  x: number;
  y: number;
  classId: string;
}

export interface AnnotationClassStyle {
  color: string;
  letter: string;
  label: string;
}

export interface AnnotationImageSize {
  width: number;
  height: number;
}

export interface AnnotationLayerProps {
  marks: AnnotationMark[];
  roi?: number[][] | null;
  selectedId: string | null;
  imageSize: AnnotationImageSize;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  classStyles?: Record<string, AnnotationClassStyle>;
}

const FALLBACK_PALETTE: string[] = ['#e5484d', '#f5a524', '#46a758', '#3e9bff', '#8e4ec6', '#12a594'];

function hashIndex(key: string, size: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash) % size;
}

function styleForMark(classId: string, classStyles?: Record<string, AnnotationClassStyle>): AnnotationClassStyle {
  const found = classStyles ? classStyles[classId] : undefined;
  if (found) {
    return found;
  }
  return {
    color: FALLBACK_PALETTE[hashIndex(classId, FALLBACK_PALETTE.length)],
    letter: classId.trim().charAt(0).toUpperCase() || '?',
    label: classId,
  };
}

function roiPoints(roi: number[][]): string {
  return roi.map((p) => `${p[0]},${p[1]}`).join(' ');
}

export default function AnnotationLayer(props: AnnotationLayerProps): React.JSX.Element {
  const { marks, roi, selectedId, imageSize, onSelect, onDelete, classStyles } = props;
  const width = imageSize.width > 0 ? imageSize.width : 100;
  const height = imageSize.height > 0 ? imageSize.height : 100;
  const radius = Math.max(9, Math.min(width, height) * 0.016);
  const showRoi = Array.isArray(roi) && roi.length >= 3;

  return (
    <div className='ocf-annot'>
      <svg
        className='ocf-annot-svg'
        viewBox={`0 0 ${width} ${height}`}
        role='img'
        aria-label={marks.length === 0 ? 'Belum ada anotasi' : `${marks.length} tanda anotasi`}
      >
        {showRoi && roi ? (
          <polygon
            points={roiPoints(roi)}
            className='ocf-annot-roi'
          />
        ) : null}
        {marks.map((mark) => {
          const style = styleForMark(mark.classId, classStyles);
          const selected = mark.id === selectedId;
          return (
            <g
              key={mark.id}
              role='button'
              tabIndex={0}
              aria-label={`Tanda ${style.label} di ${Math.round(mark.x)}, ${Math.round(mark.y)}${selected ? ', terpilih' : ''}. Tekan Enter untuk memilih, Delete untuk menghapus.`}
              aria-pressed={selected}
              className={selected ? 'ocf-annot-mark ocf-annot-mark-selected' : 'ocf-annot-mark'}
              onClick={(event: React.MouseEvent<SVGGElement>) => {
                event.stopPropagation();
                onSelect(mark.id);
              }}
              onKeyDown={(event: React.KeyboardEvent<SVGGElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(mark.id);
                } else if (event.key === 'Delete' || event.key === 'Backspace') {
                  event.preventDefault();
                  onDelete(mark.id);
                }
              }}
            >
              <circle cx={mark.x} cy={mark.y} r={radius} fill={style.color} />
              <text x={mark.x} y={mark.y} dy='0.35em' textAnchor='middle' className='ocf-annot-letter'>
                {style.letter}
              </text>
            </g>
          );
        })}
      </svg>
      <div className='ocf-annot-listwrap'>
        <p className='ocf-annot-count' role='status'>
          {marks.length === 0 ? 'Belum ada tanda. Tambahkan lewat penampil gambar.' : `${marks.length} tanda anotasi`}
        </p>
        {marks.length > 0 ? (
          <ul className='ocf-annot-list'>
            {marks.map((mark, index) => {
              const style = styleForMark(mark.classId, classStyles);
              const selected = mark.id === selectedId;
              return (
                <li key={mark.id} className={selected ? 'ocf-annot-item ocf-annot-item-selected' : 'ocf-annot-item'}>
                  <button
                    type='button'
                    className='ocf-annot-pick'
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Batal pilih' : 'Pilih'} tanda ${index + 1} (${style.label})`}
                    onClick={() => onSelect(selected ? null : mark.id)}
                  >
                    <span className='ocf-chip' style={{ backgroundColor: style.color }} aria-hidden='true'>
                      {style.letter}
                    </span>
                    <span>
                      {`Tanda ${index + 1} · ${style.label} · (${Math.round(mark.x)}, ${Math.round(mark.y)})`}
                    </span>
                  </button>
                  <button
                    type='button'
                    className='ocf-del-btn'
                    aria-label={`Hapus tanda ${index + 1} (${style.label})`}
                    onClick={() => onDelete(mark.id)}
                  >
                    Hapus
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
