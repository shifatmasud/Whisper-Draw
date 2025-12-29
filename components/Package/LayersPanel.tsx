/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect } from 'react';
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
}

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
}) => {
    const { theme } = useTheme();
    const [isReordering, setIsReordering] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleDragStart = () => {
        setIsReordering(true);
        onContentDragStart();
    };

    const handleDragEnd = () => {
        setIsReordering(false);
        onContentDragEnd();
    };

    // Temporarily disable scrolling on the container during drag to prevent conflict
    useEffect(() => {
        const scrollContainer = scrollContainerRef.current;
        if (scrollContainer) {
            scrollContainer.style.overflowY = isReordering ? 'hidden' : 'auto';
        }
    }, [isReordering]);

    // The `layers` prop is now already in the correct visual order (top-to-bottom).
    // No reversal logic is needed, which simplifies the component and fixes the bug.

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'] }}>
            {/* Scroll Wrapper: Reorder.Group often fails if it is its own scroll container */}
            <div 
                ref={scrollContainerRef}
                style={{ 
                    maxHeight: '350px', 
                    overflowY: 'auto', 
                    paddingRight: '4px',
                    paddingBottom: '8px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${theme.Color.Base.Surface[3]} transparent`,
                    transition: 'overflow 0.2s' // Smooth transition for scrollbar visibility
                }}
            >
                <Reorder.Group
                    axis="y"
                    values={layers}
                    onReorder={onReorderLayers}
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
                            onSelect={onSelectLayer}
                            onDelete={onDeleteLayer}
                            onDuplicate={onDuplicateLayer}
                            onUpdateProperty={onUpdateLayerProperty}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            isReordering={isReordering}
                        />
                    ))}
                </Reorder.Group>
            </div>
            
            <Button
                label="Add Layer"
                icon="ph-plus"
                variant="secondary"
                size="M"
                onClick={onAddLayer}
            />
        </div>
    );
};

export default LayersPanel;