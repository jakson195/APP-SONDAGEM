/**
 * Libraries for `useJsApiLoader` — must be identical at every call site that
 * shares {@link GOOGLE_MAPS_JS_LOADER_ID} or the loader throws.
 */
export const GOOGLE_MAPS_LIBRARIES = ["geometry", "drawing"] as const;
