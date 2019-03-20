# tb-rescue-conflicting-alternatives

Converts a mail with conflicting alternative bodes to regular multipart mail.

Sometimes messages with the type "multipart/alternative" can have multiple bodies with same Content-Type, like "text/plain". However Thunderbird automatically chooses the last one and ignores others, so we cannot read other part bodes even if the last one is broken.

This addon automatically detects such conflicting bodies and converts secondary part to an attachment.
