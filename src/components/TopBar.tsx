import { Icon } from './Icon';

interface TopBarProps {
  onOpenHelp: () => void;
}

export function TopBar({ onOpenHelp }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="brand">
          <div className="brand__mark" aria-hidden="true">
            <Icon name="layers" size={19} />
          </div>
          <div className="brand__text">
            <span className="brand__name">GIF Masher</span>
            <span className="brand__tagline">Combine GIFs in the exact order you add them</span>
          </div>
        </div>

        <div className="topbar__spacer" />

        <div className="topbar__actions">
          <span className="pill pill--good" title="Everything runs in your browser">
            <Icon name="shield" size={13} />
            100% local
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenHelp}>
            <Icon name="help" size={16} />
            <span className="btn-label">How it works</span>
          </button>
          <a
            className="btn btn-ghost btn-sm"
            href="https://github.com/Grobbit/GIF-masher"
            target="_blank"
            rel="noreferrer noopener"
          >
            <Icon name="github" size={16} />
            <span className="btn-label">Source</span>
          </a>
        </div>
      </div>
    </header>
  );
}
