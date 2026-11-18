package expo.modules.goswitchprovisioning

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.os.Build
import java.util.UUID
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeout

internal class ProvisioningFailure(message: String) : Exception(message)

@SuppressLint("MissingPermission")
internal class ProvisioningGatt {
  private enum class Operation { CONNECT, MTU, DISCOVER, DESCRIPTOR, WRITE, READ }
  private data class Result(val operation: Operation?, val payload: ByteArray = byteArrayOf())

  private val results = Channel<Result>(Channel.UNLIMITED)
  private var gatt: BluetoothGatt? = null
  private val endpoints = mutableMapOf<String, BluetoothGattCharacteristic>()
  private val endpointDescriptor = UUID.fromString("00002901-0000-1000-8000-00805f9b34fb")

  private val callback = object : BluetoothGattCallback() {
    private fun completed(operation: Operation, status: Int, value: ByteArray = byteArrayOf()) {
      results.trySend(Result(operation.takeIf { status == BluetoothGatt.GATT_SUCCESS }, value))
    }

    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        results.trySend(Result(null))
      } else if (newState == BluetoothProfile.STATE_CONNECTED) {
        completed(Operation.CONNECT, status)
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      // Service discovery can still succeed if the peripheral declines the MTU request.
      results.trySend(Result(Operation.MTU))
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      completed(Operation.DISCOVER, status)
    }

    override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      completed(Operation.WRITE, status)
    }

    override fun onCharacteristicRead(
      gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int
    ) {
      completed(Operation.READ, status, value)
    }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      completed(Operation.READ, status, characteristic.value?.copyOf() ?: byteArrayOf())
    }

    override fun onDescriptorRead(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int, value: ByteArray) {
      completed(Operation.DESCRIPTOR, status, value)
    }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onDescriptorRead(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      completed(Operation.DESCRIPTOR, status, descriptor.value?.copyOf() ?: byteArrayOf())
    }
  }

  suspend fun connect(context: Context, device: BluetoothDevice, serviceId: UUID) {
    val connection = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
      ?: throw ProvisioningFailure("Could not connect to the switch over Bluetooth.")
    gatt = connection
    await(Operation.CONNECT)
    if (connection.requestMtu(517)) await(Operation.MTU)
    if (!connection.discoverServices()) throw ProvisioningFailure("Could not discover Bluetooth setup services.")
    await(Operation.DISCOVER)

    val service = connection.getService(serviceId)
      ?: throw ProvisioningFailure("The switch did not expose its Bluetooth setup service.")
    for (characteristic in service.characteristics) {
      val descriptor = characteristic.getDescriptor(endpointDescriptor) ?: continue
      if (!connection.readDescriptor(descriptor)) {
        throw ProvisioningFailure("Could not read the switch’s Bluetooth setup endpoints.")
      }
      val name = await(Operation.DESCRIPTOR).toString(Charsets.UTF_8)
      if (name in setOf("proto-ver", "prov-session", "prov-config", "goswitch-pair")) {
        if (endpoints.put(name, characteristic) != null) {
          throw ProvisioningFailure("The switch advertised duplicate Bluetooth setup endpoints.")
        }
      }
    }
    if (endpoints.size != 4) throw ProvisioningFailure("The switch does not support GO Switch Bluetooth setup.")
  }

  @Suppress("DEPRECATION")
  suspend fun exchange(endpoint: String, data: ByteArray): ByteArray {
    val connection = gatt ?: throw ProvisioningFailure("The Bluetooth connection closed.")
    val characteristic = endpoints.getValue(endpoint)
    if (data.size > 512) throw ProvisioningFailure("The Bluetooth setup message was too large.")
    val writing = if (Build.VERSION.SDK_INT >= 33) {
      connection.writeCharacteristic(characteristic, data, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) ==
        BluetoothStatusCodes.SUCCESS
    } else {
      characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      characteristic.value = data
      connection.writeCharacteristic(characteristic)
    }
    if (!writing) throw ProvisioningFailure("Could not send a Bluetooth setup message.")
    await(Operation.WRITE)
    if (!connection.readCharacteristic(characteristic)) {
      throw ProvisioningFailure("Could not read the switch’s Bluetooth response.")
    }
    return await(Operation.READ)
  }

  private suspend fun await(expected: Operation): ByteArray = withTimeout(8_000) {
    var result = results.receive()
    while (result.operation == Operation.MTU && expected != Operation.MTU) {
      result = results.receive()
    }
    if (result.operation != expected) throw ProvisioningFailure("Bluetooth communication with the switch was interrupted.")
    result.payload
  }

  fun close() {
    gatt?.let { connection ->
      runCatching { connection.disconnect() }
      runCatching { connection.close() }
    }
    gatt = null
    results.close()
  }
}
