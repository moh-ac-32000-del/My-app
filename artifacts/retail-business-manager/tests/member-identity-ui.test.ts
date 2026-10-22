import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Language } from '@/constants/i18n';
const state = vi.hoisted(() => ({ language: 'ar' as Language, spaceId: 'a', name: 'أحمد' as string | null }));
vi.mock('react-native', () => ({
  Text: ({ children, style, accessibilityLabel }: any) =>
    React.createElement('span', { style, 'aria-label': accessibilityLabel }, children),
}));
vi.mock('@/context/MemberNamesContext', () => ({
  useMemberNames: () => ({
    directory: { spaceId: state.spaceId, members: [{ userId: 'u', displayName: state.name }] },
    ensureName: vi.fn(),
  }),
}));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: any) => translate(key, state.language), isRTL: state.language === 'ar' }),
}));
import { ActorBadge } from '@/components/ActorBadge';
describe('small scoped author badge (render verification, not physical-device testing)', () => {
  beforeEach(() => {
    state.language = 'ar';
    state.spaceId = 'a';
    state.name = 'أحمد';
  });
  it.each(['ar', 'tr', 'en'] as Language[])(
    'uses localized accessible attribution and a small name in %s',
    (language) => {
      state.language = language;
      const html = renderToStaticMarkup(React.createElement(ActorBadge, { userId: 'u' }));
      expect(html).toContain(state.name!);
      expect(html).toContain(translate('memberRecordedBy', language));
      expect(html).toContain('font-size:11px');
      expect(html).not.toContain('<button');
    },
  );
  it('changes scope without showing another workspace name and keeps color deterministic', () => {
    const first = renderToStaticMarkup(React.createElement(ActorBadge, { userId: 'u' }));
    expect(renderToStaticMarkup(React.createElement(ActorBadge, { userId: 'u' }))).toBe(first);
    state.spaceId = 'b';
    state.name = 'Ahmet';
    const second = renderToStaticMarkup(React.createElement(ActorBadge, { userId: 'u' }));
    expect(second).toContain('Ahmet');
    expect(second).not.toContain('أحمد');
    expect(second).not.toBe(first);
  });
  it.each([undefined, 'unknown'])('never invents an actor or reveals the raw UID for legacy identity %s', (userId) => {
    const html = renderToStaticMarkup(React.createElement(ActorBadge, { userId }));
    expect(html).toContain(translate('memberUnnamed', 'ar'));
    expect(html).not.toContain('أحمد');
    if (userId) expect(html).not.toContain(userId);
  });
  it('escapes a name as plain text instead of treating it as markup', () => {
    state.name = '<script>name</script>';
    expect(renderToStaticMarkup(React.createElement(ActorBadge, { userId: 'u' }))).not.toContain('<script>');
  });
});
