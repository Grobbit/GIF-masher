import { Fragment } from 'react';
import type { SourceItem } from '../hooks/useMashSources';
import { Icon } from './Icon';

interface OrderStripProps {
  items: SourceItem[];
}

/**
 * A compact visual proof of the mash order: clip thumbnails left to right,
 * exactly as they will be appended.
 */
export function OrderStrip({ items }: OrderStripProps) {
  return (
    <div className="order-strip" aria-label="Output order">
      {items.length === 0 && <span className="order-strip__empty">No clips yet</span>}
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 && (
            <span className="order-strip__arrow" aria-hidden="true">
              <Icon name="arrow-right" size={12} />
            </span>
          )}
          <span
            className="order-strip__item"
            title={`${index + 1}. ${item.name}${item.repeat > 1 ? ` (x${item.repeat})` : ''}`}
          >
            {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <Icon name="image" size={14} />}
            {item.repeat > 1 && <span>{item.repeat}x</span>}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
