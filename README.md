# Light

Light is an Expo app for GO Switch ESP32 relays. It opens directly to the rocker for the selected switch. Device settings handle Bluetooth pairing, Wi-Fi changes, and selecting another paired switch.

- [`frontend/`](frontend/) contains the app and [design system](frontend/DESIGN.md).
- [`api/`](api/) contains the authenticated [device client and firmware contract](api/README.md).

## Run the app

Use a current Node.js 24 release and a physical Android or iOS phone. Bluetooth setup and local discovery require a native development build.

```sh
cd frontend
npm ci
npx expo run:android --device
# Or, with Xcode and CocoaPods:
npx expo run:ios --device
```

Run `npm start` from `frontend/` to restart Metro for an installed development build. `npm run web` opens a local rocker preview.

On the phone, open **Set up device**, put the switch into Bluetooth provisioning mode, and select it in the scan results. Enter the setup credentials supplied with the switch and the target Wi-Fi credentials. Connect the phone to the same Wi-Fi to control the relay. To move a paired switch to another router, put it into provisioning mode and choose **Device settings → Change Wi-Fi**.

The mobile app expects firmware implementing the [BLE, DNS-SD, HTTPS, and WebSocket contract](api/README.md). Firmware and device certificates are provisioned separately.

## Checks

```sh
npm --prefix frontend run lint
npm --prefix frontend run typecheck
node --test api/*.test.cjs
```

GitHub Actions runs these checks and builds the web preview and Android app on each pull request. Successful Android runs attach a test-signed ARM64 APK.
