'use client';

export interface GradeOption {
  id: string;
  label: string;
}

export interface GradeTask {
  label?: string;
  options: GradeOption[];
  allowNotAssessable?: boolean;
}

export interface FeatureOption {
  id: string;
  label: string;
}

export interface FeatureTask {
  id: string;
  label: string;
  options: FeatureOption[];
}

export interface ResponseValue {
  gradeId: string | null;
  notAssessable: boolean;
  features: Record<string, string | null>;
  confidence: number | null;
}

export interface ResponsePanelProps {
  gradeTask?: GradeTask;
  featureTasks: FeatureTask[];
  value: ResponseValue;
  onChange: (next: ResponseValue) => void;
  onSubmit: () => void;
  submitDisabledReason: string | null;
  confidence?: boolean;
}

const CONFIDENCE_LEVELS: number[] = [1, 2, 3, 4, 5];

export default function ResponsePanel(props: ResponsePanelProps): React.JSX.Element {
  const { gradeTask, featureTasks, value, onChange, onSubmit, submitDisabledReason, confidence } = props;
  const showConfidence = confidence === true;
  const submitDisabled = submitDisabledReason !== null;

  return (
    <div className='ocf-response'>
      {gradeTask ? (
        <fieldset className='ocf-field'>
          <legend className='ocf-legend'>{gradeTask.label ?? 'Tingkat keparahan'}</legend>
          {gradeTask.options.map((option) => (
            <label key={option.id} className='ocf-radio'>
              <input
                type='radio'
                name='ocf-grade'
                value={option.id}
                checked={value.gradeId === option.id && !value.notAssessable}
                disabled={value.notAssessable}
                onChange={() => {
                  onChange({ ...value, gradeId: option.id, notAssessable: false });
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {gradeTask.allowNotAssessable ? (
            <label className='ocf-check'>
              <input
                type='checkbox'
                checked={value.notAssessable}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const checked = event.target.checked;
                  onChange({ ...value, notAssessable: checked, gradeId: checked ? null : value.gradeId });
                }}
              />
              <span>Tidak dapat dinilai</span>
            </label>
          ) : null}
        </fieldset>
      ) : null}
      {featureTasks.map((task) => (
        <fieldset key={task.id} className='ocf-field'>
          <legend className='ocf-legend'>{task.label}</legend>
          {task.options.map((option) => (
            <label key={option.id} className='ocf-radio'>
              <input
                type='radio'
                name={`ocf-feature-${task.id}`}
                value={option.id}
                checked={(value.features[task.id] ?? null) === option.id}
                onChange={() => {
                  onChange({ ...value, features: { ...value.features, [task.id]: option.id } });
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
      {showConfidence ? (
        <fieldset className='ocf-field'>
          <legend className='ocf-legend'>Keyakinan (1 = tidak yakin, 5 = sangat yakin)</legend>
          <div className='ocf-confidence-row' role='radiogroup' aria-label='Tingkat keyakinan'>
            {CONFIDENCE_LEVELS.map((level) => (
              <label key={level} className='ocf-radio ocf-confidence'>
                <input
                  type='radio'
                  name='ocf-confidence'
                  value={level}
                  checked={value.confidence === level}
                  onChange={() => {
                    onChange({ ...value, confidence: level });
                  }}
                />
                <span>{level}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <button type='button' className='ocf-submit' disabled={submitDisabled} onClick={onSubmit}>
        Kirim jawaban
      </button>
      {submitDisabledReason ? (
        <p className='ocf-reason' role='status'>
          {submitDisabledReason}
        </p>
      ) : null}
    </div>
  );
}
