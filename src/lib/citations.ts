import type { CitationFormat, Publication } from '../types/publication';

function formatApaAuthors(authors: string[]): string {
  if (!authors || authors.length === 0) return 'SciELO.';
  const normalized = authors.map((raw) => {
    const clean = raw.trim();
    if (clean.includes(',')) {
      const [last, first] = clean.split(',').map((s) => s.trim());
      const initials = (first || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => `${n[0].toUpperCase()}.`)
        .join(' ');
      return initials ? `${last}, ${initials}` : last;
    }
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const initials = parts
      .slice(0, -1)
      .map((n) => `${n[0].toUpperCase()}.`)
      .join(' ');
    return `${last}, ${initials}`;
  });

  if (normalized.length === 1) return normalized[0];
  if (normalized.length <= 20) {
    return `${normalized.slice(0, -1).join(', ')}, & ${normalized[normalized.length - 1]}`;
  }
  return `${normalized.slice(0, 19).join(', ')}, ... ${normalized[normalized.length - 1]}`;
}

function formatIeeeAuthors(authors: string[]): string {
  if (!authors || authors.length === 0) return 'SciELO';
  const normalized = authors.map((raw) => {
    const clean = raw.trim();
    if (clean.includes(',')) {
      const [last, first] = clean.split(',').map((s) => s.trim());
      const initials = (first || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => `${n[0].toUpperCase()}.`)
        .join(' ');
      return initials ? `${initials} ${last}` : last;
    }
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const initials = parts
      .slice(0, -1)
      .map((n) => `${n[0].toUpperCase()}.`)
      .join(' ');
    return `${initials} ${last}`;
  });

  if (normalized.length === 1) return normalized[0];
  if (normalized.length === 2) return `${normalized[0]} and ${normalized[1]}`;
  return `${normalized.slice(0, -1).join(', ')}, and ${normalized[normalized.length - 1]}`;
}

function toCiteKey(pub: Publication): string {
  const firstAuthor = (pub.authors[0] || 'scielo').split(/[,\s]+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'scielo';
  const year = pub.year ?? 'nd';
  const word = pub.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .find((w) => w.length > 3) ?? 'work';
  return `${firstAuthor}${year}${word}`;
}

export function formatCitation(pub: Publication, format: CitationFormat): string {
  const yearStr = pub.year ? String(pub.year) : 's.f.';
  const cleanDoi = pub.doi
    ? pub.doi.startsWith('http')
      ? pub.doi
      : `https://doi.org/${pub.doi}`
    : null;
  const link = cleanDoi || pub.scieloUrl;

  if (format === 'apa7') {
    const authors = formatApaAuthors(pub.authors);
    if (pub.docType === 'article') {
      return `${authors} (${yearStr}). ${pub.title}. ${pub.publisher}. ${link}`;
    }
    return `${authors} (${yearStr}). *${pub.title}*. ${pub.publisher}. ${link}`;
  }

  if (format === 'ieee') {
    const authors = formatIeeeAuthors(pub.authors);
    if (pub.docType === 'article') {
      return `${authors}, "${pub.title}," ${pub.publisher}, ${yearStr}. [Online]. Available: ${link}`;
    }
    return `${authors}, *${pub.title}*. ${pub.publisher}, ${yearStr}. [Online]. Available: ${link}`;
  }

  // BibTeX
  const entryType = pub.docType === 'article' ? 'article' : pub.docType === 'chapter' ? 'incollection' : 'book';
  const key = toCiteKey(pub);
  const authorsBib = pub.authors.length > 0 ? pub.authors.join(' and ') : pub.publisher;
  const doiNumber = pub.doi ? pub.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : undefined;

  const fields = [
    `  author    = {${authorsBib}}`,
    `  title     = {${pub.title}}`,
    pub.docType === 'article'
      ? `  journal   = {${pub.publisher}}`
      : `  publisher = {${pub.publisher}}`,
    pub.year ? `  year      = {${pub.year}}` : null,
    pub.isbn ? `  isbn      = {${pub.isbn}}` : null,
    doiNumber ? `  doi       = {${doiNumber}}` : null,
    `  url       = {${pub.scieloUrl}}`,
    `  language  = {${pub.language}}`
  ].filter(Boolean);

  return `@${entryType}{${key},\n${fields.join(',\n')}\n}`;
}
