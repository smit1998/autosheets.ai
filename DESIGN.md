---
name: Cognitive Enterprise
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c4c5d9'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#8e90a2'
  outline-variant: '#434656'
  surface-tint: '#b8c3ff'
  primary: '#b8c3ff'
  on-primary: '#002388'
  primary-container: '#2e5bff'
  on-primary-container: '#efefff'
  inverse-primary: '#124af0'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#89ceff'
  on-tertiary: '#00344d'
  tertiary-container: '#0074a6'
  on-tertiary-container: '#e4f2ff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c3ff'
  on-primary-fixed: '#001356'
  on-primary-fixed-variant: '#0035be'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#c9e6ff'
  tertiary-fixed-dim: '#89ceff'
  on-tertiary-fixed: '#001e2f'
  on-tertiary-fixed-variant: '#004c6e'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  data-tabular:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  container-max: 1440px
  gutter: 24px
---

## Brand & Style

This design system is engineered for a high-performance enterprise environment where artificial intelligence is a core collaborator, not just a feature. The brand personality is authoritative, precise, and visionary. It aims to evoke a sense of "calm intelligence"—reducing the cognitive load of administrative time-tracking through a clean, futuristic interface.

The design style merges **Modern Corporate** structure with **Glassmorphism** and **Minimalism**. It utilizes a dark-themed foundation to represent a "command center" feel, where data is illuminated through vibrant accents. Glassmorphic layers are reserved specifically for AI-driven insights, creating a clear visual distinction between human-input data and machine-suggested content.

## Colors

The palette is anchored in deep neutrals to provide a sophisticated, enterprise-grade foundation.
- **Core Neutrals:** Deep charcoal and slate grays comprise the background and primary containers, ensuring high contrast for data visualization.
- **AI Activity:** Vibrant electric blue and indigo serve as the primary action colors. These are used for active states, AI-driven suggestions, and progress indicators.
- **Functional Gradients:** Subtle linear gradients are applied to buttons and "smart" components to signify vitality and modern tech capabilities.
- **Semantic Colors:** Critical status updates use desaturated reds and ambers, ensuring they don't overpower the "AI-first" blue aesthetic.

## Typography

This design system utilizes a dual-font strategy. **Space Grotesk** is used for headlines and prominent data points to provide a technical, futuristic edge. **Inter** is the workhorse for all body copy, inputs, and complex data tables, chosen for its exceptional legibility and neutral tone.

Data legibility is prioritized: all numerical values in timesheets should utilize tabular lining (tnum) to ensure vertical alignment in tables. Labels use a slightly heavier weight and increased letter spacing to remain distinct from body content.

## Layout & Spacing

The layout follows a **Fluid Grid** model built on a 12-column system. Elements align to a 4px baseline grid to maintain rigorous mathematical consistency.

Margins and gutters are generous (24px) to prevent the dense enterprise data from feeling overwhelming. Horizontal spacing is used to create clear groupings within cards, while vertical rhythm is driven by the 4px unit to separate logical sections of the timesheet.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Glassmorphism**.
- **Level 0 (Background):** Deepest slate (#020617).
- **Level 1 (Cards):** Slightly lighter slate (#0F172A) with a 1px border (#1E293B).
- **Level 2 (Interactive/Hover):** Soft, diffused ambient shadows with a subtle blue tint (rgba(46, 91, 255, 0.15)).
- **AI Suggested Layers:** Elements suggested by the AI use a backdrop-blur (12px) and semi-transparent indigo surface (rgba(99, 102, 241, 0.08)). This "glass" effect makes suggestions appear to float above the standard manual entries.

## Shapes

The shape language is "Soft" yet disciplined. Standard components like input fields and buttons use a 0.25rem (4px) radius to maintain a professional, high-tech feel. Larger containers and cards use a 0.5rem (8px) radius to soften the overall interface. Circular "pill" shapes are reserved exclusively for status indicators and badges to make them instantly recognizable as interactive or state-based elements.

## Components

### Buttons & Inputs
Buttons use high-contrast fills. The primary action button features the electric blue gradient. Input fields are dark-filled with subtle borders that glow blue on focus.

### Interactive Data Tables
Tables are the heart of the app. Rows feature subtle hover states and clear vertical separators. AI-populated rows are distinguished by a vertical indigo "suggestion bar" on the left edge and a faint glassmorphic background tint.

### AI Activity Status
A dedicated "AI Tracking" toggle component. When 'On', it displays a pulsing blue glow effect. When 'Off', it reverts to a desaturated slate.

### Smart Suggestion Badges
Small, pill-shaped chips with a glassmorphic blur and an icon (e.g., a sparkle). These are used to tag time entries that were automatically detected or categorized.

### Activity Status Indicators
Real-time indicators showing active tracking. These use "live" animations—small, subtle wave or pulse patterns in electric blue to show the system is actively processing data.
