---
name: Light
description: One physical light switch with clear ESP setup.
colors:
  screen: "#FFFFFF"
  ink: "#17181A"
  primary: "#2231DD"
  secondary: "#5C5B56"
  muted: "#6F6E68"
  border: "#DADAD6"
  divider: "#E8E8E5"
  error: "#A23125"
  connected: "#337255"
  shell-mid: "#F4F5F7"
  shell-shade: "#DDE0E5"
  led-glow: "#6875FF"
  led-highlight: "#A7B4FF"
typography:
  wordmark:
    fontSize: "22px"
    fontWeight: 600
    letterSpacing: "-0.7px"
  setup-title:
    fontSize: "32px"
    lineHeight: "38px"
    fontWeight: 500
    letterSpacing: "-1.1px"
  device-title:
    fontSize: "26px"
    lineHeight: "34px"
    fontWeight: 500
    letterSpacing: "-0.7px"
  body:
    fontSize: "15px"
    lineHeight: "23px"
  metadata:
    fontSize: "12px"
    lineHeight: "18px"
  action:
    fontSize: "14px"
    fontWeight: 500
rounded:
  field: "10px"
  switch-hit: "18px"
  rocker-face: "5px"
spacing:
  page-horizontal: "24px"
  page-top: "12px"
  page-bottom: "20px"
components:
  find-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.screen}"
    rounded: "{rounded.field}"
    typography: "{typography.action}"
    height: "48px"
    padding: "0 16px"
  address-input:
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "48px"
    padding: "0 12px"
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

Light uses a plain white canvas, dark ink, and a restrained blue accent drawn from the user's bencho.dev reference. Setup presents responding ESP devices with clear network guidance. A successful connection reveals one centered molded SVG rocker, without an outer tile or visible ON/OFF words.

This records the current React Native source. Native screenshots and hardware verification are unavailable; the sidecar intentionally contains no simulated native component preview.

## Colors

Blue marks primary actions, focus, the wordmark dot, signal illustration, and active LED. Neutral gray secondary copy and fine dividers support the ink headings. Connected status has a small green dot; preview status uses blue. The device's silver/ivory material gradients remain within its SVG artwork.

## Typography

Use the platform's default font family and the roles above. “Light.” is the wordmark, “Find your light.” is the setup heading, and the connected heading uses the device's reported name. Functional supporting copy remains visible; the rocker has no ON/OFF words.

## Layout

Use a scrollable safe-area layout capped at 440 units wide, with the page spacing tokens above. Keyboard avoidance uses padding on iOS and height adjustment elsewhere. Setup contains the signal illustration, heading, responding-device list, manual-address disclosure, and a bottom Developer preview action.

The connected view centers one 80-by-96-unit device scaled to 1.7 within a 144-by-184-unit hit area and a 260-unit-high stage. It includes connection status, the device name, sending/tap feedback, and local address details. Dimensions use React Native layout units.

## Elevation & Depth

The molded rocker uses SVG material gradients, a recessed well, contact shading, an etched power mark, and a small offset face shadow. A 15-by-3-unit LED has a localized blue glow inside a 42-by-21-unit artwork region before scaling. The surrounding interface stays flat and white.

## Shapes

Inputs and the Find action use 10-unit corners. The switch hit area has 18-unit corners; the internal SVG uses its own shell, rim, well, and rocker geometry. Device rows use fine bottom dividers rather than surrounding cards.

## Components

- **Device setup:** only responding compatible ESPs appear as named rows. Refresh/search/connect feedback and error text are explicit. A manual address field has a blue focus border; Find uses 0.4 disabled opacity. Pressed setup actions use 0.65 opacity.
- **Single switch:** accessibility role switch, name “Light,” and checked/busy/disabled state. Commands disable the control while pending. Focus uses a 2-unit blue outline offset by 8 units; web supports Space activation.
- **State and motion:** Off tilts −10° and On +10°, with perspective 320. Tilt, contact shades, and LED opacity use 280 ms cubic ease-out. Press feedback springs to 0.98 scale (stiffness 300, damping 24, mass 0.8). Screen changes fade and rise 8 units over 280 ms. The searching signal pulses between 1 and 0.25 opacity in 700 ms legs. Reduced motion makes these changes immediate and stops the pulse.
- **Preview:** visibly labeled Developer preview, with Exit preview in the header. Keep it visually and behaviorally distinct from a confirmed device connection.

## Do's and Don'ts

- Do keep setup distinct from the connected single-switch view.
- Do preserve the white canvas, ink typography, blue actions, and localized blue LED glow.
- Do expose connection progress, errors, confirmed state, focus, busy semantics, and reduced-motion behavior.
- Don't add a dashboard, multiple switches, add/remove controls, or an outer switch tile.
- Don't imply SSID scanning, automatic Wi-Fi joining, live hardware confirmation in preview, or push updates.
