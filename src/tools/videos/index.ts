import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import params, { type QueryParams } from './QueryParams.js';
import API from '../../BraveAPI/index.js';
import { stringify } from '../../utils.js';

export const name = 'brave_video_search';

export const annotations: ToolAnnotations = {
  title: 'Brave Video Search',
  openWorldHint: true,
};

export const description = `
    Searches for videos using Brave's Video Search API and returns structured video results with metadata.

    When to use:
        - When you need to find videos related to a specific topic, keyword, or query.
        - Useful for discovering video content, getting video metadata, or finding videos from specific creators/publishers.

    Returns a JSON list of video-related results with title, url, description, duration, and thumbnail_url.
`;

export const execute = async (params: QueryParams) => {
  const response = await API.issueRequest<'videos'>('videos', params);

  return {
    content: response.results.map(({ url, title, description, video, thumbnail }) => {
      const duration = video?.duration;
      const thumbnail_url = thumbnail?.src;

      return {
        type: 'text' as const,
        text: stringify({ url, title, description, duration, thumbnail_url }),
      };
    }),
  };
};

export default {
  name,
  description,
  annotations,
  inputSchema: params.shape,
  execute,
};
