const { Document } = require('flexsearch');
const idx = new Document({
    document: { id: 'id', index: ['title', 'content'], store: true },
    charset: 'latin:extra', tokenize: 'strict'
});
idx.add({ id: '1', title: 'hello', content: 'hello world' });
const results = idx.search('world', { enrich: true, limit: 20 });
console.log('OUTPUT:', JSON.stringify(results, null, 2));
