import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, Ref } from "react";
import { cn } from "../../lib/format.ts";
import { InlineError } from "./Feedback.tsx";

/** White 16px card with a 14px muted label above the value; an optional control (for example an asset selector) on the right. The input line is 1px ink at 20%. */
export function InputCard({ label, htmlFor, hint, error, right, disabled, children, className }: {
  label: string; htmlFor: string; hint?: ReactNode; error?: string | undefined; right?: ReactNode; disabled?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn(className)}>
      <div className={cn("rounded-card border bg-card p-4 transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-button", error ? "border-danger-line" : "border-field", disabled && "opacity-70")}>
        <label htmlFor={htmlFor} className="block text-body text-muted">{label}</label>
        <div className="mt-1 flex items-center gap-3">
          <div className="min-w-0 flex-1">{children}</div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      </div>
      {hint && !error ? <p className="mt-1.5 text-label text-muted">{hint}</p> : null}
      {error ? <InlineError id={`${htmlFor}-error`}>{error}</InlineError> : null}
    </div>
  );
}

const control = "w-full bg-transparent text-action font-medium outline-none placeholder:text-disabled disabled:cursor-not-allowed disabled:text-disabled";

export function TextField({ label, id, hint, error, right, ref, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: ReactNode; error?: string | undefined; right?: ReactNode; ref?: Ref<HTMLInputElement> }) {
  return (
    <InputCard label={label} htmlFor={id} hint={hint} error={error} right={right} disabled={rest.disabled} className={className}>
      <input id={id} ref={ref} className={control} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...rest} />
    </InputCard>
  );
}

export function TextAreaField({ label, id, hint, error, ref, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string; hint?: ReactNode; error?: string | undefined; ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <InputCard label={label} htmlFor={id} hint={hint} error={error} disabled={rest.disabled} className={className}>
      <textarea id={id} ref={ref} rows={3} className={cn(control, "resize-none text-[16px]")} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...rest} />
    </InputCard>
  );
}

export function SelectField({ label, id, hint, error, ref, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string; hint?: ReactNode; error?: string | undefined; ref?: Ref<HTMLSelectElement> }) {
  return (
    <InputCard label={label} htmlFor={id} hint={hint} error={error} disabled={rest.disabled} className={className}>
      <select id={id} ref={ref} className={cn(control, "cursor-pointer")} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...rest}>{children}</select>
    </InputCard>
  );
}

/** Two or three choices as quiet segments inside a fieldset (for example visibility). */
export function ChoiceGroup({ legend, name, options, value, onChange, hint }: {
  legend: string; name: string; options: { value: string; label: string; hint?: string }[]; value: string; onChange: (v: string) => void; hint?: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-body text-muted">{legend}</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className={cn("cursor-pointer rounded-card border bg-card p-3 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-button", value === o.value ? "border-button" : "border-field")}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="flex items-center gap-2 text-body font-medium">
              <span aria-hidden="true" className={cn("size-2 rounded-full", value === o.value ? "bg-button" : "border border-muted")} />
              {o.label}
            </span>
            {o.hint ? <span className="mt-1 block text-label text-muted">{o.hint}</span> : null}
          </label>
        ))}
      </div>
      {hint ? <p className="mt-1.5 text-label text-muted">{hint}</p> : null}
    </fieldset>
  );
}
