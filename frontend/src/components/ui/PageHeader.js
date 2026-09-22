import React from 'react';

/**
 * One page header for both portals.
 *
 * Every screen previously rolled its own: `text-2xl font-bold` here,
 * `text-xl font-bold` there, an icon beside the title on six pages and not on
 * four others, descriptions sometimes `text-sm text-base-content/50` and
 * sometimes `text-base-content/60`. The eyebrow carries the section, the
 * title carries the page.
 */
export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-heading-sm text-ink">{title}</h1>
        {description && <p className="mt-1 text-body text-bark">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
