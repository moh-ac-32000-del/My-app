import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WebReminderDateTimeInput } from '@/components/WebReminderDateTimeInput';

const props = {
  value: '2026-10-19T09:30', label: 'موعد التذكير', disabled: false, style: {},
};

describe('web reminder input', () => {
  it('renders an accessible browser date/time control with the selected local value', () => {
    const html = renderToStaticMarkup(createElement(WebReminderDateTimeInput, { ...props, onChange: vi.fn() }));
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('aria-label="موعد التذكير"');
    expect(html).toContain('value="2026-10-19T09:30"');
    expect(html).toContain('required=""');
    expect(html).toContain('step="60"');
  });

  it('forwards both a new value and a cleared value for validation', () => {
    const onChange = vi.fn();
    const input = WebReminderDateTimeInput({ ...props, onChange });
    input.props.onChange({ currentTarget: { value: '2026-10-20T11:45' } });
    input.props.onChange({ currentTarget: { value: '' } });
    expect(onChange.mock.calls).toEqual([['2026-10-20T11:45'], ['']]);
  });

  it('disables editing while the cloud save is in progress', () => {
    const html = renderToStaticMarkup(createElement(WebReminderDateTimeInput, { ...props, onChange: vi.fn(), disabled: true }));
    expect(html).toContain('disabled=""');
  });
});
