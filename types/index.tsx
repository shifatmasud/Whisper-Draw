
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Window Management ---
export type WindowId = 'properties' | 'assets' | 'layers';

export interface WindowState {
  id: WindowId;
  title: string;
  isOpen: boolean;
  zIndex: number;
  x: number;
  y: number;
}

// --- Canvas & Layering ---
export type BlendMode = 
  | 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' 
  | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' 
  | 'soft-light' | 'difference' | 'exclusion' | 'hue' 
  | 'saturation' | 'color' | 'luminosity' | 'destination-out';

export interface Layer {
    id: string;
    name: string;
    isVisible: boolean;
    opacity: number;
    blendMode: BlendMode;
    // Transforms
    x: number;
    y: number;
    scale: number;
    rotation: number;
}

// --- Tooling ---
export type Tool = 'select' | 'brush' | 'delete' | 'pen' | 'eraser' | 'fill' | 'shape';
export type SelectionMode = 'vector' | 'layer';

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'bevel' | 'round' | 'miter';
export type PenHandleMode = 'mirrored' | 'disconnected';

// Shape Tool Types
export type ShapeType = 'rectangle' | 'ellipse' | 'line' | 'polygon' | 'star';
export type ShapeMode = 'insert' | 'build';
export type BuildMode = 'add' | 'subtract';

export interface ToolSettings {
    strokeColor: string;
    fillColor: string;
    strokeWidth: number;
    opacity: number;
    lineCap: LineCap;
    lineJoin: LineJoin;
    strokeEnabled: boolean;
    fillEnabled: boolean;
    // Selection Specific
    selectionMode: SelectionMode;
    // Pen Specific
    penHandleMode: PenHandleMode;
    penClosePath: boolean;
    // Shape Tool Specific
    shapeType: ShapeType;
    shapeMode: ShapeMode;
    buildMode: BuildMode;
    cornerRadius: number;
    starPoints: number;
    starInnerRadius: number; // 0 to 1
    polygonSides: number;
}

// --- Engine Events ---
export type SelectedObjectType = ShapeType | 'path' | null;

export interface SelectionState {
  layerId: string | null;
  shapeId: string | null;
  type: 'path' | 'group' | 'none';
}

// FIX: Add LogEntry type for console logs
export interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
}

// FIX: Add Button types for props and centralize them
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';
export type ButtonSize = 'S' | 'M' | 'L';

export interface MetaButtonProps {
  label: string;
  variant: ButtonVariant;
  size: ButtonSize;
  icon: string;
  customRadius: string;
  customFill?: string;
  customColor?: string;
  disabled: boolean;
  forcedHover: boolean;
  forcedFocus: boolean;
  forcedActive: boolean;
}
