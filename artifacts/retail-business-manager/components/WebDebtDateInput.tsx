import React from 'react';

/** Browser-only control: keep the calendar date as YYYY-MM-DD, without UTC conversion. */
export function WebDebtDateInput({ value, onChange, label, disabled, testID, style }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled: boolean;
  testID: string;
  style: React.CSSProperties;
}) {
  return (
    <input
      type="date"
      max="9999-12-31"
      aria-label={label}
      data-testid={testID}
      disabled={disabled}
      value={value}
      onInput={(event) => onChange(event.currentTarget.value)}
      onChange={(event) => onChange(event.currentTarget.value)}
      style={style}
    />
  );
}
