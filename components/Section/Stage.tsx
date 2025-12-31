/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Two from 'two.js';
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
    groups: Map<string, Two.Group> = new Map();
    activeLayerId: string | null = null;
    tool: Tool = 'select';
    settings!: ToolSettings; // Will be set immediately after construction
    onToolChange?: (tool: Tool) => void;
    onAnchorSelect?: (isSelected: boolean) => void;
    
    // Selection & Transform State
    selectedShape: any | null = null; 
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

    constructor(container: HTMLElement) {
        this.two = new Two({
            type: Two.Types.canvas,
            width: container.clientWidth,
            height: container.clientHeight,
            autostart: true,
        }).appendTo(container);
    }
    
    // --- Public API for React ---

    public setTool(tool: Tool) {
        if (this.tool === tool) return;
        this.tool = tool;

        if (tool !== 'select') {
            this.selectedShape = null;
            this.updateSelectionHandles();
        }
        
        if (tool !== 'pen') {
            this.finishPath(); // Cleans up all pen state
        } else {
            this.updatePenHelpers(); // Show helpers if switching to pen
        }
    }

    public setActiveLayerId(id: string | null) {
        this.activeLayerId = id;
    }

    public setToolSettings(settings: ToolSettings) {
        this.settings = settings;
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

    public setCallbacks(callbacks: { onToolChange?: (tool: Tool) => void, onAnchorSelect?: (isSelected: boolean) => void }) {
        this.onToolChange = callbacks.onToolChange;
        this.onAnchorSelect = callbacks.onAnchorSelect;
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

        const split = { x: lerp(l2.x, h1_new.x, t), y: lerp(l2.y, h1_new.y, t) };
        
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

            if (this.settings.selectionMode === 'layer') {
                 for (let i = group.children.length - 1; i >= 0; i--) {
                    const child = group.children[i];
                    if (!(child instanceof Two.Shape)) continue;
                    const bounds = child.getBoundingClientRect(true);
                    if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                         this.selectedShape = group;
                         this.dragOffset = { x: x - group.translation.x, y: y - group.translation.y };
                         break;
                    }
                }
            } else {
                for (let i = group.children.length - 1; i >= 0; i--) {
                    const child = group.children[i];
                    if (!(child instanceof Two.Shape)) continue;
                    
                    const bounds = child.getBoundingClientRect(true);
                    if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                        this.selectedShape = child;
                        this.dragOffset = { x: local.x - child.translation.x, y: local.y - child.translation.y };
                        break;
                    }
                }
            }
            this.updateSelectionHandles();
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
        }
    }

    handleUp() {
        this.isInteracting = false;
        this.currentPath = null;
        if (this.tool === 'pen') {
            if (this.penInteraction.mode === 'creating' || this.penInteraction.mode !== 'idle') {
                 this.penInteraction.mode = 'idle';
            }
        }
    }
    
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
}

export interface StageHandle {
    exportImage: (name: string, format: 'png' | 'svg') => void;
    finishPath: () => void;
    deleteSelectedAnchor: () => void;
    setAnchorSharp: () => void;
    setPathClosed: (closed: boolean) => void;
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
    engineRef.current?.setCallbacks({ onToolChange, onAnchorSelect });
  }, [onToolChange, onAnchorSelect]);


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