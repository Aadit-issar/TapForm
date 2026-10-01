package expo.modules.nfcpeer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class NfcProtocolTest {
  private val payload = NfcProtocol.Payload(
    UUID.fromString("65c2397d-d583-4b86-b872-2250d1b75f0a"),
    ByteArray(16) { it.toByte() },
    1790596920L,
    UUID.fromString("e79c0e8a-f3c2-460f-9f76-a3addacdb1ea"),
  )

  @Test fun roundTripsVersionTwoRequestLocator() {
    val envelope = NfcProtocol.encode(payload)
    val decoded = NfcProtocol.decodeSendRequest(NfcProtocol.sendRequestCommand(envelope), 1790596800L)
    assertEquals(payload.requestSessionId, decoded.requestSessionId)
    assertEquals(payload.organizationId, decoded.organizationId)
    assertEquals(payload.expiresAtEpochSeconds, decoded.expiresAtEpochSeconds)
    assertTrue(payload.nonce.contentEquals(decoded.nonce))
  }

  @Test fun selectsOnlyRegisteredAid() {
    assertTrue(NfcProtocol.isSelect(NfcProtocol.selectCommand()))
    assertFalse(NfcProtocol.isSelect(byteArrayOf(0, 0, 0, 0)))
  }

  @Test fun classifiesKnownInstructionsAndReturnsUnsupportedStatusForUnknownCommands() {
    assertTrue(NfcProtocol.isPeerShareInstruction(NfcProtocol.getPeerShareCommand()))
    assertTrue(NfcProtocol.isSendRequestInstruction(byteArrayOf(0x80.toByte(), 0xDA.toByte())))
    assertFalse(NfcProtocol.isSendRequestInstruction(byteArrayOf(0x80.toByte(), 0xCB.toByte())))
    assertArrayEquals(byteArrayOf(0x6D, 0x00), NfcProtocol.unsupportedCommand())
  }

  @Test fun malformedPeerShareInstructionIsNotParsedAsRequestData() {
    val malformedGet = byteArrayOf(0x80.toByte(), 0xCA.toByte(), 0x01, 0x00)
    assertTrue(NfcProtocol.isPeerShareInstruction(malformedGet))
    assertFalse(NfcProtocol.isGetPeerShare(malformedGet))
  }

  @Test fun rejectsUnsupportedVersionAndMalformedPayload() {
    val unsupported = NfcProtocol.encode(payload).also { it[0] = 1 }
    assertThrows(IllegalArgumentException::class.java) { NfcProtocol.decode(unsupported, 1790596800L) }
    assertThrows(IllegalArgumentException::class.java) { NfcProtocol.decode(byteArrayOf(1, 2, 3)) }
  }

  @Test fun rejectsMalformedSendRequestHeaderAndLength() {
    val valid = NfcProtocol.sendRequestCommand(NfcProtocol.encode(payload))
    assertThrows(IllegalArgumentException::class.java) { NfcProtocol.decodeSendRequest(valid.copyOf(valid.size - 1), 1790596800L) }
    assertThrows(IllegalArgumentException::class.java) { NfcProtocol.decodeSendRequest(valid.copyOf().also { it[1] = 0xCA.toByte() }, 1790596800L) }
    assertThrows(IllegalArgumentException::class.java) { NfcProtocol.decodeSendRequest(valid, 1790596920L) }
  }

  @Test fun rejectsExpiredSession() {
    assertThrows(IllegalArgumentException::class.java) { NfcProtocol.decode(NfcProtocol.encode(payload), 1790596920L) }
  }

  @Test fun roundTripsOpaquePeerShareReferenceOnly() {
    val share = NfcProtocol.PeerShare(ByteArray(32) { (it * 3).toByte() }, 1790596920L)
    val decoded = NfcProtocol.decodePeerShareResponse(NfcProtocol.encodePeerShareResponse(share), 1790596800L)
    assertTrue(share.token.contentEquals(decoded.token))
    assertEquals(share.expiresAtEpochSeconds, decoded.expiresAtEpochSeconds)
    assertEquals(64, NfcProtocol.tokenHex(decoded.token).length)
  }

  @Test fun rejectsInvalidPeerShareStatusVersionAndExpiry() {
    val share = NfcProtocol.PeerShare(ByteArray(32), 1790596920L)
    val encoded = NfcProtocol.encodePeerShareResponse(share)
    assertThrows(IllegalArgumentException::class.java) { NfcProtocol.decodePeerShareResponse(encoded.copyOf().also { it[0] = 9 }, 1790596800L) }
    assertThrows(IllegalArgumentException::class.java) { NfcProtocol.decodePeerShareResponse(encoded.copyOf().also { it[it.lastIndex] = 1 }, 1790596800L) }
    assertThrows(IllegalArgumentException::class.java) { NfcProtocol.decodePeerShareResponse(encoded, 1790596920L) }
  }
}
