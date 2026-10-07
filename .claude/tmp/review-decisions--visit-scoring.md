# Review decisions — visit-scoring

Implementation-time decisions recorded outside the investigate-and-propose flow — PR review
findings (fixed, answered or escalated) and developer instructions given mid-implementation.
`/ac-share:publish-design-docs` renders this section into `decision-logs.md` under the same heading.
Write entries only with `design-docs-publishing/scripts/append-decision.py`.

## Implementation decisions (execute-plan)

### 2026-10-07 — Chat design decisions

- D1 [confirmed · ai-accepted · 2026-10-07] Pass count resets per KH visit
  ai_proposed: Only images scored Đạt during the current KH visit count toward số ảnh cần đạt (header counter, Auto next auto-save of A, Esc auto-save of A / Có n ảnh đạt). A visit starts on every fillAndSearch; closing and reopening the popup for the same KH keeps its scores.
  dev_ruling: Mỗi lượt vào KH (Recommended)
  evidence: chat 2026-10-07; harness T1-T7, T14
  chat · design instruction
- D2 [confirmed · dev-amended · 2026-10-07] Earlier-visit results shown as normal ✓/✕, re-scorable from the footer
  ai_proposed: Show earlier-visit results faded, not counted; footer offers score buttons; jumps include them.
  dev_ruling: ảnh cũ không hiện mờ → Hiện ✓/✕ bình thường — làm đi (footer shows 'trước: …' plus score buttons)
  evidence: chat 2026-10-07; harness T1b, T1c, T8
  chat · design instruction
- D3 [confirmed · ai-accepted · 2026-10-07] Tab no longer closes the image popup
  ai_proposed: Developer asked to remove the Tab close function; Tab is swallowed inside the popup so focus cannot wander behind it; close button label becomes ✕ Đóng.
  dev_ruling: xoá bỏ chức năng phím tab; approved with 'Hiện ✓/✕ bình thường — làm đi'
  evidence: chat 2026-10-07; harness T10a-T10c
  chat · design instruction

### 2026-10-07 — Adversarial review round 1

- D4 [confirmed · ai-accepted · 2026-10-07] Failed save undo: latest score only, back to the last saved score
  ai_proposed: Bundle the visit state into currentVisit (resultsByImageId, savedResultsByImageId, latestScoreTokensByImageId); a failed save undoes only the latest score of its image, back to that visit's last saved score; thumbnails, footer, Shift and jumps read one source; rerender the open popup after an undo.
  dev_ruling: Làm đi — tất cả
  evidence: workflow wf_65e5dbff-d80 findings #0, #3 (reproduced); harness T17, T18, T20
  review · adversarial · fix
- D5 [confirmed · ai-accepted · 2026-10-07] Esc drains the score queue before counting
  ai_proposed: autoAssignPassOnEsc awaits drainScoreQueue() instead of the scoreQueue snapshot, so scores queued after Esc (reopened popup) resolve before the count.
  dev_ruling: Làm đi — tất cả
  evidence: workflow wf_65e5dbff-d80 finding #2 (reproduced); harness T19
  review · adversarial · fix
- D6 [confirmed · ai-accepted · 2026-10-07] Next-day jump skips images already scored this visit
  ai_proposed: goToNextDay jumps to the next other-day image not scored in this visit (earlier-visit results included); none left -> next image not scored this visit. Changes README 4f.
  dev_ruling: Làm đi — tất cả
  evidence: workflow wf_65e5dbff-d80 finding #1 (reproduced); harness T21, T23
  review · adversarial · fix
- D7 [confirmed · ai-accepted · 2026-10-07] Tab swallowed inside the Mã KH trùng box too
  ai_proposed: dupInput keydown swallows Tab so focus cannot jump to the popup's ✕ Đóng button; README states Tab does nothing in the popup and in the box.
  dev_ruling: Làm đi — tất cả
  evidence: workflow wf_65e5dbff-d80 finding #4 (reproduced); harness T22
  review · adversarial · fix
- D8 [confirmed · ai-accepted · 2026-10-07] Merged-album reopen shows only the last album: out of scope
  ai_proposed: Answer: pre-existing — reopening a merged ('Gộp đơn vị') popup by clicking the page only fetches the last album; this diff neither causes nor worsens it.
  dev_ruling: Làm đi — tất cả (proposal listed it as not fixed)
  evidence: workflow wf_65e5dbff-d80 refuted finding (merged albums)
  review · adversarial · answer
- D9 [confirmed · ai-accepted · 2026-10-07] Partial re-score then Esc overwrites an earlier Đạt row: intended
  ai_proposed: Answer: by design (pass count resets per visit) — Esc saves what this visit verified; 0 passes saves nothing.
  dev_ruling: Làm đi — tất cả (proposal listed it as not fixed)
  evidence: workflow wf_65e5dbff-d80 refuted finding; harness T2, T3b, T14
  review · adversarial · answer

## Published
