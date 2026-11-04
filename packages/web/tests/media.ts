// jsdom has no window.matchMedia. Tests pick a width: narrow (phones and tablets, the default)
// or wide (desktop), and can switch it while a component is mounted.
type Listener = () => void;

let wide = false;
const listeners = new Set<Listener>();

export function setWideScreen(value: boolean): void {
  wide = value;
  for (const listener of listeners) listener();
}

// How many components are listening for width changes (to check they stop on unmount).
export function listenerCount(): number {
  return listeners.size;
}

export function installMatchMedia(): void {
  wide = false;
  listeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('min-width: 1280px') ? wide : false;
    },
    media: query,
    onchange: null,
    addEventListener: (type: string, listener: Listener) => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      if (type === 'change') listeners.delete(listener);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
