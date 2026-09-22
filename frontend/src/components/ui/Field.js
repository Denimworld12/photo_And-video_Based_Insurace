import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Form fields, defined at module scope.
 *
 * The profile page used to declare its `Field` component inside the render
 * body. React then saw a brand-new component type on every render and
 * remounted the input on every keystroke, so the field lost focus after each
 * character typed — unusable on a phone keyboard. Keeping these at module
 * scope is what fixes that; the shared label/error/hint markup is the bonus.
 */

function FieldShell({ id, label, required, error, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-eyebrow font-medium text-saddle">
          {label}
          {required && <span className="ml-0.5 text-bark"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1 text-caption text-saddle">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-caption text-bark">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const describedBy = (id, error, hint) => {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
};

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  icon: Icon,
  prefix,
  className = '',
  ...rest
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <div
        className={`flex items-center gap-2 rounded-md border bg-pure-white px-3 ${
          error ? 'border-saddle' : 'border-loam'
        } focus-within:border-honey-amber ${className}`}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 text-bark" aria-hidden="true" />}
        {prefix && <span className="shrink-0 text-body text-bark">{prefix}</span>}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-body text-ink outline-none placeholder:text-loam disabled:text-bark"
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

export function SelectField({ label, value, onChange, error, hint, required, options, placeholder, ...rest }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`w-full rounded-md border bg-pure-white px-3 py-2.5 text-body text-ink outline-none focus:border-honey-amber ${
          error ? 'border-saddle' : 'border-loam'
        }`}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => {
          const val = typeof opt === 'string' ? opt : opt.value;
          const text = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={val} value={val}>
              {text}
            </option>
          );
        })}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({ label, value, onChange, error, hint, required, rows = 4, ...rest }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`w-full resize-y rounded-md border bg-pure-white px-3 py-2.5 text-body text-ink outline-none placeholder:text-loam focus:border-honey-amber ${
          error ? 'border-saddle' : 'border-loam'
        }`}
        {...rest}
      />
    </FieldShell>
  );
}

/** A read-only value rendered in field clothing, so disabled inputs stop
 *  looking like inputs the user simply failed to click. */
export function ReadOnlyField({ label, value, icon: Icon }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <div className="flex items-center gap-2 rounded-md border border-bone bg-parchment px-3 py-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-bark" aria-hidden="true" />}
        <span className="truncate text-body text-saddle">{value || '—'}</span>
      </div>
    </FieldShell>
  );
}
