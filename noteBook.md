
# Developer Notebook

A log of all tasks, ideas, and progress for this project.

## To Do

-   [ ] Add shape, text, and selection tools.
-   [ ] Implement layer properties (opacity, blend modes).
-   [ ] Build out full import/export functionality (SVG, Canvas 2D code).
-   [ ] Add interactive 3D elements with Three.js to preview textures.

## In Progress

-   ...

## Done

-   **[2024-05-21 16:15]**: Fixed a critical bug where shape fragments in 'Build' mode had incorrect transformations (position, rotation, scale) if the parent layer or original shapes were transformed. Corrected the matrix conversion logic between the geometry and rendering engines.
-   **[2024-05-21 16:00]**: Fixed a critical bug where shape fragments in 'Build' mode were invisible. The path conversion logic was failing to set a starting "move" command for the new shapes, preventing them from being rendered.
-   **[2024-05-21 15:00]**: Fixed a bug in the "Convert to Path" feature where it would not work on rounded rectangles. The flattening logic now correctly identifies and converts parametric rounded rectangle paths into editable, non-parametric vector paths.
-   **[2024-05-21 14:45]**: Optimized `RangeSlider` component for performance. It now uses `framer-motion`'s `useTransform` hook to update the UI without causing React re-renders during drag operations. Also improved floating-point number handling for greater precision.
-   **[2024-05-21 14:30]**: Tested the Layer properties tab, identified and fixed a bug in the `RangeSlider` component that prevented setting floating-point values. The 'Scale' property now works correctly with decimals.
-   **[2024-05-21 14:15]**: Implemented non-destructive path editing for the Pen tool. Users can now click existing anchors to select them, drag points to move them, and manipulate handles to adjust curves. Handles are only visible for the selected anchor to reduce visual noise.
-   **[2024-05-21 14:00]**: Upgraded the ColorPicker component with a 3D preview sphere using Three.js, precise HSL sliders for granular control, and refactored the popover to use a React Portal for robust positioning.
-   **[2024-05-21 13:45]**: Added a "Fill" (paint bucket) tool. Implemented a flood fill algorithm in the `useDraw` hook and updated the toolbar and stage interaction logic to support it.
-   **[2024-05-21 13:30]**: Built a canvas 2D texture design tool. Overhauled the entire application to support a canvas-based workflow with drawing tools, a layer management system, a properties panel, and an asset management window.
-   **[2024-05-21 13:15]**: Added a measurement overlay to the Stage, showing real-time dimensions for the button component.
-   **[2024-05-21 13:00]**: Completed extensive refactor into granular components (new Core inputs, Package panels for each window, Section for Stage).
-   **[2024-05-21 12:30]**: Refactored MetaPrototype into a modular component structure (App, Package, Section, Core) for better organization and scalability.
-   **[2024-05-21 12:00]**: Implemented Meta Prototype environment with draggable windows and State Layer physics.
-   **[2024-05-21 10:30]**: Implemented Tier 3 documentation files (`README.md`, `LLM.md`, `noteBook.md`, `bugReport.md`) as per system prompt.
-   **[2024-05-21 09:00]**: Initial project setup with React, Theme Provider, and responsive breakpoints.