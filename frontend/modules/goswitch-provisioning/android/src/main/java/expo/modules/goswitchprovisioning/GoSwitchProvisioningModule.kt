package expo.modules.goswitchprovisioning

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import com.espressif.provisioning.utils.MessengeHelper
import espressif.Constants.Status
import espressif.NetworkConfig.NetworkConfigMsgType
import espressif.NetworkConfig.NetworkConfigPayload
import espressif.NetworkConstants.WifiConnectFailedReason
import espressif.NetworkConstants.WifiStationState
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

@SuppressLint("MissingPermission")
class GoSwitchProvisioningModule : Module() {
  private data class Peripheral(val name: String, val device: BluetoothDevice, val service: UUID)

  private val operation = Mutex()
  private var devices = emptyMap<String, Peripheral>()
  private val devicePattern = Regex("[A-Za-z0-9_.-]{1,64}")
  private val tokenPattern = Regex("[A-Za-z0-9._~+/-]+={0,2}")
  private val hostnamePattern = Regex(
    """^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$"""
  )

  override fun definition() = ModuleDefinition {
    Name("GoSwitchProvisioning")

    AsyncFunction("scan") Coroutine { ->
      runBluetoothOperation {
        devices = scan()
        devices.toList().sortedBy { it.second.name }.map { (id, peripheral) ->
          mapOf("id" to id, "name" to peripheral.name)
        }
      }
    }

    AsyncFunction("provision") Coroutine {
      id: String, username: String, proof: String, ssid: String, password: String,
      deviceId: String, token: String, hostname: String ->
      runBluetoothOperation {
        provision(id, username, proof, ssid, password, deviceId, token, hostname)
      }
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw ProvisioningFailure("Bluetooth setup is unavailable.")

  private suspend fun scan(): Map<String, Peripheral> {
    val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner
      ?: throw ProvisioningFailure("Turn on Bluetooth to find your switch.")
    val found = ConcurrentHashMap<String, Peripheral>()
    val stopped = CompletableDeferred<Unit>()
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val record = result.scanRecord ?: return
        val name = record.deviceName?.takeIf { it.startsWith("GO-SW-") && it.length <= 64 } ?: return
        val service = record.serviceUuids?.firstOrNull()?.uuid ?: return
        found[result.device.address] = Peripheral(name, result.device, service)
      }

      override fun onScanFailed(errorCode: Int) {
        stopped.completeExceptionally(ProvisioningFailure("Bluetooth scanning failed. Try again shortly."))
      }
    }
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
    scanner.startScan(emptyList(), settings, callback)
    try {
      withTimeoutOrNull(6_000) { stopped.await() }
      return found.toMap()
    } finally {
      runCatching { scanner.stopScan(callback) }
    }
  }

  private suspend fun provision(
    id: String, username: String, proof: String, ssid: String, password: String,
    deviceId: String, token: String, hostname: String
  ): Map<String, String> {
    val peripheral = devices[id] ?: throw ProvisioningFailure("Scan again to find your switch.")
    val isNew = deviceId.isEmpty() && token.isEmpty() && hostname.isEmpty()
    if ((!isNew && (deviceId.isEmpty() || token.isEmpty() || hostname.isEmpty())) ||
      username.isBlank() || username.toByteArray().size > 64 || proof.isBlank() || proof.length > 256 ||
      ssid.toByteArray().size !in 1..32 || password.toByteArray().size > 64
    ) {
      throw ProvisioningFailure("Check the setup credentials and Wi-Fi details.")
    }

    val gatt = ProvisioningGatt()
    try {
      val session = withTimeout(22_000) {
        gatt.connect(context, peripheral.device, peripheral.service)
        SecureProvisioningSession.establish(gatt, username, proof)
      }
      val request = JSONObject().put("action", if (isNew) "pair" else "change_wifi")
      if (!isNew) request.put("device_id", deviceId).put("token", token)
      val response = session.exchange("goswitch-pair", request.toString().toByteArray())
      val pairing = JSONObject(response.toString(Charsets.UTF_8))
      val returnedId = pairing.opt("device_id") as? String ?: ""
      val returnedToken = pairing.opt("token") as? String ?: ""
      val returnedHost = (pairing.opt("api_hostname") as? String ?: "")
        .removeSuffix(".").lowercase(Locale.ROOT)
      if (!devicePattern.matches(returnedId) || returnedToken.length > 256 || !tokenPattern.matches(returnedToken) ||
        returnedHost.length > 253 || !hostnamePattern.matches(returnedHost) ||
        (!isNew && (deviceId != returnedId || token != returnedToken || hostname != returnedHost))
      ) {
        throw ProvisioningFailure("The switch did not confirm its pairing credentials.")
      }

      withTimeout(38_000) { configureWifi(session, ssid, password) }
      return mapOf("deviceId" to returnedId, "token" to returnedToken, "hostname" to returnedHost)
    } finally {
      gatt.close()
    }
  }

  private suspend fun configureWifi(session: SecureProvisioningSession, ssid: String, password: String) {
    suspend fun exchange(data: ByteArray, expected: NetworkConfigMsgType): NetworkConfigPayload {
      val reply = NetworkConfigPayload.parseFrom(session.exchange("prov-config", data))
      if (reply.msg != expected) throw ProvisioningFailure("The switch returned an invalid Wi-Fi setup response.")
      return reply
    }

    val configured = exchange(MessengeHelper.prepareWiFiConfigMsg(ssid, password), NetworkConfigMsgType.TypeRespSetWifiConfig)
    if (!configured.hasRespSetWifiConfig() || configured.respSetWifiConfig.status != Status.Success) {
      throw ProvisioningFailure("The switch rejected the Wi-Fi credentials.")
    }
    val applied = exchange(MessengeHelper.prepareApplyWiFiConfigMsg(), NetworkConfigMsgType.TypeRespApplyWifiConfig)
    if (!applied.hasRespApplyWifiConfig() || applied.respApplyWifiConfig.status != Status.Success) {
      throw ProvisioningFailure("The switch could not apply the Wi-Fi credentials.")
    }

    val query = MessengeHelper.prepareGetWiFiConfigStatusMsg()
    while (true) {
      delay(1_500)
      val reply = exchange(query, NetworkConfigMsgType.TypeRespGetWifiStatus)
      val status = reply.respGetWifiStatus
      if (!reply.hasRespGetWifiStatus() || status.status != Status.Success) {
        throw ProvisioningFailure("The switch could not report its Wi-Fi status.")
      }
      when (status.wifiStaState) {
        WifiStationState.Connected -> return
        WifiStationState.Connecting, WifiStationState.Disconnected -> continue
        WifiStationState.ConnectionFailed -> {
          val message = when (status.wifiFailReason) {
            WifiConnectFailedReason.AuthError -> "The switch could not join Wi-Fi. Check the password."
            WifiConnectFailedReason.WifiNetworkNotFound -> "The switch could not find that Wi-Fi network."
            else -> "The switch could not join Wi-Fi."
          }
          throw ProvisioningFailure(message)
        }
        else -> throw ProvisioningFailure("The switch returned an unknown Wi-Fi status.")
      }
    }
  }

  private suspend fun <T> runBluetoothOperation(action: suspend () -> T): T {
    if (!operation.tryLock()) throw CodedException("ERR_BLE_BUSY", "Bluetooth setup is already running.", null)
    try {
      return action()
    } catch (_: TimeoutCancellationException) {
      throw CodedException("ERR_BLE_TIMEOUT", "Setup timed out. Put the switch in setup mode and try again.", null)
    } catch (cancelled: CancellationException) {
      throw cancelled
    } catch (failure: ProvisioningFailure) {
      throw CodedException("ERR_BLE_PROVISION", failure.message, null)
    } catch (_: Exception) {
      throw CodedException("ERR_BLE_PROVISION", "Secure Bluetooth setup failed. Check your setup credentials and try again.", null)
    } finally {
      operation.unlock()
    }
  }
}
