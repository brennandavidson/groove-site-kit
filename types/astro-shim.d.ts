// Plain tsc does not understand .astro files (astro check does). Typecheck-only shim, not shipped.
declare module "*.astro" {
  const Component: import("astro/runtime/server/index.js").AstroComponentFactory;
  export default Component;
}
