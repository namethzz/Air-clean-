import type { LucideIcon } from 'lucide-react';
interface MetricCardProps { label: string; value: string; hint: string; icon: LucideIcon; tone: 'mint' | 'sand' | 'blue' | 'lavender'; }
export default function MetricCard({ label, value, hint, icon: Icon, tone }: MetricCardProps) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} strokeWidth={1.8}/></div><div className="metric-copy"><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-hint">{hint}</span></div><div className="metric-spark" aria-hidden="true"><span/><span/><span/><span/><span/><span/><span/></div></div>;
}