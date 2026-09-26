export function toWebUrl(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) {
    return null;
  }
  // A missing scheme is a normal address-bar input. Never open app intents,
  // javascript:, file:, data: or other schemes entered by a page or the user.
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  const candidate = hasScheme ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && toWebUrl(url) !== null;
}
