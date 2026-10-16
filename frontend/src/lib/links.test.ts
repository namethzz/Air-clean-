import { describe, expect, it } from 'vitest';
import { webLink } from './links';

describe('webLink', () => {
  it('keeps web links', () => {
    expect(webLink('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(webLink(' http://example.com ')).toBe('http://example.com/');
  });
  it('drops scripts, data and junk', () => {
    expect(webLink('javascript:alert(1)')).toBeNull();
    expect(webLink('data:text/html,x')).toBeNull();
    expect(webLink('example.com')).toBeNull();
    expect(webLink(null)).toBeNull();
  });
});
