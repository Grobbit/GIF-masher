import type { Notice } from '../hooks/useMashSources';
import { Icon } from './Icon';

interface ToastsProps {
  notices: Notice[];
  onDismiss: (id: string) => void;
}

export function Toasts({ notices, onDismiss }: ToastsProps) {
  if (notices.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {notices.map((notice) => (
        <div key={notice.id} className={`toast toast--${notice.kind}`} role="status">
          <Icon name={notice.kind === 'error' ? 'warning' : 'info'} size={15} />
          <span className="toast__text">{notice.message}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onDismiss(notice.id)}
            aria-label="Dismiss notification"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
