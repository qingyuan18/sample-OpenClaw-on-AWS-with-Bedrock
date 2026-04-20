#!/usr/bin/env python3
"""
DingTalk Stream Bridge for OpenClaw Enterprise.

Connects to DingTalk via Stream protocol (WebSocket long-connection),
receives messages from DingTalk bot, and forwards them to the H2 Proxy
(Bedrock Converse API format) which handles tenant routing + AgentCore.

No public IP or webhook URL needed — the bridge initiates the connection.

Usage:
  DINGTALK_APP_KEY=xxx DINGTALK_APP_SECRET=yyy python3 dingtalk_stream_bridge.py

Environment variables:
  DINGTALK_APP_KEY      - DingTalk app key (required)
  DINGTALK_APP_SECRET   - DingTalk app secret (required)
  H2_PROXY_URL          - H2 proxy HTTP/1.1 endpoint (default: http://127.0.0.1:8091)
"""

import json
import logging
import os
import sys
import time
import threading
import urllib.request

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [dingtalk-bridge] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

APP_KEY = os.environ.get("DINGTALK_APP_KEY", "")
APP_SECRET = os.environ.get("DINGTALK_APP_SECRET", "")
H2_PROXY_URL = os.environ.get("H2_PROXY_URL", "http://127.0.0.1:8092")

DINGTALK_TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/accessToken"
DINGTALK_STREAM_URL = "https://api.dingtalk.com/v1.0/gateway/connections/open"
DINGTALK_REPLY_URL = "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend"


def get_access_token():
    """Get DingTalk access token via app credentials."""
    payload = json.dumps({"appKey": APP_KEY, "appSecret": APP_SECRET}).encode()
    req = urllib.request.Request(
        DINGTALK_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
    token = data.get("accessToken", "")
    if not token:
        raise RuntimeError(f"Failed to get access token: {data}")
    logger.info("Got DingTalk access token (expires in %ss)", data.get("expireIn", "?"))
    return token


def open_stream_connection(token):
    """Open a DingTalk Stream connection, returns WebSocket endpoint + ticket."""
    payload = json.dumps({
        "clientId": APP_KEY,
        "clientSecret": APP_SECRET,
        "subscriptions": [
            {"type": "CALLBACK", "topic": "/v1.0/im/bot/messages/get"},
        ],
    }).encode()
    req = urllib.request.Request(
        DINGTALK_STREAM_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
    endpoint = data.get("endpoint", "")
    ticket = data.get("ticket", "")
    if not endpoint:
        raise RuntimeError(f"Failed to open stream connection: {data}")
    logger.info("Stream endpoint: %s", endpoint)
    return endpoint, ticket


def forward_to_proxy(channel, user_id, message_text):
    """Forward message to H2 Proxy in Bedrock Converse API format."""
    meta_json = json.dumps({"channel": "dingtalk", "sender_id": user_id})
    bedrock_payload = {
        "modelId": "default",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"text": f"```json\n{meta_json}\n```\n{message_text}"},
                ],
            }
        ],
    }
    data = json.dumps(bedrock_payload).encode()
    req = urllib.request.Request(
        f"{H2_PROXY_URL}/model/converse",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
        output = result.get("output", {})
        content = output.get("message", {}).get("content", [])
        return "".join(b.get("text", "") for b in content).strip()
    except Exception as e:
        logger.error("Proxy forward failed: %s", e)
        return "抱歉，处理消息时出错了，请稍后重试。"


def reply_to_user(token, user_id, text):
    """Send reply back to DingTalk user via robot oTo message."""
    payload = json.dumps({
        "robotCode": APP_KEY,
        "userIds": [user_id],
        "msgKey": "sampleText",
        "msgParam": json.dumps({"content": text}),
    }).encode()
    req = urllib.request.Request(
        DINGTALK_REPLY_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-acs-dingtalk-access-token": token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
        logger.info("Reply sent to %s: %s", user_id, result)
    except Exception as e:
        logger.error("Reply to %s failed: %s", user_id, e)


def handle_message(token, msg_data):
    """Handle a single incoming DingTalk message."""
    sender_id = msg_data.get("senderStaffId", "") or msg_data.get("senderId", "")
    text_content = ""
    msg_type = msg_data.get("msgtype", "text")
    if msg_type == "text":
        text_content = msg_data.get("text", {}).get("content", "").strip()
    else:
        text_content = f"[{msg_type} message]"

    if not sender_id or not text_content:
        logger.warning("Ignoring empty message: %s", msg_data)
        return

    logger.info("Message from %s: %s", sender_id, text_content[:80])

    response_text = forward_to_proxy("dingtalk", sender_id, text_content)
    logger.info("Response to %s: %s", sender_id, response_text[:80])

    reply_to_user(token, sender_id, response_text)


def run_stream():
    """Main loop: connect to DingTalk Stream and process messages."""
    try:
        import websocket
    except ImportError:
        logger.error("websocket-client not installed. Run: pip install websocket-client")
        sys.exit(1)

    token = get_access_token()
    token_refresh_at = time.time() + 6000  # refresh before 7200s expiry

    while True:
        try:
            if time.time() > token_refresh_at:
                token = get_access_token()
                token_refresh_at = time.time() + 6000

            endpoint, ticket = open_stream_connection(token)

            ws_url = f"{endpoint}?ticket={ticket}"
            logger.info("Connecting to Stream WebSocket...")

            ws = websocket.WebSocket()
            ws.connect(ws_url)
            logger.info("Connected to DingTalk Stream")

            while True:
                frame = ws.recv()
                if not frame:
                    continue

                try:
                    msg = json.loads(frame)
                except json.JSONDecodeError:
                    logger.warning("Non-JSON frame: %s", frame[:200])
                    continue

                msg_type = msg.get("type", "")

                if msg_type == "SYSTEM":
                    topic = msg.get("headers", {}).get("topic", "")
                    if topic == "ping":
                        ws.send(json.dumps({
                            "code": 200,
                            "headers": msg.get("headers", {}),
                            "message": "ok",
                            "data": msg.get("data", ""),
                        }))
                        logger.debug("Pong sent")
                    continue

                if msg_type == "CALLBACK":
                    topic = msg.get("headers", {}).get("topic", "")
                    data_str = msg.get("data", "{}")
                    try:
                        data = json.loads(data_str) if isinstance(data_str, str) else data_str
                    except json.JSONDecodeError:
                        data = {}

                    # ACK the callback immediately
                    ws.send(json.dumps({
                        "code": 200,
                        "headers": msg.get("headers", {}),
                        "message": "ok",
                        "data": "",
                    }))

                    if topic == "/v1.0/im/bot/messages/get":
                        threading.Thread(
                            target=handle_message,
                            args=(token, data),
                            daemon=True,
                        ).start()
                    else:
                        logger.debug("Ignoring callback topic: %s", topic)

        except KeyboardInterrupt:
            logger.info("Shutting down...")
            break
        except Exception as e:
            logger.error("Stream error: %s, reconnecting in 5s...", e)
            time.sleep(5)


def main():
    if not APP_KEY or not APP_SECRET:
        logger.error("DINGTALK_APP_KEY and DINGTALK_APP_SECRET are required")
        sys.exit(1)

    logger.info("Starting DingTalk Stream Bridge")
    logger.info("  App Key: %s...%s", APP_KEY[:6], APP_KEY[-4:])
    logger.info("  H2 Proxy: %s", H2_PROXY_URL)

    run_stream()


if __name__ == "__main__":
    main()
