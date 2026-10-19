import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePost } from '../src/parse-post.mjs';

test('categoria e tags com entidade HTML saem como texto', () => {
  const r = parsePost({ title: 'T', contentHtml: '<p>x</p>', link: 'https://ex.com/t/', slug: 't',
    categoria: 'Produto &amp; Design', tags: ['IA &amp; UX', 'Dados&#8217;s'] });
  assert.equal(r.categoria, 'Produto & Design');
  assert.deepEqual(r.tags, ['IA & UX', 'Dados’s']);
});
