package expo.modules.nfcpeer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Debug-only entry point used to render the existing local notification fixture without JS. */
class TapFormNotificationPreviewReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != NfcPeerModule.ACTION_POST_DEVELOPMENT_NOTIFICATION) return
    NfcPeerModule.postDevelopmentRequestNotification(context)
  }
}
