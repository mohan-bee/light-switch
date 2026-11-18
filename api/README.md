# GO Switch device client

[`goSwitch.ts`](goSwitch.ts) talks to compatible GO Switch firmware over HTTPS and secure WebSocket.

## Secure provisioning and discovery

Use ESP-IDF Unified Provisioning over BLE with Security 2, patch level 1, and advertise a unique `GO-SW-` service name while in provisioning mode. Supply each switch with a unique SRP6a username and setup password. Create the `goswitch-pair` endpoint before starting provisioning and register its handler after startup. Require a successful ownership exchange before accepting credentials through `prov-config` in the same authenticated BLE session.

| Endpoint request | Firmware behavior |
| --- | --- |
| `{ "action": "pair" }` | Issue an owner token during physically enabled initial setup. Make retries return the same token for the authorized owner so the app can recover after losing the final BLE response. |
| `{ "action": "change_wifi", "device_id": "GO-SW-001", "token": "..." }` | Verify the existing owner token and ID before accepting Wi-Fi changes. Return the same token, ID, and HTTPS hostname. Permit an owner to enter BLE provisioning mode again without a firmware flash or a factory reset. |

Both actions return compact JSON such as `{ "device_id": "GO-SW-001", "token": "...", "api_hostname": "go-sw-001.example.com" }`. Keep the response small enough for the BLE endpoint. Use a stable device ID up to 64 characters and a unique random bearer token, for example a base64url-encoded 32-byte value. The hostname is a stable DNS name covered by the device certificate.

After the authenticated endpoint exchange, the app uses standard ESP-IDF `prov-config` to set credentials, apply them, and confirm that the ESP32 joined Wi-Fi. Keep the existing owner credential valid if a Wi-Fi change fails.

Once connected, advertise `_goswitch._tcp.local.` through DNS-SD on the HTTPS API port with TXT keys `device_id` and `api_hostname` matching the BLE response. The phone uses the authenticated BLE hostname with the advertised port and checks the device ID again over HTTPS. Configure local DNS so the paired hostname resolves to the switch from the phone. A public DNS name with a publicly trusted certificate or a private CA trusted by the native app can provide TLS. Android requires app-scoped trust configuration or a system-trusted CA for private certificates.

## Firmware API

The device uses a certificate trusted by the phone and valid for the TLS hostname supplied during secure BLE pairing. Each API request and WebSocket upgrade carries `Authorization: Bearer <device_token>`. The device verifies the credential before serving data, changing a relay, or upgrading a connection. It returns 401 or 403 when credentials fail. Use a unique, cryptographically random token per device or owner.

| Endpoint | Contract |
| --- | --- |
| `GET /api/v1/device` | Returns `{ "device_id": "GO-SW-001", "model": "GO-SWITCH-1CH", "firmware": "1.0.0", "status": "online" }`. The device ID must match the ID supplied during secure pairing. |
| `GET /api/v1/relay` | Returns `{ "state": "off" }` using `"off"` or `"on"`. |
| `PUT /api/v1/relay` | Accepts a JSON body with `state` set to `"on"` or `"off"`. On success, it returns `{ "success": true, "relay": { "state": "on" } }` with the applied state. |
| `GET /api/v1/network` | Returns `{ "connected": true, "ssid": "Home", "ip": "192.168.1.42" }`. Omit `ssid` and `ip` when unavailable. |
| `WSS /api/v1/events` | Upgrades with the bearer header. Sends text JSON such as `{ "event": "relay.state_changed", "relay": 1, "state": "on" }`. Emit events when the state changes via API or physically at the device. |

Serve these endpoints directly and keep the credential in the header. The app checks TLS and verifies the stored device ID when it discovers the device.

Run the client tests from the repo root with `node --test api/*.test.cjs`.

## Earlier ESP firmware protocol

[`esp.ts`](esp.ts) contains the earlier standalone HTTP client for firmware using `light-switch/v1`.

The ESP serves both endpoints over local HTTP and returns the same JSON status shape:

```json
{
  "protocol": "light-switch/v1",
  "id": "living-room-esp",
  "name": "Living room light",
  "on": false
}
```

- `GET /api/status` reports the current physical light state.
- `POST /api/light` accepts a JSON body such as `{ "id": "living-room-esp", "on": true }`. The firmware checks the ID before changing the output and returns HTTP 409 on mismatch. On success, it returns the status with its own ID and the applied state.

The client accepts private IPv4 addresses and `.local` hostnames, with an optional port. Requests time out after 2.5 seconds. Device IDs must be stable, nonempty strings of at most 64 characters. Names must be nonempty strings of at most 48 characters, and `on` must be boolean.
