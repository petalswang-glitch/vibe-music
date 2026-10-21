import json


class SongTagFilter:
    """Stream normal text; replace complete song tags with actual tool-returned records."""

    opening = "<vibe-songs>"
    closing = "</vibe-songs>"

    def __init__(self):
        self.buffer = ""
        self.inside = False
        self.selected = set()

    def push(self, text: str, approved: dict[int, dict]) -> str:
        self.buffer += text
        output = []
        while self.buffer:
            marker = self.closing if self.inside else self.opening
            index = self.buffer.find(marker)
            if index >= 0:
                value, self.buffer = self.buffer[:index], self.buffer[index + len(marker) :]
                if self.inside:
                    try:
                        rows = json.loads(value)
                        rows = rows if isinstance(rows, list) else [rows]
                        songs = []
                        for row in rows:
                            identity = row.get("songId") if isinstance(row, dict) else None
                            if (
                                type(identity) is int
                                and identity in approved
                                and identity not in self.selected
                                and len(self.selected) < 5
                            ):
                                songs.append(approved[identity])
                                self.selected.add(identity)
                        if songs:
                            output.append(
                                self.opening + json.dumps(songs, ensure_ascii=False) + self.closing
                            )
                    except (ValueError, TypeError):
                        pass
                else:
                    output.append(value)
                self.inside = not self.inside
                continue
            if not self.inside:
                keep = max(
                    (n for n in range(1, len(marker)) if self.buffer.endswith(marker[:n])),
                    default=0,
                )
                output.append(self.buffer[:-keep] if keep else self.buffer)
                self.buffer = self.buffer[-keep:] if keep else ""
            break
        return "".join(output)

    def finish(self) -> str:
        value = "" if self.inside else self.buffer
        self.buffer = ""
        return value


def text_content(content) -> str:
    if isinstance(content, str):
        return content
    return "".join(
        part.get("text", "")
        for part in content
        if isinstance(part, dict)
        and part.get("type") == "text"
        and isinstance(part.get("text"), str)
    )


def sanitize_text(text: str, approved) -> str:
    filter = SongTagFilter()
    return filter.push(text, approved) + filter.finish()


def sse(event: str, data: str) -> str:
    return f"event: {event}\n" + "".join(f"data: {line}\n" for line in data.split("\n")) + "\n"
