/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { useTheme } from '../../Theme.tsx';
import Button from '../Core/Button.tsx';

const AssetsPanel: React.FC = () => {
    const { theme } = useTheme();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing['Space.M'] }}>
            <p style={{ ...theme.Type.Readable.Body.S, color: theme.Color.Base.Content[2], margin: 0 }}>
                Import images or export your creation.
            </p>
            <Button label="Import PNG / SVG" variant="secondary" size="M" />
            <Button label="Export as PNG" variant="primary" size="M" />
            <Button label="Copy Canvas 2D Code" variant="ghost" size="M" />
        </div>
    );
};

export default AssetsPanel;