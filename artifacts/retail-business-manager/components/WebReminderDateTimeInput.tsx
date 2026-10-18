import React from 'react';

export function WebReminderDateTimeInput({
  value, onChange, label, disabled, style,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled: boolean;
  style: React.CSSProperties;
}) {
  return (
    <input
      data-testid="reminder-web-datetime"
      type="datetime-local"
      step={60}
      required
      aria-label={label}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      style={style}
    />
  );
}
