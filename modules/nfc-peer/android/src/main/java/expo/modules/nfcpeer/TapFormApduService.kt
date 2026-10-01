package expo.modules.nfcpeer

import android.app.Service
import android.content.pm.ApplicationInfo
import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log

/** Passive personal-side receiver. It stores only a short-lived request locator, never Vault data. */
class TapFormApduService : HostApduService() {
  private var selected = false

  override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
    if (NfcProtocol.isSelect(commandApdu)) {
      selected = true
      log("HCE_SELECT_OK")
      return NfcProtocol.success()
    }
    if (!selected) return NfcProtocol.conditionsNotSatisfied()

    if (NfcProtocol.isGetPeerShare(commandApdu)) {
      val share = NfcPeerModule.getActivePeerShare() ?: return NfcProtocol.conditionsNotSatisfied()
      return try { NfcProtocol.encodePeerShareResponse(share) }
      catch (_: Exception) { NfcProtocol.conditionsNotSatisfied() }
    }

    if (NfcProtocol.isPeerShareInstruction(commandApdu)) return NfcProtocol.conditionsNotSatisfied()
    if (!NfcProtocol.isSendRequestInstruction(commandApdu)) return NfcProtocol.unsupportedCommand()

    return try {
      val payload = NfcProtocol.decodeSendRequest(commandApdu)
      val (accepted, pendingId) = NfcPeerModule.acceptPending(this, payload)
      if (!accepted) {
        log("HCE_REQUEST_REJECTED reason=duplicate_or_pending")
        return NfcProtocol.conditionsNotSatisfied()
      }
      if (pendingId != null) {
        // The persisted reference is authoritative even if Android blocks notifications.
        try {
          NfcPeerModule.postRequestNotification(this, pendingId)
          log("HCE_REQUEST_STORED notification=posted")
        } catch (_: SecurityException) {
          log("HCE_REQUEST_STORED notification=permission_denied")
        } catch (_: Exception) {
          log("HCE_REQUEST_STORED notification=failed")
        }
      } else {
        log("HCE_DUPLICATE_PENDING_ACK")
      }
      NfcProtocol.success()
    } catch (error: Exception) {
      log("HCE_REQUEST_REJECTED reason=${when (error.message) {
        "NFC session expired" -> "expired"
        "Unsupported NFC protocol version" -> "unsupported_version"
        else -> "malformed"
      }}")
      NfcProtocol.conditionsNotSatisfied()
    }
  }

  override fun onDeactivated(reason: Int) { selected = false }

  private fun log(message: String) {
    if (applicationInfo.flags.and(ApplicationInfo.FLAG_DEBUGGABLE) != 0) Log.i("TapFormNFC", message)
  }
}
