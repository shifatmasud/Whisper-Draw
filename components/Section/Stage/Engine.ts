/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import paper from 'paper';
import { Layer, Tool, ToolSettings } from '../../../types/index.tsx';

import { enterBuildMode, exitBuildMode } from './modules/BuildModeManager.ts';
import { generateThumbnail, importSVG } from './modules/IOManager.ts';
import { handleDown, handleMove, handleUp } from './modules/InteractionManager.ts';
// FIX: Import updatePenHelpers
import { finishPath, deleteSelectedAnchor, setAnchorSharp, setPathClosed, updatePenHelpers } from './modules/PenToolManager.ts';
import { broadcastSelectionType, updateSelectionHandles } from './modules/SelectToolManager.ts';
import { flattenSelectedShape, ungroupSelected } from './modules/VectorManager.ts';
// FIX: Import getGlobalMatrix
import { getGlobalMatrix } from './modules/Util.ts';

/**
 * 🎨 Canvas Engine (Orchestrator)
 * The main class for the canvas. It holds the state (Two.js instance, Paper.js scope, etc.)
 * and orchestrates the various managers and modules that contain the actual logic.
 * This refactored class is much smaller, delegating tasks to specialized modules.
 */
export class CanvasEngine {
  // Core instances
  two: Two;
  thumbTwo: Two;
  paperScope: paper.PaperScope;

  // State
  groups: Map<string, Two.Group> = new Map();
  activeLayerId: string | null = null;
  tool: Tool = 'select';
  settings!: ToolSettings;
  selectedShape: any | null = null;
  transformGroup: Two.Group | null = null;
  isInteracting = false;
  dragOffset = { x: 0, y: 0 };
  currentPath: Two.Path | null = null;
  tempShape: any | null = null;
  shapeOrigin = { x: 0, y: 0 };
  lastClickTime: number = 0;

  // Pen Tool State
  penPath: Two.Path | null = null;
  selectedAnchorIdx: number = -1;
  penHelpers: Two.Group | null = null;
  penInteraction = {
    mode: 'idle' as 'idle' | 'dragging-anchor' | 'dragging-handle-left' | 'dragging-handle-right' | 'creating',
    dragStart: { x: 0, y: 0 },
    initialPos: { x: 0, y: 0 }
  };

  // Build Mode State
  buildState = {
    isActive: false,
    shards: [] as { two: Two.Shape, paper: paper.PathItem }[],
    originalShapes: [] as any[],
    lassoPath: null as Two.Path | null,
    lassoPoints: [] as {x: number, y: number}[],
    container: null as Two.Group | null,
  };
  
  // Callbacks
  onToolChange?: (tool: Tool) => void;
  onAnchorSelect?: (isSelected: boolean) => void;
  onSelectionTypeChange?: (type: any) => void;
  onSelectionPropertiesChange?: (properties: Partial<ToolSettings>) => void;
  onThumbnailReady?: (id: string, dataUrl: string) => void;

  constructor(container: HTMLElement) {
    this.two = new Two({
      type: Two.Types.canvas,
      width: container.clientWidth,
      height: container.clientHeight,
      autostart: true,
    }).appendTo(container);
    this.two.scene.translation.set(this.two.width / 2, this.two.height / 2);

    const thumbCanvas = document.createElement('canvas');
    this.thumbTwo = new Two({
      type: Two.Types.canvas,
      width: 100, height: 100,
      domElement: thumbCanvas,
      autostart: false
    });

    this.paperScope = new paper.PaperScope();
    this.paperScope.setup(document.createElement('canvas'));
  }

  // --- CORE LIFECYCLE & STATE ---

  public resize(width: number, height: number) {
    this.two.width = width;
    this.two.height = height;
    this.two.scene.translation.set(width / 2, height / 2);
    this.two.update();
  }

  public setTool(tool: Tool) {
    if (this.tool === tool) return;
    exitBuildMode(this);
    if (tool !== 'pen') finishPath(this);
    this.tool = tool;
    updateSelectionHandles(this);
    
    if (tool === 'select' && this.selectedShape) {
      broadcastSelectionType(this, this.selectedShape);
    } else if (tool !== 'select' && tool !== 'pen') {
      this.onSelectionTypeChange?.(null);
    }
    
    if (this.tool === 'shape' && this.settings?.shapeMode === 'build') {
      enterBuildMode(this);
    }
  }

  public setActiveLayerId(id: string | null) {
    this.activeLayerId = id;
    if (this.tool === 'shape' && this.settings?.shapeMode === 'build') {
      enterBuildMode(this);
    }
  }

  public setToolSettings(settings: ToolSettings) {
      const prevMode = this.settings?.shapeMode;
      this.settings = settings;
      if (this.tool === 'shape') {
          if (settings.shapeMode === 'build' && prevMode !== 'build') enterBuildMode(this);
          else if (settings.shapeMode !== 'build' && prevMode === 'build') exitBuildMode(this);
      }
      if (this.selectedShape) {
          this.applySettingsToShape(this.selectedShape);
          this.updateSelectedTransformFromSettings(settings);
      }
      if (this.penPath) {
          this.applySettingsToShape(this.penPath);
          this.penPath.closed = this.settings.penClosePath;
      }
  }

  private updateSelectedTransformFromSettings(settings: ToolSettings) {
    if (!this.selectedShape || this.isInteracting) return;
    let changed = false;
    if (settings.selectionX !== undefined && this.selectedShape.translation.x !== settings.selectionX) {
      this.selectedShape.translation.x = settings.selectionX; changed = true;
    }
    if (settings.selectionY !== undefined && this.selectedShape.translation.y !== settings.selectionY) {
      this.selectedShape.translation.y = settings.selectionY; changed = true;
    }
    if (settings.selectionRotation !== undefined) {
      const rad = (settings.selectionRotation * Math.PI) / 180;
      if (Math.abs(this.selectedShape.rotation - rad) > 0.0001) { this.selectedShape.rotation = rad; changed = true; }
    }
    if (settings.selectionScale !== undefined) {
      const currentScale = typeof this.selectedShape.scale === 'number' ? this.selectedShape.scale : this.selectedShape.scale.x;
      if (currentScale !== settings.selectionScale) { this.selectedShape.scale = settings.selectionScale; changed = true; }
    }
    if (changed) updateSelectionHandles(this);
  }

  private applySettingsToShape(s: any) {
    const leaf = (o: any) => {
        o.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent';
        o.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
        o.linewidth = this.settings.strokeWidth;
        if ('cap' in o) o.cap = this.settings.lineCap;
        if ('join' in o) o.join = this.settings.lineJoin;
    };
    if (s instanceof Two.Group) s.children.forEach((c: any) => leaf(c)); 
    else leaf(s);
  }

  public setCallbacks(callbacks: any) {
    this.onToolChange = callbacks.onToolChange;
    this.onAnchorSelect = callbacks.onAnchorSelect;
    this.onSelectionTypeChange = callbacks.onSelectionTypeChange;
    this.onSelectionPropertiesChange = callbacks.onSelectionPropertiesChange;
    this.onThumbnailReady = callbacks.onThumbnailReady;
  }

  public updateLayers(layers: Layer[]) {
    const activeIds = new Set<string>();
    const syncOrder = (items: Layer[], parent: Two.Group | Two.Scene) => {
      for (let i = items.length - 1; i >= 0; i--) {
        const layer = items[i];
        activeIds.add(layer.id);
        let group = this.groups.get(layer.id);
        if (!group) { group = new Two.Group(); group.id = layer.id; this.groups.set(layer.id, group); }
        parent.add(group);
        group.visible = layer.isVisible; group.opacity = layer.opacity; (group as any).blendMode = layer.blendMode;
        group.translation.set(layer.x, layer.y); group.scale = layer.scale; group.rotation = (layer.rotation * Math.PI) / 180;
        if (layer.children) syncOrder(layer.children, group);
      }
    };
    syncOrder(layers, this.two.scene);
    this.groups.forEach((g, id) => { if (!activeIds.has(id)) { g.remove(); this.groups.delete(id); } });
    if (this.transformGroup) { this.two.scene.remove(this.transformGroup); this.two.scene.add(this.transformGroup); }
    if (this.penHelpers) { this.two.scene.remove(this.penHelpers); this.two.scene.add(this.penHelpers); }
    if (this.buildState.container) { this.two.scene.remove(this.buildState.container); this.two.scene.add(this.buildState.container); }
  }

  public destroy() { 
    this.two.pause(); 
    this.two.renderer.domElement.remove(); 
    this.thumbTwo.renderer.domElement.remove(); 
  }
  
  // --- PUBLIC API WRAPPERS ---
  // These wrap the modular functions to be exposed via StageHandle.
  
  public handleDown = (x: number, y: number) => handleDown(this, x, y);
  public handleMove = (x: number, y: number) => handleMove(this, x, y);
  public handleUp = () => handleUp(this);
  
  public finishPath = () => finishPath(this);
  public deleteSelectedAnchor = () => deleteSelectedAnchor(this);
  public setAnchorSharp = () => setAnchorSharp(this);
  public setPathClosed = (closed: boolean) => setPathClosed(this, closed);
  public flattenSelectedShape = () => flattenSelectedShape(this);
  public ungroupSelected = () => ungroupSelected(this);
  
  public importSVG = (svgString: string) => importSVG(this, svgString);
  public generateThumbnail = (layerId: string) => generateThumbnail(this, layerId);
  
  // FIX: Add missing methods to orchestrator
  public updateSelectionHandles = () => updateSelectionHandles(this);
  public updatePenHelpers = () => updatePenHelpers(this);
  public getGlobalMatrix = (obj: any): Two.Matrix => getGlobalMatrix(this, obj);

  public duplicateLayerContent(originalId: string, newId: string) {
      const originalGroup = this.groups.get(originalId);
      if (originalGroup) {
          const clone = originalGroup.clone();
          clone.id = newId;
          this.groups.set(newId, clone);
      }
  }
}
