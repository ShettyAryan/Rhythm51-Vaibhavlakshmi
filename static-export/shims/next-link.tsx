/** Static-site replacement for `next/link`: a plain anchor (no client router). */
import { forwardRef, type AnchorHTMLAttributes } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { toString(): string };
  prefetch?: unknown;
  replace?: unknown;
  scroll?: unknown;
};

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, prefetch, replace, scroll, ...rest }, ref) {
  void prefetch;
  void replace;
  void scroll;
  return <a ref={ref} href={String(href)} {...rest} />;
});

export default Link;
