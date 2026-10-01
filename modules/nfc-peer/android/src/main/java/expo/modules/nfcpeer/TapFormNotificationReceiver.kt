package expo.modules.nfcpeer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class TapFormNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != NfcPeerModule.ACTION_TOGGLE_EXCLUSION) return
    val pendingId = intent.getStringExtra(NfcPeerModule.EXTRA_PENDING_ID) ?: return
    val fieldKey = intent.getStringExtra(NfcPeerModule.EXTRA_FIELD_KEY) ?: return
    NfcPeerModule.toggleNotificationExclusion(context, pendingId, fieldKey)
  }
}
