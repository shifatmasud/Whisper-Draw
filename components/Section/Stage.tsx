
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Two from 'two.js';
import { useTheme } from '../../Theme.tsx';
import { Layer, Tool, ToolSettings } from '../../types/index.tsx';

// Helper for Bezier math
const distSq = (p1: {x: number, y: number}, p2: {x: number, y: number}) => 
    (p1.x - p2.x)**2 + (p1.y - p2.y)**2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (v1: {x: number, y: number}, v2: {x: number, y: number}, t: number) => ({ x: lerp(v1.x, v2.x, t), y: lerp(v1.y, v2.y, t) });

/**
 * 🛠 Canvas Engine (Decoupled Renderer)
 * Completely isolated from React render cycles.
 * Enhanced with non-destructive path editing capabilities.
 */
class CanvasEngine {
    two: Two;
    groups: Map<string, Two.Group> = new Map();
    activeLayerId: string | null = null;
    tool: Tool = 'select';
    settings: ToolSettings;
    onToolChange?: (tool: Tool) => void;
    onAnchorSelect?: (isSelected: boolean) => void;
    
    // Selection & Transform State
    selectedShape: Two.Shape | null = null;
    transformGroup: Two.Group | null = null;
    
    // Interaction state
    isInteracting = false;
    dragOffset = { x: 0, y: 0 };
    currentPath: Two.Path | null = null;
    
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

    constructor(container: HTMLElement, settings: ToolSettings) {
        this.two = new Two({
            type: Two.Types.canvas,
            width: container.clientWidth,
            height: container.clientHeight,
            autostart: true,
        }).appendTo(container);
        this.settings = settings;
    }

    destroy() {
        this.two.pause();
        this.two.renderer.domElement.remove();
    }

    resize(width: number, height: number) {
        this.two.width = width;
        this.two.height = height;
        this.two.renderer.setSize(width, height);
    }

    updateLayers(layers: Layer[]) {
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
            // Two.js blending mapping could be added here if supported by the renderer
            // e.g. ctx.globalCompositeOperation = layer.blendMode;
        });

        const activeIds = new Set(layers.map(l => l.id));
        this.groups.forEach((g, id) => {
            if (!activeIds.has(id)) {
                this.two.remove(g);
                this.groups.delete(id);
            }
        });

        // Reorder groups based on layers array (bottom to top for painting)
        layers.forEach((l, index) => {
            const g = this.groups.get(l.id)!;
            // Z-index hack for Two.js: remove and add re-appends to end of list
            this.two.scene.remove(g);
            this.two.scene.add(g);
        });

        // Ensure overlays are always on top
        if (this.transformGroup) {
            this.two.scene.remove(this.transformGroup);
            this.two.scene.add(this.transformGroup);
        }
        if (this.penHelpers) {
            this.two.scene.remove(this.penHelpers);
            this.two.scene.add(this.penHelpers);
        }
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

    // Transform global stage coordinates to local shape coordinates
    toLocal(path: Two.Path, x: number, y: number) {
        // Simple inverse transform assuming uniform scale and translation
        // Robust implementation would invert the matrix
        const dx = x - path.translation.x;
        const dy = y - path.translation.y;
        // Rotation support
        const cos = Math.cos(-path.rotation);
        const sin = Math.sin(-path.rotation);
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        // Scale support
        return { x: rx / path.scale, y: ry / path.scale };
    }

    // Helper: Split bezier at t
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

        const split = { x: lerp(l2.x, h1_new.x, t), y: lerp(l2.y, h1_new.y, t) };

        // New Anchor
        const newAnchor = new Two.Anchor(split.x, split.y, 0, 0, 0, 0, Two.Commands.curve);
        newAnchor.controls.left.x = l2.x - split.x;
        newAnchor.controls.left.y = l2.y - split.y;
        newAnchor.controls.right.x = h1_new.x - split.x;
        newAnchor.controls.right.y = h1_new.y - split.y;

        // Update previous anchor right control
        const newV1Right = { x: l1.x - p0.x, y: l1.y - p0.y };
        
        // Update next anchor left control
        const newV2Left = { x: h2.x - p3.x, y: h2.y - p3.y };

        return { newAnchor, newV1Right, newV2Left };
    }

    updateAnchorSelection(index: number) {
        this.selectedAnchorIdx = index;
        if (this.onAnchorSelect) {
            this.onAnchorSelect(index !== -1);
        }
    }

    finishPath() {
        this.penPath = null;
        this.updateAnchorSelection(-1);
        this.cleanupPenHelpers();
        this.penInteraction.mode = 'idle';
    }

    deleteSelectedAnchor() {
        if (!this.penPath || this.selectedAnchorIdx === -1) return;
        
        this.penPath.vertices.splice(this.selectedAnchorIdx, 1);
        
        if (this.penPath.vertices.length === 0) {
            this.penPath.remove();
            this.penPath = null;
            this.finishPath();
        } else {
             // Re-select nearest index
             let newIdx = this.selectedAnchorIdx;
             if (newIdx >= this.penPath.vertices.length) {
                 newIdx = this.penPath.vertices.length - 1;
             }
             this.updateAnchorSelection(newIdx);
             this.updatePenHelpers();
        }
    }

    tryEnterEditMode(x: number, y: number): boolean {
        if (!this.activeLayerId) return false;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return false;

        // Iterate backwards (top to bottom)
        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i];
            if (child instanceof Two.Path) {
                const bounds = child.getBoundingClientRect(true);
                // Simple bounding box check
                if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                     // Found a path to edit
                     this.penPath = child;
                     // Deselect current selection if any
                     if (this.transformGroup) {
                         this.two.remove(this.transformGroup);
                         this.transformGroup = null;
                         this.selectedShape = null;
                     }
                     
                     // Trigger tool switch
                     if (this.onToolChange) {
                         this.onToolChange('pen');
                     }
                     // Show helpers immediately
                     this.updatePenHelpers();
                     return true;
                }
            }
        }
        return false;
    }

    handleDown(x: number, y: number) {
        // Double Click Detection
        const now = Date.now();
        if (now - this.lastClickTime < 300) {
            if (this.tool === 'pen') {
                // Double Tap in Pen mode: Finish path
                this.finishPath();
                this.lastClickTime = 0; // Reset
                return;
            } else if (this.tool === 'select') {
                // Double Tap in Select mode: Enter Edit Path
                if (this.tryEnterEditMode(x, y)) {
                    this.lastClickTime = 0;
                    return;
                }
            }
        }
        this.lastClickTime = now;

        if (!this.activeLayerId) return;
        const group = this.groups.get(this.activeLayerId);
        if (!group) return;

        this.isInteracting = true;

        if (this.tool === 'select') {
            this.selectedShape = null;
            for (let i = group.children.length - 1; i >= 0; i--) {
                const child = group.children[i];
                if (!(child instanceof Two.Shape)) continue;
                
                const bounds = child.getBoundingClientRect(true);
                if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                    this.selectedShape = child;
                    this.dragOffset = { x: x - child.translation.x, y: y - child.translation.y };
                    break;
                }
            }
            this.updateSelectionHandles();
        } else if (this.tool === 'pen') {
            this.handlePenDown(x, y, group);
        } else if (this.tool === 'brush' || this.tool === 'eraser') {
            const path = new Two.Path([new Two.Anchor(x, y)], false, true);
            if (this.tool === 'eraser') {
                path.noFill();
                path.stroke = '#ffffff';
                path.linewidth = this.settings.strokeWidth;
                path.globalCompositeOperation = 'destination-out';
            } else {
                path.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
                path.linewidth = this.settings.strokeWidth;
                path.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
                path.cap = this.settings.lineCap;
                path.join = this.settings.lineJoin;
            }
            group.add(path);
            this.currentPath = path;
        }
    }

    handleMove(x: number, y: number) {
        if (this.tool === 'select' && this.selectedShape && this.isInteracting) {
            this.selectedShape.translation.set(x - this.dragOffset.x, y - this.dragOffset.y);
            this.updateSelectionHandles();
        } else if (this.tool === 'brush' || this.tool === 'eraser') {
            if (this.isInteracting && this.currentPath) {
                this.currentPath.vertices.push(new Two.Anchor(x, y));
            }
        } else if (this.tool === 'pen') {
            this.handlePenMove(x, y);
        }
    }

    handleUp() {
        this.isInteracting = false;
        this.currentPath = null;
        if (this.tool === 'pen') {
            if (this.penInteraction.mode === 'creating') {
                 // Finish creating state, but keep path active
                 this.penInteraction.mode = 'idle';
            } else if (this.penInteraction.mode !== 'idle') {
                this.penInteraction.mode = 'idle';
            }
        }
    }

    handlePenDown(x: number, y: number, group: Two.Group) {
        const HIT_RADIUS = 12;

        // 1. Check handles of selected anchor first
        if (this.penPath && this.selectedAnchorIdx !== -1) {
            const local = this.toLocal(this.penPath, x, y);
            const v = this.penPath.vertices[this.selectedAnchorIdx];
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
        }

        // 2. Check all anchors of current path
        if (this.penPath) {
            const local = this.toLocal(this.penPath, x, y);
            for (let i = 0; i < this.penPath.vertices.length; i++) {
                const v = this.penPath.vertices[i];
                if (Math.hypot(local.x - v.x, local.y - v.y) < HIT_RADIUS) {
                    if (i === 0 && this.penPath.vertices.length > 2 && !this.penPath.closed) {
                        this.penPath.closed = true;
                        this.updateAnchorSelection(-1); // Deselect on close
                        this.penPath = null; // Finish editing
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

        // 3. Try to pick up another path by its anchors OR Insert Point on Segment
        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i];
            if (!(child instanceof Two.Path)) continue;
            
            const local = this.toLocal(child, x, y);

            // 3a. Check anchors
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

            // 3b. Check Segments (Insert)
            // Iterate segments
            const vertices = child.vertices;
            const count = child.closed ? vertices.length : vertices.length - 1;
            
            for (let j = 0; j < count; j++) {
                const v1 = vertices[j];
                const v2 = vertices[(j + 1) % vertices.length];
                
                // Sample 20 points per segment for hit testing
                const STEPS = 20;
                for (let k = 0; k <= STEPS; k++) {
                    const t = k / STEPS;
                    // Simple cubic bezier sample
                    const p0 = v1;
                    const p1 = { x: v1.x + v1.controls.right.x, y: v1.y + v1.controls.right.y };
                    const p2 = { x: v2.x + v2.controls.left.x, y: v2.y + v2.controls.left.y };
                    const p3 = v2;
                    
                    // De Casteljau point eval
                    const l1 = lerpV(p0, p1, t);
                    const h1 = lerpV(p1, p2, t);
                    const h2 = lerpV(p2, p3, t);
                    const l2 = lerpV(l1, h1, t);
                    const h1_new = lerpV(h1, h2, t);
                    const pos = lerpV(l2, h1_new, t);

                    if (Math.hypot(local.x - pos.x, local.y - pos.y) < HIT_RADIUS) {
                        // Found a hit on segment! Split and Insert.
                        this.penPath = child;
                        const { newAnchor, newV1Right, newV2Left } = this.splitBezier(v1, v2, t);
                        
                        // Apply split
                        v1.controls.right.copy(newV1Right);
                        v2.controls.left.copy(newV2Left);
                        
                        // Insert
                        this.penPath.vertices.splice(j + 1, 0, newAnchor);
                        
                        this.updateAnchorSelection(j + 1);
                        this.penInteraction = { mode: 'dragging-anchor', dragStart: {x: local.x, y: local.y}, initialPos: {x: newAnchor.x, y: newAnchor.y} };
                        this.updatePenHelpers();
                        return;
                    }
                }
            }
        }

        // 4. Create new path or add point
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
            // Transform back to local space of penPath if it moved (though new path usually hasn't)
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
        
        // Visual feedback when creating (drag out handles)
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
                v.controls.right.set(-dx, -dy); // Symmetric
            } else if (this.penInteraction.mode === 'dragging-handle-right') {
                const rx = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x);
                const ry = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y);
                const dx = rx - v.x;
                const dy = ry - v.y;
                v.controls.right.set(dx, dy);
                v.controls.left.set(-dx, -dy); // Symmetric
            }
            this.updatePenHelpers();
        }
    }

    updatePenHelpers() {
        if (this.penHelpers) this.two.remove(this.penHelpers);
        if (!this.penPath || this.tool !== 'pen') return;

        const helpers = new Two.Group();
        this.penHelpers = helpers;
        
        // Transform helpers to match path transform
        helpers.translation.copy(this.penPath.translation);
        helpers.rotation = this.penPath.rotation;
        helpers.scale = this.penPath.scale;

        // Draw all anchors as small dots
        this.penPath.vertices.forEach((v, i) => {
            const isSelected = i === this.selectedAnchorIdx;
            
            // Anchor Point
            const c = new Two.Circle(v.x, v.y, isSelected ? 6 : 4);
            c.fill = isSelected ? '#1565C0' : (i === 0 ? '#4CAF50' : '#FFFFFF');
            c.stroke = isSelected ? '#FFFFFF' : '#1565C0';
            c.linewidth = 1.5;
            helpers.add(c);

            // If selected, draw handles
            if (isSelected) {
                const lx = v.x + v.controls.left.x;
                const ly = v.y + v.controls.left.y;
                const rx = v.x + v.controls.right.x;
                const ry = v.y + v.controls.right.y;

                // Handle Lines
                const lineL = new Two.Line(v.x, v.y, lx, ly);
                const lineR = new Two.Line(v.x, v.y, rx, ry);
                lineL.stroke = lineR.stroke = '#1565C0';
                lineL.linewidth = 1;
                lineL.opacity = 0.5;
                helpers.add(lineL, lineR);

                // Handle Dots
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
}

export interface StageHandle {
    exportImage: (name: string, format: 'png' | 'svg') => void;
    finishPath: () => void;
    deleteSelectedAnchor: () => void;
}

const Stage = forwardRef<StageHandle, StageProps>(({ 
    layers, 
    activeLayerId,
    activeTool,
    toolSettings,
    onToolChange,
    onAnchorSelect,
}, ref) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new CanvasEngine(containerRef.current, toolSettings);
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

  useEffect(() => {
    if (engineRef.current) {
        engineRef.current.onToolChange = onToolChange;
        engineRef.current.onAnchorSelect = onAnchorSelect;
        engineRef.current.updateLayers(layers);
        engineRef.current.activeLayerId = activeLayerId;
        engineRef.current.tool = activeTool;
        engineRef.current.settings = toolSettings;
        
        if (activeTool !== 'select') {
            engineRef.current.selectedShape = null;
            engineRef.current.updateSelectionHandles();
        }

        // Only cleanup pen if we are NOT in pen mode. 
        if (activeTool !== 'pen') {
            engineRef.current.cleanupPenHelpers();
            if (engineRef.current.tool !== 'pen') {
                 engineRef.current.penPath = null;
                 engineRef.current.updateAnchorSelection(-1);
            }
        } else {
            engineRef.current.updatePenHelpers();
        }
    }
  }, [layers, activeLayerId, activeTool, toolSettings, onToolChange, onAnchorSelect]);

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
              // Two.js interpret logic would be needed here for SVG export 
          }
      },
      finishPath: () => {
          engineRef.current?.finishPath();
      },
      deleteSelectedAnchor: () => {
          engineRef.current?.deleteSelectedAnchor();
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
            e.preventDefault(); // Prevent text selection/scrolling
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
