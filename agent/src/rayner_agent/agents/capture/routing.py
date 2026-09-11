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

# Tools whose return value is phrased for the user rather than the model,
# so it can be shown as the reply without paying for another model call.
SELF_DESCRIBING = frozenset({"add_entries", "edit_entry", "delete_entry"})

ALWAYS_TERMINAL = frozenset({"reply"})
# Every self-describing tool is also terminal when it is the sole call.
# These two must be: letting the model speak after one of them lets it
# paraphrase "left it as it was" into "updated it", which is a lie about
# what happened to the user's data.
TERMINAL_IF_ALONE = SELF_DESCRIBING


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
      - a self-describing tool ran: its return value, which was built from
        what actually happened in the database, so it cannot claim to have
        saved or changed something it did not.
      - plain text, no tool call: the content itself.
    """
    for call in message.tool_calls or []:
        if call["name"] == "reply":
            return str(call["args"].get("text", "")).strip()

    # Tools that speak for themselves. Their return value is written for the
    # user, not for the model, so it is the reply verbatim.
    for call in message.tool_calls or []:
        if call["name"] in SELF_DESCRIBING and call["id"] in tool_results:
            return tool_results[call["id"]]

    if isinstance(message.content, str) and message.content.strip():
        return message.content.strip()

    return "done"
