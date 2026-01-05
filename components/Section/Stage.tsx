
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Two from 'two.js';
import paper from 'paper';
import { useTheme } from '../../Theme.tsx';
import { Layer, Tool, ToolSettings } from '../../types/index.tsx';

// Helper for Bezier math
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (v1: {x: number, y: number}, v2: {x: number, y: number}, t: number) => ({ x: lerp(v1.x, v2.x, t), y: lerp(v1.y, v2.y, t) });

/**
 * 🛠 Canvas Engine (Decoupled Renderer)
 * Completely isolated from React render cycles. All state is managed internally,
 * and updates from React are fed through a dedicated API of setter methods.
 * This ensures "real-time" prop updates without waiting for effects.
 */
class CanvasEngine {
    two: Two;
    paperScope: paper.PaperScope;
    groups: Map<string, Two.Group> = new Map();
    activeLayerId: string | null = null;
    tool: Tool = 'select';
    settings!: ToolSettings; // Will be set immediately after construction
    onToolChange?: (tool: Tool) => void;
    onAnchorSelect?: (isSelected: boolean) => void;
    onSelectionTypeChange?: (type: 'primitive' | 'path' | null) => void;
    onSelectionPropertiesChange?: (properties: Partial<ToolSettings>) => void;
    
    // Selection & Transform State
    selectedShape: any | null = null; 
    transformGroup: Two.Group | null = null;
    
    // Interaction state
    isInteracting = false;
    dragOffset = { x: 0, y: 0 };
    currentPath: Two.Path | null = null;
    
    // Shape Tool State
    tempShape: any | null = null;
    shapeOrigin = { x: 0, y: 0 };
    buildPath: Two.Path | null = null;

    // Pen tool / Path Editing state
    penPath: Two.Path | null = null;
    selectedAnchorIdx: number = -1;
    penHelpers: Two.Group | null = null;
    penInteraction = { 
        mode: 'idle' as 'idle' | 'dragging-anchor' | 'dragging-handle-left' | 'dragging-handle-right' | 'creating', 
        dragStart: { x: 0, y: 0 }, 
        initialPos: { x: 0, y: 0 } 
    };
    
    // Gestures
    lastClickTime: number = 0;

    constructor(container: HTMLElement) {
        this.two = new Two({
            type: Two.Types.canvas,
            width: container.clientWidth,
            height: container.clientHeight,
            autostart: true,
        }).appendTo(container);

        // Initialize Headless Paper.js Scope for Math
        this.paperScope = new paper.PaperScope();
        // Create a dummy canvas for paper (required even for headless math in some versions)
        const dummyCanvas = document.createElement('canvas');
        this.paperScope.setup(dummyCanvas);
    }
    
    // --- Public API for React ---

    public setTool(tool: Tool) {
        if (this.tool === tool) return;
        this.tool = tool;

        this.updateSelectionHandles(); // This will hide/show handles based on new tool

        if (tool === 'select' && this.selectedShape) {
            // Re-broadcast selection type if switching back to select tool
            if (this.onSelectionTypeChange) {
                let selectionType: 'primitive' | 'path' | null = null;
                if (this.selectedShape instanceof Two.Rectangle || this.selectedShape instanceof Two.Ellipse || this.selectedShape instanceof Two.Polygon || this.selectedShape instanceof Two.Star || this.selectedShape instanceof Two.Line) {
                    selectionType = 'primitive';
                } else if (this.selectedShape instanceof Two.Path) {
                    selectionType = 'path';
                }
                this.onSelectionTypeChange(selectionType);
            }
        } else if (tool !== 'select') {
            // Hide selection-specific UI when not on select tool
            if (this.onSelectionTypeChange) this.onSelectionTypeChange(null);
        }
        
        if (tool !== 'pen') {
            this.finishPath();
        } else if (this.penPath) {
            this.updatePenHelpers();
        }
    }

    public setActiveLayerId(id: string | null) {
        this.activeLayerId = id;
    }

    public setToolSettings(settings: ToolSettings) {
        this.settings = settings;

        // Apply settings to the currently selected shape for live manipulation
        if (this.selectedShape) {
            this.selectedShape.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
            this.selectedShape.linewidth = this.settings.strokeWidth;
            this.selectedShape.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
            
            // These might not exist on all shapes, but Two.js should handle it gracefully
            if ('cap' in this.selectedShape) (this.selectedShape as any).cap = this.settings.lineCap;
            if ('join' in this.selectedShape) (this.selectedShape as any).join = this.settings.lineJoin;
        }

        // Real-time update for the currently edited path
        if (this.penPath) {
            this.penPath.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
            this.penPath.linewidth = this.settings.strokeWidth;
            this.penPath.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
            this.penPath.cap = this.settings.lineCap;
            this.penPath.join = this.settings.lineJoin;
            this.penPath.closed = this.settings.penClosePath;
        }
    }

    public setCallbacks(callbacks: { 
        onToolChange?: (tool: Tool) => void, 
        onAnchorSelect?: (isSelected: boolean) => void,
        onSelectionTypeChange?: (type: 'primitive' | 'path' | null) => void,
        onSelectionPropertiesChange?: (properties: Partial<ToolSettings>) => void
    }) {
        this.onToolChange = callbacks.onToolChange;
        this.onAnchorSelect = callbacks.onAnchorSelect;
        this.onSelectionTypeChange = callbacks.onSelectionTypeChange;
        this.onSelectionPropertiesChange = callbacks.onSelectionPropertiesChange;
    }
    
    public updateLayers(layers: Layer[]) {
        layers.forEach(layer => {
            if (!this.groups.has(layer.id)) {
                const group = new Two.Group();
                group.id = layer.id;
                this.groups.set(layer.id, group);
                this.two.add(group);
            }
            const group = this.groups.get(layer.id)!;
            group.visible = layer.isVisible;
            group.opacity = layer.opacity;
            group.blendMode = layer.blendMode;
            
            group.translation.set(layer.x, layer.y);
            group.scale = layer.scale;
            group.rotation = (layer.rotation * Math.PI) / 180;
        });

        const activeIds = new Set(layers.map(l => l.id));
        this.groups.forEach((g, id) => {
            if (!activeIds.has(id)) {
                this.two.remove(g);
                this.groups.delete(id);
            }
        });

        layers.forEach((l) => {
            const g = this.groups.get(l.id)!;
            this.two.scene.remove(g);
            this.two.scene.add(g);
        });

        if (this.transformGroup) {
            this.two.scene.remove(this.transformGroup);
            this.two.scene.add(this.transformGroup);
        }
        if (this.penHelpers) {
            this.two.scene.remove(this.penHelpers);
            this.two.scene.add(this.penHelpers);
        }
    }

    // --- Core Methods ---
    
    public destroy() {
        this.two.pause();
        if (this.two.renderer.domElement) {
            this.two.renderer.domElement.remove();
        }
    }

    public resize(width: number, height: number) {
        this.two.width = width;
        this.two.height = height;
        this.two.renderer.setSize(width, height);
    }
    
    public finishPath() {
        this.penPath = null;
        this.updateAnchorSelection(-1);
        this.cleanupPenHelpers();
        this.penInteraction.mode = 'idle';
    }

    public deleteSelectedAnchor() {
        if (!this.penPath || this.selectedAnchorIdx === -1) return;
        
        this.penPath.vertices.splice(this.selectedAnchorIdx, 1);
        
        if (this.penPath.vertices.length === 0) {
            this.penPath.remove();
            this.penPath = null;
            this.finishPath();
        } else {
             let newIdx = this.selectedAnchorIdx;
             if (newIdx >= this.penPath.vertices.length) {
                 newIdx = this.penPath.vertices.length - 1;
             }
             this.updateAnchorSelection(newIdx);
             this.updatePenHelpers();
        }
    }

    public setAnchorSharp() {
        if (!this.penPath || this.selectedAnchorIdx === -1) return;
        const v = this.penPath.vertices[this.selectedAnchorIdx];
        v.controls.left.clear();
        v.controls.right.clear();
        this.updatePenHelpers();
    }

    public setPathClosed(closed: boolean) {
        if (!this.penPath) return;
        this.penPath.closed = closed;
    }

    public duplicateLayerContent(originalId: string, newId: string) {
        const originalGroup = this.groups.get(originalId);
        if (!originalGroup) return;

        // Two.Group's clone() method deeply clones all children.
        const newGroup = (originalGroup as any).clone();
        newGroup.id = newId; // Assign the new ID for our mapping.
        
        // Add the new group to our map and the scene. The `updateLayers` call
        // that follows this action will handle setting the correct properties
        // and z-index ordering.
        this.groups.set(newId, newGroup);
        this.two.add(newGroup);
    }

    // --- Internal Logic: Primitives to Path ---
    private flattenShape(shape: any): Two.Path | null {
        if (!this.activeLayerId) return null;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return null;

        // If it's already a Path, just clone it to ensure we work on a clean instance if needed
        // but typically we just return it. 
        // Wait, if it's a Two.Path we can return it. If it's Rect/Circle, we convert.
        
        if (shape instanceof Two.Path) {
            return shape;
        }

        // It is a primitive (Rectangle, Ellipse, etc.)
        // Convert to Path by cloning vertices
        // Note: Two.js Primitives store their geometry in `vertices` just like Paths, 
        // but they have specialized rendering logic. Copying vertices to a Two.Path works.
        
        const vertices = shape.vertices.map((v: any) => v.clone());
        const path = new Two.Path(vertices, shape.closed, shape.curved, shape.manual);
        
        // Copy transform & styling
        path.translation.copy(shape.translation);
        path.rotation = shape.rotation;
        path.scale = shape.scale;
        path.fill = shape.fill;
        path.stroke = shape.stroke;
        path.linewidth = shape.linewidth;
        path.opacity = shape.opacity;
        path.blending = shape.blending;

        // Replace in Scene Graph
        const index = group.children.indexOf(shape);
        shape.remove();
        if (index >= 0) {
             group.children.splice(index, 0, path);
             path.parent = group; 
        } else {
             group.add(path);
        }

        return path;
    }

    public flattenSelectedShape() {
        if (!this.selectedShape) return;
        const newShape = this.flattenShape(this.selectedShape);
        if (newShape) {
            this.selectedShape = newShape;
            this.updateSelectionHandles();
            if (this.onSelectionTypeChange) {
                this.onSelectionTypeChange('path');
            }
        }
    }
    
    // --- Boolean Operations Bridge ---
    
    private twoPathToPaperPath(twoPath: Two.Path): paper.PathItem {
        // 1. Create Paper Path from Two.js Vertices
        // We rely on simple SVG path data transfer for robustness with curves
        // Or manual reconstruction. Manual is better for transforms.
        
        const path = new this.paperScope.Path({
            closed: twoPath.closed
        });

        twoPath.vertices.forEach(v => {
            const segment = new this.paperScope.Segment(
                new this.paperScope.Point(v.x, v.y),
                new this.paperScope.Point(v.controls?.left?.x || 0, v.controls?.left?.y || 0),
                new this.paperScope.Point(v.controls?.right?.x || 0, v.controls?.right?.y || 0)
            );
            path.add(segment);
        });

        // 2. Apply Transforms
        // Two.js rotation is Radians, Paper is Degrees.
        path.position = new this.paperScope.Point(twoPath.translation.x, twoPath.translation.y);
        path.rotation = (twoPath.rotation * 180) / Math.PI;
        
        // Handle Scale (Two.js can be number or vector)
        const sx = typeof twoPath.scale === 'number' ? twoPath.scale : twoPath.scale.x;
        const sy = typeof twoPath.scale === 'number' ? twoPath.scale : twoPath.scale.y;
        path.scaling = new this.paperScope.Point(sx, sy);

        return path;
    }

    private importPaperPathToTwo(paperItem: paper.Item, targetGroup: Two.Group, styleSource: Two.Path) {
        // Export as SVG String from Paper (Simplest way to handle CompoundPaths/Holes correctly)
        const svgString = paperItem.exportSVG({ asString: true }) as string;
        
        // Parse SVG using native DOM parser to get an Element
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgElement = doc.documentElement; // This is the <path> or <g>

        // Interpret with Two.js
        // Two.interpret returns a Two.Group usually containing the paths, OR a Two.Path if it's a simple path.
        const loaded = this.two.interpret(svgElement);
        
        if (!loaded) return;

        let shapes: any[] = [];
        
        // Fix: Robust check for children to handle different Two.js versions/types
        // Two.js groups use 'children' which might be a Collection or Array.
        if ('children' in loaded && (loaded as any).children && (loaded as any).children.length > 0) {
             // Array.from is safer than spread for iterables in some environments
             shapes = Array.from((loaded as any).children);
        } else {
             shapes = [loaded];
        }
        
        shapes.forEach((child: any) => {
            // Apply style from the base shape (the one we merged into)
            child.fill = styleSource.fill;
            child.stroke = styleSource.stroke;
            child.linewidth = styleSource.linewidth;
            child.opacity = styleSource.opacity;
            child.blending = styleSource.blending;
            
            // Note: If child was part of 'loaded', adding it to 'targetGroup' removes it from 'loaded'.
            targetGroup.add(child);
        });
        
        // Cleanup temp object
        loaded.remove();
    }

    performBuildOperation() {
        if (!this.activeLayerId || !this.buildPath) return;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return;

        // 1. Calculate Selection Bounds (Build Path in Group Space)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        if (this.buildPath.vertices.length > 0) {
            this.buildPath.vertices.forEach(v => {
                const local = this.toLocal(group, v.x, v.y);
                if (local.x < minX) minX = local.x;
                if (local.x > maxX) maxX = local.x;
                if (local.y < minY) minY = local.y;
                if (local.y > maxY) maxY = local.y;
            });
        } else {
             return;
        }
        
        // 2. Find Hit Shapes
        // We iterate backwards to prioritize top items but gather all
        const hitShapes: Two.Path[] = [];
        
        // Create a copy of children list to avoid modification issues during iteration
        const candidates = [...group.children];
        
        candidates.forEach(child => {
            if (child instanceof Two.Shape) {
                const b = child.getBoundingClientRect();
                if (minX < b.right && maxX > b.left && minY < b.bottom && maxY > b.top) {
                    // HIT!
                    // Requirement: "Require convert to path first".
                    // We Auto-Flatten for better UX.
                    const flattened = this.flattenShape(child);
                    if (flattened) {
                        hitShapes.push(flattened);
                    }
                }
            }
        });

        if (hitShapes.length < 2 && this.settings.buildMode !== 'subtract') return; // Need 2+ for merge, subtract needs 1+ (selection is cutter) but here logic implies interacting shapes.
        if (hitShapes.length === 0) return;

        // 3. Prepare Paper.js Items
        // We map Two shapes to Paper items.
        // hitShapes is in Z-index order (bottom to top? No, we iterated a copy. Let's rely on index).
        // Let's sort by index in group to be safe: Bottom -> Top
        hitShapes.sort((a, b) => group.children.indexOf(a) - group.children.indexOf(b));

        const paperItems = hitShapes.map(s => this.twoPathToPaperPath(s));

        // 4. Perform Boolean Operation
        let resultItem: paper.Item | null = null;

        if (this.settings.buildMode === 'merge') {
            // Union All
            resultItem = paperItems[0];
            for (let i = 1; i < paperItems.length; i++) {
                const next = paperItems[i];
                const union = resultItem.unite(next);
                // Cleanup intermediate items to free memory in Paper scope?
                // Paper.js manages its scene graph. We should remove used items.
                if (resultItem !== paperItems[0]) resultItem.remove(); // Remove previous intermediate
                resultItem = union;
            }
        } else if (this.settings.buildMode === 'subtract') {
            // Subtract Top from Bottom (Illustrator Pathfinder "Minus Front")
            // Bottom shape is paperItems[0]. All others are subtractors.
            const base = paperItems[0];
            let combinedSubtractors: paper.Item | null = null;
            
            // Union all subtractors first (standard behavior)
            if (paperItems.length > 1) {
                combinedSubtractors = paperItems[1];
                for (let i = 2; i < paperItems.length; i++) {
                    const next = paperItems[i];
                    const union = combinedSubtractors.unite(next);
                    if (combinedSubtractors !== paperItems[1]) combinedSubtractors.remove();
                    combinedSubtractors = union;
                }
                
                resultItem = base.subtract(combinedSubtractors);
            } else {
                // Nothing to subtract from? Or just selection?
                return;
            }
        }

        // 5. Apply Result
        if (resultItem) {
            // Remove old Two.js shapes
            hitShapes.forEach(s => s.remove());
            
            // Add new shape
            // We use the style of the bottom-most shape (hitShapes[0])
            this.importPaperPathToTwo(resultItem, group, hitShapes[0]);
        }

        // Cleanup Paper.js
        this.paperScope.project.activeLayer.removeChildren();
    }
    
    
    updateSelectionHandles() {
        if (this.transformGroup) {
            this.two.remove(this.transformGroup);
            this.transformGroup = null;
        }

        if (!this.selectedShape || this.tool !== 'select') return;

        const bounds = this.selectedShape.getBoundingClientRect(true);
        const group = new Two.Group();
        this.transformGroup = group;

        const rect = new Two.Rectangle(bounds.left + bounds.width/2, bounds.top + bounds.height/2, bounds.width + 10, bounds.height + 10);
        rect.noFill();
        rect.stroke = '#1565C0'; 
        rect.linewidth = 2;
        group.add(rect);

        const handlePoints = [
            { x: bounds.left - 5, y: bounds.top - 5 },
            { x: bounds.right + 5, y: bounds.top - 5 },
            { x: bounds.right + 5, y: bounds.bottom + 5 },
            { x: bounds.left - 5, y: bounds.bottom + 5 },
        ];

        handlePoints.forEach(p => {
            const handle = new Two.Circle(p.x, p.y, 5);
            handle.fill = '#FFFFFF';
            handle.stroke = '#1565C0';
            handle.linewidth = 1;
            group.add(handle);
        });

        this.two.add(group);
    }
    
    toLocal(object: any, x: number, y: number) {
        const dx = x - object.translation.x;
        const dy = y - object.translation.y;
        
        const cos = Math.cos(-object.rotation);
        const sin = Math.sin(-object.rotation);
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        
        const scale = typeof object.scale === 'number' ? object.scale : (object.scale.x || 1);
        
        return { x: rx / scale, y: ry / scale };
    }
    
    splitBezier(v1: Two.Anchor, v2: Two.Anchor, t: number) {
        const p0 = { x: v1.x, y: v1.y };
        const p1 = { x: v1.x + v1.controls.right.x, y: v1.y + v1.controls.right.y };
        const p2 = { x: v2.x + v2.controls.left.x, y: v2.y + v2.controls.left.y };
        const p3 = { x: v2.x, y: v2.y };

        const l1 = { x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) };
        const h1 = { x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t) };
        const h2 = { x: lerp(p2.x, p3.x, t), y: lerp(p2.y, p3.y, t) };

        const l2 = { x: lerp(l1.x, h1.x, t), y: lerp(l1.y, h1.y, t) };
        const h1_new = { x: lerp(h1.x, h2.x, t), y: lerp(h1.y, h2.y, t) };

        const split = { x: lerp(l2.x, h1.x, t), y: lerp(l2.y, h1.y, t) };
        
        const newAnchor = new Two.Anchor(split.x, split.y, 0, 0, 0, 0, Two.Commands.curve);
        newAnchor.controls.left.x = l2.x - split.x;
        newAnchor.controls.left.y = l2.y - split.y;
        newAnchor.controls.right.x = h1_new.x - split.x;
        newAnchor.controls.right.y = h1_new.y - split.y;
        
        const newV1Right = { x: l1.x - p0.x, y: l1.y - p0.y };
        const newV2Left = { x: h2.x - p3.x, y: h2.y - p3.y };

        return { newAnchor, newV1Right, newV2Left };
    }

    updateAnchorSelection(index: number) {
        this.selectedAnchorIdx = index;
        if (this.onAnchorSelect) {
            this.onAnchorSelect(index !== -1);
        }
    }

    tryEnterEditMode(x: number, y: number): boolean {
        if (!this.activeLayerId) return false;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return false;

        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i];
            if (child instanceof Two.Path) {
                const bounds = child.getBoundingClientRect(true);
                if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                     this.penPath = child;
                     if (this.transformGroup) {
                         this.two.remove(this.transformGroup);
                         this.transformGroup = null;
                         this.selectedShape = null;
                     }
                     
                     if (this.onToolChange) {
                         this.onToolChange('pen');
                     }
                     this.updatePenHelpers();
                     return true;
                }
            }
        }
        return false;
    }

    // --- Interaction Handlers ---

    handleDown(x: number, y: number) {
        const now = Date.now();
        if (now - this.lastClickTime < 300) {
            if (this.tool === 'pen') {
                this.finishPath();
                this.lastClickTime = 0;
                return;
            } else if (this.tool === 'select') {
                if (this.settings.selectionMode === 'vector' && this.tryEnterEditMode(x, y)) {
                    this.lastClickTime = 0;
                    return;
                }
            }
        }
        this.lastClickTime = now;

        if (!this.activeLayerId) return;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return;
        
        const local = this.toLocal(group, x, y);
        this.isInteracting = true;

        if (this.tool === 'delete') {
             for (let i = group.children.length - 1; i >= 0; i--) {
                const child = group.children[i];
                if (!(child instanceof Two.Shape)) continue;
                
                const bounds = child.getBoundingClientRect(true);
                if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                    child.remove();
                    break;
                }
            }
        } else if (this.tool === 'select') {
            this.selectedShape = null;
            let found = false;
            let selectionType: 'primitive' | 'path' | null = null;

            if (this.settings.selectionMode === 'layer') {
                 // Selection at group level would require scene traversal, ignoring for now as groups map to layers
            } else {
                for (let i = group.children.length - 1; i >= 0; i--) {
                    const child = group.children[i];
                    if (!(child instanceof Two.Shape)) continue;
                    
                    const bounds = child.getBoundingClientRect(true);
                    if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                        this.selectedShape = child;
                        this.dragOffset = { x: local.x - child.translation.x, y: local.y - child.translation.y };
                        found = true;

                        // Determine type for flattening
                        if (child instanceof Two.Rectangle || child instanceof Two.Ellipse || child instanceof Two.Polygon || child instanceof Two.Star || child instanceof Two.Line) {
                            selectionType = 'primitive';
                        } else if (child instanceof Two.Path) {
                            selectionType = 'path';
                        }
                        break;
                    }
                }
            }
            if (found && this.selectedShape) {
                if (this.onSelectionPropertiesChange) {
                    const shape = this.selectedShape;
                    const stroke = shape.stroke;
                    const fill = shape.fill;
            
                    const strokeIsTransparent = stroke === 'transparent';
                    const fillIsTransparent = fill === 'transparent';
            
                    const strokeColorStr = !strokeIsTransparent && typeof stroke === 'object' && stroke !== null && 'toHexString' in stroke 
                        ? (stroke as any).toHexString() 
                        : typeof stroke === 'string' ? stroke : this.settings.strokeColor;
                    
                    const fillColorStr = !fillIsTransparent && typeof fill === 'object' && fill !== null && 'toHexString' in fill
                        ? (fill as any).toHexString()
                        : typeof fill === 'string' ? fill : this.settings.fillColor;
            
                    this.onSelectionPropertiesChange({
                        strokeEnabled: !strokeIsTransparent,
                        strokeColor: strokeIsTransparent ? this.settings.strokeColor : strokeColorStr,
                        fillEnabled: !fillIsTransparent,
                        fillColor: fillIsTransparent ? this.settings.fillColor : fillColorStr,
                        strokeWidth: shape.linewidth,
                        lineCap: 'cap' in shape ? (shape as any).cap : this.settings.lineCap,
                        lineJoin: 'join' in shape ? (shape as any).join : this.settings.lineJoin,
                    });
                }
            } else {
                this.selectedShape = null;
                selectionType = null;
            }

            this.updateSelectionHandles();
            if (this.onSelectionTypeChange) {
                this.onSelectionTypeChange(selectionType);
            }

        } else if (this.tool === 'pen') {
            this.handlePenDown(local.x, local.y, group);
        } else if (this.tool === 'brush') {
            const path = new Two.Path([new Two.Anchor(local.x, local.y)], false, true);
            path.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
            path.linewidth = this.settings.strokeWidth;
            path.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
            path.cap = this.settings.lineCap;
            path.join = this.settings.lineJoin;
            group.add(path);
            this.currentPath = path;
        } else if (this.tool === 'shape') {
            this.handleShapeDown(local.x, local.y, group, x, y);
        }
    }

    handleMove(x: number, y: number) {
        if (!this.activeLayerId) return;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return;

        const local = this.toLocal(group, x, y);

        if (this.tool === 'select' && this.selectedShape && this.isInteracting) {
            if (this.selectedShape === group) {
                this.selectedShape.translation.set(x - this.dragOffset.x, y - this.dragOffset.y);
            } else {
                this.selectedShape.translation.set(local.x - this.dragOffset.x, local.y - this.dragOffset.y);
            }
            this.updateSelectionHandles();
        } else if (this.tool === 'brush') {
            if (this.isInteracting && this.currentPath) {
                this.currentPath.vertices.push(new Two.Anchor(local.x, local.y));
            }
        } else if (this.tool === 'pen') {
            this.handlePenMove(local.x, local.y);
        } else if (this.tool === 'shape') {
            this.handleShapeMove(local.x, local.y, x, y);
        }
    }

    handleUp() {
        this.isInteracting = false;
        this.currentPath = null;
        if (this.tool === 'pen') {
            if (this.penInteraction.mode === 'creating' || this.penInteraction.mode !== 'idle') {
                 this.penInteraction.mode = 'idle';
            }
        } else if (this.tool === 'shape') {
            this.handleShapeUp();
        }
    }

    // --- Shape Tool Implementation ---

    handleShapeDown(localX: number, localY: number, group: Two.Group, globalX: number, globalY: number) {
        if (this.settings.shapeMode === 'insert') {
            this.shapeOrigin = { x: localX, y: localY };
            const { shapeType } = this.settings;

            let shape: any;
            if (shapeType === 'rectangle') {
                shape = new Two.Rectangle(localX, localY, 0, 0);
            } else if (shapeType === 'ellipse') {
                shape = new Two.Ellipse(localX, localY, 0, 0);
            } else if (shapeType === 'star') {
                shape = new Two.Star(localX, localY, 0, 0, this.settings.starPoints);
            } else if (shapeType === 'polygon') {
                shape = new Two.Polygon(localX, localY, 0, this.settings.polygonSides);
            } else if (shapeType === 'line') {
                shape = new Two.Line(localX, localY, localX, localY);
            }

            if (shape) {
                shape.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
                shape.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
                shape.linewidth = this.settings.strokeWidth;
                group.add(shape);
                this.tempShape = shape;
            }
        } else if (this.settings.shapeMode === 'build') {
             // Start Build Selection Path
             // Use a temporary overlay group for visual feedback, not added to layer content yet
             if (!this.buildPath) {
                 this.buildPath = new Two.Path([new Two.Anchor(globalX, globalY)], false, true);
                 this.buildPath.linewidth = 2;
                 this.buildPath.dashes = [4, 4];
                 this.buildPath.noFill();
                 
                 // Feedback color based on mode
                 if (this.settings.buildMode === 'subtract') {
                    this.buildPath.stroke = '#FF453A'; // Red for subtract
                 } else {
                    this.buildPath.stroke = '#E67C00'; // Orange for merge
                 }
                 
                 this.two.add(this.buildPath); // Add to scene root, not layer
             }
        }
    }

    handleShapeMove(localX: number, localY: number, globalX: number, globalY: number) {
        if (this.settings.shapeMode === 'insert' && this.tempShape) {
            const dx = localX - this.shapeOrigin.x;
            const dy = localY - this.shapeOrigin.y;
            const dist = Math.hypot(dx, dy);

            if (this.tempShape instanceof Two.Rectangle) {
                this.tempShape.width = Math.abs(dx * 2);
                this.tempShape.height = Math.abs(dy * 2);
                // Apply Corner Radius if Rectangle
                // Note: Two.js properties might vary slightly by version, checking support
                // In Two.js, Rectangle is separate from RoundedRectangle usually, but basic Rectangle doesn't support radius dynamic
                // Actually we should have created RoundedRectangle if radius > 0. 
                // For this prototype, we'll keep it simple. If simple rect, ok.
            } else if (this.tempShape instanceof Two.Ellipse) {
                this.tempShape.width = Math.abs(dx * 2);
                this.tempShape.height = Math.abs(dy * 2);
            } else if (this.tempShape instanceof Two.Star) {
                this.tempShape.innerRadius = dist * this.settings.starInnerRadius;
                this.tempShape.outerRadius = dist;
            } else if (this.tempShape instanceof Two.Polygon) {
                this.tempShape.radius = dist;
            } else if (this.tempShape instanceof Two.Line) {
                this.tempShape.vertices[1].x = localX;
                this.tempShape.vertices[1].y = localY;
            }
        } else if (this.settings.shapeMode === 'build' && this.buildPath) {
             this.buildPath.vertices.push(new Two.Anchor(globalX, globalY));
        }
    }

    handleShapeUp() {
        if (this.settings.shapeMode === 'insert') {
            if (this.tempShape) {
                // If rectangle and corner radius > 0, we might need to swap it for a RoundedRectangle?
                // Two.js doesn't easily swap. For now, we assume standard primitives.
                this.tempShape = null;
            }
        } else if (this.settings.shapeMode === 'build') {
            // Finish selection
            if (this.buildPath) {
                this.performBuildOperation();
                this.buildPath.remove();
                this.buildPath = null;
            }
        }
    }

    
    // --- Pen Tool Implementation ---

    handlePenDown(x: number, y: number, group: Two.Group) {
        const HIT_RADIUS = 12;

        if (this.penPath && this.selectedAnchorIdx !== -1) {
            const v = this.penPath.vertices[this.selectedAnchorIdx];

            if (v) {
                const local = this.toLocal(this.penPath, x, y);
                const lx = v.x + v.controls.left.x;
                const ly = v.y + v.controls.left.y;
                const rx = v.x + v.controls.right.x;
                const ry = v.y + v.controls.right.y;

                if (Math.hypot(local.x - lx, local.y - ly) < HIT_RADIUS) {
                    this.penInteraction = { mode: 'dragging-handle-left', dragStart: {x: local.x, y: local.y}, initialPos: {x: lx, y: ly} };
                    this.updatePenHelpers();
                    return;
                }
                if (Math.hypot(local.x - rx, local.y - ry) < HIT_RADIUS) {
                    this.penInteraction = { mode: 'dragging-handle-right', dragStart: {x: local.x, y: local.y}, initialPos: {x: rx, y: ry} };
                    this.updatePenHelpers();
                    return;
                }
            } else {
                this.updateAnchorSelection(-1);
            }
        }

        if (this.penPath) {
            const local = this.toLocal(this.penPath, x, y);
            for (let i = 0; i < this.penPath.vertices.length; i++) {
                const v = this.penPath.vertices[i];
                if (Math.hypot(local.x - v.x, local.y - v.y) < HIT_RADIUS) {
                    if (i === 0 && this.penPath.vertices.length > 2 && !this.penPath.closed) {
                        this.penPath.closed = true;
                        this.updateAnchorSelection(-1);
                        this.penPath = null;
                        this.cleanupPenHelpers();
                        return;
                    }
                    this.updateAnchorSelection(i);
                    this.penInteraction = { mode: 'dragging-anchor', dragStart: {x: local.x, y: local.y}, initialPos: {x: v.x, y: v.y} };
                    this.updatePenHelpers();
                    return;
                }
            }
        }
        
        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i];
            if (!(child instanceof Two.Path)) continue;
            
            const local = this.toLocal(child, x, y);
            
            for (let j = 0; j < child.vertices.length; j++) {
                const v = child.vertices[j];
                if (Math.hypot(local.x - v.x, local.y - v.y) < HIT_RADIUS) {
                    this.penPath = child;
                    this.updateAnchorSelection(j);
                    this.penInteraction = { mode: 'dragging-anchor', dragStart: {x: local.x, y: local.y}, initialPos: {x: v.x, y: v.y} };
                    this.updatePenHelpers();
                    return;
                }
            }
            
            const vertices = child.vertices;
            const count = child.closed ? vertices.length : vertices.length - 1;
            
            for (let j = 0; j < count; j++) {
                const v1 = vertices[j];
                const v2 = vertices[(j + 1) % vertices.length];
                
                const STEPS = 20;
                for (let k = 0; k <= STEPS; k++) {
                    const t = k / STEPS;
                    const p0 = v1;
                    const p1 = { x: v1.x + v1.controls.right.x, y: v1.y + v1.controls.right.y };
                    const p2 = { x: v2.x + v2.controls.left.x, y: v2.y + v2.controls.left.y };
                    const p3 = v2;
                    
                    const l1 = lerpV(p0, p1, t);
                    const h1 = lerpV(p1, p2, t);
                    const h2 = lerpV(p2, p3, t);
                    const l2 = lerpV(l1, h1, t);
                    const h1_new = lerpV(h1, h2, t);
                    const pos = lerpV(l2, h1_new, t);

                    if (Math.hypot(local.x - pos.x, local.y - pos.y) < HIT_RADIUS) {
                        this.penPath = child;
                        const { newAnchor, newV1Right, newV2Left } = this.splitBezier(v1, v2, t);
                        
                        v1.controls.right.copy(newV1Right);
                        v2.controls.left.copy(newV2Left);
                        
                        this.penPath.vertices.splice(j + 1, 0, newAnchor);
                        
                        this.updateAnchorSelection(j + 1);
                        this.penInteraction = { mode: 'dragging-anchor', dragStart: {x: local.x, y: local.y}, initialPos: {x: newAnchor.x, y: newAnchor.y} };
                        this.updatePenHelpers();
                        return;
                    }
                }
            }
        }

        if (!this.penPath || this.penPath.closed) {
            const path = new Two.Path([], false, true, true);
            path.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : '#000';
            path.linewidth = this.settings.strokeWidth;
            path.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
            path.cap = this.settings.lineCap;
            path.join = this.settings.lineJoin;
            group.add(path);
            this.penPath = path;
            const anchor = new Two.Anchor(x, y, 0,0,0,0, Two.Commands.curve);
            path.vertices.push(anchor);
            this.updateAnchorSelection(0);
            this.penInteraction = { mode: 'creating', dragStart: {x,y}, initialPos: {x,y} };
        } else {
            const local = this.toLocal(this.penPath, x, y);
            const anchor = new Two.Anchor(local.x, local.y, 0,0,0,0, Two.Commands.curve);
            this.penPath.vertices.push(anchor);
            this.updateAnchorSelection(this.penPath.vertices.length - 1);
            this.penInteraction = { mode: 'creating', dragStart: {x: local.x, y: local.y}, initialPos: {x: local.x, y: local.y} };
        }
        this.updatePenHelpers();
    }
    
    handlePenMove(x: number, y: number) {
        if (!this.penPath) return;

        const local = this.toLocal(this.penPath, x, y);
        const handleMode = this.settings.penHandleMode;
        
        if (this.penInteraction.mode === 'creating') {
            const v = this.penPath.vertices[this.selectedAnchorIdx];
            if (v) {
                const dx = local.x - v.x;
                const dy = local.y - v.y;
                v.controls.right.set(dx, dy);
                v.controls.left.set(-dx, -dy);
                this.updatePenHelpers();
            }
        } else if (this.penInteraction.mode !== 'idle') {
            const v = this.penPath.vertices[this.selectedAnchorIdx];
            if (!v) return;

            if (this.penInteraction.mode === 'dragging-anchor') {
                v.x = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x);
                v.y = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y);
            } else if (this.penInteraction.mode === 'dragging-handle-left') {
                const lx = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x);
                const ly = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y);
                const dx = lx - v.x;
                const dy = ly - v.y;
                v.controls.left.set(dx, dy);
                if (handleMode === 'mirrored') {
                    v.controls.right.set(-dx, -dy);
                }
            } else if (this.penInteraction.mode === 'dragging-handle-right') {
                const rx = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x);
                const ry = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y);
                const dx = rx - v.x;
                const dy = ry - v.y;
                v.controls.right.set(dx, dy);
                if (handleMode === 'mirrored') {
                    v.controls.left.set(-dx, -dy);
                }
            }
            this.updatePenHelpers();
        }
    }

    updatePenHelpers() {
        if (this.penHelpers) this.two.remove(this.penHelpers);
        if (!this.penPath || this.tool !== 'pen') return;

        const helpers = new Two.Group();
        this.penHelpers = helpers;
        
        helpers.translation.copy(this.penPath.translation);
        helpers.rotation = this.penPath.rotation;
        helpers.scale = this.penPath.scale;

        this.penPath.vertices.forEach((v, i) => {
            const isSelected = i === this.selectedAnchorIdx;
            
            const c = new Two.Circle(v.x, v.y, isSelected ? 6 : 4);
            c.fill = isSelected ? '#1565C0' : (i === 0 ? '#4CAF50' : '#FFFFFF');
            c.stroke = isSelected ? '#FFFFFF' : '#1565C0';
            c.linewidth = 1.5;
            helpers.add(c);

            if (isSelected) {
                const lx = v.x + v.controls.left.x;
                const ly = v.y + v.controls.left.y;
                const rx = v.x + v.controls.right.x;
                const ry = v.y + v.controls.right.y;
                
                const lineL = new Two.Line(v.x, v.y, lx, ly);
                const lineR = new Two.Line(v.x, v.y, rx, ry);
                lineL.stroke = lineR.stroke = '#1565C0';
                lineL.linewidth = 1;
                lineR.opacity = lineL.opacity = 0.5;
                helpers.add(lineL, lineR);

                const circleL = new Two.Circle(lx, ly, 4);
                const circleR = new Two.Circle(rx, ry, 4);
                circleL.fill = circleR.fill = '#FFFFFF';
                circleL.stroke = circleR.stroke = '#1565C0';
                circleL.linewidth = 1.5;
                helpers.add(circleL, circleR);
            }
        });

        this.two.add(helpers);
    }

    cleanupPenHelpers() {
        if (this.penHelpers) this.two.remove(this.penHelpers);
        this.penHelpers = null;
    }
}

interface StageProps {
  layers: Layer[];
  activeLayerId: string | null;
  activeTool: Tool;
  toolSettings: ToolSettings;
  onToolChange?: (tool: Tool) => void;
  onAnchorSelect?: (isSelected: boolean) => void;
  onSelectionTypeChange?: (type: 'primitive' | 'path' | null) => void;
  onSelectionPropertiesChange?: (properties: Partial<ToolSettings>) => void;
}

export interface StageHandle {
    exportImage: (name: string, format: 'png' | 'svg') => void;
    finishPath: () => void;
    deleteSelectedAnchor: () => void;
    setAnchorSharp: () => void;
    setPathClosed: (closed: boolean) => void;
    flattenSelectedShape: () => void;
    duplicateLayerContent: (originalId: string, newId: string) => void;
}

const Stage = forwardRef<StageHandle, StageProps>(({ 
    layers, 
    activeLayerId,
    activeTool,
    toolSettings,
    onToolChange,
    onAnchorSelect,
    onSelectionTypeChange,
    onSelectionPropertiesChange,
}, ref) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  // Engine Initialization (once on mount)
  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new CanvasEngine(containerRef.current);
    engineRef.current = engine;

    const handleResize = () => {
        if (containerRef.current) {
            engine.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        engine.destroy();
    };
  }, []);

  // --- Real-time Prop Synchronization ---
  useEffect(() => {
    engineRef.current?.updateLayers(layers);
  }, [layers]);

  useEffect(() => {
    engineRef.current?.setActiveLayerId(activeLayerId);
  }, [activeLayerId]);

  useEffect(() => {
    engineRef.current?.setTool(activeTool);
  }, [activeTool]);

  useEffect(() => {
    engineRef.current?.setToolSettings(toolSettings);
  }, [toolSettings]);

  useEffect(() => {
    engineRef.current?.setCallbacks({ onToolChange, onAnchorSelect, onSelectionTypeChange, onSelectionPropertiesChange });
  }, [onToolChange, onAnchorSelect, onSelectionTypeChange, onSelectionPropertiesChange]);


  useImperativeHandle(ref, () => ({
      exportImage: (name: string, format: 'png' | 'svg') => {
          const engine = engineRef.current;
          if (!engine) return;
          if (format === 'png') {
              const link = document.createElement('a');
              link.download = `${name}.png`;
              link.href = engine.two.renderer.domElement.toDataURL('image/png');
              link.click();
          } else if (format === 'svg') {
              const tempDiv = document.createElement('div');
              const svgTwo = new Two({
                  type: Two.Types.svg,
                  width: engine.two.width,
                  height: engine.two.height
              }).appendTo(tempDiv);
      
              engine.groups.forEach((group) => {
                   const clone = (group as any).clone();
                   svgTwo.add(clone);
              });
      
              svgTwo.update();
              
              const svgElem = tempDiv.querySelector('svg');
              if (svgElem) {
                  svgElem.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                  const svgString = svgElem.outerHTML;
                  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `${name}.svg`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
              }
          }
      },
      finishPath: () => {
          engineRef.current?.finishPath();
      },
      deleteSelectedAnchor: () => {
          engineRef.current?.deleteSelectedAnchor();
      },
      setAnchorSharp: () => {
          engineRef.current?.setAnchorSharp();
      },
      setPathClosed: (closed: boolean) => {
          engineRef.current?.setPathClosed(closed);
      },
      flattenSelectedShape: () => {
          engineRef.current?.flattenSelectedShape();
      },
      duplicateLayerContent: (originalId, newId) => {
          engineRef.current?.duplicateLayerContent(originalId, newId);
      }
  }));

  const getLocalCoords = (e: React.PointerEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div 
        ref={containerRef}
        style={{ 
            position: 'relative',
            width: 'clamp(300px, 80vw, 1024px)',
            height: 'clamp(300px, 80vh, 768px)',
            backgroundColor: '#FFFFFF',
            borderRadius: theme.radius['Radius.L'],
            boxShadow: theme.effects['Effect.Shadow.Drop.3'],
            overflow: 'hidden',
            touchAction: 'none',
        }}
        onPointerDown={(e) => {
            e.preventDefault();
            const { x, y } = getLocalCoords(e);
            engineRef.current?.handleDown(x, y);
        }}
        onPointerMove={(e) => {
            e.preventDefault();
            const { x, y } = getLocalCoords(e);
            engineRef.current?.handleMove(x, y);
        }}
        onPointerUp={() => engineRef.current?.handleUp()}
        onPointerLeave={() => engineRef.current?.handleUp()}
    />
  );
});

export default Stage;