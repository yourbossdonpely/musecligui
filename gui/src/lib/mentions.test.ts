import { describe, expect, test } from 'vitest';
import { applyMention, extractMentions, findMentionToken, splitMentionQuery } from './mentions';

describe('mentions', () => {
  test('finds token at start and mid-text', () => {
    expect(findMentionToken('@a', 2)).toEqual({ start: 0, query: 'a' });
    expect(findMentionToken('see @sr', 7)).toEqual({ start: 4, query: 'sr' });
  });
  test('rejects emails and mid-word @', () => {
    expect(findMentionToken('a@b', 3)).toBeNull();
    expect(findMentionToken('x@y z', 3)).toBeNull();
  });
  test('returns null without token or caret inside word', () => {
    expect(findMentionToken('hello', 5)).toBeNull();
    expect(findMentionToken('@ab cd', 2)).toBeNull();
  });
  test('splits dir and file parts', () => {
    expect(splitMentionQuery('a')).toEqual({ dir: '', file: 'a' });
    expect(splitMentionQuery('src/ut')).toEqual({ dir: 'src', file: 'ut' });
  });
  test('applies mention with trailing space', () => {
    expect(applyMention('see @a', 6, 4, 'a.txt')).toEqual({ value: 'see @a.txt ', caret: 11 });
  });
  test('extracts unique rels, trimming punctuation', () => {
    expect(extractMentions('see @a.txt and @b.js, also @a.txt!')).toEqual(['a.txt', 'b.js']);
  });
  test('extracts nothing from plain text', () => {
    expect(extractMentions('no mentions')).toEqual([]);
  });
});
