# Visual Critique & Refinement Guide

## Self-Critique Loop (After Rendering Preview)
Inspect the rendered PNG (`scripts/render-preview.mjs`) and check:
1. **Clipping & Overflow**: Is any text cut off, wrapping awkwardly, or overlapping an adjacent shape?
2. **Margins & Alignment**: Are outer margins balanced? Do left/center axes align across sections?
3. **Hierarchy & Readability**: Does the eye land on the primary message first? Is small text legible at target viewing size?
4. **Contrast**: Does every text element have clear contrast against its background or photo?
5. **Multilingual Shaping**: Are Malayalam/Hindi conjuncts and vowel signs rendered cleanly without tofu (`□`) or broken ligatures?

## Existing-Design Critique Rubric
When critiquing a user-supplied design, structure your response into:
1. **What is working**: Specific strengths (palette cohesion, focal point, clear CTA).
2. **What is not working & why**: Concrete issues (e.g., "The 14px light-grey date text over the bright gradient has ~1.8:1 contrast, making it unreadable on mobile").
3. **Actionable improvements**: Exact changes to font sizes, weights, spacing, alignment, contrast, or layout grid.
4. **Optional Redesign**: Offer to reconstruct the design as an editable `.bauhaus.json` in Bauhaus Studio.
