/**
 * `useJsApiLoader` from `@react-google-maps/api` is a singleton per options object.
 * The `id` must be identical for every call site that shares the same API key / libs,
 * or React throws: "Loader must not be called again with different options."
 */
export const GOOGLE_MAPS_JS_LOADER_ID = "vision-app-sondagem-maps";
