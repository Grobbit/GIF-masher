/**
 * Global test setup.
 *
 * Runs for both the node (engine) and jsdom (UI) test suites, so everything is
 * guarded on `window` existing.
 */

if (typeof window !== 'undefined') {
  if (!('createObjectURL' in URL)) {
    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      value: () => `blob:mock-${Math.random().toString(36).slice(2)}`,
    });
  }
  if (!('revokeObjectURL' in URL)) {
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: () => {} });
  }
  if (!('matchMedia' in window)) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (!('scrollTo' in window)) {
    Object.defineProperty(window, 'scrollTo', { writable: true, value: () => {} });
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
