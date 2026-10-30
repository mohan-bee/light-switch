# Light

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

React Native, TypeScript, Expo SDK 58, expo-network, AsyncStorage, and react-native-svg.

## Product Purpose

Connect to one compatible ESP and control one light through its local HTTP API.
A separate Developer preview demonstrates the switch without hardware.

## Operating Context

Join the ESP's Wi-Fi or the same home network using the phone's Settings.
The app checks Wi-Fi state and probes known local addresses; it does not scan
Wi-Fi SSIDs or join networks. Compatible ESP firmware must be supplied separately.

## Capabilities and Constraints

- Setup lists only responding, protocol-compatible devices by their reported names.
- Probe 192.168.4.1, light.local, the last successful address, or a manually entered private IPv4/.local address.
- Require a fresh status handshake before showing the single light switch.
- Read reported state every 3 seconds, with a 2.5-second request timeout. A lost connection or identity change returns to setup.
- Send an identity-bound command and show the state confirmed by the ESP response.
- Disable the switch while a command is pending; expose checked, busy, and disabled semantics.
- Save only the last address as a discovery hint. Connections and Developer preview state are not persisted.
- Backgrounding the app ends the session. Developer preview makes no device requests.
- No dashboard, add/remove controls, MQTT, push channel, or firmware implementation.

## Brand Commitments

Follow the user's bencho.dev reference: plain white, dark ink, restrained blue,
clear setup copy, and one centered physical SVG rocker after connection.
Keep the small blue LED glow localized; do not add visible ON/OFF words or
an outer tile around the switch.
