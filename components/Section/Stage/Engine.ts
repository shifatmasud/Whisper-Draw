/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import paper from 'paper';
import { Layer, Tool, ToolSettings, SelectedObjectType, ShapeType } from '../../../types/index.tsx';
import { twoMatrixToPaperMatrix, normalizeImportedContent } from './PathUtils.ts';

export class CanvasEngine {
  two: Two;
  thumbTwo: Two;
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

  // State
  selectedShape: any | null = null;
  transformGroup: Two.Group | null = null;
  isInteracting = false;
  dragOffset = { x: 0, y: 0 };
  currentPath: Two.Path | null = null;
  tempShape: any | null = null;
  shapeOrigin = { x: 0, y: 0 };

  // Pen Tool
  penPath: Two.Path | null = null;
  selectedAnchorIdx: number = -1;
  penHelpers: Two.Group | null = null;
  penInteraction = {
    mode: 'idle' as 'idle' | 'dragging-anchor' | 'dragging-handle-left' | 'dragging-handle-right' | 'creating',
    dragStart: { x: 0, y: 0 },
    initialPos: { x: 0, y: 0 }
  };

  // Build Mode
  buildState = {
    isActive: false,
    shards: [] as { two: Two.Shape, paper: paper.PathItem }[],
    originalShapes: [] as any[],
    lassoPath: null as Two.Path | null,
    lassoPoints: [] as {x: number, y: number}[],
    container: null as Two.Group | null,
  };

  lastClickTime: number = 0;

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
      width: 100,
      height: 100,
      domElement: thumbCanvas,
      autostart: false
    });

    this.paperScope = new paper.PaperScope();
    const dummyCanvas = document.createElement('canvas');
    this.paperScope.setup(dummyCanvas);
  }

  // --- CORE API ---

  public resize(width: number, height: number) {
    this.two.width = width;
    this.two.height = height;
    this.two.scene.translation.set(width / 2, height / 2);
    this.two.update();
  }

  public setTool(tool: Tool) {
    if (this.tool === tool) return;
    this.exitBuildMode();
    if (tool !== 'pen') this.finishPath();
    this.tool = tool;
    this.updateSelectionHandles();
    
    if (tool === 'select' && this.selectedShape) {
      this.broadcastSelectionType(this.selectedShape);
    } else if (tool !== 'select' && tool !== 'pen') {
      this.onSelectionTypeChange?.(null);
    }
    
    if (this.tool === 'shape' && this.settings?.shapeMode === 'build') {
      this.enterBuildMode();
    }
  }

  public setActiveLayerId(id: string | null) {
    this.activeLayerId = id;
    if (this.tool === 'shape' && this.settings?.shapeMode === 'build') {
      this.enterBuildMode();
    }
  }

  public setToolSettings(settings: ToolSettings) {
    const prevMode = this.settings?.shapeMode;
    this.settings = settings;
    if (this.tool === 'shape') {
      if (settings.shapeMode === 'build' && prevMode !== 'build') this.enterBuildMode();
      else if (settings.shapeMode !== 'build' && prevMode === 'build') this.exitBuildMode();
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
      this.selectedShape.translation.x = settings.selectionX;
      changed = true;
    }
    if (settings.selectionY !== undefined && this.selectedShape.translation.y !== settings.selectionY) {
      this.selectedShape.translation.y = settings.selectionY;
      changed = true;
    }
    if (settings.selectionRotation !== undefined) {
      const rad = (settings.selectionRotation * Math.PI) / 180;
      if (Math.abs(this.selectedShape.rotation - rad) > 0.0001) {
        this.selectedShape.rotation = rad;
        changed = true;
      }
    }
    if (settings.selectionScale !== undefined) {
      const currentScale = typeof this.selectedShape.scale === 'number' ? this.selectedShape.scale : this.selectedShape.scale.x;
      if (currentScale !== settings.selectionScale) {
        this.selectedShape.scale = settings.selectionScale;
        changed = true;
      }
    }
    if (changed) this.updateSelectionHandles();
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
        if (!group) {
          group = new Two.Group();
          group.id = layer.id;
          this.groups.set(layer.id, group);
        }
        parent.add(group);
        group.visible = layer.isVisible;
        group.opacity = layer.opacity;
        (group as any).blendMode = layer.blendMode;
        group.translation.set(layer.x, layer.y);
        group.scale = layer.scale;
        group.rotation = (layer.rotation * Math.PI) / 180;
        if (layer.children) syncOrder(layer.children, group);
      }
    };
    syncOrder(layers, this.two.scene);
    this.groups.forEach((g, id) => {
      if (!activeIds.has(id)) {
        g.remove();
        this.groups.delete(id);
      }
    });
    if (this.transformGroup) { this.two.scene.remove(this.transformGroup); this.two.scene.add(this.transformGroup); }
    if (this.penHelpers) { this.two.scene.remove(this.penHelpers); this.two.scene.add(this.penHelpers); }
    if (this.buildState.container) { this.two.scene.remove(this.buildState.container); this.two.scene.add(this.buildState.container); }
  }

  // --- COORDINATE HELPERS ---

  private getGlobalMatrix(obj: any): Two.Matrix {
    const matrix = new Two.Matrix();
    if (!obj || obj === this.two.scene) return matrix;

    const stack: any[] = [];
    let current = obj;
    while (current && current !== this.two.scene) {
      stack.push(current);
      current = current.parent;
    }

    for (let i = stack.length - 1; i >= 0; i--) {
      const m = stack[i]._matrix;
      if (m) matrix.multiply(...m.elements);
    }

    return matrix;
  }

  private toLocal(obj: any, sceneX: number, sceneY: number) {
    const globalMatrix = this.getGlobalMatrix(obj);
    const m = globalMatrix.clone().invert();
    
    if (!m) return { x: sceneX, y: sceneY };

    const transformed = m.multiply(sceneX, sceneY, 1);
    return { x: transformed.x, y: transformed.y };
  }

  // --- CORE HIT TESTING ---

  public tryEnterEditMode(x: number, y: number): boolean {
    if (!this.activeLayerId) return false;
    const rootGroup = this.groups.get(this.activeLayerId);
    if (!rootGroup) return false;

    this.two.update();

    const findPathAtPoint = (g: Two.Group, targetX: number, targetY: number): Two.Path | null => {
        for (let i = g.children.length - 1; i >= 0; i--) {
            const child = g.children[i];
            if (child instanceof Two.Path) {
                const bounds = child.getBoundingClientRect(true);
                if (targetX >= bounds.left && targetX <= bounds.right && targetY >= bounds.top && targetY <= bounds.bottom) {
                    return child as Two.Path;
                }
            } else if (child instanceof Two.Group) {
                const found = findPathAtPoint(child as Two.Group, targetX, targetY);
                if (found) return found;
            }
        }
        return null;
    };

    const path = findPathAtPoint(rootGroup, x, y);
    if (path) {
        this.penPath = path;
        this.selectedShape = null;
        if (this.transformGroup) { this.two.remove(this.transformGroup); this.transformGroup = null; }
        this.setTool('pen');
        this.onToolChange?.('pen');
        this.updatePenHelpers();
        return true;
    }
    return false;
  }

  // --- IO & THUMBNAILS ---

  public generateThumbnail(layerId: string) {
    const group = this.groups.get(layerId);
    if (!group) return;
    const clone = group.clone();
    clone.translation.set(0, 0); clone.scale = 1; clone.rotation = 0;
    this.thumbTwo.clear(); this.thumbTwo.add(clone);
    const bounds = clone.getBoundingClientRect();
    const maxDim = Math.max(bounds.width, bounds.height);
    if (maxDim > 0) {
      const scale = (this.thumbTwo.width - 10) / maxDim;
      clone.scale = scale;
      const bbox = clone.getBoundingClientRect();
      const bx = bbox.left + bbox.width / 2;
      const by = bbox.top + bbox.height / 2;
      clone.translation.addSelf(new Two.Vector((this.thumbTwo.width / 2) - bx, (this.thumbTwo.height / 2) - by));
    }
    this.thumbTwo.render();
    this.onThumbnailReady?.(layerId, this.thumbTwo.renderer.domElement.toDataURL('image/png', 0.5));
  }

  public importSVG(svgString: string) {
    if (!this.activeLayerId) return;
    const group = this.groups.get(this.activeLayerId);
    if (!group) return;
    this.two.load(svgString, (loadedGroup: Two.Group) => {
      if (loadedGroup) {
        normalizeImportedContent(loadedGroup);
        loadedGroup.center();
        loadedGroup.translation.set(0, 0);
        group.add(loadedGroup);
        this.selectShape(loadedGroup);
        this.generateThumbnail(this.activeLayerId!);
      }
    });
  }

  // --- INTERACTION ---

  public handleDown(rawX: number, rawY: number) {
    const x = rawX - this.two.width / 2;
    const y = rawY - this.two.height / 2;
    const now = Date.now();
    
    if (now - this.lastClickTime < 300) {
      if (this.tool === 'pen') { this.finishPath(); this.lastClickTime = 0; return; }
      if (this.tool === 'select' && this.selectedShape && this.settings.selectionMode === 'vector') {
          if (this.tryEnterEditMode(x, y)) { this.lastClickTime = 0; return; }
      }
    }
    this.lastClickTime = now;

    if (!this.activeLayerId) return;
    const group = this.groups.get(this.activeLayerId);
    if (!group) return;
    
    if (this.tool === 'shape' && this.settings.shapeMode === 'build' && this.buildState.isActive) {
      this.isInteracting = true;
      const local = this.toLocal(this.buildState.container!, x, y);
      this.buildState.lassoPoints = []; this.buildState.lassoPath!.vertices = [];
      this.updateBuildLasso(local.x, local.y);
      return;
    }

    this.isInteracting = true;
    if (this.tool === 'delete') { this.handleDelete(group, x, y); }
    else if (this.tool === 'select') { 
      const local = this.toLocal(group, x, y);
      this.handleSelect(group, x, y, local); 
    }
    else if (this.tool === 'pen') { 
      this.handlePenDown(x, y, group); 
    }
    else if (this.tool === 'brush') { 
      const local = this.toLocal(group, x, y);
      this.handleBrushDown(local.x, local.y, group); 
    }
    else if (this.tool === 'shape') { 
      const local = this.toLocal(group, x, y);
      this.handleShapeDown(local.x, local.y, group, x, y); 
    }
  }

  public handleMove(rawX: number, rawY: number) {
    if (!this.isInteracting) return;
    const x = rawX - this.two.width / 2;
    const y = rawY - this.two.height / 2;
    if (!this.activeLayerId) return;
    const group = this.groups.get(this.activeLayerId);
    if (!group) return;
    
    if (this.tool === 'shape' && this.settings.shapeMode === 'build' && this.buildState.isActive) {
      const local = this.toLocal(this.buildState.container!, x, y);
      this.updateBuildLasso(local.x, local.y);
    } else if (this.tool === 'select' && this.selectedShape) {
      const local = this.toLocal(this.selectedShape.parent, x, y);
      this.selectedShape.translation.set(local.x - this.dragOffset.x, local.y - this.dragOffset.y);
      this.updateSelectionHandles();
      this.onSelectionPropertiesChange?.({ selectionX: this.selectedShape.translation.x, selectionY: this.selectedShape.translation.y });
    } else if (this.tool === 'brush' && this.currentPath) {
      const local = this.toLocal(this.currentPath.parent, x, y);
      this.currentPath.vertices.push(new Two.Anchor(local.x, local.y));
    } else if (this.tool === 'pen') { 
      this.handlePenMove(x, y); 
    }
    else if (this.tool === 'shape') { 
      const local = this.toLocal(this.tempShape ? this.tempShape.parent : group, x, y);
      this.handleShapeMove(local.x, local.y, x, y); 
    }
  }

  public handleUp() {
    if (this.tool === 'shape' && this.settings.shapeMode === 'build' && this.buildState.isActive && this.isInteracting) {
      this.finalizeBuild();
    }
    if (this.isInteracting && this.activeLayerId) this.generateThumbnail(this.activeLayerId);
    this.isInteracting = false; 
    this.currentPath = null;
    if (this.tool === 'pen' && (this.penInteraction.mode !== 'idle')) {
      this.penInteraction.mode = 'idle';
    } else if (this.tool === 'shape') {
      this.handleShapeUp();
    }
  }

  // --- INTERACTION LOGIC ---

  private handleDelete(group: Two.Group, x: number, y: number) {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      const bounds = child.getBoundingClientRect(true);
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        child.remove();
        if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
        break;
      }
    }
  }

  private handleSelect(group: Two.Group, x: number, y: number, local: { x: number, y: number }) {
    this.selectedShape = null;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      const bounds = child.getBoundingClientRect(true);
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        this.selectShape(child);
        this.dragOffset = { x: local.x - child.translation.x, y: local.y - child.translation.y };
        return;
      }
    }
    this.onSelectionTypeChange?.(null);
    this.updateSelectionHandles();
  }

  private selectShape(shape: any) {
    this.selectedShape = shape;
    this.updateSelectionHandles();
    this.broadcastSelectionType(shape);
    this.broadcastSelectionProperties(shape);
  }

  private broadcastSelectionProperties(shape: any) {
    let sample = shape instanceof Two.Group && shape.children.length > 0 ? shape.children[0] : shape;
    const stroke = sample.stroke, fill = sample.fill;
    const props: Partial<ToolSettings> = {
      strokeEnabled: stroke !== 'transparent',
      strokeColor: stroke === 'transparent' ? this.settings.strokeColor : (typeof stroke === 'string' ? stroke : (stroke as any).toHexString?.() || this.settings.strokeColor),
      fillEnabled: fill !== 'transparent',
      fillColor: fill === 'transparent' ? this.settings.fillColor : (typeof fill === 'string' ? fill : (fill as any).toHexString?.() || this.settings.fillColor),
      strokeWidth: sample.linewidth || this.settings.strokeWidth,
      selectionX: shape.translation.x,
      selectionY: shape.translation.y,
      selectionRotation: (shape.rotation * 180) / Math.PI,
      selectionScale: typeof shape.scale === 'number' ? shape.scale : (shape.scale.x || 1),
    };
    if (sample._isRoundedRect) props.cornerRadius = sample._cornerRadius;
    if (sample instanceof Two.Star) { props.starPoints = sample.sides; props.starInnerRadius = sample.outerRadius > 0 ? sample.innerRadius / sample.outerRadius : 0.5; }
    if (sample instanceof Two.Polygon) props.polygonSides = sample.sides;
    this.onSelectionPropertiesChange?.(props);
  }

  private broadcastSelectionType(shape: any) {
    let type: SelectedObjectType = null;
    if (shape instanceof Two.Group) type = 'group';
    else if (shape._isRoundedRect) type = 'rectangle';
    else if (shape instanceof Two.Star) type = 'star';
    else if (shape instanceof Two.Polygon) type = 'polygon';
    else if (shape instanceof Two.Ellipse) type = 'ellipse';
    else if (shape instanceof Two.Line) type = 'line';
    else if (shape instanceof Two.Path) type = 'path';
    else if (shape instanceof Two.Rectangle) type = 'rectangle';
    this.onSelectionTypeChange?.(type);
  }

  private updateSelectionHandles() {
    if (this.transformGroup) { this.two.remove(this.transformGroup); this.transformGroup = null; }
    if (!this.selectedShape || this.tool !== 'select') return;
    const bounds = this.selectedShape.getBoundingClientRect(true);
    const group = new Two.Group(); this.transformGroup = group;
    const rect = new Two.Rectangle(bounds.left + bounds.width/2, bounds.top + bounds.height/2, bounds.width + 10, bounds.height + 10);
    rect.noFill(); rect.stroke = '#1565C0'; rect.linewidth = 2; group.add(rect);
    [{x: bounds.left-5, y: bounds.top-5}, {x: bounds.right+5, y: bounds.top-5}, {x: bounds.right+5, y: bounds.bottom+5}, {x: bounds.left-5, y: bounds.bottom+5}].forEach(p => {
      const h = new Two.Circle(p.x, p.y, 5); h.fill = '#FFFFFF'; h.stroke = '#1565C0'; h.linewidth = 1; group.add(h);
    });
    this.two.add(group);
  }

  // --- VECTOR EDITING ---

  public setPathClosed(closed: boolean) {
    if (this.penPath) {
        this.penPath.closed = closed;
        this.updatePenHelpers();
    }
  }

  public deleteSelectedAnchor() {
      if (this.penPath && this.selectedAnchorIdx > -1 && this.penPath.vertices.length > 1) {
          this.penPath.vertices.splice(this.selectedAnchorIdx, 1);
          this.updateAnchorSelection(-1); // Deselect
          this.updatePenHelpers();
      }
  }

  public setAnchorSharp() {
      if (this.penPath && this.selectedAnchorIdx > -1) {
          const v = this.penPath.vertices[this.selectedAnchorIdx];
          if (v && v.controls) {
              v.controls.left.set(0, 0);
              v.controls.right.set(0, 0);
              this.updatePenHelpers();
          }
      }
  }
  
  public duplicateLayerContent(originalId: string, newId: string) {
      const originalGroup = this.groups.get(originalId);
      if (originalGroup) {
          const clone = originalGroup.clone();
          clone.id = newId;
          this.groups.set(newId, clone);
      }
  }

  public ungroupSelected() {
    if (!this.selectedShape || !(this.selectedShape instanceof Two.Group)) return;

    const group = this.selectedShape;
    const parent = group.parent;
    if (!parent) return;

    this.two.update();

    const parentWorldInverse = this.getGlobalMatrix(parent).clone().invert();
    if (!parentWorldInverse) return;
    
    const children = [...group.children];

    children.forEach(child => {
        const childWorldMatrix = this.getGlobalMatrix(child);
        parent.add(child);
        const newLocalMatrix = parentWorldInverse.clone().multiply(...childWorldMatrix.elements);
        child.matrix.copy(newLocalMatrix);
    });
    
    group.remove();
    this.selectedShape = null;
    this.updateSelectionHandles();
    this.onSelectionTypeChange?.(null);
    if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
  }

  // --- PEN TOOL LOGIC ---

  private handlePenDown(sceneX: number, sceneY: number, group: Two.Group) {
    const HIT = 12;
    if (this.penPath && this.selectedAnchorIdx !== -1) {
      const v = this.penPath.vertices[this.selectedAnchorIdx];
      if (v && v.controls) {
        const local = this.toLocal(this.penPath, sceneX, sceneY);
        const lx = v.x + v.controls.left.x, ly = v.y + v.controls.left.y;
        const rx = v.x + v.controls.right.x, ry = v.y + v.controls.right.y;
        if (Math.hypot(local.x - lx, local.y - ly) < HIT) { this.penInteraction = { mode: 'dragging-handle-left', dragStart: {x: local.x, y: local.y}, initialPos: {x: lx, y: ly} }; return; }
        if (Math.hypot(local.x - rx, local.y - ry) < HIT) { this.penInteraction = { mode: 'dragging-handle-right', dragStart: {x: local.x, y: local.y}, initialPos: {x: rx, y: ry} }; return; }
      }
    }
    if (this.penPath) {
      const local = this.toLocal(this.penPath, sceneX, sceneY);
      for (let i = 0; i < this.penPath.vertices.length; i++) {
        if (Math.hypot(local.x - this.penPath.vertices[i].x, local.y - this.penPath.vertices[i].y) < HIT) {
          if (i === 0 && this.penPath.vertices.length > 2 && !this.penPath.closed) { this.penPath.closed = true; this.finishPath(); return; }
          this.updateAnchorSelection(i); 
          this.penInteraction = { 
            mode: 'dragging-anchor', 
            dragStart: {x: local.x, y: local.y}, 
            initialPos: {x: this.penPath.vertices[i].x, y: this.penPath.vertices[i].y} 
          }; 
          return;
        }
      }
    }
    
    if (!this.penPath || this.penPath.closed) {
      const path = new Two.Path([], false, true, true);
      path.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : '#000'; 
      path.linewidth = this.settings.strokeWidth; 
      path.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent';
      group.add(path); this.penPath = path;
      const local = this.toLocal(path, sceneX, sceneY);
      path.vertices.push(new Two.Anchor(local.x, local.y, 0,0,0,0, Two.Commands.curve)); 
      this.updateAnchorSelection(0);
      this.penInteraction = { mode: 'creating', dragStart: {x: local.x, y: local.y}, initialPos: {x: local.x, y: local.y} };
    } else {
      const local = this.toLocal(this.penPath, sceneX, sceneY);
      this.penPath.vertices.push(new Two.Anchor(local.x, local.y, 0,0,0,0, Two.Commands.curve)); 
      this.updateAnchorSelection(this.penPath.vertices.length - 1);
      this.penInteraction = { mode: 'creating', dragStart: {x: local.x, y: local.y}, initialPos: {x: local.x, y: local.y} };
    }
    this.updatePenHelpers();
  }

  private handlePenMove(sceneX: number, sceneY: number) {
    if (!this.penPath || this.penInteraction.mode === 'idle') return;
    const local = this.toLocal(this.penPath, sceneX, sceneY);
    const v = this.penPath.vertices[this.selectedAnchorIdx]; 
    if (!v || !v.controls) return;
    
    if (this.penInteraction.mode === 'creating') {
      const dx = local.x - v.x, dy = local.y - v.y; 
      v.controls.right.set(dx, dy); 
      v.controls.left.set(-dx, -dy);
    } else if (this.penInteraction.mode === 'dragging-anchor') {
      v.x = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x);
      v.y = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y);
    } else if (this.penInteraction.mode === 'dragging-handle-left') {
      const dx = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x) - v.x;
      const dy = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y) - v.y;
      v.controls.left.set(dx, dy); 
      if (this.settings.penHandleMode === 'mirrored') v.controls.right.set(-dx, -dy);
    } else if (this.penInteraction.mode === 'dragging-handle-right') {
      const dx = this.penInteraction.initialPos.x + (local.x - this.penInteraction.dragStart.x) - v.x;
      const dy = this.penInteraction.initialPos.y + (local.y - this.penInteraction.dragStart.y) - v.y;
      v.controls.right.set(dx, dy); 
      if (this.settings.penHandleMode === 'mirrored') v.controls.left.set(-dx, -dy);
    }
    this.updatePenHelpers();
  }

  private updatePenHelpers() {
    if (this.penHelpers) this.two.remove(this.penHelpers); 
    if (!this.penPath || this.tool !== 'pen') return;
    
    const h = new Two.Group(); 
    this.penHelpers = h;
    
    const matrix = this.getGlobalMatrix(this.penPath);
    h.matrix.copy(matrix);
    
    this.penPath.vertices.forEach((v: any, i: number) => {
      const sel = i === this.selectedAnchorIdx;
      const c = new Two.Circle(v.x, v.y, sel ? 6 : 4); 
      c.fill = sel ? '#1565C0' : (i === 0 ? '#4CAF50' : '#FFFFFF'); 
      c.stroke = '#1565C0'; 
      h.add(c);
      
      if (sel && v.controls) {
        const lx = v.x + v.controls.left.x, ly = v.y + v.controls.left.y, rx = v.x + v.controls.right.x, ry = v.y + v.controls.right.y;
        const lL = new Two.Line(v.x, v.y, lx, ly), lR = new Two.Line(v.x, v.y, rx, ry); 
        lL.stroke = lR.stroke = '#1565C0'; 
        h.add(lL, lR);
        const cL = new Two.Circle(lx, ly, 4), cR = new Two.Circle(rx, ry, 4); 
        cL.fill = cR.fill = '#FFFFFF'; 
        cL.stroke = '#1565C0'; 
        h.add(cL, cR);
      }
    });
    this.two.add(h);
  }

  // --- PRIMITIVES & BUILD ---

  private handleShapeDown(localX: number, localY: number, group: Two.Group, globalX: number, globalY: number) {
    if (this.settings.shapeMode === 'build') return;
    this.shapeOrigin = { x: localX, y: localY };
    let s: any;
    if (this.settings.shapeType === 'rectangle') { 
      this.tempShape = new Two.Group(); 
      group.add(this.tempShape); 
      this.handleShapeMove(localX, localY, globalX, globalY); 
      return; 
    }
    else if (this.settings.shapeType === 'ellipse') s = new Two.Ellipse(localX, localY, 0, 0);
    else if (this.settings.shapeType === 'star') s = new Two.Star(localX, localY, 0, 0, this.settings.starPoints);
    else if (this.settings.shapeType === 'polygon') s = new Two.Polygon(localX, localY, 0, this.settings.polygonSides);
    else if (this.settings.shapeType === 'line') s = new Two.Line(localX, localY, localX, localY);
    
    if (s) { 
      s.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent'; 
      s.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent'; 
      s.linewidth = this.settings.strokeWidth; 
      group.add(s); 
      this.tempShape = s; 
    }
  }

  private handleShapeMove(localX: number, localY: number, globalX: number, globalY: number) {
    if (!this.tempShape || this.settings.shapeMode === 'build') return;
    if (this.tempShape instanceof Two.Line) { 
      this.tempShape.vertices[1].x = localX; 
      this.tempShape.vertices[1].y = localY; 
      return; 
    }
    const w = Math.abs(localX - this.shapeOrigin.x), h = Math.abs(localY - this.shapeOrigin.y);
    const cx = (localX + this.shapeOrigin.x) / 2, cy = (localY + this.shapeOrigin.y) / 2;
    if (this.tempShape instanceof Two.Group) {
      this.tempShape.remove(this.tempShape.children);
      const r = this.two.makeRoundedRectangle(cx, cy, w, h, this.settings.cornerRadius);
      r.fill = this.settings.fillEnabled ? this.settings.fillColor : 'transparent'; r.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : 'transparent'; r.linewidth = this.settings.strokeWidth;
      (r as any)._isRoundedRect = true; (r as any)._cornerRadius = this.settings.cornerRadius; this.tempShape.add(r); return;
    }
    this.tempShape.translation.set(cx, cy); const rad = Math.hypot(w, h) / 2;
    if (this.tempShape instanceof Two.Ellipse) { this.tempShape.width = w; this.tempShape.height = h; }
    else if (this.tempShape instanceof Two.Star) { this.tempShape.outerRadius = rad; this.tempShape.innerRadius = rad * this.settings.starInnerRadius; }
    else if (this.tempShape instanceof Two.Polygon) (this.tempShape as any).radius = rad;
  }

  private handleShapeUp() {
    if (this.tempShape instanceof Two.Group && this.activeLayerId) {
      const r = this.tempShape.children[0];
      if (r) { 
        this.tempShape.remove(r); 
        this.groups.get(this.activeLayerId)?.add(r); 
      }
      this.tempShape.remove();
    }
    this.tempShape = null;
  }

  // --- UTILS ---

  public finishPath() { 
    this.penPath = null; 
    this.updateAnchorSelection(-1); 
    if (this.penHelpers) this.two.remove(this.penHelpers); 
    this.penHelpers = null; 
    this.penInteraction.mode = 'idle'; 
  }

  private updateAnchorSelection(idx: number) { 
    this.selectedAnchorIdx = idx; 
    this.onAnchorSelect?.(idx !== -1); 
    if (idx !== -1) {
      this.broadcastSelectionType(this.penPath);
      this.broadcastSelectionProperties(this.penPath);
    }
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
  
  /**
   * Converts a Two.js shape into a Paper.js PathItem using SVG as an intermediary.
   * This is robust for all shape types, including primitives.
   * @param twoShape The Two.js shape to convert.
   * @returns A Paper.js PathItem, or null on failure.
   */
  private twoShapeToPaperPath(twoShape: any): paper.PathItem | null {
    this.paperScope.project.activeLayer.removeChildren();
    if (!twoShape) return null;

    // Use a temporary in-memory SVG renderer with Two.js
    const tempTwo = new Two({
      type: Two.Types.svg,
      width: 1, height: 1 // Dimensions aren't critical
    });

    const clone = twoShape.clone();
    
    // Get the shape's world matrix to be applied later in Paper.js
    const worldMatrix = this.getGlobalMatrix(twoShape);
    
    // Export the clone with a clean identity matrix
    clone.matrix.identity();
    tempTwo.add(clone);
    tempTwo.update();

    const svgString = tempTwo.renderer.domElement.outerHTML;
    
    if (!svgString) return null;
    
    // Import the SVG string into Paper.js
    // expandShapes is crucial for converting primitives like <rect> into paths for boolean ops
    const item = this.paperScope.project.importSVG(svgString, { expandShapes: true });
    
    if (!item) return null;

    // Now, apply the original world transformation to the imported Paper.js item
    const paperMatrix = twoMatrixToPaperMatrix(worldMatrix, this.paperScope);
    item.transform(paperMatrix);
    
    // Often, a single shape will be imported within a group, so we try to simplify.
    let pathItem: paper.PathItem | null = null;
    if (item instanceof this.paperScope.PathItem) { // PathItem is base for Path, CompoundPath
        pathItem = item;
    } else if (item instanceof this.paperScope.Group && item.children.length > 0) {
        // If it's a group of paths, compound it for easier boolean operations
        const compound = new this.paperScope.CompoundPath({
            children: item.children.filter(c => c instanceof this.paperScope.PathItem),
            fillRule: 'evenodd',
        });
        item.remove(); // clean up the group wrapper
        pathItem = compound;
    }
    
    return pathItem;
  }

  /**
   * Converts a Paper.js path back into a Two.js shape using SVG as an intermediary.
   * @param paperPath The Paper.js item to convert.
   * @param parentGroup The target Two.js group for the new shape.
   * @returns A Two.Shape (typically a Two.Group or Two.Path).
   */
  private paperPathToTwoShape(paperPath: paper.PathItem, parentGroup: Two.Group): Two.Shape {
      // Export Paper.js item to an SVG string.
      const svgString = (paperPath as any).exportSVG({ asString: true });
      
      // Create a DOM node from the string for Two.js to interpret.
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = svgString;
      const svgNode = tempDiv.querySelector('svg');

      if (!svgNode) {
          return new Two.Path([], false, false); // Return empty path on failure
      }

      // Synchronously interpret the SVG node. This adds the result to the main scene.
      const loadedShape = this.two.interpret(svgNode);
      // Immediately remove it from the main scene to manage it manually.
      loadedShape.remove();

      // We now have the shape with its world matrix from the SVG.
      // We need to convert this to a local matrix relative to its new parent.
      // M_local = M_parent_inverse * M_world
      const parentMatrixInv = this.getGlobalMatrix(parentGroup).clone().invert();
      if (parentMatrixInv) {
        loadedShape.matrix.premultiply(parentMatrixInv);
      }
      
      // The result of interpretation is always a Two.Group.
      // If it contains just one path, we can simplify and return the path directly.
      if (loadedShape.children.length === 1 && loadedShape.children[0] instanceof Two.Path) {
          const child = loadedShape.children[0];
          // The child's matrix is local to the group. We need to apply the group's new local matrix to it.
          child.matrix.premultiply(loadedShape.matrix);
          loadedShape.remove(child);
          return child;
      }

      return loadedShape;
  }


  private enterBuildMode() {
    this.exitBuildMode();
    if (!this.activeLayerId) return;
    const group = this.groups.get(this.activeLayerId);
    if (!group || group.children.length === 0) return;
    
    this.buildState.isActive = true;
    this.buildState.container = new Two.Group();
    this.two.add(this.buildState.container);
    
    this.buildState.originalShapes = [...group.children];
    this.buildState.originalShapes.forEach(s => s.visible = false);
    
    this.paperScope.project.activeLayer.removeChildren();
    const paperPaths = this.buildState.originalShapes.map(s => this.twoShapeToPaperPath(s)).filter(p => p) as paper.PathItem[];
    if (paperPaths.length === 0) { this.exitBuildMode(); return; }

    let combined: paper.PathItem = paperPaths[0];
    for (let i = 1; i < paperPaths.length; i++) {
        combined = combined.unite(paperPaths[i]);
    }

    const items = combined.children ? [...combined.children] : [combined];
    this.buildState.shards = items.map(item => {
        const twoShard = this.paperPathToTwoShape(item as paper.PathItem, this.buildState.container!);
        
        const applyShardStyle = (s: any) => {
            if (s instanceof Two.Group) {
                s.children.forEach(applyShardStyle);
            } else {
                s.fill = '#007bff33';
                s.stroke = '#007bff';
                s.linewidth = 1;
            }
        };
        applyShardStyle(twoShard);

        this.buildState.container!.add(twoShard);
        return { two: twoShard, paper: item as paper.PathItem };
    });
    
    this.buildState.lassoPath = new Two.Path([], false, false, true);
    this.buildState.lassoPath.fill = '#007bff22';
    this.buildState.lassoPath.stroke = '#007bff';
    this.buildState.lassoPath.linewidth = 1;
    this.buildState.lassoPath.dashes = [4, 4];
    this.buildState.container!.add(this.buildState.lassoPath);
  }

  private exitBuildMode() { 
    if (!this.buildState.isActive) return;
    this.buildState.isActive = false; 
    this.buildState.container?.remove(); 
    this.buildState.originalShapes.forEach(s => s.visible = true);
    this.buildState.shards = [];
    this.buildState.originalShapes = [];
    this.buildState.container = null;
    this.buildState.lassoPath = null;
  }

  private updateBuildLasso(x: number, y: number) {
      if (!this.buildState.lassoPath) return;
      this.buildState.lassoPoints.push({x, y});
      this.buildState.lassoPath.vertices.push(new Two.Anchor(x, y));
  }
  
  private finalizeBuild() {
    if (!this.buildState.isActive || !this.activeLayerId || this.buildState.lassoPoints.length < 3) {
      this.enterBuildMode(); // Reset view
      return;
    }

    const group = this.groups.get(this.activeLayerId);
    if (!group) return;

    this.paperScope.project.activeLayer.removeChildren();
    const lassoPaper = new this.paperScope.Path(this.buildState.lassoPoints.map(p => new this.paperScope.Point(p.x, p.y)));
    lassoPaper.closed = true;

    const selectedShards: paper.PathItem[] = [];
    const remainingShards: paper.PathItem[] = [];
    
    this.buildState.shards.forEach(shard => {
        if (lassoPaper.intersects(shard.paper) || lassoPaper.contains(shard.paper.bounds)) {
            selectedShards.push(shard.paper);
        } else {
            remainingShards.push(shard.paper);
        }
    });

    if (selectedShards.length === 0) {
        this.enterBuildMode(); return;
    }
    
    group.remove(group.children); // Clear the layer
    
    let finalPaperShapes: paper.PathItem[] = [];

    if (this.settings.buildMode === 'add' && selectedShards.length > 1) {
        let united: paper.PathItem = selectedShards[0];
        for (let i = 1; i < selectedShards.length; i++) {
            united = united.unite(selectedShards[i]);
        }
        finalPaperShapes = [...remainingShards, united];
    } else if (this.settings.buildMode === 'subtract') {
        finalPaperShapes = remainingShards;
    } else {
        finalPaperShapes = [...remainingShards, ...selectedShards];
    }
    
    finalPaperShapes.forEach(shape => {
      const twoShape = this.paperPathToTwoShape(shape, group);

      const applyFinalStyle = (s: any) => {
          if (s instanceof Two.Group) {
              s.children.forEach(applyFinalStyle);
          } else if (s instanceof Two.Path) { // Check if it's a drawable shape
              s.fill = this.settings.fillColor;
              s.stroke = this.settings.strokeColor;
              s.linewidth = this.settings.strokeWidth;
          }
      };
      applyFinalStyle(twoShape);

      group.add(twoShape);
    });

    this.exitBuildMode();
    this.enterBuildMode(); // Re-initialize with new shapes
  }


  private handleBrushDown(x: number, y: number, group: Two.Group) {
      const p = new Two.Path([new Two.Anchor(x, y)], false, true);
      p.stroke = this.settings.strokeEnabled ? this.settings.strokeColor : '#000';
      p.linewidth = this.settings.strokeWidth; p.fill = 'transparent';
      group.add(p); this.currentPath = p;
  }
  
  public flattenSelectedShape() {
      if (!this.selectedShape) return;
      
      const s = this.selectedShape;
      const parent = s.parent;
      if (!parent) return;

      const isPrimitive = s instanceof Two.Rectangle || s instanceof Two.Ellipse || s instanceof Two.Polygon || s instanceof Two.Star || s instanceof Two.Line || s._isRoundedRect;
      
      if (s instanceof Two.Path && !isPrimitive) {
          return;
      }

      let path: any;
      
      if (typeof s.toPath === 'function') {
        const isClosed = s.closed !== undefined ? s.closed : true;
        path = s.toPath(isClosed);
      } 
      else if (s instanceof Two.Path) {
        path = s.clone();
      } else {
        return;
      }

      path.matrix.copy(s.matrix);
      path.fill = s.fill;
      path.stroke = s.stroke;
      path.linewidth = s.linewidth;
      path.opacity = s.opacity;
      path.visible = s.visible;
      path.cap = s.cap;
      path.join = s.join;
      
      parent.add(path);
      s.remove();
      
      this.selectShape(path);
      if (this.activeLayerId) this.generateThumbnail(this.activeLayerId);
  }

  public destroy() { 
    this.two.pause(); 
    this.two.renderer.domElement.remove(); 
    this.thumbTwo.renderer.domElement.remove(); 
  }
}