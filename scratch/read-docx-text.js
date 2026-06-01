const fs = require('fs');
const path = require('path');

const xmlPath = path.join(__dirname, 'docx_unzipped', 'word', 'document.xml');
if (!fs.existsSync(xmlPath)) {
  console.error('word/document.xml not found!');
  process.exit(1);
}

const xml = fs.readFileSync(xmlPath, 'utf8');
// Convert paragraph tags to newlines, strip all XML tags, and clean up HTML entities
const cleanText = xml
  .replace(/<w:p[^>]*>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/[ \t]+/g, ' ')
  .trim();

fs.writeFileSync(path.join(__dirname, 'docx-text.txt'), cleanText, 'utf8');
console.log('Successfully extracted plain text to scratch/docx-text.txt (length:', cleanText.length, 'chars)');
