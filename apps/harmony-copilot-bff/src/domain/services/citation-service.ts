import { injectable } from 'tsyringe';

export interface CitationInput {
  contentId: string;
  url: string;
  title: string;
  contentType: 'page' | 'document' | 'lesson' | 'assessment' | 'media' | 'product_doc';
  source: 'PRODUCT_DOCS' | 'TENANT_CONTENT' | 'WEB_SEARCH' | 'KNOWLEDGE_BASE';
  author?: string;
  publishedDate?: Date;
  lastModified?: Date;
  accessedDate?: Date;
  metadata?: CitationMetadata;
}

export interface CitationMetadata {
  tenantId?: string;
  spaceKey?: string;
  courseId?: string;
  lessonId?: string;
  version?: string;
  language?: string;
  permissions?: string[];
  tags?: string[];
  wordCount?: number;
}

export interface Citation {
  id: string;
  url: string;
  title: string;
  source: string;
  contentType: string;
  author?: string;
  publishedDate?: Date;
  lastModified?: Date;
  accessedDate: Date;
  formattedCitation: string;
  shortCitation: string;
  inlineCitation: string;
  metadata: CitationMetadata;
}

export interface CitationStyle {
  name: 'APA' | 'MLA' | 'Chicago' | 'Harvard' | 'IEEE' | 'LMS_Standard';
  urlFormat: 'full' | 'shortened' | 'doi';
  dateFormat: 'full' | 'abbreviated' | 'iso';
  includeAccessDate: boolean;
}

@injectable()
export class CitationService {
  private readonly defaultStyle: CitationStyle = {
    name: 'LMS_Standard',
    urlFormat: 'full',
    dateFormat: 'full',
    includeAccessDate: true
  };

  async generateCitation(input: CitationInput, style?: CitationStyle): Promise<Citation> {
    const citationStyle = style || this.defaultStyle;
    const accessedDate = input.accessedDate || new Date();

    const citation: Citation = {
      id: this.generateCitationId(input),
      url: input.url,
      title: input.title,
      source: input.source,
      contentType: input.contentType,
      author: input.author,
      publishedDate: input.publishedDate,
      lastModified: input.lastModified,
      accessedDate,
      formattedCitation: '',
      shortCitation: '',
      inlineCitation: '',
      metadata: input.metadata || {}
    };

    citation.formattedCitation = this.formatCitation(citation, citationStyle);
    citation.shortCitation = this.formatShortCitation(citation);
    citation.inlineCitation = this.formatInlineCitation(citation);

    return citation;
  }

  async generateBatchCitations(inputs: CitationInput[], style?: CitationStyle): Promise<Citation[]> {
    const citations: Citation[] = [];

    for (const input of inputs) {
      try {
        const citation = await this.generateCitation(input, style);
        citations.push(citation);
      } catch (error) {
        console.error('Error generating citation:', error);
      }
    }

    return this.sortCitations(citations);
  }

  formatCitationList(citations: Citation[], style?: CitationStyle): string {
    const sortedCitations = this.sortCitations(citations);

    return sortedCitations
      .map((citation, index) => `${index + 1}. ${citation.formattedCitation}`)
      .join('\n');
  }

  private formatCitation(citation: Citation, style: CitationStyle): string {
    switch (style.name) {
      case 'APA':
        return this.formatAPACitation(citation, style);
      case 'MLA':
        return this.formatMLACitation(citation, style);
      case 'Chicago':
        return this.formatChicagoCitation(citation, style);
      case 'LMS_Standard':
        return this.formatLMSStandardCitation(citation, style);
      default:
        return this.formatLMSStandardCitation(citation, style);
    }
  }

  private formatLMSStandardCitation(citation: Citation, style: CitationStyle): string {
    const parts: string[] = [];

    if (citation.author) {
      parts.push(`${citation.author}.`);
    }

    parts.push(`"${citation.title}"`);

    if (citation.source === 'TENANT_CONTENT' && citation.metadata.courseId) {
      parts.push(`Course Materials`);
    } else if (citation.source === 'PRODUCT_DOCS') {
      parts.push(`LMS Documentation`);
    } else {
      parts.push(this.capitalizeSource(citation.source));
    }

    if (citation.publishedDate) {
      parts.push(this.formatDate(citation.publishedDate, style.dateFormat));
    }

    parts.push(this.formatUrl(citation.url, style.urlFormat));

    if (style.includeAccessDate) {
      parts.push(`(accessed ${this.formatDate(citation.accessedDate, 'abbreviated')})`);
    }

    return parts.join(', ') + '.';
  }

  private formatAPACitation(citation: Citation, style: CitationStyle): string {
    const parts: string[] = [];

    if (citation.author) {
      parts.push(`${citation.author}`);
    } else {
      parts.push('[Author unknown]');
    }

    const year = citation.publishedDate ? `(${citation.publishedDate.getFullYear()})` : '(n.d.)';
    parts.push(year);

    parts.push(`${citation.title}.`);

    if (citation.source === 'PRODUCT_DOCS') {
      parts.push('LMS Documentation.');
    }

    parts.push(`Retrieved from ${citation.url}`);

    return parts.join(' ');
  }

  private formatMLACitation(citation: Citation, style: CitationStyle): string {
    const parts: string[] = [];

    if (citation.author) {
      parts.push(`${citation.author}.`);
    }

    parts.push(`"${citation.title}"`);

    if (citation.source === 'PRODUCT_DOCS') {
      parts.push('LMS Documentation,');
    } else {
      parts.push('Web,');
    }

    if (citation.publishedDate) {
      parts.push(`${this.formatDate(citation.publishedDate, 'abbreviated')}.`);
    }

    parts.push(`${citation.url}.`);

    if (style.includeAccessDate) {
      parts.push(`Accessed ${this.formatDate(citation.accessedDate, 'abbreviated')}.`);
    }

    return parts.join(' ');
  }

  private formatChicagoCitation(citation: Citation, style: CitationStyle): string {
    const parts: string[] = [];

    if (citation.author) {
      parts.push(`${citation.author}.`);
    }

    parts.push(`"${citation.title}"`);

    if (citation.source === 'PRODUCT_DOCS') {
      parts.push('LMS Documentation.');
    }

    if (citation.publishedDate) {
      parts.push(`${this.formatDate(citation.publishedDate, 'full')}.`);
    }

    parts.push(`${citation.url}`);

    if (style.includeAccessDate) {
      parts.push(`(accessed ${this.formatDate(citation.accessedDate, 'full')})`);
    }

    return parts.join(' ') + '.';
  }

  private formatShortCitation(citation: Citation): string {
    const author = citation.author || 'Unknown';
    const year = citation.publishedDate ? citation.publishedDate.getFullYear() : 'n.d.';
    return `${author}, ${year}`;
  }

  private formatInlineCitation(citation: Citation): string {
    const author = citation.author || 'Unknown Author';
    const year = citation.publishedDate ? citation.publishedDate.getFullYear() : 'n.d.';
    return `(${author}, ${year})`;
  }

  private formatDate(date: Date, format: 'full' | 'abbreviated' | 'iso'): string {
    switch (format) {
      case 'full':
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      case 'abbreviated':
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      case 'iso':
        return date.toISOString().split('T')[0];
      default:
        return date.toLocaleDateString();
    }
  }

  private formatUrl(url: string, format: 'full' | 'shortened' | 'doi'): string {
    switch (format) {
      case 'full':
        return url;
      case 'shortened':
        try {
          const urlObj = new URL(url);
          return `${urlObj.hostname}${urlObj.pathname}`;
        } catch {
          return url;
        }
      case 'doi':
        if (url.includes('doi.org')) {
          return url.replace('https://doi.org/', 'doi:');
        }
        return url;
      default:
        return url;
    }
  }

  private capitalizeSource(source: string): string {
    return source.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }

  private sortCitations(citations: Citation[]): Citation[] {
    return citations.sort((a, b) => {
      const authorA = a.author || 'Unknown';
      const authorB = b.author || 'Unknown';

      if (authorA !== authorB) {
        return authorA.localeCompare(authorB);
      }

      const yearA = a.publishedDate?.getFullYear() || 0;
      const yearB = b.publishedDate?.getFullYear() || 0;

      return yearB - yearA;
    });
  }

  private generateCitationId(input: CitationInput): string {
    const hash = `${input.contentId}-${input.url}-${input.title}`;
    return `cite-${Date.now()}-${hash.length}`;
  }

  validateCitation(citation: Citation): boolean {
    if (!citation.title || !citation.url || !citation.source) {
      return false;
    }

    try {
      new URL(citation.url);
      return true;
    } catch {
      return false;
    }
  }

  extractCitationsFromText(text: string): string[] {
    const citationPatterns = [
      /\(([^,]+),\s*(\d{4})\)/g, // (Author, Year)
      /\[(\d+)\]/g, // [1]
      /https?:\/\/[^\s\)]+/g // URLs
    ];

    const citations: string[] = [];

    citationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        citations.push(...matches);
      }
    });

    return [...new Set(citations)];
  }
}