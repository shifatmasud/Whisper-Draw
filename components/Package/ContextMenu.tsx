/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';

type MenuItem = {
  label: string;
  onClick?: () => void;
  icon?: string;
  isDestructive?: boolean;
  isSelected?: boolean;
  subItems?: MenuItem[];
};

type Separator = { type: 'separator' };

type ContextMenuItem = MenuItem | Separator;

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

const Menu: React.FC<{ items: ContextMenuItem[], onClose: () => void }> = ({ items, onClose }) => {
    const { theme } = useTheme();
    const [activeSubMenu, setActiveSubMenu] = useState<number | null>(null);

    const handleItemClick = (item: MenuItem) => {
        if (item.onClick) {
            item.onClick();
            onClose();
        }
    };
    
    const itemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing['Space.M'],
        padding: `${theme.spacing['Space.S']} ${theme.spacing['Space.M']}`,
        ...theme.Type.Readable.Label.M,
        cursor: 'pointer',
        borderRadius: theme.radius['Radius.S'],
        userSelect: 'none',
    };

    return (
        <div style={{ minWidth: '180px' }}>
            {items.map((item, index) => {
                if ('type' in item && item.type === 'separator') {
                    return <div key={index} style={{ height: '1px', backgroundColor: theme.Color.Base.Surface[3], margin: `${theme.spacing['Space.S']} 0` }} />;
                }

                const menuItem = item as MenuItem;
                const hasSubMenu = menuItem.subItems && menuItem.subItems.length > 0;
                const isSubMenuOpen = activeSubMenu === index;

                return (
                    <div key={index} style={{ position: 'relative' }} onMouseEnter={() => hasSubMenu && setActiveSubMenu(index)} onMouseLeave={() => hasSubMenu && setActiveSubMenu(null)}>
                        <motion.div
                            onClick={() => handleItemClick(menuItem)}
                            style={{
                                ...itemStyle,
                                color: menuItem.isDestructive ? theme.Color.Error.Content[1] : theme.Color.Base.Content[1],
                                backgroundColor: menuItem.isSelected ? theme.Color.Accent.Surface[1] : 'transparent',
                            }}
                            whileHover={{ backgroundColor: menuItem.isSelected ? theme.Color.Accent.Surface[1] : (menuItem.isDestructive ? theme.Color.Error.Surface[1] : theme.Color.Base.Surface[3]) }}
                        >
                            {menuItem.icon && <i className={`ph-bold ${menuItem.icon}`} />}
                            <span style={{ flex: 1 }}>{menuItem.label}</span>
                            {hasSubMenu && <i className="ph-bold ph-caret-right" />}
                        </motion.div>
                        <AnimatePresence>
                        {hasSubMenu && isSubMenuOpen && (
                             <motion.div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: '100%',
                                    marginLeft: '4px',
                                    padding: theme.spacing['Space.XS'],
                                    backgroundColor: theme.Color.Base.Surface[2],
                                    borderRadius: theme.radius['Radius.M'],
                                    boxShadow: theme.effects['Effect.Shadow.Drop.2'],
                                    border: `1px solid ${theme.Color.Base.Surface[3]}`,
                                }}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.1 }}
                            >
                                <Menu items={menuItem.subItems!} onClose={onClose} />
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
};


const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const { theme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: position.y,
    left: position.x,
    zIndex: 9999,
    padding: theme.spacing['Space.XS'],
    backgroundColor: `${theme.Color.Base.Surface[2]}f0`,
    backdropFilter: 'blur(10px)',
    borderRadius: theme.radius['Radius.M'],
    boxShadow: theme.effects['Effect.Shadow.Drop.3'],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
  };

  return createPortal(
    <motion.div
      ref={menuRef}
      style={menuStyle}
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onPointerDown={e => e.stopPropagation()}
    >
      <Menu items={items} onClose={onClose} />
    </motion.div>,
    document.body
  );
};

export default ContextMenu;