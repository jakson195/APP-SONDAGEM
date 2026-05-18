import type { ComponentProps } from "react";

export function LabeledInput({
  label,
  id,
  wrapperClassName = "",
  ...rest
}: ComponentProps<"input"> & { label: string; wrapperClassName?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wrapperClassName}`}>
      <label htmlFor={id} className="text-xs font-medium text-[var(--text)]">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
        {...rest}
      />
    </div>
  );
}

export function LabeledTextarea({
  label,
  id,
  wrapperClassName = "",
  ...rest
}: ComponentProps<"textarea"> & { label: string; wrapperClassName?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wrapperClassName}`}>
      <label htmlFor={id} className="text-xs font-medium text-[var(--text)]">
        {label}
      </label>
      <textarea
        id={id}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
        {...rest}
      />
    </div>
  );
}
