import { useEffect, useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';

/**
 * The stops of a job, drawn as a line on the blue band: done, now, and still to come. `step` is the stop happening
 * now; a step past the last means all done. Customers have five stops, technicians four.
 */
export function Journey({ labels, step }: { labels: readonly string[]; step: number }) {
  return <ol className="jb-journey" aria-label="ความคืบหน้า" style={{ '--stops': labels.length } as CSSProperties}>
    {labels.map((label, index) => {
      const state = step >= labels.length || index < step ? 'done' : index === step ? 'now' : 'next';
      return <li key={label} className={'is-' + state} aria-current={state === 'now' ? 'step' : undefined}>
        <span className="jb-stop">{state === 'done' ? <Check size={14} strokeWidth={3}/> : index + 1}</span>
        <span className="jb-stop-label">{label}</span>
      </li>;
    })}
  </ol>;
}

/** True on screens wide enough to show the job list and the job side by side. */
export function useIsWide() {
  const query = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setWide(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return wide;
}
