import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });
const validateLink = markdown.validateLink;
markdown.validateLink = (url: string) => {
  const value = url.trim().toLowerCase();
  return (
    !/^(javascript:|vbscript:|data:text\/html)/.test(value) && validateLink(url)
  );
};

export function renderAgentMarkdown(content: string): string {
  return markdown.render(content);
}
