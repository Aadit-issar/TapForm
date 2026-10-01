package expo.modules.nfcpeer

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** Protocol v2: the organization sends a short-lived locator to the personal HCE service. */
internal object NfcProtocol {
  const val AID = "F04E464354415001"
  const val VERSION: Byte = 2
  const val PAYLOAD_SIZE = 57
  const val PEER_SHARE_VERSION: Byte = 1
  const val PEER_SHARE_TOKEN_SIZE = 32
  const val PEER_SHARE_PAYLOAD_SIZE = 41
  private val SELECT_PREFIX = byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00)
  private val GET_PEER_SHARE = byteArrayOf(0x80.toByte(), 0xCA.toByte(), 0x00, 0x00)
  private val OK = byteArrayOf(0x90.toByte(), 0x00)
  private val CONDITIONS_NOT_SATISFIED = byteArrayOf(0x69, 0x85.toByte())
  private val APP_NOT_FOUND = byteArrayOf(0x6A, 0x82.toByte())

  data class Payload(
    val requestSessionId: UUID,
    val nonce: ByteArray,
    val expiresAtEpochSeconds: Long,
    val organizationId: UUID,
  )

  data class PeerShare(val token: ByteArray, val expiresAtEpochSeconds: Long)

  fun selectCommand(): ByteArray {
    val aid = AID.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    return SELECT_PREFIX + byteArrayOf(aid.size.toByte()) + aid
  }

  fun sendRequestCommand(payload: ByteArray): ByteArray {
    require(payload.size == PAYLOAD_SIZE) { "Malformed request envelope size" }
    require(payload.size <= 255) { "Request envelope exceeds short APDU limit" }
    return byteArrayOf(0x80.toByte(), 0xDA.toByte(), 0x00, 0x00, payload.size.toByte()) + payload
  }

  fun isSelect(command: ByteArray): Boolean = command.contentEquals(selectCommand())
  fun isGetPeerShare(command: ByteArray): Boolean = command.contentEquals(GET_PEER_SHARE)
  fun isPeerShareInstruction(command: ByteArray): Boolean = command.hasInstruction(0x80, 0xCA)
  fun isSendRequestInstruction(command: ByteArray): Boolean = command.hasInstruction(0x80, 0xDA)
  fun getPeerShareCommand(): ByteArray = GET_PEER_SHARE.copyOf()

  fun encodePeerShareResponse(share: PeerShare): ByteArray {
    require(share.token.size == PEER_SHARE_TOKEN_SIZE) { "Peer share token must contain 32 bytes" }
    require(share.expiresAtEpochSeconds > 0) { "Invalid peer share expiry" }
    return ByteBuffer.allocate(PEER_SHARE_PAYLOAD_SIZE).order(ByteOrder.BIG_ENDIAN)
      .put(PEER_SHARE_VERSION).putLong(share.expiresAtEpochSeconds).put(share.token)
      .array() + OK
  }

  fun decodePeerShareResponse(response: ByteArray, nowEpochSeconds: Long = System.currentTimeMillis() / 1000L): PeerShare {
    require(response.size == PEER_SHARE_PAYLOAD_SIZE + 2) { "Malformed peer share response size" }
    require(response[response.size - 2] == OK[0] && response.last() == OK[1]) { "Peer share request was rejected" }
    val buffer = ByteBuffer.wrap(response, 0, PEER_SHARE_PAYLOAD_SIZE).order(ByteOrder.BIG_ENDIAN)
    require(buffer.get() == PEER_SHARE_VERSION) { "Unsupported peer share protocol version" }
    val expiry = buffer.long
    val token = ByteArray(PEER_SHARE_TOKEN_SIZE).also(buffer::get)
    require(expiry > nowEpochSeconds) { "Peer share link expired" }
    return PeerShare(token, expiry)
  }

  fun tokenHex(token: ByteArray): String = token.joinToString("") { "%02x".format(it) }

  fun decodeSendRequest(command: ByteArray, nowEpochSeconds: Long = System.currentTimeMillis() / 1000L): Payload {
    require(command.size >= 5) { "Malformed SEND_REQUEST APDU" }
    require(command[0] == 0x80.toByte() && command[1] == 0xDA.toByte() && command[2] == 0.toByte() && command[3] == 0.toByte()) { "Unsupported NFC command" }
    val length = command[4].toInt() and 0xFF
    require(length == PAYLOAD_SIZE && command.size == length + 5) { "Malformed NFC request length" }
    return decode(command.copyOfRange(5, command.size), nowEpochSeconds)
  }

  fun encode(payload: Payload): ByteArray {
    require(payload.nonce.size == 16) { "Nonce must contain 16 bytes" }
    require(payload.expiresAtEpochSeconds > 0) { "Invalid expiry" }
    return ByteBuffer.allocate(PAYLOAD_SIZE).order(ByteOrder.BIG_ENDIAN)
      .put(VERSION).putLong(payload.expiresAtEpochSeconds)
      .putLong(payload.requestSessionId.mostSignificantBits).putLong(payload.requestSessionId.leastSignificantBits)
      .put(payload.nonce)
      .putLong(payload.organizationId.mostSignificantBits).putLong(payload.organizationId.leastSignificantBits)
      .array()
  }

  fun decode(bytes: ByteArray, nowEpochSeconds: Long = System.currentTimeMillis() / 1000L): Payload {
    require(bytes.size == PAYLOAD_SIZE) { "Malformed NFC payload size" }
    val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
    require(buffer.get() == VERSION) { "Unsupported NFC protocol version" }
    val expiresAt = buffer.long
    val session = UUID(buffer.long, buffer.long)
    val nonce = ByteArray(16).also(buffer::get)
    val organization = UUID(buffer.long, buffer.long)
    require(expiresAt > nowEpochSeconds) { "NFC session expired" }
    return Payload(session, nonce, expiresAt, organization)
  }

  fun success(): ByteArray = OK.copyOf()
  fun conditionsNotSatisfied(): ByteArray = CONDITIONS_NOT_SATISFIED.copyOf()
  fun applicationNotFound(): ByteArray = APP_NOT_FOUND.copyOf()
  fun unsupportedCommand(): ByteArray = byteArrayOf(0x6D, 0x00)

  private fun ByteArray.hasInstruction(cla: Int, ins: Int): Boolean =
    size >= 2 && (this[0].toInt() and 0xFF) == cla && (this[1].toInt() and 0xFF) == ins

  fun toMap(payload: Payload): Map<String, Any> = mapOf(
    "version" to VERSION.toInt(),
    "requestSessionId" to payload.requestSessionId.toString(),
    "nonce" to payload.nonce.joinToString("") { "%02x".format(it) },
    "expiresAt" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(payload.expiresAtEpochSeconds * 1000L)),
    "organizationId" to payload.organizationId.toString(),
  )
}
