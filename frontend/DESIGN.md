---
name: Light
description: A single interactive rocker switch.
colors:
  screen: "#FFFFFF"
  ink: "#17181A"
  primary: "#2231DD"
  muted: "#6F6E68"
  shell-mid: "#F4F5F7"
  shell-shade: "#DDE0E5"
  led-glow: "#6875FF"
  led-highlight: "#A7B4FF"
typography:
  wordmark:
    fontSize: "22px"
    fontWeight: 600
    letterSpacing: "-0.7px"
  device-title:
    fontSize: "26px"
    lineHeight: "34px"
    fontWeight: 500
    letterSpacing: "-0.7px"
  switch-hint:
    fontSize: "13px"
    lineHeight: "20px"
rounded:
  switch-hit: "18px"
  rocker-face: "5px"
spacing:
  page-horizontal: "24px"
  page-top: "12px"
  page-bottom: "20px"
components:
  switch-hit-area:
    rounded: "{rounded.switch-hit}"
    width: "144px"
    height: "184px"
  rocker-device:
    width: "80px"
    height: "96px"
---

# Design System: Light

## Overview

Light uses a plain white canvas, dark ink, and a restrained blue accent drawn from the user's bencho.dev reference. The app opens to one centered molded SVG rocker. Native device settings open in a separate sheet from the header.

## Colors

Blue marks focus, the wordmark dot, and the active LED. The switch hint uses neutral gray. The device's silver and ivory material gradients remain within its SVG artwork.

## Typography

Use the platform's default font family and the roles above. “Light.” is the wordmark and “Living room light” is the heading. The rocker uses the LED and tilt to communicate its state.

## Layout

Use a scrollable safe-area layout capped at 440 units wide, with the page spacing tokens above. Center the 80-by-96-unit rocker at 1.7 scale within a 144-by-184-unit hit area and a 260-unit-high stage. Dimensions use React Native layout units.

## Elevation & Depth

The molded rocker uses SVG material gradients, a recessed well, contact shading, an etched power mark, and a small offset face shadow. A 15-by-3-unit LED has a localized blue glow inside a 42-by-21-unit artwork region before scaling. The surrounding interface stays flat and white.

## Components

- **Single switch** uses the switch accessibility role, the name “Light,” and a checked state. Focus uses a 2-unit blue outline offset by 8 units. Space activates the switch on web.
- **State and motion** come from the tilt, contact shading, and LED. Off tilts −10° and On +10°, with perspective 320. Changes use 280 ms cubic ease-out. Press feedback springs to 0.98 scale with stiffness 300, damping 24, and mass 0.8. Reduced motion applies these changes immediately.
- **Device settings** use the same white canvas, neutral copy, and blue actions. The sheet guides the user through a nearby-device scan and a labeled credential form. Sensitive fields mask their contents, and processing states keep the active action visible.
