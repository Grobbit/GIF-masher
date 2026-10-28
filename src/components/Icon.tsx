/** Tiny inline icon set (no icon dependency, stroke style, currentColor). */

export type IconName =
  | 'plus'
  | 'trash'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'grip'
  | 'download'
  | 'copy'
  | 'close'
  | 'check'
  | 'info'
  | 'warning'
  | 'sparkles'
  | 'external'
  | 'chevron-down'
  | 'layers'
  | 'help'
  | 'github'
  | 'film'
  | 'image'
  | 'restart'
  | 'clock'
  | 'shield';

const PATHS: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
  'arrow-left': 'M19 12H5M11 18l-6-6 6-6',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  'arrow-down': 'M12 5v14M18 13l-6 6-6-6',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  copy: 'M9 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2ZM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M4 12.5l5 5L20 6.5',
  info: 'M12 8h.01M11 12h1v4h1',
  warning: 'M12 9v4M12 17h.01M10.3 3.9 2.4 17.4A2 2 0 0 0 4.1 20.4h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3ZM19 15l.9 2.3 2.1.7-2.1.8-.9 2.2-.9-2.2-2.1-.8 2.1-.7L19 15Z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  'chevron-down': 'M6 9l6 6 6-6',
  layers: 'M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 17.5l10 5 10-5',
  help: 'M9.1 9a3 3 0 1 1 4.5 2.6c-.9.5-1.6 1.2-1.6 2.4M12 17h.01',
  github:
    'M9 19c-4 1.5-4-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-1-2.6c3-.3 6-1.5 6-6.6a5.2 5.2 0 0 0-1.4-3.6 4.9 4.9 0 0 0-.1-3.6s-1.2-.4-3.9 1.5a13 13 0 0 0-6.8 0C5.1 1.3 3.9 1.7 3.9 1.7a4.9 4.9 0 0 0-.1 3.6A5.2 5.2 0 0 0 2.4 9c0 5 3 6.3 6 6.6a3.4 3.4 0 0 0-1 2.6V22',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  image: 'M4 4h16v16H4zM4 16l4.5-4.5a2 2 0 0 1 2.8 0L16 16M14 13l1.5-1.5a2 2 0 0 1 2.8 0L20 13M9 8.5h.01',
  restart: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  shield: 'M12 3l8 3v6c0 5-3.4 8.3-8 9.9C7.4 20.3 4 17 4 12V6l8-3Z',
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Accessible label; omit for purely decorative icons. */
  label?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, className, label, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
