/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { useTheme } from '../../Theme.tsx';
import { Layer } from '../../types/index.tsx';
import { motion } from 'framer-motion';

interface LayerItemProps {
    layer: Layer;
    isActive: boolean;
    onSelect: (id: string) => void;
}

const LayerItem: React.FC<LayerItemProps> = ({ layer, isActive, onSelect }) => {
    const { theme } = useTheme();

    const itemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing['Space.M'],
        padding: theme.spacing['Space.S'],
        borderRadius: theme.radius['Radius.S'],
        backgroundColor: isActive ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface[2],
        color: isActive ? theme.Color.Accent.Content[1] : theme.Color.Base.Content[1],
        cursor: 'pointer',
        border: `1px solid ${isActive ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface[3]}`,
        marginBottom: '4px',
    };

    return (
        <motion.div
            style={itemStyle}
            onClick={() => onSelect(layer.id)}
            whileHover={{ backgroundColor: isActive ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface[3] }}
        >
            <i className={`ph-bold ${layer.isVisible ? 'ph-eye' : 'ph-eye-slash'}`} style={{ cursor: 'pointer' }} />
            <span style={{ flex: 1, ...theme.Type.Readable.Label.M, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{layer.name}</span>
        </motion.div>
    );
};

export default LayerItem;