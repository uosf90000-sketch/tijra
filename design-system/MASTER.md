# TIJRA Design System

Generated for TIJRA using the UI/UX Pro Max design-intelligence approach and 21st.dev-inspired motion patterns.

## Product character
- Arabic-first, RTL, mobile-first.
- Calm operational SaaS, not flashy consumer fintech.
- Dense information must remain scannable for shop owners using phones.
- Premium feel comes from hierarchy, spacing, clarity, subtle depth and purposeful motion.

## Visual direction
- Style: modern SaaS + soft glass accents + bento dashboard composition.
- Primary: emerald/teal family for trust, inventory and commerce.
- Neutral canvas: warm off-white with high-contrast ink.
- Accent: indigo for intelligence/AI, amber for attention, red only for urgent stock/payment states.
- Cards: 18-24px radius, thin neutral border, very soft shadow.
- Avoid excessive gradients, neon, heavy blur, skeuomorphism and decorative animation.

## Typography
- Arabic UI should prioritize readability at small sizes.
- Strong 700-800 headings; 500-600 labels; regular body.
- Tabular numbers for prices, quantities and accounting values when available.

## Spacing
- 4px base rhythm.
- Mobile page padding 16px; tablet 20px; desktop 28-32px.
- Card padding 18-24px.
- Minimum interactive target 44px.

## Motion / 21st.dev-inspired effects
- Motion must communicate state or hierarchy.
- Prefer CSS transform + opacity effects; avoid adding a heavy animation runtime just for decoration.
- Hover lift: 2-4px with subtle shadow increase.
- Press: scale 0.98.
- Page/card reveal: 220-360ms, small translateY only.
- Intelligent/AI surfaces may use a slow shimmer or glow, never constant high-motion backgrounds.
- Notification affordances may pulse subtly only while actionable.
- Respect prefers-reduced-motion and render final states immediately.

## UX rules
- Put the next operational action near the data that motivates it.
- Every stock warning must show remaining quantity + reorder threshold + action.
- Every Smart Price alert must show old price, new price, percentage, unit saving and estimated order saving.
- Do not hide core navigation behind animation.
- Avoid horizontal scroll on phone except data tables with clear overflow treatment.
- Empty states must explain the next action.
- Supplier and retailer contexts must remain visually distinguishable when role switching is introduced.
