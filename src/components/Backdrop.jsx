/**
 * Slow-drifting colour field behind the interface.
 *
 * Glass needs something to refract — over a flat black page a backdrop blur is
 * invisible. Colours come from `--blob-1/2/3`, so the home screen can run a
 * saturated jewel palette while a live session stays near-neutral and lets the
 * phase colour lead. See `[data-phase='idle']` in index.css.
 */
export default function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="backdrop-field absolute inset-0" />
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
      <div className="backdrop-scrim absolute inset-0" />
    </div>
  )
}
