import { gradeTone, type Grade } from '../draft/grades';

/** Kleine farbige Notenanzeige (A+ bis F-). Farbe ist nie das einzige Merkmal – die Note steht immer als Text da. */
export function GradeBadge({ grade, size = 'md', testid }: { grade: Grade; size?: 'sm' | 'md' | 'lg'; testid?: string }) {
  return (
    <span class={`grade grade-${gradeTone(grade)} grade-${size}`} data-testid={testid} data-grade={grade} aria-label={`Note ${grade}`}>
      {grade}
    </span>
  );
}
