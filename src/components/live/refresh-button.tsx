import { RefreshCw } from 'lucide-react';

// Reloading is a secondary action everywhere, so it is drawn quietly and never competes with the page's main button.
export function RefreshButton({ onClick, disabled, label = 'Refresh', title }: { onClick: () => void; disabled?: boolean; label?: string; title?: string }) {
  return <button type="button" className="refresh-button" onClick={onClick} disabled={disabled} title={title}><RefreshCw size={15} aria-hidden />{label}</button>;
}
