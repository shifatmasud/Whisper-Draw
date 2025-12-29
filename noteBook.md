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

-   **[2024-05-21 14:00]**: Upgraded the ColorPicker component with a 3D preview sphere using Three.js, precise HSL sliders for granular control, and refactored the popover to use a React Portal for robust positioning.
-   **[2024-05-21 13:45]**: Added a "Fill" (paint bucket) tool. Implemented a flood fill algorithm in the `useDraw` hook and updated the toolbar and stage interaction logic to support it.
-   **[2024-05-21 13:30]**: Built a canvas 2D texture design tool. Overhauled the entire application to support a canvas-based workflow with drawing tools, a layer management system, a properties panel, and an asset management window.
-   **[2024-05-21 13:15]**: Added a toggleable measurement overlay to the Stage, showing real-time dimensions for the button component.
-   **[2024-05-21 13:00]**: Completed extensive refactor into granular components (new Core inputs, Package panels for each window, Section for Stage).
-   **[2024-05-21 12:30]**: Refactored MetaPrototype into a modular component structure (App, Package, Section, Core) for better organization and scalability.
-   **[2024-05-21 12:00]**: Implemented Meta Prototype environment with draggable windows and State Layer physics.
-   **[2024-05-21 10:30]**: Implemented Tier 3 documentation files (`README.md`, `LLM.md`, `noteBook.md`, `bugReport.md`) as per system prompt.
-   **[2024-05-21 09:00]**: Initial project setup with React, Theme Provider, and responsive breakpoints.