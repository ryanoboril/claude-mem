import { afterAll, afterEach, describe, it, expect, mock } from 'bun:test';
import * as realChromaMcpManager from '../../../src/services/sync/ChromaMcpManager.js';

const realChromaMcpManagerSnapshot = { ...realChromaMcpManager };

let queryResponse: any = { ids: [[]], distances: [[]], metadatas: [[]] };
let lastCallArgs: any = null;
let shouldThrow: Error | null = null;

mock.module('../../../src/services/sync/ChromaMcpManager.js', () => ({
  ChromaMcpManager: {
    getInstance: () => ({
      callTool: async (tool: string, args: any) => {
        lastCallArgs = { tool, args };
        if (shouldThrow) {
          throw shouldThrow;
        }
        if (tool === 'chroma_create_collection') {
          return {};
        }
        return queryResponse;
      },
    }),
  },
}));

import { ChromaSync } from '../../../src/services/sync/ChromaSync.js';

afterAll(() => {
  mock.module('../../../src/services/sync/ChromaMcpManager.js', () => realChromaMcpManagerSnapshot);
});

afterEach(() => {
  queryResponse = { ids: [[]], distances: [[]], metadatas: [[]] };
  lastCallArgs = null;
  shouldThrow = null;
});

describe('ChromaSync.findNearDuplicateObservation (ryano-mem dedup gate)', () => {
  it('returns the nearest existing observation when its distance is within the threshold', async () => {
    queryResponse = {
      ids: [['obs_42_narrative']],
      distances: [[0.05]],
      metadatas: [[{ sqlite_id: 42, doc_type: 'observation', project: 'proj' }]],
    };

    const sync = new ChromaSync('proj');
    const result = await sync.findNearDuplicateObservation('Oban worker concurrency is set in config.ex', 'proj', 0.15);

    expect(result).toEqual({ sqliteId: 42, distance: 0.05 });
  });

  it('returns null when the nearest match is farther than the threshold', async () => {
    queryResponse = {
      ids: [['obs_42_narrative']],
      distances: [[0.9]],
      metadatas: [[{ sqlite_id: 42, doc_type: 'observation', project: 'proj' }]],
    };

    const sync = new ChromaSync('proj');
    const result = await sync.findNearDuplicateObservation('Something unrelated entirely', 'proj', 0.15);

    expect(result).toBeNull();
  });

  it('returns null when there is no existing history to compare against', async () => {
    const sync = new ChromaSync('proj');
    const result = await sync.findNearDuplicateObservation('First observation ever', 'proj', 0.15);

    expect(result).toBeNull();
  });

  it('returns null for blank candidate text without querying Chroma', async () => {
    const sync = new ChromaSync('proj');
    const result = await sync.findNearDuplicateObservation('   ', 'proj', 0.15);

    expect(result).toBeNull();
    expect(lastCallArgs).toBeNull();
  });

  it('fails open (returns null, does not throw) when the Chroma query errors', async () => {
    shouldThrow = new Error('chroma-mcp unreachable');

    const sync = new ChromaSync('proj');
    const result = await sync.findNearDuplicateObservation('Anything', 'proj', 0.15);

    expect(result).toBeNull();
  });

  it('scopes the query to the observation doc_type and this project (or its merge target)', async () => {
    const sync = new ChromaSync('proj');
    await sync.findNearDuplicateObservation('Anything', 'proj', 0.15);

    expect(lastCallArgs.tool).toBe('chroma_query_documents');
    expect(lastCallArgs.args.where).toEqual({
      $and: [
        { doc_type: 'observation' },
        { $or: [{ project: 'proj' }, { merged_into_project: 'proj' }] },
      ],
    });
  });
});
