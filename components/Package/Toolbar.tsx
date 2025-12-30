
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';
import { Tool } from '../../types/index.tsx';

interface ToolbarProps {
  activeTool: Tool;
  onToolSelect: (tool: Tool) => void;
}

const TOOLS = [
    { id: 'select' as Tool, icon: 'ph-cursor-click', label: 'Select' },
    { id: 'brush' as Tool, icon: 'ph-paint-brush-broad', label: 'Brush' },
    { id: 'eraser' as Tool, icon: 'ph-eraser', label: 'Eraser' },
    { id: 'fill' as Tool, icon: 'ph-paint-bucket', label: 'Fill' },
    { id: 'pen' as Tool, icon: 'ph-pen-nib', label: 'Pen' },
];

const Toolbar: React.FC<ToolbarProps> = ({ activeTool, onToolSelect }) => {
    const { theme } = useTheme();

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        left: theme.spacing['Space.L'],
        top: '50%',
        translateY: '-50%',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing['Space.S'],
        padding: theme.spacing['Space.S'],
        backgroundColor: `${theme.Color.Base.Surface[1]}aa`,
        backdropFilter: 'blur(16px)',
        borderRadius: '24px',
        boxShadow: theme.effects['Effect.Shadow.Drop.3'],
        border: `1px solid ${theme.Color.Base.Surface[3]}`,
        zIndex: 1000,
        cursor: 'grab',
    };
    
    return (
        <motion.div 
            style={containerStyle}
            drag
            dragMomentum={false}
            whileDrag={{ cursor: 'grabbing' }}
        >
            {TOOLS.map((tool) => (
                <motion.button
                    key={tool.id}
                    onClick={() => onToolSelect(tool.id)}
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '16px',
                        border: 'none',
                        backgroundColor: activeTool === tool.id ? theme.Color.Accent.Surface[1] : 'transparent',
                        color: activeTool === tool.id ? theme.Color.Accent.Content[1] : theme.Color.Base.Content[2],
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                    }}
                    whileHover={{ scale: 1.1, backgroundColor: activeTool === tool.id ? theme.Color.Accent.Surface[1] : theme.Color.Base.Surface[2] }}
                    whileTap={{ scale: 0.95 }}
                    aria-label={tool.label}
                >
                    <i className={`ph-bold ${tool.icon}`} />
                </motion.button>
            ))}
        </motion.div>
    );
};

export default Toolbar;
