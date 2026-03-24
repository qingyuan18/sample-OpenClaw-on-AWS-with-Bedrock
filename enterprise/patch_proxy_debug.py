"""Patch bedrock_proxy_h2.js to add debug logging for message extraction."""
import sys

path = "/home/ubuntu/bedrock_proxy_h2.js"
with open(path) as f:
    code = f.read()

old = "log(`Request: ${path}"
new = """log(`DEBUG-SYS: ${JSON.stringify((parsed.system||[]).map(s=>typeof s==='string'?s:s.text||'')).slice(0,500)}`);
      log(`DEBUG-MSG: ${userText.slice(0,300)}`);
      log(`Request: ${path}"""

if old in code:
    code = code.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(code)
    print("PATCHED OK")
else:
    print("Pattern not found — already patched or file changed")
