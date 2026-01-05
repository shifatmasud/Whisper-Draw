
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect } from 'react';
import { useTheme } from '../../Theme.tsx';
import { Layer } from '../../types/index.tsx';
import LayerItem from '../Core/LayerItem.tsx';
import Button from '../Core/Button.tsx';
import { Reorder } from 'framer-motion';

interface LayersPanelProps {
    layers: Layer[];
    activeLayerId: string | null;
    onAddLayer: () => void;
    onSelectLayer: (id: string) => void;
    onDeleteLayer: (id: string) => void;
    onDuplicateLayer: (id: string) => void;
    onUpdateLayerProperty: (id: string, properties: Partial<Layer>) => void;
    onReorderLayers: (layers: Layer[]) => void;
    onContentDragStart: () => void;
    onContentDragEnd: () => void;
    onGroupSelection: () => void;
    onUngroup: (id: string) => void;
}

// Recursive Layer List Component
const LayerList: React.FC<{
    layers: Layer[];
    onReorder: (layers: Layer[]) => void;
    depth?: number;
    parent?: Layer;
    // Pass-through props
    activeLayerId: string | null;
    onSelectLayer: (id: string) => void;
    onDeleteLayer: (id: string) => void;
    onDuplicateLayer: (id: string) => void;
    onUpdateLayerProperty: (id: string, properties: Partial<Layer>) => void;
    onContentDragStart: () => void;
    onContentDragEnd: () => void;
    onGroupSelection: () => void;
    onUngroup: (id: string) => void;
}> = ({ layers, onReorder, depth = 0, activeLayerId, onSelectLayer, onDeleteLayer, onDuplicateLayer, onUpdateLayerProperty, onContentDragStart, onContentDragEnd, onGroupSelection, onUngroup }) => {
    
    // Wrapper to handle reordering specific to this level
    // When a sub-list reorders, we need to bubble up the change?
    // Actually, Reorder.Group `values` prop matches state. 
    // If we update the state tree correctly, React re-renders this list.
    
    return (
        <Reorder.Group
            axis="y"
            values={layers}
            onReorder={onReorder}
            style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
            }}
        >
            {layers.map(layer => (
                <LayerItem
                    key={layer.id}
                    layer={layer}
                    isActive={layer.id === activeLayerId}
                    depth={depth}
                    onSelect={onSelectLayer}
                    onDelete={onDeleteLayer}
                    onDuplicate={onDuplicateLayer}
                    onUpdateProperty={onUpdateLayerProperty}
                    onDragStart={onContentDragStart}
                    onDragEnd={onContentDragEnd}
                    onGroupSelection={onGroupSelection}
                    onUngroup={onUngroup}
                >
                    {layer.type === 'group' && layer.isOpen && layer.children && (
                        <LayerList 
                            layers={layer.children}
                            onReorder={(newChildren) => {
                                // Update this specific layer's children in the parent's handler?
                                // No, we call onUpdateProperty for THIS layer to update its children.
                                onUpdateLayerProperty(layer.id, { children: newChildren });
                            }}
                            depth={depth + 1}
                            activeLayerId={activeLayerId}
                            onSelectLayer={onSelectLayer}
                            onDeleteLayer={onDeleteLayer}
                            onDuplicateLayer={onDuplicateLayer}
                            onUpdateLayerProperty={onUpdateLayerProperty}
                            onContentDragStart={onContentDragStart}
                            onContentDragEnd={onContentDragEnd}
                            onGroupSelection={onGroupSelection}
                            onUngroup={onUngroup}
                        />
                    )}
                </LayerItem>
            ))}
        </Reorder.Group>
    );
};

const LayersPanel: React.FC<LayersPanelProps> = ({ 
    layers, 
    activeLayerId, 
    onAddLayer, 
    onSelectLayer,
    onDeleteLayer,
    onDuplicateLayer,
    onUpdateLayerProperty,
    onReorderLayers,
    onContentDragStart,
    onContentDragEnd,
    onGroupSelection,
    onUngroup,
}) => {
    const { theme } = useTheme();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'], height: '100%' }}>
            {/* Scroll Wrapper */}
            <div 
                ref={scrollContainerRef}
                style={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    paddingRight: '4px',
                    paddingBottom: '8px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${theme.Color.Base.Surface[3]} transparent`,
                }}
            >
                <LayerList
                    layers={layers}
                    onReorder={onReorderLayers}
                    activeLayerId={activeLayerId}
                    onSelectLayer={onSelectLayer}
                    onDeleteLayer={onDeleteLayer}
                    onDuplicateLayer={onDuplicateLayer}
                    onUpdateLayerProperty={onUpdateLayerProperty}
                    onContentDragStart={onContentDragStart}
                    onContentDragEnd={onContentDragEnd}
                    onGroupSelection={onGroupSelection}
                    onUngroup={onUngroup}
                />
            </div>
            
            <div style={{ borderTop: `1px solid ${theme.Color.Base.Surface[3]}`, paddingTop: theme.spacing['Space.S'], display: 'flex', gap: '8px' }}>
                <Button
                    label="Add Layer"
                    icon="ph-plus"
                    variant="secondary"
                    size="S"
                    onClick={onAddLayer}
                />
                 <Button
                    label="Group"
                    icon="ph-folder-plus"
                    variant="ghost"
                    size="S"
                    onClick={onGroupSelection}
                    disabled={!activeLayerId}
                />
            </div>
        </div>
    );
};

export default LayersPanel;
