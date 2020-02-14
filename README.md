# tb-rescue-conflicting-alternatives

Converts a mail with conflicting alternative bodies to regular multipart mail.

Sometimes messages with the type "multipart/alternative" can have multiple bodies with same Content-Type, like "text/plain". However Thunderbird automatically chooses the last one and ignores others, so we cannot read other part bodes even if the last one is broken.

This addon automatically detects such conflicting bodies and converts secondary part to an attachment.

----

By the way, you can alternate this addon with a built-in option of Thunderbird itself.

1. Go to about:config and set `mailnews.display.show_all_body_parts_menu` to `true`.
2. Choose the menu: View => Message Body As => All Body Parts.

Then you'll see all body parts as attachments.
