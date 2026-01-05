
# Bug Report Log

Tracking all issues, from critical bugs to minor suggestions.

## Critical (App Breaking)

-   **[FIXED] [2024-05-21 16:15]**: Fragments in 'Build' mode have incorrect transforms (position, scale, rotation) when created from transformed shapes or layers. The matrix conversion math between `two.js` and `paper.js` was incorrect.
-   **[FIXED] [2024-05-21 16:00]**: Fragments in 'Build' mode are invisible after boolean operations. This was caused by an incorrect path data translation between the geometry engine and the renderer, which failed to specify a starting point for the new shapes.

## Warning (Unexpected Behavior)

-   **[FIXED] [2024-05-21 15:00]**: "Convert to Path" button does not work on rounded rectangle primitives. The shape remains parametric and cannot be edited with the Pen tool after conversion.

## Suggestion (Improvements)

-   ...