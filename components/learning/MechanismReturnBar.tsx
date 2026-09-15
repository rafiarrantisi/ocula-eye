'use client';

export interface MechanismReturnBarProps {
  originLabel: string;
  onReturn: () => void;
}

/** Return affordance for bridge follow-up journeys (lab follow-up case,
 * collapsed bridge panel). Pure presentational. */
export default function MechanismReturnBar({ originLabel, onReturn }: MechanismReturnBarProps) {
  return (
    <div className="mech-returnbar" role="navigation" aria-label="Kembali">
      <span>Dari jembatan: {originLabel}</span>
      <button type="button" onClick={onReturn}>Kembali ke umpan balik</button>
    </div>
  );
}
