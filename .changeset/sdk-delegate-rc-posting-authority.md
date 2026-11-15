---
"@ecency/sdk": patch
---

`useDelegateRc` asks for posting authority instead of active. `delegate_rc` is a custom_json signed through `required_posting_auths`, and since HF28's strict authority checks an active key can not sign it, so key logins were signing with the wrong key.
