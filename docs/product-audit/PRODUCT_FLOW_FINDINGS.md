# PRODUCT FLOW FINDINGS

This file answers task section 143: is the main flow clear, is the legacy treehole
duplicated by the newer system, are there too many pages, are the entries confusing, are
there island features or business dead ends, and are there places where the user finishes
something and is not told what comes next.

It is advisory. Nothing here is an automatic instruction to change the product, and no page
was deleted or merged during this run.

## 1. The main flow is coherent but only a minority of intents are honoured

The core support chain reads well end to end and was verified with real gestures on the
device (TonightHome -> JourneyDetail -> situation confirm -> temperature -> intent ->
ActionCenter, 8/8 steps, writes confirmed in PostgreSQL).

The break is at the intent step. apps/mp/src/views/JourneyDetail.vue:93-103 special-cases
HIGH_DISTRESS and JUST_LISTEN and then forwards everything else to the server targetRoute.
Three of those targets carry query parameters (?section=vault, ?section=handoff,
?view=outcomes) that no view reads, so STOP_IMPULSE, PREPARE_CONVERSATION and SEE_OUTCOMES
land on the same generic screen as NEXT_STEP. The product asks the user a question that
matters and then behaves as if they had not answered. This is the most valuable flow fix in
the audit.

## 2. The follow-up half of the loop has no user-facing door

ActionCenter.vue:40-41 already computes dueCheckins and primaryFollowUp, and the follow-up
worker emits notifications targeted at /pages/action/index?section=follow-up. That query
parameter is never read and the computed values are never rendered, so a due check-in can
only be resolved from the journey timeline or the archive. The loop closes in the data and
opens nowhere in the UI.

## 3. Legacy and new systems: mostly complementary, with one genuine overlap

The legacy treehole (Square / Mood / Letter / Diary / Tools) and the new Journey / Peer /
Self system are, in the main, two different products sharing one shell.

- Complementary. Diary and MonthlyReport are the record-keeping layer for the whole
  product, including journeys; FavoriteList and Archive are cross-cutting. LetterToday is a
  separate reflective ritual with its own AI contract. None of these duplicate a new-system
  capability.
- Genuine overlap. Square (匿名广场) and PeerNetwork (同路人) both offer "someone else who
  has been through this". Square is post-and-reply; Peer is match-and-converse with consent
  gates. They are different mechanisms for the same user need, they do not reference each
  other, and a user helped by one has no signal that the other exists. Recommendation:
  KEEP both, but add a single cross-link and a sentence explaining which suits which moment.
  This is the strongest MERGE_CANDIDATE in the product and should not be acted on without
  the owner's input.
- Conflict. MoodCreate is reachable from two paths (/pages/mood/create and
  /pages/post/create) with the same component and a visibility toggle that decides whether
  the result becomes a diary entry or a public post. The private and public halves have
  different review, privacy and admin consequences, so the toggle is doing product work the
  navigation does not express. Recommendation: KEEP, but consider making the two entries
  distinct so the user's intent is set by where they came from.
- No deletion recommended anywhere. Square, MoodCreate, LetterToday, the diary pages and
  the tool pages all have real entries, real APIs and real user value.

## 4. Too many pages? No - uneven entries, and one area with none

39 unique views is proportionate for the surface area. The problem is not the count, it is
that the entries are uneven:

- Island with no entrance. The tool subtree (ToolIndex, ToolDecompose, ToolRun and six
  aliases) has no inbound control at all. An entire product area is invisible.
- Entrance to nowhere. PeerNetwork.vue:63 points at a route that does not exist.
- Entrance that is not a tab. Square is only reachable from a moderation action or a
  no-history fallback, yet it is one of the two ways the product offers peer support.
- Direct-only pages. MeProfile has no inbound control; ToolIndex/ToolDecompose/ToolRun are
  direct-only as a consequence of the missing tool entrance.

## 5. Business dead ends

| Dead end | Where the user stops |
| --- | --- |
| STOP_IMPULSE / PREPARE_CONVERSATION / SEE_OUTCOMES | Land on a generic screen that does not reflect the choice; no next step is offered. |
| Due check-in / follow-up | No control exists to complete it, so the loop never closes. |
| Journey graduation | The API and data model support completion and an anonymous-experience draft; no UI calls it, so a journey never formally ends. |
| Handoff sharing | The card is saved and copied to the clipboard, but POST /handoffs/:id/share is never called, so the share story stops at a local card. |
| Admin user export | The operator is told a file was generated; nothing exists. |

## 6. Pages that show but do not act

RealityHandoff and Recovery both present rich, honest content and then depend on the user to
act outside the app. That is defensible for a wellbeing product and is not counted as a
defect, but both would benefit from one explicit "what now" control that writes something
(a check-in, a next review date) so the page leaves a trace.

## 7. Summary of recommendations (advisory only)

| Recommendation | Target | Confidence |
| --- | --- | --- |
| Honour the dropped support intents | JourneyDetail.vue:93-103 | High |
| Surface the due check-in and the follow-up | ActionCenter.vue | High |
| Add an entrance to the tool subtree | App.vue tab bar or Me | High |
| Fix the privacy-boundary link | PeerNetwork.vue:63 | High (one-line fix) |
| Cross-link Square and PeerNetwork | Square.vue / PeerNetwork.vue | Medium |
| Distinguish the two MoodCreate entries | apps/mp/src/router.ts | Medium |
| Give RealityHandoff / Recovery one writing control | both views | Low |

## 8. Status of this document

Recorded, not executed. Task section 114 forbids deleting legacy capability this round and
task section 120 forbids redoing the UI, so every item above is a proposal for the owner.
