package expo.modules.nfcpeer

internal object NotificationSelection {
  data class PendingIntentIdentity(val uri: String, val requestCode: Int)

  fun pendingIntentIdentity(pendingId: String, notificationId: Int, fieldKey: String) = PendingIntentIdentity(
    uri = "tapform-notification://$pendingId/toggle/$fieldKey",
    requestCode = 0x20000000 xor notificationId xor fieldKey.hashCode(),
  )

  fun toggleExcluded(current: Set<String>, fieldKey: String, requestedKeys: Set<String>): Set<String>? {
    if (fieldKey !in requestedKeys) return null
    return current.toMutableSet().apply {
      if (!add(fieldKey)) remove(fieldKey)
    }
  }

  fun selectedKeys(requestedKeys: List<String>, excludedKeys: Set<String>): List<String> =
    requestedKeys.filterNot { it in excludedKeys }
}
