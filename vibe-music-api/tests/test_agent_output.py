import json

from app.agent.output import SongTagFilter, sanitize_text, sse, text_content


def test_split_tags_only_emit_tool_records_and_never_partial_json():
    approved = {1: {"songId": 1, "songName": "真实歌曲", "audioUrl": "/media/real.mp3"}}
    filter = SongTagFilter()
    assert filter.push("你好 <vibe-", approved) == "你好 "
    assert (
        filter.push('songs>[{"songId":1,"songName":"伪造","audioUrl":"https://fake"},', approved)
        == ""
    )
    text = filter.push('{"songId":999}]</vibe-songs>结束', approved) + filter.finish()
    body = text.split("<vibe-songs>")[1].split("</vibe-songs>")[0]
    assert json.loads(body) == [approved[1]]
    assert text.endswith("结束") and "伪造" not in text and "fake" not in text


def test_song_filter_limits_five_deduplicates_and_ignores_invalid_values():
    approved = {i: {"songId": i} for i in range(1, 9)}
    rows = [{"songId": True}, {"songId": "1"}, *[{"songId": i} for i in range(1, 9)]]
    text = "<vibe-songs>" + json.dumps(rows) + '</vibe-songs><vibe-songs>{"songId":1}</vibe-songs>'
    result = sanitize_text(text, approved)
    assert json.loads(result[len("<vibe-songs>") : -len("</vibe-songs>")]) == [
        {"songId": i} for i in range(1, 6)
    ]
    assert sanitize_text("前<vibe-songs>invalid</vibe-songs>后", approved) == "前后"
    assert sanitize_text('前<vibe-songs>[{"songId":1}', approved) == "前"
    assert sanitize_text("ordinary <vi", approved) == "ordinary <vi"


def test_sse_preserves_unicode_empty_lines_and_content_blocks_hide_reasoning():
    assert sse("text", "你\n\n好\n") == "event: text\ndata: 你\ndata: \ndata: 好\ndata: \n\n"
    assert (
        text_content(
            [{"type": "reasoning", "text": "private reasoning"}, {"type": "text", "text": "answer"}]
        )
        == "answer"
    )


def test_sse_separator_preserves_the_content_leading_space():
    assert sse("text", " Gold") == "event: text\ndata:  Gold\n\n"
