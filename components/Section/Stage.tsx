
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Two from 'two.js';
import paper from 'paper';
import { useTheme } from '../../Theme.tsx';
import { Layer, Tool, ToolSettings, SelectedObjectType, ShapeType } from '../../types/index.tsx';

// Helper for Bezier math
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (v1: {x: number, y: number}, v2: {x: number, y: number}, t: number) => ({ x: lerp(v1.x, v2.x, t), y: lerp(v1.y, v2.y, t) });

/**
 * 🛠 Canvas Engine (Decoupled Renderer)
 * Completely isolated from React render cycles. All state is managed internally.
 */
class CanvasEngine {
    two: Two;
    thumbTwo: Two; // Secondary instance for thumbnails
    paperScope: paper.PaperScope;
    groups: Map<string, Two.Group> = new Map();
    activeLayerId: string | null = null;
    tool: Tool = 'select';
    settings!: ToolSettings;
    
    // Callbacks
    onToolChange?: (tool: Tool) => void;
    onAnchorSelect?: (isSelected: boolean) => void;
    onSelectionTypeChange?: (type: SelectedObjectType) => void;
    onSelectionPropertiesChange?: (properties: Partial<ToolSettings>) => void;
    onThumbnailReady?: (id: string, dataUrl: string) => void;
    
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
    
    // Pen tool / Path Editing state
    penPath: Two.Path | null = null;
    selectedAnchorIdx: number = -1;
    penHelpers: Two.Group | null = null;
    penInteraction = { 
        mode: 'idle' as 'idle' | 'dragging-anchor' | 'dragging-handle-left' | 'dragging-handle-right' | 'creating', 
        dragStart: { x: 0, y: 0 }, 
        initialPos: { x: 0, y: 0 } 
    };
    
    // Build Mode State (Shape Builder)
    buildState = {
        isActive: false,
        shards: [] as { twoShape: Two.Path, paperShape: paper.PathItem, id: string, isSelected: boolean }[],
        originalShapes: [] as Two.Shape[], // Flattened list of all consumed shapes (recursive)
        lassoPath: null as Two.Path | null,
        lassoPoints: [] as Two.Anchor[],
        container: null as Two.Group | null, // Group to hold shards
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

        // Thumbnail Generator Instance (Hidden)
        const thumbCanvas = document.createElement('canvas');
        this.thumbTwo = new Two({
            type: Two.Types.canvas,
            width: 100,
            height: 100,
            domElement: thumbCanvas,
            autostart: false
        });

        // Initialize Headless Paper.js Scope for Math
        this.paperScope = new paper.PaperScope();
        const dummyCanvas = document.createElement('canvas');
        this.paperScope.setup(dummyCanvas);
    }
    
    // --- Public API for React ---

    public setTool(tool: Tool) {
        if (this.tool === tool) return;
        
        // Cleanup previous tool states
        this.exitBuildMode();
        this.finishPath();
        
        this.tool = tool;
        this.updateSelectionHandles();

        if (tool === 'select' && this.selectedShape) {
           this.broadcastSelectionType(this.selectedShape);
        } else if (tool !== 'select') {
            if (this.onSelectionTypeChange) this.onSelectionTypeChange(null);
        }
        
        // Enter new tool states
        if (this.tool === 'shape' && this.settings && this.settings.shapeMode === 'build') {
             this.enterBuildMode();
        }
    }

    public setActiveLayerId(id: string | null) {
        this.activeLayerId = id;
        // If we switch layers while in build mode, we need to reset
        if (this.tool === 'shape' && this.settings.shapeMode === 'build') {
            this.enterBuildMode(); // Re-calculate for new layer
        }
    }

    public setToolSettings(settings: ToolSettings) {
        const prevMode = this.settings?.shapeMode;
        this.settings = settings;

        // Handle Build Mode Toggle
        if (this.tool === 'shape') {
            if (settings.shapeMode === 'build' && prevMode !== 'build') {
                this.enterBuildMode();
            } else if (settings.shapeMode !== 'build' && prevMode === 'build') {
                this.exitBuildMode();
            }
        }

        // Apply settings to selection (standard logic)
        if (this.selectedShape) {
            this.applySettingsToShape(this.selectedShape);

            // Apply transform updates from settings
            let transformChanged = false;
            if (settings.selectionX !== undefined && this.selectedShape.translation.x !== settings.selectionX) {
                this.selectedShape.translation.x = settings.selectionX;
                transformChanged = true;
            }
            if (settings.selectionY !== undefined && this.selectedShape.translation.y !== settings.selectionY) {
                this.selectedShape.translation.y = settings.selectionY;
                transformChanged = true;
            }
            if (settings.selectionRotation !== undefined) {
                const newRotationRad = (settings.selectionRotation * Math.PI) / 180;
                // Use a small epsilon for float comparison to avoid unnecessary updates
                if (Math.abs(this.selectedShape.rotation - newRotationRad) > 0.0001) {
                    this.selectedShape.rotation = newRotationRad;
                    transformChanged = true;
                }
            }
            if (settings.selectionScale !== undefined && this.selectedShape.scale !== settings.selectionScale) {
                this.selectedShape.scale = settings.selectionScale;
                transformChanged = true;
            }

            if (transformChanged) {
                this.updateSelectionHandles();
            }
        }

        // Real-time update for pen path
        if (this.penPath) {
            this.applySettingsToShape(this.penPath);
            this.penPath.closed = this.settings.penClosePath;
        }
    }

    public setCallbacks(callbacks: any) {
        this.onToolChange = callbacks.onToolChange;
        this.onAnchorSelect = callbacks.onAnchorSelect;
        this.onSelectionTypeChange = callbacks.onSelectionTypeChange;
        this.onSelectionPropertiesChange = callbacks.onSelectionPropertiesChange;
        this.onThumbnailReady = callbacks.onThumbnailReady;
    }
    
    // Recursive layer update to handle groups
    public updateLayers(layers: Layer[]) {
        const activeIds = new Set<string>();

        const processLayer = (layer: Layer, parent: Two.Group | Two.Scene) => {
            activeIds.add(layer.id);
            
            if (!this.groups.has(layer.id)) {
                const group = new Two.Group();
                group.id = layer.id;
                this.groups.set(layer.id, group);
                parent.add(group);
            }
            
            const group = this.groups.get(layer.id)!;
            // Reparent if needed (handle move between groups)
            if (group.parent !== parent) {
                if (group.parent) group.parent.remove(group);
                parent.add(group);
            }

            group.visible = layer.isVisible;
            group.opacity = layer.opacity;
            group.blendMode = layer.blendMode;
            group.translation.set(layer.x, layer.y);
            group.scale = layer.scale;
            group.rotation = (layer.rotation * Math.PI) / 180;
            
            // Process children
            if (layer.children) {
                layer.children.forEach(child => processLayer(child, group));
            }
        };

        // Re-ordering logic:
        const syncOrder = (items: Layer[], parent: Two.Group | Two.Scene) => {
            // Iterate in reverse for Two.js drawing order (first drawn is bottom)
            for (let i = items.length - 1; i >= 0; i--) {
                const layer = items[i];
                activeIds.add(layer.id);
                
                let group = this.groups.get(layer.id);
                if (!group) {
                    group = new Two.Group();
                    group.id = layer.id;
                    this.groups.set(layer.id, group);
                }
                
                // Ensure correct parent and position (Add moves to end/top)
                parent.add(group);
                
                // Update properties
                group.visible = layer.isVisible;
                group.opacity = layer.opacity;
                group.blendMode = layer.blendMode;
                group.translation.set(layer.x, layer.y);
                group.scale = layer.scale;
                group.rotation = (layer.rotation * Math.PI) / 180;

                // Sync Children
                if (layer.children) {
                    syncOrder(layer.children, group);
                }
            }
        };

        syncOrder(layers, this.two.scene);

        // Cleanup removed layers
        this.groups.forEach((g, id) => {
            if (!activeIds.has(id)) {
                g.remove();
                this.groups.delete(id);
            }
        });

        // Ensure overlays are on top
        if (this.transformGroup) {
            this.two.scene.remove(this.transformGroup);
            this.two.scene.add(this.transformGroup);
        }
        if (this.penHelpers) {
            this.two.scene.remove(this.penHelpers);
            this.two.scene.add(this.penHelpers);
        }
    }

    public generateThumbnail(layerId: string) {
        const group = this.groups.get(layerId);
        if (!group) return;

        // Clone the group to avoid disturbing the main scene
        const clone = (group as any).clone();
        
        // Reset transform for thumbnailing
        clone.translation.set(0, 0);
        clone.scale = 1;
        clone.rotation = 0;
        
        // Setup thumb scene
        this.thumbTwo.clear();
        this.thumbTwo.add(clone);
        
        // Calculate bounds to fit
        const bounds = clone.getBoundingClientRect();
        const maxDim = Math.max(bounds.width, bounds.height);
        const padding = 10;
        
        if (maxDim > 0) {
            const scale = (this.thumbTwo.width - padding) / maxDim;
            clone.scale = scale;
            
            // Center it
            const bbox = clone.getBoundingClientRect();
            const bx = bbox.left + bbox.width / 2;
            const by = bbox.top + bbox.height / 2;
            
            const dx = (this.thumbTwo.width / 2) - bx;
            const dy = (this.thumbTwo.height / 2) - by;
            
            clone.translation.addSelf(new Two.Vector(dx, dy));
        } else {
             // Empty layer
             clone.translation.set(this.thumbTwo.width/2, this.thumbTwo.height/2);
        }
        
        this.thumbTwo.render();
        const dataUrl = this.thumbTwo.renderer.domElement.toDataURL('image/png', 0.5);
        
        if (this.onThumbnailReady) {
            this.onThumbnailReady(layerId, dataUrl);
        }
    }

    // --- Core Methods ---
    
    public destroy() {
        this.two.pause();
        if (this.two.renderer.domElement) {
            this.two.renderer.domElement.remove();
        }
        // Cleanup thumb renderer
        if (this.thumbTwo.renderer.domElement) {
            this.thumbTwo.renderer.domElement.remove();
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
             if (newIdx >= this.penPath.vertices.length) newIdx = this.penPath.vertices.length - 1;
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
        const newGroup = (originalGroup as any).clone();
        newGroup.id = newId;
        this.groups.set(newId, newGroup);
        // Parent logic handled in next updateLayers call, but for immediate consistency:
        if (originalGroup.parent) originalGroup.parent.add(newGroup);
    }
    
    // --- Shape Builder (Build Mode) Logic ---

    // Recursive helper to collect all shapes in a group tree and map them to a common coordinate space (Active Group Space)
    private collectShapes(
        group: Two.Group,
        accum: { twoShape: Two.Shape, paperItem: paper.PathItem }[],
        matrixStack: paper.Matrix = new this.paperScope.Matrix()
    ) {
        // Copy children to avoid issues if children array is modified during iteration (though we don't modify here)
        const children = [...group.children];
        
        children.forEach(child => {
            // Safety: Skip our own UI elements
            if (child === this.buildState.container) return;
            if (child === this.buildState.lassoPath) return;

            if (child instanceof Two.Group) {
                // For a group, we need to append its transform to the stack so its children 
                // are brought into the common space.
                const childMatrix = this.twoMatrixToPaperMatrix(child.matrix);
                const nextMatrix = matrixStack.clone().append(childMatrix);
                this.collectShapes(child, accum, nextMatrix);
            } else if (child instanceof Two.Shape) {
                // For a leaf shape, we flatten it to a path, then transform it
                // 1. Shape Local -> Parent Group (handled by child.matrix)
                // 2. Parent Group -> Root Active Group (handled by matrixStack)
                
                const flattened = this.flattenShape(child, true); // Clone as path
                if (flattened) {
                    // Reset transform on the temp clone to ensure no double-transform 
                    // (We will apply the original shape's matrix manually via Paper.js)
                    flattened.translation.set(0, 0);
                    flattened.rotation = 0;
                    flattened.scale = 1;

                    const pItem = this.twoPathToPaperPath(flattened);
                    
                    const shapeMatrix = this.twoMatrixToPaperMatrix(child.matrix);
                    // Apply Shape's own transform
                    pItem.transform(shapeMatrix);
                    // Apply accumulated transforms up to the root
                    pItem.transform(matrixStack);
                    
                    accum.push({ twoShape: child, paperItem: pItem });
                }
            }
        });
    }

    private enterBuildMode() {
        if (this.buildState.isActive) this.exitBuildMode();
        if (!this.activeLayerId) return;
        const activeGroup = this.groups.get(this.activeLayerId);
        if (!activeGroup) return;

        this.buildState.isActive = true;
        this.buildState.originalShapes = []; // Reset list
        
        // 1. Recursively collect all visible shapes in the active group and convert to Paper items in local space
        const collected: { twoShape: Two.Shape, paperItem: paper.PathItem }[] = [];
        this.collectShapes(activeGroup, collected);
        
        if (collected.length === 0) {
            this.buildState.isActive = false;
            return;
        }

        // Hide original shapes and track them
        collected.forEach(item => {
            item.twoShape.visible = false;
            this.buildState.originalShapes.push(item.twoShape);
        });

        const paperItems = collected.map(c => c.paperItem);

        // 2. Shatter Algorithm: "Cookie Cutter"
        let shards: paper.PathItem[] = [];
        
        if (paperItems.length > 0) {
            shards = [paperItems[0]];
            
            for (let i = 1; i < paperItems.length; i++) {
                const cutter = paperItems[i];
                const nextShards: paper.PathItem[] = [];
                
                shards.forEach(shard => {
                    const intersection = shard.intersect(cutter);
                    const outside = shard.subtract(cutter);
                    
                    if (!intersection.isEmpty()) nextShards.push(intersection);
                    if (!outside.isEmpty()) {
                        if (outside instanceof paper.CompoundPath) {
                            outside.children.forEach(c => nextShards.push(c as paper.PathItem));
                        } else {
                            nextShards.push(outside);
                        }
                    }
                });

                let remainingCutter = cutter;
                shards.forEach(shard => {
                    const diff = remainingCutter.subtract(shard);
                    remainingCutter = diff;
                });
                
                if (!remainingCutter.isEmpty()) {
                     if (remainingCutter instanceof paper.CompoundPath) {
                        remainingCutter.children.forEach(c => nextShards.push(c as paper.PathItem));
                    } else {
                        nextShards.push(remainingCutter);
                    }
                }
                
                shards = nextShards;
            }
        }

        // 3. Create Two.js Visuals for Shards
        // We add the container to the ACTIVE GROUP so shards are rendered in the group's local space
        this.buildState.container = new Two.Group();
        activeGroup.add(this.buildState.container);

        shards.forEach(shard => {
             // Import into the container. Shard coordinates are already in Active Group Space.
             const twoPath = this.importPaperItemToTwo(shard, this.buildState.container!, null);
             if (twoPath) {
                 // Style as "Ghost"
                 twoPath.fill = 'rgba(136, 136, 136, 0.2)'; // Faint fill to show regions
                 twoPath.stroke = '#888888';
                 twoPath.linewidth = 1;
                 
                 this.buildState.shards.push({
                     twoShape: twoPath,
                     paperShape: shard, // Keep ref for boolean ops later
                     id: Math.random().toString(36),
                     isSelected: false
                 });
             }
        });
        
        // Setup Lasso
        this.buildState.lassoPath = new Two.Path([], false, false);
        this.buildState.lassoPath.stroke = this.settings.buildMode === 'add' ? '#1E8E3E' : '#C5221F';
        this.buildState.lassoPath.linewidth = 2;
        this.buildState.lassoPath.dashes = [5, 5];
        this.buildState.lassoPath.noFill();
        this.buildState.container.add(this.buildState.lassoPath); // Add to container so it moves with group
    }

    private exitBuildMode() {
        if (!this.buildState.isActive) return;

        // Restore visibility of original shapes
        this.buildState.originalShapes.forEach(shape => shape.visible = true);

        // Cleanup
        if (this.buildState.container) {
            this.buildState.container.remove(); // Removes from parent (Active Group)
        }
        
        this.buildState.shards = [];
        this.buildState.originalShapes = [];
        this.buildState.lassoPoints = [];
        this.buildState.isActive = false;
    }

    private updateBuildLasso(x: number, y: number) {
        // Points x, y are in Active Group Local Space
        
        // Add point to lasso
        const anchor = new Two.Anchor(x, y);
        this.buildState.lassoPoints.push(anchor);
        this.buildState.lassoPath!.vertices.push(anchor);

        // Hit Test Shards
        const point = new this.paperScope.Point(x, y);
        
        this.buildState.shards.forEach(shard => {
            if (shard.paperShape.contains(point)) {
                if (!shard.isSelected) {
                    shard.isSelected = true;
                    // Visual Feedback
                    if (this.settings.buildMode === 'add') {
                        shard.twoShape.fill = this.settings.fillEnabled ? this.settings.fillColor : '#1E8E3E';
                        shard.twoShape.stroke = this.settings.strokeColor;
                    } else {
                        // Subtract mode: Red
                        shard.twoShape.fill = '#C5221F';
                    }
                    shard.twoShape.opacity = 0.8;
                }
            }
        });
    }

    private finalizeBuild() {
        if (!this.activeLayerId || !this.buildState.isActive) return;
        const activeGroup = this.groups.get(this.activeLayerId);
        if (!activeGroup) return;

        const selectedShards = this.buildState.shards.filter(s => s.isSelected);
        const unselectedShards = this.buildState.shards.filter(s => !s.isSelected);
        
        if (selectedShards.length === 0) {
            this.exitBuildMode();
            return;
        }

        // Process Geometry
        let newPaperItem: paper.Item | null = null;
        
        if (this.settings.buildMode === 'add') {
             if (selectedShards.length > 0) {
                 let union = selectedShards[0].paperShape;
                 for(let i=1; i<selectedShards.length; i++) {
                     union = union.unite(selectedShards[i].paperShape);
                 }
                 newPaperItem = union;
             }
        }

        // Commit Changes to Layer
        // 1. Remove original children permanently
        this.buildState.originalShapes.forEach(c => c.remove());
        
        // 2. Add Unselected Shards as new individual shapes
        // These shards are already in Active Group Space, so we just import them directly.
        unselectedShards.forEach(shard => {
            // Note: shard.paperShape is in Active Group Space.
            const newPath = this.importPaperItemToTwo(shard.paperShape, activeGroup, null);
            if (newPath) {
                newPath.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
                newPath.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'black';
                newPath.linewidth = this.settings.strokeWidth;
            }
        });
        
        // 3. Add the United Shape (if Add mode)
        if (this.settings.buildMode === 'add' && newPaperItem) {
             const newPath = this.importPaperItemToTwo(newPaperItem, activeGroup, null);
             if (newPath) {
                 newPath.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
                 newPath.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'black';
                 newPath.linewidth = this.settings.strokeWidth;
             }
        }
        
        // Reset Build State (forces clean exit without restoring originals since we removed them)
        this.buildState.isActive = false; 
        this.buildState.originalShapes = []; // Clear ref so exitBuildMode doesn't try to restore visibility on removed items
        this.exitBuildMode();
        
        // Trigger thumbnail update for this layer
        if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
    }


    // --- Helper Methods ---

    applySettingsToShape(shape: any) {
        shape.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
        shape.linewidth = this.settings.strokeWidth;
        shape.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
        if ('cap' in shape) (shape as any).cap = this.settings.lineCap;
        if ('join' in shape) (shape as any).join = this.settings.lineJoin;

        // Parametric updates
        if (shape instanceof Two.Star) {
            shape.sides = this.settings.starPoints;
            shape.innerRadius = shape.outerRadius * this.settings.starInnerRadius;
        }
        if (shape instanceof Two.Polygon) shape.sides = this.settings.polygonSides;
        
        if (shape._isRoundedRect && shape._cornerRadius !== this.settings.cornerRadius) {
             shape._cornerRadius = this.settings.cornerRadius;
        }
        this.updateSelectionHandles();
    }

    broadcastSelectionType(shape: any) {
        if (!this.onSelectionTypeChange) return;
        let type: SelectedObjectType = null;
        if ((shape as any)._isRoundedRect) type = 'rectangle';
        else if (shape instanceof Two.Star) type = 'star';
        else if (shape instanceof Two.Polygon) type = 'polygon';
        else if (shape instanceof Two.Ellipse) type = 'ellipse';
        else if (shape instanceof Two.Line) type = 'line';
        else if (shape instanceof Two.Path) type = 'path';
        else if (shape instanceof Two.Rectangle) type = 'rectangle';
        this.onSelectionTypeChange(type);
    }
    
    // --- Primitives to Path (Flatten) ---
    private flattenShape(shape: any, returnOnly = false): Two.Path | null {
        if (shape instanceof Two.Path && !(shape as any)._isRoundedRect) {
             return returnOnly ? (shape as any).clone() : shape;
        }

        const vertices = shape.vertices.map((v: any) => v.clone());
        const path = new Two.Path(vertices, shape.closed, shape.curved, shape.manual);
        
        path.translation.copy(shape.translation);
        path.rotation = shape.rotation;
        path.scale = typeof shape.scale === 'object' ? new Two.Vector(shape.scale.x, shape.scale.y) : shape.scale;
        path.fill = shape.fill;
        path.stroke = shape.stroke;
        path.linewidth = shape.linewidth;
        path.opacity = shape.opacity;
        path.blending = shape.blending;

        if (!returnOnly && this.activeLayerId) {
            const group = this.groups.get(this.activeLayerId);
            if (group) {
                const index = group.children.indexOf(shape);
                shape.remove();
                if (index >= 0) {
                     group.children.splice(index, 0, path);
                     path.parent = group; 
                } else {
                     group.add(path);
                }
            }
        }
        return path;
    }

    public flattenSelectedShape() {
        if (!this.selectedShape) return;
        const newShape = this.flattenShape(this.selectedShape);
        if (newShape) {
            this.selectedShape = newShape;
            this.updateSelectionHandles();
            if (this.onSelectionTypeChange) this.onSelectionTypeChange('path');
            if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
        }
    }
    
    // --- Boolean Operations Bridge ---
    private twoMatrixToPaperMatrix(twoMatrix: Two.Matrix): paper.Matrix {
        const m = twoMatrix.elements;
        // Paper.js Matrix(a, c, b, d, tx, ty) vs Two.js elements [a, b, 0, c, d, 0, tx, ty, 1] (column-major-ish storage)
        // Two.js m[1] is skewY (b in standard affine), m[3] is skewX (c in standard affine).
        // Paper constructor expects: a, c, b, d, tx, ty.
        // So we pass m[3] (c) to the 2nd arg, and m[1] (b) to the 3rd arg.
        return new this.paperScope.Matrix(m[0], m[3], m[1], m[4], m[6], m[7]);
    }

    private twoPathToPaperPath(twoPath: Two.Path): paper.PathItem {
        const path = new this.paperScope.Path({ closed: twoPath.closed });
        twoPath.vertices.forEach(v => {
            const segment = new this.paperScope.Segment(
                new this.paperScope.Point(v.x, v.y),
                new this.paperScope.Point(v.controls?.left?.x || 0, v.controls?.left?.y || 0),
                new this.paperScope.Point(v.controls?.right?.x || 0, v.controls?.right?.y || 0)
            );
            path.add(segment);
        });
        const matrix = this.twoMatrixToPaperMatrix(twoPath.matrix);
        path.transform(matrix);
        return path;
    }

    private importPaperItemToTwo(paperItem: paper.Item, targetGroup: Two.Group, styleSource: Two.Path | null): Two.Path | null {
        const allPaths: paper.Path[] = [];
    
        if (paperItem instanceof this.paperScope.Path) {
            allPaths.push(paperItem);
        } else if (paperItem instanceof this.paperScope.CompoundPath) {
            paperItem.children.forEach(child => {
                if (child instanceof this.paperScope.Path) {
                    allPaths.push(child);
                }
            });
        }
    
        if (allPaths.length === 0) return null;
    
        const combinedVertices: Two.Anchor[] = [];
        allPaths.forEach(pPath => {
            pPath.segments.forEach((segment, index) => {
                const command = index === 0 ? Two.Commands.move : Two.Commands.curve;
                combinedVertices.push(new Two.Anchor(
                    segment.point.x, segment.point.y,
                    segment.handleIn.x, segment.handleIn.y,
                    segment.handleOut.x, segment.handleOut.y,
                    command
                ));
            });
        });
    
        const twoPath = new Two.Path(combinedVertices, allPaths[0].closed, true, true);
    
        if (styleSource) {
            twoPath.fill = styleSource.fill;
            twoPath.stroke = styleSource.stroke;
            twoPath.linewidth = styleSource.linewidth;
            twoPath.opacity = styleSource.opacity;
            twoPath.blending = styleSource.blending;
        }
    
        targetGroup.add(twoPath);
        return twoPath;
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
        rect.noFill(); rect.stroke = '#1565C0'; rect.linewidth = 2;
        group.add(rect);

        const handlePoints = [
            { x: bounds.left - 5, y: bounds.top - 5 }, { x: bounds.right + 5, y: bounds.top - 5 },
            { x: bounds.right + 5, y: bounds.bottom + 5 }, { x: bounds.left - 5, y: bounds.bottom + 5 },
        ];

        handlePoints.forEach(p => {
            const handle = new Two.Circle(p.x, p.y, 5);
            handle.fill = '#FFFFFF'; handle.stroke = '#1565C0'; handle.linewidth = 1;
            group.add(handle);
        });
        this.two.add(group);
    }
    
    toLocal(object: any, x: number, y: number) {
        const dx = x - object.translation.x, dy = y - object.translation.y;
        const cos = Math.cos(-object.rotation), sin = Math.sin(-object.rotation);
        const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
        const scale = typeof object.scale === 'number' ? object.scale : (object.scale.x || 1);
        return { x: rx / scale, y: ry / scale };
    }
    
    splitBezier(v1: Two.Anchor, v2: Two.Anchor, t: number) {
        const p0 = { x: v1.x, y: v1.y }; const p1 = { x: v1.x + v1.controls.right.x, y: v1.y + v1.controls.right.y };
        const p2 = { x: v2.x + v2.controls.left.x, y: v2.y + v2.controls.left.y }; const p3 = { x: v2.x, y: v2.y };
        const l1 = lerpV(p0, p1, t), h1 = lerpV(p1, p2, t), h2 = lerpV(p2, p3, t);
        const l2 = lerpV(l1, h1, t), h1_new = lerpV(h1, h2, t);
        const split = lerpV(l2, h1_new, t);
        const newAnchor = new Two.Anchor(split.x, split.y, l2.x - split.x, l2.y - split.y, h1_new.x - split.x, h1_new.y - split.y, Two.Commands.curve);
        const newV1Right = { x: l1.x - p0.x, y: l1.y - p0.y }, newV2Left = { x: h2.x - p3.x, y: h2.y - p3.y };
        return { newAnchor, newV1Right, newV2Left };
    }

    updateAnchorSelection(index: number) {
        this.selectedAnchorIdx = index;
        if (this.onAnchorSelect) this.onAnchorSelect(index !== -1);
    }

    tryEnterEditMode(x: number, y: number): boolean {
        if (!this.activeLayerId) return false;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return false;
        
        // Recursive hit test needed if we assume groups can contain groups
        // But for editing paths, we usually only care about the immediate children of the Active Layer?
        // Actually, if Active Layer is a group, we should look inside.
        // For simplicity, we only hit test direct children for editing now.
        
        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i];
            if (child instanceof Two.Path) {
                const bounds = child.getBoundingClientRect(true);
                if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                     this.penPath = child;
                     if (this.transformGroup) { this.two.remove(this.transformGroup); this.transformGroup = null; this.selectedShape = null; }
                     if (this.onToolChange) this.onToolChange('pen');
                     this.updatePenHelpers();
                     return true;
                }
            }
        }
        return false;
    }

    handleDown(x: number, y: number) {
        const now = Date.now();
        if (now - this.lastClickTime < 300) {
            if (this.tool === 'pen') { this.finishPath(); this.lastClickTime = 0; return; }
            else if (this.tool === 'select') { if (this.settings.selectionMode === 'vector' && this.tryEnterEditMode(x, y)) { this.lastClickTime = 0; return; } }
        }
        this.lastClickTime = now;

        if (!this.activeLayerId) return;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return;
        const local = this.toLocal(group, x, y);

        // --- Build Mode Interaction ---
        if (this.tool === 'shape' && this.settings.shapeMode === 'build' && this.buildState.isActive) {
             this.isInteracting = true;
             this.buildState.lassoPoints = [];
             this.buildState.lassoPath!.vertices = []; // Clear previous lasso
             // Pass local coordinates relative to the group
             this.updateBuildLasso(local.x, local.y);
             return;
        }

        this.isInteracting = true;

        if (this.tool === 'delete') {
            for (let i = group.children.length - 1; i >= 0; i--) {
                const child = group.children[i]; if (!(child instanceof Two.Shape)) continue;
                const bounds = child.getBoundingClientRect(true);
                if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) { 
                    child.remove(); 
                    if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
                    break; 
                }
            }
        } else if (this.tool === 'select') {
            this.selectedShape = null;
            let found = false;

            for (let i = group.children.length - 1; i >= 0; i--) {
                const child = group.children[i]; if (!(child instanceof Two.Shape)) continue;
                const bounds = child.getBoundingClientRect(true);
                if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                    this.selectedShape = child;
                    this.dragOffset = { x: local.x - child.translation.x, y: local.y - child.translation.y };
                    found = true;
                    this.broadcastSelectionType(child);
                    break;
                }
            }
            if (found && this.selectedShape) {
                if (this.onSelectionPropertiesChange) {
                    const shape = this.selectedShape as any;
                    const stroke = shape.stroke, fill = shape.fill;
                    const strokeIsTransparent = stroke === 'transparent', fillIsTransparent = fill === 'transparent';
                    const strokeColorStr = !strokeIsTransparent && typeof stroke === 'object' && 'toHexString' in stroke ? (stroke as any).toHexString() : typeof stroke === 'string' ? stroke : this.settings.strokeColor;
                    const fillColorStr = !fillIsTransparent && typeof fill === 'object' && 'toHexString' in fill ? (fill as any).toHexString() : typeof fill === 'string' ? fill : this.settings.fillColor;
                    
                    const propsToUpdate: Partial<ToolSettings> = {
                        strokeEnabled: !strokeIsTransparent, strokeColor: strokeIsTransparent ? this.settings.strokeColor : strokeColorStr,
                        fillEnabled: !fillIsTransparent, fillColor: fillIsTransparent ? this.settings.fillColor : fillColorStr,
                        strokeWidth: shape.linewidth, lineCap: 'cap' in shape ? shape.cap : this.settings.lineCap, lineJoin: 'join' in shape ? shape.join : this.settings.lineJoin,
                        // Add transform properties
                        selectionX: shape.translation.x,
                        selectionY: shape.translation.y,
                        selectionRotation: (shape.rotation * 180) / Math.PI,
                        selectionScale: typeof shape.scale === 'number' ? shape.scale : shape.scale.x, // Assuming uniform scale
                    };

                    if ((shape as any)._isRoundedRect) { propsToUpdate.cornerRadius = (shape as any)._cornerRadius; }
                    if (shape instanceof Two.Star) { propsToUpdate.starPoints = shape.sides; propsToUpdate.starInnerRadius = shape.outerRadius > 0 ? shape.innerRadius / shape.outerRadius : 0.5; }
                    if (shape instanceof Two.Polygon) { propsToUpdate.polygonSides = shape.sides; }
                    this.onSelectionPropertiesChange(propsToUpdate);
                }
            } else { 
                this.selectedShape = null; 
                if (this.onSelectionTypeChange) this.onSelectionTypeChange(null);
            }

            this.updateSelectionHandles();

        } else if (this.tool === 'pen') { this.handlePenDown(local.x, local.y, group);
        } else if (this.tool === 'brush') {
            const path = new Two.Path([new Two.Anchor(local.x, local.y)], false, true);
            path.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
            path.linewidth = this.settings.strokeWidth;
            path.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
            path.cap = this.settings.lineCap; path.join = this.settings.lineJoin;
            group.add(path); this.currentPath = path;
        } else if (this.tool === 'shape') { this.handleShapeDown(local.x, local.y, group, x, y); }
    }

    handleMove(x: number, y: number) {
        if (!this.activeLayerId) return;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return;
        const local = this.toLocal(group, x, y);

        // --- Build Mode Interaction ---
        if (this.tool === 'shape' && this.settings.shapeMode === 'build' && this.buildState.isActive && this.isInteracting) {
            this.updateBuildLasso(local.x, local.y);
            return;
        }

        if (this.tool === 'select' && this.selectedShape && this.isInteracting) {
            this.selectedShape.translation.set(local.x - this.dragOffset.x, local.y - this.dragOffset.y);
            this.updateSelectionHandles();
            if (this.onSelectionPropertiesChange) {
                this.onSelectionPropertiesChange({
                    selectionX: this.selectedShape.translation.x,
                    selectionY: this.selectedShape.translation.y,
                });
            }
        } else if (this.tool === 'brush') {
            if (this.isInteracting && this.currentPath) this.currentPath.vertices.push(new Two.Anchor(local.x, local.y));
        } else if (this.tool === 'pen') { this.handlePenMove(local.x, local.y);
        } else if (this.tool === 'shape') { this.handleShapeMove(local.x, local.y, x, y); }
    }

    handleUp() {
        // --- Build Mode Interaction ---
        if (this.tool === 'shape' && this.settings.shapeMode === 'build' && this.buildState.isActive && this.isInteracting) {
             this.finalizeBuild();
             this.buildState.lassoPath!.vertices = []; // Reset Lasso visual
             this.buildState.lassoPoints = [];
             this.enterBuildMode(); // Re-enter to analyze new geometry for next action
        }

        if (this.isInteracting && this.activeLayerId) {
            this.generateThumbnail(this.activeLayerId);
        }

        this.isInteracting = false; this.currentPath = null;
        if (this.tool === 'pen') { if (this.penInteraction.mode === 'creating' || this.penInteraction.mode !== 'idle') { this.penInteraction.mode = 'idle'; }
        } else if (this.tool === 'shape') { this.handleShapeUp(); }
    }

    handleShapeDown(localX: number, localY: number, group: Two.Group, globalX: number, globalY: number) {
        if (this.settings.shapeMode === 'build') return; // Handled separately now

        this.shapeOrigin = { x: localX, y: localY };
        const { shapeType } = this.settings;
        let shape: any;
        if (shapeType === 'rectangle') {
            shape = new Two.Group(); this.tempShape = shape; group.add(shape);
            this.handleShapeMove(localX, localY, globalX, globalY); return;
        } else if (shapeType === 'ellipse') { shape = new Two.Ellipse(localX, localY, 0, 0);
        } else if (shapeType === 'star') { shape = new Two.Star(localX, localY, 0, 0, this.settings.starPoints);
        } else if (shapeType === 'polygon') { shape = new Two.Polygon(localX, localY, 0, this.settings.polygonSides);
        } else if (shapeType === 'line') { shape = new Two.Line(localX, localY, localX, localY); }

        if (shape) {
            shape.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
            shape.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
            shape.linewidth = this.settings.strokeWidth;
            group.add(shape); this.tempShape = shape;
        }
    }

    handleShapeMove(localX: number, localY: number, globalX: number, globalY: number) {
        if (!this.tempShape) return;
        if (this.settings.shapeMode === 'build') return;

        // Line tool has its own corner-to-corner logic, handle it separately.
        if (this.tempShape instanceof Two.Line) {
            this.tempShape.vertices[1].x = localX;
            this.tempShape.vertices[1].y = localY;
            return;
        }
        
        const width = Math.abs(localX - this.shapeOrigin.x);
        const height = Math.abs(localY - this.shapeOrigin.y);
        const centerX = (localX + this.shapeOrigin.x) / 2;
        const centerY = (localY + this.shapeOrigin.y) / 2;

        if (this.tempShape instanceof Two.Group && this.settings.shapeType === 'rectangle') {
            const radius = this.settings.cornerRadius;
            this.tempShape.remove(this.tempShape.children);
            const rectPath = this.two.makeRoundedRectangle(centerX, centerY, width, height, radius);
            rectPath.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
            rectPath.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
            rectPath.linewidth = this.settings.strokeWidth;
            (rectPath as any)._isRoundedRect = true;
            (rectPath as any)._cornerRadius = radius;
            this.tempShape.add(rectPath);
            return; 
        }

        this.tempShape.translation.set(centerX, centerY);
        const radius = Math.hypot(width, height) / 2;

        if (this.tempShape instanceof Two.Ellipse) {
            this.tempShape.width = width;
            this.tempShape.height = height;
        } else if (this.tempShape instanceof Two.Star) {
            this.tempShape.outerRadius = radius;
            this.tempShape.innerRadius = radius * this.settings.starInnerRadius;
            this.tempShape.sides = this.settings.starPoints;
        } else if (this.tempShape instanceof Two.Polygon) {
            this.tempShape.radius = radius;
            this.tempShape.sides = this.settings.polygonSides;
        }
    }

    handleShapeUp() {
        if (!this.tempShape) return;
        if (this.settings.shapeMode === 'build') { this.tempShape = null; return; }

        if (this.tempShape instanceof Two.Group && this.settings.shapeType === 'rectangle') {
            const finalPath = this.tempShape.children[0];
            if (finalPath && this.activeLayerId) {
                this.tempShape.remove(finalPath);
                const group = this.groups.get(this.activeLayerId);
                if (group) group.add(finalPath);
            }
            this.tempShape.remove();
        }
        this.tempShape = null;
    }

    handlePenDown(x: number, y: number, group: Two.Group) {
        const HIT_RADIUS = 12;
        if (this.penPath && this.selectedAnchorIdx !== -1) {
            const v = this.penPath.vertices[this.selectedAnchorIdx];
            if (v) {
                const local = this.toLocal(this.penPath, x, y);
                const lx = v.x + v.controls.left.x, ly = v.y + v.controls.left.y;
                const rx = v.x + v.controls.right.x, ry = v.y + v.controls.right.y;
                if (Math.hypot(local.x - lx, local.y - ly) < HIT_RADIUS) { this.penInteraction = { mode: 'dragging-handle-left', dragStart: {x: local.x, y: local.y}, initialPos: {x: lx, y: ly} }; this.updatePenHelpers(); return; }
                if (Math.hypot(local.x - rx, local.y - ry) < HIT_RADIUS) { this.penInteraction = { mode: 'dragging-handle-right', dragStart: {x: local.x, y: local.y}, initialPos: {x: rx, y: ry} }; this.updatePenHelpers(); return; }
            } else { this.updateAnchorSelection(-1); }
        }
        if (this.penPath) {
            const local = this.toLocal(this.penPath, x, y);
            for (let i = 0; i < this.penPath.vertices.length; i++) {
                const v = this.penPath.vertices[i];
                if (Math.hypot(local.x - v.x, local.y - v.y) < HIT_RADIUS) {
                    if (i === 0 && this.penPath.vertices.length > 2 && !this.penPath.closed) { this.penPath.closed = true; this.updateAnchorSelection(-1); this.penPath = null; this.cleanupPenHelpers(); return; }
                    this.updateAnchorSelection(i); this.penInteraction = { mode: 'dragging-anchor', dragStart: {x: local.x, y: local.y}, initialPos: {x: v.x, y: v.y} }; this.updatePenHelpers(); return;
                }
            }
        }
        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i]; if (!(child instanceof Two.Path)) continue;
            const local = this.toLocal(child, x, y);
            for (let j = 0; j < child.vertices.length; j++) {
                const v = child.vertices[j]; if (Math.hypot(local.x - v.x, local.y - v.y) < HIT_RADIUS) {
                    this.penPath = child; this.updateAnchorSelection(j); this.penInteraction = { mode: 'dragging-anchor', dragStart: {x: local.x, y: local.y}, initialPos: {x: v.x, y: v.y} }; this.updatePenHelpers(); return;
                }
            }
            const vertices = child.vertices; const count = child.closed ? vertices.length : vertices.length - 1;
            for (let j = 0; j < count; j++) {
                const v1 = vertices[j], v2 = vertices[(j + 1) % vertices.length];
                for (let k = 0; k <= 20; k++) {
                    const t = k / 20;
                    const p1 = { x: v1.x + v1.controls.right.x, y: v1.y + v1.controls.right.y };
                    const p2 = { x: v2.x + v2.controls.left.x, y: v2.y + v2.controls.left.y };
                    const a = lerpV(v1, p1, t), b = lerpV(p1, p2, t), c = lerpV(p2, v2, t);
                    const d = lerpV(a, b, t), e = lerpV(b, c, t);
                    const pos = lerpV(d, e, t);
                    if (Math.hypot(local.x - pos.x, local.y - pos.y) < HIT_RADIUS) {
                        this.penPath = child; const { newAnchor, newV1Right, newV2Left } = this.splitBezier(v1, v2, t);
                        v1.controls.right.copy(newV1Right); v2.controls.left.copy(newV2Left);
                        this.penPath.vertices.splice(j + 1, 0, newAnchor); this.updateAnchorSelection(j + 1);
                        this.penInteraction = { mode: 'dragging-anchor', dragStart: {x: local.x, y: local.y}, initialPos: {x: newAnchor.x, y: newAnchor.y} }; this.updatePenHelpers(); return;
                    }
                }
            }
        }
        if (!this.penPath || this.penPath.closed) {
            const path = new Two.Path([], false, true, true);
            path.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : '#000'; path.linewidth = this.settings.strokeWidth; path.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
            path.cap = this.settings.lineCap; path.join = this.settings.lineJoin; group.add(path); this.penPath = path;
            const anchor = new Two.Anchor(x, y, 0,0,0,0, Two.Commands.curve); path.vertices.push(anchor); this.updateAnchorSelection(0); this.penInteraction = { mode: 'creating', dragStart: {x,y}, initialPos: {x,y} };
        } else {
            const local = this.toLocal(this.penPath, x, y);
            const anchor = new Two.Anchor(local.x, local.y, 0,0,0,0, Two.Commands.curve); this.penPath.vertices.push(anchor); this.updateAnchorSelection(this.penPath.vertices.length - 1);
            this.penInteraction = { mode: 'creating', dragStart: {x: local.x, y: local.y}, initialPos: {x: local.x, y: local.y} };
        }
        this.updatePenHelpers();
    }
    
    handlePenMove(x: number, y: number) {
        if (!this.penPath) return;
        const local = this.toLocal(this.penPath, x, y); const handleMode = this.settings.penHandleMode;
        if (this.penInteraction.mode === 'creating') {
            const v = this.penPath.vertices[this.selectedAnchorIdx];
            if (v) { const dx = local.x - v.x, dy = local.y - v.y; v.controls.right.set(dx, dy); v.controls.left.set(-dx, -dy); this.updatePenHelpers(); }
        } else if (this.penInteraction.mode !== 'idle') {
            const v = this.penPath.vertices[this.selectedAnchorIdx]; if (!v) return;
            if (this.penInteraction.mode === 'dragging-anchor') { v.x = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x); v.y = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y);
            } else if (this.penInteraction.mode === 'dragging-handle-left') {
                const lx = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x), ly = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y);
                const dx = lx - v.x, dy = ly - v.y; v.controls.left.set(dx, dy); if (handleMode === 'mirrored') v.controls.right.set(-dx, -dy);
            } else if (this.penInteraction.mode === 'dragging-handle-right') {
                const rx = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x), ry = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y);
                const dx = rx - v.x, dy = ry - v.y; v.controls.right.set(dx, dy); if (handleMode === 'mirrored') v.controls.left.set(-dx, -dy);
            }
            this.updatePenHelpers();
        }
    }

    updatePenHelpers() {
        if (this.penHelpers) this.two.remove(this.penHelpers); if (!this.penPath || this.tool !== 'pen') return;
        const helpers = new Two.Group(); this.penHelpers = helpers;
        helpers.translation.copy(this.penPath.translation); helpers.rotation = this.penPath.rotation; helpers.scale = this.penPath.scale;
        this.penPath.vertices.forEach((v, i) => {
            const isSelected = i === this.selectedAnchorIdx;
            const c = new Two.Circle(v.x, v.y, isSelected ? 6 : 4); c.fill = isSelected ? '#1565C0' : (i === 0 ? '#4CAF50' : '#FFFFFF'); c.stroke = isSelected ? '#FFFFFF' : '#1565C0'; c.linewidth = 1.5; helpers.add(c);
            if (isSelected) {
                const lx = v.x + v.controls.left.x, ly = v.y + v.controls.left.y, rx = v.x + v.controls.right.x, ry = v.y + v.controls.right.y;
                const lineL = new Two.Line(v.x, v.y, lx, ly), lineR = new Two.Line(v.x, v.y, rx, ry); lineL.stroke = lineR.stroke = '#1565C0'; lineL.linewidth = 1; lineR.opacity = lineL.opacity = 0.5; helpers.add(lineL, lineR);
                const circleL = new Two.Circle(lx, ly, 4), circleR = new Two.Circle(rx, ry, 4); circleL.fill = circleR.fill = '#FFFFFF'; circleL.stroke = circleR.stroke = '#1565C0'; circleL.linewidth = 1.5; helpers.add(circleL, circleR);
            }
        });
        this.two.add(helpers);
    }
    cleanupPenHelpers() { if (this.penHelpers) this.two.remove(this.penHelpers); this.penHelpers = null; }
}

interface StageProps {
  layers: Layer[];
  activeLayerId: string | null;
  activeTool: Tool;
  toolSettings: ToolSettings;
  onToolChange?: (tool: Tool) => void;
  onAnchorSelect?: (isSelected: boolean) => void;
  onSelectionTypeChange?: (type: SelectedObjectType) => void;
  onSelectionPropertiesChange?: (properties: Partial<ToolSettings>) => void;
  onThumbnailReady?: (id: string, dataUrl: string) => void;
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
    onThumbnailReady,
}, ref) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new CanvasEngine(containerRef.current);
    engineRef.current = engine;
    const handleResize = () => { if (containerRef.current) engine.resize(containerRef.current.clientWidth, containerRef.current.clientHeight); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); engine.destroy(); };
  }, []);

  useEffect(() => { engineRef.current?.updateLayers(layers); }, [layers]);
  useEffect(() => { engineRef.current?.setActiveLayerId(activeLayerId); }, [activeLayerId]);
  useEffect(() => { engineRef.current?.setTool(activeTool); }, [activeTool]);
  useEffect(() => { engineRef.current?.setToolSettings(toolSettings); }, [toolSettings]);
  useEffect(() => { engineRef.current?.setCallbacks({ onToolChange, onAnchorSelect, onSelectionTypeChange, onSelectionPropertiesChange, onThumbnailReady }); }, [onToolChange, onAnchorSelect, onSelectionTypeChange, onSelectionPropertiesChange, onThumbnailReady]);

  useImperativeHandle(ref, () => ({
      exportImage: (name, format) => {
          const engine = engineRef.current; if (!engine) return;
          if (format === 'png') {
              const link = document.createElement('a'); link.download = `${name}.png`; link.href = engine.two.renderer.domElement.toDataURL('image/png'); link.click();
          } else if (format === 'svg') {
              const tempDiv = document.createElement('div');
              const svgTwo = new Two({ type: Two.Types.svg, width: engine.two.width, height: engine.two.height }).appendTo(tempDiv);
              engine.groups.forEach((group) => { svgTwo.add((group as any).clone()); });
              svgTwo.update();
              const svgElem = tempDiv.querySelector('svg');
              if (svgElem) {
                  svgElem.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                  const blob = new Blob([svgElem.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(blob); const link = document.createElement('a');
                  link.href = url; link.download = `${name}.svg`; document.body.appendChild(link);
                  link.click(); document.body.removeChild(link);
              }
          }
      },
      finishPath: () => engineRef.current?.finishPath(),
      deleteSelectedAnchor: () => engineRef.current?.deleteSelectedAnchor(),
      setAnchorSharp: () => engineRef.current?.setAnchorSharp(),
      setPathClosed: (closed) => engineRef.current?.setPathClosed(closed),
      flattenSelectedShape: () => engineRef.current?.flattenSelectedShape(),
      duplicateLayerContent: (originalId, newId) => engineRef.current?.duplicateLayerContent(originalId, newId),
  }));

  const getLocalCoords = (e: React.PointerEvent) => { const rect = containerRef.current!.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };

  return (
    <div 
        ref={containerRef}
        style={{ position: 'relative', width: 'clamp(300px, 80vw, 1024px)', height: 'clamp(300px, 80vh, 768px)', backgroundColor: '#FFFFFF', borderRadius: theme.radius['Radius.L'], boxShadow: theme.effects['Effect.Shadow.Drop.3'], overflow: 'hidden', touchAction: 'none' }}
        onPointerDown={(e) => { e.preventDefault(); const { x, y } = getLocalCoords(e); engineRef.current?.handleDown(x, y); }}
        onPointerMove={(e) => { e.preventDefault(); const { x, y } = getLocalCoords(e); engineRef.current?.handleMove(x, y); }}
        onPointerUp={() => engineRef.current?.handleUp()}
        onPointerLeave={() => engineRef.current?.handleUp()}
    />
  );
});

export default Stage;
