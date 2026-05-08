# 12 — Claude Chat

## CHAT-12.1 — drawer open/close + state

- CHAT-12.1-01: ❌ When the user clicks the chat toggle button, the drawer slides up over PaneManager.
- CHAT-12.1-02: ❌ When the drawer is open and Escape is pressed, the drawer closes.
- CHAT-12.1-03: ❌ When the drawer is open and a click lands outside the drawer, the drawer stays open.
- CHAT-12.1-04: ❌ When the app launches, the drawer is closed (open/closed state is not persisted).
- CHAT-12.1-05: ❌ When the user resizes the drawer via the top-edge handle, the new height persists across launches.
- CHAT-12.1-06: ❌ When the user clicks the toggle while a response is streaming and the drawer is closed, the drawer opens with streaming visible.

## CHAT-12.2 — message rendering

- CHAT-12.2-01: ❌ When the user sends a message, a "You" labelled bubble appears with the trimmed text.
- CHAT-12.2-02: ❌ When `message_start` arrives, a "Claude" labelled bubble appears with empty text + streaming cursor.
- CHAT-12.2-03: ❌ When `partial_text` arrives, the latest assistant bubble's text grows by the delta.
- CHAT-12.2-04: ❌ When `message_end` arrives, the streaming cursor disappears.
- CHAT-12.2-05: ❌ When `tool_use` arrives, a collapsible block renders inside the assistant bubble showing the tool name.
- CHAT-12.2-06: ❌ When the tool-use block is clicked, it expands to show the JSON input (and output if present).

## CHAT-12.3 — composer

- CHAT-12.3-01: ❌ When the user presses Enter in the textarea, the message is sent and the textarea clears.
- CHAT-12.3-02: ❌ When the user presses Shift+Enter, a newline is inserted and the message is NOT sent.
- CHAT-12.3-03: ❌ When the textarea is empty/whitespace-only, the send button is disabled.
- CHAT-12.3-04: ❌ During streaming, the send button is replaced by a stop button.
- CHAT-12.3-05: ❌ When the stop button is clicked, the active stream is cancelled (subsequent partial_text events stop) and the subprocess stays alive.

## CHAT-12.4 — interrupt + reset

- CHAT-12.4-01: ❌ When `claude_interrupt` is invoked, the active turn ends without further partial text.
- CHAT-12.4-02: ❌ After interrupt, sending another message works (subprocess wasn't killed).
- CHAT-12.4-03: ❌ When `claude_reset` is invoked, all turns clear and usage resets to zero.
- CHAT-12.4-04: ❌ After reset, sending a new message respawns the subprocess transparently.

## CHAT-12.5 — crash recovery

- CHAT-12.5-01: ❌ When the subprocess exits unexpectedly, a `crashed` event fires.
- CHAT-12.5-02: ❌ One unexpected crash in a 60s window triggers a transparent respawn on next send.
- CHAT-12.5-03: ❌ Three unexpected crashes in a 60s window halt respawning and surface "claude: failing to start" in the footer.
- CHAT-12.5-04: ❌ Clicking the Retry link in the crashed footer banner clears the crash counter and respawns.

## CHAT-12.6 — status line

- CHAT-12.6-01: ✅ Footer shows "claude: idle · vault: <name>" when binary is found and no turns yet.
- CHAT-12.6-02: ✅ Footer shows "claude: not installed" (amber) when binary is missing.
- CHAT-12.6-03: ✅ Footer shows "claude: api-key billing (not subscription)" (amber) when ANTHROPIC_API_KEY is set.
- CHAT-12.6-04: ✅ After first turn ends, footer shows "<model> · <input> in / <output> out · $<cost> · vault: <name>".
- CHAT-12.6-05: ✅ Footer status line uses tabular-nums so digits do not jiggle while streaming.
- CHAT-12.6-06: ✅ Footer suppresses "vault: <name>" when no vault is open (vaultName is empty).

## CHAT-12.7 — setup screen

- CHAT-12.7-01: ❌ When binary missing and drawer opened, the SetupScreen renders with `curl … install.sh` snippet.
- CHAT-12.7-02: ❌ Clicking the Refresh button re-runs claude_status; if binary now found, drawer transitions to chat surface.

## CHAT-12.8 — settings

- CHAT-12.8-01: ❌ Default `claude.permissionMode` is `acceptEdits`.
- CHAT-12.8-02: ❌ Toggling permission mode in the VaultSwitcher dropdown persists across launches.
- CHAT-12.8-03: ❌ Drawer height persists across launches under `ui.claudeChat.height`.
