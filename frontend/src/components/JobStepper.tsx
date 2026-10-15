import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

/** Progress line shared by the customer and technician job pages. `step` is the stage happening now; 5 means all done. */
export default function Stepper({ labels, step }: { labels: readonly string[]; step: number }) {
  return <ol className="cj-steps" aria-label="ความคืบหน้า">
    {labels.map((label, index) => {
      const state = step >= labels.length || index < step ? 'done' : index === step ? 'current' : 'next';
      return <li key={label} className={'cj-step ' + state} aria-current={state === 'current' ? 'step' : undefined}>
        <span className="cj-step-dot">{state === 'done' ? <Check size={15} strokeWidth={3}/> : index + 1}</span>
        <span className="cj-step-label">{label}</span>
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
