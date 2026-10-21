import json
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from app.agent.prompt import DEFAULT_PROMPT
from app.services import agent_catalogue


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    songs: dict[int, dict]


def catalogue_tools(session_factory):
    @tool(
        "searchSongs",
        description="按关键词搜索歌曲，关键词可以是歌名、歌手名或专辑名，返回最多10首真实曲库歌曲。",
    )
    async def search(keyword: str):
        async with session_factory() as session:
            return await agent_catalogue.search_songs(session, keyword)

    @tool(
        "recommendSongsByStyle",
        description="根据音乐风格推荐歌曲，如摇滚、流行、古典、电子，返回最多10首真实曲库歌曲。",
    )
    async def recommend(style: str):
        async with session_factory() as session:
            return await agent_catalogue.recommend_songs_by_style(session, style)

    @tool("getHotSongs", description="获取平台的推荐歌曲，返回20首随机曲库歌曲。")
    async def hot():
        async with session_factory() as session:
            return await agent_catalogue.get_hot_songs(session)

    @tool("listStyles", description="获取平台支持的音乐风格名称列表。")
    async def styles():
        async with session_factory() as session:
            return await agent_catalogue.list_styles(session)

    return [search, recommend, hot, styles]


def songs_from_messages(messages):
    approved = {}
    for message in messages:
        if message.type != "tool" or message.name not in (
            "searchSongs",
            "recommendSongsByStyle",
            "getHotSongs",
        ):
            continue
        try:
            rows = json.loads(message.content)
            if isinstance(rows, list):
                approved.update(
                    {
                        row["songId"]: row
                        for row in rows
                        if isinstance(row, dict) and type(row.get("songId")) is int
                    }
                )
        except (ValueError, TypeError):
            continue
    return approved


def build_graph(model, session_factory):
    tools = catalogue_tools(session_factory)
    bound = model.bind_tools(tools)
    tool_node = ToolNode(tools, handle_tool_errors="曲库查询失败，请稍后重试，不要编造查询结果。")

    async def call_model(state: AgentState, config):
        response = await bound.ainvoke([SystemMessage(DEFAULT_PROMPT), *state["messages"]], config)
        return {"messages": [response]}

    async def call_tools(state: AgentState, config):
        output = await tool_node.ainvoke(state, config)
        return {
            "messages": output["messages"],
            "songs": {**state["songs"], **songs_from_messages(output["messages"])},
        }

    def route(state: AgentState):
        last = state["messages"][-1]
        return "tools" if isinstance(last, AIMessage) and last.tool_calls else END

    graph = StateGraph(AgentState)
    graph.add_node("model", call_model)
    graph.add_node("tools", call_tools)
    graph.add_edge(START, "model")
    graph.add_conditional_edges("model", route, {"tools": "tools", END: END})
    graph.add_edge("tools", "model")
    return graph.compile()
