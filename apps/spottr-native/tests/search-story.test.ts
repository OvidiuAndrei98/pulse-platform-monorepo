import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRecentSearches, rememberSearch } from '../src/search/recentSearches';
import { STORY_TITLE_HEIGHT, STORY_TITLE_LEADING, storyTitle, wrapStoryText } from '../src/story/layout';
import { storyImageSource } from '../src/story/imageSource';

test('story export uses the local proxy only for public event images from the configured API', () => {
  const remote = 'https://api.example.test/api/v1', path = '/media/events/00000000-0000-4000-8000-000000000001/abc123.webp';
  assert.equal(storyImageSource(remote + path + '?v=2', '/api/v1', remote), '/api/v1' + path + '?v=2');
  for (const uri of ['https://other.example.test/api/v1' + path, remote + '/users/me', remote + path + '/extra', 'https://user:pass@api.example.test/api/v1' + path, 'bad-url']) {
    assert.equal(storyImageSource(uri, '/api/v1', remote), uri);
  }
  assert.equal(storyImageSource(remote + path, remote, remote), remote + path, 'Static builds keep direct API access');
});
test('Recent searches are bounded, deduplicated and tolerate corrupt storage', () => {
  assert.deepEqual(parseRecentSearches('{'), []);
  assert.deepEqual(parseRecentSearches('[1,"Techno","House","techno"]'), ['Techno','House']);
  assert.deepEqual(rememberSearch(['old',' HOUSE ','b','c','d'], 'old'), ['old',' HOUSE ','b','c','d']);
  assert.equal(rememberSearch(['1','2','3','4','5'], '6').length, 5);
  assert.deepEqual(rememberSearch(['TECHNO','House'], ' techno  '), ['techno','House']);
});
test('Story title keeps text and fits its allotted area for long words and diacritics', () => {
  for (const value of ['After dark','ĂSTA E EVENIMENTUL TĂU', 'W'.repeat(200), 'House and techno night '.repeat(8)]) {
    const result = storyTitle(value);
    assert.ok(result.lines.length * result.size * STORY_TITLE_LEADING <= STORY_TITLE_HEIGHT);
    assert.equal(result.lines.join('').replace(/\s/g,''),value.toUpperCase().replace(/\s/g,''));
  }
  assert.deepEqual(wrapStoryText('a b c',3), ['a b','c']);
});
