"""
Patch bedrock_proxy_h2.js to extract sender_id from OpenClaw's JSON metadata.

OpenClaw wraps IM messages as:
  Conversation info (untrusted metadata):
  ```json
  {
    "sender_id": "1484960930608578580",
    "sender": "pitchshow",
    "channel": "discord",
    ...
  }
  ```

The existing regex-based extraction misses this format.
This patch adds JSON parsing as a higher-priority extraction method.
"""

path = "/home/ubuntu/bedrock_proxy_h2.js"
with open(path) as f:
    code = f.read()

# Find the spot right after "let channel = 'unknown';" and "let userId = 'unknown';"
# and add JSON metadata extraction before the regex fallbacks

old_block = """  let channel = 'unknown';
  let userId = 'unknown';

  // Primary: extract from user message text"""

new_block = """  let channel = 'unknown';
  let userId = 'unknown';

  // Priority 0: Extract from OpenClaw's JSON metadata in message text
  // OpenClaw embeds sender info as JSON in the conversation context
  try {
    const jsonMatch = userText.match(/```json\\s*\\n([\\s\\S]*?)\\n```/);
    if (jsonMatch) {
      const meta = JSON.parse(jsonMatch[1]);
      if (meta.sender_id) {
        userId = meta.sender_id;
        // Detect channel from metadata or message context
        if (meta.channel) channel = meta.channel.toLowerCase();
        else if (userText.includes('Discord')) channel = 'discord';
        else if (userText.includes('Telegram')) channel = 'telegram';
        else if (userText.includes('Slack')) channel = 'slack';
        else if (userText.includes('WhatsApp')) channel = 'whatsapp';
        else if (userText.includes('Feishu') || userText.includes('feishu')) channel = 'feishu';
      }
    }
  } catch (e) { /* JSON parse failed, fall through to regex */ }

  // Also try system prompt JSON metadata
  try {
    const sysText = systemParts.map(p => (typeof p === 'string' ? p : p.text || '')).join(' ');
    const sysJsonMatch = sysText.match(/```json\\s*\\n([\\s\\S]*?)\\n```/);
    if (sysJsonMatch && userId === 'unknown') {
      const meta = JSON.parse(sysJsonMatch[1]);
      if (meta.sender_id) userId = meta.sender_id;
      if (meta.channel) channel = meta.channel.toLowerCase();
    }
    // Also try "label": "pitchshow (1484960930608578580)" format
    if (userId === 'unknown') {
      const labelMatch = sysText.match(/"label":\\s*"[^"]*\\((\\d{10,})\\)"/);
      if (labelMatch) userId = labelMatch[1];
      const chanMatch = sysText.match(/"channel":\\s*"(\\w+)"/i);
      if (chanMatch) channel = chanMatch[1].toLowerCase();
    }
  } catch (e) { /* fall through */ }

  // Priority 1: extract from user message text (original regex)"""

if old_block in code:
    code = code.replace(old_block, new_block, 1)
    with open(path, 'w') as f:
        f.write(code)
    print("PATCHED OK — added JSON metadata extraction")
else:
    print("ERROR: Pattern not found. File may have changed.")
    # Show what's around the target area
    idx = code.find("let channel = 'unknown'")
    if idx >= 0:
        print(f"Found 'let channel' at position {idx}")
        print(code[idx:idx+200])
    else:
        print("'let channel' not found at all")
