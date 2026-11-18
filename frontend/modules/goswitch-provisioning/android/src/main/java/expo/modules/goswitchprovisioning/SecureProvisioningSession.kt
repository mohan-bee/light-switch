package expo.modules.goswitchprovisioning

import com.espressif.provisioning.srp6a.BigIntegerUtils.bigIntegerFromBytes
import com.espressif.provisioning.srp6a.BigIntegerUtils.bigIntegerToBytes
import com.espressif.provisioning.srp6a.SRP6ClientSession
import com.espressif.provisioning.srp6a.SRP6CryptoParams
import com.google.protobuf.ByteString
import espressif.Constants.Status
import espressif.Sec2
import espressif.Session
import java.math.BigInteger
import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject

internal class SecureProvisioningSession private constructor(
  private val gatt: ProvisioningGatt,
  private val key: SecretKeySpec,
  private val noncePrefix: ByteArray
) {
  private var counter = 1

  private fun crypt(mode: Int, data: ByteArray): ByteArray {
    // Security 2 patch 1 uses a distinct AES-GCM nonce for each request and response.
    val iv = ByteBuffer.allocate(12).put(noncePrefix).putInt(counter++).array()
    return Cipher.getInstance("AES/GCM/NoPadding").run {
      init(mode, key, GCMParameterSpec(128, iv))
      doFinal(data)
    }
  }

  suspend fun exchange(endpoint: String, data: ByteArray): ByteArray {
    val response = gatt.exchange(endpoint, crypt(Cipher.ENCRYPT_MODE, data))
    return crypt(Cipher.DECRYPT_MODE, response)
  }

  companion object {
    suspend fun establish(gatt: ProvisioningGatt, username: String, password: String): SecureProvisioningSession {
      val version = JSONObject(gatt.exchange("proto-ver", "ESP".toByteArray()).toString(Charsets.UTF_8))
        .optJSONObject("prov")
      if (version?.opt("sec_ver") != 2 || version.opt("sec_patch_ver") != 1) {
        throw ProvisioningFailure("The switch must support ESP-IDF Security 2 with counter-based encryption.")
      }

      val parameters = SRP6CryptoParams.getInstance(3072, "SHA-512")
      val client = SRP6ClientSession().apply { step1(username, password) }
      val hello = Sec2.S2SessionCmd0.newBuilder()
        .setClientUsername(ByteString.copyFromUtf8(username))
        .setClientPubkey(ByteString.copyFrom(unsignedFixedWidth(client.getClientPublicKey(parameters), 384)))
      val response = handshake(
        gatt, Sec2.Sec2Payload.newBuilder().setSc0(hello).build(), Sec2.Sec2MsgType.S2Session_Response0
      )
      if (!response.hasSr0() || response.sr0.status != Status.Success) throw authenticationFailed()
      val salt = response.sr0.deviceSalt.toByteArray()
      val publicKey = response.sr0.devicePubkey.toByteArray()
      val credentials = client.step2_for_client_evidence(
        parameters, bigIntegerFromBytes(salt), bigIntegerFromBytes(publicKey), salt
      )
      val proof = Sec2.S2SessionCmd1.newBuilder()
        .setClientProof(ByteString.copyFrom(unsignedFixedWidth(credentials.M1, 64)))
      val finish = handshake(
        gatt,
        Sec2.Sec2Payload.newBuilder().setMsg(Sec2.Sec2MsgType.S2Session_Command1).setSc1(proof).build(),
        Sec2.Sec2MsgType.S2Session_Response1
      )
      if (!finish.hasSr1() || finish.sr1.status != Status.Success) throw authenticationFailed()
      val serverProof = finish.sr1.deviceProof.toByteArray()
      if (serverProof.size != 64) throw authenticationFailed()
      client.step3(bigIntegerFromBytes(serverProof))

      val nonce = finish.sr1.deviceNonce.toByteArray()
      if (nonce.size != 12 || ByteBuffer.wrap(nonce).getInt(8) != 1) throw authenticationFailed()
      val key = SecretKeySpec(unsignedFixedWidth(client.K, 64).copyOf(32), "AES")
      return SecureProvisioningSession(gatt, key, nonce.copyOf(8))
    }

    private suspend fun handshake(
      gatt: ProvisioningGatt, payload: Sec2.Sec2Payload, expected: Sec2.Sec2MsgType
    ): Sec2.Sec2Payload {
      val request = Session.SessionData.newBuilder().setSecVer(Session.SecSchemeVersion.SecScheme2)
        .setSec2(payload).build()
      val response = Session.SessionData.parseFrom(gatt.exchange("prov-session", request.toByteArray()))
      if (response.secVer != Session.SecSchemeVersion.SecScheme2 || !response.hasSec2() || response.sec2.msg != expected) {
        throw authenticationFailed()
      }
      return response.sec2
    }

    private fun authenticationFailed() =
      ProvisioningFailure("Secure Bluetooth pairing failed. Check the switch’s setup credentials.")

    private fun unsignedFixedWidth(value: BigInteger, width: Int): ByteArray {
      val bytes = bigIntegerToBytes(value)
      if (bytes.size > width) throw authenticationFailed()
      // ESP-IDF expects 384-byte public keys and 64-byte SHA-512 proofs.
      return ByteArray(width).also { bytes.copyInto(it, width - bytes.size) }
    }
  }
}
