package expo.modules.nfcpeer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationSelectionTest {
  @Test fun toggleAddsAndRemovesExclusionWithoutChangingOtherFields() {
    val requested = setOf("full_name", "school", "phone")
    val first = NotificationSelection.toggleExcluded(setOf("phone"), "school", requested)
    assertEquals(setOf("phone", "school"), first)
    assertEquals(setOf("school"), NotificationSelection.toggleExcluded(first!!, "phone", requested))
  }

  @Test fun unknownOrCrossRequestFieldCannotBeExcluded() {
    assertNull(NotificationSelection.toggleExcluded(emptySet(), "address", setOf("full_name", "phone")))
  }

  @Test fun selectedKeysExcludeExactlyTheMarkedFields() {
    assertEquals(listOf("full_name", "school"), NotificationSelection.selectedKeys(
      listOf("full_name", "school", "phone"), setOf("phone"),
    ))
  }

  @Test fun pendingIntentIdentitySeparatesRequestsAndFieldControls() {
    val first = NotificationSelection.pendingIntentIdentity("request-a", 4101, "phone")
    val anotherField = NotificationSelection.pendingIntentIdentity("request-a", 4101, "email")
    val anotherRequest = NotificationSelection.pendingIntentIdentity("request-b", 4102, "phone")
    assertEquals("tapform-notification://request-a/toggle/phone", first.uri)
    assertEquals(false, first.uri == anotherField.uri)
    assertEquals(false, first.uri == anotherRequest.uri)
  }
}
