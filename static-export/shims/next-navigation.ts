/** Static-site replacement for `next/navigation`: full page navigations. */
export function useRouter() {
  return {
    push: (url: string) => window.location.assign(url),
    replace: (url: string) => window.location.replace(url),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    prefetch: () => undefined,
  };
}

export function usePathname() {
  return window.location.pathname;
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}
