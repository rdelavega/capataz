---
name: Bitácora Industrial
colors:
  surface: '#fff8f3'
  surface-dim: '#e3d8cb'
  surface-bright: '#fff8f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fdf2e4'
  surface-container: '#f7ecdf'
  surface-container-high: '#f2e7d9'
  surface-container-highest: '#ece1d3'
  on-surface: '#201b13'
  on-surface-variant: '#58423b'
  inverse-surface: '#353027'
  inverse-on-surface: '#faefe1'
  outline: '#8c7169'
  outline-variant: '#e0c0b6'
  surface-tint: '#a8380f'
  primary: '#a5360d'
  on-primary: '#ffffff'
  primary-container: '#c74d24'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb59e'
  secondary: '#635d58'
  on-secondary: '#ffffff'
  secondary-container: '#eae1da'
  on-secondary-container: '#69635e'
  tertiary: '#5e5c55'
  on-tertiary: '#ffffff'
  tertiary-container: '#77746d'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd0'
  primary-fixed-dim: '#ffb59e'
  on-primary-fixed: '#3a0b00'
  on-primary-fixed-variant: '#852400'
  secondary-fixed: '#eae1da'
  secondary-fixed-dim: '#cdc5bf'
  on-secondary-fixed: '#1f1b17'
  on-secondary-fixed-variant: '#4b4641'
  tertiary-fixed: '#e7e2d9'
  tertiary-fixed-dim: '#cac6be'
  on-tertiary-fixed: '#1d1c16'
  on-tertiary-fixed-variant: '#494740'
  background: '#fff8f3'
  on-background: '#201b13'
  surface-variant: '#ece1d3'
typography:
  headline-lg:
    fontFamily: Oswald
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: 0.02em
  headline-md:
    fontFamily: Oswald
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-sm:
    fontFamily: Oswald
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.2'
  body-lg:
    fontFamily: Archivo
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: Archivo
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.2'
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is built for the rugged environment of a construction site. It moves away from the ethereal nature of modern SaaS and leans into the physical reality of the job site. The aesthetic is **Functional Industrialism**, drawing direct inspiration from technical manuals, weather-resistant field notebooks, and safety signage.

The personality is authoritative, reliable, and "no-nonsense." It prioritizes high legibility in outdoor conditions and tactile clarity. The UI should evoke the feeling of a physical toolset—reliable, heavy-duty, and enduring. Elements are treated as "Control Cards" (fichas) rather than digital layers, emphasizing a flat but structured physical presence.

## Colors
The palette is grounded in the materials of the field. The background utilizes a **Kraft Paper (#F2EDE4)** base to reduce glare and mimic physical stationery. All primary actions are signaled by **Industrial Safety Orange (#D85A30)**, a color synonymous with visibility and caution.

Semantic tones are desaturated and earthier than standard web colors to maintain the "ink on paper" feel. 
- **Ink Black (#2A2622):** Used for all primary text and heavy borders.
- **Construction Earth:** Semantic colors are applied as thick, solid indicators (4px - 8px bars) to denote status on cards and logs.

## Typography
The typography strategy functions as a hierarchy of information types:
- **Oswald:** Used for high-level structure and titles. Its condensed nature mimics technical headers and site signage. Always use in Uppercase for a "stenciled" feel.
- **Archivo:** The workhorse for field notes, daily logs, and descriptions. It provides high readability for long-form entry.
- **JetBrains Mono:** Reserved for technical data, timestamps, GPS coordinates, and ID numbers. The monospaced nature ensures that numerical data aligns perfectly in tables and logs.

## Layout & Spacing
The layout follows a **Rigid Grid System**. Everything is built on a 4px baseline to maintain the alignment found in technical blueprints. 

- **Ficha Layout:** Content is grouped into "Cards" that represent physical files. On mobile, these take up 100% width. On desktop, they follow a multi-column masonry grid that mimics folders on a desk.
- **Margins:** Heavy outer margins are used to keep content away from the edges of devices, simulating the protective border of a clipboard.
- **Dividers:** Use 2px solid lines in Ink Black instead of whitespace to separate sections, reinforcing the "form" or "template" feel.

## Elevation & Depth
This design system rejects all soft shadows and blurs. Depth is communicated through **Structural Stacking** and **Heavy Outlines**:
- **Flat Depth:** Use a "hard shadow" offset of 4px down and 4px right in solid Ink Black for primary buttons or cards to create a tactile, lifted effect without using gradients.
- **Tonal Tiers:** Use slightly darker paper tones (#E5DFD3) to denote "sunken" areas like text inputs or background containers.
- **Heavy Borders:** A universal 2px solid border is used for all interactive elements. For "Active" or "Focus" states, increase the border to 4px.

## Shapes
The shape language is strictly **Geometric and Sharp**. 
- **Corners:** 0px radius (Sharp) for all cards, buttons, and inputs. This reflects the cut of industrial metal and paper forms.
- **Stamps:** The "Rubber Stamp" status elements are the only exception, which may feature a 1px rough edge and a rotation between -3 and +3 degrees to mimic a manual physical strike.

## Components
- **Primary Buttons:** Solid Industrial Orange background with Ink Black 2px border and uppercase Oswald text. Include a 4px hard black shadow for a "clicky" tactile feel.
- **Field Logs (Cards):** Kraft Paper background with a 2px solid border. A thick 8px vertical color bar on the left side indicates status (Green for "Listo", Red for "Incidencia").
- **The Rubber Stamp:** A signature component for status. It uses a thick 3px border, Oswald font, and 15% opacity texture overlay to look "inked." It is placed at an angle over the corner of card images or content blocks.
- **Input Fields:** Rectangular boxes with 2px borders. Use JetBrains Mono for placeholder text to indicate a "technical data entry" area.
- **Status Chips:** Small, rectangular tags with solid background semantic colors and white or black text, depending on contrast. No rounded corners.
- **Checklists:** Large, heavy-duty 24px checkboxes that look like physical markings on a sheet. When checked, use a literal "X" mark rather than a smooth checkmark.