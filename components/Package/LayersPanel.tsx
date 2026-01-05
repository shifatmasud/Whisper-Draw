
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useState } from 'react';
import { useTheme } from '../../Theme.tsx';
import { Layer } from '../../types/index.tsx';
import LayerItem from '../Core/LayerItem.tsx';
import Button from '../Core/Button.tsx';
import { Reorder, AnimatePresence, motion } from 'framer-motion';

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
    onMoveLayer: (layerId: string, targetGroupId: string | null) => void;
}

// Recursive Layer List Component
const LayerList: React.FC<{
    layers: Layer[];
    onReorder: (layers: Layer[]) => void;
    depth?: number;
    activeLayerId: string | null;
    onSelectLayer: (id: string) => void;
    onDeleteLayer: (id: string) => void;
    onDuplicateLayer: (id: string) => void;
    onUpdateLayerProperty: (id: string, properties: Partial<Layer>) => void;
    onContentDragStart: () => void;
    onContentDragEnd: () => void;
    onGroupSelection: () => void;
    onUngroup: (id: string) => void;
    // Drag/Drop Props
    draggedLayerId: string | null;
    hoveredTargetId: string | null;
    onDragItemStart: (id: string) => void;
    onDragItemEnd: () => void;
    onDragOver: (clientX: number, clientY: number) => void;
}> = ({ 
    layers, onReorder, depth = 0, activeLayerId, onSelectLayer, onDeleteLayer, onDuplicateLayer, 
    onUpdateLayerProperty, onContentDragStart, onContentDragEnd, onGroupSelection, onUngroup,
    draggedLayerId, hoveredTargetId, onDragItemStart, onDragItemEnd, onDragOver
}) => {
    
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
                    // Drag/Drop
                    draggedLayerId={draggedLayerId}
                    hoveredTargetId={hoveredTargetId}
                    onDragItemStart={onDragItemStart}
                    onDragItemEnd={onDragItemEnd}
                    onDragOver={onDragOver}
                >
                    {layer.type === 'group' && layer.isOpen && layer.children && (
                        <LayerList 
                            layers={layer.children}
                            onReorder={(newChildren) => onUpdateLayerProperty(layer.id, { children: newChildren })}
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
                            draggedLayerId={draggedLayerId}
                            hoveredTargetId={hoveredTargetId}
                            onDragItemStart={onDragItemStart}
                            onDragItemEnd={onDragItemEnd}
                            onDragOver={onDragOver}
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
    onMoveLayer
}) => {
    const { theme } = useTheme();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    
    // Custom Drag State for Reparenting
    const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
    const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);

    const handleDragItemStart = (id: string) => {
        setDraggedLayerId(id);
        onContentDragStart(); // Tell window to stop dragging
    };

    const handleDragOver = (clientX: number, clientY: number) => {
        // Use elementFromPoint to find if we are over a group or the root zone
        // We use elementsFromPoint to find targets even if the dragged item is covering them
        const elements = document.elementsFromPoint(clientX, clientY);
        
        let foundTarget = false;
        
        // Find Root Zone
        const rootZoneEl = elements.find(el => el.getAttribute('data-is-root-zone') === 'true');
        if (rootZoneEl) {
             setHoveredTargetId('root-zone');
             foundTarget = true;
        } 
        
        // Find Group
        if (!foundTarget) {
            const groupEl = elements.find(el => {
                const isGroup = el.getAttribute('data-is-group') === 'true';
                const id = el.getAttribute('data-layer-id');
                // Ensure we don't drop into self
                return isGroup && id && id !== draggedLayerId;
            });
            
            if (groupEl) {
                 const groupId = groupEl.getAttribute('data-layer-id');
                 setHoveredTargetId(groupId);
                 foundTarget = true;
            }
        }
        
        if (!foundTarget) {
             setHoveredTargetId(null);
        }
    };

    const handleDragItemEnd = () => {
        if (draggedLayerId && hoveredTargetId) {
             if (hoveredTargetId === 'root-zone') {
                 onMoveLayer(draggedLayerId, null); // Move to root
             } else {
                 onMoveLayer(draggedLayerId, hoveredTargetId); // Move to group
             }
        }
        setDraggedLayerId(null);
        setHoveredTargetId(null);
        onContentDragEnd();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'], height: '100%', position: 'relative' }}>
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
                    position: 'relative'
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
                    // Drag Props
                    draggedLayerId={draggedLayerId}
                    hoveredTargetId={hoveredTargetId}
                    onDragItemStart={handleDragItemStart}
                    onDragItemEnd={handleDragItemEnd}
                    onDragOver={handleDragOver}
                />
            </div>
            
            {/* Drop to Root Zone - Only visible when dragging */}
            <AnimatePresence>
                {draggedLayerId && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: '48px' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{
                            borderRadius: theme.radius['Radius.S'],
                            border: `2px dashed ${hoveredTargetId === 'root-zone' ? theme.Color.Warning.Content[1] : theme.Color.Base.Surface[3]}`,
                            backgroundColor: hoveredTargetId === 'root-zone' ? theme.Color.Warning.Surface[1] : `${theme.Color.Base.Surface[2]}88`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: hoveredTargetId === 'root-zone' ? theme.Color.Warning.Content[1] : theme.Color.Base.Content[2],
                            gap: '8px',
                            ...theme.Type.Readable.Label.S,
                            cursor: 'default',
                            flexShrink: 0,
                            marginBottom: theme.spacing['Space.S']
                        }}
                        data-is-root-zone="true"
                    >
                        <i className="ph-bold ph-eject" />
                        <span>Drop to Un-group</span>
                    </motion.div>
                )}
            </AnimatePresence>
            
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
