
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import Two from 'two.js';
import paper from 'paper';

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const lerpV = (v1: { x: number; y: number }, v2: { x: number; y: number }, t: number) => ({
  x: lerp(v1.x, v2.x, t),
  y: lerp(v1.y, v2.y, t),
});

/**
 * Splits a Cubic Bezier curve at time t.
 */
// FIX: Use any for Two types to avoid 'Two only refers to a type' error
export const splitBezier = (v1: any, v2: any, t: number) => {
  const p0 = { x: v1.x, y: v1.y };
  const p1 = { x: v1.x + v1.controls.right.x, y: v1.y + v1.controls.right.y };
  const p2 = { x: v2.x + v2.controls.left.x, y: v2.y + v2.controls.left.y };
  const p3 = { x: v2.x, y: v2.y };

  const l1 = lerpV(p0, p1, t), h1 = lerpV(p1, p2, t), h2 = lerpV(p2, p3, t);
  const l2 = lerpV(l1, h1, t), h1_new = lerpV(h1, h2, t);
  const split = lerpV(l2, h1_new, t);

  // FIX: Cast Two to any to access Anchor constructor as a value
  const newAnchor = new (Two as any).Anchor(
    split.x, split.y,
    l2.x - split.x, l2.y - split.y,
    h1_new.x - split.x, h1_new.y - split.y,
    (Two as any).Commands.curve
  );

  const newV1Right = { x: l1.x - p0.x, y: l1.y - p0.y };
  const newV2Left = { x: h2.x - p3.x, y: h2.y - p3.y };

  return { newAnchor, newV1Right, newV2Left };
};

/**
 * Converts Two.js matrix to Paper.js matrix.
 */
// FIX: Use any for Two.Matrix to avoid type resolution issues
export const twoMatrixToPaperMatrix = (twoMatrix: any, paperScope: paper.PaperScope): paper.Matrix => {
  const m = twoMatrix.elements;
  return new paperScope.Matrix(m[0], m[3], m[1], m[4], m[6], m[7]);
};

/**
 * Normalizes imported content, removing nested groups if they only have one child,
 * or applying styling recursively.
 */
export const normalizeImportedContent = (item: any) => {
  // FIX: Cast Two to any for instanceof check and property access
  if (item instanceof (Two as any).Group) {
    item.children.forEach((child: any) => normalizeImportedContent(child));
  } else if (item instanceof (Two as any).Shape) {
    // FIX: Cast to any to access fill and stroke which might not be on the base Shape type
    const shape = item as any;
    if (shape.fill === undefined || shape.fill === 'none') shape.fill = 'black';
    if (shape.stroke === undefined) shape.stroke = 'transparent';
  }
};
