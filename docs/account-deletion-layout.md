# Mobile document layout

The Trello report «раздел „удаление аккаунта“ сдвигается» concerns the public
`/account-deletion` document in an iPhone browser, not the deletion confirmation
screen or the account lifecycle. The shared header's hidden beta tooltip was
extending beyond the viewport. Tooltip positioning now keeps its panel inside
16px screen gutters, including while hidden, and adjusts its arrow to the trigger.
Resize and content/font changes remeasure the panel; long words can wrap.

Check the document at phone widths, both with the beta tooltip closed and open,
and after resizing. Check another shared-header page as well. The public URLs,
legal copy, deletion API, and seven-day recovery behavior stay the same.

Mobile follow-up: `mobile/` is absent in this tree. On iOS and Android, open
«Удаление аккаунта и данных» from the legal/support screen and verify that the
public document cannot be panned sideways. The native deletion confirmation
screen needs no matching markup or copy change for this browser tooltip fix;
it continues using `POST /api/me/delete`. No API addition is needed.
