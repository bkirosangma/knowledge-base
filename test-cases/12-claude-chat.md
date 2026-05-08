# 12 — Claude Chat

## CHAT-12.1 — drawer open/close + state

- CHAT-12.1-01: 🟡 When the user clicks the chat toggle button, the drawer slides up over PaneManager. (unit: ChatToggleButton.test "toggles drawer when clicked"; ClaudeChatDrawer.test "renders message list + composer when open")
- CHAT-12.1-02: 🟡 When the drawer is open and Escape is pressed, the drawer closes. (unit: ClaudeChatDrawer.test "closes on Escape")
- CHAT-12.1-03: ❌ When the drawer is open and a click lands outside the drawer, the drawer stays open.
- CHAT-12.1-04: 🟡 When the app launches, the drawer is closed (open/closed state is not persisted). (unit: useDrawerState defaults to isOpen=false; ClaudeChatDrawer.test "renders nothing when closed")
- CHAT-12.1-05: 🟡 When the user resizes the drawer via the top-edge handle, the new height persists across launches. (unit: useDrawerState.test "persists height on setHeight"; DrawerResizeHandle.test "invokes onResize on drag")
- CHAT-12.1-06: 🟡 When the user clicks the toggle while a response is streaming and the drawer is closed, the drawer opens with streaming visible. (unit: ChatToggleButton.test "pulses while streaming and closed")

## CHAT-12.2 — message rendering

- CHAT-12.2-01: 🟡 When the user sends a message, a "You" labelled bubble appears with the trimmed text. (unit: MessageBubble.test "renders user role label and text"; MessageList.test "renders a user + assistant turn pair")
- CHAT-12.2-02: 🟡 When `message_start` arrives, a "Claude" labelled bubble appears with empty text + streaming cursor. (unit: MessageList.test "renders streaming indicator inside live assistant turn"; PartialMessageStream.test "renders blinking cursor when streaming")
- CHAT-12.2-03: 🟡 When `partial_text` arrives, the latest assistant bubble's text grows by the delta. (unit: useClaudeSession.test "accumulates partial_text deltas")
- CHAT-12.2-04: 🟡 When `message_end` arrives, the streaming cursor disappears. (unit: PartialMessageStream.test "renders nothing when not streaming"; useClaudeSession.test "marks turn ended on message_end")
- CHAT-12.2-05: 🟡 When `tool_use` arrives, a collapsible block renders inside the assistant bubble showing the tool name. (unit: ToolUseBlock.test "renders tool name and is collapsed by default"; MessageList.test "renders tool-use blocks inside assistant turn")
- CHAT-12.2-06: 🟡 When the tool-use block is clicked, it expands to show the JSON input (and output if present). (unit: ToolUseBlock.test "expands on click"; ToolUseBlock.test "renders output when provided + expanded")

## CHAT-12.3 — composer

- CHAT-12.3-01: 🟡 When the user presses Enter in the textarea, the message is sent and the textarea clears. (unit: Composer.test "submits on Enter"; Composer.test "clears textarea after send")
- CHAT-12.3-02: 🟡 When the user presses Shift+Enter, a newline is inserted and the message is NOT sent. (unit: Composer.test "inserts newline on Shift+Enter")
- CHAT-12.3-03: 🟡 When the textarea is empty/whitespace-only, the send button is disabled. (unit: Composer.test "does not submit empty messages")
- CHAT-12.3-04: 🟡 During streaming, the send button is replaced by a stop button. (unit: Composer.test "shows stop button while streaming")
- CHAT-12.3-05: 🟡 When the stop button is clicked, the active stream is cancelled (subsequent partial_text events stop) and the subprocess stays alive. (unit: Composer.test "fires onInterrupt when stop clicked")

## CHAT-12.4 — interrupt + reset

- CHAT-12.4-01: ❌ When `claude_interrupt` is invoked, the active turn ends without further partial text.
- CHAT-12.4-02: ❌ After interrupt, sending another message works (subprocess wasn't killed).
- CHAT-12.4-03: 🟡 When `claude_reset` is invoked, all turns clear and usage resets to zero. (unit: useClaudeSession.test "clears state on reset")
- CHAT-12.4-04: ❌ After reset, sending a new message respawns the subprocess transparently.

## CHAT-12.5 — crash recovery

- CHAT-12.5-01: ❌ When the subprocess exits unexpectedly, a `crashed` event fires.
- CHAT-12.5-02: ❌ One unexpected crash in a 60s window triggers a transparent respawn on next send.
- CHAT-12.5-03: ❌ Three unexpected crashes in a 60s window halt respawning and surface "claude: failing to start" in the footer.
- CHAT-12.5-04: 🟡 Clicking the Retry link in the crashed footer banner clears the crash counter and respawns. (unit: ClaudeStatusLine.test "CHAT-14-01: renders crashed state with Retry button that calls reset")

## CHAT-12.6 — status line

- CHAT-12.6-01: ✅ Footer shows "claude: idle · vault: <name>" when binary is found and no turns yet.
- CHAT-12.6-02: ✅ Footer shows "claude: not installed" (amber) when binary is missing.
- CHAT-12.6-03: ✅ Footer shows "claude: api-key billing (not subscription)" (amber) when ANTHROPIC_API_KEY is set.
- CHAT-12.6-04: ✅ After first turn ends, footer shows "<model> · <input> in / <output> out · $<cost> · vault: <name>".
- CHAT-12.6-05: ✅ Footer status line uses tabular-nums so digits do not jiggle while streaming.
- CHAT-12.6-06: ✅ Footer suppresses "vault: <name>" when no vault is open (vaultName is empty).

## CHAT-12.7 — setup screen

- CHAT-12.7-01: 🟡 When binary missing and drawer opened, the SetupScreen renders with `curl … install.sh` snippet. (unit: SetupScreen.test "shows install heading"; ClaudeChatDrawer.test "renders SetupScreen when binary is missing")
- CHAT-12.7-02: 🟡 Clicking the Refresh button re-runs claude_status; if binary now found, drawer transitions to chat surface. (unit: SetupScreen.test "calls refresh on click")

## CHAT-12.8 — settings

- CHAT-12.8-01: 🟡 Default `claude.permissionMode` is `acceptEdits`. (unit: VaultSwitcher.test "displays the current permission mode (acceptEdits by default)")
- CHAT-12.8-02: 🟡 Toggling permission mode in the VaultSwitcher dropdown persists across launches. (unit: VaultSwitcher.test "toggles from acceptEdits to default and persists")
- CHAT-12.8-03: 🟡 Drawer height persists across launches under `ui.claudeChat.height`. (unit: useDrawerState.test "persists height on setHeight")
