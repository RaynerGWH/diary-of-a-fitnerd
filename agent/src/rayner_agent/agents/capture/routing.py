"""When a turn ends.

This is the graph's business, not the tools'. A tool knows how to save an
entry; it has no opinion on whether the conversation is over. Keeping these
here means changing the loop never means editing a tool.

The rule: a terminal tool fired, so END. Otherwise loop back to the model.

`reply` is always terminal, because saying something is the last thing that
happens in a turn.

`add_entries` is terminal only when it is the *sole* call. It produces its own
confirmation, so on its own the turn is done. But a mixed message ("pay rent
and mark the gym one done") emits `add_entries` alongside a search, and the
edit half still needs the model to come back. Ending there would save the
first thing and silently drop the second.
"""

from langchain_core.messages import AIMessage

ALWAYS_TERMINAL = frozenset({"reply"})
TERMINAL_IF_ALONE = frozenset({"add_entries"})


def is_terminal(message: AIMessage) -> bool:
    names = [call["name"] for call in (message.tool_calls or [])]

    # No tool call at all: the model answered in plain text. Treat that as an
    # implicit reply rather than looping to make it say the same thing through
    # a tool, which costs a round trip and changes nothing.
    if not names:
        return True

    if ALWAYS_TERMINAL.intersection(names):
        return True

    return len(names) == 1 and names[0] in TERMINAL_IF_ALONE


def reply_text(message: AIMessage, tool_results: dict[str, str]) -> str:
    """The single place the user-facing reply is read from.

    Three shapes arrive here and the UI only has one field, so they get
    normalised once rather than at every call site:

      - `reply` was called: its argument.
      - `add_entries` was called: the confirmation the tool built from the
        rows that actually landed, which is why it cannot claim to have saved
        something it did not.
      - plain text, no tool call: the content itself.
    """
    for call in message.tool_calls or []:
        if call["name"] == "reply":
            return str(call["args"].get("text", "")).strip()

    for call in message.tool_calls or []:
        if call["name"] == "add_entries" and call["id"] in tool_results:
            return tool_results[call["id"]]

    if isinstance(message.content, str) and message.content.strip():
        return message.content.strip()

    return "done"
