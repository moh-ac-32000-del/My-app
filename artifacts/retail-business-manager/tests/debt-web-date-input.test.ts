import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WebDebtDateInput } from '@/components/WebDebtDateInput';

const props = { value: '2028-02-29', label: 'تاريخ الاستحقاق', disabled: false, testID: 'debt-web-due-date', style: {} };

describe('web debt date control', () => {
  it('renders an accessible browser calendar with an unchanged date-only value', () => {
    const html = renderToStaticMarkup(createElement(WebDebtDateInput, { ...props, onChange: vi.fn() }));
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2028-02-29"');
    expect(html).toContain('aria-label="تاريخ الاستحقاق"');
    expect(html).toContain('data-testid="debt-web-due-date"');
    expect(html).not.toContain('required');
  });

  it.each(['onInput', 'onChange'] as const)('forwards %s edits and clearing without timezone conversion', (eventName) => {
    const onChange = vi.fn();
    const input = WebDebtDateInput({ ...props, onChange });
    for (const value of ['2026-12-31', '2027-01-01', '2028-02-29', '']) {
      input.props[eventName]({ currentTarget: { value } });
    }
    expect(onChange.mock.calls).toEqual([['2026-12-31'], ['2027-01-01'], ['2028-02-29'], ['']]);
  });

  it('allows the optional due date to be empty and updated by a form reset', () => {
    const render = (value: string) => renderToStaticMarkup(createElement(WebDebtDateInput, { ...props, value, onChange: vi.fn() }));
    expect(render('')).toContain('value=""');
    expect(render('2026-10-25')).toContain('value="2026-10-25"');
  });

  it('disables editing during cloud save and supports the quick-credit variant', () => {
    const html = renderToStaticMarkup(createElement(WebDebtDateInput, { ...props, disabled: true, testID: 'credit-web-due-date', onChange: vi.fn() }));
    expect(html).toContain('disabled=""');
    expect(html).toContain('data-testid="credit-web-due-date"');
  });
});
