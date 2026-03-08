# UI Ownership

`components/ui/` is for vendor-derived or design-system primitives only.

- Imported shadcn/jsrepo primitives stay here and should keep their upstream-style structure.
- Locally owned app composition belongs under `components/features/`, `components/forms/`, or `components/shared/`.
- If a vendored primitive needs local behavior beyond a small styling tweak, fork it intentionally and document that decision in the file header.

Current locally owned form/workflow components have been moved out of this directory so new work has a clearer home.
