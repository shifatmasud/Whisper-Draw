# React 18 2D Texture Design Tool

[**Remix on AI Studio**](https://ai.studio/apps/drive/1WYqqbd5DDER7bue4-jyHmwA6AC6Fn65w?fullscreenApplet=true)

This is a starter project for a modern, theme-aware 2D texture design application built with React. It features a canvas-based editor, layer management, a dynamic properties panel, and an asset manager, all wrapped in a premium, minimalist UI.

## Project Scan Sheet

| Category | Details |
| :--- | :--- |
| **Framework** | React 18.2.0 (ESM via `importmap`) |
| **Styling** | CSS-in-JS (JS Objects), Semantic Design Tokens |
| **Animation** | Framer Motion 12.x |
| **Typography** | Bebas Neue, Comic Neue, Inter, Victor Mono |
| **Icons** | Phosphor Icons |
| **State Management** | React Context (`Theme`, `Breakpoint`), Local State (`useState`) |
| **Architecture** | Atomic-based: `Core` → `Package` → `Section` → `Page` → `App` |
| **Key Features** | Canvas Editor, Layer System, Tool Properties, Asset I/O |
| **Key Components** | Floating Windows, Draggable Dock, Toolbar, Canvas Stage |
| **Theme System** | Light/Dark Modes, Responsive Tokens |
| **Inputs** | Range Sliders, Color Pickers, Toggles, Selects |

## What's Inside? (ELI10 Version)

Imagine you have a digital drawing book. This project gives you all the tools to build and use it.

-   **`index.html`**: The front door to our app.
-   **`index.tsx`**: The main brain of the app.
-   **`importmap.js`**: A map that tells our app where to find its tools (like React).
-   **`Theme.tsx`**: The "master closet" for our app's style (colors, fonts, etc.).
-   **`hooks/`**: Special tools (custom hooks).
    -   `useBreakpoint.tsx`: Checks if you're on a phone, tablet, or desktop.
    -   `useDraw.tsx`: The magic that handles all the drawing logic on the canvas.
-   **`types/`**: A dictionary for our app's data shapes.
    -   `index.tsx`: Defines what a "Layer" or a "Tool" is.
-   **`components/`**: The LEGO pieces themselves, organized by complexity!
    -   **`Core/`**: The most basic, single-purpose pieces (Button, Slider, LayerItem).
    -   **`Package/`**: Combines Core pieces into something more useful (`PropertiesPanel`, `LayersPanel`, `Toolbar`).
    -   **`Section/`**: A whole section of the app (the `Dock` at the bottom, the main `Stage`).
    -   **`Page/`**: A full screen you see (`TextureEditor` page).
    -   **`App/`**: The complete, running application (`MetaPrototype`).
-   **`README.md`**: This file! Your friendly guide.
-   **`LLM.md`**: Special instructions for AI helpers.
-   **`noteBook.md`**: A diary of tasks and progress.
-   **`bugReport.md`**: A list of bugs to fix.

## Directory Tree

```
.
├── components/
│   ├── App/
│   │   └── MetaPrototype.tsx
│   ├── Core/
│   │   ├── Button.tsx
│   │   ├── ColorPicker.tsx
│   │   ├── DockIcon.tsx
│   │   ├── Input.tsx
│   │   ├── LayerItem.tsx
│   │   ├── RangeSlider.tsx
│   │   ├── Select.tsx
│   │   ├── StateLayer.tsx
│   │   ├── ThemeToggleButton.tsx
│   │   └── Toggle.tsx
│   ├── Package/
│   │   ├── AssetsPanel.tsx
│   │   ├── LayersPanel.tsx
│   │   ├── PropertiesPanel.tsx
│   │   ├── FloatingWindow.tsx
│   │   └── Toolbar.tsx
│   ├── Page/
│   │   └── TextureEditor.tsx
│   └── Section/
│       ├── Dock.tsx
│       └── Stage.tsx
├── hooks/
│   ├── useBreakpoint.tsx
│   └── useDraw.tsx
├── types/
│   └── index.tsx
├── README.md
├── LLM.md
├── noteBook.md
├── bugReport.md
├── Theme.tsx
├── importmap.js
├── index.html
├── index.tsx
├── metadata.json
```

## How to Get Started

1.  Open the `index.html` file in a modern web browser.
2.  That's it! The app will run.
3.  Use the dock to open the Properties and Layers panels, select a tool, and start drawing!
```