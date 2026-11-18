import CoreBluetooth
import ESPProvision
import ExpoModulesCore
import Foundation

private func supportsSecurity2(_ device: ESPDevice) -> Bool {
  guard let provisioning = device.versionInfo?["prov"] as? [String: Any] else { return false }
  return provisioning["sec_ver"] as? Int == 2 && provisioning["sec_patch_ver"] as? Int == 1
}

private struct SetupCredentials: ESPDeviceConnectionDelegate {
  let username: String
  let password: String

  func getProofOfPossesion(forDevice device: ESPDevice, completionHandler: @escaping (String) -> Void) {
    completionHandler(supportsSecurity2(device) ? password : "")
  }

  func getUsername(forDevice device: ESPDevice, completionHandler: @escaping (String?) -> Void) {
    completionHandler(supportsSecurity2(device) ? username : nil)
  }
}

private struct ProvisioningAttempt {
  let id = UUID()
  let promise: Promise
  let ssid: String
  let password: String
  let request: Data
  let expected: [String: String]?
  var pairing: [String: String]?
}

public final class GoSwitchProvisioningModule: Module {
  private var devices: [String: ESPDevice] = [:]
  private var scanID: UUID?
  private var attempt: ProvisioningAttempt?
  private var connectedDevice: ESPDevice?
  private var deadline: DispatchWorkItem?

  public func definition() -> ModuleDefinition {
    Name("GoSwitchProvisioning")

    AsyncFunction("scan") { (promise: Promise) in
      self.scan(promise)
    }.runOnQueue(.main)

    AsyncFunction("provision") {
      (id: String, username: String, proof: String, ssid: String, password: String,
       deviceID: String, token: String, hostname: String, promise: Promise) in
      self.provision(id, SetupCredentials(username: username, password: proof), ssid, password,
                     deviceID, token, hostname, promise)
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async {
        if self.scanID != nil {
          self.scanID = nil
          ESPProvisionManager.shared.stopESPDevicesSearch()
        }
        self.closeConnection()
      }
    }
  }

  private func scan(_ promise: Promise) {
    guard scanID == nil, attempt == nil else {
      promise.reject("ERR_BLE_BUSY", "Bluetooth setup is already running.")
      return
    }
    guard CBManager.authorization != .denied, CBManager.authorization != .restricted else {
      promise.reject("ERR_BLE_PERMISSION", "Allow Bluetooth in Settings to find your switch.")
      return
    }
    let scan = UUID()
    scanID = scan
    devices.removeAll()
    let manager = ESPProvisionManager.shared
    manager.enableLogs(false)
    manager.searchESPDevices(devicePrefix: "GO-SW-", transport: .ble, security: .secure2) { [weak self] found, _ in
      DispatchQueue.main.async {
        guard let self, self.scanID == scan else { return }
        self.scanID = nil
        for device in found ?? [] where device.name.hasPrefix("GO-SW-") && device.name.utf16.count <= 64 {
          self.devices[device.name] = device
        }
        if CBManager.authorization == .denied || CBManager.authorization == .restricted {
          promise.reject("ERR_BLE_PERMISSION", "Allow Bluetooth in Settings to find your switch.")
        } else {
          promise.resolve(self.devices.keys.sorted().map { ["id": $0, "name": $0] })
        }
      }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
      guard let self, self.scanID == scan else { return }
      self.scanID = nil
      manager.stopESPDevicesSearch()
      promise.reject("ERR_BLE_TIMEOUT", "Turn on Bluetooth and scan again.")
    }
  }

  private func provision(
    _ id: String, _ setup: SetupCredentials, _ ssid: String, _ password: String,
    _ deviceID: String, _ token: String, _ hostname: String, _ promise: Promise
  ) {
    guard scanID == nil, attempt == nil else {
      promise.reject("ERR_BLE_BUSY", "Bluetooth setup is already running.")
      return
    }
    guard let device = devices[id] else {
      promise.reject("ERR_BLE_DEVICE", "Scan again to find your switch.")
      return
    }
    let isNew = deviceID.isEmpty && token.isEmpty && hostname.isEmpty
    guard (isNew || (!deviceID.isEmpty && !token.isEmpty && !hostname.isEmpty)),
          !setup.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          setup.username.utf8.count <= 64,
          !setup.password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          setup.password.utf16.count <= 256,
          (1...32).contains(ssid.utf8.count), password.utf8.count <= 64 else {
      promise.reject("ERR_BLE_CONFIG", "Check the setup credentials and Wi-Fi details.")
      return
    }
    let request = isNew
      ? ["action": "pair"]
      : ["action": "change_wifi", "device_id": deviceID, "token": token]
    guard let data = try? JSONSerialization.data(withJSONObject: request) else {
      promise.reject("ERR_BLE_CONFIG", "Could not prepare Bluetooth setup.")
      return
    }
    let pending = ProvisioningAttempt(
      promise: promise, ssid: ssid, password: password, request: data,
      expected: isNew ? nil : ["deviceId": deviceID, "token": token, "hostname": hostname]
    )
    let attemptID = pending.id
    attempt = pending
    connectedDevice = device
    device.versionInfo = nil
    device.capabilities = nil

    let timeout = DispatchWorkItem { [weak self] in
      guard let self, let attempt = self.attempt, attempt.id == attemptID else { return }
      self.closeConnection()
      attempt.promise.reject("ERR_BLE_TIMEOUT", "Setup timed out. Put the switch in setup mode and try again.")
    }
    deadline = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 60, execute: timeout)

    device.connect(delegate: setup) { [weak self, weak device] connection in
      DispatchQueue.main.async {
        guard let self, let device, let attempt = self.attempt, attempt.id == attemptID else { return }
        guard case .connected = connection, supportsSecurity2(device), device.isSessionEstablished() else {
          self.fail(attempt.promise, "Secure Bluetooth pairing failed. Check the switch’s setup credentials.")
          return
        }
        device.sendData(path: "goswitch-pair", data: attempt.request) { [weak self, weak device] response, error in
          DispatchQueue.main.async {
            guard let self, let device, let attempt = self.attempt, attempt.id == attemptID else { return }
            guard error == nil, let response, response.count <= 1024,
                  let body = (try? JSONSerialization.jsonObject(with: response)) as? [String: Any],
                  let returnedID = body["device_id"] as? String,
                  let returnedToken = body["token"] as? String,
                  let rawHost = body["api_hostname"] as? String,
                  let returnedHost = self.canonicalHostname(rawHost),
                  returnedID.range(of: #"\A[A-Za-z0-9_.-]{1,64}\z"#, options: .regularExpression) != nil,
                  returnedToken.utf8.count <= 256,
                  returnedToken.range(of: #"\A[A-Za-z0-9._~+/-]+={0,2}\z"#, options: .regularExpression) != nil else {
              self.fail(attempt.promise, "The switch did not confirm its pairing credentials.")
              return
            }
            let pairing = ["deviceId": returnedID, "token": returnedToken, "hostname": returnedHost]
            guard attempt.expected.map({ $0 == pairing }) ?? true else {
              self.fail(attempt.promise, "The switch did not confirm its pairing credentials.")
              return
            }
            self.attempt?.pairing = pairing
            device.provision(ssid: attempt.ssid, passPhrase: attempt.password) { [weak self] result in
              DispatchQueue.main.async {
                guard let self, let attempt = self.attempt, attempt.id == attemptID else { return }
                switch result {
                case .configApplied: break
                case .success:
                  guard let pairing = attempt.pairing else {
                    self.fail(attempt.promise, "The switch did not confirm its pairing credentials.")
                    return
                  }
                  self.closeConnection()
                  attempt.promise.resolve(pairing)
                case .failure(.wifiStatusAuthenticationError):
                  self.fail(attempt.promise, "The switch could not join Wi-Fi. Check the password.")
                case .failure(.wifiStatusNetworkNotFound):
                  self.fail(attempt.promise, "The switch could not find that Wi-Fi network.")
                case .failure:
                  self.fail(attempt.promise, "The switch could not confirm its Wi-Fi connection.")
                }
              }
            }
          }
        }
      }
    }
  }

  private func canonicalHostname(_ raw: String) -> String? {
    let name = (raw.hasSuffix(".") ? String(raw.dropLast()) : raw).lowercased()
    let dns = #"\A([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?\z"#
    guard name.utf8.count <= 253, name.range(of: dns, options: .regularExpression) != nil else { return nil }
    return name
  }

  private func fail(_ promise: Promise, _ message: String) {
    closeConnection()
    promise.reject("ERR_BLE_PROVISION", message)
  }

  private func closeConnection() {
    attempt = nil
    deadline?.cancel()
    deadline = nil
    let device = connectedDevice
    connectedDevice = nil
    device?.delegate = nil
    device?.disconnect()
  }
}
