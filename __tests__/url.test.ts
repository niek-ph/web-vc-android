import { isWebUrl, toWebUrl } from '../src/features/browser/url';

describe('browser addresses', () => {
  it('defaults a bare website to HTTPS and preserves paths and query strings', () => {
    expect(toWebUrl(' example.com/watch?v=42 ')).toBe(
      'https://example.com/watch?v=42',
    );
    expect(toWebUrl('http://192.168.1.10:8080/video')).toBe(
      'http://192.168.1.10:8080/video',
    );
  });

  it.each([
    '',
    'some search words',
    'https://',
    // eslint-disable-next-line no-script-url
    'javascript:alert(1)',
    'file:///sdcard/video.mp4',
    'intent://open',
    'data:text/html,hello',
    'https://user:password@example.com',
  ])('rejects invalid or unsupported input %s', input => {
    expect(toWebUrl(input)).toBeNull();
  });

  it('only allows fully qualified web URLs for page navigation', () => {
    expect(isWebUrl('example.com')).toBe(false);
    expect(isWebUrl('https://example.com')).toBe(true);
    expect(isWebUrl('intent://open')).toBe(false);
  });
});
