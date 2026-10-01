package expo.modules.nfcpeer

import android.app.Activity
import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.interfaces.permissions.Permissions
import java.util.UUID

class NfcPeerModule : Module() {
  private var readerActivity: Activity? = null

  override fun definition() = ModuleDefinition {
    Name("NfcPeer")
    Events("onNfcState")

    Function("getCapabilities") {
      val context = appContext.reactContext ?: return@Function mapOf(
        "adapterPresent" to false,
        "hceSupported" to false,
        "hceServiceRegistered" to false,
        "enabled" to false,
      )
      val adapter = NfcAdapter.getDefaultAdapter(context)
      val hceSupported = context.packageManager.hasSystemFeature("android.hardware.nfc.hce")
      mapOf(
        "adapterPresent" to (adapter != null),
        "hceSupported" to hceSupported,
        "hceServiceRegistered" to (hceSupported && isHceServiceRegistered(context)),
        "enabled" to (adapter?.isEnabled == true),
      )
    }

    /** Organization-only: read a personal phone's passive HCE service and deliver a locator. */
    AsyncFunction("startReader") { input: Map<String, Any?> ->
      val context = appContext.reactContext ?: throw IllegalStateException("The app context is unavailable.")
      val activity = appContext.currentActivity ?: throw IllegalStateException("Open TapForm to start an NFC request.")
      val adapter = NfcAdapter.getDefaultAdapter(context) ?: throw IllegalStateException("NFC is not available on this phone.")
      if (!adapter.isEnabled) throw IllegalStateException("NFC is turned off.")
      val payload = parsePayload(input)
      stopActiveReader()
      readerActivity = activity
      val flags = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
      adapter.enableReaderMode(activity, { tag -> sendRequest(tag, payload) }, flags, null)
      sendEvent("onNfcState", mapOf("state" to "ready"))
    }

    /** Personal peer Reader Mode reads only a short-lived, opaque Tap Card link reference from HCE. */
    AsyncFunction("startPeerReader") {
      val context = appContext.reactContext ?: throw IllegalStateException("The app context is unavailable.")
      val activity = appContext.currentActivity ?: throw IllegalStateException("Open TapForm to scan a Tap Card.")
      val adapter = NfcAdapter.getDefaultAdapter(context) ?: throw IllegalStateException("NFC is not available on this phone.")
      if (!adapter.isEnabled) throw IllegalStateException("NFC is turned off.")
      stopActiveReader()
      readerActivity = activity
      val flags = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
      adapter.enableReaderMode(activity, { tag -> readPeerShare(tag) }, flags, null)
      sendEvent("onNfcState", mapOf("state" to "ready"))
    }

    AsyncFunction("setPeerShareContext") { token: String?, expiresAtEpochSeconds: Long? ->
      if (token == null || expiresAtEpochSeconds == null) {
        activePeerShare = null
        return@AsyncFunction true
      }
      require(token.matches(Regex("^[0-9a-fA-F]{64}$"))) { "Invalid Tap Card reference." }
      val expiry = expiresAtEpochSeconds
      require(expiry > System.currentTimeMillis() / 1000L && expiry < System.currentTimeMillis() / 1000L + 24 * 60 * 60) { "Tap Card reference expiry is invalid." }
      activePeerShare = NfcProtocol.PeerShare(token.chunked(2).map { it.toInt(16).toByte() }.toByteArray(), expiry)
      true
    }

    AsyncFunction("stopReader") { stopActiveReader() }

    AsyncFunction("getPendingRequest") { pendingId: String? ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      readPending(context, pendingId)
    }

    AsyncFunction("getLatestPendingRequest") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      readPending(context, null)
    }

    AsyncFunction("clearPendingRequest") { pendingId: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      clearPendingRecord(context, pendingId, cancelNotification = true)
    }

    AsyncFunction("updatePendingNotification") { pendingId: String, input: Map<String, Any?> ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val summary = parseNotificationSummary(input) ?: return@AsyncFunction false
      storeNotificationSummary(context, pendingId, summary)
      postRequestNotification(context, pendingId)
      true
    }

    AsyncFunction("getNotificationSelection") { pendingId: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      readNotificationSelection(context, pendingId)
    }

    AsyncFunction("markPendingNotification") { pendingId: String, state: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      markNotificationProcessing(context, pendingId, state)
    }

    AsyncFunction("finishPendingNotification") { pendingId: String, state: String, sharedCount: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      finishNotification(context, pendingId, state, sharedCount)
    }

    AsyncFunction("failPendingNotification") { pendingId: String, retryAction: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      failNotification(context, pendingId, retryAction)
    }

    AsyncFunction("showDevelopmentRequestNotification") {
      val context = appContext.reactContext ?: throw IllegalStateException("The app context is unavailable.")
      check(postDevelopmentRequestNotification(context)) { "A development notification could not be created." }
    }

    AsyncFunction("getNotificationPermission") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(notificationPermissions, promise, Manifest.permission.POST_NOTIFICATIONS)
    }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(notificationPermissions, promise, Manifest.permission.POST_NOTIFICATIONS)
    }

    Function("openNotificationSettings") {
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try { context.startActivity(intent); true } catch (_: Exception) { false }
    }

    Function("openSettings") {
      val context = appContext.reactContext ?: return@Function false
      val actions = listOf(Settings.ACTION_NFC_SETTINGS, Settings.ACTION_WIRELESS_SETTINGS, Settings.ACTION_SETTINGS)
      for (action in actions) {
        val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (intent.resolveActivity(context.packageManager) != null) {
          try { context.startActivity(intent); return@Function true } catch (_: Exception) { }
        }
      }
      false
    }

    OnDestroy { stopActiveReader() }
  }

  private fun parsePayload(input: Map<String, Any?>): NfcProtocol.Payload {
    val version = (input["version"] as? Number)?.toInt() ?: throw IllegalArgumentException("Missing protocol version.")
    require(version == NfcProtocol.VERSION.toInt()) { "Unsupported NFC protocol version." }
    val sessionId = UUID.fromString(input["requestSessionId"] as? String ?: "")
    val organizationId = UUID.fromString(input["organizationId"] as? String ?: "")
    val nonceText = input["nonce"] as? String ?: ""
    require(nonceText.length == 32 && nonceText.all { it in "0123456789abcdefABCDEF" }) { "Invalid NFC nonce." }
    val nonce = nonceText.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    val expiry = (input["expiresAtEpochSeconds"] as? Number)?.toLong()
      ?: throw IllegalArgumentException("Invalid NFC session expiry.")
    val now = System.currentTimeMillis() / 1000L
    require(expiry > now && expiry < now + 180L) { "NFC session expiry is invalid." }
    return NfcProtocol.Payload(sessionId, nonce, expiry, organizationId)
  }

  private fun sendRequest(tag: Tag, payload: NfcProtocol.Payload) {
    sendEvent("onNfcState", mapOf("state" to "detecting"))
    val isoDep = IsoDep.get(tag)
    if (isoDep == null) { sendEvent("onNfcState", mapOf("state" to "error", "reason" to "unsupported_device")); return }
    try {
      isoDep.timeout = 5000
      isoDep.connect()
      val selected = isoDep.transceive(NfcProtocol.selectCommand())
      if (!isSuccess(selected)) throw IllegalStateException("application_not_found")
      val response = isoDep.transceive(NfcProtocol.sendRequestCommand(NfcProtocol.encode(payload)))
      if (!isSuccess(response)) throw IllegalStateException("request_rejected")
      sendEvent("onNfcState", mapOf("state" to "delivered"))
    } catch (error: Exception) {
      val reason = if (error.message == "application_not_found") "application_not_found" else "scan_failed"
      sendEvent("onNfcState", mapOf("state" to "error", "reason" to reason))
    } finally { try { isoDep.close() } catch (_: Exception) { } }
  }

  private fun readPeerShare(tag: Tag) {
    sendEvent("onNfcState", mapOf("state" to "detecting"))
    val isoDep = IsoDep.get(tag)
    if (isoDep == null) { sendEvent("onNfcState", mapOf("state" to "error", "reason" to "unsupported_device")); return }
    try {
      isoDep.timeout = 5000
      isoDep.connect()
      if (!isSuccess(isoDep.transceive(NfcProtocol.selectCommand()))) throw IllegalStateException("application_not_found")
      val response = isoDep.transceive(NfcProtocol.getPeerShareCommand())
      val share = NfcProtocol.decodePeerShareResponse(response)
      sendEvent("onNfcState", mapOf("state" to "peer_share_found", "token" to NfcProtocol.tokenHex(share.token), "expiresAtEpochSeconds" to share.expiresAtEpochSeconds))
    } catch (error: Exception) {
      val reason = when (error.message) {
        "application_not_found" -> "application_not_found"
        "Peer share link expired" -> "expired"
        else -> "scan_failed"
      }
      sendEvent("onNfcState", mapOf("state" to "error", "reason" to reason))
    } finally { try { isoDep.close() } catch (_: Exception) { } }
  }

  private fun readPending(context: Context, expectedId: String?): Map<String, Any>? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val id = expectedId ?: pendingIds(prefs).lastOrNull() ?: return null
    if (id !in pendingIds(prefs)) return null
    val expiry = prefs.getLong(recordKey(id, "expiry"), 0L)
    if (expiry <= System.currentTimeMillis() / 1000L) {
      clearPendingRecord(context, id, cancelNotification = true)
      return null
    }
    val encoded = prefs.getString(recordKey(id, "payload"), null)
    if (encoded == null) {
      clearPendingRecord(context, id, cancelNotification = true)
      return null
    }
    val payload = try { NfcProtocol.decode(Base64.decode(encoded, Base64.NO_WRAP)) } catch (_: Exception) {
      clearPendingRecord(context, id, cancelNotification = true)
      return null
    }
    return mapOf("pendingId" to id, "payload" to NfcProtocol.toMap(payload))
  }

  private fun stopActiveReader() {
    readerActivity?.let { activity -> NfcAdapter.getDefaultAdapter(activity)?.disableReaderMode(activity) }
    readerActivity = null
  }

  private val notificationPermissions: Permissions
    get() = appContext.permissions ?: throw Exceptions.PermissionsModuleNotFound()

  private fun isSuccess(response: ByteArray): Boolean = response.size >= 2 && response[response.size - 2] == 0x90.toByte() && response.last() == 0x00.toByte()

  private fun isHceServiceRegistered(context: Context): Boolean = try {
    context.packageManager.getServiceInfo(ComponentName(context, TapFormApduService::class.java), PackageManager.GET_META_DATA)
    true
  } catch (_: PackageManager.NameNotFoundException) { false }

  companion object {
    const val PREFS = "tapform.pending.request"
    private const val KEY_PENDING_IDS = "pending_ids_v2"
    private const val KEY_NEXT_NOTIFICATION_ID = "next_notification_id"
    const val KEY_SEEN_SESSIONS = "seen_sessions"
    private const val MAX_PENDING = 16
    private const val NOTIFICATION_ID_BASE = 7200
    const val ACTION_TOGGLE_EXCLUSION = "com.tapform.app.action.TOGGLE_NOTIFICATION_FIELD"
    const val ACTION_POST_DEVELOPMENT_NOTIFICATION = "com.tapform.app.action.POST_DEVELOPMENT_NOTIFICATION"
    const val EXTRA_PENDING_ID = "tapform.pending_id"
    const val EXTRA_FIELD_KEY = "tapform.field_key"

    @Volatile private var activePeerShare: NfcProtocol.PeerShare? = null

    internal fun getActivePeerShare(nowEpochSeconds: Long = System.currentTimeMillis() / 1000L): NfcProtocol.PeerShare? {
      val share = activePeerShare ?: return null
      if (share.expiresAtEpochSeconds <= nowEpochSeconds) { activePeerShare = null; return null }
      return share
    }

    private data class NotificationField(val key: String, val label: String)

    private data class RequestSummary(
      val organization: String,
      val purpose: String,
      val template: String,
      val retention: String,
      val required: List<NotificationField>,
      val optional: List<NotificationField>,
      val missingRequired: Int,
    )

    internal fun postDevelopmentRequestNotification(context: Context): Boolean {
      if (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE == 0) return false
      val now = System.currentTimeMillis() / 1000L
      val payload = NfcProtocol.Payload(UUID.randomUUID(), ByteArray(16).also { java.security.SecureRandom().nextBytes(it) }, now + 120L, UUID.randomUUID())
      val (accepted, pendingId) = acceptPending(context, payload)
      if (!accepted || pendingId == null) return false
      storeNotificationSummary(context, pendingId, RequestSummary(
        "Northfield Tech Fest", "Participant registration", "Event Registration", "30 days",
        listOf(
          NotificationField("full_name", "Full name"), NotificationField("date_of_birth", "Date of birth"),
          NotificationField("institution", "School"), NotificationField("grade", "Grade"),
          NotificationField("emergency_name", "Emergency contact"),
        ),
        listOf(NotificationField("phone", "Phone number")), 0,
      ))
      postRequestNotification(context, pendingId)
      return true
    }

    private val allowedFieldKeys = setOf(
      "full_name", "preferred_name", "date_of_birth", "gender", "nationality", "phone", "email",
      "address", "city", "state", "postal_code", "country", "institution", "grade", "student_id",
      "course", "emergency_name", "emergency_relationship", "emergency_phone", "emergency_email",
    )

    private fun recordKey(id: String, name: String) = "request.$id.$name"

    private fun pendingIds(prefs: android.content.SharedPreferences): MutableList<String> = try {
      val array = JSONArray(prefs.getString(KEY_PENDING_IDS, "[]"))
      MutableList(array.length()) { index -> array.getString(index) }
    } catch (_: Exception) { mutableListOf() }

    private fun writePendingIds(prefs: android.content.SharedPreferences, ids: List<String>) {
      val array = JSONArray()
      ids.forEach(array::put)
      prefs.edit().putString(KEY_PENDING_IDS, array.toString()).commit()
    }

    private fun clearPendingRecord(context: Context, pendingId: String, cancelNotification: Boolean): Boolean {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (pendingId !in pendingIds(prefs)) return false
      val notificationId = prefs.getInt(recordKey(pendingId, "notification_id"), notificationIdFor(pendingId))
      val ids = pendingIds(prefs).filterNot { it == pendingId }
      val editor = prefs.edit()
        .remove(recordKey(pendingId, "payload"))
        .remove(recordKey(pendingId, "session"))
        .remove(recordKey(pendingId, "expiry"))
        .remove(recordKey(pendingId, "notification_id"))
        .remove(recordKey(pendingId, "summary"))
        .remove(recordKey(pendingId, "excluded_fields"))
        .remove(recordKey(pendingId, "notification_state"))
      val saved = editor.commit()
      writePendingIds(prefs, ids)
      if (cancelNotification) (context.getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager)?.cancel(notificationId)
      return saved
    }

    private fun notificationIdFor(id: String): Int = (NOTIFICATION_ID_BASE + (id.hashCode() and 0x3fffffff)).coerceAtLeast(NOTIFICATION_ID_BASE)

    @Synchronized
    internal fun acceptPending(context: Context, payload: NfcProtocol.Payload): Pair<Boolean, String?> {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val now = System.currentTimeMillis() / 1000L
      val session = payload.requestSessionId.toString()
      pendingIds(prefs).filter { prefs.getLong(recordKey(it, "expiry"), 0L) <= now }
        .forEach { clearPendingRecord(context, it, cancelNotification = true) }
      val ids = pendingIds(prefs)
      for (id in ids) {
        val currentSession = prefs.getString(recordKey(id, "session"), null)
        val currentExpiry = prefs.getLong(recordKey(id, "expiry"), 0L)
        if (currentSession == session && currentExpiry > now) return Pair(true, id)
      }

      val seen = prefs.getString(KEY_SEEN_SESSIONS, "").orEmpty().split(',').filter(String::isNotBlank).toMutableList()
      if (session in seen) return Pair(false, null)
      if (ids.size >= MAX_PENDING) return Pair(false, null)
      val pendingId = UUID.randomUUID().toString()
      val usedNotificationIds = ids.map { prefs.getInt(recordKey(it, "notification_id"), notificationIdFor(it)) }.toSet()
      var notificationId = prefs.getInt(KEY_NEXT_NOTIFICATION_ID, NOTIFICATION_ID_BASE).coerceAtLeast(NOTIFICATION_ID_BASE)
      while (notificationId in usedNotificationIds) notificationId = if (notificationId >= Int.MAX_VALUE - 1) NOTIFICATION_ID_BASE else notificationId + 1
      val nextNotificationId = if (notificationId >= Int.MAX_VALUE - 1) NOTIFICATION_ID_BASE else notificationId + 1
      seen.add(session)
      while (seen.size > 64) seen.removeAt(0)
      val saved = prefs.edit()
        .putString(recordKey(pendingId, "session"), session)
        .putString(recordKey(pendingId, "payload"), Base64.encodeToString(NfcProtocol.encode(payload), Base64.NO_WRAP))
        .putLong(recordKey(pendingId, "expiry"), payload.expiresAtEpochSeconds)
        .putInt(recordKey(pendingId, "notification_id"), notificationId)
        .putString(recordKey(pendingId, "notification_state"), "active")
        .putInt(KEY_NEXT_NOTIFICATION_ID, nextNotificationId)
        .putString(KEY_SEEN_SESSIONS, seen.joinToString(","))
        .commit()
      if (!saved) return Pair(false, null)
      writePendingIds(prefs, ids + pendingId)
      return Pair(true, pendingId)
    }

    fun postRequestNotification(context: Context, pendingId: String) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (pendingId !in pendingIds(prefs)) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        val channel = android.app.NotificationChannel(CHANNEL_ID, "TapForm requests", android.app.NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Requests to share information through TapForm."
          lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 35)
          setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
      }
      val summary = readSummary(prefs, pendingId)
      val notificationId = prefs.getInt(recordKey(pendingId, "notification_id"), notificationIdFor(pendingId))
      val state = prefs.getString(recordKey(pendingId, "notification_state"), "active") ?: "active"
      val icon = resourceId(context, "tapform_notification", "drawable")
      val publicVersion = notificationBuilder(context)
        .setSmallIcon(icon)
        .setContentTitle("Information request")
        .setContentText(summary?.organization?.let { "$it · Unlock to review or respond" } ?: "Unlock to review or respond")
        .setStyle(android.app.Notification.BigTextStyle().bigText(summary?.organization?.let { "Information request from $it. Unlock to review or respond." } ?: "Unlock to review or respond."))
        .build()
      val expiresAt = prefs.getLong(recordKey(pendingId, "expiry"), 0L)
      val ttlMillis = (expiresAt * 1000L - System.currentTimeMillis()).coerceAtLeast(0L)
      val builder = notificationBuilder(context)
        .setSmallIcon(icon)
        .setContentTitle("TapForm")
        .setContentText(summary?.organization?.let { "$it wants information from your Vault" } ?: "Information request")
        .setCustomContentView(collapsedRemoteViews(context, pendingId, summary, state, notificationId))
        .setCustomBigContentView(expandedRemoteViews(context, pendingId, summary, state, notificationId))
        .setStyle(android.app.Notification.DecoratedCustomViewStyle())
        .setVisibility(android.app.Notification.VISIBILITY_PRIVATE)
        .setPublicVersion(publicVersion)
        .setOnlyAlertOnce(true)
        .apply { if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) setTimeoutAfter(ttlMillis) }
        .setAutoCancel(false)
      val notification = builder.build()
      manager.notify(notificationId, notification)
      if (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) {
        val remainingMs = (expiresAt * 1000L - System.currentTimeMillis()).coerceAtLeast(0L)
        Log.i("TapFormNotif", "posted custom notification state=$state remainingMs=$remainingMs activeCount=${manager.activeNotifications.size}")
      }
    }

    private fun parseNotificationSummary(input: Map<String, Any?>): RequestSummary? {
      fun safeText(key: String, max: Int): String? = (input[key] as? String)?.trim()?.take(max)?.takeIf(String::isNotBlank)
      fun safeFields(key: String): List<NotificationField>? = (input[key] as? List<*>)
        ?.take(20)?.mapNotNull { item ->
          val field = item as? Map<*, *> ?: return@mapNotNull null
          val fieldKey = (field["key"] as? String)?.takeIf { it in allowedFieldKeys } ?: return@mapNotNull null
          val label = (field["label"] as? String)?.trim()?.take(50)?.takeIf(String::isNotBlank) ?: return@mapNotNull null
          NotificationField(fieldKey, label)
        }
      val organization = safeText("organization", 80) ?: return null
      val purpose = safeText("purpose", 120) ?: return null
      val template = safeText("template", 80) ?: return null
      val retention = safeText("retention", 80) ?: return null
      val required = safeFields("required") ?: return null
      val optional = safeFields("optional") ?: return null
      val missing = (input["missingRequired"] as? Number)?.toInt()?.coerceIn(0, required.size) ?: return null
      if ((required + optional).map { it.key }.distinct().size != required.size + optional.size) return null
      return RequestSummary(organization, purpose, template, retention, required, optional, missing)
    }

    private fun storeNotificationSummary(context: Context, pendingId: String, summary: RequestSummary) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (pendingId !in pendingIds(prefs)) return
      val validKeys = (summary.required + summary.optional).map { it.key }.toSet()
      val oldExcluded = readExcludedKeys(prefs, pendingId)
      val excluded = if (prefs.contains(recordKey(pendingId, "excluded_fields"))) oldExcluded.intersect(validKeys)
        else summary.optional.map { it.key }.toSet()
      val json = JSONObject().put("organization", summary.organization).put("purpose", summary.purpose)
        .put("template", summary.template).put("retention", summary.retention)
        .put("required", fieldsJson(summary.required)).put("optional", fieldsJson(summary.optional))
        .put("missingRequired", summary.missingRequired)
      prefs.edit().putString(recordKey(pendingId, "summary"), json.toString())
        .putString(recordKey(pendingId, "excluded_fields"), JSONArray(excluded.toList()).toString()).commit()
    }

    private fun readSummary(prefs: android.content.SharedPreferences, pendingId: String): RequestSummary? = try {
      val json = prefs.getString(recordKey(pendingId, "summary"), null)?.let(::JSONObject) ?: return null
      fun fields(key: String) = json.getJSONArray(key).let { array -> List(array.length()) { index ->
        val item = array.getJSONObject(index)
        NotificationField(item.getString("key"), item.getString("label"))
      } }
      RequestSummary(json.getString("organization"), json.getString("purpose"), json.getString("template"), json.getString("retention"), fields("required"), fields("optional"), json.getInt("missingRequired"))
    } catch (_: Exception) { null }

    private fun fieldsJson(fields: List<NotificationField>) = JSONArray().apply {
      fields.forEach { put(JSONObject().put("key", it.key).put("label", it.label)) }
    }

    private fun actionPendingIntent(context: Context, pendingId: String, action: String, notificationId: Int, oneShot: Boolean = true): android.app.PendingIntent {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: throw IllegalStateException("TapForm launch Activity is unavailable.")
      launch.action = Intent.ACTION_VIEW
      launch.data = Uri.parse("tapform:///incoming?pendingId=$pendingId&notificationAction=$action")
      launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      val actionCode = when (action) { "decline", "retry_decline" -> 1; "share_selection" -> 2; "review" -> 3; else -> 0 }
      val flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE or
        (if (oneShot) android.app.PendingIntent.FLAG_ONE_SHOT else 0)
      return android.app.PendingIntent.getActivity(context, notificationId * 4 + actionCode, launch, flags)
    }

    @Suppress("DEPRECATION")
    private fun notificationBuilder(context: Context): android.app.Notification.Builder {
      val builder = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        android.app.Notification.Builder(context, CHANNEL_ID)
      } else {
        android.app.Notification.Builder(context)
      }
      // Leave the large icon unset so the decorated template uses the small
      // status icon for app identity.
      builder.setLargeIcon(null as android.graphics.Bitmap?)
      return builder
    }

    private fun resourceId(context: Context, name: String, type: String): Int =
      context.resources.getIdentifier(name, type, context.packageName).takeIf { it != 0 }
        ?: throw IllegalStateException("TapForm notification resource is missing.")

    private fun collapsedRemoteViews(context: Context, pendingId: String, summary: RequestSummary?, state: String, notificationId: Int): android.widget.RemoteViews {
      if (state != "active") return statusRemoteViews(context, state, summary)
      val view = android.widget.RemoteViews(context.packageName, resourceId(context, "tapform_notification_collapsed", "layout"))
      view.setOnClickPendingIntent(resourceId(context, "tapform_notification_root", "id"), actionPendingIntent(context, pendingId, "review", notificationId, oneShot = false))
      view.setTextViewText(resourceId(context, "tapform_collapsed_organization", "id"), summary?.organization ?: "Information request")
      view.setTextViewText(resourceId(context, "tapform_collapsed_required", "id"), summary?.let { summaryLine("Required", it.required) } ?: "A new request is ready to review.")
      val optionalText = if (summary?.optional.isNullOrEmpty()) "Optional: none" else summary?.let { summaryLine("Optional", it.optional) } ?: ""
      view.setTextViewText(resourceId(context, "tapform_collapsed_optional", "id"), optionalText)
      return view
    }

    private fun expandedRemoteViews(context: Context, pendingId: String, summary: RequestSummary?, state: String, notificationId: Int): android.widget.RemoteViews {
      if (state != "active") return statusRemoteViews(context, state, summary)
      val view = android.widget.RemoteViews(context.packageName, resourceId(context, "tapform_notification_expanded", "layout"))
      view.setOnClickPendingIntent(resourceId(context, "tapform_notification_root", "id"), actionPendingIntent(context, pendingId, "review", notificationId, oneShot = false))
      view.setOnClickPendingIntent(resourceId(context, "tapform_notification_decline", "id"), actionPendingIntent(context, pendingId, "decline", notificationId))
      view.setOnClickPendingIntent(resourceId(context, "tapform_notification_share", "id"), actionPendingIntent(context, pendingId, "share_selection", notificationId))
      val orgId = resourceId(context, "tapform_expanded_organization", "id")
      val templateId = resourceId(context, "tapform_expanded_template", "id")
      view.setTextViewText(orgId, summary?.organization ?: "Information request")
      view.setTextViewText(templateId, summary?.template ?: "Request details")
      val optionalGroupId = resourceId(context, "tapform_optional_group", "id")
      val requiredContainer = resourceId(context, "tapform_required_rows", "id")
      val optionalContainer = resourceId(context, "tapform_optional_rows", "id")
      if (summary == null) {
        view.setViewVisibility(optionalGroupId, android.view.View.GONE)
      } else {
        val excluded = readExcludedKeys(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE), pendingId)
        val fields = summary.required.map { it to true } + summary.optional.map { it to false }
        val shown = fields.take(MAX_NOTIFICATION_FIELDS)
        val shownRequired = shown.filter { it.second }
        val shownOptional = shown.filterNot { it.second }
        view.removeAllViews(requiredContainer)
        view.removeAllViews(optionalContainer)
        addFieldRows(context, view, pendingId, notificationId, requiredContainer, shownRequired.map { it.first }, excluded)
        addFieldRows(context, view, pendingId, notificationId, optionalContainer, shownOptional.map { it.first }, excluded)
        view.setViewVisibility(optionalGroupId, if (shownOptional.isEmpty()) android.view.View.GONE else android.view.View.VISIBLE)
        val extraCount = (fields.size - shown.size).coerceAtLeast(0)
        if (extraCount > 0) {
          val moreId = resourceId(context, "tapform_requested_more", "id")
          view.setTextViewText(moreId, "+ $extraCount more")
          view.setViewVisibility(moreId, android.view.View.VISIBLE)
        }
      }
      return view
    }

    private fun addFieldRows(context: Context, parent: android.widget.RemoteViews, pendingId: String, notificationId: Int, containerId: Int, fields: List<NotificationField>, excluded: Set<String>) {
      fields.forEachIndexed { index, field ->
        if (index > 0) parent.addView(containerId, android.widget.RemoteViews(context.packageName, resourceId(context, "tapform_notification_divider", "layout")))
        val row = android.widget.RemoteViews(context.packageName, resourceId(context, "tapform_notification_field_row", "layout"))
        val icon = resourceId(context, fieldIcon(field.key), "drawable")
        val iconId = resourceId(context, "tapform_field_icon", "id")
        val labelId = resourceId(context, "tapform_field_label", "id")
        val boxId = resourceId(context, "tapform_field_exclusion", "id")
        val markId = resourceId(context, "tapform_field_excluded_mark", "id")
        row.setImageViewResource(iconId, icon)
        row.setTextViewText(labelId, notificationFieldLabel(field.label))
        row.setTextViewText(markId, if (field.key in excluded) "X" else "")
        row.setContentDescription(boxId, if (field.key in excluded) "${field.label}, excluded from sharing. Tap to include." else "${field.label}, included in sharing. Tap to exclude.")
        row.setOnClickPendingIntent(boxId, togglePendingIntent(context, pendingId, field.key, notificationId))
        parent.addView(containerId, row)
      }
    }

    private fun fieldIcon(key: String): String = when (key) {
      "date_of_birth" -> "tapform_field_calendar"
      "institution", "student_id", "course" -> "tapform_field_school"
      "grade" -> "tapform_field_grade"
      "emergency_name", "emergency_relationship", "emergency_phone", "emergency_email" -> "tapform_field_emergency"
      "phone", "email" -> "tapform_field_contact"
      else -> "tapform_field_person"
    }

    private fun summaryLine(title: String, fields: List<NotificationField>): String {
      if (fields.isEmpty()) return "$title: none"
      val labels = fields.take(4).joinToString(" \u00b7 ") { it.label }
      val suffix = if (fields.size > 4) " \u2026" else ""
      return "$title: $labels$suffix"
    }

    private fun notificationFieldLabel(label: String): String {
      val minorWords = setOf("a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "via")
      return label.trim().split(Regex("\\s+")).mapIndexed { index, word ->
        if (index > 0 && word.lowercase() in minorWords) word.lowercase()
        else word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
      }.joinToString(" ")
    }

    private fun statusRemoteViews(context: Context, state: String, summary: RequestSummary?): android.widget.RemoteViews {
      val view = android.widget.RemoteViews(context.packageName, resourceId(context, "tapform_notification_status", "layout"))
      val (title, detail) = when (state) {
        "decline" -> "Declining request…" to "Sending your response securely."
        "share" -> "Sharing information…" to "Sending only the fields you selected."
        "review" -> "Opening TapForm…" to "Your request is ready to review."
        "error" -> "Couldn't complete request" to "Check your connection, then tap to review."
        else -> (summary?.organization ?: "TapForm") to "Request updated. Tap to review."
      }
      view.setTextViewText(resourceId(context, "tapform_status_title", "id"), title)
      view.setTextViewText(resourceId(context, "tapform_status_detail", "id"), detail)
      return view
    }

    private fun togglePendingIntent(context: Context, pendingId: String, fieldKey: String, notificationId: Int): android.app.PendingIntent {
      val identity = NotificationSelection.pendingIntentIdentity(pendingId, notificationId, fieldKey)
      val uri = Uri.parse(identity.uri)
      val intent = Intent(context, TapFormNotificationReceiver::class.java).setAction(ACTION_TOGGLE_EXCLUSION)
        .setData(uri).putExtra(EXTRA_PENDING_ID, pendingId).putExtra(EXTRA_FIELD_KEY, fieldKey)
      return android.app.PendingIntent.getBroadcast(context, identity.requestCode, intent,
        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
    }

    internal fun readNotificationSelection(context: Context, pendingId: String): Map<String, Any>? {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (pendingId !in pendingIds(prefs)) return null
      val summary = readSummary(prefs, pendingId) ?: return null
      val fields = summary.required + summary.optional
      val excluded = readExcludedKeys(prefs, pendingId).intersect(fields.map { it.key }.toSet())
      return mapOf("selectedKeys" to NotificationSelection.selectedKeys(fields.map { it.key }, excluded),
        "excludedRequiredKeys" to summary.required.map { it.key }.filter { it in excluded })
    }

    @Synchronized
    internal fun toggleNotificationExclusion(context: Context, pendingId: String, fieldKey: String): Boolean {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (pendingId !in pendingIds(prefs) || fieldKey !in allowedFieldKeys) return false
      val summary = readSummary(prefs, pendingId) ?: return false
      val fields = summary.required + summary.optional
      val excluded = NotificationSelection.toggleExcluded(readExcludedKeys(prefs, pendingId), fieldKey, fields.map { it.key }.toSet()) ?: return false
      val saved = prefs.edit().putString(recordKey(pendingId, "excluded_fields"), JSONArray(excluded.toList()).toString()).commit()
      if (saved) postRequestNotification(context, pendingId)
      return saved
    }

    private fun readExcludedKeys(prefs: android.content.SharedPreferences, pendingId: String): Set<String> = try {
      val array = JSONArray(prefs.getString(recordKey(pendingId, "excluded_fields"), "[]"))
      buildSet { for (index in 0 until array.length()) array.optString(index).takeIf { it in allowedFieldKeys }?.let(::add) }
    } catch (_: Exception) { emptySet() }

    // M35's custom expanded content is height-limited. Keep three readable rows
    // and summarize overflow in the section heading so the system action rail fits.
    private const val MAX_NOTIFICATION_FIELDS = 3

    private fun markNotificationProcessing(context: Context, pendingId: String, state: String): Boolean {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (pendingId !in pendingIds(prefs)) return false
      val summary = readSummary(prefs, pendingId)
      val id = prefs.getInt(recordKey(pendingId, "notification_id"), notificationIdFor(pendingId))
      val icon = resourceId(context, "tapform_notification", "drawable")
      prefs.edit().putString(recordKey(pendingId, "notification_state"), state).commit()
      val notification = notificationBuilder(context).setSmallIcon(icon).setContentTitle("TapForm")
        .setContentText(summary?.organization ?: "Information request")
        .setCustomContentView(statusRemoteViews(context, state, summary))
        .setCustomBigContentView(statusRemoteViews(context, state, summary))
        .setVisibility(android.app.Notification.VISIBILITY_PRIVATE).setOnlyAlertOnce(true)
        .setContentIntent(actionPendingIntent(context, pendingId, "review", id, oneShot = false)).build()
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).notify(id, notification)
      return true
    }

    private fun failNotification(context: Context, pendingId: String, retryAction: String): Boolean {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (pendingId !in pendingIds(prefs)) return false
      val summary = readSummary(prefs, pendingId)
      val id = prefs.getInt(recordKey(pendingId, "notification_id"), notificationIdFor(pendingId))
      val icon = resourceId(context, "tapform_notification", "drawable")
      prefs.edit().putString(recordKey(pendingId, "notification_state"), "error").commit()
      val notification = notificationBuilder(context).setSmallIcon(icon).setContentTitle("TapForm")
        .setContentText(summary?.organization ?: "Information request")
        .setCustomContentView(statusRemoteViews(context, "error", summary))
        .setCustomBigContentView(statusRemoteViews(context, "error", summary))
        .setVisibility(android.app.Notification.VISIBILITY_PRIVATE).setOnlyAlertOnce(true)
        .setContentIntent(actionPendingIntent(context, pendingId, "review", id, oneShot = false)).build()
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).notify(id, notification)
      return true
    }

    private fun finishNotification(context: Context, pendingId: String, state: String, sharedCount: Int): Boolean {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (pendingId !in pendingIds(prefs)) return false
      val summary = readSummary(prefs, pendingId)
      val id = prefs.getInt(recordKey(pendingId, "notification_id"), notificationIdFor(pendingId))
      val icon = resourceId(context, "tapform_notification", "drawable")
      val approved = state == "approved"
      val title = when (state) { "approved" -> "Shared"; "declined" -> "Request declined"; "expired" -> "Request expired"; "processed" -> "Request already answered"; else -> "Request no longer available" }
      val body = if (approved) "$sharedCount ${if (sharedCount == 1) "field" else "fields"} shared with ${summary?.organization ?: "the organization"}." else if (state == "processed") "${summary?.organization ?: "This request"} has already received a response." else (summary?.organization ?: "This request")
      val notification = notificationBuilder(context).setSmallIcon(icon).setContentTitle(title).setContentText(body)
        .setStyle(android.app.Notification.BigTextStyle().bigText(body)).setVisibility(android.app.Notification.VISIBILITY_PRIVATE)
        .setOnlyAlertOnce(true).apply { if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) setTimeoutAfter(6000) }.build()
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).notify(id, notification)
      clearPendingRecord(context, pendingId, cancelNotification = false)
      Handler(Looper.getMainLooper()).postDelayed({ (context.getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager)?.cancel(id) }, 6000)
      return true
    }

    const val CHANNEL_ID = "tapform_requests_v2"
  }
}
