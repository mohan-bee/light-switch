# Light

One light switch with ESP connection setup, built with Expo SDK 58 and
TypeScript. The app is a local HTTP client; compatible ESP firmware is required
and is not included. Native device visuals and hardware behavior remain unverified.

## Run

```sh
npm install
npm start
```

Use Expo Go compatible with SDK 58 and scan the terminal QR code. For an Expo
development connection across networks, run `npm run start:tunnel`.
Keep the server running.

Scan the current QR shown by the terminal. The Expo tunnel delivers the app
bundle and does not relay ESP traffic.

## Connect your ESP

1. Implement the HTTP contract below on the ESP.
2. In phone Settings, join the ESP access point or connect phone and ESP to the same Wi-Fi.
3. Return to the app and check for devices. It probes `http://192.168.4.1`, `http://light.local`, and the last successful address.
4. If needed, enter a private IPv4 address or `.local` hostname, with an optional port. Only responding compatible devices appear.
5. Select the device. A fresh status handshake verifies its identity before the switch appears.

This implementation cannot list Wi-Fi SSIDs or join a network from Expo Go.
Only the last address is stored; it never grants a connection. Every 3 seconds,
status polling synchronizes changes made on the ESP. Requests time out after
2.5 seconds. Wi-Fi loss, an unreachable or changed device, or backgrounding
returns to setup. A toggle remains busy until the ESP confirms its actual state.

Developer preview is the explicit button at the bottom of setup. It starts Off,
makes no ESP requests, and keeps no persistent preview state. Exit preview
returns to setup.

## ESP firmware contract

Use local HTTP and return a successful JSON status for both endpoints:

```json
{
  "protocol": "light-switch/v1",
  "id": "living-room-esp",
  "name": "Living room light",
  "on": false
}
```

- `GET /api/status`: report the current physical light state.
- `POST /api/light`: accept `Content-Type: application/json` with the identity-bound body below. Compare `id` with this ESP's own ID **before changing the output**. On mismatch, return HTTP 409 without changing the light. On success, return the full status object with the same ID and the actual applied state.

```json
{ "id": "living-room-esp", "on": true }
```

The protocol string must match exactly. IDs must be stable, nonempty strings
of at most 64 characters; names must be nonempty strings of at most 48 characters;
`on` must be boolean. The client checks identity again on connection, polling,
and command responses. This is polling and confirmed HTTP control, without
MQTT or server push. No ESP firmware or relay wiring is provided.

## Checks and runtime limits

```sh
npm run typecheck
npm run lint
node --test services/esp.test.cjs
npx expo install --check
npx expo export --platform all
npm run web
```

Bundling and simulated checks do not verify a phone's local-network access,
SVG rendering, 3D transforms, or real relay operation. Expo Go uses its own
native permissions and transport policy; local HTTP must be validated on the
actual phone.

The project config includes an iOS local-network permission message, scoped
local-network/private-address HTTP allowances, and Android cleartext support.
These apply only to new native builds, not the installed Expo Go host. To build
with the corresponding native toolchain:

```sh
npx expo run:ios
# or
npx expo run:android
```

Browser requests to local HTTP also depend on CORS and mixed-content restrictions.
